import { Injectable } from '@angular/core';
import { AudioFilterConfig } from './audio-model';
import {
  BANDS, CLIENT_SR, MAX_SECONDS, NUM_TAPS,
  applyDistortion, applyEcho, applyEq4Freq, buildFilters, fft, nextPow2, normalize, waveformPeaks,
} from './dsp';

// ---------------------------------------------------------------------------
// Stateful wrapper around the pure DSP port in ./dsp.ts.
//
// Decodes the round's source WAV once, precomputes the FFTs that stay constant
// across slider edits (source spectrum + each EQ band kernel), and renders the
// 1024 display peaks of the player chain on demand — all in-browser, so a
// slider drag costs no network. DISPLAY ONLY: the score and the played audio
// remain server-authoritative (server/app/dsp.py is untouched).
// ---------------------------------------------------------------------------

function filterValues(filters: AudioFilterConfig[]): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const f of filters) {
    const m: Record<string, number> = {};
    for (const p of f.params) m[p.key] = Number(p.value);
    result[f.type] = m;
  }
  return result;
}

@Injectable({ providedIn: 'root' })
export class ClientDspService {
  private source?: Float64Array;
  private sr = 0;
  private fftSize = 0;
  private sigRe?: Float64Array; // FFT of the zero-padded source, reused per render
  private sigIm?: Float64Array;
  private bandRe: Record<string, Float64Array> = {}; // FFT of each padded FIR band
  private bandIm: Record<string, Float64Array> = {};

  get ready(): boolean { return !!this.source && !!this.sigRe; }
  get sampleRate(): number { return this.sr; }
  get durationSec(): number { return this.source ? this.source.length / this.sr : 0; }

  /**
   * Decode the source WAV once per round and precompute the constant FFTs.
   * Throws if Web Audio is unavailable or the fetch/decode fails — the caller
   * falls back to the server render in that case.
   */
  async loadSource(url: string): Promise<void> {
    this.reset();
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio API unavailable');
    const ctx = new Ctx({ sampleRate: CLIENT_SR });
    try {
      const bytes = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`source fetch ${r.status}`);
        return r.arrayBuffer();
      });
      const decoded = await ctx.decodeAudioData(bytes);
      const sr = decoded.sampleRate; // browser resamples to ctx rate (may clamp)
      const len = Math.min(decoded.length, sr * MAX_SECONDS);
      const mix = new Float64Array(len);
      const channels = decoded.numberOfChannels;
      for (let c = 0; c < channels; c++) {
        const data = decoded.getChannelData(c);
        for (let i = 0; i < len; i++) mix[i] += data[i];
      }
      if (channels > 1) for (let i = 0; i < len; i++) mix[i] /= channels;

      this.sr = sr;
      this.source = normalize(mix); // server source is normalised too (load_wav)
      this.precompute();
    } finally {
      void ctx.close();
    }
  }

  /** Run the chain in-browser and return 1024 display peaks (matches _wave on the server). */
  renderPeaks(filters: AudioFilterConfig[]): number[] {
    if (!this.source || !this.sigRe || !this.sigIm) return [];
    const values = filterValues(filters);
    let out = this.source;
    if (values['eq4']) {
      out = applyEq4Freq(this.source.length, this.fftSize, this.sigRe, this.sigIm, this.bandRe, this.bandIm, values['eq4']);
    }
    if (values['echo']) {
      const e = values['echo'];
      out = applyEcho(out, this.sr, e['delayMs'] ?? 220, e['feedback'] ?? 0.25, e['mix'] ?? 0.25);
    }
    if (values['distortion']) {
      const d = values['distortion'];
      out = applyDistortion(out, d['drive'] ?? 0.25, d['outputGain'] ?? 0.75);
    }
    out = normalize(out); // render_chain's final normalize
    return waveformPeaks(out, 1024);
  }

  private reset(): void {
    this.source = undefined;
    this.sigRe = undefined;
    this.sigIm = undefined;
    this.bandRe = {};
    this.bandIm = {};
    this.fftSize = 0;
  }

  private precompute(): void {
    const n = this.source!.length;
    const fftSize = nextPow2(n + NUM_TAPS - 1);
    this.fftSize = fftSize;

    const sre = new Float64Array(fftSize);
    sre.set(this.source!);
    const sim = new Float64Array(fftSize);
    fft(sre, sim, false);
    this.sigRe = sre;
    this.sigIm = sim;

    const filters = buildFilters(this.sr);
    for (const band of BANDS) {
      const hre = new Float64Array(fftSize);
      hre.set(filters[band]);
      const him = new Float64Array(fftSize);
      fft(hre, him, false);
      this.bandRe[band] = hre;
      this.bandIm[band] = him;
    }
  }
}

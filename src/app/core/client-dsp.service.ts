import { Injectable } from '@angular/core';
import { AudioFilterConfig } from './audio-model';
import { CLIENT_SR, MAX_SECONDS } from './dsp';

// ---------------------------------------------------------------------------
// Worker-backed client DSP. Decoding needs an AudioContext (main thread), but
// the expensive precompute (~210 ms) and every per-edit render (~80 ms) run in
// a Web Worker, so slider drags never block the UI. DISPLAY ONLY: the score and
// the played audio stay server-authoritative (server/app/dsp.py is untouched).
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
  private worker?: Worker;
  private loaded = false;
  private sr = 0;
  private durationSecVal = 0;
  private renderSeq = 0;
  private pending = new Map<number, (peaks: number[]) => void>();

  get ready(): boolean { return this.loaded; }
  get sampleRate(): number { return this.sr; }
  get durationSec(): number { return this.durationSecVal; }

  /**
   * Decode the source WAV once per round (main thread), then hand the samples to
   * the worker for normalisation + FFT precompute. Throws if Web Audio or
   * workers are unavailable / the fetch fails — the caller then falls back to the
   * server render.
   */
  async loadSource(url: string): Promise<void> {
    this.dispose();
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx || typeof Worker === 'undefined') throw new Error('Web Audio / Worker unavailable');
    const ctx = new Ctx({ sampleRate: CLIENT_SR });
    try {
      const bytes = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`source fetch ${r.status}`);
        return r.arrayBuffer();
      });
      const decoded = await ctx.decodeAudioData(bytes);
      const sr = decoded.sampleRate; // browser resamples to ctx rate (may clamp)
      const len = Math.min(decoded.length, sr * MAX_SECONDS);
      const mix = new Float32Array(len);
      const channels = decoded.numberOfChannels;
      for (let c = 0; c < channels; c++) {
        const data = decoded.getChannelData(c);
        for (let i = 0; i < len; i++) mix[i] += data[i];
      }
      if (channels > 1) for (let i = 0; i < len; i++) mix[i] /= channels;

      this.sr = sr;
      this.durationSecVal = len / sr;
      this.worker = new Worker(new URL('./client-dsp.worker', import.meta.url));
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'loaded') {
          this.loaded = true;
        } else if (data.type === 'peaks') {
          const cb = this.pending.get(data.seq);
          if (cb) { this.pending.delete(data.seq); cb(data.samples); }
        }
      };
      // Transfer the sample buffer (zero-copy) to the worker for precompute.
      this.worker.postMessage({ type: 'load', samples: mix, sr }, [mix.buffer]);
    } finally {
      void ctx.close();
    }
  }

  /** Render the chain in the worker and resolve with 1024 display peaks. */
  renderPeaks(filters: AudioFilterConfig[]): Promise<number[]> {
    if (!this.worker || !this.loaded) return Promise.resolve([]);
    const seq = ++this.renderSeq;
    const values = filterValues(filters);
    return new Promise((resolve) => {
      this.pending.set(seq, resolve);
      this.worker!.postMessage({ type: 'render', seq, values });
    });
  }

  private dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.loaded = false;
    this.pending.clear();
    this.renderSeq = 0;
  }
}

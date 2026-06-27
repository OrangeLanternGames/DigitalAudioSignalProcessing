/// <reference lib="webworker" />
import {
  BANDS, NUM_TAPS,
  applyChorus, applyDistortion, applyEcho, applyEq4Freq, buildFilters, fft, nextPow2, normalize, waveformPeaks,
} from './dsp';

// Runs the client DSP off the main thread so slider drags never block the UI.
// Holds the source spectrum + EQ band kernels (computed once per round) and
// renders 1024 display peaks on demand. See ./dsp.ts for the math.

let source: Float64Array | undefined;
let sr = 0;
let fftSize = 0;
let sigRe: Float64Array | undefined;
let sigIm: Float64Array | undefined;
const bandRe: Record<string, Float64Array> = {};
const bandIm: Record<string, Float64Array> = {};

function precompute(): void {
  const n = source!.length;
  fftSize = nextPow2(n + NUM_TAPS - 1);
  const sre = new Float64Array(fftSize);
  sre.set(source!);
  const sim = new Float64Array(fftSize);
  fft(sre, sim, false);
  sigRe = sre;
  sigIm = sim;
  const filters = buildFilters(sr);
  for (const band of BANDS) {
    const hre = new Float64Array(fftSize);
    hre.set(filters[band]);
    const him = new Float64Array(fftSize);
    fft(hre, him, false);
    bandRe[band] = hre;
    bandIm[band] = him;
  }
}

function render(values: Record<string, Record<string, number>>): number[] {
  if (!source || !sigRe || !sigIm) return [];
  let out = source;
  if (values['eq4']) {
    out = applyEq4Freq(source.length, fftSize, sigRe, sigIm, bandRe, bandIm, values['eq4']);
  }
  if (values['chorus']) {
    const c = values['chorus'];
    out = applyChorus(out, sr, c['rateHz'] ?? 0.8, c['depthMs'] ?? 7.0, c['mix'] ?? 0.4);
  }
  if (values['echo']) {
    const e = values['echo'];
    out = applyEcho(out, sr, e['delayMs'] ?? 220, e['feedback'] ?? 0.25, e['mix'] ?? 0.25);
  }
  if (values['distortion']) {
    const d = values['distortion'];
    out = applyDistortion(out, d['drive'] ?? 0.25, d['outputGain'] ?? 0.75);
  }
  out = normalize(out);
  return waveformPeaks(out, 1024);
}

addEventListener('message', ({ data }) => {
  if (data.type === 'load') {
    // data.samples is a transferred Float32Array buffer (mono, un-normalised).
    const raw = new Float32Array(data.samples);
    const f64 = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) f64[i] = raw[i];
    source = normalize(f64); // server source is normalised too (load_wav)
    sr = data.sr;
    precompute();
    postMessage({ type: 'loaded' });
  } else if (data.type === 'render') {
    postMessage({ type: 'peaks', seq: data.seq, samples: render(data.values) });
  }
});

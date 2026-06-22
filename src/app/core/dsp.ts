// ---------------------------------------------------------------------------
// Pure client-side port of the backend DSP chain (server/app/dsp.py).
//
// DISPLAY ONLY: this drives the live preview graph while sliders move. The
// authoritative audio and the score still come from the Python backend, which
// is the grading basis and is never touched here. The functions below mirror
// dsp.py as faithfully as practical (same FIR design, same chain order, same
// per-stage normalize). Verified numerically against scipy — see
// server/tests / scratch verification.
//
// No Angular dependency on purpose, so it can be unit-tested in plain Node.
// ---------------------------------------------------------------------------

export const NUM_TAPS = 255;
export const MAX_SECONDS = 60;
// Match the backend rate (dsp.TARGET_SR) so the in-browser render is numerically
// identical to the server (verified: ~1e-5 peak deviation). A lower rate makes
// the FFT cheaper but introduces a visible rate-mismatch deviation (~6-13% RMS
// at 16 kHz) AND a jump when the graph switches from the live client render to
// the server PREVIEW. Cost at 44.1 kHz for the ~19 s demo: ~210 ms one-off
// precompute per round, ~83 ms per debounced render — well within the 150 ms
// debounce. For very long clips (towards MAX_SECONDS) this grows ~linearly;
// drop to 22050 (factor-2 resample, still cheap, ~half the deviation of 16 k)
// if memory/latency on a 60 s upload ever becomes an issue.
export const CLIENT_SR = 44100;
export const BANDS = ['bass', 'lowMid', 'highMid', 'treble'] as const;

// --- FIR design (port of dsp.py _lp_fir / _hp_fir / _bp_fir / build_filters) -

export function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

export function blackman(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  const m = n - 1;
  for (let i = 0; i < n; i++) {
    w[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / m) + 0.08 * Math.cos((4 * Math.PI * i) / m);
  }
  return w;
}

export function lpFir(cutoffNorm: number, numTaps = NUM_TAPS): Float64Array {
  const m = numTaps - 1;
  const win = blackman(numTaps);
  const h = new Float64Array(numTaps);
  let sum = 0;
  for (let i = 0; i < numTaps; i++) {
    h[i] = 2.0 * cutoffNorm * sinc(2.0 * cutoffNorm * (i - m / 2.0)) * win[i];
    sum += h[i];
  }
  for (let i = 0; i < numTaps; i++) h[i] /= sum;
  return h;
}

export function hpFir(cutoffNorm: number, numTaps = NUM_TAPS): Float64Array {
  const lp = lpFir(cutoffNorm, numTaps);
  const h = new Float64Array(numTaps);
  for (let i = 0; i < numTaps; i++) h[i] = -lp[i];
  h[Math.floor(numTaps / 2)] += 1.0;
  return h;
}

export function bpFir(lowNorm: number, highNorm: number, numTaps = NUM_TAPS): Float64Array {
  const hi = lpFir(highNorm, numTaps);
  const lo = lpFir(lowNorm, numTaps);
  const h = new Float64Array(numTaps);
  for (let i = 0; i < numTaps; i++) h[i] = hi[i] - lo[i];
  return h;
}

export function buildFilters(sr: number): Record<string, Float64Array> {
  return {
    bass: lpFir(300 / sr),
    lowMid: bpFir(300 / sr, 1000 / sr),
    highMid: bpFir(1000 / sr, 4000 / sr),
    treble: hpFir(4000 / sr),
  };
}

// --- normalize (port of dsp.py normalize) ----------------------------------

export function normalize(signal: Float64Array, peak = 0.92): Float64Array {
  let m = 0;
  for (let i = 0; i < signal.length; i++) {
    const a = Math.abs(signal[i]);
    if (a > m) m = a;
  }
  const scale = m > peak ? peak / m : 1;
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    let v = signal[i] * scale;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    out[i] = v;
  }
  return out;
}

// --- iterative radix-2 FFT (in-place, complex) ------------------------------

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curR = 1, curI = 0;
      for (let k = 0; k < half; k++) {
        const aR = re[i + k], aI = im[i + k];
        const bR = re[i + k + half], bI = im[i + k + half];
        const tR = bR * curR - bI * curI;
        const tI = bR * curI + bI * curR;
        re[i + k] = aR + tR; im[i + k] = aI + tI;
        re[i + k + half] = aR - tR; im[i + k + half] = aI - tI;
        const ncurR = curR * wr - curI * wi;
        curI = curR * wi + curI * wr;
        curR = ncurR;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

// --- echo / distortion (port of dsp.py apply_echo / apply_distortion) -------

export function applyEcho(signal: Float64Array, sr: number, delayMs: number, feedback: number, mix: number): Float64Array {
  const delay = Math.max(1, Math.trunc((sr * delayMs) / 1000));
  const fb = Math.min(0.85, Math.max(0, feedback));
  const wetMix = Math.min(0.8, Math.max(0, mix));
  const wet = new Float64Array(signal.length);
  // y[n] = x[n] + fb*y[n-delay]  (scipy.lfilter with a=[1,0,...,-fb]).
  for (let n = 0; n < signal.length; n++) {
    wet[n] = signal[n] + (n >= delay ? fb * wet[n - delay] : 0);
  }
  const mixed = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    mixed[i] = signal[i] * (1 - wetMix) + wet[i] * wetMix;
  }
  return normalize(mixed);
}

export function applyDistortion(signal: Float64Array, drive: number, outputGain: number): Float64Array {
  const amount = 1.0 + Math.min(1, Math.max(0, drive)) * 18.0;
  const tanhAmount = Math.tanh(amount);
  const g = Math.min(1.2, Math.max(0.35, outputGain));
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    out[i] = (Math.tanh(signal[i] * amount) / tanhAmount) * g;
  }
  return normalize(out);
}

// --- EQ4 via FFT linear convolution (== scipy.fftconvolve(mode="same")) -----

/**
 * EQ4 = sum_b gain_b * conv(signal, h_b), then normalize. Convolution is
 * linear, so the band kernels are summed (gain-weighted) in the frequency
 * domain and a single inverse FFT is taken. sigRe/sigIm and bandRe/bandIm are
 * the precomputed forward FFTs (size fftSize >= N + NUM_TAPS - 1).
 */
export function applyEq4Freq(
  n: number,
  fftSize: number,
  sigRe: Float64Array,
  sigIm: Float64Array,
  bandRe: Record<string, Float64Array>,
  bandIm: Record<string, Float64Array>,
  gainsDb: Record<string, number>,
): Float64Array {
  const L = fftSize;
  const hRe = new Float64Array(L);
  const hIm = new Float64Array(L);
  for (const band of BANDS) {
    const gain = Math.pow(10, (gainsDb[band] ?? 0) / 20);
    const bRe = bandRe[band], bIm = bandIm[band];
    for (let k = 0; k < L; k++) {
      hRe[k] += bRe[k] * gain;
      hIm[k] += bIm[k] * gain;
    }
  }
  const yRe = new Float64Array(L);
  const yIm = new Float64Array(L);
  for (let k = 0; k < L; k++) {
    yRe[k] = sigRe[k] * hRe[k] - sigIm[k] * hIm[k];
    yIm[k] = sigRe[k] * hIm[k] + sigIm[k] * hRe[k];
  }
  fft(yRe, yIm, true);
  // "same" centering: drop the first floor((NUM_TAPS-1)/2) samples, keep N.
  const start = Math.floor((NUM_TAPS - 1) / 2);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = yRe[i + start];
  return normalize(out);
}

// --- waveform peaks (port of dsp.py waveform_peaks) -------------------------

export function waveformPeaks(signal: Float64Array, buckets = 1024): number[] {
  if (signal.length === 0) return [];
  buckets = Math.max(32, Math.min(buckets, 4096));
  const stride = Math.ceil(signal.length / buckets);
  const peaks: number[] = new Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const start = b * stride;
    const end = Math.min(signal.length, start + stride);
    let mn = 0, mx = 0; // padded (out-of-range) samples are zero, like np.pad(constant)
    let seen = end > start ? false : true;
    for (let i = start; i < end; i++) {
      const v = signal[i];
      if (!seen) { mn = v; mx = v; seen = true; }
      else { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (seen && end < start + stride) { if (mn > 0) mn = 0; if (mx < 0) mx = 0; }
    const v = Math.abs(mn) > Math.abs(mx) ? mn : mx;
    peaks[b] = Math.round(v * 1e5) / 1e5;
  }
  return peaks;
}

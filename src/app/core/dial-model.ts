export interface ParamDesc {
  key: string;
  label: string;
  code: string;
  min: number;
  max: number;
  disp: (v: number) => string;
}

export type ParamKey = 'freq' | 'amp' | 'phase' | 'harm' | 'drive';
export type Params = Record<string, number>;
export type Difficulty = 'easy' | 'medium' | 'hard';

export const PARAMS: Record<string, ParamDesc> = {
  freq:  { key: 'freq',  label: 'FREQUENCY', code: 'FRQ', min: 0.6, max: 5.0,         disp: (v) => (v * 44.1).toFixed(0) + 'hz' },
  amp:   { key: 'amp',   label: 'AMPLITUDE', code: 'AMP', min: 0.2, max: 1.0,         disp: (v) => (v * 100).toFixed(0) + '%' },
  phase: { key: 'phase', label: 'PHASE',     code: 'PHS', min: 0,   max: Math.PI * 2, disp: (v) => (v * 57.3).toFixed(0) + '°' },
  harm:  { key: 'harm',  label: 'HARMONIC',  code: 'HRM', min: 0,   max: 1.0,         disp: (v) => (v * 100).toFixed(0) + '%' },
  drive: { key: 'drive', label: 'DRIVE',     code: 'DRV', min: 0,   max: 1.0,         disp: (v) => (v * 100).toFixed(0) + '%' },
};

export const DIFF_KEYS: Record<Difficulty, ParamKey[]> = {
  easy:   ['freq'],
  medium: ['freq', 'amp', 'phase'],
  hard:   ['freq', 'amp', 'phase', 'harm', 'drive'],
};

export interface DiffMeta { name: string; sliders: number; label: string; desc: string; }
export const DIFF_META: Record<Difficulty, DiffMeta> = {
  easy:   { name: 'EASY',   sliders: 1, label: '01 SIGNAL DRIFT', desc: 'ONE MANIPULATION.\nGENTLE WARM-UP.' },
  medium: { name: 'MEDIUM', sliders: 3, label: '03 PHASE SHIFT',  desc: 'THREE MANIPULATIONS.\nTRUST YOUR EARS.' },
  hard:   { name: 'HARD',   sliders: 5, label: '05 FULL SCRAMBLE', desc: 'FIVE MANIPULATIONS.\nNO MERCY.' },
};

export interface Round { keys: ParamKey[]; target: Params; player: Params; }

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function waveAt(t: number, p: Params): number {
  const f = p['freq'], a = p['amp'], ph = p['phase'] || 0, h = p['harm'] || 0, d = p['drive'] || 0;
  let y = Math.sin(2 * Math.PI * f * t + ph);
  y += h * 0.5 * Math.sin(2 * Math.PI * f * 2 * t + ph * 1.4);
  y /= 1 + h * 0.5;
  if (d > 0) { const k = 1 + d * 5; y = Math.tanh(y * k) / Math.tanh(k); }
  return a * y;
}

export function makeRound(diff: Difficulty): Round {
  const keys = DIFF_KEYS[diff] || DIFF_KEYS.easy;
  const target: Params = {
    freq: rand(1.2, 3.6), amp: rand(0.55, 0.95), phase: rand(0, Math.PI * 2),
    harm: rand(0.15, 0.8), drive: rand(0.1, 0.7),
  };
  const player: Params = { ...target };
  keys.forEach((k) => {
    const P = PARAMS[k];
    let off = (P.max - P.min) * (Math.random() < 0.5 ? rand(-0.55, -0.28) : rand(0.28, 0.55));
    let v = target[k] + off;
    if (v < P.min) v = P.min + (P.min - v);
    if (v > P.max) v = P.max - (v - P.max);
    player[k] = Math.max(P.min, Math.min(P.max, v));
  });
  return { keys, target, player };
}

export function computeAccuracy(keys: ParamKey[], player: Params, target: Params): number {
  if (!keys.length) return 100;
  let sum = 0;
  keys.forEach((k) => {
    const P = PARAMS[k];
    let span = P.max - P.min;
    let err = Math.abs(player[k] - target[k]);
    if (k === 'phase') { err = Math.min(err, Math.PI * 2 - err); span = Math.PI; }
    sum += Math.max(0, 1 - err / span);
  });
  return Math.round((sum / keys.length) * 1000) / 10;
}

export interface Score { name: string; pct: number; diff: string; isNew?: boolean; }

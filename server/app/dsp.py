from __future__ import annotations

from math import gcd
from pathlib import Path
from typing import Any

import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve, lfilter, resample_poly

TARGET_SR = 44100
NUM_TAPS = 255
MAX_SECONDS = 60

BANDS = ("bass", "lowMid", "highMid", "treble")


def _lp_fir(cutoff_norm: float, num_taps: int = NUM_TAPS) -> np.ndarray:
    m = num_taps - 1
    n = np.arange(num_taps, dtype=np.float64)
    h = 2.0 * cutoff_norm * np.sinc(2.0 * cutoff_norm * (n - m / 2.0))
    h *= np.blackman(num_taps)
    h /= h.sum()
    return h


def _hp_fir(cutoff_norm: float, num_taps: int = NUM_TAPS) -> np.ndarray:
    h = -_lp_fir(cutoff_norm, num_taps)
    h[num_taps // 2] += 1.0
    return h


def _bp_fir(low_norm: float, high_norm: float, num_taps: int = NUM_TAPS) -> np.ndarray:
    return _lp_fir(high_norm, num_taps) - _lp_fir(low_norm, num_taps)


def build_filters(sr: int = TARGET_SR) -> dict[str, np.ndarray]:
    return {
        "bass": _lp_fir(300 / sr),
        "lowMid": _bp_fir(300 / sr, 1000 / sr),
        "highMid": _bp_fir(1000 / sr, 4000 / sr),
        "treble": _hp_fir(4000 / sr),
    }


FILTERS = build_filters(TARGET_SR)


def normalize(signal: np.ndarray, peak: float = 0.92) -> np.ndarray:
    sig = signal.astype(np.float32)
    m = float(np.max(np.abs(sig))) if sig.size else 0.0
    if m > peak:
        sig = sig * (peak / m)
    return np.clip(sig, -1.0, 1.0).astype(np.float32)


def load_wav(path: Path) -> tuple[int, np.ndarray]:
    sr, data = wavfile.read(path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if data.dtype == np.dtype("int16"):
        sig = data.astype(np.float32) / 32768.0
    elif data.dtype == np.dtype("int32"):
        sig = data.astype(np.float32) / float(2**31)
    elif data.dtype == np.dtype("uint8"):
        sig = (data.astype(np.float32) - 128.0) / 128.0
    else:
        sig = data.astype(np.float32)
    if sr != TARGET_SR:
        div = gcd(TARGET_SR, int(sr))
        sig = resample_poly(sig, TARGET_SR // div, int(sr) // div).astype(np.float32)
    return TARGET_SR, normalize(sig[: TARGET_SR * MAX_SECONDS])


def save_wav(path: Path, signal: np.ndarray, sr: int = TARGET_SR) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(path, sr, (normalize(signal) * 32767).astype(np.int16))


def generate_test_signal(duration: float = 8.0, sr: int = TARGET_SR) -> np.ndarray:
    rng = np.random.default_rng(7)
    t = np.linspace(0, duration, int(duration * sr), endpoint=False, dtype=np.float32)
    sig = (
        0.18 * np.sin(2 * np.pi * 85 * t)
        + 0.16 * np.sin(2 * np.pi * 420 * t)
        + 0.15 * np.sin(2 * np.pi * 1600 * t)
        + 0.12 * np.sin(2 * np.pi * 5200 * t)
        + 0.05 * rng.standard_normal(len(t)).astype(np.float32)
    )
    return normalize(sig)


def apply_eq4(signal: np.ndarray, gains_db: dict[str, float]) -> np.ndarray:
    out = np.zeros(len(signal), dtype=np.float64)
    sig = signal.astype(np.float64)
    for band, h in FILTERS.items():
        gain = 10.0 ** (float(gains_db.get(band, 0.0)) / 20.0)
        out += fftconvolve(sig, h, mode="same") * gain
    return normalize(out)


def apply_echo(signal: np.ndarray, delay_ms: float, feedback: float, mix: float) -> np.ndarray:
    delay = max(1, int(TARGET_SR * delay_ms / 1000.0))
    fb = float(np.clip(feedback, 0.0, 0.85))
    wet_mix = float(np.clip(mix, 0.0, 0.8))
    # Performance: a feedback echo is the IIR recurrence y[n] = x[n] + fb*y[n-delay].
    # Expressing it as the single transfer function 1 / (1 - fb*z^-delay) and feeding
    # that to lfilter is a trap: lfilter walks every one of the `delay`+1 denominator
    # coefficients (mostly zeros) per output sample, so it costs O(N*delay) — for a 60s
    # clip and a 520ms delay that is ~6e10 ops, far slower than the naive O(N) loop.
    #
    # Instead note the recurrence only couples samples `delay` apart, i.e. it is `delay`
    # INDEPENDENT first-order IIR filters, one per phase r = n mod delay. Reshape the
    # signal into rows of length `delay` (so each column is one phase) and run a single
    # order-1 filter down the columns in compiled C: total work O(N), identical result.
    # Stable by construction: fb is clipped to < 1, so the pole stays inside the unit circle.
    x = signal.astype(np.float64)
    n = x.size
    pad = (-n) % delay
    if pad:
        x = np.concatenate([x, np.zeros(pad, dtype=np.float64)])
    cols = x.reshape(-1, delay)  # row i, column r -> sample i*delay + r
    wet = lfilter([1.0], [1.0, -fb], cols, axis=0).reshape(-1)[:n]
    return normalize(signal * (1.0 - wet_mix) + wet * wet_mix)


def apply_distortion(signal: np.ndarray, drive: float, output_gain: float) -> np.ndarray:
    amount = 1.0 + float(np.clip(drive, 0.0, 1.0)) * 18.0
    shaped = np.tanh(signal.astype(np.float32) * amount) / np.tanh(amount)
    return normalize(shaped * float(np.clip(output_gain, 0.35, 1.2)))


def apply_chorus(signal: np.ndarray, rate_hz: float, depth_ms: float, mix: float) -> np.ndarray:
    # Modulated delay line — classic chorus implemented from scratch.
    #
    # A sine LFO varies the read position around a fixed base delay:
    #   delay(n) = BASE_MS + depth_ms * sin(2π * rate_hz * n / sr)
    #
    # Fractional delay is resolved with linear interpolation between the two
    # neighbouring integer samples, matching the Week 11 lab implementation.
    # The LFO is computed all at once with numpy; the read positions are integer-
    # indexed with out-of-bounds frames (before t=0) clamped to zero — no scipy.
    BASE_DELAY_MS = 20.0
    rate     = float(np.clip(rate_hz, 0.1, 5.0))
    depth    = float(np.clip(depth_ms, 1.0, 15.0))
    wet_mix  = float(np.clip(mix, 0.0, 0.8))

    sig = signal.astype(np.float64)
    n   = len(sig)

    # LFO — one sine cycle per 1/rate seconds
    t            = np.arange(n, dtype=np.float64) / TARGET_SR
    delay_samps  = (BASE_DELAY_MS + depth * np.sin(2.0 * np.pi * rate * t)) / 1000.0 * TARGET_SR

    # Read positions in the past (fractional)
    read_pos = np.arange(n, dtype=np.float64) - delay_samps

    # Split into integer floor and fractional remainder
    i_floor = np.floor(read_pos).astype(np.int64)
    frac    = read_pos - i_floor          # always in [0, 1)
    i_ceil  = i_floor + 1

    # Gather samples; treat any read before the signal start as silence
    in_s0 = (i_floor >= 0) & (i_floor < n)
    in_s1 = (i_ceil  >= 0) & (i_ceil  < n)
    s0 = np.where(in_s0, sig[np.clip(i_floor, 0, n - 1)], 0.0)
    s1 = np.where(in_s1, sig[np.clip(i_ceil,  0, n - 1)], 0.0)

    wet = s0 * (1.0 - frac) + s1 * frac
    return normalize(sig * (1.0 - wet_mix) + wet * wet_mix)


def filter_values(filters: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    result: dict[str, dict[str, float]] = {}
    for flt in filters:
        result[flt["type"]] = {p["key"]: float(p["value"]) for p in flt.get("params", [])}
    return result


def render_chain(source: np.ndarray, filters: list[dict[str, Any]]) -> np.ndarray:
    values = filter_values(filters)
    out = source.copy()
    if "eq4" in values:
        out = apply_eq4(out, values["eq4"])
    if "chorus" in values:
        ch = values["chorus"]
        out = apply_chorus(out, ch.get("rateHz", 0.8), ch.get("depthMs", 7.0), ch.get("mix", 0.4))
    if "echo" in values:
        echo = values["echo"]
        out = apply_echo(out, echo.get("delayMs", 220), echo.get("feedback", 0.25), echo.get("mix", 0.25))
    if "distortion" in values:
        dist = values["distortion"]
        out = apply_distortion(out, dist.get("drive", 0.25), dist.get("outputGain", 0.75))
    return normalize(out)


def waveform_peaks(signal: np.ndarray, buckets: int = 1024) -> list[float]:
    if signal.size == 0:
        return []
    buckets = max(32, min(int(buckets), 4096))
    stride = int(np.ceil(signal.size / buckets))
    padded = np.pad(signal, (0, stride * buckets - signal.size), mode="constant")
    frames = padded.reshape(buckets, stride)
    peaks = np.where(np.abs(frames.min(axis=1)) > np.abs(frames.max(axis=1)), frames.min(axis=1), frames.max(axis=1))
    return [round(float(v), 5) for v in peaks]


def spectrum_score(target: np.ndarray, player: np.ndarray) -> float:
    def mag(sig: np.ndarray, n_fft: int = 4096) -> np.ndarray:
        n = min(len(sig), n_fft)
        seg = sig[:n].astype(np.float64) * np.hanning(n)
        return 20.0 * np.log10(np.abs(np.fft.rfft(seg, n=n_fft)) + 1e-10)

    mt = mag(target)
    mp = mag(player)
    mt -= np.mean(mt)
    mp -= np.mean(mp)
    rms_diff = np.sqrt(np.mean((mt - mp) ** 2))
    rms_target = np.sqrt(np.mean(mt**2)) + 1e-6
    return float(np.clip(100.0 * (1.0 - rms_diff / rms_target), 0.0, 100.0))

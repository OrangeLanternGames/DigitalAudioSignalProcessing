from __future__ import annotations

import random
from copy import deepcopy
from math import exp
from typing import Any

from .models import AudioFilterConfig, AudioFilterParam, Difficulty, ScoreDetail

# --- Scoring tuning -------------------------------------------------------
# "Match the target sound" model with a beginner-friendly ("mild") curve.
# Per-parameter accuracy is a Gaussian falloff around the target value, with
# sigma expressed as a FRACTION of that parameter's own range so it auto-scales
# across dB / ms / 0-1 ratio units alike. A small "perfect" deadzone means a
# near-exact dial reads as a clean 100%. Larger TOL_FRACTION = more forgiving.
TOL_FRACTION = 0.18          # sigma as a fraction of each parameter's span
PERFECT_FRACTION = 0.03      # |error| within this fraction of span => full 100%
DIFFICULTY_TOL = {"easy": 1.25, "medium": 1.0, "hard": 0.8}  # gentle progression


PARAM_RANGES: dict[str, dict[str, tuple[float, float, float, str | None, str]]] = {
    "eq4": {
        "bass": (-12.0, 12.0, 0.1, "dB", "Bass"),
        "lowMid": (-12.0, 12.0, 0.1, "dB", "Low Mid"),
        "highMid": (-12.0, 12.0, 0.1, "dB", "High Mid"),
        "treble": (-12.0, 12.0, 0.1, "dB", "Treble"),
    },
    "echo": {
        "delayMs": (80.0, 620.0, 1.0, "ms", "Delay"),
        "feedback": (0.0, 0.75, 0.01, None, "Feedback"),
        "mix": (0.0, 0.7, 0.01, None, "Mix"),
    },
    "distortion": {
        "drive": (0.0, 1.0, 0.01, None, "Drive"),
        "outputGain": (0.35, 1.1, 0.01, None, "Output"),
    },
}

FILTER_LABELS = {"eq4": "4-Band FIR EQ", "echo": "Echo Delay", "distortion": "Distortion"}
DIFFICULTY_FILTERS: dict[Difficulty, list[str]] = {
    "easy": ["eq4"],
    "medium": ["eq4", "echo"],
    "hard": ["eq4", "echo", "distortion"],
}


def _param(filter_type: str, key: str, value: float) -> AudioFilterParam:
    mn, mx, step, unit, label = PARAM_RANGES[filter_type][key]
    return AudioFilterParam(key=key, label=label, min=mn, max=mx, step=step, value=round(float(value), 3), unit=unit)


def make_filters(difficulty: Difficulty) -> tuple[list[AudioFilterConfig], list[AudioFilterConfig]]:
    rng = random.Random()
    target: list[AudioFilterConfig] = []
    player: list[AudioFilterConfig] = []
    eq_span = 7.0 if difficulty == "easy" else 10.0

    for filter_type in DIFFICULTY_FILTERS[difficulty]:
        params: list[AudioFilterParam] = []
        player_params: list[AudioFilterParam] = []
        for key, (mn, mx, _step, _unit, _label) in PARAM_RANGES[filter_type].items():
            if filter_type == "eq4":
                # Musical, clearly audible offset: random magnitude 2..eq_span dB,
                # random sign. Stays within the slider range so it is fully dialable.
                magnitude = rng.uniform(2.0, eq_span)
                value = magnitude if rng.random() < 0.5 else -magnitude
                initial = 0.0
            elif filter_type == "echo" and key == "delayMs":
                value = rng.uniform(120, 520)
                initial = rng.choice([120.0, 240.0, 360.0, 480.0])
            elif filter_type == "echo":
                value = rng.uniform(0.15, 0.58)
                initial = 0.12
            elif key == "outputGain":
                value = rng.uniform(0.55, 0.95)
                initial = 0.75
            else:
                value = rng.uniform(0.15, 0.75)
                initial = 0.12
            params.append(_param(filter_type, key, max(mn, min(mx, value))))
            player_params.append(_param(filter_type, key, max(mn, min(mx, initial))))

        target.append(AudioFilterConfig(id=f"flt_{filter_type}", type=filter_type, label=FILTER_LABELS[filter_type], params=params))
        player.append(AudioFilterConfig(id=f"flt_{filter_type}", type=filter_type, label=FILTER_LABELS[filter_type], params=player_params))
    return target, player


def filters_to_plain(filters: list[AudioFilterConfig]) -> list[dict[str, Any]]:
    return [f.model_dump() for f in filters]


def clone_filters(filters: list[AudioFilterConfig]) -> list[AudioFilterConfig]:
    return [AudioFilterConfig.model_validate(deepcopy(f.model_dump())) for f in filters]


def _param_accuracy(target_param: AudioFilterParam, player_value: float, difficulty: Difficulty) -> float:
    """Gaussian closeness in the parameter's own units, 1.0 == perfect."""
    span = target_param.max - target_param.min
    if span <= 0:
        return 1.0
    sigma = max(span * TOL_FRACTION * DIFFICULTY_TOL.get(difficulty, 1.0), 1e-9)
    dead = span * PERFECT_FRACTION
    error = max(0.0, abs(player_value - target_param.value) - dead)
    return exp(-0.5 * (error / sigma) ** 2)


def parameter_score(
    target: list[AudioFilterConfig],
    player: list[AudioFilterConfig],
    difficulty: Difficulty = "medium",
) -> tuple[float, list[ScoreDetail]]:
    player_by_type = {f.type: f for f in player}
    details: list[ScoreDetail] = []
    accuracies: list[float] = []

    for target_filter in target:
        player_filter = player_by_type.get(target_filter.type)
        if not player_filter:
            continue
        player_params = {p.key: p for p in player_filter.params}
        for target_param in target_filter.params:
            player_param = player_params.get(target_param.key)
            if not player_param:
                continue
            acc = round(_param_accuracy(target_param, player_param.value, difficulty), 4)
            accuracies.append(acc)
            details.append(ScoreDetail(filter=target_filter.type, param=target_param.key, accuracy=acc))

    if not accuracies:
        return 0.0, details
    return round(sum(accuracies) / len(accuracies) * 100.0, 2), details

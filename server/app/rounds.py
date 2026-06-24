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
# Per-mode scoring tolerance: single filters are forgiving, the combined "random"
# mode is a touch stricter. Unknown modes fall back to 1.0 via .get().
DIFFICULTY_TOL = {"eq4": 1.0, "echo": 1.0, "distortion": 1.0, "random": 0.9, "all": 0.8}


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
ALL_FILTERS = ["eq4", "echo", "distortion"]
# Each mode maps to the filter(s) the round uses. "random" is resolved per-round
# in filters_for_mode() to a random pair, so it is not listed here.
DIFFICULTY_FILTERS: dict[str, list[str]] = {
    "eq4": ["eq4"],
    "echo": ["echo"],
    "distortion": ["distortion"],
}


def filters_for_mode(mode: str, rng: random.Random) -> list[str]:
    """Which filters a round uses. 'random' picks two distinct filters and 'all'
    uses every filter, both kept in the canonical eq4->echo->distortion order so
    the chain/UI stay consistent."""
    if mode == "all":
        return list(ALL_FILTERS)
    if mode == "random":
        chosen = set(rng.sample(ALL_FILTERS, 2))
        return [f for f in ALL_FILTERS if f in chosen]
    return DIFFICULTY_FILTERS.get(mode, ["eq4"])


def _param(filter_type: str, key: str, value: float) -> AudioFilterParam:
    mn, mx, step, unit, label = PARAM_RANGES[filter_type][key]
    return AudioFilterParam(key=key, label=label, min=mn, max=mx, step=step, value=round(float(value), 3), unit=unit)


# Game model "restore the clean original": the TARGET is the clean/neutral preset
# (the goal the player dials back to) and the PLAYER starts on a random
# manipulation that must be removed. Only which preset is the goal changed — the
# scoring formula and the DSP are identical to before.
#
# Audible effects must be dialed back to zero to restore clean. The other scored
# params are inaudible at the clean setting (echo delay does nothing at mix=0,
# output gain is masked by the final normalize), so their goal is left equal to
# the manipulated start: the player cannot — and need not — ear-match them, and
# would otherwise be penalised for something they can't hear.
ZERO_AT_CLEAN: dict[str, set[str]] = {
    "eq4": {"bass", "lowMid", "highMid", "treble"},
    "echo": {"feedback", "mix"},
    "distortion": {"drive"},
}


def make_filters(difficulty: Difficulty) -> tuple[list[AudioFilterConfig], list[AudioFilterConfig]]:
    rng = random.Random()
    target: list[AudioFilterConfig] = []  # clean goal (what the player restores to)
    player: list[AudioFilterConfig] = []  # manipulated start (applied on MANIPULATE)
    eq_span = 10.0

    for filter_type in filters_for_mode(difficulty, rng):
        goal_params: list[AudioFilterParam] = []
        start_params: list[AudioFilterParam] = []
        for key, (mn, mx, _step, _unit, _label) in PARAM_RANGES[filter_type].items():
            # Random, clearly audible manipulation (the puzzle the player undoes).
            if filter_type == "eq4":
                magnitude = rng.uniform(2.0, eq_span)
                start = magnitude if rng.random() < 0.5 else -magnitude
            elif filter_type == "echo" and key == "delayMs":
                start = rng.uniform(120, 520)
            elif filter_type == "echo":
                start = rng.uniform(0.2, 0.55)
            elif key == "outputGain":
                start = rng.uniform(0.55, 0.95)
            else:  # distortion drive
                start = rng.uniform(0.25, 0.7)
            start = max(mn, min(mx, start))
            goal = 0.0 if key in ZERO_AT_CLEAN.get(filter_type, set()) else start
            goal = max(mn, min(mx, goal))
            goal_params.append(_param(filter_type, key, goal))
            start_params.append(_param(filter_type, key, start))

        target.append(AudioFilterConfig(id=f"flt_{filter_type}", type=filter_type, label=FILTER_LABELS[filter_type], params=goal_params))
        player.append(AudioFilterConfig(id=f"flt_{filter_type}", type=filter_type, label=FILTER_LABELS[filter_type], params=start_params))
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
    difficulty: Difficulty = "eq4",
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

"""Manim scenes for the Angular + FastAPI DIAL IN implementation.

The documentation focus is the three audio filters of the DSP chain
(server/app/dsp.py):

    Filter 1  EQ4         -> Eq4Scene          (4-band FIR equalizer)
    Filter 2  Echo        -> EchoScene         (feedback delay / IIR recurrence)
    Filter 3  Distortion  -> DistortionScene   (tanh waveshaper)

The surrounding pipeline and the score stay as supporting context:

    ApiFlowScene   -> request/render pipeline
    ScoreScene     -> parameter + spectral scoring

Preview (single scene):
    python -m manim -pql docs/dial_in_manim.py Eq4Scene

Full presentation:
    python -m manim -pqh docs/dial_in_manim.py DialInApiPresentation
"""

from manim import *
import numpy as np

config.frame_rate = 60
config.pixel_width = 1920
config.pixel_height = 1080

C_BG = "#06120A"
C_FG = "#BEDC7F"
C_HI = "#EEFFCC"
C_ACCENT = "#89A257"
C_BLUE = "#5D9CEC"
C_GREEN = "#66CC88"
C_RED = "#E76F51"
C_DIM = "#4D8061"

# ---------------------------------------------------------------------------
# DSP helpers — mirror server/app/dsp.py so the animation shows the *real*
# filter behaviour, not a hand-drawn approximation.
# ---------------------------------------------------------------------------
TARGET_SR = 44100
NUM_TAPS = 255


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


def eq_bands(sr: int = TARGET_SR) -> dict[str, np.ndarray]:
    return {
        "bass": _lp_fir(300 / sr),
        "lowMid": _bp_fir(300 / sr, 1000 / sr),
        "highMid": _bp_fir(1000 / sr, 4000 / sr),
        "treble": _hp_fir(4000 / sr),
    }


def band_response(h: np.ndarray, grid: np.ndarray, sr: int = TARGET_SR, n_fft: int = 8192) -> np.ndarray:
    """Complex frequency response of FIR h, interpolated onto a Hz grid."""
    H = np.fft.rfft(h, n=n_fft)
    f = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    return np.interp(grid, f, H.real) + 1j * np.interp(grid, f, H.imag)


def tanh_shape(x: np.ndarray, amount: float) -> np.ndarray:
    return np.tanh(x * amount) / np.tanh(amount)


class ApiFlowScene(Scene):
    def construct(self):
        self.camera.background_color = C_BG
        title = Text("DIAL IN API Pipeline", font_size=42, color=C_HI).to_edge(UP)
        steps = ["Upload WAV", "FastAPI Round", "DSP Chain", "Preview WAV", "Score"]
        boxes = VGroup()
        for idx, label in enumerate(steps):
            box = RoundedRectangle(width=2.25, height=0.85, corner_radius=0.08, color=C_ACCENT)
            text = Text(label, font_size=22, color=C_FG).move_to(box)
            boxes.add(VGroup(box, text))
        boxes.arrange(RIGHT, buff=0.45).shift(UP * 0.2)
        arrows = VGroup(*[Arrow(boxes[i].get_right(), boxes[i + 1].get_left(), buff=0.08, color=C_DIM) for i in range(len(boxes) - 1)])
        note = Text("Angular controls parameters; Python renders and scores real audio.", font_size=24, color=C_DIM).to_edge(DOWN)
        self.play(Write(title))
        self.play(LaggedStart(*[FadeIn(b, shift=UP * 0.1) for b in boxes], lag_ratio=0.15))
        self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.18))
        self.play(FadeIn(note))
        self.wait(2)


class Eq4Scene(Scene):
    """Filter 1 — 4-band FIR equalizer (apply_eq4)."""

    def construct(self):
        self.camera.background_color = C_BG
        title = Text("Filter 1 — 4-Band FIR EQ", font_size=36, color=C_HI).to_edge(UP)
        self.play(Write(title))

        x_lo, x_hi = float(np.log10(30.0)), float(np.log10(20000.0))
        ax = Axes(
            x_range=[x_lo, x_hi, 1.0],
            y_range=[-24, 12, 6],
            x_length=10.5, y_length=3.8,
            tips=False,
            axis_config={"include_numbers": False, "color": C_DIM},
        ).shift(DOWN * 0.35)
        y_lbl = Text("Gain [dB]", font_size=18, color=C_DIM).next_to(ax, LEFT, buff=0.1)
        x_lbl = Text("Frequency [Hz]  (log)", font_size=18, color=C_DIM).next_to(ax, DOWN, buff=0.45)

        ticks = VGroup()
        for fhz, txt in [(100, "100"), (300, "300"), (1000, "1k"), (4000, "4k"), (10000, "10k")]:
            p = ax.c2p(np.log10(fhz), -24)
            ticks.add(Text(txt, font_size=14, color=C_DIM).next_to(p, DOWN, buff=0.08))

        crossovers = VGroup()
        for fhz in (300, 1000, 4000):
            crossovers.add(DashedLine(ax.c2p(np.log10(fhz), -24), ax.c2p(np.log10(fhz), 12),
                                      color=C_DIM, stroke_width=1, dash_length=0.08))

        self.play(Create(ax), Write(x_lbl), Write(y_lbl), FadeIn(ticks), FadeIn(crossovers))

        grid = np.logspace(np.log10(30.0), np.log10(20000.0), 500)
        log_grid = np.log10(grid).tolist()
        bands = eq_bands()
        band_meta = [
            ("bass", C_BLUE, "Bass  ·  LP < 300 Hz"),
            ("lowMid", C_GREEN, "Low Mid  ·  300–1000 Hz"),
            ("highMid", C_ACCENT, "High Mid  ·  1–4 kHz"),
            ("treble", C_RED, "Treble  ·  HP > 4 kHz"),
        ]

        graphs = VGroup()
        legend = VGroup()
        for name, color, label in band_meta:
            mag = 20 * np.log10(np.abs(band_response(bands[name], grid)) + 1e-9)
            ys = np.clip(mag, -24, 12)
            graphs.add(ax.plot_line_graph(log_grid, ys.tolist(), line_color=color,
                                          add_vertex_dots=False, stroke_width=2.5))
            legend.add(Text(label, font_size=16, color=color))
        legend.arrange(DOWN, aligned_edge=LEFT, buff=0.12).to_corner(UR, buff=0.4).shift(DOWN * 0.9)

        caption = Text("4 windowed-sinc FIR bands (255 taps) split the spectrum",
                       font_size=22, color=C_DIM).to_edge(DOWN, buff=0.2)
        self.play(LaggedStart(*[Create(g) for g in graphs], lag_ratio=0.25), run_time=2.5)
        self.play(FadeIn(legend), Write(caption))
        self.wait(0.8)

        # Apply example per-band gains -> combined transfer function.
        gains_db = {"bass": 6.0, "lowMid": -3.0, "highMid": 5.0, "treble": -7.0}
        comb = np.zeros(len(grid), dtype=complex)
        for name in gains_db:
            comb += (10.0 ** (gains_db[name] / 20.0)) * band_response(bands[name], grid)
        comb_db = np.clip(20 * np.log10(np.abs(comb) + 1e-9), -24, 12)
        comb_graph = ax.plot_line_graph(log_grid, comb_db.tolist(), line_color=C_HI,
                                        add_vertex_dots=False, stroke_width=5)

        new_caption = VGroup(
            Text("out = Σ  gain_band · ( x ∗ h_band )      gain = 10^(dB/20)", font_size=22, color=C_HI),
            Text("Gains:  Bass +6   Low Mid −3   High Mid +5   Treble −7  dB", font_size=20, color=C_ACCENT),
        ).arrange(DOWN, buff=0.12).to_edge(DOWN, buff=0.2)

        self.play(graphs.animate.set_stroke(opacity=0.22), FadeOut(legend))
        self.play(Create(comb_graph), Transform(caption, new_caption))
        self.wait(2.5)


class EchoScene(Scene):
    """Filter 2 — feedback echo / delay (apply_echo)."""

    def construct(self):
        self.camera.background_color = C_BG
        title = Text("Filter 2 — Echo (Feedback Delay)", font_size=36, color=C_HI).to_edge(UP)
        self.play(Write(title))

        ax = Axes(
            x_range=[0, 1.6, 0.2], y_range=[0, 1.15, 0.5],
            x_length=10, y_length=2.8, tips=False,
            axis_config={"color": C_DIM},
        ).shift(UP * 0.5)
        x_lbl = Text("Time [s]", font_size=18, color=C_DIM).next_to(ax, DOWN, buff=0.15)
        y_lbl = Text("Amplitude", font_size=18, color=C_DIM).next_to(ax, LEFT, buff=0.1)
        self.play(Create(ax), Write(x_lbl), Write(y_lbl))

        D = 0.3  # delay (s) — corresponds to delayMs
        fb = 0.55
        stems, dots = [], []
        for k in range(6):
            t = k * D
            if t > 1.55:
                break
            amp = fb ** k
            color = C_BLUE if k == 0 else C_GREEN
            stems.append(Line(ax.c2p(t, 0), ax.c2p(t, amp), color=color, stroke_width=6))
            dots.append(Dot(ax.c2p(t, amp), color=color, radius=0.07))

        self.play(GrowFromPoint(stems[0], ax.c2p(0, 0)), FadeIn(dots[0]))
        in_lbl = Text("input impulse", font_size=18, color=C_BLUE).next_to(dots[0], UR, buff=0.05)
        self.play(Write(in_lbl))

        for k in range(1, len(stems)):
            self.play(GrowFromPoint(stems[k], ax.c2p(k * D, 0)), FadeIn(dots[k]), run_time=0.35)

        brace = BraceBetweenPoints(ax.c2p(0, 0.95), ax.c2p(D, 0.95), direction=UP, color=C_FG)
        delay_txt = Text("delay D", font_size=18, color=C_FG).next_to(brace, UP, buff=0.05)
        fb_txt = Text("× feedback each repeat", font_size=18, color=C_GREEN).next_to(dots[2], UR, buff=0.05)
        self.play(GrowFromCenter(brace), Write(delay_txt), Write(fb_txt))
        self.wait(0.6)

        formula = VGroup(
            Text("y[n] = x[n] + feedback · y[n − D]", font_size=26, color=C_HI),
            Text("H(z) = 1 / ( 1 − feedback · z^(−D) )    →  scipy lfilter (compiled C, ~100× loop)",
                 font_size=20, color=C_DIM),
            Text("out = (1 − mix) · dry  +  mix · wet      delay 80–620 ms · feedback ≤ 0.75 · mix ≤ 0.7",
                 font_size=20, color=C_ACCENT),
        ).arrange(DOWN, buff=0.18).to_edge(DOWN, buff=0.3)
        self.play(LaggedStart(*[Write(m) for m in formula], lag_ratio=0.3))
        self.wait(2.5)


class DistortionScene(Scene):
    """Filter 3 — tanh waveshaper (apply_distortion)."""

    def construct(self):
        self.camera.background_color = C_BG
        title = Text("Filter 3 — Distortion (tanh Waveshaper)", font_size=34, color=C_HI).to_edge(UP)
        self.play(Write(title))

        # Left: transfer curve y = tanh(x·amount)/tanh(amount)
        ax1 = Axes(
            x_range=[-1, 1, 0.5], y_range=[-1.2, 1.2, 0.5],
            x_length=4.8, y_length=3.8, tips=False, axis_config={"color": C_DIM},
        ).shift(LEFT * 3.3 + DOWN * 0.2)
        ax1_in = Text("input", font_size=15, color=C_DIM).next_to(ax1, DOWN, buff=0.1)
        ax1_out = Text("output", font_size=15, color=C_DIM).next_to(ax1, LEFT, buff=0.1)
        ax1_hdr = Text("Transfer curve", font_size=20, color=C_FG).next_to(ax1, UP, buff=0.1)

        ident = DashedVMobject(ax1.plot(lambda x: x, x_range=[-1, 1], color=C_DIM), num_dashes=24)
        amt_mild = 1.0 + 0.25 * 18.0   # drive = 0.25  -> 5.5
        amt_hot = 1.0 + 1.0 * 18.0     # drive = 1.00  -> 19.0
        curve_mild = ax1.plot(lambda x: float(tanh_shape(np.array([x]), amt_mild)[0]),
                              x_range=[-1, 1], color=C_GREEN, stroke_width=4)
        curve_hot = ax1.plot(lambda x: float(tanh_shape(np.array([x]), amt_hot)[0]),
                             x_range=[-1, 1], color=C_RED, stroke_width=4)
        curve_lbls = VGroup(
            Text("drive 0.25", font_size=15, color=C_GREEN),
            Text("drive 1.0", font_size=15, color=C_RED),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.1).next_to(ax1, UP, buff=0.1).shift(RIGHT * 1.2)

        self.play(Create(ax1), Write(ax1_hdr), Write(ax1_in), Write(ax1_out))
        self.play(Create(ident))
        self.play(Create(curve_mild), Create(curve_hot), FadeIn(curve_lbls))
        self.wait(0.5)

        # Right: input sine vs waveshaped output
        ax2 = Axes(
            x_range=[0, 1, 0.25], y_range=[-1.2, 1.2, 0.5],
            x_length=4.8, y_length=3.8, tips=False, axis_config={"color": C_DIM},
        ).shift(RIGHT * 3.3 + DOWN * 0.2)
        ax2_hdr = Text("Sine in → soft-clipped out", font_size=20, color=C_FG).next_to(ax2, UP, buff=0.1)
        ax2_t = Text("Time", font_size=15, color=C_DIM).next_to(ax2, DOWN, buff=0.1)

        t = np.linspace(0, 1, 300)
        inp = np.sin(2 * np.pi * 3 * t)
        out = tanh_shape(inp, amt_mild)
        in_graph = ax2.plot_line_graph(t.tolist(), inp.tolist(), line_color=C_BLUE,
                                       add_vertex_dots=False, stroke_width=2.5)
        out_graph = ax2.plot_line_graph(t.tolist(), out.tolist(), line_color=C_RED,
                                        add_vertex_dots=False, stroke_width=3)
        io_lbls = VGroup(
            Text("input", font_size=15, color=C_BLUE),
            Text("output", font_size=15, color=C_RED),
        ).arrange(RIGHT, buff=0.4).next_to(ax2, DOWN, buff=0.35)

        self.play(Create(ax2), Write(ax2_hdr), Write(ax2_t))
        self.play(Create(in_graph))
        self.play(Create(out_graph), FadeIn(io_lbls))
        self.wait(0.5)

        formula = VGroup(
            Text("amount = 1 + drive · 18        shaped = tanh(x · amount) / tanh(amount)",
                 font_size=22, color=C_HI),
            Text("Soft clipping adds harmonics; result is normalized, then output gain 0.35–1.1",
                 font_size=20, color=C_ACCENT),
        ).arrange(DOWN, buff=0.15).to_edge(DOWN, buff=0.25)
        self.play(LaggedStart(*[Write(m) for m in formula], lag_ratio=0.3))
        self.wait(2.5)


class ScoreScene(Scene):
    def construct(self):
        self.camera.background_color = C_BG
        title = Text("Score = Parameter Match + Spectral Match", font_size=38, color=C_HI).to_edge(UP)
        formula = VGroup(
            Text("Parameter score", font_size=28, color=C_ACCENT),
            Text("compares slider values to hidden target values", font_size=22, color=C_DIM),
            Text("Spectral score", font_size=28, color=C_GREEN),
            Text("compares FFT magnitude shapes of rendered WAV files", font_size=22, color=C_DIM),
            Text("Final: 80% parameters + 20% spectrum", font_size=30, color=C_HI),
        ).arrange(DOWN, buff=0.25)
        meter = Rectangle(width=7.5, height=0.35, color=C_DIM).shift(DOWN * 2.6)
        fill = Rectangle(width=6.2, height=0.28, color=C_GREEN, fill_color=C_GREEN, fill_opacity=0.9).align_to(meter, LEFT).move_to(meter.get_center() + LEFT * 0.65)
        self.play(Write(title))
        self.play(LaggedStart(*[FadeIn(x, shift=UP * 0.1) for x in formula], lag_ratio=0.15))
        self.play(Create(meter), FadeIn(fill), Write(Text("82.7%", font_size=26, color=C_HI).next_to(meter, RIGHT)))
        self.wait(2)


class DialInApiPresentation(Scene):
    def construct(self):
        scenes = (ApiFlowScene, Eq4Scene, EchoScene, DistortionScene, ScoreScene)
        for scene in scenes:
            scene.construct(self)
            self.play(*[FadeOut(m) for m in self.mobjects])

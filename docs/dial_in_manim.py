"""Manim scenes for the Angular + FastAPI DIAL IN implementation.

Preview:
    manim -pql docs/dial_in_manim.py DialInApiPresentation

High quality:
    manim -pqh docs/dial_in_manim.py DialInApiPresentation
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


def signal(freq=3.0, drive=0.0):
    xs = np.linspace(0, 1, 260)
    ys = np.sin(2 * np.pi * freq * xs) + 0.35 * np.sin(2 * np.pi * freq * 2 * xs)
    ys = ys / np.max(np.abs(ys))
    if drive:
        ys = np.tanh(ys * drive) / np.tanh(drive)
    return xs, ys


def wave(ax, freq=3.0, color=C_FG, drive=0.0):
    xs, ys = signal(freq, drive)
    return ax.plot_line_graph(xs, ys, line_color=color, stroke_width=3, add_vertex_dots=False)


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


class FilterChainScene(Scene):
    def construct(self):
        self.camera.background_color = C_BG
        title = Text("Filter Chain: EQ4 -> Echo -> Distortion", font_size=38, color=C_HI).to_edge(UP)
        ax1 = Axes(x_range=[0, 1, 0.2], y_range=[-1.2, 1.2, 0.6], x_length=5, y_length=2.2, tips=False).shift(LEFT * 3 + UP * 0.7)
        ax2 = Axes(x_range=[0, 1, 0.2], y_range=[-1.2, 1.2, 0.6], x_length=5, y_length=2.2, tips=False).shift(RIGHT * 3 + UP * 0.7)
        clean = wave(ax1, 3.0, C_BLUE)
        driven = wave(ax2, 3.0, C_RED, drive=5.0)
        labels = VGroup(
            Text("source / preview", font_size=20, color=C_BLUE).next_to(ax1, DOWN),
            Text("distorted target", font_size=20, color=C_RED).next_to(ax2, DOWN),
        )
        echo = VGroup(
            Line(LEFT * 4, RIGHT * 4, color=C_DIM),
            Dot(LEFT * 2.6, color=C_GREEN),
            Dot(LEFT * 0.9, color=C_GREEN),
            Dot(RIGHT * 0.8, color=C_GREEN),
            Text("Echo repeats delayed, quieter copies", font_size=24, color=C_GREEN).shift(DOWN * 2),
        )
        self.play(Write(title))
        self.play(Create(ax1), Create(clean), Create(ax2), Create(driven), FadeIn(labels))
        self.wait(0.7)
        self.play(FadeIn(echo))
        self.wait(2)


class ScoreScene(Scene):
    def construct(self):
        self.camera.background_color = C_BG
        title = Text("Score = Parameter Match + Spectral Match", font_size=38, color=C_HI).to_edge(UP)
        formula = VGroup(
            Text("Parameter score", font_size=28, color=C_ACCENT),
            Text("compares slider values to hidden target values", font_size=22, color=C_DIM),
            Text("Spectral score", font_size=28, color=C_GREEN),
            Text("compares FFT magnitude shapes of rendered WAV files", font_size=22, color=C_DIM),
            Text("Final: 65% parameters + 35% spectrum", font_size=30, color=C_HI),
        ).arrange(DOWN, buff=0.25)
        meter = Rectangle(width=7.5, height=0.35, color=C_DIM).shift(DOWN * 2.6)
        fill = Rectangle(width=6.2, height=0.28, color=C_GREEN, fill_color=C_GREEN, fill_opacity=0.9).align_to(meter, LEFT).move_to(meter.get_center() + LEFT * 0.65)
        self.play(Write(title))
        self.play(LaggedStart(*[FadeIn(x, shift=UP * 0.1) for x in formula], lag_ratio=0.15))
        self.play(Create(meter), FadeIn(fill), Write(Text("82.7%", font_size=26, color=C_HI).next_to(meter, RIGHT)))
        self.wait(2)


class DialInApiPresentation(Scene):
    def construct(self):
        for scene in (ApiFlowScene, FilterChainScene, ScoreScene):
            scene.construct(self)
            self.play(*[FadeOut(m) for m in self.mobjects])

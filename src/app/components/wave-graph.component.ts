import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { readVar } from '../core/util';
import { Params, ParamKey, waveAt } from '../core/dial-model';
import { WaveformPeaks } from '../core/audio-model';

@Component({
  selector: 'app-wave-graph',
  standalone: true,
  styles: [':host{display:block;width:100%;height:100%}'],
  template: `<canvas #cv style="display:block;width:100%;height:100%"></canvas>`,
})
export class WaveGraphComponent implements AfterViewInit, OnDestroy {
  @Input() player: Params = {};
  @Input() target: Params = {};
  @Input() keys: ParamKey[] = [];
  @Input() showOriginal = false;
  @Input() playing = false;
  @Input() manipulated = true;
  @Input() playerPeaks?: WaveformPeaks | null;
  @Input() targetPeaks?: WaveformPeaks | null;
  // Returns the real playback position (0..1) each frame. When absent (e.g. the
  // mock has no audio), the playhead falls back to a decorative sweep.
  @Input() progressFn?: () => number | null;

  @ViewChild('cv') cvRef!: ElementRef<HTMLCanvasElement>;

  private raf = 0;
  private mounted = true;
  private ro?: ResizeObserver;
  private scrub = 0;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    // Run the render loop outside Angular's zone so the per-frame rAF tick
    // does not trigger app-wide change detection ~60×/s. The canvas reads the
    // @Input fields directly each frame, so it stays in sync without CD.
    this.zone.runOutsideAngular(() => this.start());
  }

  private start(): void {
    const canvas = this.cvRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const cssvar = (n: string, f: string) => readVar(n, f);

    // Inputs seen on the last paint. The render loop spins every frame (cheap),
    // but only repaints when something actually changed or while playing (the
    // scrub line animates). This avoids redrawing the grid + glow (shadowBlur)
    // 60×/s when the graph is static — the main idle cost.
    let last: any = {};
    const resize = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.max(2, r.width) * dpr;
      canvas.height = Math.max(2, r.height) * dpr;
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      last = {}; // force a repaint at the new size
    };
    resize();
    this.ro = new ResizeObserver(resize);
    this.ro.observe(canvas.parentElement!);

    const draw = () => {
      if (!this.mounted) return;
      const dirty = this.playing
        || last.pp !== this.playerPeaks || last.tp !== this.targetPeaks
        || last.pl !== this.player || last.tg !== this.target
        || last.so !== this.showOriginal || last.mp !== this.manipulated
        || last.pg !== this.playing;
      if (!dirty) { this.raf = requestAnimationFrame(draw); return; }
      last = {
        pp: this.playerPeaks, tp: this.targetPeaks, pl: this.player, tg: this.target,
        so: this.showOriginal, mp: this.manipulated, pg: this.playing,
      };
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const fg = cssvar('--wave', '#bedc7f'), orig = cssvar('--orig', '#eeffcc'),
            line = cssvar('--line', '#305d42');
      ctx.clearRect(0, 0, W, H);
      const padX = 14, padY = 14, gx = W - padX * 2, gy = H - padY * 2, midY = padY + gy / 2;

      ctx.fillStyle = line; ctx.globalAlpha = 0.45;
      const cols = 40, rows = 12;
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
        ctx.fillRect(padX + (i / cols) * gx, padY + (j / rows) * gy, 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = line; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padX, midY); ctx.lineTo(W - padX, midY); ctx.stroke();
      ctx.globalAlpha = 1;

      const drawPeaks = (peaks: WaveformPeaks, color: string, glow: number, alpha: number, dash?: number[]) => {
        const values = peaks.samples || [];
        if (values.length < 2) return;
        ctx.beginPath();
        for (let i = 0; i < values.length; i++) {
          const t = i / (values.length - 1);
          const px = padX + t * gx, py = midY - values[i] * (gy / 2) * 0.86;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.setLineDash(dash || []);
        ctx.lineWidth = 2; ctx.globalAlpha = alpha;
        ctx.shadowBlur = glow; ctx.shadowColor = color; ctx.strokeStyle = color; ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      };

      const N = 260;
      const plot = (p: Params, color: string, glow: number, alpha: number, dash?: number[]) => {
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const t = i / N; const y = waveAt(t, p);
          const px = padX + t * gx, py = midY - y * (gy / 2) * 0.86;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.setLineDash(dash || []);
        ctx.lineWidth = 2; ctx.globalAlpha = alpha;
        ctx.shadowBlur = glow; ctx.shadowColor = color; ctx.strokeStyle = color; ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      };
      if (this.targetPeaks || this.playerPeaks) {
        if (this.showOriginal && this.targetPeaks) drawPeaks(this.targetPeaks, orig, 11, 0.95, [7, 5]);
        if (this.playerPeaks) drawPeaks(this.playerPeaks, fg, 8, this.showOriginal ? 0.8 : 1);
      } else {
        if (this.showOriginal) plot(this.target, orig, 11, 0.95, [7, 5]);
        plot(this.player, fg, 8, this.showOriginal ? 0.8 : 1);
      }

      if (this.playing) {
        // Real playback position when available (one pass 0→1 over the clip,
        // tied to its length); decorative sweep otherwise (mock, no audio).
        const p = this.progressFn ? this.progressFn() : null;
        this.scrub = p == null ? (this.scrub + 0.012) % 1 : p;
        const sx = padX + this.scrub * gx;
        ctx.strokeStyle = cssvar('--hi', '#eeffcc'); ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10; ctx.shadowColor = cssvar('--hi', '#eeffcc');
        ctx.beginPath(); ctx.moveTo(sx, padY); ctx.lineTo(sx, H - padY); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        const values = this.playerPeaks?.samples;
        const yt = values?.length ? values[Math.min(values.length - 1, Math.floor(this.scrub * values.length))] : waveAt(this.scrub, this.player);
        ctx.fillStyle = cssvar('--hi', '#eeffcc');
        ctx.beginPath(); ctx.arc(sx, midY - yt * (gy / 2) * 0.86, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        this.scrub = 0;
      }

      this.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  ngOnDestroy(): void {
    this.mounted = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }
}

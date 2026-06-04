import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { readVar } from '../core/util';

@Component({
  selector: 'app-mini-scope',
  standalone: true,
  styles: [':host{display:block;width:100%}'],
  template: `
    <div class="scopebox" style="width:100%;overflow:hidden;line-height:0">
      <canvas #cv [style.display]="'block'" [style.width]="'100%'" [style.height.px]="height"></canvas>
    </div>
  `,
})
export class MiniScopeComponent implements AfterViewInit, OnDestroy {
  @Input() height = 72;
  @Input() seed = 1;
  @ViewChild('cv') cvRef!: ElementRef<HTMLCanvasElement>;

  private raf = 0;
  private mounted = true;
  private ro?: ResizeObserver;

  ngAfterViewInit(): void {
    const c = this.cvRef.nativeElement;
    const ctx = c.getContext('2d')!;
    let ph = this.seed;
    const cssv = (n: string, f: string) => readVar(n, f);

    const rs = () => {
      const r = c.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      c.width = Math.max(2, r.width) * dpr;
      c.height = this.height * dpr;
      c.style.width = r.width + 'px';
      c.style.height = this.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    rs();
    this.ro = new ResizeObserver(rs);
    this.ro.observe(c.parentElement!);

    const d = () => {
      if (!this.mounted) return;
      const W = c.clientWidth, H = this.height;
      ctx.clearRect(0, 0, W, H);
      const fg = cssv('--wave', '#bedc7f'), line = cssv('--line', '#305d42'), acc = cssv('--accent', '#89a257');
      ph += 0.045;
      ctx.fillStyle = line; ctx.globalAlpha = 0.35;
      for (let i = 0; i <= 20; i++) for (let j = 0; j <= 4; j++) ctx.fillRect((i / 20) * W, (j / 4) * H, 1, 1);
      ctx.globalAlpha = 0.5; ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x++) {
        const t = x / W;
        const y = H / 2 - (Math.sin(t * Math.PI * 7 + ph) * 0.6 + Math.sin(t * Math.PI * 3 - ph * 0.7) * 0.4) * Math.sin(t * Math.PI) * (H * 0.36);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = fg; ctx.lineWidth = 1.5; ctx.shadowBlur = 6; ctx.shadowColor = fg; ctx.stroke(); ctx.shadowBlur = 0;
      const sx = ((ph * 0.12) % 1) * W;
      ctx.strokeStyle = acc; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); ctx.globalAlpha = 1;
      this.raf = requestAnimationFrame(d);
    };
    d();
  }

  ngOnDestroy(): void {
    this.mounted = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }
}

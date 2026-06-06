import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SegComponent } from '../ui/seg.component';
import { ClockComponent } from '../ui/clock.component';
import { TelemetryComponent } from '../ui/telemetry.component';
import { BarsComponent } from '../ui/bars.component';
import { GlyphsComponent } from '../ui/glyphs.component';
import { HexStreamComponent } from '../ui/hex-stream.component';
import { GLYPHSET, hex } from '../core/util';

@Component({
  selector: 'app-chrome',
  standalone: true,
  imports: [CommonModule, SegComponent, ClockComponent, TelemetryComponent, BarsComponent, GlyphsComponent, HexStreamComponent],
  template: `
    <div class="app">
      <div class="head">
        <app-seg extraClass="seg" [segStyle]="{ flex: '0 0 auto' }">
          <span class="brand">DIAL<span class="dot"> </span>IN</span>
        </app-seg>
        <app-seg extraClass="seg" [segStyle]="{ flex: '1' }">
          <div class="headinfo" style="width:100%;justify-content:space-between">
            <span>SYS:<b> {{ status }}</b></span>
            <span>THEME:<b> {{ themeName }}</b></span>
            <span>BUF:<b> {{ statusCode }}</b></span>
            <span class="glow"><app-clock></app-clock></span>
          </div>
        </app-seg>
      </div>

      <div class="lrail rail">
        <app-seg title="SYS.MON">
          <app-telemetry [rows]="sysmon"></app-telemetry>
        </app-seg>
        <app-seg title="SPECTRUM" [segStyle]="{ flex: '0 0 auto' }">
          <app-bars [n]="14" [speed]="300"></app-bars>
        </app-seg>
        <app-seg title="GLYPH.SET" [segStyle]="{ flex: '1', minHeight: '0' }">
          <app-glyphs [count]="18" [seed]="2"></app-glyphs>
          <div style="margin-top:10px;font-size:9px;color:var(--dim);line-height:1.8">
            CH-{{ ch }}<br />{{ vec1 }}/{{ vec2 }}<br />VEC.{{ vec3 }}
          </div>
        </app-seg>
        <app-seg title="DATA.STREAM" [segStyle]="{ flex: '0 0 auto' }">
          <app-hex-stream [lines]="5" [speed]="140"></app-hex-stream>
        </app-seg>
      </div>

      <div class="main"><ng-content></ng-content></div>

      <div class="rrail rail"><ng-content select="[rightRail]"></ng-content></div>

      <div class="foot">
        <app-seg extraClass="seg" [segStyle]="{ flex: '1' }">
          <div class="keyhint">
            <span><kbd>TAB</kbd>MOVE</span>
            <span><kbd>↑↓←→</kbd>ADJUST</span>
            <span><kbd>ENTER</kbd>SELECT</span>
          </div>
          <span style="margin-left:auto;color:var(--dim)">{{ footerHint || 'DIAL IN // AUDIO PUZZLE TERMINAL' }}</span>
        </app-seg>
        <app-seg extraClass="seg" [segStyle]="{ flex: '0 0 auto' }">
          <span class="glyphs" style="font-size:12px">
            @for (g of footGlyphs; track $index) { <span>{{ g }}</span> }
          </span>
        </app-seg>
      </div>
    </div>
  `,
})
export class ChromeComponent {
  @Input() status = 'ONLINE';
  @Input() statusCode = '0x1A';
  @Input() footerHint?: string;
  @Input() theme = 'ammo8';

  readonly sysmon: [string, string][] = [
    ['CPU', '42%'], ['DSP', '0.91'], ['MEM', '7AE1'], ['VOX', 'SYNC'], ['NET', 'LOCAL'],
  ];
  readonly footGlyphs = GLYPHSET.slice(0, 7);
  readonly ch = hex(2);
  readonly vec1 = hex(4);
  readonly vec2 = hex(4);
  readonly vec3 = hex(3);

  get themeName(): string {
    return ({ ammo8: 'AMMO-8', oil6: 'OIL-6', twilight5: 'TWILIGHT-5' } as Record<string, string>)[this.theme] || 'AMMO-8';
  }
}

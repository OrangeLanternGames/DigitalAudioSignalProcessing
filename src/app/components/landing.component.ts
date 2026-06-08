import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChromeComponent } from './chrome.component';
import { SegComponent } from '../ui/seg.component';
import { TelemetryComponent } from '../ui/telemetry.component';
import { MiniScopeComponent } from '../ui/mini-scope.component';
import { GlobeComponent } from './globe.component';
import { Score } from '../core/dial-model';
import { hex } from '../core/util';

interface ThemeSwatch { name: string; cols: string[]; }
interface ModRow { name: string; note: string; delta: string; time: string; seed: number; }

const THEME_SWATCHES: Record<string, ThemeSwatch> = {
  ammo8:     { name: 'AMMO-8',     cols: ['#040c06', '#1e3a29', '#4d8061', '#89a257', '#bedc7f', '#eeffcc'] },
  oil6:      { name: 'OIL-6',      cols: ['#272744', '#494d7e', '#8b6d9c', '#c69fa5', '#f2d3ab', '#fbf5ef'] },
  twilight5: { name: 'TWILIGHT-5', cols: ['#292831', '#333f58', '#4a7a96', '#ee8695', '#fbbbad'] },
};
const THEME_ORDER = ['ammo8', 'oil6', 'twilight5'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, ChromeComponent, SegComponent, TelemetryComponent, MiniScopeComponent, GlobeComponent],
  template: `
    <app-chrome [theme]="theme" status="STANDBY" [statusCode]="code" footerHint="01 / LANDING TERMINAL">
      <app-seg rightRail title="SCOREBOARD" [right]="'TOP ' + min10" [segStyle]="{ flex: '0 0 auto' }">
        <div class="scores">
          @if (scores.length === 0) {
            <div class="dim" style="font-size:9px;padding:8px 0">NO RECORDS // BE FIRST</div>
          }
          @for (s of scores.slice(0, 10); track $index; let i = $index) {
            <div class="sc" [class.new]="s.isNew">
              <span class="rk">{{ pad2(i + 1) }}</span>
              <span class="nm">{{ s.name }}</span>
              <span class="pt">{{ s.pct.toFixed(1) }}</span>
            </div>
          }
        </div>
      </app-seg>

      <app-seg rightRail title="LAST.MODIFIED" [right]="'×' + recent.length"
               [segStyle]="{ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' }">
        <div class="modlist scrolly">
          @for (r of recent; track $index) {
            <div class="modrow">
              <div class="modscope"><app-mini-scope [height]="26" [seed]="r.seed"></app-mini-scope></div>
              <div class="modmeta">
                <div class="mr-row"><span class="mr-name">{{ r.name }}</span><span class="mr-delta">{{ r.delta }}</span></div>
                <div class="mr-row mr-sub"><span>{{ r.note }}</span><span>MOD {{ r.time }}</span></div>
              </div>
            </div>
          }
        </div>
      </app-seg>

      <app-seg rightRail title="DSP.CHAIN" [segStyle]="{ flex: '0 0 auto' }">
        <div class="chain">
          @for (n of chainNodes; track n; let i = $index) {
            <span class="node" [class.hot]="i === 2">{{ n }}</span>
            @if (i < 4) { <span class="link">›</span> }
          }
        </div>
        <app-telemetry [rows]="dspRows"></app-telemetry>
      </app-seg>

      <app-seg rightRail title="CARTRIDGE" [segStyle]="{ flex: '0 0 auto' }">
        <app-telemetry [rows]="cartRows"></app-telemetry>
      </app-seg>

      <div #main class="land-grid">
        <div class="land-left">
          <div class="logo-lock">
            <div data-anim class="kicker">NULLWAVE AUDIO SYSTEMS // CLASSIC MODE</div>
            <h1 data-anim>DIAL<br />IN<span style="color:var(--accent)">_</span></h1>
            <div data-anim class="sub">TUNE THE SIGNAL BACK TO ORIGIN. LISTEN THREE TIMES. THEN DIAL IT IN BY EAR.</div>
          </div>

          <div data-anim class="menu-actions">
            <button class="menu-item focusable" [class.sel]="sel === 0"
                    (click)="play.emit()" (mouseenter)="sel = 0" id="play-btn">PLAY</button>
            <button class="menu-item focusable" [class.on]="settings" [class.sel]="sel === 1"
                    (click)="settings = !settings" (mouseenter)="sel = 1" [attr.aria-expanded]="settings">SETTINGS</button>
          </div>

          @if (settings) {
            <div class="settings-pop">
              <app-seg title="MASTER.VOL" [right]="volume + '%'">
                <div class="slider">
                  <input type="range" min="0" max="100" [value]="volume" class="focusable"
                         (input)="setVolume.emit(+$any($event.target).value)" aria-label="Master volume" />
                  <div class="meter" style="margin-top:4px"><i [style.width.%]="volume"></i></div>
                </div>
              </app-seg>
              <app-seg title="UI.THEME">
                <div class="themepick">
                  @for (k of themeOrder; track k; let idx = $index) {
                    <div class="swrow focusable" [class.on]="theme === k" role="button" tabindex="0"
                         (click)="setTheme.emit(k)" (keydown)="themeKey($event, idx)">
                      <div class="swatches">
                        @for (c of swatches[k].cols; track $index) { <i [style.background]="c"></i> }
                      </div>
                      <span class="nm">{{ theme === k ? '▸ ' : '' }}{{ swatches[k].name }}</span>
                    </div>
                  }
                </div>
              </app-seg>
            </div>
          }
        </div>

        <div data-anim class="land-globe">
          <div class="globe-stage">
            <div class="globe-reticle">
              <span class="rt tl"></span><span class="rt tr"></span>
              <span class="rt bl"></span><span class="rt br"></span>
              <span class="tick n"></span><span class="tick s"></span>
              <span class="tick e"></span><span class="tick w"></span>
              <span class="orbit"></span>
            </div>
            <div class="globe-gauge">
              @for (g of gaugeTicks; track $index; let i = $index) {
                <span class="gt" [class.maj]="i % 4 === 0"></span>
              }
            </div>
            <app-globe [size]="globeSize" [dense]="true"></app-globe>
          </div>
        </div>
      </div>
    </app-chrome>
  `,
})
export class LandingComponent implements AfterViewInit {
  @Input() theme = 'ammo8';
  @Input() volume = 70;
  @Input() scores: Score[] = [];
  @Output() play = new EventEmitter<void>();
  @Output() setTheme = new EventEmitter<string>();
  @Output() setVolume = new EventEmitter<number>();
  @ViewChild('main') main!: ElementRef<HTMLElement>;

  settings = false;
  sel = 0;
  code = hex(4);
  swatches = THEME_SWATCHES;
  themeOrder = THEME_ORDER;
  chainNodes = ['OSC', 'FLT', 'PHS', 'HRM', 'OUT'];
  gaugeTicks = Array.from({ length: 13 });
  globeSize = Math.min(440, window.innerWidth * 0.30 + 150);

  readonly dspRows: [string, string][] = [['BUFFER', '512sa'], ['LATENCY', '5.8ms'], ['CLK', '44.1k']];
  readonly cartRows: [string, string][] = [['TRACK', 'SINE_07'], ['LEN', '00:32'], ['MODE', 'CLASSIC']];

  readonly recent: ModRow[] = [
    { name: 'SINE_07',  note: 'PHASE TRIM', delta: '+3.0dB', time: '00:14', seed: 3 },
    { name: 'SWEEP_03', note: 'HARM BOOST', delta: '−1.5dB', time: '04:22', seed: 6 },
    { name: 'NOISE_12', note: 'DRIVE CUT',  delta: '+0.0dB', time: '11:09', seed: 9 },
    { name: 'PULSE_01', note: 'FREQ LOCK',  delta: '+2.2dB', time: '27:41', seed: 2 },
  ];

  get min10(): number {
    return Math.min(10, this.scores.length);
  }
  pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  ngAfterViewInit(): void {
    this.main.nativeElement.querySelectorAll<HTMLElement>('[data-anim]').forEach((el, i) => {
      el.style.animationDelay = 0.06 + i * 0.07 + 's';
      el.classList.add('enter');
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || (t.closest && t.closest('.settings-pop'))) return;
    const btns = this.main ? Array.from(this.main.nativeElement.querySelectorAll<HTMLElement>('.menu-item')) : [];
    if (!btns.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.sel = (this.sel + 1) % btns.length; }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.sel = (this.sel - 1 + btns.length) % btns.length; }
    else if (e.key === 'Enter') { e.preventDefault(); btns[this.sel] && btns[this.sel].click(); }
  }

  themeKey(e: KeyboardEvent, idx: number): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.setTheme.emit(THEME_ORDER[(idx + 1) % 3]); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.setTheme.emit(THEME_ORDER[(idx + 2) % 3]); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.setTheme.emit(THEME_ORDER[idx]); }
  }
}

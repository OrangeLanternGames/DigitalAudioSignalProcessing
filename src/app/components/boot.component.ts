import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobeComponent } from './globe.component';
import { hex } from '../core/util';

interface BootLine { t: string; c: string; }

const BOOT_LINES: BootLine[] = [
  { t: 'DIAL-IN BIOS v3.7  (c)1994 NULLWAVE SYS', c: 'dim' },
  { t: 'POST ........................... [ OK ]', c: '' },
  { t: 'INIT AUDIO CORTEX .............. [ OK ]', c: '' },
  { t: 'MOUNT DSP MODULES .............. [ OK ]', c: '' },
  { t: '  > freq.dsp  amp.dsp  phase.dsp', c: 'dim' },
  { t: '  > harm.dsp  drive.dsp', c: 'dim' },
  { t: 'CALIBRATING OSCILLATORS ........ [ OK ]', c: '' },
  { t: 'SCANLINE SYNC @ 60HZ ........... [ OK ]', c: '' },
  { t: 'GEO RENDERER / THREE.JS ........ [ OK ]', c: '' },
  { t: 'MOUNT /var/scoreboard .......... [ OK ]', c: '' },
  { t: 'ALLOCATING SPECTRUM BUFFERS ....', c: '' },
  { t: 'SIGNAL LOCK ACQUIRED', c: 'hi' },
  { t: 'SYSTEM READY.', c: 'hi' },
];

@Component({
  selector: 'app-boot',
  standalone: true,
  imports: [CommonModule, GlobeComponent],
  template: `
    <div class="boot" (click)="onClick()">
      <div>
        <div class="term">
          @for (l of lines; track $index; let i = $index) {
            @if (i <= li) {
              <div [class.dim]="l.c === 'dim'">
                <span [class.hi]="l.c === 'hi'">{{ typed[i] }}</span>
                @if (i === li && !ready) { <span class="cur"></span> }
              </div>
            }
          }
          @if (ready) {
            <div style="margin-top:10px" class="hi">PRESS [ENTER] TO ENGAGE<span class="cur"></span></div>
          }
        </div>
        <div class="bootbar" style="max-width:420px">
          <div class="spread" style="font-size:9px;color:var(--dim);margin-bottom:5px">
            <span>LOADING SUBSYSTEMS</span><span>{{ progress }}%</span>
          </div>
          <div class="meter"><i [style.width.%]="progress"></i></div>
        </div>
      </div>
      <div class="globe-wrap">
        <div style="text-align:center">
          <app-globe [size]="globeSize" [dense]="true" [speed]="0.006"></app-globe>
          <div style="font-size:9px;color:var(--dim);margin-top:12px;letter-spacing:2px">
            GEO-SPECTRUM CORE // {{ coreA }}-{{ coreB }}
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BootComponent implements OnInit, OnDestroy {
  @Output() done = new EventEmitter<void>();

  lines = BOOT_LINES;
  typed: string[] = Array(BOOT_LINES.length).fill('');
  li = 0;
  ci = 0;
  ready = false;

  globeSize = Math.min(380, window.innerWidth * 0.30);
  coreA = hex(4);
  coreB = hex(4);

  private skip = false;
  private called = false;
  private timer: any;
  private readyTimer: any;

  ngOnInit(): void {
    this.step();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    clearTimeout(this.readyTimer);
  }

  get progress(): number {
    return Math.min(100, Math.round(((this.li + this.ci / 40) / BOOT_LINES.length) * 100));
  }

  private step(): void {
    clearTimeout(this.timer);
    if (this.ready) return;
    if (this.li >= BOOT_LINES.length) {
      this.ready = true;
      this.readyTimer = setTimeout(() => this.finish(), 1400);
      return;
    }
    const line = BOOT_LINES[this.li].t;
    if (this.ci <= line.length) {
      const speed = this.skip ? 2 : 8 + Math.random() * 22;
      const delay = this.ci === 0 ? (this.skip ? 2 : 120) : speed;
      this.timer = setTimeout(() => {
        this.typed[this.li] = line.slice(0, this.ci);
        this.ci++;
        this.step();
      }, delay);
    } else {
      this.timer = setTimeout(() => {
        this.li++;
        this.ci = 0;
        this.step();
      }, this.skip ? 2 : 90);
    }
  }

  private finish(): void {
    if (this.called) return;
    this.called = true;
    this.done.emit();
  }

  onClick(): void {
    if (this.ready) this.finish();
    else this.skip = true;
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.ready) {
      if (e.key === 'Enter' || e.key === ' ') this.finish();
    } else {
      this.skip = true;
    }
  }
}

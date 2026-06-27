import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChromeComponent } from './chrome.component';
import { SegComponent } from '../ui/seg.component';
import { GlyphsComponent } from '../ui/glyphs.component';
import { DIFF_META, Difficulty } from '../core/dial-model';
import { hex } from '../core/util';

@Component({
  selector: 'app-difficulty',
  standalone: true,
  imports: [CommonModule, ChromeComponent, SegComponent, GlyphsComponent],
  template: `
    <app-chrome [theme]="theme" status="SELECT" [statusCode]="code" footerHint="02 / DIFFICULTY">
      <app-seg rightRail title="BRIEFING" [segStyle]="{ flex: '1' }">
        <div style="font-size:9px;color:var(--fg);line-height:1.9">
          PICK A<br />MANIPULATION.<br /><br />
          <span class="dim">EACH FILTER ADDS<br />ITS OWN SLIDERS TO<br />DIAL IN BY EAR.</span>
        </div>
      </app-seg>
      <app-seg rightRail title="GLYPH" [segStyle]="{ flex: '0 0 auto' }">
        <app-glyphs [count]="12" [seed]="4"></app-glyphs>
      </app-seg>

      <div #wrap style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:22px">
        <div>
          <div style="font-size:10px;color:var(--dim);letter-spacing:3px;margin-bottom:8px">SELECT MANIPULATION</div>
          <div class="brand" style="font-size:22px">CHOOSE YOUR MANIPULATION</div>
        </div>
        <div class="diffs">
          @for (k of order; track k; let i = $index) {
            <div class="diff focusable" [class.on]="sel === i" tabindex="0"
                 (click)="choose(k)" (mouseenter)="sel = i" (focus)="sel = i"
                 (keydown.enter)="choose(k)">
              <span class="reg tl"></span><span class="reg tr"></span>
              <span class="reg bl"></span><span class="reg br"></span>
              <h3>{{ meta[k].name }}</h3>
              <div class="meta">
                {{ meta[k].label }}<br />
                @for (l of descLines(k); track $index) { <span>{{ l }}<br /></span> }
              </div>
              <div class="dots">
                @for (d of [0, 1, 2, 3, 4]; track d) { <b [class.f]="d < meta[k].sliders"></b> }
              </div>
              <div style="margin-top:12px;font-size:9px;color:var(--accent)">
                {{ meta[k].sliders }} SLIDER{{ meta[k].sliders > 1 ? 'S' : '' }} ▸
              </div>
            </div>
          }
        </div>

        <div>
          <div style="font-size:10px;color:var(--dim);letter-spacing:3px;margin-bottom:10px">RANDOM</div>
          <div class="diffs">
            <div class="diff focusable" [class.on]="sel === order.length" tabindex="0"
                 (click)="choose(randomKey)" (mouseenter)="sel = order.length" (focus)="sel = order.length"
                 (keydown.enter)="choose(randomKey)">
              <span class="reg tl"></span><span class="reg tr"></span>
              <span class="reg bl"></span><span class="reg br"></span>
              <h3>{{ meta[randomKey].name }}</h3>
              <div class="meta">
                {{ meta[randomKey].label }}<br />
                @for (l of descLines(randomKey); track $index) { <span>{{ l }}<br /></span> }
              </div>
              <div style="margin-top:12px;font-size:9px;color:var(--accent)">TWO FILTERS COMBINED ▸</div>
            </div>
            <div class="diff focusable" [class.on]="sel === order.length + 1" tabindex="0"
                 (click)="choose(allKey)" (mouseenter)="sel = order.length + 1" (focus)="sel = order.length + 1"
                 (keydown.enter)="choose(allKey)">
              <span class="reg tl"></span><span class="reg tr"></span>
              <span class="reg bl"></span><span class="reg br"></span>
              <h3>{{ meta[allKey].name }}</h3>
              <div class="meta">
                {{ meta[allKey].label }}<br />
                @for (l of descLines(allKey); track $index) { <span>{{ l }}<br /></span> }
              </div>
              <div style="margin-top:12px;font-size:9px;color:var(--accent)">ALL FILTERS COMBINED ▸</div>
            </div>
          </div>
        </div>

        <div style="font-size:9px;color:var(--dim)">← → NAVIGATE // ENTER ENGAGE // ESC BACK</div>
      </div>
    </app-chrome>
  `,
})
export class DifficultyComponent implements AfterViewInit {
  @Input() theme = 'ammo8';
  @Output() selected = new EventEmitter<Difficulty>();
  @Output() back = new EventEmitter<void>();
  @ViewChild('wrap') wrap!: ElementRef<HTMLElement>;

  order: Difficulty[] = ['eq4', 'chorus', 'echo', 'distortion'];
  randomKey: Difficulty = 'random';
  allKey: Difficulty = 'all';
  meta = DIFF_META;
  sel = 0;
  code = hex(4);

  // All selectable cells: the three single filters, the random pair, then all filters.
  get cells(): Difficulty[] { return [...this.order, this.randomKey, this.allKey]; }

  ngAfterViewInit(): void {
    this.wrap.nativeElement.querySelectorAll<HTMLElement>('.diff').forEach((el, i) => {
      el.style.animationDelay = 0.08 + i * 0.09 + 's';
      el.classList.add('enter');
    });
  }

  choose(k: Difficulty): void {
    this.selected.emit(k);
  }

  descLines(k: Difficulty): string[] {
    return this.meta[k].desc.split('\n');
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const n = this.cells.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.sel = (this.sel + 1) % n; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.sel = (this.sel + n - 1) % n; }
    if (e.key === 'Enter') { e.preventDefault(); this.choose(this.cells[this.sel]); }
    if (e.key === 'Escape') this.back.emit();
  }
}

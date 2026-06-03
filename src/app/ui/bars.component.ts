import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-bars',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bars">
      @for (v of h; track $index) {
        <i [style.height.%]="15 + v * 85" [style.opacity]="0.4 + v * 0.6"></i>
      }
    </div>
  `,
})
export class BarsComponent implements OnInit, OnDestroy {
  @Input() n = 16;
  @Input() speed = 380;
  h: number[] = [];
  private id: any;

  ngOnInit(): void {
    this.h = Array.from({ length: this.n }, () => Math.random());
    this.id = setInterval(() => {
      const nx = this.h.slice(1);
      nx.push(Math.random());
      this.h = nx;
    }, this.speed);
  }
  ngOnDestroy(): void {
    clearInterval(this.id);
  }
}

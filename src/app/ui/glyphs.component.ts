import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GLYPHSET } from '../core/util';

@Component({
  selector: 'app-glyphs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="glyphs">
      @for (g of items; track $index) { <span>{{ g }}</span> }
    </div>
  `,
})
export class GlyphsComponent implements OnInit {
  @Input() count = 10;
  @Input() seed = 0;
  items: string[] = [];

  ngOnInit(): void {
    this.items = Array.from(
      { length: this.count },
      (_, i) => GLYPHSET[(i * 7 + this.seed * 3 + 3) % GLYPHSET.length],
    );
  }
}

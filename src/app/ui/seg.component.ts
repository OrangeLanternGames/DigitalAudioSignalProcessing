import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-seg',
  standalone: true,
  imports: [CommonModule],
  styles: [':host{display:contents}'],
  template: `
    <div class="seg" [class.flush]="flush" [ngClass]="extraClass" [ngStyle]="mergedStyle">
      <span class="reg tl"></span><span class="reg tr"></span>
      <span class="reg bl"></span><span class="reg br"></span>
      @if (brackets) {
        <span class="brk tl"></span><span class="brk tr"></span>
        <span class="brk bl"></span><span class="brk br"></span>
      }
      @if (title) {
        <div class="seg-h">
          <span>{{ title }}</span>
          @if (right) { <span style="flex:none;color:var(--fg)">{{ right }}</span> }
        </div>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class SegComponent {
  @Input() title?: string;
  @Input() right?: string;
  @Input() flush = false;
  @Input() brackets = false;
  @Input() extraClass = '';
  @Input() segStyle: { [k: string]: string } = {};

  get mergedStyle() {
    return this.segStyle;
  }
}

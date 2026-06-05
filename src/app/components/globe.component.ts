import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { readVar } from '../core/util';

@Component({
  selector: 'app-globe',
  standalone: true,
  template: `
    <div #mount [style.width.px]="size" [style.height.px]="size"
         style="filter:drop-shadow(0 0 8px color-mix(in srgb, var(--fg) 55%, transparent))"></div>
  `,
})
export class GlobeComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() size = 230;
  @Input() speed = 0.0035;
  @Input() dense = false;
  @ViewChild('mount') mountRef!: ElementRef<HTMLDivElement>;

  private raf = 0;
  private mounted = false;
  private cleanup?: () => void;

  ngAfterViewInit(): void {
    this.build();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (this.mountRef && (ch['size'] || ch['speed'] || ch['dense']) && !ch['size']?.firstChange) {
      this.teardown();
      this.build();
    }
  }

  private build(): void {
    const mount = this.mountRef.nativeElement;
    this.mounted = true;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(this.size, this.size);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3.1;

    const group = new THREE.Group();
    scene.add(group);

    const colHex = () => new THREE.Color(readVar('--fg', '#bedc7f'));
    const accHex = () => new THREE.Color(readVar('--accent', '#89a257'));

    const segs = this.dense ? 22 : 16;
    const geo = new THREE.SphereGeometry(1, segs, segs);
    const wire = new THREE.WireframeGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: colHex(), transparent: true, opacity: 0.55 });
    const sphere = new THREE.LineSegments(wire, mat);
    group.add(sphere);

    const ringMat = new THREE.LineBasicMaterial({ color: accHex(), transparent: true, opacity: 0.9 });
    const rings = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const r = new THREE.RingGeometry(0.995, 1.0, 48);
      const pts: THREE.Vector3[] = [];
      const pos = r.attributes['position'] as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) pts.push(new THREE.Vector3(pos.getX(j), pos.getY(j), 0));
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineLoop(lg, ringMat);
      line.rotation.x = (i / 3) * Math.PI;
      line.rotation.y = (i / 3) * Math.PI * 0.5;
      rings.add(line);
    }
    group.add(rings);

    const pgeo = new THREE.SphereGeometry(1, 10, 8);
    const pmat = new THREE.PointsMaterial({ color: colHex(), size: 0.045, transparent: true, opacity: 0.9 });
    const ptsObj = new THREE.Points(pgeo, pmat);
    group.add(ptsObj);

    group.rotation.x = 0.4;

    const tick = () => {
      if (!this.mounted) return;
      group.rotation.y += this.speed;
      rings.rotation.z += this.speed * 0.6;
      mat.color.copy(colHex()); pmat.color.copy(colHex()); ringMat.color.copy(accHex());
      renderer.render(scene, camera);
      this.raf = requestAnimationFrame(tick);
    };
    tick();

    this.cleanup = () => {
      geo.dispose(); wire.dispose(); mat.dispose(); pgeo.dispose(); pmat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }

  private teardown(): void {
    this.mounted = false;
    cancelAnimationFrame(this.raf);
    this.cleanup?.();
    this.cleanup = undefined;
  }

  ngOnDestroy(): void {
    this.teardown();
  }
}

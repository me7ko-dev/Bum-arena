/**
 * Околната среда: небе, море далеч долу, облаци и малки островчета, светлини.
 * И арената – висяща платформа с шарен под, раирана рамка и скала отдолу.
 */
import * as THREE from 'three';
import type { Arena } from '@bum/shared';

// ───────────── Небе, море, облаци ─────────────

export function buildSky(scene: THREE.Scene): void {
  const top = new THREE.Color(0x3d8bff);
  const horizon = new THREE.Color(0xbfe6ff);
  const geo = new THREE.SphereGeometry(9000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: top }, horizon: { value: horizon } },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
      void main(){ float h = clamp(normalize(vPos).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xbfe6ff, 3200, 8500);

  // Море далеч долу.
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2bb3d9 }),
  );
  sea.position.y = -1400;
  scene.add(sea);
}

/** Облачета и островчета наоколо – само атмосфера. Връща функция за анимиране. */
export function buildScenery(scene: THREE.Scene): (dt: number) => void {
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const n = 3 + (i % 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(70 + ((i * 37 + k * 53) % 60), 1), cloudMat);
      m.position.set((k - n / 2) * 80, ((k * 29) % 30) - 10, ((k * 41) % 50) - 25);
      g.add(m);
    }
    const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2;
    const r = 2000 + ((i * 271) % 1400);
    g.position.set(Math.cos(a) * r, -350 + ((i * 113) % 600), Math.sin(a) * r);
    g.scale.setScalar(0.8 + ((i * 7) % 5) * 0.15);
    g.userData.speed = 0.01 + (i % 4) * 0.004;
    scene.add(g);
    clouds.push(g);
  }

  // Малки островчета с дървета.
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x9a7b5f, flatShading: true });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x69db7c, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a3c });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x40c057, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const r = 160 + (i % 3) * 60;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.4, 7), rockMat);
    rock.rotation.x = Math.PI;
    rock.position.y = -r * 0.7;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 30, 7), grassMat);
    g.add(rock, grass);
    for (let t = 0; t < 2; t++) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 70, 6), trunkMat);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(52, 0), leafMat);
      trunk.position.set((t - 0.5) * r * 0.8, 50, 0);
      crown.position.set((t - 0.5) * r * 0.8, 105, 0);
      g.add(trunk, crown);
    }
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const d = 2600 + (i % 2) * 900;
    g.position.set(Math.cos(a) * d, -500 - (i % 3) * 220, Math.sin(a) * d);
    scene.add(g);
  }

  let t = 0;
  return (dt: number) => {
    t += dt;
    for (const c of clouds) {
      const s = c.userData.speed as number;
      const x = c.position.x;
      const z = c.position.z;
      const ca = Math.cos(s * dt);
      const sa = Math.sin(s * dt);
      c.position.x = x * ca - z * sa;
      c.position.z = x * sa + z * ca;
      c.position.y += Math.sin(t * 0.5 + x) * 0.05;
    }
  };
}

export function buildLights(scene: THREE.Scene): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x9a86c9, 1.25));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
  sun.position.set(-600, 1400, 900);
  scene.add(sun);
  return sun;
}

// ───────────── Арена ─────────────

/** Шареният под (радиални сектори + пръстени), изпечен в текстура. */
function floorTexture(): THREE.Texture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const R = S / 2;
  // Меки, не крещящи цветове – героите трябва да изпъкват на пода.
  const rings = [
    { r: 1.0, a: '#7fd6f2', b: '#73cdea' },
    { r: 0.8, a: '#ffe28a', b: '#ffda73' },
    { r: 0.62, a: '#ffb3cf', b: '#ffa6c6' },
    { r: 0.44, a: '#c3b8ff', b: '#b8acff' },
    { r: 0.26, a: '#ffffff', b: '#f3f0ff' },
  ];
  const sectors = 16;
  for (const ring of rings) {
    for (let i = 0; i < sectors; i++) {
      g.beginPath();
      g.moveTo(cx, cx);
      g.arc(cx, cx, R * ring.r, (i / sectors) * Math.PI * 2, ((i + 1) / sectors) * Math.PI * 2);
      g.closePath();
      g.fillStyle = i % 2 === 0 ? ring.a : ring.b;
      g.fill();
    }
    // Тънка бяла линия между пръстените.
    g.beginPath();
    g.arc(cx, cx, R * ring.r - 3, 0, Math.PI * 2);
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.stroke();
  }
  // Звезда в центъра.
  g.save();
  g.translate(cx, cx);
  g.fillStyle = '#ffd23f';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 70 : 30;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Червено-бели ивици за рамката на платформата. */
function stripeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? '#ff3b5c' : '#ffffff';
    g.beginPath();
    g.moveTo(i * 32, 32);
    g.lineTo(i * 32 + 32, 32);
    g.lineTo(i * 32 + 48, 0);
    g.lineTo(i * 32 + 16, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(40, 1);
  return t;
}

export class Arena3D {
  readonly group = new THREE.Group();
  private platform = new THREE.Group();
  private danger: THREE.Mesh;
  private dangerMat: THREE.MeshBasicMaterial;
  private edgeLine: THREE.Mesh;
  private lastInner = -1;
  private lastOuter = -1;

  constructor(scene: THREE.Scene) {
    const RIM = 36;
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: floorTexture() }),
    );
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, RIM, 96, 1, true).translate(0, -RIM / 2, 0),
      new THREE.MeshLambertMaterial({ map: stripeTexture() }),
    );
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 18, 3).rotateX(Math.PI).translate(0, -0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0xa17c5b, flatShading: true }),
    );
    rock.position.y = -RIM;
    rock.userData.rock = true;
    this.platform.add(top, rim, rock);
    this.group.add(this.platform);

    this.dangerMat = new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.35, depthWrite: false });
    this.danger = new THREE.Mesh(new THREE.BufferGeometry(), this.dangerMat);
    this.danger.position.y = 1.5;
    this.danger.renderOrder = 2;
    this.group.add(this.danger);
    this.edgeLine = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 128).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
    );
    this.edgeLine.position.y = 2;
    this.group.add(this.edgeLine);
    scene.add(this.group);
  }

  update(arena: Arena, time: number, warnSeconds: number, active: boolean): void {
    const r = arena.radius;
    this.platform.position.set(arena.x, 0, arena.y);
    // Подът и рамката се мащабират само по X/Z; скалата отдолу е пропорционална.
    for (const m of this.platform.children) {
      if (m.userData.rock) m.scale.set(r * 0.92, r * 0.75, r * 0.92);
      else m.scale.set(r, 1, r);
    }
    const warn = active && (arena.shrinking || (arena.shrinkIn >= 0 && arena.shrinkIn <= warnSeconds));
    const show = warn && arena.nextRadius < r - 1;
    this.danger.visible = show;
    this.edgeLine.visible = show;
    if (show) {
      // Пръстенът се преизчислява само при промяна (евтино).
      if (Math.abs(this.lastInner - arena.nextRadius) > 0.5 || Math.abs(this.lastOuter - r) > 0.5) {
        this.danger.geometry.dispose();
        this.danger.geometry = new THREE.RingGeometry(arena.nextRadius, r, 128).rotateX(-Math.PI / 2);
        this.lastInner = arena.nextRadius;
        this.lastOuter = r;
      }
      this.danger.position.set(arena.x, 1.5, arena.y);
      const pulse = 0.5 + 0.5 * Math.sin(time * (arena.shrinking ? 14 : 8));
      this.dangerMat.opacity = 0.25 + pulse * 0.3;
      this.edgeLine.position.set(arena.x, 2, arena.y);
      this.edgeLine.scale.setScalar(arena.nextRadius);
    }
  }
}

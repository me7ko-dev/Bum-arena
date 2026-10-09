/**
 * Стилизирано море далеч под арената: два тона вълни + бели линии от пяна,
 * които бавно се движат. Един евтин шейдър (без текстури), с мъгла.
 */
import * as THREE from 'three';

/** Височина на водата (арената е на 0). */
export const WATER_Y = -1400;

export class Water {
  readonly mesh: THREE.Mesh;
  private uniforms: { uTime: { value: number } };

  constructor(scene: THREE.Scene) {
    const fog = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: {
        ...fog,
        ...this.uniforms,
        uDeep: { value: new THREE.Color(0x1688d0) },
        uShallow: { value: new THREE.Color(0x3cc8ee) },
        uFoam: { value: new THREE.Color(0xf2fdff) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vXZ = wp.xz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        varying vec2 vXZ;
        #include <fog_pars_fragment>
        // Сума от изкривени синусоиди – „вълни“ без шум и текстури.
        float waves(vec2 p, float t) {
          float w = sin(p.x * 1.1 + t * 0.55 + sin(p.y * 1.3 + t * 0.35) * 1.3);
          w += sin(p.y * 0.95 - t * 0.45 + sin(p.x * 0.8 - t * 0.2) * 1.5);
          w += 0.5 * sin((p.x + p.y) * 2.1 + t * 0.9);
          return w;
        }
        void main() {
          vec2 p = vXZ * 0.0016;
          float t = uTime;
          float w = waves(p, t);
          // Два тона с мек преход.
          float tone = smoothstep(-0.15, 0.15, w);
          vec3 col = mix(uDeep, uShallow, tone);
          // Пяна: тънки линии по „гребените“ (изолинии на вълните).
          float foam = 1.0 - smoothstep(0.0, 0.07, abs(w - 1.35));
          foam += 0.6 * (1.0 - smoothstep(0.0, 0.05, abs(w + 0.9)));
          // Проблясъци – малки петна, които мигат.
          float sp = sin(vXZ.x * 0.017 + t * 1.7 + sin(vXZ.y * 0.006) * 3.0) * sin(vXZ.y * 0.015 - t * 1.3 + sin(vXZ.x * 0.005) * 3.0);
          foam += smoothstep(0.975, 0.995, sp) * 0.7 * tone;
          col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2), mat);
    this.mesh.position.y = WATER_Y;
    scene.add(this.mesh);
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
  }
}

/**
 * Снимки (миниатюри) на 3D героите за менюто. Рисуват се веднъж при зареждане
 * с отделен малък рендър, който после се освобождава.
 */
import * as THREE from 'three';
import { CharacterView } from './Character';

export function renderSkinThumbnails(skins: readonly string[], size = 192): Map<string, string> {
  const out = new Map<string, string>();
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out; // без WebGL – менюто остава с емоджитата
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x9a86c9, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
  sun.position.set(-60, 140, 120);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  camera.position.set(0, 64, 168);
  camera.lookAt(0, 46, 0);

  for (const skin of skins) {
    // Facing π/2 = „надолу“ в играта = към камерата.
    const view = new CharacterView(skin, false, Math.PI / 2);
    view.root.rotation.y = -0.35; // леко завъртян – изглежда по-обемно
    scene.add(view.root);
    renderer.render(scene, camera);
    out.set(skin, renderer.domElement.toDataURL('image/png'));
    scene.remove(view.root);
    view.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

// Módulo 3: estética de xilogravura. Cel-shading em 3 tons + contorno preto
// por casco invertido (malha duplicada, BackSide, um pouco maior).

import * as THREE from 'three';
import type { MaterialLook } from './styles';

/** Rampa de tons sem interpolação: é isso que deixa a sombra "chapada". */
function makeGradientMap(levels: number[]): THREE.DataTexture {
  const tones = new Uint8Array(levels.flatMap((v) => [v, v, v, 255]));
  const tex = new THREE.DataTexture(tones, levels.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const GRADIENTS = {
  toon2: makeGradientMap([95, 255]),
  toon3: makeGradientMap([70, 165, 255]),
  toon5: makeGradientMap([60, 110, 160, 210, 255]),
};
export const gradientMap = GRADIENTS.toon3;

/** Visual atual do 3D (styles.ts): define o material e o contorno das peças novas. */
let look: MaterialLook = { shading: 'toon3', outline: 1, outlineColor: '#000000' };

export function setMaterialLook(next: MaterialLook): void {
  look = next;
}

const materialCache = new Map<string, THREE.Material>();

/** Material compartilhado por cor e visual (nunca descartado: vive com o app). */
export function toonMaterial(color: string): THREE.Material {
  const key = `${look.shading}|${color}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = look.shading === 'smooth'
      ? new THREE.MeshLambertMaterial({ color })
      : new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTS[look.shading] });
    mat.userData.shared = true;
    materialCache.set(key, mat);
  }
  return mat;
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();

function outlineMaterial(): THREE.MeshBasicMaterial {
  let mat = outlineCache.get(look.outlineColor);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: look.outlineColor, side: THREE.BackSide });
    mat.userData.shared = true;
    outlineCache.set(look.outlineColor, mat);
  }
  return mat;
}

export const OUTLINE_WIDTH = 0.035;

/**
 * Casco invertido com espessura uniforme: em vez de um fator de escala único
 * (que engrossa o contorno em peças compridas), cada eixo cresce o necessário
 * para somar `width` de cada lado, em torno do centro da caixa da geometria.
 */
export function addOutline(mesh: THREE.Mesh, baseWidth = OUTLINE_WIDTH): void {
  const width = baseWidth * look.outline;
  if (width <= 0) return;
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // a espessura é dada em unidades de mundo: desconta a escala do próprio mesh
  const sx = 1 + (2 * width) / Math.max(size.x * Math.abs(mesh.scale.x), 1e-3);
  const sy = 1 + (2 * width) / Math.max(size.y * Math.abs(mesh.scale.y), 1e-3);
  const sz = 1 + (2 * width) / Math.max(size.z * Math.abs(mesh.scale.z), 1e-3);

  const hull = new THREE.Mesh(geo, outlineMaterial());
  hull.scale.set(sx, sy, sz);
  hull.position.set(center.x * (1 - sx), center.y * (1 - sy), center.z * (1 - sz));
  hull.userData.isOutline = true;
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
}

export interface PartOptions {
  outline?: boolean;
  outlineWidth?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Cria uma peça toon com contorno e sombra: o tijolo de todos os AssetBuilders. */
export function part(
  geometry: THREE.BufferGeometry,
  color: string,
  options: PartOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toonMaterial(color));
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  if (options.outline !== false) addOutline(mesh, options.outlineWidth);
  return mesh;
}

/** Libera geometrias e materiais não compartilhados de uma subárvore. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of materials) {
      if (!mat.userData.shared) mat.dispose();
    }
    const light = obj as THREE.DirectionalLight;
    if (light.isLight && light.shadow?.map) light.shadow.map.dispose();
  });
}

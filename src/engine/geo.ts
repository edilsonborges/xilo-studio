// Ajudantes de geometria usados por todos os objetos de cenário.

import * as THREE from 'three';

export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);

/** Normais por face: sem isso cilindros e cones ficam com sombreado liso. */
export function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  if (g !== geo) geo.dispose();
  return g;
}

export const cyl = (rTop: number, rBottom: number, h: number, seg = 6): THREE.BufferGeometry =>
  flat(new THREE.CylinderGeometry(rTop, rBottom, h, seg));

export const cone = (r: number, h: number, seg = 6): THREE.BufferGeometry => flat(new THREE.ConeGeometry(r, h, seg));

export const ico = (r: number): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, 0);

export function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

/** Prisma triangular deitado ao longo de X, base em y = 0: telhado de duas águas. */
export function gableRoof(length: number, depth: number, height: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, length, 3);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.scale(1, height / 1.5, depth / Math.sqrt(3));
  g.translate(0, height / 3, 0);
  return flat(g);
}

/** Roda de pé, girando em torno de X (eixo do veículo que anda para +Z). */
export function wheelGeometry(radius: number, width: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, width, seg);
  g.rotateZ(Math.PI / 2);
  return flat(g);
}

export const shade = (hex: string, factor: number): string =>
  `#${new THREE.Color(hex).multiplyScalar(factor).getHexString()}`;

export const mix = (a: string, b: string, t: number): string =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** Material sem luz (brilha sozinho): janelas acesas, chamas, telas. */
export function glow(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, fog: false });
}

/** Escolha determinística numa lista, a partir de uma semente. */
export const pick = <T>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed * 7919)) % list.length];

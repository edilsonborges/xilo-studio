// Módulo 3: objetos de cenário compostos só por primitivas.

import * as THREE from 'three';
import type { PresetPalette } from '../presets';
import type { PropType, Vec3 } from '../types';
import { part } from './toon';

export interface PropObject {
  group: THREE.Group;
  type: PropType;
  /** animação leve em função do tempo absoluto (chama do lampião, cabeça do bicho) */
  update?: (t: number) => void;
  /** altura da superfície de descanso (cama), para o personagem deitar em cima */
  restHeight?: number;
}

export interface PropOptions {
  rotationY?: number;
  palette: PresetPalette;
  /** variação determinística entre instâncias */
  seed?: number;
  /** false quando a cena já atingiu o limite de luzes pontuais */
  allowLight?: boolean;
}

const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);

/** Normais por face: sem isso cilindros e cones ficam com sombreado liso. */
function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  if (g !== geo) geo.dispose();
  return g;
}

const cyl = (rTop: number, rBottom: number, h: number, seg = 6): THREE.BufferGeometry =>
  flat(new THREE.CylinderGeometry(rTop, rBottom, h, seg));

function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

/** Prisma triangular deitado ao longo de X, base em y = 0: telhado de duas águas. */
function gableRoof(length: number, depth: number, height: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, length, 3);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.scale(1, height / 1.5, depth / Math.sqrt(3));
  g.translate(0, height / 3, 0);
  return flat(g);
}

function rusticHouse(g: THREE.Group, color: string | undefined, pal: PresetPalette): void {
  g.add(place(part(box(3, 2, 2.6), color ?? pal.wall), 0, 1, 0));
  g.add(place(part(gableRoof(3.5, 3.2, 1.15), pal.roof), 0, 2, 0));
  g.add(place(part(box(0.62, 1.25, 0.1), pal.wood, { outlineWidth: 0.025 }), -0.55, 0.625, 1.31));
  g.add(place(part(box(0.6, 0.55, 0.1), '#2a2019', { outlineWidth: 0.025 }), 0.75, 1.2, 1.31));
  g.add(place(part(box(0.72, 0.08, 0.16), pal.wood, { outline: false }), 0.75, 0.89, 1.33));
}

function bed(g: THREE.Group, color: string | undefined, pal: PresetPalette): number {
  for (const [x, z] of [[-0.5, -0.95], [0.5, -0.95], [-0.5, 0.95], [0.5, 0.95]]) {
    g.add(place(part(box(0.1, 0.3, 0.1), pal.wood, { outline: false }), x, 0.15, z));
  }
  g.add(place(part(box(1.15, 0.16, 2.1), pal.wood), 0, 0.34, 0));
  g.add(place(part(box(1.05, 0.16, 2), '#efe6d3'), 0, 0.5, 0));
  g.add(place(part(box(1.15, 0.8, 0.1), pal.wood), 0, 0.62, -1.06));
  g.add(place(part(box(0.62, 0.1, 0.36), '#fbf6ea', { outlineWidth: 0.02 }), 0, 0.62, -0.74));
  g.add(place(part(box(1.1, 0.07, 1.1), color ?? pal.cloth, { outlineWidth: 0.02 }), 0, 0.61, 0.42));
  return 0.58;
}

function tree(g: THREE.Group, color: string | undefined, pal: PresetPalette, seed: number): void {
  const foliage = color ?? pal.foliage;
  g.add(place(part(cyl(0.16, 0.25, 1.6), pal.trunk), 0, 0.8, 0));
  const blobs: Array<[number, number, number, number]> = [
    [1, 0, 2.2, 0],
    [0.72, 0.5, 2.75, 0.2],
    [0.64, -0.55, 2.6, -0.15],
  ];
  blobs.forEach(([r, x, y, z], i) => {
    const blob = part(new THREE.IcosahedronGeometry(r, 0), foliage);
    blob.rotation.set(seed * 1.3 + i, seed * 2.1 + i * 2, 0);
    g.add(place(blob, x, y, z));
  });
}

function branch(parent: THREE.Object3D, len: number, radius: number, color: string, y: number, rotZ: number, rotY: number): THREE.Group {
  const holder = new THREE.Group();
  holder.position.y = y;
  holder.rotation.set(0, rotY, rotZ);
  const geo = cyl(radius * 0.55, radius, len, 5);
  geo.translate(0, len / 2, 0);
  holder.add(part(geo, color, { outlineWidth: 0.028 }));
  parent.add(holder);
  return holder;
}

function dryTree(g: THREE.Group, color: string | undefined, seed: number): void {
  const wood = color ?? '#6e5440';
  const trunk = branch(g, 1.9, 0.19, wood, 0, 0.06, seed);
  const a = branch(trunk, 1.1, 0.1, wood, 1.2, 0.85, 0);
  branch(a, 0.6, 0.06, wood, 0.7, -0.7, 0.5);
  const b = branch(trunk, 1, 0.09, wood, 1.5, -0.75, 0.6);
  branch(b, 0.55, 0.05, wood, 0.6, 0.8, -0.4);
  branch(trunk, 0.8, 0.08, wood, 1.85, 0.25, 2.2);
}

function cactus(g: THREE.Group, color: string | undefined, pal: PresetPalette): void {
  const green = color ?? pal.cactus;
  g.add(place(part(cyl(0.2, 0.25, 2.1), green), 0, 1.05, 0));
  const arm = (side: number, y: number, h: number): void => {
    const horiz = part(cyl(0.13, 0.13, 0.5), green);
    horiz.rotation.z = Math.PI / 2;
    g.add(place(horiz, side * 0.4, y, 0));
    g.add(place(part(cyl(0.12, 0.14, h), green), side * 0.6, y + h / 2 - 0.05, 0));
  };
  arm(1, 1.05, 0.85);
  arm(-1, 0.75, 0.6);
}

function table(g: THREE.Group, color: string | undefined, pal: PresetPalette): void {
  const wood = color ?? pal.wood;
  g.add(place(part(box(1.4, 0.09, 0.85), wood), 0, 0.78, 0));
  for (const [x, z] of [[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]]) {
    g.add(place(part(box(0.09, 0.74, 0.09), wood, { outlineWidth: 0.025 }), x, 0.37, z));
  }
  g.add(place(part(cyl(0.07, 0.06, 0.13, 6), '#e9e2d0', { outlineWidth: 0.02 }), 0.3, 0.89, 0.1));
  g.add(place(part(cyl(0.2, 0.14, 0.05, 8), '#b5653a', { outlineWidth: 0.02 }), -0.25, 0.85, -0.05));
}

function lantern(g: THREE.Group, color: string | undefined, allowLight: boolean, seed: number): (t: number) => void {
  const metal = color ?? '#3b3a38';
  const inner = new THREE.Group();
  inner.scale.setScalar(1.7);
  g.add(inner);
  inner.add(place(part(cyl(0.12, 0.14, 0.06), metal, { outlineWidth: 0.02 }), 0, 0.03, 0));
  const flame = new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false });
  const glass = new THREE.Mesh(cyl(0.085, 0.105, 0.2), flame);
  inner.add(place(glass, 0, 0.16, 0));
  const cap = new THREE.ConeGeometry(0.13, 0.1, 6);
  inner.add(place(part(flat(cap), metal, { outlineWidth: 0.02 }), 0, 0.31, 0));
  const handle = part(new THREE.TorusGeometry(0.09, 0.012, 4, 8, Math.PI), metal, { outline: false });
  inner.add(place(handle, 0, 0.35, 0));

  let light: THREE.PointLight | null = null;
  if (allowLight) {
    light = new THREE.PointLight('#ffb25a', 10, 9, 1.6);
    light.position.set(0, 0.55, 0);
    g.add(light);
  }
  const base = new THREE.Color('#ffd27a');
  return (t) => {
    // tremulação determinística: soma de senos, sem ruído aleatório
    const flicker = 0.88 + 0.08 * Math.sin(t * 11 + seed) + 0.04 * Math.sin(t * 23.7 + seed * 2);
    flame.color.copy(base).multiplyScalar(flicker);
    if (light) light.intensity = 10 * flicker;
  };
}

function road(g: THREE.Group, color: string | undefined, pal: PresetPalette): void {
  const dirt = color ?? pal.road;
  const opts = { outline: false, castShadow: false };
  g.add(place(part(box(2.6, 0.02, 70), dirt, opts), 0, 0.011, 0));
  const edge = `#${new THREE.Color(dirt).multiplyScalar(0.72).getHexString()}`;
  g.add(place(part(box(0.1, 0.024, 70), edge, opts), -1.3, 0.013, 0));
  g.add(place(part(box(0.1, 0.024, 70), edge, opts), 1.3, 0.013, 0));
}

function fence(g: THREE.Group, color: string | undefined, pal: PresetPalette): void {
  const wood = color ?? pal.wood;
  for (let i = 0; i < 5; i++) {
    g.add(place(part(box(0.11, 0.95, 0.11), wood, { outlineWidth: 0.028 }), -1.8 + i * 0.9, 0.475, 0));
  }
  g.add(place(part(box(3.9, 0.08, 0.05), wood, { outlineWidth: 0.025 }), 0, 0.38, 0.06));
  g.add(place(part(box(3.9, 0.08, 0.05), wood, { outlineWidth: 0.025 }), 0, 0.72, 0.06));
}

function animal(g: THREE.Group, color: string | undefined, pal: PresetPalette, seed: number): (t: number) => void {
  const hide = color ?? pal.animal;
  const light = `#${new THREE.Color(hide).lerp(new THREE.Color('#ffffff'), 0.45).getHexString()}`;
  g.add(place(part(box(0.48, 0.46, 1), hide), 0, 0.72, 0));
  for (const [x, z] of [[-0.16, -0.38], [0.16, -0.38], [-0.16, 0.38], [0.16, 0.38]]) {
    g.add(place(part(box(0.12, 0.52, 0.12), hide, { outlineWidth: 0.025 }), x, 0.26, z));
  }
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.52);
  g.add(head);
  head.add(place(part(box(0.32, 0.32, 0.36), hide), 0, 0.08, 0.12));
  head.add(place(part(box(0.2, 0.16, 0.16), light, { outlineWidth: 0.02 }), 0, 0.02, 0.36));
  for (const side of [-1, 1]) {
    const horn = part(flat(new THREE.ConeGeometry(0.04, 0.2, 5)), '#e8dcc0', { outlineWidth: 0.015 });
    horn.rotation.z = -side * 0.5;
    head.add(place(horn, side * 0.12, 0.32, 0.05));
    head.add(place(part(box(0.1, 0.06, 0.04), hide, { outline: false }), side * 0.2, 0.18, 0.02));
    const eye = part(box(0.04, 0.05, 0.02), '#161210', { outline: false, castShadow: false });
    head.add(place(eye, side * 0.09, 0.13, 0.305));
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.88, -0.5);
  tail.add(place(part(box(0.06, 0.34, 0.06), hide, { outlineWidth: 0.018 }), 0, -0.15, -0.03));
  g.add(tail);
  return (t) => {
    head.rotation.x = 0.1 + 0.12 * Math.sin(t * 1.3 + seed);
    head.rotation.y = 0.2 * Math.sin(t * 0.7 + seed * 2);
    tail.rotation.z = 0.5 * Math.sin(t * 4 + seed);
  };
}

export function createProp(
  type: PropType,
  position: Vec3,
  scale: number,
  color: string | undefined,
  options: PropOptions,
): PropObject {
  const { palette, seed = 0, allowLight = true } = options;
  const group = new THREE.Group();
  group.name = `prop:${type}`;
  const result: PropObject = { group, type };

  switch (type) {
    case 'rustic_house':
      rusticHouse(group, color, palette);
      break;
    case 'bed':
      result.restHeight = bed(group, color, palette) * scale;
      break;
    case 'tree':
      tree(group, color, palette, seed);
      break;
    case 'dry_tree':
      dryTree(group, color, seed);
      break;
    case 'cactus':
      cactus(group, color, palette);
      break;
    case 'table':
      table(group, color, palette);
      break;
    case 'lantern':
      result.update = lantern(group, color, allowLight, seed);
      break;
    case 'road':
      road(group, color, palette);
      break;
    case 'fence':
      fence(group, color, palette);
      break;
    case 'animal':
      result.update = animal(group, color, palette, seed);
      break;
  }

  group.position.set(position[0], position[1], position[2]);
  group.rotation.y = options.rotationY ?? 0;
  // a estrada só estica na largura: o comprimento já cobre o horizonte
  if (type === 'road') group.scale.set(scale, 1, 1);
  else group.scale.setScalar(scale);
  return result;
}

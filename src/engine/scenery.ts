// Objetos de cenário da v0.3.0: cidade, natureza, água, dentro de casa e festa.
// Tudo é feito de primitivas, com o mesmo material e contorno do visual escolhido.

import * as THREE from 'three';
import type { PresetPalette } from '../presets';
import type { Vec3 } from '../types';
import { box, cone, cyl, flat, gableRoof, glow, ico, mix, pick, place, shade } from './geo';
import { part } from './toon';

export interface Motion {
  /** o objeto está se deslocando nesta cena */
  moving: boolean;
  /** distância percorrida desde o início da cena (gira rodas, mexe patas) */
  distance: number;
}

export interface Seat {
  /** posição do quadril do personagem, no espaço do objeto */
  position: Vec3;
  pose: 'sit' | 'ride' | 'drive';
}

export interface BuildContext {
  palette: PresetPalette;
  seed: number;
  color?: string;
  /** false quando a cena já atingiu o limite de luzes pontuais */
  allowLight: boolean;
  night: boolean;
}

export interface Built {
  update?: (t: number, motion: Motion) => void;
  restHeight?: number;
  seat?: Seat;
  /** acendeu uma luz pontual (conta no limite da cena) */
  usedLight?: boolean;
}

const FLAG_COLORS = ['#d8432b', '#f0c040', '#3f8fd8', '#4fae5a', '#e870a8', '#f08a2a'];
const FLOWER_COLORS = ['#f04a5a', '#f6c63a', '#ffffff', '#c86ae0', '#ff8a3a', '#5aa0f0'];

function windowGrid(g: THREE.Group, w: number, floors: number, z: number, lit: boolean, seed: number): void {
  const cols = Math.max(2, Math.floor(w / 0.9));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const on = lit && ((f * 7 + c * 3 + Math.floor(seed * 10)) % 3 !== 0);
      const pane = on
        ? new THREE.Mesh(box(0.42, 0.55, 0.06), glow('#ffd88a'))
        : part(box(0.42, 0.55, 0.06), '#2a3140', { outline: false, castShadow: false });
      g.add(place(pane, -w / 2 + (c + 0.5) * (w / cols), 1.7 + f * 1.25, z));
    }
  }
}

export function building(g: THREE.Group, ctx: BuildContext): Built {
  const walls = ['#d8b48a', '#c9897a', '#8fb0c8', '#e0c070', '#a8c49a', '#d8a0b0'];
  const color = ctx.color ?? pick(walls, ctx.seed);
  const floors = 2 + (Math.floor(ctx.seed * 13) % 3);
  const h = 1.1 + floors * 1.25;
  g.add(place(part(box(3.2, h, 2.8), color), 0, h / 2, 0));
  g.add(place(part(box(3.45, 0.18, 3.05), shade(color, 0.7)), 0, h + 0.09, 0));
  g.add(place(part(box(0.8, 1.3, 0.1), ctx.palette.wood, { outlineWidth: 0.025 }), 0, 0.65, 1.42));
  windowGrid(g, 3.2, floors, 1.42, ctx.night, ctx.seed);
  return {};
}

export function church(g: THREE.Group, ctx: BuildContext): Built {
  const wall = ctx.color ?? '#f0e6cf';
  g.add(place(part(box(3, 3.4, 4.2), wall), 0, 1.7, 0));
  g.add(place(part(gableRoof(3.4, 4.6, 1.4), ctx.palette.roof), 0, 3.4, 0));
  g.add(place(part(box(1.4, 5.6, 1.4), wall), 0, 2.8, 2.4));
  g.add(place(part(cone(1.05, 1.7, 4), ctx.palette.roof), 0, 6.45, 2.4));
  g.add(place(part(box(0.1, 0.7, 0.1), '#e8c060', { outlineWidth: 0.02 }), 0, 7.6, 2.4));
  g.add(place(part(box(0.42, 0.1, 0.1), '#e8c060', { outlineWidth: 0.02 }), 0, 7.7, 2.4));
  g.add(place(part(box(0.75, 1.5, 0.1), ctx.palette.wood, { outlineWidth: 0.025 }), 0, 0.75, 3.13));
  const rose = ctx.night ? new THREE.Mesh(cyl(0.32, 0.32, 0.06, 10), glow('#ffcc70')) : part(cyl(0.32, 0.32, 0.06, 10), '#5a8ac8', { outlineWidth: 0.02 });
  rose.rotation.x = Math.PI / 2;
  g.add(place(rose, 0, 3.9, 3.12));
  return {};
}

export function barn(g: THREE.Group, ctx: BuildContext): Built {
  const red = ctx.color ?? '#a8322a';
  g.add(place(part(box(3.6, 2.6, 3.2), red), 0, 1.3, 0));
  g.add(place(part(gableRoof(4, 3.7, 1.5), '#5a3a2a'), 0, 2.6, 0));
  g.add(place(part(box(1.5, 1.8, 0.1), shade(red, 0.75), { outlineWidth: 0.025 }), 0, 0.9, 1.62));
  for (const r of [0.85, -0.85]) {
    const bar = part(box(0.12, 2.2, 0.06), '#f2ece0', { outline: false });
    bar.rotation.z = r;
    g.add(place(bar, 0, 0.9, 1.68));
  }
  return {};
}

export function marketStall(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.palette.wood;
  g.add(place(part(box(2.2, 0.12, 1.1), wood), 0, 0.9, 0));
  g.add(place(part(box(2.1, 0.8, 0.08), shade(wood, 0.85)), 0, 0.45, 0.5));
  for (const [x, z] of [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]]) {
    g.add(place(part(box(0.08, 2.2, 0.08), wood, { outlineWidth: 0.02 }), x, 1.1, z));
  }
  const stripe = ctx.color ?? pick(FLAG_COLORS, ctx.seed);
  for (let i = 0; i < 6; i++) {
    const s = part(box(0.38, 0.06, 1.35), i % 2 ? '#f6efe0' : stripe, { outlineWidth: 0.015 });
    s.rotation.x = 0.18;
    g.add(place(s, -0.95 + i * 0.38, 2.25, 0.05));
  }
  const fruit = ['#e8402a', '#f4b02a', '#7ab83a', '#f07a2a'];
  for (let i = 0; i < 9; i++) {
    g.add(place(part(ico(0.11), fruit[i % fruit.length], { outlineWidth: 0.012 }), -0.8 + (i % 5) * 0.4, 1.05, -0.2 + Math.floor(i / 5) * 0.35));
  }
  return {};
}

export function bandstand(g: THREE.Group, ctx: BuildContext): Built {
  const white = ctx.color ?? '#f2ede0';
  g.add(place(part(cyl(2, 2.1, 0.6, 8), '#c8bba0'), 0, 0.3, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(place(part(box(0.12, 2.2, 0.12), white, { outlineWidth: 0.02 }), Math.sin(a) * 1.75, 1.7, Math.cos(a) * 1.75));
  }
  g.add(place(part(cone(2.4, 1.3, 8), ctx.palette.roof), 0, 3.4, 0));
  g.add(place(part(cyl(1.9, 1.9, 0.08, 8), white, { outlineWidth: 0.02 }), 0, 1.1, 0));
  return {};
}

export function lampPost(g: THREE.Group, ctx: BuildContext): Built {
  const metal = ctx.color ?? '#2f3236';
  g.add(place(part(cyl(0.07, 0.1, 3.4), metal, { outlineWidth: 0.02 }), 0, 1.7, 0));
  g.add(place(part(box(0.7, 0.07, 0.07), metal, { outlineWidth: 0.02 }), 0.3, 3.35, 0));
  const bulb = ctx.night ? new THREE.Mesh(ico(0.16), glow('#ffe2a0')) : part(ico(0.16), '#f6efe0', { outlineWidth: 0.02 });
  g.add(place(bulb, 0.6, 3.2, 0));
  if (ctx.night && ctx.allowLight) {
    const light = new THREE.PointLight('#ffd08a', 9, 10, 1.6);
    light.position.set(0.6, 3, 0);
    g.add(light);
    return { usedLight: true };
  }
  return {};
}

export function bench(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  g.add(place(part(box(1.8, 0.08, 0.5), wood), 0, 0.48, 0));
  g.add(place(part(box(1.8, 0.45, 0.07), wood), 0, 0.82, -0.24));
  for (const x of [-0.75, 0.75]) g.add(place(part(box(0.08, 0.48, 0.45), '#2f3236', { outlineWidth: 0.02 }), x, 0.24, 0));
  return { seat: { position: [0, 0.5, 0.05], pose: 'sit' } };
}

export function pole(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? shade(ctx.palette.wood, 0.9);
  g.add(place(part(cyl(0.09, 0.12, 4.6), wood, { outlineWidth: 0.025 }), 0, 2.3, 0));
  g.add(place(part(box(1.3, 0.1, 0.1), wood, { outlineWidth: 0.02 }), 0, 4.1, 0));
  return {};
}

export function well(g: THREE.Group, ctx: BuildContext): Built {
  const stone = ctx.color ?? '#a39a8a';
  g.add(place(part(cyl(0.7, 0.75, 0.8, 10), stone), 0, 0.4, 0));
  g.add(place(part(cyl(0.55, 0.55, 0.05, 10), '#1c2a30', { outline: false }), 0, 0.79, 0));
  for (const x of [-0.65, 0.65]) g.add(place(part(box(0.09, 1.5, 0.09), ctx.palette.wood, { outlineWidth: 0.02 }), x, 1.4, 0));
  g.add(place(part(gableRoof(1.6, 1.2, 0.5), ctx.palette.roof), 0, 2.1, 0));
  g.add(place(part(cyl(0.12, 0.1, 0.18, 6), '#6a5a48', { outlineWidth: 0.015 }), 0.2, 1.3, 0));
  return {};
}

// ---------- natureza ----------

export function palmTree(g: THREE.Group, ctx: BuildContext): Built {
  const trunk = '#8a6a48';
  const bend = (ctx.seed % 1) - 0.5;
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const seg = part(cyl(0.13, 0.16, 0.75, 6), i % 2 ? trunk : shade(trunk, 0.85), { outlineWidth: 0.022 });
    g.add(place(seg, bend * i * 0.12, y + 0.37, 0));
    y += 0.7;
  }
  const top = new THREE.Group();
  top.position.set(bend * 0.72, y, 0);
  g.add(top);
  const leaf = ctx.color ?? '#3f9a48';
  for (let i = 0; i < 7; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / 7) * Math.PI * 2;
    const blade = part(box(0.32, 0.05, 1.6), i % 2 ? leaf : shade(leaf, 0.8), { outlineWidth: 0.015 });
    blade.rotation.x = 0.55;
    blade.position.set(0, -0.3, 0.75);
    holder.add(blade);
    top.add(holder);
  }
  for (let i = 0; i < 3; i++) top.add(place(part(ico(0.13), '#6a4a2a', { outlineWidth: 0.012 }), Math.cos(i * 2) * 0.18, -0.15, Math.sin(i * 2) * 0.18));
  return {
    update: (t) => {
      top.rotation.z = 0.05 * Math.sin(t * 1.1 + ctx.seed);
    },
  };
}

export function bush(g: THREE.Group, ctx: BuildContext): Built {
  const green = ctx.color ?? ctx.palette.foliage;
  const blobs: Array<[number, number, number, number]> = [[0.55, 0, 0.45, 0], [0.42, 0.45, 0.35, 0.1], [0.4, -0.42, 0.33, -0.1]];
  blobs.forEach(([r, x, y, z], i) => g.add(place(part(ico(r), i ? green : shade(green, 0.85)), x, y, z)));
  return {};
}

export function rock(g: THREE.Group, ctx: BuildContext): Built {
  const stone = ctx.color ?? '#8f8a80';
  const main = part(flat(new THREE.DodecahedronGeometry(0.7, 0)), stone);
  main.scale.set(1.3, 0.75, 1);
  main.rotation.y = ctx.seed * 3;
  g.add(place(main, 0, 0.42, 0));
  g.add(place(part(flat(new THREE.DodecahedronGeometry(0.32, 0)), shade(stone, 0.85)), 0.75, 0.22, 0.25));
  return {};
}

export function flowers(g: THREE.Group, ctx: BuildContext): Built {
  const stems = new THREE.Group();
  g.add(stems);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4 + ctx.seed;
    const r = 0.25 + (i % 5) * 0.18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.35 + (i % 3) * 0.12;
    stems.add(place(part(cyl(0.015, 0.02, h, 4), '#4f8a3a', { outline: false }), x, h / 2, z));
    const bloom = part(ico(0.09), ctx.color ?? FLOWER_COLORS[(i + Math.floor(ctx.seed * 10)) % FLOWER_COLORS.length], { outlineWidth: 0.012 });
    stems.add(place(bloom, x, h + 0.04, z));
  }
  return { update: (t) => { stems.rotation.z = 0.04 * Math.sin(t * 1.6 + ctx.seed); } };
}

export function cornfield(g: THREE.Group, ctx: BuildContext): Built {
  const green = ctx.color ?? '#6a9a3a';
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const x = -1.5 + i * 0.6;
      const z = -0.6 + r * 0.6;
      g.add(place(part(cyl(0.035, 0.05, 1.7, 5), green, { outlineWidth: 0.015 }), x, 0.85, z));
      const leaf = part(box(0.5, 0.03, 0.1), shade(green, 1.15), { outline: false });
      leaf.rotation.z = i % 2 ? 0.5 : -0.5;
      g.add(place(leaf, x + (i % 2 ? 0.18 : -0.18), 1, z));
      g.add(place(part(cyl(0.05, 0.06, 0.25, 5), '#e8c040', { outlineWidth: 0.012 }), x + 0.06, 1.2, z));
    }
  }
  return {};
}

export function cloudIsland(g: THREE.Group, ctx: BuildContext): Built {
  const island = new THREE.Group();
  g.add(island);
  const rockBase = part(cone(1.3, 1.6, 7), '#a88ab8');
  rockBase.rotation.x = Math.PI;
  island.add(place(rockBase, 0, 1.7, 0));
  island.add(place(part(cyl(1.35, 1.35, 0.25, 7), ctx.color ?? ctx.palette.foliage), 0, 2.6, 0));
  island.add(place(part(ico(0.45), shade(ctx.palette.foliage, 0.9)), 0.4, 3.05, -0.2));
  return {
    update: (t) => {
      island.position.y = 0.8 + 0.25 * Math.sin(t * 0.8 + ctx.seed * 3);
      island.rotation.y = 0.2 * Math.sin(t * 0.3 + ctx.seed);
    },
  };
}

// ---------- caminhos e água ----------

export function bridge(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 0.5;
    const y = 0.25 + Math.sin((i / 8) * Math.PI) * 0.55;
    g.add(place(part(box(0.46, 0.1, 1.5), i % 2 ? wood : shade(wood, 0.88), { outlineWidth: 0.018 }), x, y, 0));
    if (i % 2 === 0) for (const z of [-0.72, 0.72]) g.add(place(part(box(0.07, 0.7, 0.07), wood, { outlineWidth: 0.015 }), x, y + 0.35, z));
  }
  for (const z of [-0.72, 0.72]) {
    const rail = part(box(4.2, 0.06, 0.06), wood, { outlineWidth: 0.015 });
    g.add(place(rail, 0, 1.25, z));
  }
  return {};
}

export function pier(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  for (let i = 0; i < 10; i++) {
    g.add(place(part(box(1.8, 0.08, 0.45), i % 2 ? wood : shade(wood, 0.88), { outlineWidth: 0.015 }), 0, 0.55, -2 + i * 0.48));
  }
  for (const z of [-2, 0, 2.3]) for (const x of [-0.85, 0.85]) {
    g.add(place(part(cyl(0.08, 0.08, 1.2), shade(wood, 0.75), { outlineWidth: 0.015 }), x, 0.3, z));
  }
  return { seat: { position: [0, 0.6, 2.2], pose: 'sit' } };
}

export function barrel(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  g.add(place(part(cyl(0.32, 0.32, 0.85, 10), wood), 0, 0.42, 0));
  for (const y of [0.15, 0.7]) g.add(place(part(cyl(0.335, 0.335, 0.06, 10), '#3a3430', { outline: false }), 0, y, 0));
  return {};
}

export function umbrella(g: THREE.Group, ctx: BuildContext): Built {
  g.add(place(part(cyl(0.035, 0.035, 2.2, 5), '#f2ede0', { outlineWidth: 0.015 }), 0, 1.1, 0));
  const canopy = ctx.color ?? pick(FLAG_COLORS, ctx.seed);
  for (let i = 0; i < 8; i++) {
    const slice = part(flat(new THREE.ConeGeometry(1.25, 0.45, 8, 1, false, (i / 8) * Math.PI * 2, Math.PI / 4)), i % 2 ? '#f6efe0' : canopy, { outlineWidth: 0.015 });
    g.add(place(slice, 0, 2.25, 0));
  }
  g.add(place(part(box(0.8, 0.02, 1.7), mix(canopy, '#ffffff', 0.3), { outline: false }), 0.9, 0.01, 0.6));
  return {};
}

// ---------- dentro de casa ----------

export function chair(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  g.add(place(part(box(0.5, 0.07, 0.5), wood), 0, 0.46, 0));
  g.add(place(part(box(0.5, 0.55, 0.06), wood), 0, 0.76, -0.22));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    g.add(place(part(box(0.06, 0.46, 0.06), wood, { outlineWidth: 0.015 }), x, 0.23, z));
  }
  return { seat: { position: [0, 0.48, 0.05], pose: 'sit' } };
}

export function sofa(g: THREE.Group, ctx: BuildContext): Built {
  const cloth = ctx.color ?? ctx.palette.cloth;
  g.add(place(part(box(2, 0.42, 0.85), cloth), 0, 0.33, 0));
  g.add(place(part(box(2, 0.65, 0.22), shade(cloth, 0.88)), 0, 0.75, -0.33));
  for (const x of [-0.95, 0.95]) g.add(place(part(box(0.22, 0.55, 0.85), shade(cloth, 0.92)), x, 0.45, 0));
  return { seat: { position: [0, 0.52, 0.1], pose: 'sit' } };
}

export function tv(g: THREE.Group, ctx: BuildContext): Built {
  g.add(place(part(box(1.3, 0.5, 0.45), ctx.color ?? ctx.palette.wood), 0, 0.25, 0));
  g.add(place(part(box(1.1, 0.68, 0.08), '#1e1f22', { outlineWidth: 0.02 }), 0, 0.88, 0));
  const screen = new THREE.MeshBasicMaterial({ color: '#7ab0e0', fog: false });
  g.add(place(new THREE.Mesh(box(0.98, 0.56, 0.02), screen), 0, 0.88, 0.05));
  const base = new THREE.Color('#7ab0e0');
  return {
    update: (t) => {
      screen.color.copy(base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 9 + ctx.seed) * Math.sin(t * 2.3));
    },
  };
}

export function plant(g: THREE.Group, ctx: BuildContext): Built {
  g.add(place(part(cyl(0.22, 0.17, 0.4, 8), ctx.color ?? '#b8643a'), 0, 0.2, 0));
  for (let i = 0; i < 6; i++) {
    const leaf = part(box(0.16, 0.6, 0.03), i % 2 ? '#3f8a45' : '#5aa64f', { outlineWidth: 0.012 });
    leaf.rotation.set(0.35 * Math.cos(i), (i / 6) * Math.PI * 2, 0.35 * Math.sin(i));
    g.add(place(leaf, 0, 0.65, 0));
  }
  return {};
}

export function stove(g: THREE.Group, ctx: BuildContext): Built {
  const brick = ctx.color ?? '#b8644a';
  g.add(place(part(box(1.6, 0.85, 0.75), brick), 0, 0.42, 0));
  g.add(place(part(box(1.65, 0.08, 0.8), '#3a3430'), 0, 0.88, 0));
  g.add(place(part(cyl(0.12, 0.12, 1.6, 6), '#3a3430', { outlineWidth: 0.02 }), 0.6, 1.7, -0.2));
  g.add(place(part(cyl(0.22, 0.18, 0.28, 8), '#5a5550', { outlineWidth: 0.015 }), -0.35, 1.06, 0));
  const fire = new THREE.MeshBasicMaterial({ color: '#ff9a3a', fog: false });
  g.add(place(new THREE.Mesh(box(0.4, 0.22, 0.02), fire), -0.3, 0.3, 0.38));
  const base = new THREE.Color('#ff9a3a');
  return { update: (t) => { fire.color.copy(base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 13 + ctx.seed)); } };
}

export function desk(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  g.add(place(part(box(0.9, 0.06, 0.6), wood), 0, 0.72, 0.15));
  for (const x of [-0.4, 0.4]) g.add(place(part(box(0.05, 0.7, 0.05), '#3a3430', { outlineWidth: 0.015 }), x, 0.36, 0.4));
  g.add(place(part(box(0.45, 0.05, 0.42), wood), 0, 0.44, -0.35));
  g.add(place(part(box(0.45, 0.4, 0.05), wood), 0, 0.68, -0.58));
  g.add(place(part(box(0.05, 0.44, 0.05), '#3a3430', { outlineWidth: 0.015 }), 0, 0.22, -0.35));
  // o aluno senta virado para a lousa (para trás da câmera é -Z)
  return { seat: { position: [0, 0.46, -0.3], pose: 'sit' } };
}

export function blackboard(g: THREE.Group, ctx: BuildContext): Built {
  g.add(place(part(box(3.2, 1.6, 0.08), ctx.color ?? '#6a4a2e'), 0, 1.75, 0));
  g.add(place(part(box(3, 1.4, 0.04), '#21412e', { outline: false }), 0, 1.75, 0.04));
  for (let i = 0; i < 4; i++) {
    g.add(place(new THREE.Mesh(box(1 + (i % 2) * 0.8, 0.03, 0.01), glow('#e8efe6')), -0.4 + (i % 2) * 0.3, 2.2 - i * 0.3, 0.07));
  }
  return {};
}

export function pew(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  g.add(place(part(box(2.6, 0.08, 0.5), wood), 0, 0.46, 0));
  g.add(place(part(box(2.6, 0.6, 0.07), wood), 0, 0.8, -0.24));
  for (const x of [-1.2, 1.2]) g.add(place(part(box(0.08, 0.9, 0.55), shade(wood, 0.85), { outlineWidth: 0.02 }), x, 0.45, 0));
  return { seat: { position: [0.4, 0.48, 0.05], pose: 'sit' } };
}

export function altar(g: THREE.Group, ctx: BuildContext): Built {
  g.add(place(part(box(2, 1, 0.8), '#f2ede0'), 0, 0.5, 0));
  g.add(place(part(box(2.05, 0.6, 0.82), ctx.color ?? ctx.palette.cloth), 0, 0.72, 0.01));
  g.add(place(part(box(0.12, 1.4, 0.08), '#e8c060', { outlineWidth: 0.02 }), 0, 2.1, -0.3));
  g.add(place(part(box(0.7, 0.12, 0.08), '#e8c060', { outlineWidth: 0.02 }), 0, 2.4, -0.3));
  const flames: THREE.MeshBasicMaterial[] = [];
  for (const x of [-0.7, 0.7]) {
    g.add(place(part(cyl(0.05, 0.05, 0.4, 6), '#f6efe0', { outlineWidth: 0.012 }), x, 1.2, 0));
    const f = new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false });
    flames.push(f);
    g.add(place(new THREE.Mesh(cone(0.04, 0.1, 5), f), x, 1.45, 0));
  }
  const base = new THREE.Color('#ffd27a');
  return { update: (t) => flames.forEach((f, i) => f.color.copy(base).multiplyScalar(0.85 + 0.15 * Math.sin(t * 11 + i * 2))) };
}

// ---------- festa ----------

export function bonfire(g: THREE.Group, ctx: BuildContext): Built {
  for (let i = 0; i < 5; i++) {
    const log = part(cyl(0.08, 0.1, 1.2, 5), '#5a3a22', { outlineWidth: 0.018 });
    log.rotation.set(0.9, (i / 5) * Math.PI * 2, 0);
    g.add(place(log, Math.sin((i / 5) * Math.PI * 2) * 0.25, 0.35, Math.cos((i / 5) * Math.PI * 2) * 0.25));
  }
  const flames: Array<{ mesh: THREE.Mesh; phase: number }> = [];
  [['#ff6a2a', 0.42, 1.3], ['#ffb43a', 0.3, 1], ['#fff0a0', 0.16, 0.6]].forEach(([color, r, h], i) => {
    const mesh = new THREE.Mesh(cone(r as number, h as number, 6), glow(color as string));
    mesh.position.y = (h as number) / 2 + 0.15;
    g.add(mesh);
    flames.push({ mesh, phase: i * 1.7 });
  });
  let light: THREE.PointLight | null = null;
  if (ctx.allowLight) {
    light = new THREE.PointLight('#ff9a4a', 14, 12, 1.5);
    light.position.y = 1;
    g.add(light);
  }
  return {
    usedLight: Boolean(light),
    update: (t) => {
      for (const { mesh, phase } of flames) {
        mesh.scale.set(1 + 0.1 * Math.sin(t * 9 + phase), 1 + 0.18 * Math.sin(t * 13 + phase * 2), 1 + 0.1 * Math.cos(t * 7 + phase));
        mesh.rotation.y = t * 0.8 + phase;
      }
      if (light) light.intensity = 14 * (0.85 + 0.15 * Math.sin(t * 17 + ctx.seed));
    },
  };
}

export function bunting(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.palette.wood;
  for (const x of [-2.4, 2.4]) g.add(place(part(cyl(0.06, 0.07, 3.6), wood, { outlineWidth: 0.02 }), x, 1.8, 0));
  const line = new THREE.Group();
  g.add(line);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const x = -2.3 + (i / (n - 1)) * 4.6;
    const sag = 3.4 - Math.sin((i / (n - 1)) * Math.PI) * 0.45;
    const tri = new THREE.Shape([new THREE.Vector2(-0.17, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.38)]);
    const flag = part(new THREE.ShapeGeometry(tri), ctx.color && i % 2 ? ctx.color : FLAG_COLORS[(i + Math.floor(ctx.seed * 5)) % FLAG_COLORS.length], { outline: false, castShadow: false });
    // cópia própria: o material compartilhado da cor não pode virar dupla face
    const own = (flag.material as THREE.Material).clone();
    own.side = THREE.DoubleSide;
    own.userData.shared = false;
    flag.material = own;
    line.add(place(flag, x, sag, 0));
  }
  return { update: (t) => { line.rotation.x = 0.08 * Math.sin(t * 1.7 + ctx.seed); } };
}

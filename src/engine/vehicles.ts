// Veículos e animais. Todos olham para +Z; o motor gira o grupo na direção em
// que andam. Rodas e patas se mexem pela distância percorrida, então o mesmo
// instante do vídeo gera sempre o mesmo quadro.

import * as THREE from 'three';
import { box, cone, cyl, glow, ico, pick, place, shade, wheelGeometry } from './geo';
import type { BuildContext, Built } from './scenery';
import { part } from './toon';

const CAR_COLORS = ['#c8322a', '#2f6fb8', '#e8b83a', '#3f9a5a', '#f2ede0', '#3a3a40'];
const TIRE = '#1e1d1c';

/** Vidro translúcido: deixa ver quem está dirigindo. */
function glass(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: '#9ec4e0', transparent: true, opacity: 0.32, depthWrite: false });
}

function wheel(g: THREE.Group, radius: number, width: number, x: number, z: number): THREE.Mesh {
  const w = part(wheelGeometry(radius, width), TIRE, { outlineWidth: 0.02 });
  w.add(place(part(box(width * 1.05, radius * 0.5, radius * 0.18), '#bdbab2', { outline: false }), 0, 0, 0));
  g.add(place(w, x, radius, z));
  return w;
}

const spin = (wheels: THREE.Mesh[], radius: number) => (_t: number, motion: { distance: number }) => {
  for (const w of wheels) w.rotation.x = motion.distance / radius;
};

export function car(g: THREE.Group, ctx: BuildContext): Built {
  const paint = ctx.color ?? pick(CAR_COLORS, ctx.seed);
  g.add(place(part(box(1.75, 0.6, 3.7), paint), 0, 0.62, 0));
  // cabine aberta (teto e colunas) para quem está dentro aparecer
  g.add(place(part(box(1.55, 0.08, 1.9), paint), 0, 1.47, -0.25));
  for (const [x, z] of [[-0.72, 0.65], [0.72, 0.65], [-0.72, -1.15], [0.72, -1.15]]) {
    g.add(place(part(box(0.1, 0.56, 0.1), paint, { outlineWidth: 0.015 }), x, 1.18, z));
  }
  for (const [w, h, d, x, y, z] of [[1.4, 0.45, 0.06, 0, 1.22, 0.71], [1.4, 0.45, 0.06, 0, 1.22, -1.21], [0.06, 0.42, 1.6, 0.78, 1.22, -0.25], [0.06, 0.42, 1.6, -0.78, 1.22, -0.25]]) {
    g.add(place(new THREE.Mesh(box(w, h, d), glass()), x, y, z));
  }
  for (const x of [-0.6, 0.6]) {
    g.add(place(new THREE.Mesh(box(0.3, 0.16, 0.05), glow(ctx.night ? '#fff2b0' : '#f2efe0')), x, 0.72, 1.86));
    g.add(place(new THREE.Mesh(box(0.28, 0.12, 0.05), glow('#e83a2a')), x, 0.72, -1.86));
  }
  const r = 0.36;
  const wheels = [[-0.85, 1.2], [0.85, 1.2], [-0.85, -1.2], [0.85, -1.2]].map(([x, z]) => wheel(g, r, 0.26, x, z));
  return { update: spin(wheels, r), seat: { position: [-0.38, 0.62, -0.1], pose: 'drive' } };
}

export function truck(g: THREE.Group, ctx: BuildContext): Built {
  const paint = ctx.color ?? pick(['#2f6fb8', '#c8322a', '#3f7a4a', '#e8a83a'], ctx.seed);
  g.add(place(part(box(2, 0.8, 1.7), paint), 0, 0.9, 1.75));
  g.add(place(part(box(2, 0.1, 1.7), paint), 0, 2, 1.75));
  for (const [x, z] of [[-0.95, 2.55], [0.95, 2.55], [-0.95, 0.95], [0.95, 0.95]]) {
    g.add(place(part(box(0.1, 0.7, 0.1), paint, { outlineWidth: 0.015 }), x, 1.62, z));
  }
  g.add(place(new THREE.Mesh(box(1.8, 0.55, 0.06), glass()), 0, 1.6, 2.6));
  g.add(place(part(box(2.1, 0.25, 4), '#4a4038'), 0, 0.7, -1.15));
  g.add(place(part(box(2.1, 0.9, 0.1), shade(paint, 0.8)), 0, 1.2, -3.1));
  for (const x of [-1.03, 1.03]) g.add(place(part(box(0.08, 0.9, 4), shade(paint, 0.8)), x, 1.2, -1.15));
  for (let i = 0; i < 3; i++) g.add(place(part(box(0.7, 0.6, 0.7), '#b8955a', { outlineWidth: 0.02 }), -0.5 + (i % 2) * 0.9, 1.1, -0.5 - i * 0.9));
  const r = 0.45;
  const wheels = [[-0.95, 1.9], [0.95, 1.9], [-0.95, -1.9], [0.95, -1.9]].map(([x, z]) => wheel(g, r, 0.32, x, z));
  return { update: spin(wheels, r), seat: { position: [-0.42, 0.95, 1.6], pose: 'drive' } };
}

export function bus(g: THREE.Group, ctx: BuildContext): Built {
  const paint = ctx.color ?? pick(['#e8b83a', '#3f8fd8', '#d8432b', '#f2ede0'], ctx.seed);
  g.add(place(part(box(2.3, 1.25, 7.5), paint), 0, 1.07, 0));
  g.add(place(part(box(2.3, 0.14, 7.5), paint), 0, 2.68, 0));
  for (let i = 0; i < 7; i++) for (const x of [-1.1, 1.1]) {
    g.add(place(part(box(0.1, 0.95, 0.12), paint, { outline: false }), x, 2.15, -3.7 + i * 1.23));
  }
  g.add(place(new THREE.Mesh(box(2.32, 0.7, 6.6), glass()), 0, 2.05, -0.3));
  g.add(place(new THREE.Mesh(box(2.1, 0.9, 0.06), glass()), 0, 2.05, 3.76));
  g.add(place(part(box(2.34, 0.2, 7.52), shade(paint, 0.7), { outline: false }), 0, 1.15, 0));
  const r = 0.48;
  const wheels = [[-1.05, 2.5], [1.05, 2.5], [-1.05, -2.5], [1.05, -2.5]].map(([x, z]) => wheel(g, r, 0.34, x, z));
  return { update: spin(wheels, r), seat: { position: [-0.6, 1.05, 3.1], pose: 'drive' } };
}

export function bicycle(g: THREE.Group, ctx: BuildContext): Built {
  const frame = ctx.color ?? pick(['#d8432b', '#2f6fb8', '#3f9a5a', '#e8b83a'], ctx.seed);
  const r = 0.36;
  const wheels: THREE.Mesh[] = [];
  for (const z of [0.55, -0.55]) {
    const w = part(new THREE.TorusGeometry(r, 0.035, 5, 14), TIRE, { outlineWidth: 0.01 });
    w.rotation.y = Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(0, r, z);
    holder.add(w);
    w.add(part(box(0.02, r * 1.8, 0.02), '#bdbab2', { outline: false }));
    g.add(holder);
    wheels.push(w as THREE.Mesh);
  }
  const bar = (len: number, x: number, y: number, z: number, rx: number) => {
    const m = part(box(0.05, len, 0.05), frame, { outlineWidth: 0.012 });
    m.rotation.x = rx;
    g.add(place(m, x, y, z));
  };
  bar(0.75, 0, 0.62, 0.05, 1.1);
  bar(0.55, 0, 0.62, 0.4, -0.3);
  bar(0.55, 0, 0.6, -0.3, 0.35);
  g.add(place(part(box(0.5, 0.05, 0.05), '#2a2a2a', { outlineWidth: 0.012 }), 0, 1, 0.5));
  g.add(place(part(box(0.16, 0.06, 0.26), '#2a2a2a', { outlineWidth: 0.012 }), 0, 0.9, -0.22));
  return {
    update: (_t, motion) => { for (const w of wheels) w.rotation.x = motion.distance / r; },
    seat: { position: [0, 0.92, -0.18], pose: 'ride' },
  };
}

export function motorcycle(g: THREE.Group, ctx: BuildContext): Built {
  const paint = ctx.color ?? pick(['#c8322a', '#2a2a30', '#2f6fb8'], ctx.seed);
  const r = 0.34;
  const wheels = [0.75, -0.75].map((z) => wheel(g, r, 0.16, 0, z));
  g.add(place(part(box(0.42, 0.4, 1.1), paint), 0, 0.72, 0.05));
  g.add(place(part(box(0.36, 0.14, 0.7), '#2a2420'), 0, 0.98, -0.25));
  g.add(place(part(box(0.7, 0.06, 0.06), '#3a3a3a', { outlineWidth: 0.012 }), 0, 1.15, 0.6));
  g.add(place(new THREE.Mesh(box(0.18, 0.14, 0.05), glow('#fff2b0')), 0, 0.92, 0.65));
  return { update: spin(wheels, r), seat: { position: [0, 0.98, -0.2], pose: 'ride' } };
}

export function boat(g: THREE.Group, ctx: BuildContext): Built {
  const hull = ctx.color ?? pick(['#2f6fb8', '#d8432b', '#f2ede0', '#3f9a5a'], ctx.seed);
  const body = new THREE.Group();
  g.add(body);
  body.add(place(part(box(1.5, 0.55, 3.2), hull), 0, 0.28, 0));
  const bow = part(cone(0.75, 1.1, 4), hull);
  bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  bow.scale.set(1, 1, 0.52);
  body.add(place(bow, 0, 0.28, 2.15));
  body.add(place(part(box(1.3, 0.08, 3), shade(ctx.palette.wood, 1.1), { outline: false }), 0, 0.5, 0));
  body.add(place(part(box(1.3, 0.12, 0.35), ctx.palette.wood), 0, 0.6, -0.4));
  body.add(place(part(cyl(0.05, 0.06, 2.6), ctx.palette.wood, { outlineWidth: 0.015 }), 0, 1.8, 0.6));
  const sail = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 2.1), new THREE.Vector2(1.2, 0)]);
  const sailMesh = part(new THREE.ShapeGeometry(sail), '#f6efe0', { outline: false });
  const own = (sailMesh.material as THREE.Material).clone();
  own.side = THREE.DoubleSide;
  own.userData.shared = false;
  sailMesh.material = own;
  sailMesh.rotation.y = -Math.PI / 2;
  body.add(place(sailMesh, 0, 0.75, 0.65));
  return {
    // balanço do mar: função do tempo, igual no preview e na exportação
    update: (t) => {
      body.rotation.z = 0.06 * Math.sin(t * 1.3 + ctx.seed);
      body.rotation.x = 0.04 * Math.sin(t * 0.9 + ctx.seed * 2);
      body.position.y = 0.06 * Math.sin(t * 1.7 + ctx.seed);
    },
    seat: { position: [0, 0.62, -0.4], pose: 'sit' },
  };
}

export function cart(g: THREE.Group, ctx: BuildContext): Built {
  const wood = ctx.color ?? ctx.palette.wood;
  g.add(place(part(box(1.5, 0.12, 2), wood), 0, 0.9, 0));
  for (const x of [-0.72, 0.72]) g.add(place(part(box(0.08, 0.45, 2), shade(wood, 0.85)), x, 1.15, 0));
  g.add(place(part(box(1.5, 0.45, 0.08), shade(wood, 0.85)), 0, 1.15, -0.98));
  for (const x of [-0.25, 0.25]) {
    const shaft = part(box(0.07, 0.07, 1.8), wood, { outlineWidth: 0.015 });
    shaft.rotation.x = 0.12;
    g.add(place(shaft, x, 0.82, 1.8));
  }
  const r = 0.62;
  const wheels: THREE.Mesh[] = [];
  for (const x of [-0.85, 0.85]) {
    const w = part(wheelGeometry(r, 0.12, 12), shade(wood, 0.75), { outlineWidth: 0.02 });
    for (let i = 0; i < 3; i++) {
      const spoke = part(box(0.13, r * 1.9, 0.06), shade(wood, 0.6), { outline: false });
      spoke.rotation.x = (i / 3) * Math.PI;
      w.add(spoke);
    }
    g.add(place(w, x, r, 0));
    wheels.push(w);
  }
  return { update: spin(wheels, r), seat: { position: [0, 1, 0.6], pose: 'sit' } };
}

// ---------- animais ----------

function legs(g: THREE.Group, color: string, positions: number[][], len: number, w: number): THREE.Group[] {
  return positions.map(([x, y, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    hip.add(place(part(box(w, len, w), color, { outlineWidth: 0.02 }), 0, -len / 2, 0));
    g.add(hip);
    return hip;
  });
}

const gallop = (hips: THREE.Group[], stride: number, amp: number) => (motion: { moving: boolean; distance: number }, t: number, seed: number) => {
  const phase = motion.moving ? motion.distance * stride : 0;
  hips.forEach((hip, i) => {
    hip.rotation.x = motion.moving ? amp * Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) : 0.03 * Math.sin(t + seed + i);
  });
};

export function horse(g: THREE.Group, ctx: BuildContext): Built {
  const hide = ctx.color ?? pick(['#8a5a3a', '#4a3226', '#d8c8a8', '#2a2220'], ctx.seed);
  g.add(place(part(box(0.55, 0.6, 1.5), hide), 0, 1.25, 0));
  const neck = new THREE.Group();
  neck.position.set(0, 1.45, 0.65);
  g.add(neck);
  const neckMesh = part(box(0.3, 0.75, 0.32), hide);
  neckMesh.rotation.x = 0.55;
  neck.add(place(neckMesh, 0, 0.3, 0.15));
  neck.add(place(part(box(0.28, 0.28, 0.6), hide), 0, 0.62, 0.48));
  neck.add(place(part(box(0.06, 0.5, 0.3), '#1e1814', { outline: false }), 0, 0.42, 0.05));
  for (const side of [-1, 1]) {
    neck.add(place(part(box(0.04, 0.05, 0.02), '#111', { outline: false }), side * 0.15, 0.68, 0.62));
    neck.add(place(part(cone(0.05, 0.15, 4), hide, { outlineWidth: 0.012 }), side * 0.09, 0.82, 0.3));
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.45, -0.75);
  tail.add(place(part(box(0.1, 0.65, 0.1), '#1e1814', { outlineWidth: 0.015 }), 0, -0.3, -0.05));
  g.add(tail);
  g.add(place(part(box(0.6, 0.08, 0.55), '#7a3a2a', { outlineWidth: 0.015 }), 0, 1.58, -0.05));
  const hips = legs(g, hide, [[-0.18, 0.98, 0.55], [0.18, 0.98, 0.55], [-0.18, 0.98, -0.55], [0.18, 0.98, -0.55]], 0.98, 0.14);
  const step = gallop(hips, 2.2, 0.6);
  return {
    update: (t, motion) => {
      step(motion, t, ctx.seed);
      neck.rotation.x = motion.moving ? 0.1 * Math.sin(motion.distance * 2.2) : 0.08 * Math.sin(t * 0.8 + ctx.seed);
      tail.rotation.z = 0.3 * Math.sin(t * 3 + ctx.seed);
    },
    seat: { position: [0, 1.62, -0.05], pose: 'ride' },
  };
}

export function dog(g: THREE.Group, ctx: BuildContext): Built {
  const fur = ctx.color ?? pick(['#c89a5a', '#3a2a22', '#f2ede0', '#8a6a4a'], ctx.seed);
  g.add(place(part(box(0.32, 0.3, 0.7), fur), 0, 0.45, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.38);
  g.add(head);
  head.add(place(part(box(0.28, 0.26, 0.28), fur), 0, 0.05, 0.08));
  head.add(place(part(box(0.15, 0.13, 0.16), shade(fur, 0.85), { outlineWidth: 0.015 }), 0, -0.02, 0.27));
  head.add(place(part(box(0.06, 0.05, 0.03), '#111', { outline: false }), 0, 0.03, 0.36));
  for (const side of [-1, 1]) {
    head.add(place(part(box(0.08, 0.16, 0.05), shade(fur, 0.7), { outlineWidth: 0.012 }), side * 0.15, 0.08, 0.02));
    head.add(place(part(box(0.035, 0.04, 0.02), '#111', { outline: false }), side * 0.07, 0.1, 0.225));
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.55, -0.35);
  tail.add(place(part(box(0.05, 0.3, 0.05), fur, { outlineWidth: 0.012 }), 0, 0.13, -0.05));
  g.add(tail);
  const hips = legs(g, fur, [[-0.1, 0.32, 0.25], [0.1, 0.32, 0.25], [-0.1, 0.32, -0.25], [0.1, 0.32, -0.25]], 0.32, 0.08);
  const step = gallop(hips, 6, 0.7);
  return {
    update: (t, motion) => {
      step(motion, t, ctx.seed);
      tail.rotation.z = 0.6 * Math.sin(t * 12 + ctx.seed);
      head.rotation.y = motion.moving ? 0 : 0.3 * Math.sin(t * 0.9 + ctx.seed);
    },
  };
}

export function chicken(g: THREE.Group, ctx: BuildContext): Built {
  const feathers = ctx.color ?? pick(['#f2ede0', '#c8743a', '#3a2a22'], ctx.seed);
  const body = new THREE.Group();
  g.add(body);
  body.add(place(part(ico(0.2), feathers, { outlineWidth: 0.015 }), 0, 0.32, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.48, 0.14);
  body.add(head);
  head.add(place(part(ico(0.1), feathers, { outlineWidth: 0.012 }), 0, 0.04, 0));
  head.add(place(part(cone(0.035, 0.09, 4), '#e8a83a', { outline: false }), 0, 0.03, 0.12)).children.at(-1)!.rotation.x = Math.PI / 2;
  head.add(place(part(box(0.03, 0.08, 0.1), '#d8322a', { outline: false }), 0, 0.15, 0));
  for (const x of [-0.06, 0.06]) g.add(place(part(box(0.025, 0.2, 0.025), '#e8a83a', { outline: false }), x, 0.1, 0));
  return {
    update: (t) => {
      // bica o chão de tempos em tempos
      const peck = Math.max(0, Math.sin(t * 2.4 + ctx.seed * 5)) ** 6;
      head.rotation.x = 1.1 * peck;
      body.rotation.y = 0.4 * Math.sin(t * 0.6 + ctx.seed);
    },
  };
}

export function bird(g: THREE.Group, ctx: BuildContext): Built {
  const color = ctx.color ?? pick(['#3a6ab8', '#2a2a2a', '#d8b83a', '#c8322a'], ctx.seed);
  const body = new THREE.Group();
  body.position.y = 2.6;
  g.add(body);
  body.add(place(part(box(0.16, 0.14, 0.4), color, { outlineWidth: 0.012 }), 0, 0, 0));
  body.add(place(part(cone(0.04, 0.1, 4), '#e8a83a', { outline: false }), 0, 0, 0.25)).children.at(-1)!.rotation.x = Math.PI / 2;
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.08;
    pivot.add(place(part(box(0.45, 0.03, 0.22), shade(color, 1.15), { outlineWidth: 0.01 }), side * 0.22, 0, 0));
    body.add(pivot);
    return { pivot, side };
  });
  return {
    update: (t) => {
      for (const { pivot, side } of wings) pivot.rotation.z = side * 0.7 * Math.sin(t * 14 + ctx.seed);
      body.position.y = 2.6 + 0.25 * Math.sin(t * 1.4 + ctx.seed);
    },
  };
}

export function goat(g: THREE.Group, ctx: BuildContext): Built {
  const hide = ctx.color ?? pick(['#f2ede0', '#8a6a4a', '#3a2a22'], ctx.seed);
  g.add(place(part(box(0.36, 0.36, 0.75), hide), 0, 0.62, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.85, 0.4);
  g.add(head);
  head.add(place(part(box(0.22, 0.24, 0.32), hide), 0, 0.02, 0.1));
  head.add(place(part(box(0.06, 0.14, 0.05), shade(hide, 0.7), { outline: false }), 0, -0.15, 0.2));
  for (const side of [-1, 1]) {
    const horn = part(cone(0.035, 0.22, 4), '#6a5a48', { outlineWidth: 0.01 });
    horn.rotation.x = -0.6;
    head.add(place(horn, side * 0.07, 0.2, 0));
  }
  const hips = legs(g, hide, [[-0.12, 0.45, 0.27], [0.12, 0.45, 0.27], [-0.12, 0.45, -0.27], [0.12, 0.45, -0.27]], 0.45, 0.08);
  const step = gallop(hips, 5, 0.5);
  return {
    update: (t, motion) => {
      step(motion, t, ctx.seed);
      head.rotation.x = 0.25 * Math.max(0, Math.sin(t * 1.5 + ctx.seed)) ** 3;
    },
  };
}

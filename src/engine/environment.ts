// Módulo 3: chão, céu em gradiente, luz com sombra marcada, neblina, clima,
// hora do dia, cenografia de fundo e partículas. Tudo que se move é função do
// tempo absoluto, então o mesmo instante gera sempre o mesmo quadro.

import * as THREE from 'three';
import { PRESET_PALETTES, type PresetPalette } from '../presets';
import { SCENARIOS } from '../scenarios';
import type { EnvironmentDef, ParticleKind, Preset, TimeOfDay, Weather } from '../types';
import { makeRng } from '../util';
import { box, cone, cyl, flat, glow, ico, mix, place, shade } from './geo';
import { part, toonMaterial } from './toon';

export interface EnvironmentObject {
  group: THREE.Group;
  obstacles: THREE.Box3[];
  fog: THREE.Fog;
  palette: PresetPalette;
  night: boolean;
  update: (t: number) => void;
}

export type EnvironmentColors = Pick<EnvironmentDef, 'skyColor' | 'groundColor' | 'fogColor' | 'particles' | 'weather' | 'timeOfDay'>;

type Updater = (t: number) => void;

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

function createSky(horizon: string, top: string): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(horizon) },
      uTop: { value: new THREE.Color(top) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon;
      uniform vec3 uTop;
      varying vec3 vDir;
      void main() {
        float h = smoothstep(0.02, 0.55, normalize(vDir).y);
        gl_FragColor = vec4(mix(uHorizon, uTop, h), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

function disc(radius: number, color: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.CircleGeometry(radius, 20), new THREE.MeshBasicMaterial({ color, fog: false }));
}

// ---------- hora do dia e clima ----------

interface Lighting {
  sky: string;
  skyTop: string;
  fog: string;
  ground: string;
  sunColor: string;
  sunIntensity: number;
  sunDir: [number, number, number];
  ambientColor: string;
  ambientIntensity: number;
  fogNear: number;
  fogFar: number;
}

const TIME_LOOKS: Record<TimeOfDay, Partial<Lighting> & { tint: string; amount: number }> = {
  day: { tint: '#ffffff', amount: 0 },
  sunset: { tint: '#f2a05a', amount: 0.5, sunColor: '#ffb070', sunIntensity: 2.2, sunDir: [-7, 4, 3], ambientColor: '#c98a8a', ambientIntensity: 1.1 },
  dawn: { tint: '#f0c0c8', amount: 0.45, sunColor: '#ffd8c0', sunIntensity: 1.9, sunDir: [7, 4, 3], ambientColor: '#d8b8c8', ambientIntensity: 1.15 },
  night: { tint: '#141b38', amount: 0.78, sunColor: '#8fa6ff', sunIntensity: 0.95, sunDir: [-4, 8, 5], ambientColor: '#3d4680', ambientIntensity: 1.05 },
};

function lighting(pal: PresetPalette, colors: EnvironmentColors, preset: Preset, time: TimeOfDay, weather: Weather): Lighting {
  const l: Lighting = {
    sky: colors.skyColor,
    skyTop: mix(colors.skyColor, pal.skyTop, 0.8),
    fog: colors.fogColor,
    ground: colors.groundColor,
    sunColor: pal.sunColor,
    sunIntensity: pal.sunIntensity,
    sunDir: pal.sunDir,
    ambientColor: pal.ambientColor,
    ambientIntensity: pal.ambientIntensity,
    fogNear: pal.fogNear,
    fogFar: pal.fogFar,
  };
  // só muda a hora quando ela difere da paleta original do cenário
  if (time !== SCENARIOS[preset].timeOfDay) {
    const look = TIME_LOOKS[time];
    l.sky = mix(l.sky, look.tint, look.amount);
    l.skyTop = mix(l.skyTop, time === 'night' ? '#05061a' : look.tint, look.amount);
    l.fog = mix(l.fog, look.tint, look.amount);
    l.ground = mix(l.ground, time === 'night' ? '#1a2038' : look.tint, look.amount * 0.45);
    Object.assign(l, Object.fromEntries(Object.entries(look).filter(([k]) => k in l)));
  }
  if (weather === 'cloudy' || weather === 'rain' || weather === 'storm') {
    const gray = weather === 'storm' ? '#3a4152' : weather === 'rain' ? '#7a8492' : '#aab3bc';
    const amount = weather === 'storm' ? 0.7 : weather === 'rain' ? 0.55 : 0.4;
    l.sky = mix(l.sky, gray, amount);
    l.skyTop = mix(l.skyTop, shade(gray, 0.8), amount);
    l.fog = mix(l.fog, gray, amount);
    l.ground = mix(l.ground, shade(l.ground, 0.7), amount * 0.6);
    l.sunIntensity *= weather === 'storm' ? 0.35 : weather === 'rain' ? 0.5 : 0.62;
    l.ambientColor = mix(l.ambientColor, '#c8ced6', amount);
    l.fogNear *= weather === 'cloudy' ? 0.9 : 0.6;
    l.fogFar *= weather === 'cloudy' ? 0.9 : 0.65;
  }
  if (weather === 'fog') {
    l.fog = mix(l.fog, '#d8dce0', 0.55);
    l.sky = mix(l.sky, '#d8dce0', 0.55);
    l.skyTop = mix(l.skyTop, '#c8ced4', 0.5);
    l.fogNear = 3;
    l.fogFar = 22;
    l.sunIntensity *= 0.7;
  }
  return l;
}

function addLights(group: THREE.Group, l: Lighting): { ambient: THREE.AmbientLight; sun: THREE.DirectionalLight } {
  const sun = new THREE.DirectionalLight(l.sunColor, l.sunIntensity);
  sun.position.set(l.sunDir[0] * 3, l.sunDir[1] * 3, l.sunDir[2] * 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -16;
  cam.right = 16;
  cam.top = 16;
  cam.bottom = -16;
  cam.near = 1;
  cam.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);
  const ambient = new THREE.AmbientLight(l.ambientColor, l.ambientIntensity);
  group.add(ambient);
  return { ambient, sun };
}

// ---------- peças de fundo reutilizáveis ----------

const bgOpts = { outline: false, castShadow: false };

function mesas(group: THREE.Group, color: string, rng: () => number, count = 7): void {
  for (let i = 0; i < count; i++) {
    const w = 8 + rng() * 12;
    const h = 2 + rng() * 4.5;
    const mesa = part(flat(new THREE.CylinderGeometry(w * 0.32, w * 0.5, h, 6)), color, bgOpts);
    mesa.position.set(-50 + i * 16 + rng() * 6, h / 2 - 0.1, -38 - rng() * 14);
    mesa.rotation.y = rng() * 3;
    group.add(mesa);
  }
}

function hills(group: THREE.Group, color: string, rng: () => number, count = 8, height = 5, distance = 40): void {
  for (let i = 0; i < count; i++) {
    const r = 9 + rng() * 9;
    const h = height * (0.6 + rng() * 0.8);
    const hill = part(cone(r, h, 7), color, bgOpts);
    hill.position.set(-52 + i * 15 + rng() * 5, h / 2 - 0.2, -distance - rng() * 12);
    hill.rotation.y = rng() * 3;
    group.add(hill);
  }
}

function treeLine(group: THREE.Group, foliage: string, trunk: string, rng: () => number, count: number, zMin: number, zMax: number, clearX = 5.5): void {
  const dark = mix(foliage, '#16321f', 0.4);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 10) {
    const x = (rng() - 0.5) * 44;
    const z = zMin - rng() * (zMax - zMin);
    if (Math.abs(x) < clearX && z > -13) continue;
    const s = 0.9 + rng() * 0.9;
    const tree = new THREE.Group();
    tree.add(place(part(cyl(0.16, 0.24, 1.4, 5), trunk, { outline: false }), 0, 0.7, 0));
    tree.add(place(part(cone(1.25, 2.3, 6), placed % 2 ? foliage : dark), 0, 2.2, 0));
    tree.add(place(part(cone(0.9, 1.9, 6), placed % 2 ? dark : foliage), 0, 3.4, 0));
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * 6;
    tree.scale.setScalar(s);
    group.add(tree);
    placed++;
  }
}

/** Fileira de prédios ao fundo; à noite as janelas acendem. */
function skyline(group: THREE.Group, obstacles: THREE.Box3[], rng: () => number, night: boolean, colors: string[], z = -16): void {
  for (let i = 0; i < 12; i++) {
    const w = 3 + rng() * 3;
    const h = 5 + rng() * 9;
    const x = -30 + i * 5.2 + rng() * 1.5;
    const color = colors[i % colors.length];
    const tower = place(part(box(w, h, 3), night ? shade(color, 0.45) : color, bgOpts), x, h / 2, z - rng() * 6);
    group.add(tower);
    obstacles.push(new THREE.Box3().setFromObject(tower));
    if (night) {
      for (let k = 0; k < 6; k++) {
        if (rng() < 0.45) continue;
        const win = new THREE.Mesh(box(0.5, 0.6, 0.05), glow('#ffd88a'));
        win.position.set(x - w / 2 + 0.6 + rng() * (w - 1.2), 1.5 + rng() * (h - 2.5), z + 1.55);
        group.add(win);
      }
    }
  }
}

function stars(group: THREE.Group, rng: () => number, count = 260): Updater {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const elev = 0.12 + rng() * 1.3;
    positions.set([Math.cos(a) * 120 * Math.cos(elev), 120 * Math.sin(elev), -Math.abs(Math.sin(a)) * 120 * Math.cos(elev) - 10], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: '#fdf6dc', size: 0.7, fog: false, transparent: true, depthWrite: false });
  group.add(new THREE.Points(geo, mat));
  return (t) => {
    mat.opacity = 0.75 + 0.25 * Math.sin(t * 2.1);
  };
}

function clouds(group: THREE.Group, rng: () => number, color: string, count: number, height = 14): Updater {
  const list: THREE.Group[] = [];
  for (let i = 0; i < count; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = part(ico(1.4 + rng() * 1.4), k % 2 ? color : shade(color, 0.92), bgOpts);
      puff.scale.y = 0.55;
      c.add(place(puff, k * 1.8 - 2.7, rng() * 0.6, rng() * 0.8));
    }
    c.position.set(-40 + rng() * 80, height + rng() * 6, -25 - rng() * 30);
    c.userData.speed = 0.3 + rng() * 0.4;
    c.userData.x = c.position.x;
    group.add(c);
    list.push(c);
  }
  return (t) => {
    for (const c of list) c.position.x = wrap(c.userData.x + 40 + t * c.userData.speed, 80) - 40;
  };
}

/** Faixa de água com ondas que correm; `zFrom`..`zTo` delimitam a faixa. */
function water(group: THREE.Group, color: string, zFrom: number, zTo: number, width = 400): Updater {
  const depth = zFrom - zTo;
  const sea = part(new THREE.PlaneGeometry(width, depth), color, { outline: false, castShadow: false });
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, (zFrom + zTo) / 2);
  group.add(sea);
  const crests: THREE.Mesh[] = [];
  const foam = new THREE.MeshBasicMaterial({ color: mix(color, '#ffffff', 0.55), fog: true });
  const rows = Math.max(3, Math.floor(depth / 2.2));
  for (let i = 0; i < rows * 3; i++) {
    const crest = new THREE.Mesh(box(1.4 + (i % 3) * 0.6, 0.03, 0.1), foam);
    crest.userData.base = [-14 + ((i * 37) % 28), zFrom - ((i % rows) + 0.5) * (depth / rows)];
    group.add(crest);
    crests.push(crest);
  }
  return (t) => {
    crests.forEach((crest, i) => {
      const [x, z] = crest.userData.base as [number, number];
      crest.position.set(wrap(x + 14 + t * 0.6, 28) - 14, 0.05 + 0.03 * Math.sin(t * 2 + i), z + 0.25 * Math.sin(t * 1.2 + i));
    });
  };
}

/** Sala: parede de fundo em z = -5.5, paredes laterais e uma janela. */
function room(group: THREE.Group, pal: PresetPalette, view: string, opts: { tall?: boolean; stained?: boolean; night?: boolean } = {}): void {
  const height = opts.tall ? 13 : 9;
  const wallColor = opts.night ? mix(pal.wall, '#1c2140', 0.35) : pal.wall;
  const back = part(box(40, height, 0.4), wallColor, bgOpts);
  back.position.set(0, height / 2, -5.7);
  group.add(back);
  for (const side of [-1, 1]) {
    const wall = part(box(0.4, height, 30), shade(wallColor, 0.82), bgOpts);
    wall.position.set(side * 11, height / 2, 5);
    group.add(wall);
  }
  group.add(place(part(box(40, 0.3, 0.1), pal.wood, bgOpts), 0, 0.15, -5.46));
  const windows = opts.stained ? [-3.5, 3.5] : [1.9];
  for (const x of windows) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, opts.stained ? 3 : 1.9), glow(view));
    pane.position.set(x, opts.stained ? 4.2 : 3.1, -5.48);
    group.add(pane);
    if (opts.stained) {
      ['#d84a3a', '#3f6fd8', '#e8c040', '#4fae5a'].forEach((c, i) => {
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.4), glow(c));
        glass.position.set(x + (i % 2 ? 0.4 : -0.4), 3.5 + Math.floor(i / 2) * 1.45, -5.47);
        group.add(glass);
      });
    } else if (opts.night) {
      const moon = disc(0.3, '#f6f1d5');
      moon.position.set(x + 0.4, 3.5, -5.47);
      group.add(moon);
    }
    const frame = (w: number, h: number, dx: number, dy: number): void => {
      group.add(place(part(box(w, h, 0.12), pal.wood, { outlineWidth: 0.025, castShadow: false }), x + dx, (opts.stained ? 4.2 : 3.1) + dy, -5.44));
    };
    const half = opts.stained ? 1.5 : 1;
    frame(1.95, 0.13, 0, half);
    frame(1.95, 0.13, 0, -half);
    frame(0.13, half * 2 + 0.1, -0.9, 0);
    frame(0.13, half * 2 + 0.1, 0.9, 0);
  }
}

// ---------- cenografia por cenário ----------

function backdrop(preset: Preset, group: THREE.Group, obstacles: THREE.Box3[], pal: PresetPalette, l: Lighting, rng: () => number, night: boolean): Updater[] {
  const updates: Updater[] = [];
  const sunDisc = (r: number, color: string, x: number, y: number) => {
    const d = disc(r, color);
    d.position.set(x, y, -110);
    group.add(d);
  };
  switch (preset) {
    case 'sertao_day':
    case 'country_road':
      if (!night) sunDisc(5, '#fff6d8', -16, 30);
      mesas(group, mix(l.ground, '#7a4a2c', 0.45), rng);
      break;
    case 'caatinga_drought': {
      if (!night) sunDisc(6, '#fffbe8', 12, 34);
      mesas(group, mix(l.ground, '#8a6a4c', 0.4), rng, 6);
      // rachaduras do chão seco
      for (let i = 0; i < 40; i++) {
        const crack = part(box(0.05, 0.01, 0.6 + rng() * 1.6), shade(l.ground, 0.7), bgOpts);
        crack.rotation.y = rng() * Math.PI;
        crack.position.set((rng() - 0.5) * 22, 0.012, -12 + rng() * 16);
        group.add(crack);
      }
      break;
    }
    case 'farm':
    case 'flower_field':
      hills(group, mix(pal.foliage, '#2f5a32', 0.35), rng, 8, 4, 34);
      treeLine(group, pal.foliage, pal.trunk, rng, 10, -18, -30);
      if (preset === 'flower_field') {
        for (let i = 0; i < 120; i++) {
          const dot = part(ico(0.09), ['#f04a5a', '#f6c63a', '#ffffff', '#c86ae0'][i % 4], { outline: false, castShadow: false });
          dot.position.set((rng() - 0.5) * 30, 0.08, -2 - rng() * 22);
          group.add(dot);
        }
      }
      break;
    case 'village_sunset':
      if (!night) sunDisc(11, '#ffd98a', 9, 9);
      hills(group, mix(l.ground, '#4a2c3a', 0.55), rng);
      break;
    case 'city_street':
    case 'street_market':
    case 'city_night':
    case 'carnival': {
      const lit = night || preset === 'city_night';
      skyline(group, obstacles, rng, lit, preset === 'carnival' ? ['#f0a0b0', '#f0c060', '#8ac8f0', '#a8e0a0'] : ['#b8a890', '#c9897a', '#8fa0b8', '#d8c0a0', '#9a8a7a']);
      // calçadas e faixa de rua
      for (const x of [-4.2, 4.2]) group.add(place(part(box(2.4, 0.12, 60), '#b8b2a8', bgOpts), x, 0.06, -10));
      for (let i = 0; i < 10; i++) group.add(place(part(box(0.15, 0.015, 1.4), '#f2efe0', bgOpts), 0, 0.012, 2 - i * 3.2));
      break;
    }
    case 'town_square':
      skyline(group, obstacles, rng, night, ['#e8d8b8', '#d8a890', '#c8d0b0'], -20);
      group.add(place(part(cyl(6, 6, 0.04, 24), '#d8c8a8', bgOpts), 0, 0.02, -3));
      treeLine(group, pal.foliage, pal.trunk, rng, 8, -12, -18, 7);
      break;
    case 'forest':
      treeLine(group, pal.foliage, pal.trunk, rng, 30, -6, -32);
      break;
    case 'river': {
      updates.push(water(group, '#4a8ab8', -4.5, -10));
      treeLine(group, pal.foliage, pal.trunk, rng, 14, -11, -26, 0);
      for (let i = 0; i < 12; i++) {
        const reed = part(box(0.05, 0.6 + rng() * 0.5, 0.05), '#6a8a3a', { outline: false });
        reed.position.set((rng() - 0.5) * 16, 0.4, -4.2 + rng() * 0.6);
        group.add(reed);
      }
      break;
    }
    case 'mountain': {
      for (let i = 0; i < 6; i++) {
        const h = 14 + rng() * 14;
        const m = part(cone(10 + rng() * 6, h, 5), mix('#7a7a72', '#4a5a6a', rng()), bgOpts);
        m.position.set(-40 + i * 16 + rng() * 6, h / 2 - 0.5, -45 - rng() * 15);
        group.add(m);
        const cap = part(cone(3.2, h * 0.22, 5), '#eef2f4', bgOpts);
        cap.position.set(m.position.x, h - h * 0.11 - 0.5, m.position.z);
        group.add(cap);
      }
      hills(group, mix(l.ground, '#5a6a4a', 0.3), rng, 7, 3, 22);
      break;
    }
    case 'beach':
    case 'harbor': {
      if (!night) sunDisc(6, '#fff6d8', 14, 26);
      updates.push(water(group, '#3f9ac8', -5, -140));
      if (preset === 'harbor') {
        for (let i = 0; i < 5; i++) {
          const w = 4 + rng() * 2;
          group.add(place(part(box(w, 3 + rng() * 2, 3), ['#c9a27a', '#a8b8c8', '#d8b890'][i % 3], bgOpts), -14 + i * 7, 2, -3.8));
        }
      }
      break;
    }
    case 'open_sea':
      if (!night) sunDisc(6, '#fff6d8', -14, 22);
      updates.push(water(group, l.ground, 12, -140));
      break;
    case 'interior_night':
      room(group, pal, mix(l.sky, '#3b4f9a', 0.5), { night: true });
      break;
    case 'living_room':
    case 'kitchen':
    case 'classroom':
      room(group, pal, night ? '#1f2a50' : '#bfe0f4', { night });
      break;
    case 'church':
      room(group, pal, '#fff2c8', { tall: true, stained: true });
      break;
    case 'festa_junina': {
      hills(group, '#2a2438', rng, 7, 3, 30);
      // varal de lâmpadas ao fundo
      for (let i = 0; i < 24; i++) {
        const bulb = new THREE.Mesh(ico(0.09), glow(['#ffd27a', '#ff8a6a', '#8ae0ff'][i % 3]));
        bulb.position.set(-12 + i, 3.6 - Math.sin((i / 24) * Math.PI * 4) * 0.3, -9);
        group.add(bulb);
      }
      break;
    }
    case 'starry_night': {
      const moon = disc(5, '#f6f1d5');
      moon.position.set(-14, 24, -110);
      group.add(moon);
      hills(group, '#1c2430', rng, 8, 4, 30);
      break;
    }
    case 'dream': {
      const moon = disc(16, '#fff0f8');
      moon.position.set(12, 30, -120);
      group.add(moon);
      for (let i = 0; i < 7; i++) {
        const isle = new THREE.Group();
        const rock = part(cone(2 + rng() * 2, 3, 6), '#b89ad8', bgOpts);
        rock.rotation.x = Math.PI;
        isle.add(rock);
        isle.add(place(part(cyl(2.2, 2.2, 0.4, 6), pal.foliage, bgOpts), 0, 1.6, 0));
        isle.position.set(-30 + i * 10 + rng() * 4, 6 + rng() * 10, -30 - rng() * 25);
        isle.userData.y = isle.position.y;
        group.add(isle);
        updates.push((t) => {
          isle.position.y = isle.userData.y + 0.8 * Math.sin(t * 0.5 + i);
        });
      }
      break;
    }
  }
  return updates;
}

// ---------- partículas ----------

function createParticles(kind: ParticleKind, weather: Weather, colors: EnvironmentColors, rng: () => number): { object: THREE.Object3D; update: Updater } | null {
  if (kind === 'none') return null;
  const windy = weather === 'wind' || weather === 'storm';

  if (kind === 'rain') {
    const count = weather === 'storm' ? 620 : 320;
    const height = 11;
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = (rng() - 0.5) * 16;
      seeds[i * 4 + 1] = rng() * height;
      seeds[i * 4 + 2] = -13 + rng() * 21;
      seeds[i * 4 + 3] = 0.8 + rng() * 0.5;
    }
    const slant = windy ? 0.35 : 0.07;
    const positions = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#dbe9ff', transparent: true, opacity: 0.65 });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return {
      object: lines,
      update: (t) => {
        for (let i = 0; i < count; i++) {
          const y = height - wrap(seeds[i * 4 + 1] + t * 15 * seeds[i * 4 + 3], height);
          const x = seeds[i * 4] + (windy ? (height - y) * slant : 0);
          const z = seeds[i * 4 + 2];
          positions.set([x, y, z, x + slant, y - 0.5, z], i * 6);
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  }

  const count = kind === 'fireflies' ? 46 : kind === 'confetti' ? 160 : kind === 'embers' ? 60 : kind === 'dust' ? 110 : 70;
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const tint = new Float32Array(count * 3);
  const baseTint = new Float32Array(count * 3);
  const palettes: Partial<Record<ParticleKind, string[]>> = {
    leaves: ['#7fae45', '#d08a2e', '#b8562a', '#9bbf4f'],
    petals: ['#f6a8c8', '#ffffff', '#f6d0e0', '#f8e0a0'],
    confetti: ['#f04a5a', '#f6c63a', '#3f8fd8', '#4fae5a', '#e870a8', '#ffffff'],
    embers: ['#ffb43a', '#ff6a2a', '#ffd27a'],
  };
  const dustColor = mix(colors.groundColor, '#fff4dc', 0.7);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rng() - 0.5) * 15;
    base[i * 3 + 1] = kind === 'fireflies' ? 0.4 + rng() * 3.2 : kind === 'embers' ? rng() * 4 : rng() * 7.5;
    base[i * 3 + 2] = kind === 'embers' ? -3 + rng() * 4 : -11 + rng() * 18;
    if (kind === 'embers') base[i * 3] = (rng() - 0.5) * 3;
    phase[i] = rng() * Math.PI * 2;
    const list = palettes[kind];
    const c = new THREE.Color(list ? list[i % list.length] : kind === 'fireflies' ? '#fff07a' : dustColor);
    baseTint.set([c.r, c.g, c.b], i * 3);
  }
  tint.set(baseTint);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  const glowing = kind === 'fireflies' || kind === 'embers';
  const mat = new THREE.PointsMaterial({
    size: glowing ? 0.14 : kind === 'dust' ? 0.07 : 0.13,
    vertexColors: true,
    transparent: true,
    opacity: kind === 'dust' ? 0.75 : 1,
    depthWrite: false,
    fog: !glowing,
    blending: glowing ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const drift = windy ? 2.6 : 1;

  const update: Updater = (t) => {
    for (let i = 0; i < count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const ph = phase[i];
      let x = bx;
      let y = by;
      let z = bz;
      if (kind === 'dust') {
        x = wrap(bx + 7.5 + t * (0.25 + 0.2 * Math.sin(ph)) * drift, 15) - 7.5;
        y = by + 0.3 * Math.sin(t * 0.6 + ph);
        z = bz + 0.3 * Math.cos(t * 0.4 + ph);
      } else if (kind === 'fireflies') {
        x = bx + 0.9 * Math.sin(t * 0.7 + ph);
        y = by + 0.45 * Math.sin(t * 0.9 + ph * 2);
        z = bz + 0.9 * Math.cos(t * 0.6 + ph);
        const blink = 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.2 + ph * 3));
        tint[i * 3] = baseTint[i * 3] * blink;
        tint[i * 3 + 1] = baseTint[i * 3 + 1] * blink;
        tint[i * 3 + 2] = baseTint[i * 3 + 2] * blink;
      } else if (kind === 'embers') {
        // fagulhas sobem da fogueira e somem
        y = wrap(by + t * (0.9 + 0.4 * Math.sin(ph)), 4.5);
        x = bx + 0.3 * Math.sin(t * 1.7 + ph) + y * 0.05 * Math.sin(ph);
        const fade = 1 - y / 4.5;
        tint[i * 3] = baseTint[i * 3] * fade;
        tint[i * 3 + 1] = baseTint[i * 3 + 1] * fade;
        tint[i * 3 + 2] = baseTint[i * 3 + 2] * fade;
      } else {
        // folhas, pétalas e confete caem girando
        const fall = kind === 'confetti' ? 1.1 : 0.7;
        y = 7.5 - wrap(by + t * (fall + 0.4 * Math.abs(Math.sin(ph))), 7.5);
        x = bx + 0.6 * Math.sin(t * 1.2 + ph) + (windy ? wrap(t * 1.5 + ph, 6) - 3 : 0);
        z = bz + 0.4 * Math.cos(t * 0.9 + ph);
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    if (glowing) geo.attributes.color.needsUpdate = true;
  };
  return { object: points, update };
}

export function createEnvironment(preset: Preset, colors: EnvironmentColors, seed = 1): EnvironmentObject {
  const scenario = SCENARIOS[preset] ?? SCENARIOS.sertao_day;
  const palette = PRESET_PALETTES[preset] ?? PRESET_PALETTES.sertao_day;
  const rng = makeRng(seed);
  const time = colors.timeOfDay ?? scenario.timeOfDay;
  const weather = colors.weather ?? scenario.weather;
  const night = time === 'night';
  const l = lighting(palette, colors, preset, time, weather);

  const group = new THREE.Group();
  group.name = `environment:${preset}`;

  if (preset !== 'open_sea') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toonMaterial(l.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
  }
  group.add(createSky(l.sky, l.skyTop));
  const { ambient, sun } = addLights(group, l);

  const obstacles: THREE.Box3[] = [];
  const updates: Updater[] = backdrop(preset, group, obstacles, palette, l, rng, night);
  if (!scenario.indoor) {
    if (night) updates.push(stars(group, rng, preset === 'starry_night' ? 520 : 200));
    if (weather === 'cloudy' || weather === 'rain' || weather === 'storm') {
      updates.push(clouds(group, rng, weather === 'storm' ? '#5a6272' : weather === 'rain' ? '#9aa2ac' : '#eef0f2', weather === 'cloudy' ? 7 : 10));
    } else if (!night && preset !== 'dream') {
      updates.push(clouds(group, rng, '#ffffff', 3, 18));
    }
  }

  // chuva e tempestade trocam as partículas do cenário; dentro de casa não chove
  const rainy = (weather === 'rain' || weather === 'storm') && !scenario.indoor;
  // vento sem nada no ar não aparece: sopra folhas
  const windy = weather === 'wind' && (colors.particles === 'none' || colors.particles === 'dust') && !scenario.indoor;
  const particles = createParticles(rainy ? 'rain' : windy ? 'leaves' : colors.particles, weather, colors, rng);
  if (particles) {
    group.add(particles.object);
    updates.push(particles.update);
  }

  if (weather === 'storm') {
    // relâmpagos em instantes fixos, sempre os mesmos para o mesmo t
    const baseAmbient = ambient.intensity;
    const baseSun = sun.intensity;
    updates.push((t) => {
      const slot = Math.floor(t * 0.7);
      const strike = hash(slot + seed) > 0.62 ? Math.max(0, 1 - (t * 0.7 - slot) * 9) : 0;
      ambient.intensity = baseAmbient + strike * 3.2;
      sun.intensity = baseSun + strike * 2.5;
    });
  }

  return {
    group,
    palette,
    night,
    obstacles,
    fog: new THREE.Fog(l.fog, l.fogNear, l.fogFar),
    update: (t) => {
      for (const u of updates) u(t);
    },
  };
}

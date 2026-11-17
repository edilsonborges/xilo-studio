// Módulo 3: chão, céu em gradiente, luz com sombra marcada, neblina e
// partículas atmosféricas. Tudo que se move é função do tempo absoluto.

import * as THREE from 'three';
import { PRESET_PALETTES, type PresetPalette } from '../presets';
import type { EnvironmentDef, ParticleKind, Preset } from '../types';
import { makeRng } from '../util';
import { part, toonMaterial } from './toon';

export interface EnvironmentObject {
  group: THREE.Group;
  fog: THREE.Fog;
  palette: PresetPalette;
  update: (t: number) => void;
}

export type EnvironmentColors = Pick<EnvironmentDef, 'skyColor' | 'groundColor' | 'fogColor' | 'particles'>;

const wrap = (v: number, size: number): number => ((v % size) + size) % size;

const mixHex = (a: string, b: string, t: number): string =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  if (g !== geo) geo.dispose();
  return g;
}

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
  const material = new THREE.MeshBasicMaterial({ color, fog: false });
  return new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material);
}

function addLights(group: THREE.Group, pal: PresetPalette): void {
  const sun = new THREE.DirectionalLight(pal.sunColor, pal.sunIntensity);
  sun.position.set(pal.sunDir[0] * 3, pal.sunDir[1] * 3, pal.sunDir[2] * 3);
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
  group.add(new THREE.AmbientLight(pal.ambientColor, pal.ambientIntensity));
}

// ---------- cenografia de fundo por preset ----------

function sertaoBackdrop(group: THREE.Group, colors: EnvironmentColors, rng: () => number): void {
  const sun = disc(5, '#fff6d8');
  sun.position.set(-16, 30, -110);
  group.add(sun);
  const rock = mixHex(colors.groundColor, '#7a4a2c', 0.45);
  for (let i = 0; i < 7; i++) {
    const w = 8 + rng() * 12;
    const h = 2 + rng() * 4.5;
    const mesa = part(flat(new THREE.CylinderGeometry(w * 0.32, w * 0.5, h, 6)), rock, { outline: false, castShadow: false });
    mesa.position.set(-50 + i * 16 + rng() * 6, h / 2 - 0.1, -38 - rng() * 14);
    mesa.rotation.y = rng() * 3;
    group.add(mesa);
  }
}

function sunsetBackdrop(group: THREE.Group, colors: EnvironmentColors, rng: () => number): void {
  const sun = disc(11, '#ffd98a');
  sun.position.set(9, 9, -120);
  group.add(sun);
  const hill = mixHex(colors.groundColor, '#4a2c3a', 0.55);
  for (let i = 0; i < 8; i++) {
    const r = 9 + rng() * 9;
    const h = 3 + rng() * 5;
    const cone = part(flat(new THREE.ConeGeometry(r, h, 6)), hill, { outline: false, castShadow: false });
    cone.position.set(-52 + i * 15 + rng() * 5, h / 2 - 0.2, -40 - rng() * 12);
    cone.rotation.y = rng() * 3;
    group.add(cone);
  }
}

function forestBackdrop(group: THREE.Group, pal: PresetPalette, rng: () => number): void {
  const dark = mixHex(pal.foliage, '#16321f', 0.4);
  let placed = 0;
  while (placed < 30) {
    const x = (rng() - 0.5) * 44;
    const z = -6 - rng() * 26;
    // deixa um corredor livre no centro, onde ficam os personagens e props
    if (Math.abs(x) < 5.5 && z > -13) continue;
    const s = 0.9 + rng() * 0.9;
    const tree = new THREE.Group();
    const trunk = part(flat(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 5)), pal.trunk, { outline: false });
    trunk.position.y = 0.7;
    const low = part(flat(new THREE.ConeGeometry(1.25, 2.3, 6)), placed % 2 ? pal.foliage : dark);
    low.position.y = 2.2;
    const high = part(flat(new THREE.ConeGeometry(0.9, 1.9, 6)), placed % 2 ? dark : pal.foliage);
    high.position.y = 3.4;
    tree.add(trunk, low, high);
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * 6;
    tree.scale.setScalar(s);
    group.add(tree);
    placed++;
  }
}

/** Quarto: parede de fundo em z = -5.5 com uma janela para a noite. */
function interiorBackdrop(group: THREE.Group, pal: PresetPalette, colors: EnvironmentColors): void {
  const wallColor = mixHex(pal.wall, '#1c2140', 0.35);
  const wallOpts = { outline: false, castShadow: false };
  const back = part(new THREE.BoxGeometry(40, 9, 0.4), wallColor, wallOpts);
  back.position.set(0, 4.5, -5.7);
  group.add(back);
  for (const side of [-1, 1]) {
    const wall = part(new THREE.BoxGeometry(0.4, 9, 30), mixHex(wallColor, '#000000', 0.18), wallOpts);
    wall.position.set(side * 11, 4.5, 5);
    group.add(wall);
  }
  const baseboard = part(new THREE.BoxGeometry(40, 0.3, 0.1), pal.wood, wallOpts);
  baseboard.position.set(0, 0.15, -5.46);
  group.add(baseboard);

  // janela: a "vista" é um plano sem iluminação, então brilha como a noite lá fora
  const view = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.9),
    new THREE.MeshBasicMaterial({ color: mixHex(colors.skyColor, '#3b4f9a', 0.5), fog: false }),
  );
  view.position.set(1.9, 3.1, -5.48);
  group.add(view);
  const moon = disc(0.3, '#f6f1d5');
  moon.position.set(2.3, 3.5, -5.47);
  group.add(moon);
  const frame = (w: number, h: number, x: number, y: number): void => {
    const bar = part(new THREE.BoxGeometry(w, h, 0.12), pal.wood, { outlineWidth: 0.025, castShadow: false });
    bar.position.set(1.9 + x, 3.1 + y, -5.44);
    group.add(bar);
  };
  frame(1.95, 0.13, 0, 1);
  frame(1.95, 0.13, 0, -1);
  frame(0.13, 2.1, -0.9, 0);
  frame(0.13, 2.1, 0.9, 0);
  frame(0.08, 1.9, 0, 0);
  frame(1.7, 0.08, 0, 0);
}

// ---------- partículas ----------

function createParticles(kind: ParticleKind, colors: EnvironmentColors, rng: () => number): { object: THREE.Object3D; update: (t: number) => void } | null {
  if (kind === 'none') return null;

  if (kind === 'rain') {
    const count = 320;
    const height = 11;
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = (rng() - 0.5) * 16;
      seeds[i * 4 + 1] = rng() * height;
      seeds[i * 4 + 2] = -13 + rng() * 21;
      seeds[i * 4 + 3] = 0.8 + rng() * 0.5;
    }
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
          const x = seeds[i * 4];
          const y = height - wrap(seeds[i * 4 + 1] + t * 15 * seeds[i * 4 + 3], height);
          const z = seeds[i * 4 + 2];
          positions.set([x, y, z, x + 0.07, y - 0.5, z], i * 6);
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  }

  const count = kind === 'fireflies' ? 46 : kind === 'leaves' ? 70 : 110;
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const tint = new Float32Array(count * 3);
  const baseTint = new Float32Array(count * 3);
  const leafColors = ['#7fae45', '#d08a2e', '#b8562a', '#9bbf4f'].map((c) => new THREE.Color(c));
  const dustColor = new THREE.Color(mixHex(colors.groundColor, '#fff4dc', 0.7));
  const glow = new THREE.Color('#fff07a');

  for (let i = 0; i < count; i++) {
    base[i * 3] = (rng() - 0.5) * 15;
    base[i * 3 + 1] = kind === 'fireflies' ? 0.4 + rng() * 3.2 : rng() * 7.5;
    base[i * 3 + 2] = -11 + rng() * 18;
    phase[i] = rng() * Math.PI * 2;
    const c = kind === 'leaves' ? leafColors[i % leafColors.length] : kind === 'fireflies' ? glow : dustColor;
    baseTint.set([c.r, c.g, c.b], i * 3);
  }
  tint.set(baseTint);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.PointsMaterial({
    size: kind === 'fireflies' ? 0.14 : kind === 'leaves' ? 0.13 : 0.07,
    vertexColors: true,
    transparent: true,
    opacity: kind === 'dust' ? 0.75 : 1,
    depthWrite: false,
    fog: kind !== 'fireflies',
    blending: kind === 'fireflies' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const update = (t: number): void => {
    for (let i = 0; i < count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const ph = phase[i];
      let x = bx;
      let y = by;
      let z = bz;
      if (kind === 'dust') {
        x = wrap(bx + 7.5 + t * (0.25 + 0.2 * Math.sin(ph)), 15) - 7.5;
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
      } else {
        // leaves
        y = 7.5 - wrap(by + t * (0.7 + 0.4 * Math.abs(Math.sin(ph))), 7.5);
        x = bx + 0.6 * Math.sin(t * 1.2 + ph);
        z = bz + 0.4 * Math.cos(t * 0.9 + ph);
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    if (kind === 'fireflies') geo.attributes.color.needsUpdate = true;
  };
  return { object: points, update };
}

export function createEnvironment(
  preset: Preset,
  colors: EnvironmentColors,
  seed = 1,
): EnvironmentObject {
  const palette = PRESET_PALETTES[preset];
  const rng = makeRng(seed);
  const group = new THREE.Group();
  group.name = `environment:${preset}`;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toonMaterial(colors.groundColor));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // o topo do céu acompanha a cor pedida, puxando para o zênite do preset
  group.add(createSky(colors.skyColor, mixHex(colors.skyColor, palette.skyTop, 0.8)));
  addLights(group, palette);

  switch (preset) {
    case 'sertao_day':
      sertaoBackdrop(group, colors, rng);
      break;
    case 'village_sunset':
      sunsetBackdrop(group, colors, rng);
      break;
    case 'forest':
      forestBackdrop(group, palette, rng);
      break;
    case 'interior_night':
      interiorBackdrop(group, palette, colors);
      break;
  }

  const particles = createParticles(colors.particles, colors, rng);
  if (particles) group.add(particles.object);

  return {
    group,
    palette,
    fog: new THREE.Fog(colors.fogColor, palette.fogNear, palette.fogFar),
    update: (t) => particles?.update(t),
  };
}

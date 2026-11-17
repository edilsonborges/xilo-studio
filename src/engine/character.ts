// Módulo 3: humanoide low-poly articulado e suas poses.
//
// As poses são função pura do tempo: poseCharacter(rig, anim, t) define todas
// as rotações do zero a cada chamada, então o mesmo t dá sempre o mesmo frame.

import * as THREE from 'three';
import { STRAW_COLOR } from '../presets';
import type { Accessory, AnimationName, CharacterKind } from '../types';
import { hashString } from '../util';
import { part } from './toon';

export interface CharacterConfig {
  id: string;
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory: Accessory;
  kind?: CharacterKind;
}

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  mouth: THREE.Mesh;
  eyes: THREE.Mesh[];
  /** defasagem por personagem, para dois bonecos não se moverem em uníssono */
  phase: number;
  kind: CharacterKind;
  /** idosos se movem mais devagar e com o tronco curvado */
  speed: number;
  stoop: number;
  /** saco que aparece só na ação "carry" */
  carried: THREE.Mesh;
}

const HIP_HEIGHT = 0.86;
const HAIR_COLORS = ['#2a1b12', '#3a2416', '#1a1410', '#5a3a22'];
const GRAY_HAIR = '#d6d2c8';
const SHOE_COLOR = '#2b2420';

const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

function pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function limbSegment(parent: THREE.Object3D, w: number, len: number, color: string): THREE.Mesh {
  const mesh = part(box(w, len, w), color);
  mesh.position.y = -len / 2;
  parent.add(mesh);
  return mesh;
}

function buildArm(torso: THREE.Group, side: -1 | 1, shirt: string, skin: string) {
  const shoulder = pivot(torso, side * 0.335, 0.5, 0);
  limbSegment(shoulder, 0.15, 0.3, shirt);
  const elbow = pivot(shoulder, 0, -0.3, 0);
  limbSegment(elbow, 0.13, 0.3, skin);
  return { shoulder, elbow };
}

function buildLeg(hips: THREE.Group, side: -1 | 1, upper: string, lower: string) {
  const hip = pivot(hips, side * 0.13, 0, 0);
  limbSegment(hip, 0.2, 0.43, upper);
  const knee = pivot(hip, 0, -0.43, 0);
  limbSegment(knee, 0.18, 0.36, lower);
  const foot = part(box(0.2, 0.09, 0.3), SHOE_COLOR);
  foot.position.set(0, -0.385, 0.05);
  knee.add(foot);
  return { hip, knee };
}

function buildAccessory(head: THREE.Group, accessory: Accessory, cloth: string): void {
  switch (accessory) {
    case 'straw_hat': {
      const brim = part(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 10), STRAW_COLOR);
      brim.position.y = 0.39;
      const crown = part(new THREE.CylinderGeometry(0.17, 0.21, 0.17, 8), STRAW_COLOR);
      crown.position.y = 0.48;
      const band = part(new THREE.CylinderGeometry(0.215, 0.215, 0.045, 8), '#7a3b23', { outline: false });
      band.position.y = 0.42;
      head.add(brim, crown, band);
      break;
    }
    case 'cap': {
      const crown = part(box(0.4, 0.14, 0.38), cloth);
      crown.position.set(0, 0.4, -0.005);
      const visor = part(box(0.36, 0.03, 0.22), cloth, { outlineWidth: 0.02 });
      visor.position.set(0, 0.35, 0.26);
      head.add(crown, visor);
      break;
    }
    case 'leather_hat': {
      // chapéu de couro de cangaceiro: aba em meia-lua e estrela na frente
      const leather = '#7a4a26';
      const brim = part(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 12, 1, false, -Math.PI / 2, Math.PI), leather);
      brim.rotation.x = -Math.PI / 2;
      brim.position.set(0, 0.48, 0);
      const crown = part(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 8), leather);
      crown.position.y = 0.44;
      const star = part(new THREE.OctahedronGeometry(0.06, 0), '#e8c060', { outlineWidth: 0.012 });
      star.position.set(0, 0.62, 0.03);
      head.add(brim, crown, star);
      break;
    }
    case 'headscarf': {
      const scarf = part(box(0.4, 0.16, 0.39), cloth);
      scarf.position.set(0, 0.36, -0.01);
      const knot = part(box(0.12, 0.1, 0.1), cloth, { outlineWidth: 0.015 });
      knot.position.set(0, 0.3, -0.21);
      head.add(scarf, knot);
      break;
    }
    case 'glasses': {
      for (const side of [-1, 1]) {
        const lens = part(box(0.11, 0.09, 0.02), '#1d2630', { outlineWidth: 0.012, castShadow: false });
        lens.position.set(side * 0.085, 0.2, 0.18);
        head.add(lens);
      }
      const bridge = part(box(0.06, 0.02, 0.02), '#1d2630', { outline: false, castShadow: false });
      bridge.position.set(0, 0.21, 0.18);
      head.add(bridge);
      break;
    }
    default:
  }
}

export function createCharacter(config: CharacterConfig): CharacterRig {
  const kind = config.kind ?? 'man';
  const root = new THREE.Group();
  root.name = `character:${config.id}`;
  const body = pivot(root, 0, 0, 0);
  const hips = pivot(body, 0, HIP_HEIGHT, 0);
  const seed = hashString(config.id);
  const hairColor = kind === 'elderly' ? GRAY_HAIR : HAIR_COLORS[seed % HAIR_COLORS.length];

  const pelvis = part(box(0.46, 0.14, 0.27), config.pantsColor);
  pelvis.position.y = 0.03;
  hips.add(pelvis);

  const torso = pivot(hips, 0, 0.08, 0);
  const chest = part(box(kind === 'woman' ? 0.46 : 0.5, 0.52, 0.28), config.shirtColor);
  chest.position.y = 0.27;
  torso.add(chest);

  if (kind === 'woman') {
    // saia: tronco de cone por cima do quadril
    const skirt = part(new THREE.CylinderGeometry(0.26, 0.36, 0.48, 8), config.pantsColor);
    skirt.position.y = -0.12;
    hips.add(skirt);
  }

  const neck = part(box(0.14, 0.08, 0.14), config.skinColor, { outline: false });
  neck.position.y = 0.56;
  torso.add(neck);

  const head = pivot(torso, 0, 0.6, 0);
  const skull = part(box(0.36, 0.36, 0.34), config.skinColor);
  skull.position.y = 0.18;
  head.add(skull);

  const hairTop = kind === 'elderly' && seed % 2 === 0 ? 0.06 : 0.13;
  const hair = part(box(0.385, hairTop, 0.365), hairColor, { outline: false });
  hair.position.set(0, 0.36 - hairTop / 2 + 0.03, -0.005);
  const backLength = kind === 'woman' ? 0.62 : 0.22;
  const hairBack = part(box(0.385, backLength, 0.1), hairColor, { outline: false });
  hairBack.position.set(0, 0.34 - backLength / 2, -0.14);
  head.add(hair, hairBack);
  if (kind === 'elderly' && seed % 3 === 0) {
    const beard = part(box(0.3, 0.12, 0.06), GRAY_HAIR, { outline: false });
    beard.position.set(0, 0.05, 0.17);
    head.add(beard);
  }

  const eyes = [-1, 1].map((side) => {
    const eye = part(box(0.05, 0.07, 0.02), '#161210', { outline: false, castShadow: false });
    eye.position.set(side * 0.085, 0.2, 0.172);
    head.add(eye);
    return eye;
  });
  const mouth = part(box(0.11, 0.022, 0.02), '#3a1c14', { outline: false, castShadow: false });
  mouth.position.set(0, 0.08, 0.172);
  head.add(mouth);

  buildAccessory(head, config.accessory, config.shirtColor);

  const left = buildArm(torso, -1, config.shirtColor, config.skinColor);
  const right = buildArm(torso, 1, config.shirtColor, config.skinColor);
  const lower = kind === 'woman' ? config.skinColor : config.pantsColor;
  const legLeft = buildLeg(hips, -1, config.pantsColor, lower);
  const legRight = buildLeg(hips, 1, config.pantsColor, lower);

  const carried = part(box(0.42, 0.34, 0.3), '#b8955a', { outlineWidth: 0.02 });
  carried.position.set(0, 0.22, 0.4);
  carried.visible = false;
  torso.add(carried);

  if (kind === 'child') {
    // criança: corpo menor e cabeça proporcionalmente maior
    root.scale.setScalar(0.62);
    head.scale.setScalar(1.3);
  }

  return {
    root,
    body,
    hips,
    torso,
    head,
    armL: left.shoulder,
    armR: right.shoulder,
    elbowL: left.elbow,
    elbowR: right.elbow,
    legL: legLeft.hip,
    legR: legRight.hip,
    kneeL: legLeft.knee,
    kneeR: legRight.knee,
    mouth,
    eyes,
    phase: (seed % 628) / 100,
    kind,
    speed: kind === 'elderly' ? 0.75 : kind === 'child' ? 1.15 : 1,
    stoop: kind === 'elderly' ? 0.16 : 0,
    carried,
  };
}

/**
 * Gestos e reações que tocam uma vez (duração em segundos) e devolvem o
 * personagem ao estado de base. Sem isso, um aceno dura a cena inteira.
 */
export const ONE_SHOT: Partial<Record<AnimationName, number>> = {
  gesture: 2.2,
  point: 2.6,
  clap: 2.8,
  celebrate: 3,
  surprised: 2.8,
  laugh: 3.2,
  nod: 1.8,
  deny: 2,
  hug: 3.2,
};

/** Ações só de tronco, braços e cabeça: funcionam também sentado. */
export const UPPER_BODY: ReadonlySet<AnimationName> = new Set<AnimationName>([
  'idle', 'listen', 'talk', 'gesture', 'point', 'clap', 'surprised', 'laugh', 'cry', 'nod', 'deny', 'think', 'eat',
]);

const FADE = 0.35;
const smooth = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** Quanto do gesto aparece em `elapsed` segundos de cena: sobe, segura e desce. */
export function oneShotWeight(animation: AnimationName, elapsed: number, phase = 0): number {
  const duration = ONE_SHOT[animation];
  if (!duration) return 1;
  // cada personagem começa num instante um pouco diferente, para não reagirem em coro
  const local = elapsed - (0.35 + (phase % 0.7));
  return Math.min(smooth(local / FADE), smooth((duration - local) / FADE));
}

export interface PoseOptions {
  /** altura da superfície onde o personagem deita (0 = chão) */
  restHeight?: number;
  /** altura do assento (sentar, dirigir, montar); ausente = chão */
  seatHeight?: number;
  /** o veículo/cavalo está andando (pedala, balança) */
  moving?: boolean;
  /** o personagem está se deslocando a pé nesta cena ("carry" anda) */
  travelling?: boolean;
  /** segundos desde o início da cena (queda acontece uma vez) */
  elapsed?: number;
}

/** Sentado: coxas para a frente, canelas para baixo. */
function seated(rig: CharacterRig, seatHeight: number): void {
  rig.hips.position.y = seatHeight;
  rig.legL.rotation.x = -Math.PI / 2;
  rig.legR.rotation.x = -Math.PI / 2;
  const onGround = seatHeight < 0.35;
  rig.kneeL.rotation.x = onGround ? 0.25 : Math.PI / 2;
  rig.kneeR.rotation.x = onGround ? 0.25 : Math.PI / 2;
}

/**
 * Convenção das rotações: o boneco olha para +Z. Em X, ângulo positivo leva um
 * membro pendurado para trás e inclina o tronco para a frente. Em Z, ângulo
 * positivo abre o braço direito e negativo abre o esquerdo.
 */
export function poseCharacter(
  rig: CharacterRig,
  animation: AnimationName,
  time: number,
  options: PoseOptions = {},
): void {
  const joints = [
    rig.body, rig.hips, rig.torso, rig.head, rig.armL, rig.armR,
    rig.elbowL, rig.elbowR, rig.legL, rig.legR, rig.kneeL, rig.kneeR,
  ];
  for (const j of joints) j.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  rig.hips.position.y = HIP_HEIGHT;
  rig.torso.scale.set(1, 1, 1);
  rig.mouth.scale.set(1, 1, 1);
  for (const eye of rig.eyes) eye.scale.y = 1;
  rig.carried.visible = false;

  const t = time * rig.speed;
  const p = rig.phase;
  const breathe = Math.sin(t * 1.6 + p);
  // pisca rápido a cada ~3,7 s
  const blinkPhase = (time + p) % 3.7;
  if (blinkPhase < 0.12) for (const eye of rig.eyes) eye.scale.y = 0.15;
  rig.torso.rotation.x = rig.stoop;

  switch (animation) {
    case 'walk': {
      const w = t * 7 + p;
      const swing = Math.sin(w);
      rig.legL.rotation.x = 0.6 * swing;
      rig.legR.rotation.x = -0.6 * swing;
      // o joelho dobra enquanto a perna vem de trás para a frente
      rig.kneeL.rotation.x = 0.9 * Math.max(0, -Math.cos(w));
      rig.kneeR.rotation.x = 0.9 * Math.max(0, Math.cos(w));
      rig.armL.rotation.x = -0.5 * swing;
      rig.armR.rotation.x = 0.5 * swing;
      rig.armL.rotation.z = -0.06;
      rig.armR.rotation.z = 0.06;
      rig.elbowL.rotation.x = -0.35;
      rig.elbowR.rotation.x = -0.35;
      rig.torso.rotation.x = 0.07 + rig.stoop;
      rig.torso.rotation.y = 0.08 * swing;
      rig.hips.position.y = HIP_HEIGHT - 0.03 + 0.04 * Math.abs(Math.cos(w));
      break;
    }
    case 'run': {
      const w = t * 11 + p;
      const swing = Math.sin(w);
      rig.legL.rotation.x = 1.05 * swing;
      rig.legR.rotation.x = -1.05 * swing;
      rig.kneeL.rotation.x = 1.5 * Math.max(0, -Math.cos(w)) + 0.2;
      rig.kneeR.rotation.x = 1.5 * Math.max(0, Math.cos(w)) + 0.2;
      rig.armL.rotation.x = -1 * swing;
      rig.armR.rotation.x = 1 * swing;
      rig.elbowL.rotation.x = -1.4;
      rig.elbowR.rotation.x = -1.4;
      rig.torso.rotation.x = 0.28 + rig.stoop;
      rig.torso.rotation.y = 0.12 * swing;
      rig.hips.position.y = HIP_HEIGHT - 0.06 + 0.1 * Math.abs(Math.cos(w));
      break;
    }
    case 'jump': {
      const cycle = (t * 0.9 + p) % 1;
      const air = cycle > 0.25 && cycle < 0.85 ? Math.sin(((cycle - 0.25) / 0.6) * Math.PI) : 0;
      const crouch = cycle <= 0.25 ? Math.sin((cycle / 0.25) * Math.PI) : 0;
      rig.body.position.y = 0.55 * air;
      rig.hips.position.y = HIP_HEIGHT - 0.22 * crouch;
      rig.legL.rotation.x = -0.5 * crouch - 0.25 * air;
      rig.legR.rotation.x = -0.5 * crouch - 0.25 * air;
      rig.kneeL.rotation.x = 1 * crouch + 0.6 * air;
      rig.kneeR.rotation.x = 1 * crouch + 0.6 * air;
      rig.armL.rotation.z = -0.3 - 2.3 * air;
      rig.armR.rotation.z = 0.3 + 2.3 * air;
      rig.torso.rotation.x = 0.3 * crouch + rig.stoop;
      break;
    }
    case 'dance': {
      const beat = t * 5 + p;
      rig.body.position.x = 0.07 * Math.sin(beat);
      rig.hips.position.y = HIP_HEIGHT - 0.04 + 0.04 * Math.abs(Math.sin(beat));
      rig.torso.rotation.z = 0.12 * Math.sin(beat);
      rig.torso.rotation.y = 0.2 * Math.sin(beat / 2);
      rig.legL.rotation.x = -0.35 * Math.max(0, Math.sin(beat));
      rig.legR.rotation.x = -0.35 * Math.max(0, -Math.sin(beat));
      rig.kneeL.rotation.x = 0.6 * Math.max(0, Math.sin(beat));
      rig.kneeR.rotation.x = 0.6 * Math.max(0, -Math.sin(beat));
      rig.armL.rotation.z = -1.2 - 0.9 * Math.max(0, Math.sin(beat));
      rig.armR.rotation.z = 1.2 + 0.9 * Math.max(0, -Math.sin(beat));
      rig.elbowL.rotation.z = -0.6;
      rig.elbowR.rotation.z = 0.6;
      rig.head.rotation.z = 0.1 * Math.sin(beat + 1);
      break;
    }
    case 'sit': {
      seated(rig, options.seatHeight ?? 0.22);
      rig.armL.rotation.x = -0.55;
      rig.armR.rotation.x = -0.55;
      rig.elbowL.rotation.x = -0.5;
      rig.elbowR.rotation.x = -0.5;
      rig.head.rotation.y = 0.25 * Math.sin(t * 0.5 + p);
      rig.torso.scale.y = 1 + 0.012 * breathe;
      break;
    }
    case 'drive': {
      seated(rig, options.seatHeight ?? 0.22);
      // mãos no volante, olhando para a frente
      rig.armL.rotation.x = -1.15;
      rig.armR.rotation.x = -1.15;
      rig.armL.rotation.z = 0.12;
      rig.armR.rotation.z = -0.12;
      rig.elbowL.rotation.x = -0.4;
      rig.elbowR.rotation.x = -0.4;
      rig.head.rotation.y = 0.12 * Math.sin(t * 0.7 + p);
      rig.torso.rotation.z = options.moving ? 0.03 * Math.sin(t * 2 + p) : 0;
      break;
    }
    case 'ride': {
      rig.hips.position.y = options.seatHeight ?? 0.5;
      rig.legL.rotation.z = -0.35;
      rig.legR.rotation.z = 0.35;
      // pedala ou balança no ritmo do galope
      const w = t * 8 + p;
      const pedal = options.moving ? 0.45 * Math.sin(w) : 0;
      rig.legL.rotation.x = -0.75 + pedal;
      rig.legR.rotation.x = -0.75 - pedal;
      rig.kneeL.rotation.x = 1.1 - pedal * 0.6;
      rig.kneeR.rotation.x = 1.1 + pedal * 0.6;
      rig.torso.rotation.x = 0.22;
      rig.armL.rotation.x = -1.05;
      rig.armR.rotation.x = -1.05;
      rig.elbowL.rotation.x = -0.3;
      rig.elbowR.rotation.x = -0.3;
      rig.body.position.y = options.moving ? 0.03 * Math.abs(Math.sin(w)) : 0;
      break;
    }
    case 'talk': {
      const chatter = Math.abs(Math.sin(t * 9 + p)) * (0.55 + 0.45 * Math.sin(t * 2.3 + p));
      rig.mouth.scale.y = 1 + 2.6 * Math.max(0, chatter);
      rig.head.rotation.x = 0.07 * Math.sin(t * 4.6 + p);
      rig.head.rotation.y = 0.14 * Math.sin(t * 1.3 + p);
      rig.armR.rotation.x = -0.85 + 0.22 * Math.sin(t * 3 + p);
      rig.armR.rotation.z = 0.18;
      rig.elbowR.rotation.x = -0.95 + 0.3 * Math.sin(t * 4.1 + p + 1);
      rig.armL.rotation.z = -0.1 - 0.02 * breathe;
      rig.elbowL.rotation.x = -0.15;
      rig.torso.scale.y = 1 + 0.012 * breathe;
      break;
    }
    case 'gesture': {
      const wave = Math.sin(t * 6 + p);
      rig.armR.rotation.z = 2.45 + 0.28 * wave;
      rig.elbowR.rotation.z = 0.35 + 0.35 * Math.sin(t * 6 + p + 0.6);
      rig.armL.rotation.z = -0.45;
      rig.elbowL.rotation.z = 0.9;
      rig.torso.rotation.z = -0.04 + 0.03 * wave;
      rig.head.rotation.z = 0.06 * wave;
      rig.head.rotation.y = 0.1 * Math.sin(t * 1.1 + p);
      rig.hips.position.y = HIP_HEIGHT + 0.01 * breathe;
      break;
    }
    case 'point': {
      rig.armR.rotation.x = -1.5;
      rig.armR.rotation.z = 0.25;
      rig.elbowR.rotation.x = -0.05;
      rig.armL.rotation.z = -0.1;
      rig.head.rotation.y = 0.35;
      rig.torso.rotation.y = 0.15;
      rig.armR.rotation.y = 0.05 * Math.sin(t * 2 + p);
      break;
    }
    case 'clap': {
      const c = Math.abs(Math.sin(t * 7 + p));
      rig.armL.rotation.x = -1.1;
      rig.armR.rotation.x = -1.1;
      rig.armL.rotation.y = 0.3 + 0.45 * c;
      rig.armR.rotation.y = -0.3 - 0.45 * c;
      rig.elbowL.rotation.x = -0.5;
      rig.elbowR.rotation.x = -0.5;
      rig.head.rotation.x = -0.05;
      rig.hips.position.y = HIP_HEIGHT + 0.015 * Math.sin(t * 7 + p);
      break;
    }
    case 'celebrate': {
      const hop = Math.abs(Math.sin(t * 6 + p));
      rig.body.position.y = 0.14 * hop;
      rig.armL.rotation.z = -2.7 + 0.2 * Math.sin(t * 9 + p);
      rig.armR.rotation.z = 2.7 - 0.2 * Math.sin(t * 9 + p + 1);
      rig.kneeL.rotation.x = 0.4 * (1 - hop);
      rig.kneeR.rotation.x = 0.4 * (1 - hop);
      rig.legL.rotation.x = -0.2 * (1 - hop);
      rig.legR.rotation.x = -0.2 * (1 - hop);
      rig.head.rotation.x = -0.2;
      rig.mouth.scale.y = 3;
      break;
    }
    case 'pray': {
      // ajoelhado, mãos juntas e cabeça baixa
      rig.hips.position.y = 0.5;
      rig.kneeL.rotation.x = Math.PI / 2;
      rig.kneeR.rotation.x = Math.PI / 2;
      rig.armL.rotation.x = -0.75;
      rig.armR.rotation.x = -0.75;
      rig.armL.rotation.z = 0.32;
      rig.armR.rotation.z = -0.32;
      rig.elbowL.rotation.x = -1.3;
      rig.elbowR.rotation.x = -1.3;
      rig.head.rotation.x = 0.35 + 0.03 * breathe;
      for (const eye of rig.eyes) eye.scale.y = 0.15;
      break;
    }
    case 'sleep': {
      const slow = Math.sin(t * 1.15 + p);
      // deitado de costas, cabeça para -Z (onde fica a cabeceira da cama)
      rig.body.rotation.x = -Math.PI / 2;
      rig.body.position.set(0, (options.restHeight ?? 0) + 0.15, 0.9);
      rig.torso.rotation.x = 0;
      rig.torso.scale.z = 1 + 0.05 * slow;
      rig.armL.rotation.z = -0.22;
      rig.armR.rotation.z = 0.22;
      rig.legL.rotation.z = -0.05;
      rig.legR.rotation.z = 0.05;
      rig.head.rotation.z = 0.12;
      for (const eye of rig.eyes) eye.scale.y = 0.15;
      break;
    }
    case 'listen': {
      // parado, atento a quem fala: quase sem balanço, com um aceno de cabeça de vez em quando
      rig.torso.scale.y = 1 + 0.012 * breathe;
      rig.armL.rotation.z = -0.07;
      rig.armR.rotation.z = 0.07;
      rig.head.rotation.x = 0.16 * Math.max(0, Math.sin(t * 1.3 + p)) ** 6;
      rig.head.rotation.z = 0.04 * Math.sin(t * 0.4 + p);
      break;
    }
    case 'surprised': {
      // leva um susto: tronco para trás, mãos ao peito, boca e olhos abertos
      rig.torso.rotation.x = -0.14 + rig.stoop;
      rig.head.rotation.x = -0.12;
      rig.armL.rotation.set(-0.55, 0, -0.55);
      rig.armR.rotation.set(-0.55, 0, 0.55);
      rig.elbowL.rotation.x = -1.5;
      rig.elbowR.rotation.x = -1.5;
      rig.mouth.scale.set(0.6, 6, 1);
      for (const eye of rig.eyes) eye.scale.y = 1.5;
      rig.body.position.y = 0.02 * Math.abs(Math.sin(t * 9 + p));
      break;
    }
    case 'laugh': {
      const shake = Math.sin(t * 14 + p);
      rig.torso.rotation.x = -0.1 + 0.07 * shake + rig.stoop;
      rig.head.rotation.x = -0.28 + 0.05 * shake;
      rig.armR.rotation.x = -0.45;
      rig.elbowR.rotation.x = -1.5;
      rig.armL.rotation.z = -0.25;
      rig.elbowL.rotation.z = 0.5;
      rig.body.position.y = 0.015 * Math.abs(shake);
      rig.mouth.scale.set(1.3, 4.5, 1);
      for (const eye of rig.eyes) eye.scale.y = 0.3;
      break;
    }
    case 'cry': {
      // cabeça baixa, mãos no rosto, ombros sacudindo
      rig.torso.rotation.x = 0.22 + 0.03 * Math.sin(t * 10 + p) + rig.stoop;
      rig.head.rotation.x = 0.45;
      rig.armL.rotation.set(-1, 0, 0.28);
      rig.armR.rotation.set(-1, 0, -0.28);
      rig.elbowL.rotation.x = -1.95;
      rig.elbowR.rotation.x = -1.95;
      for (const eye of rig.eyes) eye.scale.y = 0.15;
      break;
    }
    case 'nod': {
      rig.head.rotation.x = 0.3 * Math.max(0, Math.sin(t * 7 + p));
      rig.armL.rotation.z = -0.07;
      rig.armR.rotation.z = 0.07;
      break;
    }
    case 'deny': {
      rig.head.rotation.y = 0.45 * Math.sin(t * 7 + p);
      rig.armR.rotation.x = -0.7;
      rig.armR.rotation.z = 0.2;
      rig.elbowR.rotation.x = -1.1;
      rig.elbowR.rotation.z = 0.3 * Math.sin(t * 7 + p);
      rig.armL.rotation.z = -0.07;
      break;
    }
    case 'think': {
      // mão no queixo, outro braço cruzado, cabeça inclinada
      rig.armR.rotation.x = -0.6;
      rig.elbowR.rotation.x = -2.05;
      rig.armL.rotation.set(-0.45, 0, 0.35);
      rig.elbowL.rotation.x = -1.2;
      rig.head.rotation.z = 0.13;
      rig.head.rotation.y = 0.12 * Math.sin(t * 0.6 + p);
      rig.head.rotation.x = -0.05;
      rig.torso.scale.y = 1 + 0.012 * breathe;
      break;
    }
    case 'carry': {
      // leva um saco nos braços; se está se deslocando, anda
      rig.carried.visible = true;
      rig.armL.rotation.x = -0.95;
      rig.armR.rotation.x = -0.95;
      rig.armL.rotation.z = 0.12;
      rig.armR.rotation.z = -0.12;
      rig.elbowL.rotation.x = -0.75;
      rig.elbowR.rotation.x = -0.75;
      rig.torso.rotation.x = -0.06 + rig.stoop;
      if (options.travelling) {
        const w = t * 6 + p;
        rig.legL.rotation.x = 0.5 * Math.sin(w);
        rig.legR.rotation.x = -0.5 * Math.sin(w);
        rig.kneeL.rotation.x = 0.8 * Math.max(0, -Math.cos(w));
        rig.kneeR.rotation.x = 0.8 * Math.max(0, Math.cos(w));
        rig.hips.position.y = HIP_HEIGHT - 0.03 + 0.03 * Math.abs(Math.cos(w));
      }
      break;
    }
    case 'work': {
      // golpes de enxada: sobe as mãos juntas e desce dobrando o tronco
      const w = t * 4 + p;
      const down = Math.max(0, Math.sin(w));
      rig.torso.rotation.x = 0.1 + 0.45 * down + rig.stoop;
      rig.armL.rotation.x = -2.3 + 1.6 * down;
      rig.armR.rotation.x = -2.3 + 1.6 * down;
      rig.armL.rotation.z = 0.15;
      rig.armR.rotation.z = -0.15;
      rig.elbowL.rotation.x = -0.4;
      rig.elbowR.rotation.x = -0.4;
      rig.kneeL.rotation.x = 0.25 * down;
      rig.kneeR.rotation.x = 0.25 * down;
      rig.legL.rotation.x = -0.12 * down;
      rig.legR.rotation.x = -0.12 * down;
      rig.hips.position.y = HIP_HEIGHT - 0.04 * down;
      break;
    }
    case 'eat': {
      // leva a mão à boca e mastiga
      const bite = Math.max(0, Math.sin(t * 2.6 + p));
      rig.armR.rotation.x = -0.75;
      rig.elbowR.rotation.x = -1.0 - 1.05 * bite;
      rig.armL.rotation.x = -0.5;
      rig.elbowL.rotation.x = -0.9;
      rig.head.rotation.x = 0.1 * bite;
      rig.mouth.scale.y = 1 + 2 * Math.abs(Math.sin(t * 8 + p)) * (1 - bite);
      break;
    }
    case 'hug': {
      rig.torso.rotation.x = 0.14 + rig.stoop;
      rig.armL.rotation.set(-1.3, 0, 0.4);
      rig.armR.rotation.set(-1.3, 0, -0.4);
      rig.elbowL.rotation.x = -0.55;
      rig.elbowR.rotation.x = -0.55;
      rig.head.rotation.z = 0.15;
      for (const eye of rig.eyes) eye.scale.y = 0.15;
      break;
    }
    case 'fall': {
      // tropeça e cai de costas uma vez; depois fica no chão
      const k = smooth(((options.elapsed ?? 99) - 0.5) / 0.55);
      rig.body.rotation.x = (-Math.PI / 2) * k;
      rig.body.position.set(0, 0.15 * k, 0.9 * k);
      rig.torso.rotation.x = rig.stoop * (1 - k);
      rig.armL.rotation.z = -0.5 - 1.6 * Math.sin(Math.PI * k);
      rig.armR.rotation.z = 0.5 + 1.6 * Math.sin(Math.PI * k);
      rig.legL.rotation.x = -0.5 * Math.sin(Math.PI * k);
      rig.kneeR.rotation.x = 0.5 * k;
      rig.mouth.scale.set(0.7, 1 + 4 * (1 - k) * Math.min(1, (options.elapsed ?? 0) * 3), 1);
      break;
    }
    default: {
      // idle
      rig.torso.scale.y = 1 + 0.015 * breathe;
      rig.hips.position.y = HIP_HEIGHT + 0.008 * breathe;
      rig.armL.rotation.z = -0.08 - 0.02 * breathe;
      rig.armR.rotation.z = 0.08 + 0.02 * breathe;
      rig.armL.rotation.x = 0.05 * Math.sin(t * 1.1 + p);
      rig.armR.rotation.x = -0.05 * Math.sin(t * 1.1 + p);
      rig.head.rotation.y = 0.25 * Math.sin(t * 0.5 + p);
      rig.torso.rotation.y = 0.04 * Math.sin(t * 0.5 + p);
    }
  }
  // sentado, as ações de tronco e braços continuam valendo
  if (options.seatHeight !== undefined && UPPER_BODY.has(animation)) seated(rig, options.seatHeight);
}

const NUMBERS_PER_RIG = 12 * 3 + 3 + 1 + 3 + 3 + 2;

function capture(rig: CharacterRig, out: number[]): number[] {
  out.length = 0;
  for (const j of [rig.body, rig.hips, rig.torso, rig.head, rig.armL, rig.armR, rig.elbowL, rig.elbowR, rig.legL, rig.legR, rig.kneeL, rig.kneeR]) {
    out.push(j.rotation.x, j.rotation.y, j.rotation.z);
  }
  out.push(rig.body.position.x, rig.body.position.y, rig.body.position.z, rig.hips.position.y);
  out.push(rig.torso.scale.x, rig.torso.scale.y, rig.torso.scale.z, rig.mouth.scale.x, rig.mouth.scale.y, rig.mouth.scale.z);
  out.push(rig.eyes[0].scale.y, rig.eyes[1].scale.y);
  return out;
}

function restore(rig: CharacterRig, v: number[]): void {
  let i = 0;
  for (const j of [rig.body, rig.hips, rig.torso, rig.head, rig.armL, rig.armR, rig.elbowL, rig.elbowR, rig.legL, rig.legR, rig.kneeL, rig.kneeR]) {
    j.rotation.set(v[i++], v[i++], v[i++]);
  }
  rig.body.position.set(v[i++], v[i++], v[i++]);
  rig.hips.position.y = v[i++];
  rig.torso.scale.set(v[i++], v[i++], v[i++]);
  rig.mouth.scale.set(v[i++], v[i++], v[i++]);
  rig.eyes[0].scale.y = v[i++];
  rig.eyes[1].scale.y = v[i++];
}

const poseA: number[] = [];
const poseB: number[] = [];

/**
 * Pose final do personagem no instante `time`. Gestos de uma vez (ONE_SHOT) são
 * misturados com o estado de base conforme o tempo de cena; o resto é a pose
 * direta. Continua função pura do tempo: o mesmo instante dá o mesmo quadro.
 */
export function animateCharacter(rig: CharacterRig, animation: AnimationName, time: number, options: PoseOptions = {}): void {
  const weight = oneShotWeight(animation, options.elapsed ?? 0, rig.phase);
  if (weight >= 1) {
    poseCharacter(rig, animation, time, options);
    return;
  }
  // base: escutando (ou sentado, se estiver num assento)
  poseCharacter(rig, 'listen', time, options);
  if (weight <= 0) return;
  capture(rig, poseA);
  poseCharacter(rig, animation, time, options);
  capture(rig, poseB);
  for (let i = 0; i < NUMBERS_PER_RIG; i++) poseB[i] = poseA[i] + (poseB[i] - poseA[i]) * weight;
  restore(rig, poseB);
}

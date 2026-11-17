// Módulo 3: humanoide low-poly articulado e suas poses.
//
// As poses são função pura do tempo: poseCharacter(rig, anim, t) define todas
// as rotações do zero a cada chamada, então o mesmo t dá sempre o mesmo frame.

import * as THREE from 'three';
import { STRAW_COLOR } from '../presets';
import type { Accessory, AnimationName } from '../types';
import { hashString } from '../util';
import { part } from './toon';

export interface CharacterConfig {
  id: string;
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory: Accessory;
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
}

const HIP_HEIGHT = 0.86;
const HAIR_COLOR = '#2a1b12';
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

function buildLeg(hips: THREE.Group, side: -1 | 1, pants: string) {
  const hip = pivot(hips, side * 0.13, 0, 0);
  limbSegment(hip, 0.2, 0.43, pants);
  const knee = pivot(hip, 0, -0.43, 0);
  limbSegment(knee, 0.18, 0.36, pants);
  const foot = part(box(0.2, 0.09, 0.3), SHOE_COLOR);
  foot.position.set(0, -0.385, 0.05);
  knee.add(foot);
  return { hip, knee };
}

function buildStrawHat(head: THREE.Group): void {
  const brim = part(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 10), STRAW_COLOR);
  brim.position.y = 0.39;
  const crown = part(new THREE.CylinderGeometry(0.17, 0.21, 0.17, 8), STRAW_COLOR);
  crown.position.y = 0.48;
  const band = part(new THREE.CylinderGeometry(0.215, 0.215, 0.045, 8), '#7a3b23', { outline: false });
  band.position.y = 0.42;
  head.add(brim, crown, band);
}

export function createCharacter(config: CharacterConfig): CharacterRig {
  const root = new THREE.Group();
  root.name = `character:${config.id}`;
  const body = pivot(root, 0, 0, 0);
  const hips = pivot(body, 0, HIP_HEIGHT, 0);

  const pelvis = part(box(0.46, 0.14, 0.27), config.pantsColor);
  pelvis.position.y = 0.03;
  hips.add(pelvis);

  const torso = pivot(hips, 0, 0.08, 0);
  const chest = part(box(0.5, 0.52, 0.28), config.shirtColor);
  chest.position.y = 0.27;
  torso.add(chest);

  const neck = part(box(0.14, 0.08, 0.14), config.skinColor, { outline: false });
  neck.position.y = 0.56;
  torso.add(neck);

  const head = pivot(torso, 0, 0.6, 0);
  const skull = part(box(0.36, 0.36, 0.34), config.skinColor);
  skull.position.y = 0.18;
  head.add(skull);

  const hair = part(box(0.385, 0.13, 0.365), HAIR_COLOR, { outline: false });
  hair.position.set(0, 0.325, -0.005);
  const hairBack = part(box(0.385, 0.22, 0.1), HAIR_COLOR, { outline: false });
  hairBack.position.set(0, 0.23, -0.14);
  head.add(hair, hairBack);

  const eyes = [-1, 1].map((side) => {
    const eye = part(box(0.05, 0.07, 0.02), '#161210', { outline: false, castShadow: false });
    eye.position.set(side * 0.085, 0.2, 0.172);
    head.add(eye);
    return eye;
  });
  const mouth = part(box(0.11, 0.022, 0.02), '#3a1c14', { outline: false, castShadow: false });
  mouth.position.set(0, 0.08, 0.172);
  head.add(mouth);

  if (config.accessory === 'straw_hat') buildStrawHat(head);

  const left = buildArm(torso, -1, config.shirtColor, config.skinColor);
  const right = buildArm(torso, 1, config.shirtColor, config.skinColor);
  const legLeft = buildLeg(hips, -1, config.pantsColor);
  const legRight = buildLeg(hips, 1, config.pantsColor);

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
    phase: (hashString(config.id) % 628) / 100,
  };
}

export interface PoseOptions {
  /** altura da superfície onde o personagem deita (0 = chão) */
  restHeight?: number;
}

/**
 * Convenção das rotações: o boneco olha para +Z. Em X, ângulo positivo leva um
 * membro pendurado para trás e inclina o tronco para a frente. Em Z, ângulo
 * positivo abre o braço direito e negativo abre o esquerdo.
 */
export function poseCharacter(
  rig: CharacterRig,
  animation: AnimationName,
  t: number,
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
  rig.mouth.scale.y = 1;
  for (const eye of rig.eyes) eye.scale.y = 1;

  const p = rig.phase;
  const breathe = Math.sin(t * 1.6 + p);
  // pisca rápido a cada ~3,7 s
  const blinkPhase = (t + p) % 3.7;
  if (blinkPhase < 0.12) for (const eye of rig.eyes) eye.scale.y = 0.15;

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
      rig.torso.rotation.x = 0.07;
      rig.torso.rotation.y = 0.08 * swing;
      rig.hips.position.y = HIP_HEIGHT - 0.03 + 0.04 * Math.abs(Math.cos(w));
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
    case 'sleep': {
      const slow = Math.sin(t * 1.15 + p);
      // deitado de costas, cabeça para -Z (onde fica a cabeceira da cama)
      rig.body.rotation.x = -Math.PI / 2;
      rig.body.position.set(0, (options.restHeight ?? 0) + 0.15, 0.9);
      rig.torso.scale.z = 1 + 0.05 * slow;
      rig.armL.rotation.z = -0.22;
      rig.armR.rotation.z = 0.22;
      rig.legL.rotation.z = -0.05;
      rig.legR.rotation.z = 0.05;
      rig.head.rotation.z = 0.12;
      for (const eye of rig.eyes) eye.scale.y = 0.15;
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
}

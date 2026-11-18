// Variantes: para o mesmo roteiro, um número de variação escolhe, cena a cena,
// alternativas de situação, ambiente e câmera. A escolha é feita aqui, de forma
// determinística, e entra no prompt como orientação; a IA não precisa "sortear".

import type { SceneSlot } from '../types';
import { hashString, makeRng } from '../util';

const SITUATION = [
  'keep the protagonist alone in a wide composition',
  'add one bystander of a different kind (woman, child or elderly) who watches and reacts',
  'add an animal that fits the place (dog, chicken, bird, goat or horse), moving if it makes sense',
  'show a small everyday action before the main one, using "actions" (for example sit, think or carry first)',
  'stage two or three people, each one doing something different',
];
const AMBIENCE = [
  'use the default weather of the place',
  'make it windy',
  'make the sky overcast',
  'add a vehicle or cart passing in the background if it fits the place',
  'dress the place with more props than usual',
];
const CAMERA = ['crane_up', 'orbit', 'handheld', 'zoom_in', 'pan_right', 'zoom_out', 'pan_left', 'static'];

export interface VariantHint {
  id: string;
  situation: string;
  ambience: string;
  camera: string;
}

export function variantHints(slots: SceneSlot[], seed: number): VariantHint[] {
  return slots.map((slot, i) => {
    const rng = makeRng(hashString(`variante:${seed}:${slot.id}`));
    const pick = <T>(list: readonly T[], shift: number): T => list[(Math.floor(rng() * list.length) + shift) % list.length];
    return {
      id: slot.id,
      situation: pick(SITUATION, seed),
      ambience: pick(AMBIENCE, seed),
      // câmeras vizinhas nunca repetem
      camera: CAMERA[(hashString(`camera:${seed}`) + i) % CAMERA.length],
    };
  });
}

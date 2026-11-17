// Contrato entre o Diretor de Arte (LLM ou regras) e o motor Three.js.

export { PRESETS } from './scenarios';
export type { Preset } from './scenarios';
import type { Preset } from './scenarios';

export const PARTICLES = ['dust', 'fireflies', 'leaves', 'rain', 'petals', 'confetti', 'embers', 'none'] as const;
export const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'wind'] as const;
export const TIMES_OF_DAY = ['day', 'sunset', 'night', 'dawn'] as const;
export const CAMERA_MOVEMENTS = [
  'static',
  'pan_left',
  'pan_right',
  'zoom_in',
  'zoom_out',
  'orbit',
  'follow_character',
  'crane_up',
  'crane_down',
  'handheld',
] as const;
export const ANIMATIONS = [
  'idle',
  'walk',
  'run',
  'jump',
  'dance',
  'sit',
  'talk',
  'gesture',
  'point',
  'clap',
  'celebrate',
  'pray',
  'sleep',
  'ride',
  'drive',
] as const;
export const CHARACTER_KINDS = ['man', 'woman', 'child', 'elderly'] as const;
export const ACCESSORIES = ['straw_hat', 'cap', 'leather_hat', 'headscarf', 'glasses', 'none'] as const;
export const VEHICLE_TYPES = ['car', 'truck', 'bus', 'bicycle', 'motorcycle', 'boat', 'cart'] as const;
export const ANIMAL_TYPES = ['animal', 'horse', 'dog', 'chicken', 'bird', 'goat'] as const;
export const PROP_TYPES = [
  // casas e cidade
  'rustic_house',
  'building',
  'church',
  'barn',
  'market_stall',
  'bandstand',
  'lamp_post',
  'bench',
  'pole',
  'well',
  // natureza
  'tree',
  'dry_tree',
  'cactus',
  'palm_tree',
  'bush',
  'rock',
  'flowers',
  'cornfield',
  'cloud_island',
  // caminhos e água
  'road',
  'fence',
  'bridge',
  'pier',
  'barrel',
  'umbrella',
  // dentro de casa
  'bed',
  'table',
  'chair',
  'sofa',
  'tv',
  'plant',
  'stove',
  'desk',
  'blackboard',
  'pew',
  'altar',
  'lantern',
  // festa
  'bonfire',
  'bunting',
  // veículos e animais
  ...VEHICLE_TYPES,
  ...ANIMAL_TYPES,
] as const;

export type ParticleKind = (typeof PARTICLES)[number];
export type Weather = (typeof WEATHERS)[number];
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export type CameraMovement = (typeof CAMERA_MOVEMENTS)[number];
export type AnimationName = (typeof ANIMATIONS)[number];
export type CharacterKind = (typeof CHARACTER_KINDS)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type PropType = (typeof PROP_TYPES)[number];

export type Vec3 = [number, number, number];

export interface EnvironmentDef {
  preset: Preset;
  skyColor: string;
  groundColor: string;
  fogColor: string;
  particles: ParticleKind;
  /** padrão do cenário quando ausente */
  weather?: Weather;
  timeOfDay?: TimeOfDay;
}

export interface CameraDef {
  movement: CameraMovement;
  startPos: Vec3;
  endPos: Vec3;
  lookAt: Vec3;
  target?: string;
}

export interface CharacterDef {
  id: string;
  position: Vec3;
  targetPosition?: Vec3;
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory: Accessory;
  animation: AnimationName;
  /** homem (padrão), mulher, criança ou idoso: muda proporções, cabelo e roupa */
  kind?: CharacterKind;
  /** id de um veículo ou cavalo da cena: o personagem vai montado nele */
  mount?: string;
}

export interface PropDef {
  /** necessário só para ser montado por um personagem (mount) */
  id?: string;
  type: PropType;
  position: Vec3;
  rotationY: number;
  scale: number;
  color?: string;
  /** veículos e animais andam de position até targetPosition durante a cena */
  targetPosition?: Vec3;
}

export interface SceneDef {
  id: string;
  startTime: number;
  endTime: number;
  locationTitle?: string;
  environment: EnvironmentDef;
  camera: CameraDef;
  characters: CharacterDef[];
  props: PropDef[];
}

export interface SceneGraphJSON {
  scenes: SceneDef[];
}

// ---------- Módulo 1: timestamps ----------

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface SentenceTiming {
  text: string;
  start: number;
  end: number;
  /** índices [first, last] inclusivos em Timeline.words */
  first: number;
  last: number;
}

export interface Timeline {
  duration: number;
  words: WordTiming[];
  sentences: SentenceTiming[];
  source: 'whisper' | 'edge' | 'local';
}

// ---------- Módulo 2: fatias de cena ----------

export interface SceneSlot {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

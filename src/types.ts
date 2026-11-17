// Contrato entre o Diretor de Arte (LLM ou regras) e o motor Three.js.

export const PRESETS = ['sertao_day', 'interior_night', 'village_sunset', 'forest'] as const;
export const PARTICLES = ['dust', 'fireflies', 'leaves', 'rain', 'none'] as const;
export const CAMERA_MOVEMENTS = [
  'static',
  'pan_left',
  'pan_right',
  'zoom_in',
  'zoom_out',
  'orbit',
  'follow_character',
] as const;
export const ANIMATIONS = ['idle', 'walk', 'talk', 'sleep', 'gesture'] as const;
export const ACCESSORIES = ['straw_hat', 'none'] as const;
export const PROP_TYPES = [
  'rustic_house',
  'bed',
  'tree',
  'dry_tree',
  'cactus',
  'table',
  'lantern',
  'road',
  'fence',
  'animal',
] as const;

export type Preset = (typeof PRESETS)[number];
export type ParticleKind = (typeof PARTICLES)[number];
export type CameraMovement = (typeof CAMERA_MOVEMENTS)[number];
export type AnimationName = (typeof ANIMATIONS)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type PropType = (typeof PROP_TYPES)[number];

export type Vec3 = [number, number, number];

export interface EnvironmentDef {
  preset: Preset;
  skyColor: string;
  groundColor: string;
  fogColor: string;
  particles: ParticleKind;
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
}

export interface PropDef {
  type: PropType;
  position: Vec3;
  rotationY: number;
  scale: number;
  color?: string;
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

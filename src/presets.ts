// Paletas e padrões por preset: usadas pelo validador, pelo gerador por regras
// e pelo motor de renderização.

import type { ParticleKind, Preset, PropType, Vec3 } from './types';

export interface PresetPalette {
  sky: string;
  /** cor do zênite (topo do gradiente do céu) */
  skyTop: string;
  ground: string;
  fog: string;
  particles: ParticleKind;
  /** prop usado quando o tipo recebido não é reconhecível */
  fallbackProp: PropType;
  wall: string;
  roof: string;
  wood: string;
  foliage: string;
  trunk: string;
  cactus: string;
  cloth: string;
  animal: string;
  road: string;
  /** luz direcional */
  sunColor: string;
  sunIntensity: number;
  sunDir: Vec3;
  ambientColor: string;
  ambientIntensity: number;
  fogNear: number;
  fogFar: number;
}

export const PRESET_PALETTES: Record<Preset, PresetPalette> = {
  sertao_day: {
    sky: '#e8c391',
    skyTop: '#7fb4d6',
    ground: '#c28d53',
    fog: '#e8c391',
    particles: 'dust',
    fallbackProp: 'cactus',
    wall: '#d9a066',
    roof: '#a8502e',
    wood: '#7a5230',
    foliage: '#7d9a4a',
    trunk: '#6b4a2f',
    cactus: '#5f8f4e',
    cloth: '#c9483b',
    animal: '#8a5a3c',
    road: '#a87643',
    sunColor: '#fff1d6',
    sunIntensity: 2.6,
    sunDir: [5, 9, 6],
    ambientColor: '#f3d9b5',
    ambientIntensity: 1.25,
    fogNear: 16,
    fogFar: 60,
  },
  interior_night: {
    sky: '#141b33',
    skyTop: '#070a18',
    ground: '#5a4232',
    fog: '#141b33',
    particles: 'dust',
    fallbackProp: 'table',
    wall: '#8c6f58',
    roof: '#4a2f24',
    wood: '#6e4a2e',
    foliage: '#2f4f3f',
    trunk: '#3d2c20',
    cactus: '#356048',
    cloth: '#3f6fa8',
    animal: '#5e4636',
    road: '#4a3a2e',
    sunColor: '#9db4ff',
    sunIntensity: 1.5,
    sunDir: [-4, 8, 5],
    ambientColor: '#4a5a9a',
    ambientIntensity: 1.3,
    fogNear: 14,
    fogFar: 42,
  },
  village_sunset: {
    sky: '#f2a65a',
    skyTop: '#5b4b8a',
    ground: '#b9754a',
    fog: '#f0996a',
    particles: 'fireflies',
    fallbackProp: 'fence',
    wall: '#e6b98a',
    roof: '#8f3f2a',
    wood: '#6f4528',
    foliage: '#6f8a3d',
    trunk: '#5a3b26',
    cactus: '#58804a',
    cloth: '#d9843b',
    animal: '#7a4a30',
    road: '#96603c',
    sunColor: '#ffb070',
    sunIntensity: 2.4,
    sunDir: [-7, 4, 3],
    ambientColor: '#c98a8a',
    ambientIntensity: 1.15,
    fogNear: 14,
    fogFar: 55,
  },
  forest: {
    sky: '#b7d9c0',
    skyTop: '#5fa3b8',
    ground: '#4f7a3f',
    fog: '#a9cfb0',
    particles: 'leaves',
    fallbackProp: 'tree',
    wall: '#b98f62',
    roof: '#6b4a32',
    wood: '#63432a',
    foliage: '#3f8a45',
    trunk: '#5b3f28',
    cactus: '#4b8a52',
    cloth: '#b84a3a',
    animal: '#7b5b3d',
    road: '#7a6242',
    sunColor: '#f4ffd9',
    sunIntensity: 2.2,
    sunDir: [4, 10, 3],
    ambientColor: '#bfe0c2',
    ambientIntensity: 1.2,
    fogNear: 10,
    fogFar: 40,
  },
};

export const STRAW_COLOR = '#e3c16f';
export const DEFAULT_CAMERA_START: Vec3 = [0, 3, 10];
export const DEFAULT_LOOK_AT: Vec3 = [0, 1.2, 0];

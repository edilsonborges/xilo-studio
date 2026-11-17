// Módulo 2: validação do SceneGraphJSON.
//
// Tudo que chega aqui é tratado como não confiável (resposta de LLM ou JSON
// editado à mão). A saída sempre respeita o schema: enum fora da lista vira o
// valor válido mais próximo ou o padrão, e nada aqui lança exceção.

import { DEFAULT_CAMERA_START, DEFAULT_LOOK_AT, PRESET_PALETTES } from '../presets';
import {
  ACCESSORIES,
  ANIMATIONS,
  CAMERA_MOVEMENTS,
  PARTICLES,
  PRESETS,
  PROP_TYPES,
  type Accessory,
  type AnimationName,
  type CameraDef,
  type CameraMovement,
  type CharacterDef,
  type EnvironmentDef,
  type ParticleKind,
  type Preset,
  type PropDef,
  type PropType,
  type SceneDef,
  type SceneGraphJSON,
  type SceneSlot,
  type Vec3,
} from '../types';
import { clamp, normalizeText } from '../util';

const MAX_CHARACTERS = 6;
const MAX_PROPS = 24;
const WORLD_LIMIT = 40;

type Aliases<T extends string> = Record<string, T>;

const PRESET_ALIASES: Aliases<Preset> = {
  night: 'interior_night',
  noite: 'interior_night',
  interior: 'interior_night',
  indoor: 'interior_night',
  sunset: 'village_sunset',
  village: 'village_sunset',
  vila: 'village_sunset',
  dusk: 'village_sunset',
  entardecer: 'village_sunset',
  town: 'village_sunset',
  sertao: 'sertao_day',
  desert: 'sertao_day',
  deserto: 'sertao_day',
  day: 'sertao_day',
  dia: 'sertao_day',
  floresta: 'forest',
  jungle: 'forest',
  woods: 'forest',
  mata: 'forest',
};

const PARTICLE_ALIASES: Aliases<ParticleKind> = {
  poeira: 'dust',
  sand: 'dust',
  firefly: 'fireflies',
  vagalume: 'fireflies',
  sparks: 'fireflies',
  leaf: 'leaves',
  folhas: 'leaves',
  chuva: 'rain',
  storm: 'rain',
  snow: 'rain',
  off: 'none',
  nenhum: 'none',
};

const MOVEMENT_ALIASES: Aliases<CameraMovement> = {
  follow: 'follow_character',
  track: 'follow_character',
  tracking: 'follow_character',
  dolly_in: 'zoom_in',
  push_in: 'zoom_in',
  dolly_out: 'zoom_out',
  pull_out: 'zoom_out',
  pull_back: 'zoom_out',
  left: 'pan_left',
  right: 'pan_right',
  rotate: 'orbit',
  circle: 'orbit',
  fixed: 'static',
  still: 'static',
  zoom: 'zoom_in',
  pan: 'pan_right',
};

const ANIMATION_ALIASES: Aliases<AnimationName> = {
  run: 'walk',
  running: 'walk',
  andar: 'walk',
  speak: 'talk',
  speaking: 'talk',
  falar: 'talk',
  dormir: 'sleep',
  lie: 'sleep',
  lying: 'sleep',
  wave: 'gesture',
  point: 'gesture',
  gesticular: 'gesture',
  stand: 'idle',
  sit: 'idle',
  parado: 'idle',
};

const ACCESSORY_ALIASES: Aliases<Accessory> = {
  hat: 'straw_hat',
  chapeu: 'straw_hat',
  sombrero: 'straw_hat',
};

const PROP_ALIASES: Aliases<PropType> = {
  house: 'rustic_house',
  casa: 'rustic_house',
  hut: 'rustic_house',
  cabin: 'rustic_house',
  home: 'rustic_house',
  building: 'rustic_house',
  cama: 'bed',
  dead_tree: 'dry_tree',
  bare_tree: 'dry_tree',
  arvore_seca: 'dry_tree',
  arvore: 'tree',
  bush: 'tree',
  pine: 'tree',
  cacto: 'cactus',
  mandacaru: 'cactus',
  mesa: 'table',
  desk: 'table',
  lamp: 'lantern',
  lampiao: 'lantern',
  candle: 'lantern',
  torch: 'lantern',
  path: 'road',
  estrada: 'road',
  street: 'road',
  trail: 'road',
  cerca: 'fence',
  wall: 'fence',
  horse: 'animal',
  cow: 'animal',
  ox: 'animal',
  dog: 'animal',
  goat: 'animal',
  donkey: 'animal',
  cavalo: 'animal',
  boi: 'animal',
  cachorro: 'animal',
  bode: 'animal',
};

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Devolve o valor do enum mais próximo de `value`, ou `fallback`. */
export function closestEnum<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
  aliases: Aliases<T> = {},
): T {
  if (typeof value !== 'string') return fallback;
  const norm = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!norm) return fallback;
  if ((options as readonly string[]).includes(norm)) return norm as T;
  if (Object.hasOwn(aliases, norm)) return aliases[norm];

  // apelido contido no valor ("old_wooden_house" contém "house"): vence o mais longo
  // a comparação é por palavra inteira, para "toolbox" não virar "ox"
  const wrapped = `_${norm}_`;
  let aliasHit: string | null = null;
  for (const key of Object.keys(aliases)) {
    if (wrapped.includes(`_${key}_`) && (!aliasHit || key.length > aliasHit.length)) {
      aliasHit = key;
    }
  }
  // opção contida no valor ou valor contido na opção
  let optionHit: T | null = null;
  for (const opt of options) {
    if (optionHit) break;
    if (wrapped.includes(`_${opt}_`) || `_${opt}_`.includes(wrapped)) optionHit = opt;
  }
  // flexões simples: "walking" → walk, "trees" → tree
  if (!optionHit && !aliasHit) {
    const tokens = norm.split('_');
    optionHit =
      options.find((opt) => opt.length >= 4 && tokens.some((tok) => tok.startsWith(opt))) ?? null;
  }
  if (optionHit && (!aliasHit || optionHit.length >= aliasHit.length)) return optionHit;
  if (aliasHit) return aliases[aliasHit];

  let best = fallback;
  let bestDist = Infinity;
  for (const opt of options) {
    const d = levenshtein(norm, opt);
    if (d < bestDist) {
      bestDist = d;
      best = opt;
    }
  }
  return bestDist <= Math.max(2, Math.floor(norm.length * 0.4)) ? best : fallback;
}

export function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(v)) {
    return `#${v
      .toLowerCase()
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  return undefined;
}

function sanitizeVec3(value: unknown): Vec3 | undefined {
  let arr: unknown[] | undefined;
  if (Array.isArray(value)) arr = value;
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    arr = [o.x, o.y, o.z];
  }
  if (!arr || arr.length < 3) return undefined;
  const nums = arr.slice(0, 3).map((n) => (typeof n === 'string' ? Number(n) : n));
  if (!nums.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) {
    return undefined;
  }
  return nums.map((n) => clamp(n, -WORLD_LIMIT, WORLD_LIMIT)) as Vec3;
}

const num = (value: unknown, fallback: number): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Posição final padrão da câmera quando `endPos` não veio ou é inválido. */
export function deriveEndPos(movement: CameraMovement, start: Vec3, lookAt: Vec3): Vec3 {
  switch (movement) {
    case 'zoom_in':
      return start.map((s, i) => s + (lookAt[i] - s) * 0.3) as Vec3;
    case 'zoom_out':
      return start.map((s, i) => s + (s - lookAt[i]) * 0.35) as Vec3;
    case 'pan_left':
      return [start[0] - 2.5, start[1], start[2]];
    case 'pan_right':
      return [start[0] + 2.5, start[1], start[2]];
    default:
      return [...start] as Vec3;
  }
}

function sanitizeEnvironment(raw: unknown): EnvironmentDef {
  const r = asRecord(raw);
  const preset = closestEnum(r.preset, PRESETS, 'sertao_day', PRESET_ALIASES);
  const pal = PRESET_PALETTES[preset];
  return {
    preset,
    skyColor: sanitizeColor(r.skyColor) ?? pal.sky,
    groundColor: sanitizeColor(r.groundColor) ?? pal.ground,
    fogColor: sanitizeColor(r.fogColor) ?? pal.fog,
    particles: closestEnum(r.particles, PARTICLES, pal.particles, PARTICLE_ALIASES),
  };
}

type Look = Pick<CharacterDef, 'skinColor' | 'shirtColor' | 'pantsColor' | 'accessory'>;

function sanitizeCharacters(raw: unknown, registry: Map<string, Look>): CharacterDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CharacterDef[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_CHARACTERS)) {
    const r = asRecord(item);
    let id =
      typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 40) : `char_${out.length + 1}`;
    while (seen.has(id)) id += '_b';
    seen.add(id);

    // o mesmo id mantém aparência entre cenas: vale a primeira aparição
    let look = registry.get(id);
    if (!look) {
      look = {
        skinColor: sanitizeColor(r.skinColor) ?? '#8d5524',
        shirtColor: sanitizeColor(r.shirtColor) ?? '#f4f1ea',
        pantsColor: sanitizeColor(r.pantsColor) ?? '#3d352e',
        accessory: closestEnum(r.accessory, ACCESSORIES, 'none', ACCESSORY_ALIASES),
      };
      registry.set(id, look);
    }

    const position = sanitizeVec3(r.position) ?? [(out.length - 0.5) * 1.6, 0, 0];
    position[1] = clamp(position[1], 0, 3);
    const target = sanitizeVec3(r.targetPosition);
    if (target) target[1] = clamp(target[1], 0, 3);

    const def: CharacterDef = {
      id,
      position,
      ...look,
      animation: closestEnum(r.animation, ANIMATIONS, 'idle', ANIMATION_ALIASES),
    };
    if (target) def.targetPosition = target;
    out.push(def);
  }
  return out;
}

function sanitizeProps(raw: unknown, preset: Preset): PropDef[] {
  if (!Array.isArray(raw)) return [];
  const fallback = PRESET_PALETTES[preset].fallbackProp;
  return raw.slice(0, MAX_PROPS).map((item, i) => {
    const r = asRecord(item);
    const position = sanitizeVec3(r.position) ?? [((i % 5) - 2) * 2, 0, -3 - Math.floor(i / 5) * 2];
    const def: PropDef = {
      type: closestEnum(r.type, PROP_TYPES, fallback, PROP_ALIASES),
      position,
      rotationY: num(r.rotationY, 0),
      scale: clamp(num(r.scale, 1), 0.2, 4),
    };
    const color = sanitizeColor(r.color);
    if (color) def.color = color;
    return def;
  });
}

function sanitizeCamera(raw: unknown, characters: CharacterDef[]): CameraDef {
  const r = asRecord(raw);
  let movement = closestEnum(r.movement, CAMERA_MOVEMENTS, 'static', MOVEMENT_ALIASES);
  const lookAt = sanitizeVec3(r.lookAt) ?? ([...DEFAULT_LOOK_AT] as Vec3);
  let startPos = sanitizeVec3(r.startPos) ?? ([...DEFAULT_CAMERA_START] as Vec3);
  startPos[1] = Math.max(0.3, startPos[1]);
  // câmera colada no alvo não tem para onde olhar
  if (Math.hypot(startPos[0] - lookAt[0], startPos[1] - lookAt[1], startPos[2] - lookAt[2]) < 0.5) {
    startPos = [lookAt[0], lookAt[1] + 1.8, lookAt[2] + 9];
  }

  let target: string | undefined;
  if (movement === 'follow_character') {
    if (characters.length === 0) movement = 'static';
    else {
      const wanted = typeof r.target === 'string' ? r.target.trim() : '';
      target = characters.some((c) => c.id === wanted) ? wanted : characters[0].id;
    }
  }

  const endPos = sanitizeVec3(r.endPos) ?? deriveEndPos(movement, startPos, lookAt);
  endPos[1] = Math.max(0.3, endPos[1]);

  const cam: CameraDef = { movement, startPos, endPos, lookAt };
  if (target) cam.target = target;
  return cam;
}

function sanitizeScene(raw: unknown, id: string, registry: Map<string, Look>): SceneDef {
  const r = asRecord(raw);
  const environment = sanitizeEnvironment(r.environment);
  const characters = sanitizeCharacters(r.characters, registry);
  const scene: SceneDef = {
    id,
    startTime: Math.max(0, num(r.startTime, 0)),
    endTime: num(r.endTime, NaN),
    environment,
    camera: sanitizeCamera(r.camera, characters),
    characters,
    props: sanitizeProps(r.props, environment.preset),
  };
  if (typeof r.locationTitle === 'string' && r.locationTitle.trim()) {
    scene.locationTitle = r.locationTitle.trim().slice(0, 60);
  }
  return scene;
}

/**
 * Normaliza um SceneGraphJSON de origem não confiável.
 *
 * Com `slots`, o número de cenas, os ids e os tempos vêm das fatias do áudio
 * (o LLM não decide sincronia); cena que faltar é preenchida por `fallback`.
 * Sem `slots` (JSON editado à mão), os tempos recebidos são mantidos e só
 * corrigidos para ficarem ordenados e sem sobreposição.
 */
export function sanitizeSceneGraph(
  raw: unknown,
  slots?: SceneSlot[],
  fallback?: SceneDef[],
): SceneGraphJSON {
  const root = asRecord(raw);
  const rawScenes: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(root.scenes)
      ? root.scenes
      : [];
  const registry = new Map<string, Look>();

  if (slots) {
    const byId = new Map<string, unknown>();
    for (const s of rawScenes) {
      const id = asRecord(s).id;
      if (typeof id === 'string' && !byId.has(id)) byId.set(id, s);
    }
    const scenes = slots.map((slot, i) => {
      const source = byId.get(slot.id) ?? rawScenes[i] ?? fallback?.[i];
      const scene = sanitizeScene(source, slot.id, registry);
      scene.startTime = slot.startTime;
      scene.endTime = slot.endTime;
      return scene;
    });
    return { scenes };
  }

  const scenes = rawScenes.map((s, i) => {
    const id = asRecord(s).id;
    return sanitizeScene(s, typeof id === 'string' && id.trim() ? id.trim() : `scene_${i + 1}`, registry);
  });
  scenes.sort((a, b) => a.startTime - b.startTime);
  let prevEnd = 0;
  for (const scene of scenes) {
    scene.startTime = Math.max(scene.startTime, prevEnd);
    if (!(scene.endTime > scene.startTime)) scene.endTime = scene.startTime + 5;
    prevEnd = scene.endTime;
  }
  return { scenes };
}

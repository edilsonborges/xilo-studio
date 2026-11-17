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
  CHARACTER_KINDS,
  PARTICLES,
  PRESETS,
  PROP_TYPES,
  TIMES_OF_DAY,
  WEATHERS,
  type Accessory,
  type CharacterKind,
  type TimeOfDay,
  type Weather,
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
/** objetos com assento onde um personagem pode ir montado ou sentado */
export const MOUNTABLE: ReadonlySet<PropType> = new Set<PropType>([
  'car', 'truck', 'bus', 'bicycle', 'motorcycle', 'boat', 'cart', 'horse',
  'chair', 'bench', 'sofa', 'pew', 'desk', 'pier',
]);
const MAX_PROPS = 24;
const WORLD_LIMIT = 40;

type Aliases<T extends string> = Record<string, T>;

const PRESET_ALIASES: Aliases<Preset> = {
  night: 'interior_night',
  bedroom: 'interior_night',
  quarto: 'interior_night',
  indoor: 'living_room',
  interior: 'living_room',
  sala: 'living_room',
  home: 'living_room',
  casa: 'living_room',
  cozinha: 'kitchen',
  escola: 'classroom',
  school: 'classroom',
  igreja: 'church',
  capela: 'church',
  sunset: 'village_sunset',
  village: 'village_sunset',
  vila: 'village_sunset',
  dusk: 'village_sunset',
  entardecer: 'village_sunset',
  sertao: 'sertao_day',
  desert: 'sertao_day',
  deserto: 'sertao_day',
  day: 'sertao_day',
  dia: 'sertao_day',
  caatinga: 'caatinga_drought',
  drought: 'caatinga_drought',
  seca: 'caatinga_drought',
  fazenda: 'farm',
  roca: 'farm',
  countryside: 'farm',
  estrada: 'country_road',
  road: 'country_road',
  city: 'city_street',
  cidade: 'city_street',
  street: 'city_street',
  rua: 'city_street',
  town: 'town_square',
  square: 'town_square',
  praca: 'town_square',
  market: 'street_market',
  feira: 'street_market',
  floresta: 'forest',
  jungle: 'forest',
  woods: 'forest',
  mata: 'forest',
  rio: 'river',
  lake: 'river',
  lago: 'river',
  serra: 'mountain',
  montanha: 'mountain',
  mountains: 'mountain',
  field: 'flower_field',
  meadow: 'flower_field',
  jardim: 'flower_field',
  garden: 'flower_field',
  praia: 'beach',
  coast: 'beach',
  porto: 'harbor',
  port: 'harbor',
  pier: 'harbor',
  sea: 'open_sea',
  ocean: 'open_sea',
  mar: 'open_sea',
  oceano: 'open_sea',
  junina: 'festa_junina',
  sao_joao: 'festa_junina',
  festival: 'festa_junina',
  carnaval: 'carnival',
  party: 'carnival',
  festa: 'carnival',
  stars: 'starry_night',
  estrelas: 'starry_night',
  sonho: 'dream',
  fantasy: 'dream',
};

const PARTICLE_ALIASES: Aliases<ParticleKind> = {
  poeira: 'dust',
  sand: 'dust',
  snow: 'dust',
  firefly: 'fireflies',
  vagalume: 'fireflies',
  sparks: 'embers',
  faiscas: 'embers',
  fagulhas: 'embers',
  leaf: 'leaves',
  folhas: 'leaves',
  petal: 'petals',
  flowers: 'petals',
  petalas: 'petals',
  confete: 'confetti',
  streamers: 'confetti',
  chuva: 'rain',
  storm: 'rain',
  off: 'none',
  nenhum: 'none',
};

const WEATHER_ALIASES: Aliases<Weather> = {
  sunny: 'clear',
  sol: 'clear',
  ensolarado: 'clear',
  overcast: 'cloudy',
  clouds: 'cloudy',
  nublado: 'cloudy',
  chuva: 'rain',
  rainy: 'rain',
  drizzle: 'rain',
  tempestade: 'storm',
  thunderstorm: 'storm',
  thunder: 'storm',
  lightning: 'storm',
  neblina: 'fog',
  mist: 'fog',
  foggy: 'fog',
  nevoa: 'fog',
  vento: 'wind',
  windy: 'wind',
  ventania: 'wind',
};

const TIME_ALIASES: Aliases<TimeOfDay> = {
  morning: 'day',
  noon: 'day',
  manha: 'day',
  dia: 'day',
  afternoon: 'day',
  dusk: 'sunset',
  evening: 'sunset',
  entardecer: 'sunset',
  tarde: 'sunset',
  noite: 'night',
  midnight: 'night',
  madrugada: 'night',
  sunrise: 'dawn',
  amanhecer: 'dawn',
  aurora: 'dawn',
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
  crane: 'crane_up',
  rise: 'crane_up',
  tilt_up: 'crane_up',
  jib_up: 'crane_up',
  descend: 'crane_down',
  tilt_down: 'crane_down',
  jib_down: 'crane_down',
  shaky: 'handheld',
  shake: 'handheld',
  documentary: 'handheld',
};

const ANIMATION_ALIASES: Aliases<AnimationName> = {
  running: 'run',
  correr: 'run',
  sprint: 'run',
  andar: 'walk',
  walking: 'walk',
  caminhar: 'walk',
  pular: 'jump',
  jumping: 'jump',
  hop: 'jump',
  dancar: 'dance',
  dancing: 'dance',
  sentar: 'sit',
  sitting: 'sit',
  seated: 'sit',
  speak: 'talk',
  speaking: 'talk',
  falar: 'talk',
  dormir: 'sleep',
  lie: 'sleep',
  lying: 'sleep',
  wave: 'gesture',
  waving: 'gesture',
  acenar: 'gesture',
  gesticular: 'gesture',
  pointing: 'point',
  apontar: 'point',
  applaud: 'clap',
  aplaudir: 'clap',
  cheer: 'celebrate',
  comemorar: 'celebrate',
  festejar: 'celebrate',
  kneel: 'pray',
  rezar: 'pray',
  orar: 'pray',
  driving: 'drive',
  dirigir: 'drive',
  riding: 'ride',
  montar: 'ride',
  cavalgar: 'ride',
  pedalar: 'ride',
  cycle: 'ride',
  stand: 'idle',
  parado: 'idle',
};

const KIND_ALIASES: Aliases<CharacterKind> = {
  male: 'man',
  homem: 'man',
  boy_adult: 'man',
  female: 'woman',
  mulher: 'woman',
  lady: 'woman',
  moca: 'woman',
  girl: 'child',
  boy: 'child',
  kid: 'child',
  menino: 'child',
  menina: 'child',
  crianca: 'child',
  old: 'elderly',
  old_man: 'elderly',
  old_woman: 'elderly',
  idoso: 'elderly',
  idosa: 'elderly',
  velho: 'elderly',
  velha: 'elderly',
  grandpa: 'elderly',
  grandma: 'elderly',
};

const ACCESSORY_ALIASES: Aliases<Accessory> = {
  hat: 'straw_hat',
  chapeu: 'straw_hat',
  sombrero: 'straw_hat',
  baseball_cap: 'cap',
  bone: 'cap',
  cangaceiro: 'leather_hat',
  leather: 'leather_hat',
  couro: 'leather_hat',
  scarf: 'headscarf',
  lenco: 'headscarf',
  bandana: 'headscarf',
  oculos: 'glasses',
  spectacles: 'glasses',
};

const PROP_ALIASES: Aliases<PropType> = {
  house: 'rustic_house',
  casa: 'rustic_house',
  hut: 'rustic_house',
  cabin: 'rustic_house',
  home: 'rustic_house',
  predio: 'building',
  apartment: 'building',
  store: 'building',
  shop: 'building',
  loja: 'building',
  igreja: 'church',
  chapel: 'church',
  celeiro: 'barn',
  stall: 'market_stall',
  barraca: 'market_stall',
  booth: 'market_stall',
  coreto: 'bandstand',
  gazebo: 'bandstand',
  street_light: 'lamp_post',
  streetlight: 'lamp_post',
  poste: 'lamp_post',
  banco: 'bench',
  telephone_pole: 'pole',
  poco: 'well',
  cama: 'bed',
  dead_tree: 'dry_tree',
  bare_tree: 'dry_tree',
  arvore_seca: 'dry_tree',
  arvore: 'tree',
  pine: 'tree',
  coqueiro: 'palm_tree',
  coconut: 'palm_tree',
  palm: 'palm_tree',
  arbusto: 'bush',
  shrub: 'bush',
  stone: 'rock',
  pedra: 'rock',
  boulder: 'rock',
  flower: 'flowers',
  flores: 'flowers',
  milho: 'cornfield',
  crops: 'cornfield',
  plantation: 'cornfield',
  island: 'cloud_island',
  cacto: 'cactus',
  mandacaru: 'cactus',
  mesa: 'table',
  cadeira: 'chair',
  stool: 'chair',
  couch: 'sofa',
  televisao: 'tv',
  television: 'tv',
  planta: 'plant',
  vaso: 'plant',
  fogao: 'stove',
  oven: 'stove',
  carteira: 'desk',
  lousa: 'blackboard',
  chalkboard: 'blackboard',
  quadro: 'blackboard',
  banco_igreja: 'pew',
  lamp: 'lantern',
  lampiao: 'lantern',
  candle: 'lantern',
  torch: 'lantern',
  fogueira: 'bonfire',
  campfire: 'bonfire',
  fire: 'bonfire',
  bandeirinhas: 'bunting',
  flags: 'bunting',
  path: 'road',
  estrada: 'road',
  street: 'road',
  trail: 'road',
  cerca: 'fence',
  wall: 'fence',
  ponte: 'bridge',
  cais: 'pier',
  dock: 'pier',
  barril: 'barrel',
  guarda_sol: 'umbrella',
  parasol: 'umbrella',
  carro: 'car',
  automobile: 'car',
  taxi: 'car',
  caminhao: 'truck',
  lorry: 'truck',
  onibus: 'bus',
  bike: 'bicycle',
  bicicleta: 'bicycle',
  moto: 'motorcycle',
  motorbike: 'motorcycle',
  barco: 'boat',
  ship: 'boat',
  canoe: 'boat',
  jangada: 'boat',
  carroca: 'cart',
  wagon: 'cart',
  cavalo: 'horse',
  pony: 'horse',
  cachorro: 'dog',
  cao: 'dog',
  puppy: 'dog',
  galinha: 'chicken',
  hen: 'chicken',
  rooster: 'chicken',
  galo: 'chicken',
  passaro: 'bird',
  pigeon: 'bird',
  bode: 'goat',
  cabra: 'goat',
  cow: 'animal',
  ox: 'animal',
  boi: 'animal',
  vaca: 'animal',
  cattle: 'animal',
  donkey: 'animal',
  burro: 'animal',
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
    case 'crane_up':
      return [start[0], start[1] + 3, start[2] + 1.5];
    case 'crane_down':
      return [start[0], Math.max(0.8, start[1] - 2), start[2] - 1.5];
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
    ...(r.weather !== undefined ? { weather: closestEnum(r.weather, WEATHERS, 'clear', WEATHER_ALIASES) } : {}),
    ...(r.timeOfDay !== undefined ? { timeOfDay: closestEnum(r.timeOfDay, TIMES_OF_DAY, 'day', TIME_ALIASES) } : {}),
  };
}

type Look = Pick<CharacterDef, 'skinColor' | 'shirtColor' | 'pantsColor' | 'accessory' | 'kind'>;

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
        kind: closestEnum(r.kind, CHARACTER_KINDS, 'man', KIND_ALIASES),
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
    if (typeof r.mount === 'string' && r.mount.trim()) def.mount = r.mount.trim().slice(0, 40);
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
    if (typeof r.id === 'string' && r.id.trim()) def.id = r.id.trim().slice(0, 40);
    const target = sanitizeVec3(r.targetPosition);
    if (target) def.targetPosition = target;
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
  // montaria só vale para um objeto que existe na cena e tem assento
  const mountable = new Set(scene.props.filter((p) => p.id && MOUNTABLE.has(p.type)).map((p) => p.id));
  for (const c of scene.characters) if (c.mount && !mountable.has(c.mount)) delete c.mount;
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

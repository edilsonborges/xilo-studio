// Catálogo de cenários 3D. Cada entrada reúne tudo o que o resto do app precisa
// saber sobre um lugar: categoria, paleta, se é interno, objetos típicos, clima e
// hora padrão, e as palavras do roteiro que o escolhem. O motor (backdrops), o
// gerador por regras, o validador e o prompt da IA leem daqui.

import type { ParticleKind, PropType, TimeOfDay, Vec3, Weather } from './types';

export const SCENARIO_CATEGORIES = [
  'Sertão e campo',
  'Cidade',
  'Natureza',
  'Litoral e água',
  'Interiores',
  'Festas e sonho',
] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

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

export interface Lexicon {
  stems?: string[];
  exact?: string[];
}

export interface Scenario {
  label: string;
  category: ScenarioCategory;
  /** descrição curta em inglês para o prompt da IA */
  hint: string;
  indoor: boolean;
  palette: PresetPalette;
  /** objetos que completam a cena quando o roteiro não pede outros */
  dressing: PropType[];
  weather: Weather;
  timeOfDay: TimeOfDay;
  words: Lexicon;
}

const base: Omit<PresetPalette, 'sky' | 'skyTop' | 'ground' | 'fog' | 'particles' | 'fallbackProp'> = {
  wall: '#d9a066',
  roof: '#a8502e',
  wood: '#7a5230',
  foliage: '#6f9a48',
  trunk: '#6b4a2f',
  cactus: '#5f8f4e',
  cloth: '#c9483b',
  animal: '#8a5a3c',
  road: '#a87643',
  sunColor: '#fff1d6',
  sunIntensity: 2.5,
  sunDir: [5, 9, 6],
  ambientColor: '#f3e2c8',
  ambientIntensity: 1.2,
  fogNear: 16,
  fogFar: 60,
};

const pal = (p: Partial<PresetPalette> & Pick<PresetPalette, 'sky' | 'skyTop' | 'ground' | 'fog' | 'particles' | 'fallbackProp'>): PresetPalette => ({ ...base, ...p });

export const SCENARIOS = {
  // ---------- Sertão e campo ----------
  sertao_day: {
    label: 'Sertão de dia',
    category: 'Sertão e campo',
    hint: 'dry Brazilian backlands under strong sun, mesas on the horizon',
    indoor: false,
    palette: pal({ sky: '#e8c391', skyTop: '#7fb4d6', ground: '#c28d53', fog: '#e8c391', particles: 'dust', fallbackProp: 'cactus', foliage: '#7d9a4a', sunIntensity: 2.6 }),
    dressing: ['cactus', 'dry_tree', 'rustic_house', 'cactus'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['serta', 'calor', 'poeira', 'mandacaru', 'cacto', 'nordest'], exact: ['sol', 'dia', 'seca'] },
  },
  caatinga_drought: {
    label: 'Caatinga na seca',
    category: 'Sertão e campo',
    hint: 'cracked dry earth, leafless trees, cow skull, harsh white light',
    indoor: false,
    palette: pal({ sky: '#f1dcb2', skyTop: '#a9c3cf', ground: '#c9a476', fog: '#efdcb8', particles: 'dust', fallbackProp: 'dry_tree', foliage: '#9a8f5a', sunIntensity: 2.8 }),
    dressing: ['dry_tree', 'dry_tree', 'rock', 'cactus', 'rock'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['caatinga', 'estiagem', 'rachad', 'ressec', 'sede', 'retirante', 'flagel'], exact: ['seca', 'secas'] },
  },
  farm: {
    label: 'Fazenda e roça',
    category: 'Sertão e campo',
    hint: 'green farm with corn rows, fences, barn and well',
    indoor: false,
    palette: pal({ sky: '#cfe3ef', skyTop: '#6fa6d0', ground: '#7f9a4c', fog: '#d4e4dc', particles: 'none', fallbackProp: 'fence', foliage: '#5f9440', sunIntensity: 2.4 }),
    dressing: ['barn', 'fence', 'cornfield', 'well', 'tree'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['fazenda', 'roca', 'sitio', 'plant', 'colheit', 'milharal', 'curral', 'lavour', 'agricult', 'boiad', 'porteira'], exact: ['milho', 'campo'] },
  },
  village_sunset: {
    label: 'Vila ao entardecer',
    category: 'Sertão e campo',
    hint: 'small country village at sunset, adobe houses, fences, warm light',
    indoor: false,
    palette: pal({ sky: '#f2a65a', skyTop: '#5b4b8a', ground: '#b9754a', fog: '#f0996a', particles: 'fireflies', fallbackProp: 'fence', wall: '#e6b98a', roof: '#8f3f2a', wood: '#6f4528', cloth: '#d9843b', sunColor: '#ffb070', sunIntensity: 2.4, sunDir: [-7, 4, 3], ambientColor: '#c98a8a', ambientIntensity: 1.15, fogNear: 14, fogFar: 55 }),
    dressing: ['rustic_house', 'fence', 'rustic_house', 'tree'],
    weather: 'clear',
    timeOfDay: 'sunset',
    words: { stems: ['vila', 'povoad', 'vilarej', 'arraial', 'entardec', 'crepuscul'], exact: ['tarde', 'tardinha'] },
  },
  country_road: {
    label: 'Estrada de terra',
    category: 'Sertão e campo',
    hint: 'long dirt road crossing open countryside, telephone poles',
    indoor: false,
    palette: pal({ sky: '#e6d3a8', skyTop: '#86b2d3', ground: '#b48a58', fog: '#e3cfa6', particles: 'dust', fallbackProp: 'road', foliage: '#86984c' }),
    dressing: ['road', 'pole', 'dry_tree', 'fence', 'rock'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['estrada', 'viagem', 'viaj', 'jornada', 'rodovia', 'beira da', 'caminhao', 'boleia', 'carona'], exact: ['br'] },
  },

  // ---------- Cidade ----------
  city_street: {
    label: 'Rua da cidade',
    category: 'Cidade',
    hint: 'city street with colorful buildings, sidewalk, lamp posts and traffic',
    indoor: false,
    palette: pal({ sky: '#cfdbe6', skyTop: '#6f9cc8', ground: '#5f6670', fog: '#cbd5df', particles: 'none', fallbackProp: 'building', wall: '#d8b48a', road: '#3f444b', wood: '#5a4a3a', sunIntensity: 2.3, ambientColor: '#dfe4ea' }),
    dressing: ['building', 'building', 'lamp_post', 'building', 'tree'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['cidade', 'urban', 'avenida', 'calcad', 'transit', 'predio', 'centro', 'metropol', 'semafor', 'esquina'], exact: ['rua', 'ruas'] },
  },
  town_square: {
    label: 'Praça com coreto',
    category: 'Cidade',
    hint: 'town square with bandstand, church, benches and trees',
    indoor: false,
    palette: pal({ sky: '#d8e8f0', skyTop: '#73a8d4', ground: '#c9b08a', fog: '#d8e4e6', particles: 'leaves', fallbackProp: 'bench', foliage: '#4f8f45' }),
    dressing: ['bandstand', 'church', 'bench', 'tree', 'lamp_post'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['praca', 'coreto', 'igreja', 'matriz', 'banco da', 'pracinha'], exact: ['missa'] },
  },
  street_market: {
    label: 'Feira livre',
    category: 'Cidade',
    hint: 'open-air street market with colorful stalls and awnings',
    indoor: false,
    palette: pal({ sky: '#f0dcb4', skyTop: '#7fb0d6', ground: '#b9926a', fog: '#efd9b6', particles: 'none', fallbackProp: 'market_stall', cloth: '#d94a3a' }),
    dressing: ['market_stall', 'market_stall', 'market_stall', 'building'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['feira', 'mercad', 'barraca', 'vend', 'compr', 'freguês', 'fregues', 'pastel', 'fruta'] },
  },
  city_night: {
    label: 'Cidade à noite',
    category: 'Cidade',
    hint: 'city at night, lit windows, street lights, wet asphalt',
    indoor: false,
    palette: pal({ sky: '#1d2240', skyTop: '#090b1c', ground: '#2c2f38', fog: '#1d2240', particles: 'none', fallbackProp: 'lamp_post', wall: '#5a5f78', road: '#26292f', sunColor: '#8fa6ff', sunIntensity: 1.1, sunDir: [-4, 8, 5], ambientColor: '#3d4680', ambientIntensity: 1.1, fogNear: 14, fogFar: 46 }),
    dressing: ['building', 'lamp_post', 'building', 'lamp_post', 'building'],
    weather: 'clear',
    timeOfDay: 'night',
    words: { stems: ['madrugad', 'boemi', 'balada', 'neon', 'bares', 'boate'], exact: ['noite', 'noitada'] },
  },

  // ---------- Natureza ----------
  forest: {
    label: 'Floresta',
    category: 'Natureza',
    hint: 'dense green forest with tall trees and falling leaves',
    indoor: false,
    palette: pal({ sky: '#b7d9c0', skyTop: '#5fa3b8', ground: '#4f7a3f', fog: '#a9cfb0', particles: 'leaves', fallbackProp: 'tree', wall: '#b98f62', roof: '#6b4a32', wood: '#63432a', foliage: '#3f8a45', trunk: '#5b3f28', sunColor: '#f4ffd9', sunIntensity: 2.2, sunDir: [4, 10, 3], ambientColor: '#bfe0c2', fogNear: 10, fogFar: 40 }),
    dressing: ['tree', 'tree', 'bush', 'tree', 'rock'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['florest', 'selva', 'bosque', 'arvore', 'amazon', 'trilha'], exact: ['mata', 'matas'] },
  },
  river: {
    label: 'Beira de rio',
    category: 'Natureza',
    hint: 'river bank with a wooden bridge, reeds and stones',
    indoor: false,
    palette: pal({ sky: '#cde6ee', skyTop: '#5f9fcf', ground: '#6f9150', fog: '#cfe3e2', particles: 'none', fallbackProp: 'rock', foliage: '#4f8c46' }),
    dressing: ['bridge', 'rock', 'tree', 'bush'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['rio', 'riacho', 'corrego', 'margem', 'ponte', 'pescar', 'pescou', 'nadou', 'nadar', 'agua doce'], exact: ['rio', 'beira'] },
  },
  mountain: {
    label: 'Serra e montanhas',
    category: 'Natureza',
    hint: 'rocky mountains, high plateau, wide sky',
    indoor: false,
    palette: pal({ sky: '#d6e2ec', skyTop: '#5d8fc4', ground: '#8a8a6a', fog: '#d2dde6', particles: 'none', fallbackProp: 'rock', foliage: '#5c7d46', fogNear: 20, fogFar: 80 }),
    dressing: ['rock', 'rock', 'tree', 'bush'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['serra', 'montanh', 'morro', 'pico', 'chapad', 'penhasc', 'escal', 'subiu o', 'colina'] },
  },
  flower_field: {
    label: 'Campo florido',
    category: 'Natureza',
    hint: 'open meadow full of flowers, butterflies, soft breeze',
    indoor: false,
    palette: pal({ sky: '#dcecf2', skyTop: '#7ab4dc', ground: '#86b05a', fog: '#e3efe0', particles: 'petals', fallbackProp: 'flowers', foliage: '#6aa64a' }),
    dressing: ['flowers', 'flowers', 'tree', 'flowers', 'bush'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['flor', 'jardim', 'primaver', 'borbolet', 'campin', 'prado', 'perfum'] },
  },

  // ---------- Litoral e água ----------
  beach: {
    label: 'Praia',
    category: 'Litoral e água',
    hint: 'tropical beach with sand, sea, coconut palms and sun',
    indoor: false,
    palette: pal({ sky: '#d4ecf4', skyTop: '#4fa3d8', ground: '#ead2a0', fog: '#d6ecf2', particles: 'none', fallbackProp: 'palm_tree', foliage: '#4f9a4a', sunIntensity: 2.7, ambientColor: '#f6ead6' }),
    dressing: ['palm_tree', 'palm_tree', 'umbrella', 'rock'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['praia', 'areia', 'coqueir', 'litoral', 'onda', 'verao', 'surf', 'mergulh', 'banho de mar'], exact: ['mar'] },
  },
  harbor: {
    label: 'Porto e cais',
    category: 'Litoral e água',
    hint: 'small harbor with wooden pier, fishing boats and warehouses',
    indoor: false,
    palette: pal({ sky: '#cfdfe6', skyTop: '#5c8fb8', ground: '#8d8070', fog: '#ccdbe0', particles: 'none', fallbackProp: 'pier', wood: '#6b4a32', wall: '#c9a27a' }),
    dressing: ['pier', 'boat', 'building', 'barrel'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['porto', 'cais', 'pescador', 'jangad', 'navio', 'embarc', 'atracad', 'marinheir'] },
  },
  open_sea: {
    label: 'Alto-mar',
    category: 'Litoral e água',
    hint: 'open sea with waves to the horizon, a boat in the middle',
    indoor: false,
    palette: pal({ sky: '#c8dfea', skyTop: '#3f7fb8', ground: '#2f6f9a', fog: '#c2d8e4', particles: 'none', fallbackProp: 'boat', fogNear: 20, fogFar: 90 }),
    dressing: ['boat'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['altomar', 'alto mar', 'oceano', 'naveg', 'velej', 'tempestade no mar', 'naufrag', 'barco'] },
  },

  // ---------- Interiores ----------
  interior_night: {
    label: 'Quarto à noite',
    category: 'Interiores',
    hint: 'bedroom at night with a window to the moon',
    indoor: true,
    palette: pal({ sky: '#141b33', skyTop: '#070a18', ground: '#5a4232', fog: '#141b33', particles: 'dust', fallbackProp: 'table', wall: '#8c6f58', roof: '#4a2f24', wood: '#6e4a2e', foliage: '#2f4f3f', trunk: '#3d2c20', cactus: '#356048', cloth: '#3f6fa8', animal: '#5e4636', road: '#4a3a2e', sunColor: '#9db4ff', sunIntensity: 1.5, sunDir: [-4, 8, 5], ambientColor: '#4a5a9a', ambientIntensity: 1.3, fogNear: 14, fogFar: 42 }),
    dressing: ['bed', 'lantern', 'table'],
    weather: 'clear',
    timeOfDay: 'night',
    words: { stems: ['dorm', 'sonh', 'adormec', 'quarto', 'deit', 'cochil'], exact: ['cama', 'sono'] },
  },
  living_room: {
    label: 'Sala de casa',
    category: 'Interiores',
    hint: 'cozy living room by day, sofa, TV, rug, plant',
    indoor: true,
    palette: pal({ sky: '#e8d6b8', skyTop: '#a8c8e0', ground: '#8a6a4c', fog: '#e8d6b8', particles: 'none', fallbackProp: 'sofa', wall: '#e3c8a0', cloth: '#5a7fa8', sunIntensity: 2, ambientColor: '#f2e2c8', ambientIntensity: 1.35, fogNear: 14, fogFar: 42 }),
    dressing: ['sofa', 'tv', 'plant', 'chair'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['sala', 'sofa', 'televis', 'visita', 'familia reunid', 'em casa'], exact: ['tv', 'lar'] },
  },
  kitchen: {
    label: 'Cozinha',
    category: 'Interiores',
    hint: 'rustic kitchen with wood stove, table, pots and window',
    indoor: true,
    palette: pal({ sky: '#f0dcb8', skyTop: '#a8c8e0', ground: '#7a5a42', fog: '#f0dcb8', particles: 'none', fallbackProp: 'table', wall: '#e8d0a8', cloth: '#c84a3a', sunIntensity: 2, ambientColor: '#f6e4c8', ambientIntensity: 1.35, fogNear: 14, fogFar: 42 }),
    dressing: ['stove', 'table', 'chair', 'plant'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['cozinh', 'fogao', 'panela', 'almoc', 'jantar', 'comida', 'receita', 'cafe', 'bolo', 'cuscuz'] },
  },
  classroom: {
    label: 'Sala de aula',
    category: 'Interiores',
    hint: 'school classroom with blackboard and rows of desks',
    indoor: true,
    palette: pal({ sky: '#e4e8d8', skyTop: '#a8c8e0', ground: '#8a7058', fog: '#e4e8d8', particles: 'none', fallbackProp: 'desk', wall: '#d8dcc0', wood: '#8a6440', sunIntensity: 2, ambientColor: '#f0f0e0', ambientIntensity: 1.35, fogNear: 14, fogFar: 42 }),
    dressing: ['blackboard', 'desk', 'desk', 'desk'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['escola', 'aula', 'professor', 'aluno', 'estud', 'lousa', 'quadro negro', 'licao', 'prova', 'colegio'] },
  },
  church: {
    label: 'Dentro da igreja',
    category: 'Interiores',
    hint: 'small church interior with pews, altar and colored windows',
    indoor: true,
    palette: pal({ sky: '#d8c8a8', skyTop: '#8a6a9a', ground: '#7a6450', fog: '#cdbd9e', particles: 'dust', fallbackProp: 'pew', wall: '#e8dcc0', wood: '#6a4a30', cloth: '#b8323a', sunColor: '#ffe2b0', sunIntensity: 1.8, ambientColor: '#d8c8b0', ambientIntensity: 1.3, fogNear: 14, fogFar: 44 }),
    dressing: ['altar', 'pew', 'pew', 'lantern'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['igreja', 'capela', 'altar', 'rez', 'orac', 'santo', 'padre', 'missa', 'promessa'], exact: ['deus'] },
  },

  // ---------- Festas e sonho ----------
  festa_junina: {
    label: 'Festa junina',
    category: 'Festas e sonho',
    hint: 'June festival at night: bonfire, colored bunting flags, stalls, dancing',
    indoor: false,
    palette: pal({ sky: '#2a2448', skyTop: '#0e0c22', ground: '#8a6440', fog: '#3a2a48', particles: 'embers', fallbackProp: 'bunting', wall: '#e0b080', cloth: '#d84a3a', sunColor: '#ffb070', sunIntensity: 1.2, sunDir: [-4, 8, 5], ambientColor: '#8a5a7a', ambientIntensity: 1.2, fogNear: 16, fogFar: 50 }),
    dressing: ['bonfire', 'bunting', 'market_stall', 'bunting', 'lamp_post'],
    weather: 'clear',
    timeOfDay: 'night',
    words: { stems: ['junina', 'sao joao', 'quadrilha', 'fogueira', 'forro', 'arraia', 'bandeirinh', 'quentao', 'pamonha'] },
  },
  carnival: {
    label: 'Carnaval',
    category: 'Festas e sonho',
    hint: 'street carnival, confetti, streamers, colorful costumes',
    indoor: false,
    palette: pal({ sky: '#f2c86a', skyTop: '#7a5ad8', ground: '#7a6a8a', fog: '#e8b8c8', particles: 'confetti', fallbackProp: 'bunting', wall: '#f0a0b0', cloth: '#f0c040', sunColor: '#fff0d0' }),
    dressing: ['bunting', 'building', 'bunting', 'lamp_post'],
    weather: 'clear',
    timeOfDay: 'sunset',
    words: { stems: ['carnava', 'folia', 'bloco', 'fantasi', 'frevo', 'samba', 'confete', 'serpentin', 'trio eletr', 'festa', 'comemor'] },
  },
  starry_night: {
    label: 'Noite estrelada',
    category: 'Festas e sonho',
    hint: 'open field under a huge starry sky and moon',
    indoor: false,
    palette: pal({ sky: '#1a2450', skyTop: '#05061a', ground: '#2f3a3a', fog: '#1a2450', particles: 'fireflies', fallbackProp: 'tree', foliage: '#2f4f45', sunColor: '#a8bcff', sunIntensity: 1.2, sunDir: [-4, 8, 5], ambientColor: '#4a5aa0', ambientIntensity: 1.15, fogNear: 18, fogFar: 70 }),
    dressing: ['tree', 'rock', 'bush'],
    weather: 'clear',
    timeOfDay: 'night',
    words: { stems: ['estrel', 'lua cheia', 'luar', 'ceu noturno', 'constela', 'cometa', 'vagalume'], exact: ['lua'] },
  },
  dream: {
    label: 'Sonho',
    category: 'Festas e sonho',
    hint: 'surreal dreamscape: floating islands, pastel sky, giant moon',
    indoor: false,
    palette: pal({ sky: '#f2c8e8', skyTop: '#8a8ae8', ground: '#c8a8e0', fog: '#f0d0ec', particles: 'fireflies', fallbackProp: 'cloud_island', foliage: '#e88ab8', trunk: '#8a6ab8', wall: '#f0e0f8', sunColor: '#ffe8f8', sunIntensity: 2, ambientColor: '#f0d8f0', ambientIntensity: 1.4, fogNear: 14, fogFar: 60 }),
    dressing: ['cloud_island', 'tree', 'cloud_island', 'flowers'],
    weather: 'clear',
    timeOfDay: 'day',
    words: { stems: ['sonhou com', 'sonhava com', 'imagin', 'fantasia', 'magic', 'encant', 'fada', 'paraiso', 'nuvens de algod'] },
  },
} satisfies Record<string, Scenario>;

export type Preset = keyof typeof SCENARIOS;
export const PRESETS = Object.keys(SCENARIOS) as Preset[];

export const PRESET_PALETTES: Record<Preset, PresetPalette> = Object.fromEntries(
  PRESETS.map((id) => [id, SCENARIOS[id].palette]),
) as Record<Preset, PresetPalette>;

export function scenario(id: Preset): Scenario {
  return SCENARIOS[id];
}

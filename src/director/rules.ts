// Módulo 2: gerador de cenas por regras (sem IA).
//
// Lê palavras-chave do trecho narrado em cada cena e decide cenário, clima, hora,
// personagens, ações, veículos, objetos e câmera. É determinístico: o mesmo
// roteiro gera sempre as mesmas cenas.

import { PRESET_PALETTES } from '../presets';
import { SCENARIOS, type Lexicon } from '../scenarios';
import {
  PRESETS,
  type Accessory,
  type AnimationName,
  type CameraDef,
  type CharacterDef,
  type CharacterKind,
  type Preset,
  type PropDef,
  type PropType,
  type SceneDef,
  type SceneSlot,
  type TimeOfDay,
  type Vec3,
  type Weather,
} from '../types';
import { hashString, makeRng, normalizeText, wordKey } from '../util';

const PROP_WORDS: Array<[PropType, Lexicon]> = [
  ['rustic_house', { stems: ['casa', 'casebre', 'cabana', 'rancho', 'morad', 'barraco'], exact: ['lar'] }],
  ['building', { stems: ['predio', 'edifici', 'loja', 'apartament', 'comerci'] }],
  ['church', { stems: ['igreja', 'capela', 'matriz'] }],
  ['barn', { stems: ['celeiro', 'paiol', 'estabul'] }],
  ['market_stall', { stems: ['barraca', 'banca', 'feira', 'mercad'] }],
  ['bandstand', { stems: ['coreto'] }],
  ['lamp_post', { stems: ['poste', 'luminari'] }],
  ['bench', { stems: ['banco', 'banquinho'] }],
  ['well', { stems: ['poco', 'cacimba'] }],
  ['bed', { stems: ['cama', 'dorm', 'deit', 'adormec'], exact: ['rede'] }],
  ['dry_tree', { stems: ['estiagem', 'galho', 'ressec'], exact: ['seca', 'secas', 'seco'] }],
  ['tree', { stems: ['arvore', 'florest', 'sombra', 'mangueira', 'juazeiro', 'ipe'], exact: ['mata'] }],
  ['palm_tree', { stems: ['coqueir', 'palmeir', 'coco'] }],
  ['cactus', { stems: ['cacto', 'mandacaru', 'espinho', 'xique'] }],
  ['rock', { stems: ['pedra', 'rocha', 'pedregul'] }],
  ['flowers', { stems: ['flor', 'jardim', 'buque', 'rosa'] }],
  ['cornfield', { stems: ['milho', 'plantac', 'lavour', 'roca', 'colheit'] }],
  ['table', { stems: ['mesa', 'jantar', 'almoc', 'comida', 'cafe', 'carta'] }],
  ['chair', { stems: ['cadeira', 'sentou', 'sentad', 'senta'] }],
  ['sofa', { stems: ['sofa'] }],
  ['tv', { stems: ['televis', 'novela', 'jornal na tv'], exact: ['tv'] }],
  ['stove', { stems: ['fogao', 'panela', 'cozinh'] }],
  ['desk', { stems: ['carteira', 'caderno', 'aluno'] }],
  ['blackboard', { stems: ['lousa', 'quadro', 'professor'] }],
  ['pew', { stems: ['missa', 'fieis'] }],
  ['altar', { stems: ['altar', 'santo', 'vela'] }],
  ['lantern', { stems: ['lampiao', 'lanterna', 'candeeiro', 'lamparina'], exact: ['luz', 'vela'] }],
  ['bonfire', { stems: ['fogueira', 'fogo', 'brasa', 'chama'] }],
  ['bunting', { stems: ['bandeirinh', 'enfeit', 'decorac'] }],
  ['road', { stems: ['estrada', 'caminh', 'viagem', 'viaj', 'trilha', 'jornada'] }],
  ['fence', { stems: ['cerca', 'curral', 'porteira', 'sitio'] }],
  ['bridge', { stems: ['ponte'] }],
  ['pier', { stems: ['cais', 'pier', 'trapiche'] }],
  ['umbrella', { stems: ['guarda-sol', 'guarda sol', 'sombrinh'] }],
];

const VEHICLE_WORDS: Array<[PropType, Lexicon]> = [
  ['car', { stems: ['carro', 'automov', 'taxi', 'fusca'] }],
  ['truck', { stems: ['caminha', 'carret'] }],
  ['bus', { stems: ['onibus', 'busao', 'lotacao'] }],
  ['bicycle', { stems: ['bicicleta', 'bike', 'pedal'] }],
  ['motorcycle', { stems: ['moto', 'motocicleta', 'lambreta'] }],
  ['boat', { stems: ['barco', 'jangada', 'canoa', 'navio', 'bote', 'naveg', 'velej', 'rem'] }],
  ['cart', { stems: ['carroca', 'charrete'] }],
  ['horse', { stems: ['cavalo', 'cavalg', 'egua', 'montaria', 'galop'] }],
];

const ANIMAL_WORDS: Array<[PropType, Lexicon]> = [
  ['dog', { stems: ['cachorr', 'cadela', 'viralata', 'latiu', 'latia'], exact: ['cao', 'caes'] }],
  ['chicken', { stems: ['galinha', 'galo', 'pintinh', 'frango'] }],
  ['bird', { stems: ['passar', 'ave', 'pomb', 'urubu', 'sabia', 'voou', 'voava'] }],
  ['goat', { stems: ['cabra', 'bode', 'cabrito'] }],
  ['animal', { stems: ['vaca', 'boi', 'gado', 'jument', 'burr', 'bezerr'] }],
];

const ACTIONS: Array<[AnimationName, Lexicon]> = [
  ['sleep', { stems: ['dorm', 'sonh', 'adormec', 'cochil', 'deitou', 'deitad'] }],
  ['pray', { stems: ['rez', 'orou', 'orava', 'ajoelh', 'prece', 'agradeceu a deus'] }],
  ['drive', { stems: ['dirig', 'guiav', 'guiou', 'motorist', 'acelerou', 'volante'] }],
  ['ride', { stems: ['cavalg', 'montou', 'montad', 'pedal', 'galop', 'pilot'] }],
  ['run', { stems: ['corre', 'corri', 'correu', 'disparou', 'fugi', 'fugiu', 'apressad', 'acelerou o passo'] }],
  ['jump', { stems: ['pul', 'salt', 'saltit', 'pulou'] }],
  ['dance', { stems: ['danc', 'forro', 'baile', 'xaxado', 'baiao', 'quadrilh', 'samba', 'frevo', 'ciranda'] }],
  ['celebrate', { stems: ['comemor', 'festej', 'vibr', 'gritou de alegria', 'venceu', 'ganhou', 'conquist'] }],
  ['clap', { stems: ['aplau', 'palmas', 'bateu palma'] }],
  ['sit', { stems: ['sent', 'descans', 'assist', 'esperav'] }],
  ['point', { stems: ['apont', 'mostrou', 'indicou'] }],
  ['fall', { stems: ['caiu', 'caia', 'tropec', 'desab', 'desmai', 'escorreg'] }],
  ['hug', { stems: ['abrac'] }],
  ['work', { stems: ['trabalh', 'capin', 'enxada', 'plantou', 'plantav', 'colheu', 'colhia', 'cavou', 'cavav', 'martel', 'construi', 'labut'] }],
  ['eat', { stems: ['comeu', 'comia', 'comendo', 'almocou', 'almocav', 'jantou', 'jantav', 'bebeu', 'bebia', 'mastig', 'merend'] }],
  ['carry', { stems: ['carreg', 'levava', 'trouxe', 'trazia', 'balde', 'fardo'] }],
  ['walk', { stems: ['andou', 'andava', 'andar', 'andando', 'caminhav', 'caminhou', 'caminhar', 'caminhand', 'partiu', 'partir', 'viaj', 'seguiu', 'seguir', 'saiu', 'sair', 'chegou', 'chegar', 'voltou', 'voltar', 'atravess', 'march', 'passeav'] }],
  ['talk', { stems: ['disse', 'falou', 'falava', 'contou', 'contava', 'pergunt', 'respond', 'gritou', 'chamou', 'convers', 'explic', 'avisou', 'pediu', 'prometeu'] }],
  ['gesture', { stems: ['acen', 'cumpriment', 'despedi', 'saudou', 'deu adeus'] }],
];

/** Reações: se alguém faz algo e outro reage, a reação vai para quem assiste. */
const REACTIONS: Array<[AnimationName, Lexicon]> = [
  ['surprised', { stems: ['espant', 'surpres', 'surpreend', 'assust', 'nao acredit', 'admir', 'boquiabert', 'incredul', 'susto'] }],
  ['laugh', { stems: ['riu', 'riam', 'rindo', 'gargalh', 'risada', 'sorri', 'achou graca'] }],
  ['cry', { stems: ['chor', 'lagrim', 'soluc', 'pranto', 'lament'] }],
  ['nod', { stems: ['concord', 'assentiu', 'aceitou', 'consentiu'] }],
  ['deny', { stems: ['negou', 'recus', 'discord', 'nao aceit'] }],
  ['think', { stems: ['pensou', 'pensav', 'refleti', 'lembrou', 'lembrav', 'duvid', 'matut', 'ficou pensando'] }],
];

const COMPANY: Lexicon = {
  stems: ['amig', 'mulher', 'espos', 'marid', 'filh', 'irma', 'vizinh', 'companheir', 'famil', 'menin', 'velh', 'padre', 'coronel', 'patra', 'namor', 'neto', 'neta', 'avo', 'professor', 'aluno', 'turma', 'todos', 'povo', 'gente'],
  exact: ['mae', 'pai', 'avo', 'povo', 'eles', 'elas'],
};

const KIND_WORDS: Array<[CharacterKind, Lexicon]> = [
  ['child', { stems: ['menin', 'crianc', 'garot', 'molequ', 'curumim', 'pivete', 'bebe', 'filhinh', 'netinh', 'aluno', 'aluna'] }],
  ['elderly', { stems: ['velh', 'idos', 'anci', 'vovo', 'aposentad', 'octogen', 'septuagen'], exact: ['avo'] }],
  ['woman', { stems: ['mulher', 'moca', 'senhora', 'dona', 'esposa', 'rainha', 'princesa', 'professora', 'comadre', 'mae'], exact: ['ela', 'mae'] }],
];

const WEATHER_WORDS: Array<[Weather, Lexicon]> = [
  ['storm', { stems: ['tempestad', 'trovo', 'trovao', 'relampag', 'temporal', 'raio', 'tormenta'] }],
  ['rain', { stems: ['chuv', 'chov', 'garoa', 'aguacei', 'molhad'] }],
  ['fog', { stems: ['neblina', 'nevoa', 'nevoeiro', 'cerracao', 'bruma'] }],
  ['wind', { stems: ['vento', 'ventania', 'redemoinh', 'brisa forte', 'vendaval'] }],
  ['cloudy', { stems: ['nublad', 'nuvens', 'cinzent', 'encobert'] }],
  ['clear', { stems: ['ensolarad', 'ceu limpo', 'ceu azul', 'sol forte', 'estiou'] }],
];

const TIME_WORDS: Array<[TimeOfDay, Lexicon]> = [
  ['night', { stems: ['noite', 'madrugad', 'escurid', 'anoitec', 'meianoite', 'luar'], exact: ['lua'] }],
  ['dawn', { stems: ['amanhec', 'aurora', 'alvorada', 'raiar', 'manhazinha', 'nascer do sol', 'galo cantou'] }],
  ['sunset', { stems: ['entardec', 'por do sol', 'crepuscul', 'tardinha', 'fim de tarde', 'poente'] }],
  ['day', { stems: ['manha', 'meiodia', 'meio dia', 'amanhecido', 'de dia', 'sol a pino'] }],
];

const INDOOR_PROPS: ReadonlySet<PropType> = new Set<PropType>([
  'bed', 'table', 'lantern', 'chair', 'sofa', 'tv', 'plant', 'stove', 'desk', 'blackboard', 'pew', 'altar',
]);
const OUTDOOR_ONLY: ReadonlySet<PropType> = new Set<PropType>([
  'rustic_house', 'building', 'church', 'barn', 'bandstand', 'road', 'bridge', 'pier', 'palm_tree', 'tree', 'dry_tree', 'cactus', 'cornfield', 'well', 'umbrella',
]);

type SlotName = 'bgL' | 'bgR' | 'farL' | 'farR' | 'midL' | 'midR' | 'fgL' | 'fgR';

// posições que cabem no quadro vertical com a câmera padrão
const OUTDOOR_SLOTS: Record<SlotName, Vec3> = {
  bgL: [-2.9, 0, -4.5],
  bgR: [3, 0, -5.5],
  farL: [-4.2, 0, -10],
  farR: [4.4, 0, -9],
  midL: [-2.4, 0, -1.6],
  midR: [2.5, 0, -2.2],
  fgL: [-2, 0, 2.2],
  fgR: [2.1, 0, 2.6],
};
const INDOOR_SLOTS: Record<SlotName, Vec3> = {
  bgL: [-2.5, 0, -3.4],
  bgR: [2.5, 0, -3.6],
  farL: [-1.2, 0, -4.2],
  farR: [1.3, 0, -4.3],
  midL: [-2.3, 0, -1.2],
  midR: [2.3, 0, -1.5],
  fgL: [-1.9, 0, 2],
  fgR: [2, 0, 2.3],
};

const SLOT_PREFERENCE: Record<'big' | 'medium' | 'small', SlotName[]> = {
  big: ['bgL', 'bgR', 'farL', 'farR', 'midL', 'midR'],
  medium: ['midL', 'midR', 'bgR', 'bgL', 'farR', 'farL', 'fgL', 'fgR'],
  small: ['fgL', 'fgR', 'midR', 'midL', 'bgL', 'bgR'],
};
const BIG: ReadonlySet<PropType> = new Set<PropType>(['rustic_house', 'building', 'church', 'barn', 'bandstand', 'tree', 'dry_tree', 'palm_tree', 'cornfield', 'blackboard', 'altar', 'bus', 'truck']);
const SMALL: ReadonlySet<PropType> = new Set<PropType>(['lantern', 'flowers', 'plant', 'chicken', 'dog', 'barrel', 'bird']);
const propSize = (t: PropType): 'big' | 'medium' | 'small' => (BIG.has(t) ? 'big' : SMALL.has(t) ? 'small' : 'medium');

const LOOKS: Record<CharacterKind, Pick<CharacterDef, 'skinColor' | 'shirtColor' | 'pantsColor' | 'accessory'>> = {
  man: { skinColor: '#8d5524', shirtColor: '#f4f1ea', pantsColor: '#3d352e', accessory: 'straw_hat' },
  woman: { skinColor: '#a9683a', shirtColor: '#c9483b', pantsColor: '#d9843b', accessory: 'none' },
  child: { skinColor: '#9a6034', shirtColor: '#e8b83a', pantsColor: '#3a6ab8', accessory: 'cap' },
  elderly: { skinColor: '#b07a4a', shirtColor: '#7a8a6a', pantsColor: '#4a4038', accessory: 'glasses' },
};
const COMPANION_LOOK = { skinColor: '#a9683a', shirtColor: '#c9483b', pantsColor: '#4a5a78', accessory: 'none' as Accessory };

const CAMERA_CYCLE = ['pan_right', 'zoom_out', 'orbit', 'pan_left', 'zoom_in', 'static', 'crane_up', 'handheld'] as const;

function matcher(text: string): (lex: Lexicon) => number {
  const tokens = text.split(/\s+/).map(wordKey).filter(Boolean);
  const joined = ` ${tokens.join(' ')} `;
  return (lex) => {
    let hits = 0;
    for (const tok of tokens) {
      if (lex.exact?.includes(tok) || lex.stems?.some((s) => !s.includes(' ') && tok.startsWith(s))) hits++;
    }
    // expressões de mais de uma palavra ("por do sol")
    for (const s of lex.stems ?? []) if (s.includes(' ') && joined.includes(` ${s}`)) hits++;
    return hits;
  };
}

function firstMatch<T>(count: (lex: Lexicon) => number, table: Array<[T, Lexicon]>): T | null {
  for (const [value, lex] of table) if (count(lex)) return value;
  return null;
}

function pickPreset(count: (lex: Lexicon) => number, current: Preset | null): Preset | null {
  let best = current;
  let bestHits = 0;
  for (const preset of PRESETS) {
    const hits = count(SCENARIOS[preset].words);
    if (hits > bestHits) {
      bestHits = hits;
      best = preset;
    }
  }
  return best;
}

/** Quem é o protagonista: a primeira pista do roteiro (menino, idosa, "80 anos"…). */
function protagonistKind(script: string): CharacterKind {
  const lower = normalizeText(script).replace(/[^a-z0-9]+/g, ' ');
  const age = /(\d{2,3})\s*anos/.exec(script)?.[1];
  if (age && Number(age) >= 60) return 'elderly';
  if (/\b(sessenta|setenta|oitenta|noventa)\s+anos/.test(lower)) return 'elderly';
  let best: { kind: CharacterKind; at: number } | null = null;
  for (const [kind, lex] of KIND_WORDS) {
    for (const stem of [...(lex.stems ?? []), ...(lex.exact ?? [])]) {
      const at = lower.search(new RegExp(`(^|\\s)${stem}`));
      if (at >= 0 && (!best || at < best.at)) best = { kind, at };
    }
  }
  return best?.kind ?? 'man';
}

/** "Bahia, 1930" a partir de "…em Bahia…" e de um ano citado no trecho. */
function findLocationTitle(text: string): string | undefined {
  const cap = "[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\\wÀ-ÿ'-]+";
  const place = new RegExp(
    `(?:^|[^\\wÀ-ÿ])(?:[Ee]m|[Nn]o|[Nn]a|[Nn]os|[Nn]as)\\s+(${cap}(?:\\s+(?:(?:de|do|da|dos|das)\\s+)?${cap}){0,3})`,
  ).exec(text)?.[1];
  const era =
    /\banos\s+(\d{2,4})\b/i.exec(text)?.[0] ?? /\b(1[5-9]\d{2}|20\d{2})\b/.exec(text)?.[0];
  const parts = [place, era].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function buildCamera(index: number, animation: AnimationName, hasCompany: boolean, from: Vec3, cycle: number, opts: { indoor: boolean; storm: boolean; moving: boolean }): CameraDef {
  if (opts.moving) {
    return {
      movement: 'follow_character',
      startPos: [from[0] + 0.8, 2.6, from[2] + 9],
      endPos: [from[0] + 0.8, 2.6, from[2] + 9],
      lookAt: [from[0], 1.2, from[2]],
      target: 'protagonist',
    };
  }
  if (animation === 'sleep') return { movement: 'zoom_in', startPos: [0.6, 3.6, 8.5], endPos: [0.3, 3, 6.5], lookAt: [0, 0.7, -0.4] };
  if (animation === 'pray') return { movement: 'crane_down', startPos: [0, 4.5, 9], endPos: [0, 2.2, 7], lookAt: [0, 0.9, 0] };
  if (opts.storm) return { movement: 'handheld', startPos: [0.4, 2.6, 9.5], endPos: [0, 2.4, 8.5], lookAt: [0, 1.2, 0] };
  if (index === 0) {
    return opts.indoor
      ? { movement: 'zoom_in', startPos: [0, 3.4, 11.5], endPos: [0, 2.6, 8.2], lookAt: [0, 1.2, 0] }
      : { movement: 'crane_up', startPos: [0, 1.6, 9.5], endPos: [0, 4.2, 11], lookAt: [0, 1.2, 0] };
  }
  if ((animation === 'dance' || animation === 'celebrate') && cycle % 2 === 0) {
    return { movement: 'orbit', startPos: [-2.6, 2.6, 8.5], endPos: [2.6, 2.6, 8.5], lookAt: [0, 1.2, 0] };
  }
  if (animation === 'talk' && hasCompany && cycle % 2 === 0) {
    return { movement: 'orbit', startPos: [-2.2, 2.4, 8], endPos: [2.2, 2.4, 8], lookAt: [0, 1.3, 0] };
  }
  switch (CAMERA_CYCLE[cycle % CAMERA_CYCLE.length]) {
    case 'pan_right':
      return { movement: 'pan_right', startPos: [-1.4, 2.6, 9.5], endPos: [1.4, 2.6, 9.5], lookAt: [0, 1.2, 0] };
    case 'pan_left':
      return { movement: 'pan_left', startPos: [1.4, 2.6, 9.5], endPos: [-1.4, 2.6, 9.5], lookAt: [0, 1.2, 0] };
    case 'zoom_out':
      return { movement: 'zoom_out', startPos: [0, 2.4, 7.5], endPos: [0, 3.4, 11], lookAt: [0, 1.2, 0] };
    case 'orbit':
      return { movement: 'orbit', startPos: [-2.6, 2.8, 9], endPos: [2.6, 2.8, 9], lookAt: [0, 1.2, 0] };
    case 'zoom_in':
      return { movement: 'zoom_in', startPos: [0, 3.2, 10.5], endPos: [0, 2.4, 7.5], lookAt: [0, 1.3, 0] };
    case 'crane_up':
      return { movement: 'crane_up', startPos: [0, 1.8, 9], endPos: [0, 4, 10.5], lookAt: [0, 1.2, 0] };
    case 'handheld':
      return { movement: 'handheld', startPos: [0.6, 2.5, 8.5], endPos: [0.2, 2.5, 8], lookAt: [0, 1.25, 0] };
    default:
      return { movement: 'static', startPos: [0.8, 2.8, 9.5], endPos: [0.8, 2.8, 9.5], lookAt: [0, 1.2, 0] };
  }
}

const SEAT_POSE: Partial<Record<PropType, AnimationName>> = {
  car: 'drive', truck: 'drive', bus: 'drive', bicycle: 'ride', motorcycle: 'ride', horse: 'ride', boat: 'sit', cart: 'sit',
};

export function generateScenesByRules(slots: SceneSlot[], script: string): SceneDef[] {
  const scriptCount = matcher(script);
  let preset: Preset = pickPreset(scriptCount, null) ?? 'sertao_day';
  const heroKind = protagonistKind(script);
  const heroLook = { ...LOOKS[heroKind] };
  if (heroKind === 'man' && scriptCount({ stems: ['cangaceir', 'lampiao', 'bando'] })) heroLook.accessory = 'leather_hat';
  else if (heroKind === 'man' && !scriptCount({ stems: ['vaqueir', 'serta', 'roca', 'fazend', 'caatinga', 'boiad'] })) heroLook.accessory = 'none';
  let weather: Weather | null = null;
  let time: TimeOfDay | null = null;
  let lastTitle: string | undefined;
  let lastText = '';
  let cameraCycle = 0;

  return slots.map((slot, index) => {
    // cena sem fala (silêncio) herda o clima da anterior
    const text = slot.text.trim() || lastText;
    lastText = text;
    const count = matcher(text);
    const rng = makeRng(hashString(`${slot.id}|${text}`));

    const previousPreset = preset;
    preset = pickPreset(count, preset) ?? preset;
    const scenario = SCENARIOS[preset];
    const pal = PRESET_PALETTES[preset];
    const indoor = scenario.indoor;
    // clima e hora continuam valendo até o roteiro mudar de lugar ou citar outros
    if (preset !== previousPreset) { weather = null; time = null; }
    weather = firstMatch(count, WEATHER_WORDS) ?? weather;
    time = firstMatch(count, TIME_WORDS) ?? time;

    // ----- ação e personagens -----
    // sem ação citada, o personagem fica parado: acenar só quando o roteiro pede
    const doing = firstMatch(count, ACTIONS);
    const reaction = firstMatch(count, REACTIONS);
    // alguém faz e outro reage ("ele corria e os vizinhos não acreditaram"): a reação é de quem assiste
    const watcherReacts = doing !== null && reaction !== null && doing !== 'talk' && count(COMPANY) > 0;
    let animation: AnimationName = doing && (watcherReacts || !reaction || doing !== 'talk') ? doing : reaction ?? doing ?? 'idle';
    const vehicle = indoor ? null : firstMatch(count, VEHICLE_WORDS);
    const travels = vehicle !== null && (animation === 'drive' || animation === 'ride' || animation === 'walk' || animation === 'run' || count({ stems: ['viaj', 'partiu', 'seguiu', 'chegou', 'foi de', 'naveg'] }) > 0);
    if (vehicle && travels) animation = SEAT_POSE[vehicle] ?? animation;

    const hasCompany = animation !== 'sleep' && (count(COMPANY) > 0 || animation === 'talk' || animation === 'dance' || animation === 'hug');
    const dir = index % 2 === 0 ? 1 : -1;
    const walking = (animation === 'walk' || animation === 'run' || animation === 'carry') && !vehicle;
    const from: Vec3 = walking ? [-1.7 * dir, 0, -0.8] : [hasCompany ? -0.85 : 0, 0, 0];
    const to: Vec3 = [1.5 * dir, 0, 1.4];

    const props: PropDef[] = [];
    const protagonist: CharacterDef = {
      id: 'protagonist',
      ...heroLook,
      kind: heroKind,
      position: animation === 'sleep' ? [0, 0, -0.4] : from,
      animation,
    };
    if (walking) protagonist.targetPosition = to;

    let vehicleStart: Vec3 | null = null;
    if (vehicle) {
      const id = `${vehicle}_1`;
      const big = vehicle === 'bus' || vehicle === 'truck';
      if (travels) {
        // atravessa o quadro levando o protagonista
        vehicleStart = [-3.2 * dir, 0, big ? -3 : -1.2];
        props.push({ id, type: vehicle, position: vehicleStart, targetPosition: [3.2 * dir, 0, big ? -1.5 : 0.8], rotationY: 0, scale: 1 });
        protagonist.mount = id;
      } else {
        props.push({ id, type: vehicle, position: [2.6 * -dir, 0, big ? -6 : -3.2], rotationY: big ? 0.5 * dir : 0.8 * dir, scale: 1 });
      }
    }

    const characters: CharacterDef[] = [protagonist];
    if (hasCompany) {
      const kind = firstMatch(count, KIND_WORDS.filter(([k]) => k !== heroKind)) ?? (heroKind === 'woman' ? 'man' : 'woman');
      const SHARED: AnimationName[] = ['dance', 'celebrate', 'clap', 'pray', 'sit', 'hug', 'eat', 'laugh', 'cry', 'work'];
      // quem acompanha: reage, faz junto, anda junto ou escuta (nunca "fala" por padrão)
      const companionAnimation: AnimationName =
        watcherReacts ? reaction!
          : animation === 'walk' || animation === 'run' ? animation
            : animation === 'carry' ? 'walk'
              : SHARED.includes(animation) ? animation
                : 'listen';
      const follows = walking && !watcherReacts;
      const companion: CharacterDef = {
        id: 'companion',
        ...COMPANION_LOOK,
        ...(kind === 'child' ? { accessory: 'cap' as Accessory } : kind === 'elderly' ? { accessory: 'headscarf' as Accessory } : {}),
        kind,
        position: follows ? [from[0] - 1.1 * dir, 0, from[2] - 0.6] : walking ? [1.9 * -dir, 0, 1.2] : [0.85, 0, 0.15],
        animation: companionAnimation,
      };
      if (follows) companion.targetPosition = [to[0] - 1.1 * dir, 0, to[2] - 0.6];
      characters.push(companion);
    }

    // ----- objetos e animais -----
    const wanted: PropType[] = [];
    for (const [type, lex] of [...PROP_WORDS, ...ANIMAL_WORDS]) {
      if (!count(lex)) continue;
      if (indoor ? !INDOOR_PROPS.has(type) && !SMALL.has(type) : INDOOR_PROPS.has(type) && type !== 'table' && type !== 'chair' && type !== 'lantern') continue;
      if (OUTDOOR_ONLY.has(type) && indoor) continue;
      wanted.push(type);
    }
    if (animation === 'sleep' && indoor && !wanted.includes('bed')) wanted.push('bed');
    if (animation === 'sit' && !wanted.some((t) => ['chair', 'bench', 'sofa', 'pew', 'desk'].includes(t))) {
      wanted.unshift(indoor ? (preset === 'church' ? 'pew' : preset === 'classroom' ? 'desk' : 'chair') : 'bench');
    }
    if (walking && !indoor && !wanted.includes('road') && preset !== 'open_sea' && preset !== 'beach') wanted.push('road');
    const target = indoor ? 3 : 5;
    for (const type of scenario.dressing) {
      if (wanted.length >= target) break;
      const repeatable = ['tree', 'cactus', 'rustic_house', 'building', 'market_stall', 'flowers', 'palm_tree', 'rock', 'bunting', 'desk', 'pew', 'dry_tree', 'lamp_post'].includes(type);
      if (repeatable || !wanted.includes(type)) wanted.push(type);
    }

    const slotsMap = indoor ? INDOOR_SLOTS : OUTDOOR_SLOTS;
    const used = new Set<SlotName>();
    const flip = rng() < 0.5;
    for (const type of wanted) {
      if (type === 'road') {
        props.push({ type, position: [0, 0, -4], rotationY: 0, scale: 1 });
        continue;
      }
      if (type === 'bed' && animation === 'sleep') {
        // de lado para a câmera: deitado, o personagem aparece de perfil
        props.push({ type, position: [0, 0, -0.4], rotationY: 1.05, scale: 1, color: pal.cloth });
        continue;
      }
      if (['chair', 'bench', 'sofa', 'pew', 'desk'].includes(type) && animation === 'sit' && !props.some((p) => p.id === 'seat_1')) {
        // o assento fica onde o protagonista está; banco de igreja e carteira olham para o fundo
        const facesBack = type === 'pew' || type === 'desk';
        props.push({ id: 'seat_1', type, position: [...protagonist.position] as Vec3, rotationY: facesBack ? Math.PI : 0, scale: 1 });
        protagonist.mount = 'seat_1';
        continue;
      }
      if (type === 'bonfire') {
        props.push({ type, position: [0.3, 0, -2.6], rotationY: 0, scale: 1 });
        continue;
      }
      if (type === 'bird') {
        props.push({ type, position: [-4 * dir, 0, -3], targetPosition: [4 * dir, 0, -2], rotationY: 0, scale: 1 });
        continue;
      }
      if (type === 'dog' && walking) {
        props.push({ type, position: [from[0] + 0.9 * dir, 0, from[2] + 0.5], targetPosition: [to[0] + 0.9 * dir, 0, to[2] + 0.5], rotationY: 0, scale: 1 });
        continue;
      }
      const order = SLOT_PREFERENCE[propSize(type)];
      // alterna o lado inicial para as cenas não ficarem espelhadas iguais
      const candidates = flip ? order.map((s) => (s.endsWith('L') ? s.replace('L', 'R') : s.replace('R', 'L')) as SlotName) : order;
      const free = candidates.find((s) => !used.has(s));
      if (!free) continue;
      used.add(free);
      const base = slotsMap[free];
      const facesCamera = ['rustic_house', 'building', 'church', 'barn', 'blackboard', 'altar', 'market_stall', 'tv', 'stove'].includes(type);
      props.push({
        type,
        position: [base[0] + (rng() - 0.5) * 0.5, 0, base[2] + (rng() - 0.5) * 0.6],
        rotationY: facesCamera ? (base[0] < 0 ? 0.35 : -0.35) : Math.round((rng() - 0.5) * 200) / 100,
        scale: Math.round((0.9 + rng() * 0.35) * 100) / 100,
      });
    }

    // ----- ambiente e câmera -----
    const sceneWeather = indoor ? undefined : weather ?? undefined;
    const sceneTime = time ?? undefined;
    const camera = buildCamera(index, animation, hasCompany, vehicleStart ?? from, cameraCycle, {
      indoor,
      storm: sceneWeather === 'storm',
      moving: walking || (vehicleStart !== null),
    });
    if (index > 0 && !walking && !vehicleStart && animation !== 'sleep') cameraCycle++;

    const scene: SceneDef = {
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      environment: {
        preset,
        skyColor: pal.sky,
        groundColor: pal.ground,
        fogColor: pal.fog,
        particles: pal.particles,
        ...(sceneWeather && sceneWeather !== scenario.weather ? { weather: sceneWeather } : {}),
        ...(sceneTime && sceneTime !== scenario.timeOfDay ? { timeOfDay: sceneTime } : {}),
      },
      camera,
      characters,
      props,
    };

    const title = findLocationTitle(slot.text);
    if (title && title !== lastTitle && (index === 0 || preset !== previousPreset)) {
      scene.locationTitle = title;
      lastTitle = title;
    }
    return scene;
  });
}

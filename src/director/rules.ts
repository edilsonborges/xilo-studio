// Módulo 2: gerador de cenas por regras (fallback sem chave de API).
//
// Lê palavras-chave do trecho narrado em cada cena e decide preset, props,
// animações e câmera. É determinístico: o mesmo roteiro gera as mesmas cenas.

import { PRESET_PALETTES } from '../presets';
import type {
  AnimationName,
  CameraDef,
  CharacterDef,
  ParticleKind,
  Preset,
  PropDef,
  PropType,
  SceneDef,
  SceneSlot,
  Vec3,
} from '../types';
import { hashString, makeRng, wordKey } from '../util';

interface Lexicon {
  stems?: string[];
  exact?: string[];
}

const PRESET_WORDS: Record<Preset, Lexicon> = {
  interior_night: {
    stems: ['noite', 'madrugad', 'escur', 'dorm', 'sonh', 'adormec', 'anoitec', 'quarto', 'deit'],
    exact: ['lua', 'cama', 'sono', 'vela'],
  },
  forest: {
    stems: ['florest', 'selva', 'bosque', 'arvore', 'riacho', 'cachoeir', 'folha'],
    exact: ['mata', 'rio', 'matas'],
  },
  village_sunset: {
    stems: ['vila', 'povoad', 'cidade', 'feira', 'praca', 'igreja', 'entardec', 'crepuscul', 'festa', 'mercad'],
    exact: ['tarde', 'tardinha'],
  },
  sertao_day: {
    stems: ['serta', 'caatinga', 'calor', 'poeira', 'estrada', 'fazenda', 'manha', 'cacto', 'mandacaru'],
    exact: ['sol', 'seca', 'dia', 'roca'],
  },
};

const PROP_WORDS: Array<[PropType, Lexicon]> = [
  ['rustic_house', { stems: ['casa', 'casebre', 'cabana', 'rancho', 'morad'], exact: ['lar'] }],
  ['bed', { stems: ['cama', 'dorm', 'deit', 'adormec'], exact: ['rede'] }],
  ['dry_tree', { stems: ['estiagem', 'galho', 'ressec'], exact: ['seca', 'secas', 'seco'] }],
  ['tree', { stems: ['arvore', 'florest', 'sombra', 'mangueira', 'juazeiro'], exact: ['mata'] }],
  ['cactus', { stems: ['cacto', 'mandacaru', 'espinho', 'caatinga', 'serta'] }],
  ['table', { stems: ['mesa', 'jantar', 'almoc', 'comida', 'cafe', 'cozinha', 'carta'] }],
  ['lantern', { stems: ['lampiao', 'lanterna', 'candeeiro', 'lamparina'], exact: ['luz', 'vela', 'fogo'] }],
  ['road', { stems: ['estrada', 'caminh', 'viagem', 'viaj', 'trilha', 'partiu', 'jornada'] }],
  ['fence', { stems: ['cerca', 'curral', 'fazenda', 'porteira', 'sitio', 'roca'] }],
  [
    'animal',
    { stems: ['cavalo', 'cachorr', 'jument', 'burr', 'cabra', 'vaca', 'animal', 'bicho'], exact: ['boi', 'bois', 'gado', 'bode', 'cao'] },
  ],
];

const SLEEP: Lexicon = { stems: ['dorm', 'sonh', 'adormec', 'cochil', 'deitou', 'deitad'] };
const WALK: Lexicon = {
  stems: ['andou', 'andava', 'andar', 'andando', 'caminhav', 'caminhou', 'caminhar', 'caminhand', 'partiu', 'partir', 'viaj', 'corre', 'seguiu', 'seguir', 'saiu', 'sair', 'chegou', 'chegar', 'voltou', 'voltar', 'atravess', 'fugi', 'march'],
};
const TALK: Lexicon = {
  stems: ['disse', 'falou', 'falava', 'contou', 'contava', 'pergunt', 'respond', 'gritou', 'chamou', 'convers', 'explic', 'avisou', 'pediu', 'prometeu'],
};
const GESTURE: Lexicon = {
  stems: ['acen', 'apont', 'mostr', 'ergue', 'levant', 'comemor', 'abrac', 'rezou', 'agradec'],
};
const COMPANY: Lexicon = {
  stems: ['amig', 'mulher', 'espos', 'marid', 'filh', 'irma', 'vizinh', 'companheir', 'famil', 'menin', 'velh', 'padre', 'coronel', 'patra'],
  exact: ['mae', 'pai', 'avo', 'povo'],
};
const RAIN: Lexicon = { stems: ['chuva', 'chov', 'tempestade', 'temporal', 'trovoad'] };

const INDOOR_PROPS: ReadonlySet<PropType> = new Set<PropType>(['bed', 'table', 'lantern']);

const DRESSING: Record<Preset, PropType[]> = {
  sertao_day: ['cactus', 'dry_tree', 'rustic_house', 'cactus'],
  interior_night: ['table', 'lantern', 'bed'],
  village_sunset: ['rustic_house', 'fence', 'rustic_house', 'tree'],
  forest: ['tree', 'tree', 'tree', 'tree', 'tree'],
};

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
const PROP_SIZE: Record<PropType, 'big' | 'medium' | 'small'> = {
  rustic_house: 'big',
  tree: 'big',
  dry_tree: 'big',
  bed: 'medium',
  cactus: 'medium',
  table: 'medium',
  fence: 'medium',
  animal: 'medium',
  lantern: 'small',
  road: 'medium',
};

const PROTAGONIST = {
  id: 'protagonist',
  skinColor: '#8d5524',
  shirtColor: '#f4f1ea',
  pantsColor: '#3d352e',
  accessory: 'straw_hat',
} as const;
const COMPANION = {
  id: 'companion',
  skinColor: '#a9683a',
  shirtColor: '#c9483b',
  pantsColor: '#4a5a78',
  accessory: 'none',
} as const;

const CAMERA_CYCLE = ['pan_right', 'zoom_out', 'orbit', 'pan_left', 'zoom_in', 'static'] as const;

function matcher(text: string): (lex: Lexicon) => number {
  const tokens = text.split(/\s+/).map(wordKey).filter(Boolean);
  return (lex) => {
    let hits = 0;
    for (const tok of tokens) {
      if (lex.exact?.includes(tok) || lex.stems?.some((s) => tok.startsWith(s))) hits++;
    }
    return hits;
  };
}

function pickPreset(count: (lex: Lexicon) => number, current: Preset | null): Preset | null {
  let best = current;
  let bestHits = 0;
  for (const preset of Object.keys(PRESET_WORDS) as Preset[]) {
    const hits = count(PRESET_WORDS[preset]);
    if (hits > bestHits) {
      bestHits = hits;
      best = preset;
    }
  }
  return best;
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

function buildCamera(
  index: number,
  animation: AnimationName,
  hasCompany: boolean,
  walkFrom: Vec3,
  cycle: number,
): CameraDef {
  if (animation === 'walk') {
    return {
      movement: 'follow_character',
      startPos: [walkFrom[0] + 0.6, 2.5, walkFrom[2] + 8.5],
      endPos: [walkFrom[0] + 0.6, 2.5, walkFrom[2] + 8.5],
      lookAt: [walkFrom[0], 1.2, walkFrom[2]],
      target: PROTAGONIST.id,
    };
  }
  if (animation === 'sleep') {
    return { movement: 'zoom_in', startPos: [0.6, 3.6, 8.5], endPos: [0.3, 3, 6.5], lookAt: [0, 0.7, -0.4] };
  }
  if (index === 0) {
    return { movement: 'zoom_in', startPos: [0, 3.4, 11.5], endPos: [0, 2.6, 8.2], lookAt: [0, 1.2, 0] };
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
    default:
      return { movement: 'static', startPos: [0.8, 2.8, 9.5], endPos: [0.8, 2.8, 9.5], lookAt: [0, 1.2, 0] };
  }
}

export function generateScenesByRules(slots: SceneSlot[], script: string): SceneDef[] {
  let preset: Preset = pickPreset(matcher(script), null) ?? 'sertao_day';
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
    const pal = PRESET_PALETTES[preset];
    const indoor = preset === 'interior_night';

    // ----- personagens -----
    let animation: AnimationName = 'idle';
    if (count(SLEEP)) animation = 'sleep';
    else if (count(WALK)) animation = 'walk';
    else if (count(TALK)) animation = 'talk';
    else if (count(GESTURE) || index % 3 === 2) animation = 'gesture';

    const hasCompany = animation !== 'sleep' && (count(COMPANY) > 0 || animation === 'talk');
    const dir = index % 2 === 0 ? 1 : -1;
    const walkFrom: Vec3 = [-1.7 * dir, 0, -0.8];
    const walkTo: Vec3 = [1.5 * dir, 0, 1.4];

    const protagonist: CharacterDef = {
      ...PROTAGONIST,
      position: animation === 'walk' ? walkFrom : animation === 'sleep' ? [0, 0, -0.4] : [hasCompany ? -0.85 : 0, 0, 0],
      animation,
    };
    if (animation === 'walk') protagonist.targetPosition = walkTo;
    const characters: CharacterDef[] = [protagonist];
    if (hasCompany) {
      const companion: CharacterDef = {
        ...COMPANION,
        position: animation === 'walk' ? [walkFrom[0] - 1.1 * dir, 0, walkFrom[2] - 0.6] : [0.85, 0, 0.15],
        animation: animation === 'walk' ? 'walk' : animation === 'talk' ? 'idle' : 'talk',
      };
      if (animation === 'walk') companion.targetPosition = [walkTo[0] - 1.1 * dir, 0, walkTo[2] - 0.6];
      characters.push(companion);
    }

    // ----- props -----
    const wanted: PropType[] = [];
    for (const [type, lex] of PROP_WORDS) {
      if (count(lex) && (!indoor || INDOOR_PROPS.has(type))) wanted.push(type);
    }
    if (animation === 'sleep' && indoor && !wanted.includes('bed')) wanted.push('bed');
    if (animation === 'walk' && !indoor && !wanted.includes('road')) wanted.push('road');
    const target = indoor ? 3 : 5;
    for (const type of DRESSING[preset]) {
      if (wanted.length >= target) break;
      const repeatable = type === 'tree' || type === 'cactus' || type === 'rustic_house';
      if (repeatable || !wanted.includes(type)) wanted.push(type);
    }

    const slotsMap = indoor ? INDOOR_SLOTS : OUTDOOR_SLOTS;
    const used = new Set<SlotName>();
    const flip = rng() < 0.5;
    const props: PropDef[] = [];
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
      const order = SLOT_PREFERENCE[PROP_SIZE[type]];
      // alterna o lado inicial para as cenas não ficarem espelhadas iguais
      const candidates = flip
        ? order.map((s) => (s.endsWith('L') ? s.replace('L', 'R') : s.replace('R', 'L')) as SlotName)
        : order;
      const free = candidates.find((s) => !used.has(s));
      if (!free) continue;
      used.add(free);
      const base = slotsMap[free];
      props.push({
        type,
        position: [base[0] + (rng() - 0.5) * 0.5, 0, base[2] + (rng() - 0.5) * 0.6],
        rotationY: type === 'rustic_house' ? (base[0] < 0 ? 0.45 : -0.45) : Math.round((rng() - 0.5) * 200) / 100,
        scale: Math.round((0.9 + rng() * 0.35) * 100) / 100,
      });
    }

    // ----- ambiente e câmera -----
    // dentro de casa não chove, mesmo que a narração fale em chuva
    const particles: ParticleKind = count(RAIN) && !indoor ? 'rain' : pal.particles;
    const camera = buildCamera(index, animation, hasCompany, walkFrom, cameraCycle);
    if (index > 0 && animation !== 'walk' && animation !== 'sleep') cameraCycle++;

    const scene: SceneDef = {
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      environment: {
        preset,
        skyColor: pal.sky,
        groundColor: pal.ground,
        fogColor: pal.fog,
        particles,
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

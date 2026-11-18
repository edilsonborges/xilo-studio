// Biblioteca de exemplos para a IA: histórias curtas de gêneros diferentes, cada
// uma com uma cena pronta que usa bem o kit (reações, veículos, clima, deixas de
// ação presas às palavras). O prompt leva só as mais próximas do roteiro.

import type { Preset } from '../types';

export interface DirectorExample {
  id: string;
  title: string;
  /** cenários em que o exemplo ajuda */
  presets: Preset[];
  narration: string;
  scene: Record<string, unknown>;
}

const cam = (movement: string, startPos: number[], endPos: number[], extra: Record<string, unknown> = {}) => ({
  movement, startPos, endPos, lookAt: [0, 1.2, 0], ...extra,
});

export const EXAMPLES: DirectorExample[] = [
  {
    id: 'sertao',
    title: 'Sertão e viagem',
    presets: ['sertao_day', 'caatinga_drought', 'country_road', 'village_sunset'],
    narration: 'Ao entardecer, ele chegou à vila e contou aos amigos sobre a longa viagem.',
    scene: {
      locationTitle: 'Vila, ao entardecer',
      environment: { preset: 'village_sunset', particles: 'fireflies' },
      camera: cam('zoom_in', [0, 3, 10.5], [0, 2.5, 8]),
      characters: [
        { id: 'vaqueiro', kind: 'man', accessory: 'leather_hat', position: [-1.9, 0, -1], targetPosition: [-0.5, 0, 0.6], animation: 'walk', actions: [{ at: 'contou', do: 'talk' }] },
        { id: 'amigo', kind: 'man', accessory: 'straw_hat', position: [0.9, 0, 0.5], animation: 'listen', actions: [{ at: 'longa', do: 'surprised' }] },
        { id: 'velho', kind: 'elderly', accessory: 'none', position: [1.7, 0, -0.4], animation: 'sit', mount: 'banco' },
      ],
      props: [
        { type: 'rustic_house', position: [-3, 0, -5], rotationY: 0.4, scale: 1.1 },
        { id: 'banco', type: 'bench', position: [1.7, 0, -0.4], rotationY: -0.3, scale: 1 },
        { type: 'fence', position: [3, 0, -3], rotationY: 0, scale: 1 },
        { type: 'goat', position: [-2.6, 0, 1.6], rotationY: 1, scale: 1 },
      ],
    },
  },
  {
    id: 'cidade',
    title: 'Cidade, trânsito e chuva',
    presets: ['city_street', 'city_night', 'town_square', 'street_market'],
    narration: 'Chovia forte quando Dona Lúcia desceu do ônibus e correu para a calçada.',
    scene: {
      locationTitle: 'Centro da cidade',
      environment: { preset: 'city_street', weather: 'rain', timeOfDay: 'sunset', particles: 'none' },
      camera: cam('handheld', [0.6, 2.6, 9], [0.2, 2.5, 8.2]),
      characters: [
        { id: 'lucia', kind: 'woman', accessory: 'headscarf', position: [1.6, 0, -2], targetPosition: [-1.6, 0, 1.2], animation: 'idle', actions: [{ at: 'desceu', do: 'walk' }, { at: 'correu', do: 'run' }] },
        { id: 'motorista', kind: 'man', accessory: 'cap', position: [2.5, 0, -3], animation: 'drive', mount: 'onibus' },
      ],
      props: [
        { id: 'onibus', type: 'bus', position: [2.6, 0, -3.5], rotationY: 0, scale: 1 },
        { type: 'building', position: [-3.6, 0, -6], rotationY: 0.3, scale: 1.1 },
        { type: 'lamp_post', position: [-2.6, 0, -0.5], rotationY: 0, scale: 1 },
        { type: 'car', position: [-0.5, 0, -12], targetPosition: [-0.5, 0, -4], rotationY: 0, scale: 1 },
      ],
    },
  },
  {
    id: 'infancia',
    title: 'Infância e brincadeira',
    presets: ['flower_field', 'farm', 'town_square', 'beach', 'forest'],
    narration: 'Jaiminho pulava de alegria enquanto a irmã pedalava em volta dele, rindo.',
    scene: {
      environment: { preset: 'flower_field', particles: 'petals' },
      camera: cam('orbit', [-2.6, 2.4, 8], [2.6, 2.4, 8]),
      characters: [
        { id: 'jaiminho', kind: 'child', accessory: 'cap', shirtColor: '#e8b83a', position: [0, 0, 0], animation: 'jump' },
        { id: 'irma', kind: 'child', accessory: 'none', shirtColor: '#d84a8a', position: [-2, 0, 1], animation: 'ride', mount: 'bici', actions: [{ at: 'rindo', do: 'laugh' }] },
      ],
      props: [
        { id: 'bici', type: 'bicycle', position: [-2.2, 0, 1.2], targetPosition: [2.2, 0, 1.6], rotationY: 0, scale: 0.8 },
        { type: 'tree', position: [3, 0, -4], rotationY: 0, scale: 1.2 },
        { type: 'flowers', position: [-1.6, 0, 2.6], rotationY: 0, scale: 1 },
        { type: 'dog', position: [1.4, 0, -1], targetPosition: [-0.6, 0, 1.8], rotationY: 0, scale: 1 },
      ],
    },
  },
  {
    id: 'festa',
    title: 'Festa junina',
    presets: ['festa_junina', 'carnival', 'starry_night'],
    narration: 'No São João, o casal dançava forró perto da fogueira e o povo batia palmas.',
    scene: {
      locationTitle: 'Noite de São João',
      environment: { preset: 'festa_junina', particles: 'embers' },
      camera: cam('crane_up', [0, 1.8, 9], [0, 4, 10.5]),
      characters: [
        { id: 'noivo', kind: 'man', accessory: 'straw_hat', position: [-0.5, 0, 0.6], animation: 'dance' },
        { id: 'noiva', kind: 'woman', accessory: 'none', shirtColor: '#d84a3a', position: [0.5, 0, 0.6], animation: 'dance' },
        { id: 'vizinha', kind: 'elderly', accessory: 'headscarf', position: [1.9, 0, -0.6], animation: 'listen', actions: [{ at: 'batia', do: 'clap' }] },
        { id: 'menino', kind: 'child', accessory: 'cap', position: [-1.9, 0, -0.4], animation: 'listen', actions: [{ at: 'palmas', do: 'celebrate' }] },
      ],
      props: [
        { type: 'bonfire', position: [0.2, 0, -2.6], rotationY: 0, scale: 1 },
        { type: 'bunting', position: [0, 0, -4], rotationY: 0, scale: 1.2 },
        { type: 'market_stall', position: [-3.2, 0, -4.5], rotationY: 0.4, scale: 1 },
      ],
    },
  },
  {
    id: 'mar',
    title: 'Mar, pescaria e tempestade',
    presets: ['open_sea', 'harbor', 'beach', 'river'],
    narration: 'O pescador remava em alto-mar quando o céu escureceu e o trovão o assustou.',
    scene: {
      environment: { preset: 'open_sea', weather: 'storm', particles: 'none' },
      camera: cam('handheld', [3.5, 2.8, 8], [2.5, 2.6, 7]),
      characters: [
        { id: 'pescador', kind: 'man', accessory: 'straw_hat', position: [0, 0, 0], animation: 'sit', mount: 'barco', actions: [{ at: 'trovão', do: 'surprised' }] },
      ],
      props: [
        { id: 'barco', type: 'boat', position: [-1.5, 0, -1], targetPosition: [1, 0, 0.5], rotationY: 0, scale: 1 },
        { type: 'bird', position: [-4, 0, -4], targetPosition: [4, 0, -3], rotationY: 0, scale: 1 },
      ],
    },
  },
  {
    id: 'familia',
    title: 'Família em casa',
    presets: ['kitchen', 'living_room', 'interior_night', 'classroom'],
    narration: 'Na cozinha, a avó contou a novidade; o neto riu e o pai ficou pensando.',
    scene: {
      environment: { preset: 'kitchen', particles: 'none' },
      camera: cam('pan_right', [-1.2, 2.5, 8.5], [1.2, 2.5, 8.5]),
      characters: [
        { id: 'avo', kind: 'elderly', accessory: 'headscarf', position: [-1.4, 0, 0.2], animation: 'talk' },
        { id: 'neto', kind: 'child', accessory: 'none', position: [0.2, 0, 0.8], animation: 'eat', mount: 'cadeira', actions: [{ at: 'riu', do: 'laugh' }] },
        { id: 'pai', kind: 'man', accessory: 'glasses', position: [1.6, 0, 0], animation: 'listen', actions: [{ at: 'pensando', do: 'think' }] },
      ],
      props: [
        { type: 'stove', position: [-2.4, 0, -3.6], rotationY: 0.2, scale: 1 },
        { type: 'table', position: [0.2, 0, 1.7], rotationY: 0, scale: 1 },
        { id: 'cadeira', type: 'chair', position: [0.2, 0, 0.8], rotationY: 0, scale: 1 },
        { type: 'plant', position: [2.6, 0, -3.2], rotationY: 0, scale: 1 },
      ],
    },
  },
  {
    id: 'fe',
    title: 'Fé e promessa',
    presets: ['church', 'mountain', 'caatinga_drought'],
    narration: 'Maria entrou na igreja, ajoelhou e rezou; ao sair, chorou de gratidão.',
    scene: {
      environment: { preset: 'church', particles: 'dust' },
      camera: cam('crane_down', [0, 4.5, 9], [0, 2.2, 7]),
      characters: [
        { id: 'maria', kind: 'woman', accessory: 'headscarf', position: [-1.6, 0, 2], targetPosition: [0, 0, 0], animation: 'walk', actions: [{ at: 'ajoelhou', do: 'pray' }, { at: 'chorou', do: 'cry' }] },
        { id: 'padre', kind: 'elderly', accessory: 'glasses', shirtColor: '#2a2a2e', pantsColor: '#2a2a2e', position: [1.4, 0, -2.6], animation: 'listen' },
      ],
      props: [
        { type: 'altar', position: [0, 0, -4], rotationY: 0, scale: 1 },
        { type: 'pew', position: [-2.2, 0, -1], rotationY: 3.14, scale: 1 },
        { type: 'pew', position: [2.2, 0, -1], rotationY: 3.14, scale: 1 },
      ],
    },
  },
  {
    id: 'humor',
    title: 'Causo de humor',
    presets: ['farm', 'street_market', 'village_sunset', 'town_square'],
    narration: 'Zé carregava o saco de milho, tropeçou na galinha e caiu; a feira inteira gargalhou.',
    scene: {
      environment: { preset: 'street_market', particles: 'none' },
      camera: cam('static', [0.6, 2.7, 9.5], [0.6, 2.7, 9.5]),
      characters: [
        { id: 'ze', kind: 'man', accessory: 'straw_hat', position: [-2, 0, 0.4], targetPosition: [0.2, 0, 0.8], animation: 'carry', actions: [{ at: 'caiu', do: 'fall' }] },
        { id: 'feirante', kind: 'woman', accessory: 'none', position: [1.8, 0, -0.8], animation: 'listen', actions: [{ at: 'tropeçou', do: 'surprised' }, { at: 'gargalhou', do: 'laugh' }] },
        { id: 'freguesa', kind: 'elderly', accessory: 'glasses', position: [-1.8, 0, -1.6], animation: 'listen', actions: [{ at: 'gargalhou', do: 'laugh' }] },
      ],
      props: [
        { type: 'market_stall', position: [2.8, 0, -3.4], rotationY: -0.3, scale: 1 },
        { type: 'market_stall', position: [-3, 0, -4.2], rotationY: 0.3, scale: 1 },
        { type: 'chicken', position: [0.6, 0, 1.2], rotationY: 1, scale: 1 },
        { type: 'barrel', position: [-0.8, 0, -2.8], rotationY: 0, scale: 1 },
      ],
    },
  },
];

/** Os exemplos mais próximos dos cenários previstos para o roteiro. */
export function selectExamples(presets: readonly Preset[], count = 2): DirectorExample[] {
  const wanted = new Set(presets);
  const scored = EXAMPLES.map((example, order) => ({
    example,
    order,
    // vale mais quando o cenário do roteiro é o primeiro do exemplo
    score: example.presets.reduce((sum, preset, i) => sum + (wanted.has(preset) ? (i === 0 ? 3 : 1) : 0), 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const chosen = scored.filter((s) => s.score > 0).slice(0, count).map((s) => s.example);
  // sempre dois exemplos, de gêneros diferentes, para não puxar tudo para um lado só
  for (const { example } of scored) {
    if (chosen.length >= count) break;
    if (!chosen.includes(example)) chosen.push(example);
  }
  return chosen;
}

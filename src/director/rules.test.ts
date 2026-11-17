import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENARIOS, SCENARIO_CATEGORIES, type Scenario } from '../scenarios.js';
import { PRESETS, PROP_TYPES, type SceneSlot } from '../types.js';
import { generateScenesByRules } from './rules.js';
import { sanitizeSceneGraph } from './validate.js';

const one = (text: string): SceneSlot[] => [{ id: 'scene_1', startTime: 0, endTime: 6, text }];
const scene = (text: string) => generateScenesByRules(one(text), text)[0];

test('catálogo: 25 cenários em 6 categorias, com objetos e palavras válidos', () => {
  assert.equal(PRESETS.length, 25);
  for (const category of SCENARIO_CATEGORIES) {
    assert.ok(PRESETS.some((id) => SCENARIOS[id].category === category), category);
  }
  for (const id of PRESETS) {
    const s: Scenario = SCENARIOS[id];
    for (const type of s.dressing) assert.ok((PROP_TYPES as readonly string[]).includes(type), `${id}: ${type}`);
    assert.ok((PROP_TYPES as readonly string[]).includes(s.palette.fallbackProp), id);
    assert.ok((s.words.stems?.length ?? 0) + (s.words.exact?.length ?? 0) > 0, id);
  }
});

test('o idoso correndo pela praça vira um idoso, correndo, na praça', () => {
  const s = scene('Seu Antônio, com oitenta anos, calçou o tênis e disparou pela praça.');
  const hero = s.characters[0];
  assert.equal(hero.kind, 'elderly');
  assert.equal(hero.animation, 'run');
  assert.ok(hero.targetPosition, 'ele atravessa a cena');
  assert.equal(s.environment.preset, 'town_square');
  assert.equal(s.camera.movement, 'follow_character');
});

test('menino de bicicleta na rua com chuva: criança montada numa bicicleta que anda', () => {
  const s = scene('O menino pedalava a bicicleta pela rua da cidade debaixo de chuva.');
  const hero = s.characters[0];
  assert.equal(hero.kind, 'child');
  assert.equal(hero.animation, 'ride');
  const bike = s.props.find((p) => p.type === 'bicycle');
  assert.ok(bike?.targetPosition, 'a bicicleta anda');
  assert.equal(hero.mount, bike?.id);
  assert.equal(s.environment.preset, 'city_street');
  assert.equal(s.environment.weather, 'rain');
});

test('festa junina à noite com forró e fogueira', () => {
  const s = scene('Na festa junina, todos dançaram forró em volta da fogueira.');
  assert.equal(s.environment.preset, 'festa_junina');
  assert.equal(s.characters[0].animation, 'dance');
  assert.ok(s.characters.length >= 2);
  assert.ok(s.props.some((p) => p.type === 'bonfire'));
});

test('tempestade no mar: barco, clima e câmera na mão', () => {
  const s = scene('O pescador navegava o barco em alto mar quando veio a tempestade com trovões.');
  assert.equal(s.environment.preset, 'open_sea');
  assert.equal(s.environment.weather, 'storm');
  assert.ok(s.props.some((p) => p.type === 'boat'));
});

test('mulher reza ajoelhada na igreja', () => {
  const s = scene('A senhora entrou na igreja e rezou em silêncio.');
  assert.equal(s.environment.preset, 'church');
  assert.equal(s.characters[0].kind, 'woman');
  assert.equal(s.characters[0].animation, 'pray');
  assert.equal(s.camera.movement, 'crane_down');
});

test('clima e hora continuam nas cenas seguintes do mesmo lugar', () => {
  const slots: SceneSlot[] = [
    { id: 'scene_1', startTime: 0, endTime: 5, text: 'Na fazenda, a noite caiu com muita chuva.' },
    { id: 'scene_2', startTime: 5, endTime: 10, text: 'O vaqueiro olhou o curral.' },
  ];
  const [a, b] = generateScenesByRules(slots, slots.map((s) => s.text).join(' '));
  assert.equal(a.environment.preset, 'farm');
  assert.equal(b.environment.preset, 'farm');
  assert.equal(b.environment.weather, 'rain');
  assert.equal(b.environment.timeOfDay, 'night');
});

test('validador: apelidos da IA, campos novos e montaria só em objeto existente', () => {
  const graph = sanitizeSceneGraph({
    scenes: [{
      id: 'scene_1',
      environment: { preset: 'praia', weather: 'thunderstorm', timeOfDay: 'sunrise' },
      characters: [
        { id: 'vovo', kind: 'old man', animation: 'running', accessory: 'oculos' },
        { id: 'motorista', animation: 'driving', mount: 'carro_1' },
        { id: 'fantasma', animation: 'ride', mount: 'nao_existe' },
      ],
      props: [{ id: 'carro_1', type: 'automobile', position: [0, 0, -4], targetPosition: [0, 0, 4] }],
    }],
  });
  const s = graph.scenes[0];
  assert.equal(s.environment.preset, 'beach');
  assert.equal(s.environment.weather, 'storm');
  assert.equal(s.environment.timeOfDay, 'dawn');
  assert.equal(s.characters[0].kind, 'elderly');
  assert.equal(s.characters[0].animation, 'run');
  assert.equal(s.characters[0].accessory, 'glasses');
  assert.equal(s.characters[1].mount, 'carro_1');
  assert.equal(s.characters[2].mount, undefined);
  assert.equal(s.props[0].type, 'car');
  assert.deepEqual(s.props[0].targetPosition, [0, 0, 4]);
});

test('JSON antigo (v0.2.0) continua válido', () => {
  const graph = sanitizeSceneGraph({
    scenes: [{ id: 'scene_1', environment: { preset: 'sertao_day', particles: 'dust' }, characters: [{ id: 'p', animation: 'walk' }], props: [{ type: 'cactus' }] }],
  });
  const s = graph.scenes[0];
  assert.equal(s.environment.preset, 'sertao_day');
  assert.equal(s.environment.weather, undefined);
  assert.equal(s.characters[0].kind, 'man');
  assert.equal(s.props[0].type, 'cactus');
});

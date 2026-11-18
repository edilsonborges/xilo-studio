import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENARIOS, SCENARIO_CATEGORIES, type Scenario } from '../scenarios.js';
import { PRESETS, PROP_TYPES, type SceneSlot } from '../types.js';
import { EXAMPLES, selectExamples } from './examples.js';
import { generateScenesByRules } from './rules.js';
import { variantHints } from './variants.js';
import { sanitizeSceneGraph, sanitizeStorySheet } from './validate.js';

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

test('quem assiste reage em vez de acenar: os vizinhos se espantam com o idoso correndo', () => {
  const s = scene('Os vizinhos não acreditaram: o velhinho corria mais rápido que o vento!');
  assert.equal(s.characters[0].animation, 'run');
  assert.equal(s.characters[1].animation, 'surprised');
  assert.equal(s.characters[1].targetPosition, undefined, 'quem assiste fica parado');
});

test('sem ação no roteiro ninguém acena: parado, e a companhia escuta', () => {
  const slots: SceneSlot[] = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `scene_${n}`, startTime: n * 5, endTime: n * 5 + 5, text: 'Era uma vez um lugar distante com a família.' }));
  const scenes = generateScenesByRules(slots, slots[0].text);
  for (const sc of scenes) {
    assert.equal(sc.characters[0].animation, 'idle');
    assert.equal(sc.characters[1].animation, 'listen');
  }
  const talk = scene('O vaqueiro contou a história para o amigo.');
  assert.deepEqual(talk.characters.map((c) => c.animation), ['talk', 'listen']);
});

test('reações e ofícios do roteiro: chorar, rir, trabalhar, carregar, cair', () => {
  assert.equal(scene('A moça chorou a noite inteira.').characters[0].animation, 'cry');
  assert.equal(scene('O menino riu muito da piada.').characters[0].animation, 'laugh');
  assert.equal(scene('O lavrador capinava a roça com a enxada.').characters[0].animation, 'work');
  const carry = scene('Ela carregava o balde de água.').characters[0];
  assert.equal(carry.animation, 'carry');
  assert.ok(carry.targetPosition);
  assert.equal(scene('O cangaceiro tropeçou e caiu.').characters[0].animation, 'fall');
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
        { id: 'a', animation: 'shocked' }, { id: 'b', animation: 'laughing' }, { id: 'c', animation: 'thinking' },
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
  assert.ok(s.characters[0].targetPosition, 'correr sem destino ganha destino');
  assert.equal(s.characters[1].mount, 'carro_1');
  assert.equal(s.characters[2].mount, undefined);
  assert.deepEqual(s.characters.slice(3).map((c) => c.animation), ['surprised', 'laugh', 'think']);
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

/** Fatia com o tempo de cada palavra, como o splitScenes entrega. */
const timedSlot = (text: string, duration = 6): SceneSlot => {
  const list = text.split(/\s+/);
  return { id: 'scene_1', startTime: 10, endTime: 10 + duration, text, words: list.map((w, i) => ({ text: w, start: 10 + (i * duration) / list.length })) };
};

test('ações no tempo da narração: o vaqueiro chega andando e depois conta; os amigos escutam', () => {
  const slot = timedSlot('Ao entardecer, ele chegou à vila e contou aos amigos sobre a longa viagem.', 8);
  const [s] = generateScenesByRules([slot], slot.text);
  const [hero, friend] = s.characters;
  assert.equal(hero.animation, 'idle', 'antes de "chegou" ele espera parado');
  assert.deepEqual(hero.actions?.map((c) => c.do), ['walk', 'talk']);
  const chegou = slot.words!.find((w) => w.text === 'chegou')!.start - slot.startTime;
  assert.ok(Math.abs(hero.actions![0].at - chegou) < 0.02, 'a deixa cai no instante da palavra');
  assert.ok(hero.targetPosition);
  assert.equal(friend.animation, 'listen');
  assert.equal(friend.targetPosition, undefined);
  assert.notEqual(s.camera.movement, 'follow_character');
  // com a fala logo no começo, ele já entra andando
  const fast = timedSlot('Ele chegou à vila e contou aos amigos.', 6);
  const quick = generateScenesByRules([fast], fast.text)[0].characters[0];
  assert.equal(quick.animation, 'walk');
  assert.deepEqual(quick.actions?.map((c) => c.do), ['talk']);
});

test('"caminhava" é andar, não caminhão', () => {
  const s = scene('O vaqueiro caminhava pela estrada de terra do sertão.');
  assert.equal(s.characters[0].animation, 'walk');
  assert.ok(!s.props.some((p) => p.type === 'truck'));
  assert.ok(scene('O caminhão seguiu pela estrada.').props.some((p) => p.type === 'truck'));
});

test('quem assiste reage na hora da palavra', () => {
  const slot = timedSlot('O velhinho corria pela praça e os vizinhos não acreditaram no que viam.', 6);
  const [s] = generateScenesByRules([slot], slot.text);
  assert.equal(s.characters[0].animation, 'run');
  assert.equal(s.characters[1].animation, 'listen');
  assert.equal(s.characters[1].actions?.[0].do, 'surprised');
  assert.ok(s.characters[1].actions![0].at > 3);
});

test('validador: deixas por palavra ou por segundos, ordenadas, sem repetir, e destino para quem anda', () => {
  const slot = timedSlot('ele chegou cansado sentou e depois riu muito', 8);
  const graph = sanitizeSceneGraph({ scenes: [{ id: 'scene_1', characters: [
    { id: 'a', animation: 'idle', actions: [{ at: 'riu', do: 'laughing' }, { at: 'chegou', do: 'walk' }, { at: 'palavra_que_nao_existe', do: 'jump' }, { at: 99, do: 'clap' }] },
    { id: 'b', animation: 'listen', actions: [{ at: 0, do: 'talk' }, { at: 2.5, do: 'talk' }, { at: '3.5', do: 'nod' }] },
  ] }] }, [slot]);
  const [a, b] = graph.scenes[0].characters;
  assert.deepEqual(a.actions, [{ at: 1, do: 'walk' }, { at: 6, do: 'laugh' }, { at: 7.7, do: 'clap' }]);
  assert.ok(a.targetPosition, 'quem anda numa deixa ganha destino');
  assert.equal(b.animation, 'talk', 'deixa no instante zero vira a ação inicial');
  assert.deepEqual(b.actions, [{ at: 3.5, do: 'nod' }]);
});

test('variação: o mesmo roteiro gera versões diferentes, e a mesma variação se repete igual', () => {
  const text = 'O vaqueiro caminhava pela estrada de terra do sertão. O sol queimava a caatinga.';
  const slots: SceneSlot[] = [{ id: 'scene_1', startTime: 0, endTime: 5, text: text.split('. ')[0] }, { id: 'scene_2', startTime: 5, endTime: 10, text: text.split('. ')[1] }];
  const v0 = generateScenesByRules(slots, text);
  const v1 = generateScenesByRules(slots, text, 1);
  const v2 = generateScenesByRules(slots, text, 2);
  assert.deepEqual(generateScenesByRules(slots, text, 1), v1);
  assert.notDeepEqual(v0, v1);
  assert.notDeepEqual(v1, v2);
  // o roteiro continua mandando: lugar e ação não mudam
  for (const v of [v1, v2]) {
    assert.equal(v[0].environment.preset, v0[0].environment.preset);
    assert.equal(v[0].characters[0].animation, 'walk');
  }
  assert.ok(v1[0].props.some((p) => p.type === 'goat'), 'variação 2 traz um animal do lugar');
  assert.equal(v2[0].environment.weather, 'wind');
  const hints = variantHints(slots, 1);
  assert.notDeepEqual(variantHints(slots, 0), hints);
  assert.notEqual(hints[0].camera, hints[1].camera);
});

test('biblioteca: 8 exemplos válidos para o motor, escolhidos pelo cenário do roteiro', () => {
  assert.equal(EXAMPLES.length, 8);
  for (const example of EXAMPLES) {
    const list = example.narration.split(/\s+/);
    const slot: SceneSlot = { id: 'scene_1', startTime: 0, endTime: 8, text: example.narration, words: list.map((w, i) => ({ text: w, start: (i * 8) / list.length })) };
    const scene = sanitizeSceneGraph({ scenes: [{ id: 'scene_1', ...example.scene }] }, [slot]).scenes[0];
    const raw = example.scene as { environment: { preset: string }; characters: Array<{ animation: string; kind: string; mount?: string; actions?: unknown[] }>; props: Array<{ type: string }> };
    assert.equal(scene.environment.preset, raw.environment.preset, example.id);
    raw.characters.forEach((c, i) => {
      assert.equal(scene.characters[i].animation, c.animation, `${example.id} ação`);
      assert.equal(scene.characters[i].kind, c.kind, `${example.id} tipo`);
      assert.equal(scene.characters[i].mount, c.mount, `${example.id} assento`);
      assert.equal(scene.characters[i].actions?.length ?? 0, c.actions?.length ?? 0, `${example.id}: toda deixa usa uma palavra da narração`);
    });
    raw.props.forEach((p, i) => assert.equal(scene.props[i].type, p.type, `${example.id} objeto`));
  }
  assert.deepEqual(selectExamples(['open_sea']).map((e) => e.id), ['mar', 'sertao']);
  assert.equal(selectExamples(['kitchen', 'kitchen', 'church'])[0].id, 'familia');
  assert.equal(selectExamples([]).length, 2);
});

test('ficha da história: normaliza elenco e arco, e recusa resposta vazia', () => {
  const sheet = sanitizeStorySheet({
    setting: 'Bahia, anos 1930', tone: 'saudoso',
    cast: [{ id: 'O Vaqueiro', kind: 'homem', accessory: 'cangaceiro', shirtColor: 'f4f1ea', trait: 'cansado' }, { id: 'amiga', kind: 'old woman' }],
    arc: [{ place: 'estrada', timeOfDay: 'manha', weather: 'sunny' }, { place: 'vila', timeOfDay: 'entardecer' }, { place: 'quarto', timeOfDay: 'noite' }],
  });
  assert.deepEqual(sheet?.cast.map((c) => [c.id, c.kind, c.accessory]), [['o_vaqueiro', 'man', 'leather_hat'], ['amiga', 'elderly', 'none']]);
  assert.deepEqual(sheet?.arc.map((a) => [a.place, a.timeOfDay]), [['country_road', 'day'], ['village_sunset', 'sunset'], ['interior_night', 'night']]);
  assert.equal(sanitizeStorySheet({ nada: true }), null);
  assert.equal(sanitizeStorySheet('texto solto'), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIMATIONS } from '../types.js';
import { ONE_SHOT, UPPER_BODY, activeCue, oneShotWeight, travelProgress } from './character.js';

test('gesto de uma vez: começa em zero, chega ao máximo e volta a zero', () => {
  for (const animation of Object.keys(ONE_SHOT) as Array<keyof typeof ONE_SHOT>) {
    const duration = ONE_SHOT[animation]!;
    assert.equal(oneShotWeight(animation, 0), 0, animation);
    assert.equal(oneShotWeight(animation, 0.35 + duration / 2), 1, animation);
    assert.equal(oneShotWeight(animation, 0.35 + duration + 0.01), 0, animation);
    assert.equal(oneShotWeight(animation, 30), 0, `${animation} não repete`);
    const rising = oneShotWeight(animation, 0.5);
    assert.ok(rising > 0 && rising < 1, `${animation} tem transição suave`);
  }
});

test('ações contínuas valem a cena inteira', () => {
  for (const animation of ['idle', 'walk', 'run', 'talk', 'listen', 'cry', 'work', 'dance'] as const) {
    assert.equal(oneShotWeight(animation, 0), 1);
    assert.equal(oneShotWeight(animation, 20), 1);
  }
});

test('acenar é de uma vez; as listas só citam ações que existem', () => {
  assert.ok(ONE_SHOT.gesture);
  for (const name of [...Object.keys(ONE_SHOT), ...UPPER_BODY]) {
    assert.ok((ANIMATIONS as readonly string[]).includes(name), name);
  }
});

test('deixas: a ação em curso troca no instante marcado', () => {
  const cues = [{ at: 2, do: 'walk' as const }, { at: 4, do: 'talk' as const }];
  assert.equal(activeCue('idle', cues, 1.9).action, 'idle');
  assert.deepEqual(activeCue('idle', cues, 2.1), { action: 'walk', since: 2, previous: 'idle', previousSince: 0 });
  assert.deepEqual(activeCue('idle', cues, 5), { action: 'talk', since: 4, previous: 'walk', previousSince: 2 });
  assert.equal(activeCue('run', undefined, 3).action, 'run');
});

test('deslocamento só acontece enquanto a ação é de andar', () => {
  const cues = [{ at: 2, do: 'walk' as const }, { at: 4, do: 'talk' as const }];
  assert.deepEqual(travelProgress('idle', cues, 1, 6), { progress: 0, travelling: false });
  assert.deepEqual(travelProgress('idle', cues, 3, 6), { progress: 0.5, travelling: true });
  assert.deepEqual(travelProgress('idle', cues, 5, 6), { progress: 1, travelling: false });
  // sem deixas, o deslocamento ocupa a cena inteira, como antes
  assert.deepEqual(travelProgress('walk', undefined, 3, 6), { progress: 0.5, travelling: true });
  // deixas sem andar: mantém o deslocamento contínuo
  assert.equal(travelProgress('idle', [{ at: 1, do: 'talk' as const }], 3, 6).progress, 0.5);
});

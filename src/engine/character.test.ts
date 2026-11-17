import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIMATIONS } from '../types.js';
import { ONE_SHOT, UPPER_BODY, oneShotWeight } from './character.js';

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

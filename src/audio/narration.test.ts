import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeProgress } from './narration.js';

const format = (seconds: number): string => `${Math.round(seconds)}s`;

test('andamento da narração: antes do primeiro áudio vale a estimativa inicial', () => {
  const view = describeProgress({ done: 0, total: 20, elapsed: 30 }, 11, format);
  assert.equal(view.fraction, 0.02);
  // 20 s de áudio a 11 vezes = 220 s; já passaram 30
  assert.match(view.text, /Preparando a primeira frase… faltam cerca de 190s/);
});

test('andamento da narração: com áudio pronto, a velocidade real corrige o tempo restante', () => {
  // 5 s prontos em 100 s (20 vezes, mais lento que o previsto): faltam 15 s de áudio = 300 s
  const view = describeProgress({ done: 5, total: 20, elapsed: 100 }, 11, format);
  assert.equal(view.fraction, 0.25);
  assert.match(view.text, /5s de cerca de 20s de áudio prontos · faltam cerca de 300s/);
});

test('andamento da narração: nunca passa de 98% nem promete tempo negativo', () => {
  const view = describeProgress({ done: 30, total: 20, elapsed: 400 }, 11, format);
  assert.equal(view.fraction, 0.98);
  assert.match(view.text, /faltam cerca de 3s/);
  assert.match(describeProgress({ done: 0, total: 5, elapsed: 900 }, 11, format).text, /faltam cerca de 5s/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendTake, type NarrationTake } from './history.js';

const input = (id: string) => ({
  id, duration: 1, script: 'Teste.', voiceLabel: 'Natural', rate: 1,
  file: new File(['áudio'], 'voz.wav'), words: [],
});

test('histórico substitui por ordem de geração, independentemente da versão ouvida', () => {
  let takes: NarrationTake[] = [];
  for (const id of ['a', 'b', 'c']) takes = appendTake(takes, input(id), undefined).takes;
  const next = appendTake(takes, input('d'), 'a');
  assert.equal(next.added?.number, 4);
  assert.deepEqual(next.takes.map(t => t.id), ['b', 'c', 'd']);
  assert.deepEqual(appendTake(next.takes, input('e'), true).takes.map(t => t.id), ['c', 'd', 'e']);
});

test('sem autorização ou com confirmação desatualizada, preserva todas as versões', () => {
  const takes = ['b', 'c', 'd'].map((id, index) => ({ ...input(id), number: index + 2 }));
  for (const replace of [undefined, 'a']) {
    const result = appendTake(takes, input('e'), replace);
    assert.equal(result.added, undefined);
    assert.equal(result.takes, takes);
  }
});

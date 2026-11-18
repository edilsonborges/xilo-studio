import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCAL_SAMPLES, SEPARATOR, THEMES, countWords, estimateSeconds, fitToDuration, formatDuration, joinSuggestion, sampleStory, splitSuggestion } from './writer.js';

test('sugestão: o texto original fica acima da linha e a sugestão abaixo', () => {
  const joined = joinSuggestion('Texto original.\nSegunda linha.', 'Texto melhorado.');
  assert.ok(joined.includes(`\n${SEPARATOR}\n`));
  assert.deepEqual(splitSuggestion(joined), { original: 'Texto original.\nSegunda linha.', suggestion: 'Texto melhorado.' });
  assert.equal(splitSuggestion('Roteiro comum, sem sugestão.'), null);
  // um travessão ou "--" no meio do texto não conta como separador
  assert.equal(splitSuggestion('Ele chegou -- cansado.\nE dormiu.'), null);
});

test('duração: estimativa pelo número de palavras e texto legível', () => {
  assert.equal(formatDuration(30), '30 s');
  assert.equal(formatDuration(60), '1 min');
  assert.equal(formatDuration(95), '1 min 35 s');
  assert.equal(formatDuration(180), '3 min');
  const thirty = Array.from({ length: 69 }, () => 'palavra').join(' ');
  assert.ok(Math.abs(estimateSeconds(thirty) - 30) < 0.01);
  assert.equal(estimateSeconds('   '), 0);
});

test('exemplo sem IA: cada clique traz um roteiro diferente, em rodízio', async () => {
  const seen = new Set<string>();
  for (let turn = 0; turn < LOCAL_SAMPLES.length; turn++) {
    const sample = await sampleStory(turn, 30, false);
    assert.equal(sample.source, 'local');
    seen.add(sample.script);
  }
  assert.equal(seen.size, LOCAL_SAMPLES.length);
  assert.equal((await sampleStory(LOCAL_SAMPLES.length, 30, false)).script, LOCAL_SAMPLES[0]);
  assert.ok(THEMES.length >= 10);
  for (const script of LOCAL_SAMPLES) assert.equal(splitSuggestion(script), null);
});

test('exemplo longo demais perde linhas do meio, mantendo abertura e final', () => {
  const line = (tag: string) => `${tag} ${Array.from({ length: 19 }, () => 'palavra').join(' ')}`;
  const long = ['abertura', 'meio1', 'meio2', 'meio3', 'final'].map(line).join('\n');
  const fitted = fitToDuration(long, 30).split('\n');
  assert.ok(countWords(fitted.join(' ')) <= 69 * 1.25);
  assert.ok(fitted[0].startsWith('abertura'));
  assert.ok(fitted.at(-1)!.startsWith('final'));
  // texto no tamanho certo não muda
  assert.equal(fitToDuration('Uma linha curta.\nOutra linha curta.', 30), 'Uma linha curta.\nOutra linha curta.');
});

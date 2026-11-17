// Módulo 2: divide a narração em cenas de 4 a 8 segundos, cortando de
// preferência em fim de frase, depois em vírgula, e só então no meio do texto.

import type { SceneSlot, Timeline } from '../types';
import { clamp } from '../util';

export const MIN_SCENE = 4;
export const MAX_SCENE = 8;
const IDEAL_SCENE = 6;

export function splitScenes(timeline: Timeline): SceneSlot[] {
  const { words, sentences, duration } = timeline;
  const n = words.length;
  const sentenceEnds = new Set(sentences.map((s) => s.last));

  const boundaryTime = (i: number): number => (words[i].end + words[i + 1].start) / 2;
  const boundaryQuality = (i: number): number => {
    if (sentenceEnds.has(i)) return 4;
    if (/[;:—–]["'”’)]*$/.test(words[i].text)) return 2;
    if (/,["'”’)]*$/.test(words[i].text)) return 1.5;
    return 0;
  };
  const textOf = (from: number, to: number): string =>
    words
      .slice(from, to)
      .map((w) => w.text)
      .join(' ');

  const slots: SceneSlot[] = [];
  let first = 0; // primeira palavra da cena em construção
  let t0 = 0;

  while (duration - t0 > MAX_SCENE) {
    // o corte precisa deixar pelo menos MIN_SCENE para a cena seguinte
    const lo = t0 + MIN_SCENE;
    const hi = Math.min(t0 + MAX_SCENE, duration - MIN_SCENE);

    let best = -1;
    let bestScore = -Infinity;
    for (let i = first; i < n - 1; i++) {
      const bt = boundaryTime(i);
      if (bt < lo) continue;
      if (bt > hi) break;
      const score = boundaryQuality(i) - Math.abs(bt - (t0 + IDEAL_SCENE)) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }

    let cut: number;
    let next: number;
    if (best >= 0) {
      cut = boundaryTime(best);
      next = best + 1;
    } else {
      // nenhuma fronteira de palavra na janela (silêncio longo): corta no tempo
      cut = clamp(t0 + IDEAL_SCENE, lo, hi);
      next = first;
      while (next < n && words[next].start < cut) next++;
    }
    slots.push({ id: '', startTime: t0, endTime: cut, text: textOf(first, next) });
    first = next;
    t0 = cut;
  }

  slots.push({ id: '', startTime: t0, endTime: duration, text: textOf(first, n) });
  slots.forEach((slot, i) => {
    slot.id = `scene_${i + 1}`;
    slot.startTime = Math.round(slot.startTime * 1000) / 1000;
    slot.endTime = Math.round(slot.endTime * 1000) / 1000;
  });
  return slots;
}

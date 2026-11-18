// Módulo 5: Canvas 2D Master. Desenha o frame do Three.js e, por cima, o
// título de localização e a legenda karaokê. É este canvas que vai para o
// preview e para a gravação, então tudo que aparece no vídeo passa por aqui.

import { FRAME_HEIGHT, FRAME_WIDTH } from '../engine/engine';

/** O que o compositor precisa de um motor: o 3D (SceneEngine) e o ilustrado servem. */
export interface FrameSource {
  readonly canvas: HTMLCanvasElement;
  render(t: number): void;
  sceneAt(t: number): { locationTitle?: string; startTime: number; endTime: number } | null;
}
import type { Timeline, WordTiming } from '../types';
import { paintCaption, type CaptionStyle } from './captions';
import { clamp } from '../util';

interface CaptionGroup {
  first: number;
  last: number;
  start: number;
  end: number;
}

const SERIF = "Georgia, 'Times New Roman', 'Noto Serif', serif";

const CAPTION_CENTER_Y = 1430;
const CAPTION_MAX_WORDS = 5;
const CAPTION_MAX_CHARS = 26;
/** depois da última palavra do grupo, a pílula some se ninguém falar */
const CAPTION_LINGER = 0.9;

const TITLE_DURATION = 3.6;
const TITLE_FADE = 0.5;

const easeOut = (x: number): number => 1 - (1 - clamp(x, 0, 1)) ** 3;

export function buildCaptionGroups(timeline: Timeline): CaptionGroup[] {
  const { words, sentences } = timeline;
  const sentenceEnds = new Set(sentences.map((s) => s.last));
  const groups: CaptionGroup[] = [];
  let first = 0;
  let chars = 0;
  for (let i = 0; i < words.length; i++) {
    chars += words[i].text.length + 1;
    const next = words[i + 1];
    const count = i - first + 1;
    const mustBreak =
      !next ||
      sentenceEnds.has(i) ||
      count >= CAPTION_MAX_WORDS ||
      chars + next.text.length > CAPTION_MAX_CHARS ||
      next.start - words[i].end > 0.7;
    if (mustBreak) {
      groups.push({ first, last: i, start: words[first].start, end: words[i].end });
      first = i + 1;
      chars = 0;
    }
  }
  return groups;
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private words: WordTiming[] = [];
  private groups: CaptionGroup[] = [];
  accent = '#d8432b';
  showCaptions = true;
  captionStyle: CaptionStyle = 'pill';

  constructor(private engine: FrameSource, canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.width = FRAME_WIDTH;
    this.canvas.height = FRAME_HEIGHT;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
    this.ctx = ctx;
  }

  setSource(engine: FrameSource): void {
    this.engine = engine;
  }

  setTimeline(timeline: Timeline): void {
    this.words = timeline.words;
    this.groups = buildCaptionGroups(timeline);
  }

  /** Desenha o frame completo do instante `t`. Função pura de `t`. */
  draw(t: number): void {
    const ctx = this.ctx;
    this.engine.render(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.engine.canvas, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    this.drawTitle(t);
    if (this.showCaptions) this.drawCaption(t);
  }

  private drawTitle(t: number): void {
    const scene = this.engine.sceneAt(t);
    if (!scene?.locationTitle) return;
    const local = t - scene.startTime;
    const length = Math.min(TITLE_DURATION, scene.endTime - scene.startTime);
    if (local < 0 || local > length) return;
    const fade = Math.min(TITLE_FADE, length / 3);
    const alpha = Math.min(easeOut(local / fade), easeOut((length - local) / fade));
    if (alpha <= 0) return;

    const ctx = this.ctx;
    const text = scene.locationTitle;
    let size = 78;
    ctx.font = `italic 600 ${size}px ${SERIF}`;
    const maxWidth = FRAME_WIDTH - 160;
    const measured = ctx.measureText(text).width;
    if (measured > maxWidth) {
      size = Math.floor((size * maxWidth) / measured);
      ctx.font = `italic 600 ${size}px ${SERIF}`;
    }
    const width = ctx.measureText(text).width;
    const x = FRAME_WIDTH / 2;
    const y = 330 + (1 - easeOut(local / fade)) * 24;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = 'rgba(18, 12, 8, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff8ea';
    ctx.fillText(text, x, y);

    // filete com losango, como vinheta de folheto de cordel
    const ruleY = y + size * 0.42;
    const half = Math.min(width / 2, 260);
    ctx.fillStyle = 'rgba(18, 12, 8, 0.92)';
    ctx.fillRect(x - half - 3, ruleY - 5, half * 2 + 6, 10);
    ctx.fillStyle = '#fff8ea';
    ctx.fillRect(x - half, ruleY - 2, half * 2, 4);
    ctx.translate(x, ruleY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(18, 12, 8, 0.92)';
    ctx.fillRect(-13, -13, 26, 26);
    ctx.fillStyle = this.accent;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }

  private activeGroup(t: number): CaptionGroup | null {
    const groups = this.groups;
    let lo = 0;
    let hi = groups.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (groups[mid].start <= t) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return null;
    const group = groups[found];
    return t <= group.end + CAPTION_LINGER ? group : null;
  }

  private drawCaption(t: number): void {
    const group = this.activeGroup(t);
    if (!group) return;
    const ctx = this.ctx;
    const words = this.words.slice(group.first, group.last + 1);

    // palavra falada agora: a última do grupo que já começou
    let active = 0;
    for (let i = 0; i < words.length; i++) if (words[i].start <= t) active = i;

    ctx.save();
    const appear = easeOut((t - group.start) / 0.12);
    ctx.globalAlpha = appear;
    ctx.translate(FRAME_WIDTH / 2, CAPTION_CENTER_Y);
    if (this.captionStyle === 'pill') ctx.scale(0.92 + 0.08 * appear, 0.92 + 0.08 * appear);
    paintCaption(ctx, this.captionStyle, words.map(w => w.text), active, this.accent);
    ctx.restore();
  }
}

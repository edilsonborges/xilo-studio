// Motor do modo ilustrado: uma imagem por cena, com movimento lento de câmera
// (Ken Burns) e transição suave. Tem a mesma "cara" que o SceneEngine para o
// compositor: canvas, render(t) e sceneAt(t).

import { FRAME_HEIGHT, FRAME_WIDTH } from '../engine/engine';
import { clamp } from '../util';
import type { IllustratedScene, Motion } from './director';

const CROSSFADE = 0.6;
/** quanto a imagem cresce durante a cena (1.12 = 12%) */
const ZOOM = 1.12;

const ease = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export class IllustratedEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scenes: IllustratedScene[] = [];
  private readonly images = new Map<string, ImageBitmap>();
  private readonly failed = new Set<string>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = FRAME_WIDTH;
    this.canvas.height = FRAME_HEIGHT;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
    this.ctx = ctx;
  }

  setScenes(scenes: IllustratedScene[]): void {
    this.scenes = scenes;
  }

  setImage(id: string, image: ImageBitmap): void {
    this.images.get(id)?.close();
    this.images.set(id, image);
    this.failed.delete(id);
  }

  markFailed(id: string): void {
    this.failed.add(id);
  }

  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  sceneIndexAt(t: number): number {
    const i = this.scenes.findIndex((s) => t < s.endTime);
    return i < 0 ? this.scenes.length - 1 : i;
  }

  sceneAt(t: number): IllustratedScene | null {
    return this.scenes[this.sceneIndexAt(t)] ?? null;
  }

  render(t: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f3ead8';
    ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const index = this.sceneIndexAt(t);
    const scene = this.scenes[index];
    if (!scene) return;
    const previous = this.scenes[index - 1];
    const intoScene = t - scene.startTime;
    if (previous && intoScene < CROSSFADE) {
      this.drawScene(previous, t, index - 1, 1);
      this.drawScene(scene, t, index, ease(intoScene / CROSSFADE));
    } else {
      this.drawScene(scene, t, index, 1);
    }
  }

  private drawScene(scene: IllustratedScene, t: number, index: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    const image = this.images.get(scene.id);
    if (!image) {
      this.drawPlaceholder(index, t, this.failed.has(scene.id));
      ctx.globalAlpha = 1;
      return;
    }
    const length = Math.max(0.1, scene.endTime - scene.startTime);
    const p = ease((t - scene.startTime) / length);
    this.drawMoving(image, scene.motion, p);
    ctx.globalAlpha = 1;
  }

  private drawMoving(image: ImageBitmap, motion: Motion, p: number): void {
    // "cover": preenche o quadro 9:16 inteiro, cortando o que sobra
    const cover = Math.max(FRAME_WIDTH / image.width, FRAME_HEIGHT / image.height);
    let scale = cover * ZOOM;
    let dx = 0;
    let dy = 0;
    const slackX = (image.width * scale - FRAME_WIDTH) / 2;
    const slackY = (image.height * scale - FRAME_HEIGHT) / 2;
    switch (motion) {
      case 'zoom_in':
        scale = cover * (1 + (ZOOM - 1) * p);
        break;
      case 'zoom_out':
        scale = cover * (ZOOM - (ZOOM - 1) * p);
        break;
      case 'pan_left':
        dx = slackX * (1 - 2 * p);
        break;
      case 'pan_right':
        dx = -slackX * (1 - 2 * p);
        break;
      case 'pan_up':
        dy = slackY * (1 - 2 * p);
        break;
    }
    const w = image.width * scale;
    const h = image.height * scale;
    this.ctx.drawImage(image, (FRAME_WIDTH - w) / 2 + dx, (FRAME_HEIGHT - h) / 2 + dy, w, h);
  }

  private drawPlaceholder(index: number, t: number, failed: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#f3ead8';
    ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    ctx.fillStyle = '#17110d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "900 120px Georgia, 'Times New Roman', serif";
    ctx.fillText(String(index + 1), FRAME_WIDTH / 2, FRAME_HEIGHT / 2 - 140);
    ctx.font = "600 46px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = '#6b5d4f';
    const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
    ctx.fillText(failed ? 'Não consegui desenhar esta cena' : `Desenhando a cena${dots}`, FRAME_WIDTH / 2, FRAME_HEIGHT / 2);
  }

  dispose(): void {
    for (const image of this.images.values()) image.close();
    this.images.clear();
  }
}

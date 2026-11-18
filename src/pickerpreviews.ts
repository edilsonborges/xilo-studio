import { captionStyle, paintCaption } from './compositor/captions';

export function captionPreview(option: HTMLOptionElement, accent: string): HTMLElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'style-thumb picker-caption';
  canvas.width = 400;
  canvas.height = 220;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.translate(200, 110);
    paintCaption(ctx, captionStyle(option.value), ['Bom', 'dia'], 1, accent);
  }
  return canvas;
}

const voiceColors: Record<string, string> = {
  'voicestudio-pt-br': 'clay', 'voicestudio-noticia': 'blue',
  'voicestudio-conto': 'plum', 'voicestudio-documentario': 'green',
};

export function voicePreview(option: HTMLOptionElement): HTMLElement {
  const art = document.createElement('span');
  art.className = `style-thumb picker-audio ${voiceColors[option.value] ?? 'ink'}`;
  art.setAttribute('aria-hidden', 'true');
  for (const height of [24, 45, 32, 68, 94, 52, 75, 38, 57, 22]) {
    const bar = document.createElement('i');
    bar.style.height = `${height}%`;
    art.append(bar);
  }
  return art;
}

export function textPreview(text: string): HTMLElement {
  const art = document.createElement('span');
  art.className = 'style-thumb picker-type';
  art.setAttribute('aria-hidden', 'true');
  art.textContent = text;
  return art;
}

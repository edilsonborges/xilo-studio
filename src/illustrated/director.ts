// Modo ilustrado: a IA lê o roteiro e escreve uma descrição de imagem por cena,
// com o mesmo personagem e o mesmo estilo em todas. Sem IA de texto, cada cena
// usa o próprio trecho narrado como descrição.

import { aiText } from '../ai/client';
import type { SceneSlot } from '../types';

export const ILLUSTRATION_STYLES = {
  xilogravura:
    'colored Brazilian cordel woodcut print (xilogravura), bold black carved lines, flat earthy colors, paper texture',
  aquarela: 'soft watercolor illustration, gentle washes of color, visible paper grain, warm light',
  infantil: "children's picture book illustration, friendly rounded shapes, bright cheerful colors, soft shading",
  cinema: 'cinematic photorealistic still, natural light, shallow depth of field, film color grading',
} as const;

export type IllustrationStyle = keyof typeof ILLUSTRATION_STYLES;

export const MOTIONS = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up'] as const;
export type Motion = (typeof MOTIONS)[number];

export interface IllustratedScene {
  id: string;
  startTime: number;
  endTime: number;
  /** título curto de lugar/época, só na primeira aparição de um lugar */
  locationTitle?: string;
  /** descrição enviada ao gerador de imagem */
  prompt: string;
  motion: Motion;
}

const SYSTEM = `You are the storyboard artist of Xilo, which turns a narrated script into a vertical 9:16 illustrated video.
You receive the script and a list of scene slots (id, time range and the words narrated in it).
For each slot, write one image description that shows exactly what is narrated at that moment.

Reply with a single JSON object, no prose:
{
  "characters": "one paragraph describing the recurring characters' fixed look (age, skin, hair, clothes, colors), so every image draws them the same way",
  "scenes": [
    { "id": "scene_1", "locationTitle": "Bahia, 1930s" or "", "motion": "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "pan_up", "prompt": "..." }
  ]
}

Rules:
- One entry per slot, same ids and order.
- "prompt": 1 to 3 sentences in English describing subject, action, setting, time of day and framing. Mention characters by role (e.g. "the boy Jaiminho") and keep their look consistent with "characters".
- Never ask for text, letters, captions, logos or speech bubbles in the image.
- "locationTitle": short place/time title in the script's language, only when a new place or time appears; otherwise "".
- Vary "motion" between consecutive scenes.`;

function fallbackScenes(slots: SceneSlot[]): IllustratedScene[] {
  return slots.map((slot, i) => ({
    id: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    prompt: `An illustration of this moment of the story: "${slot.text}"`,
    motion: MOTIONS[i % MOTIONS.length],
  }));
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('a IA não devolveu JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export interface StoryboardResult {
  scenes: IllustratedScene[];
  characters: string;
  source: 'ai' | 'script';
  warning?: string;
}

export async function storyboard(script: string, slots: SceneSlot[], useAi: boolean): Promise<StoryboardResult> {
  if (!useAi) return { scenes: fallbackScenes(slots), characters: '', source: 'script' };
  const prompt = `SCRIPT:\n${script}\n\nSLOTS:\n${JSON.stringify(
    slots.map((s) => ({ id: s.id, start: +s.startTime.toFixed(2), end: +s.endTime.toFixed(2), text: s.text })),
  )}`;
  try {
    const parsed = extractJson(await aiText(SYSTEM, prompt)) as {
      characters?: unknown;
      scenes?: Array<{ id?: unknown; prompt?: unknown; motion?: unknown; locationTitle?: unknown }>;
    };
    const list = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const fallback = fallbackScenes(slots);
    const scenes = slots.map((slot, i) => {
      const match = list.find((s) => s?.id === slot.id) ?? list[i];
      const base = fallback[i];
      if (!match || typeof match.prompt !== 'string' || !match.prompt.trim()) return base;
      return {
        ...base,
        prompt: match.prompt.trim().slice(0, 1200),
        motion: MOTIONS.includes(match.motion as Motion) ? (match.motion as Motion) : base.motion,
        locationTitle:
          typeof match.locationTitle === 'string' && match.locationTitle.trim()
            ? match.locationTitle.trim().slice(0, 40)
            : undefined,
      };
    });
    const characters = typeof parsed.characters === 'string' ? parsed.characters.trim().slice(0, 1200) : '';
    return { scenes, characters, source: 'ai' };
  } catch (err) {
    return {
      scenes: fallbackScenes(slots),
      characters: '',
      source: 'script',
      warning: `A IA não montou o roteiro de imagens (${(err as Error).message}). Usei o texto de cada cena.`,
    };
  }
}

/** Monta o pedido final ao gerador de imagem: estilo + personagens + cena. */
export function imagePrompt(scene: IllustratedScene, style: IllustrationStyle, characters: string): string {
  return [
    `Style: ${ILLUSTRATION_STYLES[style]}.`,
    'Vertical 9:16 portrait composition, the main subject centered with room at the bottom.',
    characters ? `Recurring characters (draw them exactly like this): ${characters}` : '',
    `Scene: ${scene.prompt}`,
    'No text, no letters, no captions, no logos, no watermark, no speech bubbles.',
  ]
    .filter(Boolean)
    .join('\n');
}

// Módulo 2: Diretor de Arte via LLM. Cada provedor recebe o mesmo prompt e
// devolve texto que deve conter o SceneGraphJSON; a validação fica em validate.ts.

import { aiText } from '../ai/client';
import type { LlmProvider, Settings } from '../settings';
import {
  ACCESSORIES,
  ANIMATIONS,
  CAMERA_MOVEMENTS,
  PARTICLES,
  PRESETS,
  PROP_TYPES,
  type SceneSlot,
} from '../types';

const list = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(' | ');

export const SYSTEM_PROMPT = `You are the art director of Xilo, an engine that turns a narrated script into a vertical (9:16) low-poly 3D video with cel shading and black outlines, in the style of Brazilian cordel woodcuts.

You receive the full script and a list of scene slots. Each slot has a fixed id, start time, end time and the words narrated during it. Design one 3D scene per slot that illustrates what is being narrated at that moment. A procedural Three.js engine builds everything from primitives, so you can only use the building blocks listed below.

Reply with a single JSON object and nothing else (no prose, no markdown fences), shaped like this:

{
  "scenes": [
    {
      "id": "scene_1",
      "startTime": 0.0,
      "endTime": 5.5,
      "locationTitle": "Bahia, anos 1930",
      "environment": {
        "preset": "sertao_day",
        "skyColor": "#e8c391",
        "groundColor": "#c28d53",
        "fogColor": "#e8c391",
        "particles": "dust"
      },
      "camera": {
        "movement": "zoom_in",
        "startPos": [0, 3, 10],
        "endPos": [0, 2.5, 7],
        "lookAt": [0, 1, 0],
        "target": "protagonist"
      },
      "characters": [
        {
          "id": "protagonist",
          "position": [0, 0, 0],
          "targetPosition": [0, 0, 3],
          "skinColor": "#8d5524",
          "shirtColor": "#f4f1ea",
          "pantsColor": "#3d352e",
          "accessory": "straw_hat",
          "animation": "walk"
        }
      ],
      "props": [
        { "type": "rustic_house", "position": [-4, 0, -3], "rotationY": 0.5, "scale": 1.0, "color": "#d9a066" }
      ]
    }
  ]
}

Allowed values (anything else is discarded by the engine):
- environment.preset: ${list(PRESETS)}
- environment.particles: ${list(PARTICLES)}
- camera.movement: ${list(CAMERA_MOVEMENTS)}
- characters[].animation: ${list(ANIMATIONS)}
- characters[].accessory: ${list(ACCESSORIES)}
- props[].type: ${list(PROP_TYPES)}

Contract:
- Return exactly one scene per slot, in order, copying each slot's id, startTime and endTime unchanged. Timing is owned by the audio, not by you.
- Colors are "#rrggbb" hex strings.
- camera.target is only used with "follow_character" and must be the id of a character in that scene.
- targetPosition is optional. When present, the character moves from position to targetPosition over the scene, so pair it with the "walk" animation.
- props[].color is optional; leave it out to use the preset palette.
- A character id that appears in several scenes is the same person: keep its skinColor, shirtColor, pantsColor and accessory identical everywhere.
- locationTitle is optional. Use it on the first scene and when the place or era changes, as a short caption such as "Bahia, anos 1930". Write it in the language of the script.

Staging, so the result looks good:
- World units are meters, Y is up, the ground is y = 0, and characters are about 1.8 tall. The stage is centered on the origin and the camera usually sits around z = 7 to 12 looking toward the origin.
- The frame is tall and narrow: at the origin only about 5 units of width are visible. Keep characters within x from -2 to 2, and props within x from -4.5 to 4.5 and z from -11 to 3, with larger props further back so they do not hide the characters.
- "interior_night" is a room with a back wall at z = -5.5, so keep everything in front of it and prefer bed, table and lantern there. A "sleep" character placed at the same position as a bed lies on it.
- "road" is a long strip that runs through its position along Z (use rotationY to turn it).
- Vary camera movement and composition from scene to scene, and choose the preset, particles and props that match the mood of the narration. Use 1 to 3 characters and 2 to 6 props per scene.`;

export interface KnownCharacter {
  id: string;
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory: string;
}

export function buildUserPrompt(script: string, slots: SceneSlot[], known: KnownCharacter[]): string {
  const parts = [
    `Full script:\n"""\n${script.trim()}\n"""`,
    `Scene slots to design (JSON):\n${JSON.stringify(
      slots.map((s) => ({ id: s.id, startTime: s.startTime, endTime: s.endTime, narration: s.text })),
      null,
      1,
    )}`,
  ];
  if (known.length) {
    parts.push(
      `Characters already established in earlier scenes. Reuse these ids and looks when the same people appear:\n${JSON.stringify(known)}`,
    );
  }
  parts.push('Return the JSON object with one scene per slot.');
  return parts.join('\n\n');
}

/** Extrai o primeiro valor JSON de uma resposta que pode vir com texto em volta. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start < 0 || end <= start) throw new Error('A resposta do LLM não contém JSON.');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

async function failure(res: Response, who: string): Promise<Error> {
  const detail = await res.text().catch(() => '');
  return new Error(`${who} respondeu ${res.status}: ${detail.slice(0, 200)}`);
}

async function callOpenAI(key: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw await failure(res, 'OpenAI');
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI devolveu uma resposta vazia.');
  return text;
}

async function callGemini(key: string, model: string, system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw await failure(res, 'Gemini');
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini devolveu uma resposta vazia.');
  return text;
}

async function callAnthropic(key: string, model: string, system: string, user: string): Promise<string> {
  // carregado sob demanda: quem não usa Claude não baixa o SDK
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // a chave é do próprio usuário e fica só no navegador dele; o SDK envia o
  // header anthropic-dangerous-direct-browser-access com esta opção
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (message.stop_reason === 'refusal') throw new Error('Claude recusou o pedido.');
    if (message.stop_reason === 'max_tokens') {
      throw new Error('A resposta do Claude foi cortada por limite de tokens.');
    }
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    if (!text) throw new Error('Claude devolveu uma resposta vazia.');
    return text;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('Chave da Anthropic inválida.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('Limite de requisições da Anthropic atingido. Tente de novo em instantes.');
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new Error('Não consegui conectar à API da Anthropic.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Anthropic respondeu ${err.status ?? '?'}: ${err.message.slice(0, 200)}`);
    }
    throw err;
  }
}

export function callLlm(
  provider: Exclude<LlmProvider, 'none'>,
  settings: Settings,
  system: string,
  user: string,
): Promise<string> {
  switch (provider) {
    case 'xilo':
      return aiText(system, user);
    case 'openai':
      return callOpenAI(settings.openaiKey.trim(), settings.openaiModel, system, user);
    case 'gemini':
      return callGemini(settings.geminiKey.trim(), settings.geminiModel, system, user);
    case 'anthropic':
      return callAnthropic(settings.anthropicKey.trim(), settings.anthropicModel, system, user);
  }
}

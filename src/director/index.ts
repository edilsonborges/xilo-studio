// Módulo 2: orquestra LLM + validação + fallback por regras.

import { llmKey, type Settings } from '../settings';
import type { SceneGraphJSON, SceneSlot } from '../types';
import { buildUserPrompt, callLlm, extractJson, SYSTEM_PROMPT, type KnownCharacter } from './llm';
import { generateScenesByRules } from './rules';
import { sanitizeSceneGraph } from './validate';

export interface DirectorResult {
  graph: SceneGraphJSON;
  source: 'llm' | 'rules' | 'mixed';
  warning?: string;
}

/** Cenas por requisição: mantém a resposta do LLM bem abaixo do limite de saída. */
const CHUNK = 12;

export async function directScenes(
  script: string,
  slots: SceneSlot[],
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<DirectorResult> {
  const ruleScenes = generateScenesByRules(slots, script);
  const provider = settings.llmProvider;
  if (provider === 'none' || !llmKey(settings)) {
    return { graph: sanitizeSceneGraph({ scenes: ruleScenes }, slots), source: 'rules' };
  }

  const raw: unknown[] = new Array(slots.length);
  const known = new Map<string, KnownCharacter>();
  let done = 0;
  let warning: string | undefined;

  for (let offset = 0; offset < slots.length; offset += CHUNK) {
    const chunk = slots.slice(offset, offset + CHUNK);
    onProgress?.(`Diretor de arte (${provider}): cenas ${offset + 1} a ${offset + chunk.length} de ${slots.length}…`);
    try {
      const text = await callLlm(provider, settings, SYSTEM_PROMPT, buildUserPrompt(script, chunk, [...known.values()]));
      const parsed = extractJson(text) as { scenes?: unknown } | unknown[];
      const scenes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.scenes) ? parsed.scenes : [];
      if (scenes.length === 0) throw new Error('O LLM não devolveu nenhuma cena.');

      chunk.forEach((slot, i) => {
        const match =
          scenes.find((s) => (s as { id?: unknown } | null)?.id === slot.id) ?? scenes[i];
        if (match === undefined) return;
        raw[offset + i] = match;
        done++;
      });

      // passa a aparência já validada adiante, para manter consistência entre blocos
      const soFar = sanitizeSceneGraph({ scenes: raw.filter((s) => s !== undefined) });
      for (const scene of soFar.scenes) {
        for (const c of scene.characters) {
          if (!known.has(c.id)) {
            known.set(c.id, {
              id: c.id,
              skinColor: c.skinColor,
              shirtColor: c.shirtColor,
              pantsColor: c.pantsColor,
              accessory: c.accessory,
            });
          }
        }
      }
    } catch (err) {
      warning = `Diretor de arte via LLM falhou (${(err as Error).message}). Completei com o gerador por regras.`;
      break;
    }
  }

  return {
    graph: sanitizeSceneGraph({ scenes: raw }, slots, ruleScenes),
    source: done === 0 ? 'rules' : done < slots.length ? 'mixed' : 'llm',
    warning,
  };
}

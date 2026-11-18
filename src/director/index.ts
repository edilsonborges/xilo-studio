// Módulo 2: orquestra LLM + validação + fallback por regras.

import { llmKey, type Settings } from '../settings';
import type { Preset, SceneGraphJSON, SceneSlot, StorySheet } from '../types';
import { selectExamples } from './examples';
import { buildUserPrompt, callLlm, extractJson, STORY_PROMPT, SYSTEM_PROMPT, type KnownCharacter } from './llm';
import { generateScenesByRules } from './rules';
import { sanitizeSceneGraph, sanitizeStorySheet } from './validate';
import { variantHints } from './variants';

export interface DirectorResult {
  graph: SceneGraphJSON;
  source: 'llm' | 'rules' | 'mixed';
  warning?: string;
  /** ficha da história, quando a IA conseguiu montar */
  story?: StorySheet;
}

/** Cenas por requisição: mantém a resposta do LLM bem abaixo do limite de saída. */
const CHUNK = 12;

export async function directScenes(
  script: string,
  slots: SceneSlot[],
  settings: Settings,
  onProgress?: (message: string) => void,
  /** número da variação: 0 na primeira vez, sobe a cada "gerar de novo" do mesmo roteiro */
  variation = 0,
): Promise<DirectorResult> {
  const ruleScenes = generateScenesByRules(slots, script, variation);
  const provider = settings.llmProvider;
  if (provider === 'none' || !llmKey(settings)) {
    return { graph: sanitizeSceneGraph({ scenes: ruleScenes }, slots), source: 'rules' };
  }

  const raw: unknown[] = new Array(slots.length);
  const known = new Map<string, KnownCharacter>();

  // 1) ficha da história: elenco e arco fixos para todas as cenas
  let story: StorySheet | null = null;
  onProgress?.('Lendo a história inteira…');
  try {
    story = sanitizeStorySheet(extractJson(await callLlm(provider, settings, STORY_PROMPT, `Script:\n"""\n${script.trim()}\n"""`)));
  } catch {
    // sem ficha, as cenas saem como antes
  }
  for (const c of story?.cast ?? []) {
    known.set(c.id, { id: c.id, skinColor: c.skinColor, shirtColor: c.shirtColor, pantsColor: c.pantsColor, accessory: c.accessory, kind: c.kind });
  }
  // 2) exemplos próximos do roteiro e orientações da variação
  const places: Preset[] = [...(story?.arc.map((a) => a.place) ?? []), ...ruleScenes.map((sc) => sc.environment.preset)];
  const examples = selectExamples(places);
  // a primeira versão segue só o roteiro; as orientações de variação entram ao gerar de novo
  const hints = variation > 0 ? variantHints(slots, variation) : [];
  let done = 0;
  let warning: string | undefined;

  for (let offset = 0; offset < slots.length; offset += CHUNK) {
    const chunk = slots.slice(offset, offset + CHUNK);
    onProgress?.(`Diretor de arte (${provider}): cenas ${offset + 1} a ${offset + chunk.length} de ${slots.length}…`);
    try {
      const text = await callLlm(provider, settings, SYSTEM_PROMPT, buildUserPrompt(script, chunk, [...known.values()], { story, examples, hints }));
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
              kind: c.kind,
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
    ...(story ? { story } : {}),
  };
}

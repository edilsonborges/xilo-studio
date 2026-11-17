// Cliente do opencode-gateway: texto (direção das cenas) e imagens (gpt-image-2)
// pela assinatura do ChatGPT. A chave fica só no servidor do Xilo.
//
// Tudo é assíncrono: o gateway responde 200 se terminar em poucos segundos ou
// 202 com uma URL de consulta. Assim nenhuma requisição do navegador fica presa
// mais que o limite de ~100 s do Cloudflare.

import { randomUUID } from 'node:crypto';

export interface GatewayConfig {
  url: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}

export type AiOutcome =
  | { status: 'completed'; kind: 'text'; text: string }
  | { status: 'completed'; kind: 'image'; image: string; mimeType: string }
  | { status: 'pending'; statusUrl: string; kind: 'text' | 'image' };

export interface Gateway {
  startText(system: string, prompt: string): Promise<AiOutcome>;
  startImage(prompt: string): Promise<AiOutcome>;
  poll(statusUrl: string, kind: 'text' | 'image'): Promise<AiOutcome>;
}

export class GatewayError extends Error {}

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;

function textFrom(body: Json): string {
  const choice = asObject((body.choices as unknown[] | undefined)?.[0]);
  const content = asObject(choice?.message)?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const joined = content.map((part) => (asObject(part)?.text as string | undefined) ?? '').join('');
    if (joined.trim()) return joined;
  }
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text;
  throw new GatewayError('O gateway não devolveu texto.');
}

function imageFrom(body: Json): string {
  const first = asObject((body.data as unknown[] | undefined)?.[0]);
  const b64 = first?.b64_json;
  if (typeof b64 !== 'string' || b64.length < 100) throw new GatewayError('O gateway não devolveu imagem.');
  return b64;
}

function completed(kind: 'text' | 'image', body: Json): AiOutcome {
  return kind === 'text'
    ? { status: 'completed', kind, text: textFrom(body) }
    : { status: 'completed', kind, image: imageFrom(body), mimeType: 'image/png' };
}

function errorMessage(body: Json | null, status: number): string {
  const error = body?.error;
  const message = typeof error === 'string' ? error : asObject(error)?.message;
  return `gateway respondeu ${status}${typeof message === 'string' ? `: ${message.slice(0, 200)}` : ''}`;
}

export function createGateway(config: GatewayConfig, fetchImpl: typeof fetch = fetch): Gateway {
  const base = new URL(config.url);
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${config.apiKey}`,
    ...extra,
  });

  /** Só segue URLs de consulta do próprio gateway. */
  function resolveStatusUrl(raw: unknown): string {
    if (typeof raw !== 'string' || !raw) throw new GatewayError('O gateway não informou onde consultar o resultado.');
    const url = new URL(raw, base);
    if (url.origin !== base.origin) throw new GatewayError('URL de consulta fora do gateway.');
    return url.pathname + url.search;
  }

  async function start(path: string, kind: 'text' | 'image', payload: Json, extra: Record<string, string> = {}): Promise<AiOutcome> {
    const response = await fetchImpl(new URL(path, base), {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        'Idempotency-Key': `xilo-${kind}-${randomUUID()}`,
        Prefer: 'respond-async, wait=25',
        ...extra,
      }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const body = asObject(await response.json().catch(() => null));
    if (response.status === 202) {
      return { status: 'pending', kind, statusUrl: resolveStatusUrl(body?.status_url ?? response.headers.get('location')) };
    }
    if (!response.ok || !body) throw new GatewayError(errorMessage(body, response.status));
    return completed(kind, body);
  }

  return {
    startText: (system, prompt) =>
      start('/v1/chat/completions', 'text', {
        model: config.textModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        // tarefa curta de roteirização: esforço baixo e contexto mínimo do executor
        reasoning_effort: 'low',
      }, { 'X-Executor-Profile': 'minimal' }),

    startImage: (prompt) => start('/v1/images/generations', 'image', { model: config.imageModel, prompt }),

    async poll(statusUrl, kind) {
      const response = await fetchImpl(new URL(statusUrl, base), {
        headers: headers(),
        signal: AbortSignal.timeout(30_000),
      });
      const body = asObject(await response.json().catch(() => null));
      if (!response.ok || !body) throw new GatewayError(errorMessage(body, response.status));
      const status = body.status;
      if (status === 'completed') {
        const result = asObject(body.result);
        if (!result) throw new GatewayError('O gateway concluiu sem resultado.');
        return completed(kind, result);
      }
      if (['failed', 'cancelled', 'canceled', 'expired', 'interrupted'].includes(String(status))) {
        throw new GatewayError(`geração ${String(status)}${errorMessage(body, response.status).replace(/^gateway respondeu \d+/, '')}`);
      }
      return { status: 'pending', kind, statusUrl };
    },
  };
}

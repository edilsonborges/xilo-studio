// IA do servidor do Xilo (opencode-gateway por trás). Nenhuma chave no navegador.
// O servidor responde na hora ou devolve um id para consultar a cada 5 s.

import { api } from '../auth/api';

type Pending = { status: 'pending'; id: string };
type TextDone = { status: 'completed'; text: string };
type ImageDone = { status: 'completed'; image: string; mimeType: string };

const POLL_MS = 5_000;
/** O gateway corta cada geração em 300 s; damos uma folga antes de desistir. */
const MAX_WAIT_MS = 6 * 60_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelado', 'AbortError'));
    }, { once: true });
  });

async function settle<T extends { status: 'completed' }>(first: T | Pending, signal?: AbortSignal): Promise<T> {
  let current = first;
  const deadline = Date.now() + MAX_WAIT_MS;
  while (current.status === 'pending') {
    if (Date.now() > deadline) throw new Error('A IA demorou demais para responder.');
    await sleep(POLL_MS, signal);
    current = await api<T | Pending>(`/api/ai/jobs/${encodeURIComponent((current as Pending).id)}`);
  }
  return current as T;
}

let status: Promise<{ text: boolean; images: boolean }> | null = null;

/** O que a IA do servidor oferece; falha (ex.: só o Vite rodando) vira "nada". */
export function aiStatus(): Promise<{ text: boolean; images: boolean }> {
  status ??= api<{ text: boolean; images: boolean }>('/api/ai/status').catch(() => ({ text: false, images: false }));
  return status;
}

export async function aiText(system: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const first = await api<TextDone | Pending>('/api/ai/text', 'POST', { system, prompt });
  return (await settle(first, signal)).text;
}

export async function aiImage(prompt: string, signal?: AbortSignal): Promise<Blob> {
  const first = await api<ImageDone | Pending>('/api/ai/image', 'POST', { prompt });
  const done = await settle(first, signal);
  const binary = atob(done.image);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: done.mimeType });
}

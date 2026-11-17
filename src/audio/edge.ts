// Narração gerada no servidor do Xilo com o Edge TTS. Volta o .mp3 e o tempo
// exato de cada palavra, que substitui o alinhador e o Whisper.

import { api } from '../auth/api';
import type { WhisperWord } from './whisper';

export interface Voice {
  id: string;
  label: string;
}

export interface GeneratedNarration {
  file: File;
  words: WhisperWord[];
}

export async function listVoices(): Promise<{ voices: Voice[]; maxChars: number }> {
  return api('/api/narration/voices');
}

export async function narrate(text: string, voice: string, rate: number): Promise<GeneratedNarration> {
  const result = await api<{ audio: string; mimeType: string; words: WhisperWord[] }>(
    '/api/narration',
    'POST',
    { text, voice, rate },
  );
  const binary = atob(result.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const name = `narracao-${voice.replace(/^pt-BR-|Neural$/g, '').toLowerCase()}.mp3`;
  return { file: new File([bytes], name, { type: result.mimeType }), words: result.words };
}

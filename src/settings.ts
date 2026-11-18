// Configurações do usuário. As chaves de API vivem só no localStorage.

export type LlmProvider = 'none' | 'xilo' | 'openai' | 'gemini' | 'anthropic';
import { RENDER_STYLES } from './engine/styles';

/** Ilustrado por IA (xilogravura, aquarela…) ou um dos visuais 3D ("3d-<id>"). */
export type VideoStyle = 'xilogravura' | 'aquarela' | 'infantil' | 'cinema' | `3d-${string}`;
export const VIDEO_STYLES: readonly string[] = [
  'xilogravura', 'aquarela', 'infantil', 'cinema',
  ...RENDER_STYLES.map((style) => `3d-${style.id}`),
];

export const is3dStyle = (style: string): style is `3d-${string}` => style.startsWith('3d-');
export type TranscriptionProvider = 'local' | 'openai';

export interface Settings {
  transcription: TranscriptionProvider;
  llmProvider: LlmProvider;
  openaiKey: string;
  geminiKey: string;
  anthropicKey: string;
  openaiModel: string;
  openaiTranscribeModel: string;
  geminiModel: string;
  anthropicModel: string;
  captionAccent: string;
  /** voz e velocidade da narração gerada pelo Edge TTS */
  ttsVoice: string;
  ttsRate: string;
  /** ilustrado por IA (um dos estilos) ou o 3D de cordel */
  videoStyle: VideoStyle;
  /** duração desejada do vídeo, em segundos (5 a 180) */
  videoDuration: string;
}

const STORAGE_KEY = 'xilo.settings.v2';
/** versão anterior: sem a IA do Xilo, o padrão era "regras" */
const LEGACY_KEY = 'xilo.settings.v1';
const env = import.meta.env;

export const DEFAULT_SETTINGS: Settings = {
  transcription: 'local',
  llmProvider: 'xilo',
  openaiKey: '',
  geminiKey: '',
  anthropicKey: '',
  openaiModel: env.VITE_OPENAI_MODEL || 'gpt-4o-mini',
  openaiTranscribeModel: env.VITE_OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
  geminiModel: env.VITE_GEMINI_MODEL || 'gemini-2.5-flash',
  anthropicModel: env.VITE_ANTHROPIC_MODEL || 'claude-opus-5-5',
  captionAccent: '#d8432b',
  ttsVoice: 'pt-BR-AntonioNeural',
  ttsRate: '1',
  videoStyle: 'xilogravura',
  videoDuration: '30',
};

export function loadSettings(): Settings {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const raw = current ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // quem vinha da versão sem IA no servidor passa a usar a IA do Xilo
    if (!current && parsed.llmProvider === 'none') parsed.llmProvider = 'xilo';
    const merged = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      const value = parsed[key];
      if (typeof value === 'string' && (value !== '' || key.endsWith('Key'))) {
        (merged as Record<string, string>)[key] = value;
      }
    }
    if (!['local', 'openai'].includes(merged.transcription)) merged.transcription = 'local';
    if (!['none', 'xilo', 'openai', 'gemini', 'anthropic'].includes(merged.llmProvider)) {
      merged.llmProvider = 'xilo';
    }
    // o antigo "3D de cordel" virou o visual "Xilogravura clássica"
    if ((merged.videoStyle as string) === '3d') merged.videoStyle = '3d-xilogravura';
    if (!VIDEO_STYLES.includes(merged.videoStyle)) merged.videoStyle = 'xilogravura';
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage indisponível (modo privado): segue só com o valor em memória
  }
}

export function llmKey(settings: Settings): string {
  switch (settings.llmProvider) {
    case 'xilo':
      return 'servidor';
    case 'openai':
      return settings.openaiKey.trim();
    case 'gemini':
      return settings.geminiKey.trim();
    case 'anthropic':
      return settings.anthropicKey.trim();
    default:
      return '';
  }
}

import './style.css';

import { createTimeline, decodeAudioFile } from './audio';
import { initSession } from './auth/session';
import { Compositor } from './compositor/compositor';
import { directScenes } from './director';
import { splitScenes } from './director/splitter';
import { sanitizeSceneGraph } from './director/validate';
import { SceneEngine } from './engine/engine';
import { exportVideo, pickMimeType, type ExportFormat } from './export/exporter';
import { DEFAULT_SETTINGS, llmKey, loadSettings, saveSettings, type Settings } from './settings';
import type { SceneGraphJSON, Timeline } from './types';
import { formatTime } from './util';

const SAMPLE_SCRIPT = `Na Bahia, nos anos 1930, um vaqueiro caminhava pela estrada de terra do sertão.
O sol queimava a caatinga, e o mandacaru era a única sombra no caminho.
Ao entardecer, ele chegou à vila e contou aos amigos sobre a longa viagem.
Naquela noite, deitou na cama e dormiu, sonhando com a chuva que um dia voltaria.`;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado.`);
  return el as T;
};

const ui = {
  script: $<HTMLTextAreaElement>('script'),
  useSample: $<HTMLButtonElement>('use-sample'),
  audio: $<HTMLInputElement>('audio'),
  dropzone: $<HTMLLabelElement>('dropzone'),
  audioName: $('audio-name'),
  audioMeta: $('audio-meta'),
  generate: $<HTMLButtonElement>('generate'),
  status: $<HTMLOListElement>('status'),
  json: $<HTMLTextAreaElement>('json'),
  applyJson: $<HTMLButtonElement>('apply-json'),
  stage: $<HTMLCanvasElement>('stage'),
  stageEmpty: $('stage-empty'),
  play: $<HTMLButtonElement>('play'),
  seek: $<HTMLInputElement>('seek'),
  time: $('time'),
  captions: $<HTMLInputElement>('captions'),
  format: $<HTMLSelectElement>('format'),
  exportBtn: $<HTMLButtonElement>('export'),
  cancelExport: $<HTMLButtonElement>('cancel-export'),
  progress: $('progress'),
  progressBar: $('progress-bar'),
  modeBadge: $('mode-badge'),
  openSettings: $<HTMLButtonElement>('open-settings'),
  settings: $<HTMLDialogElement>('settings'),
  settingsForm: $<HTMLFormElement>('settings-form'),
  closeSettings: $<HTMLButtonElement>('close-settings'),
  clearKeys: $<HTMLButtonElement>('clear-keys'),
};

let settings: Settings = loadSettings();
let engine: SceneEngine | null = null;
let compositor: Compositor | null = null;

const player = new Audio();
player.preload = 'auto';

interface Project {
  file: File;
  buffer: AudioBuffer;
  timeline: Timeline;
  graph: SceneGraphJSON;
}

let audioFile: File | null = null;
let audioBuffer: AudioBuffer | null = null;
let audioUrl: string | null = null;
let project: Project | null = null;
let busy = false;
let exporting: AbortController | null = null;
/** pede um redesenho mesmo com o áudio pausado (seek, novo JSON, legenda) */
let dirty = false;

// ---------- status ----------

type StatusKind = 'info' | 'ok' | 'warn' | 'error';

function clearStatus(): void {
  ui.status.replaceChildren();
}

function addStatus(message: string, kind: StatusKind = 'info'): HTMLLIElement {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = message;
  ui.status.append(li);
  return li;
}

function updateBadge(): void {
  const stamps = settings.transcription === 'openai' && settings.openaiKey.trim() ? 'Whisper' : 'alinhador local';
  const scenes = settings.llmProvider !== 'none' && llmKey(settings) ? settings.llmProvider : 'regras';
  ui.modeBadge.textContent = `Tempos: ${stamps} · Cenas: ${scenes}`;
}

function refreshControls(): void {
  const ready = project !== null;
  const locked = busy || exporting !== null;
  ui.generate.disabled = locked;
  ui.play.disabled = !ready || locked;
  ui.seek.disabled = !ready || locked;
  ui.exportBtn.disabled = !ready || locked;
  ui.applyJson.disabled = !ready || locked;
  ui.cancelExport.hidden = exporting === null;
  ui.progress.hidden = exporting === null;
}

// ---------- motor e preview ----------

function ensureEngine(): Compositor {
  if (!compositor) {
    engine = new SceneEngine();
    compositor = new Compositor(engine, ui.stage);
    compositor.accent = settings.captionAccent;
    compositor.showCaptions = ui.captions.checked;
  }
  return compositor;
}

function updateTime(t: number): void {
  const duration = project?.buffer.duration ?? 0;
  ui.time.textContent = `${formatTime(t)} / ${formatTime(duration)}`;
}

function frame(): void {
  requestAnimationFrame(frame);
  // durante a exportação quem desenha é o exportador, no relógio dele
  if (!project || !compositor || exporting) return;
  const playing = !player.paused && !player.ended;
  if (!playing && !dirty) return;
  dirty = false;
  const t = Math.min(player.currentTime, project.buffer.duration);
  compositor.draw(t);
  if (playing) ui.seek.value = String(t);
  updateTime(t);
}

function setPlaying(playing: boolean): void {
  if (!project) return;
  if (playing) {
    if (player.ended || player.currentTime >= project.buffer.duration - 0.05) player.currentTime = 0;
    void player.play().catch(() => {
      addStatus('O navegador bloqueou a reprodução automática. Clique em tocar.', 'warn');
    });
  } else {
    player.pause();
  }
}

function syncPlayButton(): void {
  const playing = !player.paused && !player.ended;
  ui.play.textContent = playing ? '❚❚' : '▶';
  ui.play.setAttribute('aria-label', playing ? 'Pausar' : 'Tocar');
}

player.addEventListener('play', syncPlayButton);
player.addEventListener('pause', syncPlayButton);
player.addEventListener('ended', () => {
  syncPlayButton();
  dirty = true;
});

ui.play.addEventListener('click', () => setPlaying(player.paused || player.ended));

ui.seek.addEventListener('input', () => {
  player.currentTime = Number(ui.seek.value);
  dirty = true;
});

ui.captions.addEventListener('change', () => {
  if (compositor) compositor.showCaptions = ui.captions.checked;
  dirty = true;
});

document.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement;
  if (ev.code !== 'Space' || !project || exporting || busy) return;
  if (['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON'].includes(target.tagName) || ui.settings.open) return;
  ev.preventDefault();
  setPlaying(player.paused || player.ended);
});

// ---------- áudio ----------

async function loadAudio(file: File): Promise<void> {
  audioFile = file;
  audioBuffer = null;
  ui.audioName.textContent = file.name;
  ui.audioMeta.textContent = 'Lendo o áudio…';
  ui.dropzone.classList.remove('loaded');
  try {
    const buffer = await decodeAudioFile(file);
    if (audioFile !== file) return; // o usuário já trocou de arquivo
    audioBuffer = buffer;
    ui.audioMeta.textContent = `${formatTime(buffer.duration)} · ${(file.size / 1048576).toFixed(1)} MB`;
    ui.dropzone.classList.add('loaded');
  } catch (err) {
    if (audioFile !== file) return;
    audioFile = null;
    ui.audioName.textContent = 'Clique ou arraste o áudio';
    ui.audioMeta.textContent = (err as Error).message;
  }
}

ui.audio.addEventListener('change', () => {
  const file = ui.audio.files?.[0];
  if (file) void loadAudio(file);
});

for (const type of ['dragenter', 'dragover'] as const) {
  ui.dropzone.addEventListener(type, (ev) => {
    ev.preventDefault();
    ui.dropzone.classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop'] as const) {
  ui.dropzone.addEventListener(type, (ev) => {
    ev.preventDefault();
    ui.dropzone.classList.remove('dragging');
  });
}
ui.dropzone.addEventListener('drop', (ev) => {
  const file = ev.dataTransfer?.files?.[0];
  if (file) void loadAudio(file);
});

ui.useSample.addEventListener('click', () => {
  ui.script.value = SAMPLE_SCRIPT;
  ui.script.focus();
});

// ---------- geração ----------

function applyGraph(graph: SceneGraphJSON): void {
  if (!project) return;
  project.graph = graph;
  engine?.setSceneGraph(graph);
  ui.json.value = JSON.stringify(graph, null, 2);
  dirty = true;
}

async function generate(): Promise<void> {
  const script = ui.script.value.trim();
  clearStatus();
  if (!script) {
    addStatus('Cole o roteiro antes de gerar.', 'error');
    ui.script.focus();
    return;
  }
  if (!audioFile) {
    addStatus('Envie o áudio da narração antes de gerar.', 'error');
    return;
  }

  busy = true;
  player.pause();
  refreshControls();
  ui.generate.textContent = 'Gerando…';

  try {
    const file = audioFile;
    let step = addStatus('Lendo o áudio…');
    const buffer = audioBuffer ?? (await decodeAudioFile(file));
    audioBuffer = buffer;
    step.className = 'ok';
    step.textContent = `Áudio: ${formatTime(buffer.duration)} de duração.`;

    step = addStatus('Calculando os tempos de cada palavra…');
    const timed = await createTimeline(script, file, buffer, settings);
    if (timed.warning) addStatus(timed.warning, 'warn');
    const timeline = timed.timeline;
    if (timeline.words.length === 0) throw new Error('O roteiro não tem palavras para legendar.');
    step.className = 'ok';
    step.textContent = `Tempos: ${timeline.words.length} palavras em ${timeline.sentences.length} frases (${
      timeline.source === 'whisper' ? 'Whisper' : 'alinhador local'
    }).`;

    const slots = splitScenes(timeline);
    step = addStatus(`Dirigindo ${slots.length} cenas…`);
    const directed = await directScenes(script, slots, settings, (message) => {
      step.textContent = message;
    });
    if (directed.warning) addStatus(directed.warning, 'warn');
    const origin = { llm: `LLM (${settings.llmProvider})`, rules: 'gerador por regras', mixed: 'LLM + regras' }[directed.source];
    step.className = 'ok';
    step.textContent = `Cenas: ${directed.graph.scenes.length}, via ${origin}.`;

    const comp = ensureEngine();
    project = { file, buffer, timeline, graph: directed.graph };
    comp.setTimeline(timeline);
    applyGraph(directed.graph);

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    player.src = audioUrl;
    player.currentTime = 0;
    ui.seek.max = String(buffer.duration);
    ui.seek.value = '0';
    ui.stageEmpty.hidden = true;
    comp.draw(0);
    updateTime(0);
    addStatus('Pronto. O preview está tocando.', 'ok');
    busy = false;
    refreshControls();
    setPlaying(true);
  } catch (err) {
    addStatus((err as Error).message || 'Falha ao gerar o vídeo.', 'error');
  } finally {
    busy = false;
    ui.generate.textContent = 'Gerar vídeo';
    refreshControls();
  }
}

ui.generate.addEventListener('click', () => void generate());

ui.applyJson.addEventListener('click', () => {
  if (!project) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(ui.json.value);
  } catch (err) {
    addStatus(`JSON inválido: ${(err as Error).message}`, 'error');
    return;
  }
  const graph = sanitizeSceneGraph(parsed);
  if (graph.scenes.length === 0) {
    addStatus('O JSON precisa ter pelo menos uma cena em "scenes".', 'error');
    return;
  }
  applyGraph(graph);
  addStatus(`JSON aplicado: ${graph.scenes.length} cenas (valores fora do schema foram corrigidos).`, 'ok');
});

// ---------- exportação ----------

async function runExport(): Promise<void> {
  if (!project || !compositor || exporting) return;
  const format = ui.format.value as ExportFormat;
  if (!pickMimeType(format)) {
    addStatus('Este navegador não grava nesse formato. Escolha o formato automático.', 'error');
    return;
  }
  player.pause();
  const controller = new AbortController();
  exporting = controller;
  ui.progressBar.style.width = '0%';
  refreshControls();
  const step = addStatus('Exportando em tempo real… mantenha esta aba visível.');

  try {
    const result = await exportVideo(compositor, project.buffer, {
      format,
      signal: controller.signal,
      onProgress: (fraction) => {
        ui.progressBar.style.width = `${(fraction * 100).toFixed(1)}%`;
        step.textContent = `Exportando em tempo real… ${Math.round(fraction * 100)}%`;
      },
    });
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.href = url;
    link.download = `xilo-${stamp}.${result.extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    step.className = 'ok';
    step.textContent = `Vídeo exportado: ${link.download} (${(result.blob.size / 1048576).toFixed(1)} MB, 1080x1920).`;
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    step.className = aborted ? 'warn' : 'error';
    step.textContent = aborted ? 'Exportação cancelada.' : `Falha na exportação: ${(err as Error).message}`;
  } finally {
    exporting = null;
    dirty = true;
    refreshControls();
  }
}

ui.exportBtn.addEventListener('click', () => void runExport());
ui.cancelExport.addEventListener('click', () => exporting?.abort());

// ---------- configurações ----------

const SETTING_FIELDS = Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>;

function field(name: keyof Settings): HTMLInputElement | HTMLSelectElement {
  return ui.settingsForm.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
}

ui.openSettings.addEventListener('click', () => {
  for (const name of SETTING_FIELDS) field(name).value = settings[name];
  ui.settings.showModal();
});

ui.closeSettings.addEventListener('click', () => ui.settings.close());

ui.clearKeys.addEventListener('click', () => {
  for (const name of ['openaiKey', 'geminiKey', 'anthropicKey'] as const) field(name).value = '';
});

ui.settingsForm.addEventListener('submit', () => {
  const next = { ...settings } as Record<keyof Settings, string>;
  for (const name of SETTING_FIELDS) {
    const value = field(name).value.trim();
    // modelo em branco volta ao padrão; chave em branco fica em branco
    next[name] = value || (name.endsWith('Key') ? '' : DEFAULT_SETTINGS[name]);
  }
  settings = next as Settings;
  saveSettings(settings);
  if (compositor) compositor.accent = settings.captionAccent;
  dirty = true;
  updateBadge();
});

// ---------- início ----------

updateBadge();
refreshControls();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // gancho de depuração: permite inspecionar e desenhar frames pelo console
  Object.assign(window, {
    xilo: {
      get project() {
        return project;
      },
      draw: (t: number) => ensureEngine().draw(t),
    },
  });
}

void initSession();

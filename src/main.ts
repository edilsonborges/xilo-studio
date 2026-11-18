import './style.css';

import { createTimeline, decodeAudioFile } from './audio';
import { appendTake, HISTORY_LIMIT, openNarrationHistory, type NarrationTake } from './audio/history';
import { initNarrationPlayer } from './audio/player';
import { describeProgress, listVoices, narrate, type StudioQuality } from './audio/narration';
import { logEvent } from './auth/api';
import { initSession } from './auth/session';
import { initVersionModal } from './version';
import { aiImage, aiStatus } from './ai/client';
import { Compositor, type FrameSource } from './compositor/compositor';
import { directScenes } from './director';
import { splitScenes } from './director/splitter';
import { sanitizeSceneGraph } from './director/validate';
import { SceneEngine } from './engine/engine';
import { exportVideo, pickMimeType, type ExportFormat } from './export/exporter';
import { DEFAULT_SETTINGS, is3dStyle, llmKey, loadSettings, saveSettings, type Settings } from './settings';
import { RENDER_STYLES, STYLE_CATEGORIES, renderStyle } from './engine/styles';
import type { SceneGraphJSON, Timeline } from './types';
import { formatTime } from './util';
import { imagePrompt, storyboard, type IllustrationStyle } from './illustrated/director';
import { IllustratedEngine } from './illustrated/engine';
import { CAPTION_STYLES, captionStyle } from './compositor/captions';
import { captionPreview, textPreview, voicePreview } from './pickerpreviews';
import { bindPickerDialog, initStylePicker } from './stylepicker';
import { DEFAULT_SECONDS, MAX_SECONDS, MIN_SECONDS, estimateSeconds, formatDuration, improveScript, joinSuggestion, sampleStory, splitSuggestion } from './writer';


const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado.`);
  return el as T;
};

const ui = {
  script: $<HTMLTextAreaElement>('script'),
  useSample: $<HTMLButtonElement>('use-sample'),
  improve: $<HTMLButtonElement>('improve'),
  improveNote: $('improve-note'),
  suggestion: $('suggestion'),
  acceptSuggestion: $<HTMLButtonElement>('accept-suggestion'),
  discardSuggestion: $<HTMLButtonElement>('discard-suggestion'),
  duration: $<HTMLInputElement>('duration'),
  durationLabel: $('duration-label'),
  durationHint: $('duration-hint'),
  styleButton: $<HTMLButtonElement>('style-button'),
  captionStyle: $<HTMLSelectElement>('caption-style'),
  captionButton: $<HTMLButtonElement>('caption-button'),
  versionButton: $<HTMLButtonElement>('version-button'),
  voiceButton: $<HTMLButtonElement>('voice-button'),
  rateButton: $<HTMLButtonElement>('rate-button'),
  audio: $<HTMLInputElement>('audio'),
  dropzone: $<HTMLLabelElement>('dropzone'),
  audioName: $('audio-name'),
  audioMeta: $('audio-meta'),
  audioDownload: $<HTMLAnchorElement>('audio-download'),
  ttsVoice: $<HTMLSelectElement>('tts-voice'),
  ttsRate: $<HTMLSelectElement>('tts-rate'),
  ttsGenerate: $<HTMLButtonElement>('tts-generate'),
  version: $<HTMLSelectElement>('narration-version'),
  listen: $<HTMLAudioElement>('narration-player'),
  playback: $('narration-playback'),
  listenTitle: $('listen-title'),
  switchListen: $<HTMLButtonElement>('switch-listen'),
  replace: $<HTMLDialogElement>('replace-narration'),
  replaceMessage: $('replace-message'),
  skipWarning: $<HTMLInputElement>('skip-replace-warning'),
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
  videoStyle: $<HTMLSelectElement>('video-style'),
  styleHint: $('style-hint'),
  jsonDetails: $('json-details'),
  openSettings: $<HTMLButtonElement>('open-settings'),
  settings: $<HTMLDialogElement>('settings'),
  settingsForm: $<HTMLFormElement>('settings-form'),
  closeSettings: $<HTMLButtonElement>('close-settings'),
  clearKeys: $<HTMLButtonElement>('clear-keys'),
};

let settings: Settings = loadSettings();
let engine: SceneEngine | null = null;
let illustrated: IllustratedEngine | null = null;
let compositor: Compositor | null = null;

const player = new Audio();
player.preload = 'auto';

interface Project {
  file: File;
  buffer: AudioBuffer;
  timeline: Timeline;
  /** só no modo 3D; o modo ilustrado não tem SceneGraph */
  graph: SceneGraphJSON | null;
}

let audioFile: File | null = null;
let audioBuffer: AudioBuffer | null = null;
let audioUrl: string | null = null;
/** narração gerada no servidor, com tempos por palavra quando disponíveis */
let narrated: NarrationTake | null = null;
let takes: NarrationTake[] = [];
let history: Awaited<ReturnType<typeof openNarrationHistory>> | undefined;
let uploaded: File | null = null;
let loadingAudio = false;
let initializingAudio = true;
let downloadUrl: string | null = null;
let narrating = false;
let listeningToSample = true;
const voiceSamples = import.meta.glob('./assets/vozes/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** gerar de novo o mesmo roteiro pede outra versão: o número sobe a cada vez */
let lastDirected = '';
let variation = 0;
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
  const stamps = narrated?.words.length && narrated.file === audioFile
    ? 'Edge TTS'
    : settings.transcription === 'openai' && settings.openaiKey.trim() ? 'Whisper' : 'alinhador local';
  const director = settings.llmProvider === 'xilo' ? 'IA do Xilo' : settings.llmProvider;
  const scenes = !is3dStyle(settings.videoStyle)
    ? 'imagens por IA'
    : settings.llmProvider !== 'none' && llmKey(settings) ? `3D, ${director}` : '3D, regras';
  ui.modeBadge.textContent = `Tempos: ${stamps} · Cenas: ${scenes}`;
  ui.styleHint.textContent = is3dStyle(settings.videoStyle)
    ? `${renderStyle(settings.videoStyle.slice(3)).description} Cenas 3D montadas na hora; dá para trocar o visual sem gerar de novo.`
    : 'A IA desenha uma imagem para cada cena, no estilo escolhido. Cada imagem leva de alguns segundos a um ou dois minutos.';
}

function refreshControls(): void {
  const ready = project !== null;
  const locked = busy || exporting !== null;
  const audioLocked = locked || narrating || loadingAudio || initializingAudio;
  ui.generate.disabled = audioLocked;
  ui.ttsGenerate.disabled = audioLocked || !ui.ttsVoice.value;
  ui.ttsGenerate.textContent = narrating ? 'Gerando voz…' : takes.length ? 'Regenerar narração' : 'Gerar narração';
  ui.version.disabled = audioLocked;
  ui.versionButton.disabled = audioLocked || listeningToSample || ui.version.options.length < 2;
  ui.voiceButton.disabled = ui.ttsVoice.disabled = audioLocked || !ui.ttsVoice.value;
  ui.rateButton.disabled = ui.ttsRate.disabled = audioLocked;
  ui.captionButton.disabled = ui.captionStyle.disabled = exporting !== null || !ui.captions.checked;
  ui.captions.disabled = exporting !== null;
  ui.audio.disabled = audioLocked;
  ui.play.disabled = !ready || locked;
  ui.seek.disabled = !ready || locked;
  ui.exportBtn.disabled = !ready || audioLocked;
  ui.applyJson.disabled = !ready || locked;
  ui.cancelExport.hidden = exporting === null;
  ui.progress.hidden = exporting === null;
}

// ---------- motor e preview ----------

function ensureCompositor(source: FrameSource): Compositor {
  if (!compositor) {
    compositor = new Compositor(source, ui.stage);
    compositor.accent = settings.captionAccent;
    compositor.captionStyle = settings.captionStyle;
    compositor.showCaptions = ui.captions.checked;
  } else {
    compositor.setSource(source);
  }
  return compositor;
}

function ensureEngine(): Compositor {
  engine ??= new SceneEngine();
  const style = is3dStyle(settings.videoStyle) ? settings.videoStyle.slice(3) : 'xilogravura';
  if (engine.styleId !== style) engine.setStyle(renderStyle(style));
  return ensureCompositor(engine);
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
  refreshControls();
  dirty = true;
});

document.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement;
  if (ev.code !== 'Space' || !project || exporting || busy) return;
  if (['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON', 'AUDIO'].includes(target.tagName) || document.querySelector('dialog[open]')) return;
  ev.preventDefault();
  setPlaying(player.paused || player.ended);
});

// ---------- áudio ----------

function takeLabel(take: NarrationTake): string {
  const voice = take.voiceLabel.replace(/^VoiceStudio · /u, '');
  return `Versão ${take.number} · ${voice} · ${take.rate}× · ${formatTime(take.duration)}`;
}

function renderVersions(): void {
  const options = takes.slice().reverse().map(take => {
    const option = new Option(takeLabel(take), take.id);
    option.dataset.title = `Versão ${take.number}`;
    option.dataset.detail = `${take.voiceLabel} · ${take.rate}×`;
    option.dataset.duration = formatTime(take.duration);
    return option;
  });
  if (uploaded) options.push(new Option(`Áudio enviado · ${uploaded.name}`, 'upload'));
  ui.version.replaceChildren(...options);
  ui.version.value = narrated?.id ?? 'upload';
}

function showPlayback(sample: boolean): void {
  const voice = ui.ttsVoice.selectedOptions[0];
  const sampleUrl = voice && voiceSamples[`./assets/vozes/${voice.value}.mp3`];
  listeningToSample = Boolean(sampleUrl && (sample || !downloadUrl));
  const source = listeningToSample ? sampleUrl : downloadUrl;
  ui.playback.hidden = !source;
  refreshControls();
  ui.switchListen.hidden = !downloadUrl || !sampleUrl;
  ui.switchListen.textContent = listeningToSample ? 'Voltar à narração' : 'Ouvir amostra da voz';
  ui.audioDownload.hidden = listeningToSample || !narrated;
  if (!source) return;
  ui.listenTitle.textContent = listeningToSample
    ? `Amostra da voz · ${voice.dataset.title || voice.text}`
    : narrated ? `Sua narração · Versão ${narrated.number}` : `Seu áudio · ${audioFile?.name}`;
  if (ui.listen.getAttribute('src') !== source) {
    ui.listen.pause();
    ui.listen.src = source;
  }
  const rate = listeningToSample ? Number(ui.ttsRate.value) || 1 : 1;
  ui.listen.defaultPlaybackRate = rate;
  ui.listen.playbackRate = rate;
}

ui.switchListen.addEventListener('click', () => {
  showPlayback(!listeningToSample);
  if (listeningToSample) void ui.listen.play().catch(() => { /* Os controles permitem tentar de novo. */ });
});

function selectAudio(file: File, buffer: AudioBuffer, take: NarrationTake | null): void {
  if (project && project.file !== file) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    project = null;
    ui.stage.getContext('2d')?.clearRect(0, 0, ui.stage.width, ui.stage.height);
    ui.stageEmpty.hidden = false;
    ui.jsonDetails.hidden = true;
    ui.seek.value = '0';
    updateTime(0);
  }
  if (take && (!ui.script.value.trim() || ui.script.value.trim() === narrated?.script)) {
    ui.script.value = take.script;
    refreshScriptTools();
  }
  audioFile = file;
  audioBuffer = buffer;
  narrated = take;
  if (!take) uploaded = file;
  ui.listen.pause();
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(file);
  showPlayback(false);
  ui.audioDownload.href = downloadUrl;
  ui.audioDownload.download = take ? `v${take.number}-${file.name}` : file.name;
  ui.audioName.textContent = file.name;
  ui.audioMeta.textContent = `${formatTime(buffer.duration)} · ${(file.size / 1048576).toFixed(1)} MB`;
  ui.dropzone.classList.add('loaded');
  renderVersions();
  updateBadge();
  refreshControls();
}

async function loadAudio(file: File, take: NarrationTake | null = null): Promise<void> {
  loadingAudio = true;
  refreshControls();
  try {
    selectAudio(file, await decodeAudioFile(file), take);
  } catch (err) {
    renderVersions();
    addStatus((err as Error).message, 'error');
  } finally {
    loadingAudio = false;
    refreshControls();
  }
}

ui.version.addEventListener('change', () => {
  const take = takes.find(item => item.id === ui.version.value);
  if (take) void loadAudio(take.file, take);
  else if (uploaded) void loadAudio(uploaded);
});
ui.listen.addEventListener('play', () => player.pause());
player.addEventListener('play', () => ui.listen.pause());

ui.audio.addEventListener('change', () => {
  const file = ui.audio.files?.[0];
  if (file && !ui.audio.disabled) void loadAudio(file);
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
  if (file && !ui.audio.disabled) void loadAudio(file);
});

// ---------- narração no servidor ----------

async function setupVoices(): Promise<void> {
  ui.ttsRate.value = settings.ttsRate;
  if (!ui.ttsRate.value) ui.ttsRate.value = '1';
  refreshRatePicker();
  try {
    const { voices, defaultVoice, studio } = await listVoices();
    studioSlow = studio ?? null;
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const voice of voices) {
      const provider = voice.id.startsWith('voicestudio-') ? 'VoiceStudio' : 'Edge TTS';
      let group = groups.get(provider);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = provider;
        groups.set(provider, group);
      }
      const option = new Option(voice.label, voice.id);
      option.dataset.title = voice.label.replace(/^VoiceStudio · /u, '');
      group.append(option);
    }
    ui.ttsVoice.replaceChildren(...groups.values());
    // sem escolha salva (ou com uma voz que este servidor não tem), vale a inicial do servidor
    ui.ttsVoice.value = settings.ttsVoice;
    if (!ui.ttsVoice.value && defaultVoice) ui.ttsVoice.value = defaultVoice;
    if (!ui.ttsVoice.value && voices[0]) ui.ttsVoice.value = voices[0].id;
    refreshVoicePicker();
    buildStudioQualities();
    refreshStudioOptions();
    showPlayback(!downloadUrl);
  } catch {
    // Sem servidor (ex.: `npm run dev:web`): some a opção de gerar a voz.
    $('tts').hidden = true;
    ui.ttsGenerate.hidden = true;
  }
}

// ---------- VoiceStudio lento: qualidade e espera prevista ----------

/** Preenchido quando o VoiceStudio do servidor é o OmniVoice em CPU. */
let studioSlow: { voice: string; voices?: Record<string, number>; qualities: StudioQuality[] } | null = null;
let narrationAbort: AbortController | null = null;

/** Quanto a voz escolhida multiplica a espera (voz clonada custa mais); 0 se não é uma voz lenta. */
const slowdown = (): number => studioSlow ? studioSlow.voices?.[ui.ttsVoice.value] ?? (ui.ttsVoice.value === studioSlow.voice ? 1 : 0) : 0;
const usingSlowStudio = (): boolean => slowdown() > 0;
/** A qualidade escolhida, já com a espera da voz atual. */
const chosenQuality = (): StudioQuality | undefined => {
  const quality = studioSlow?.qualities.find((q) => q.id === settings.ttsQuality) ?? studioSlow?.qualities[0];
  return quality && { ...quality, ratio: quality.ratio * slowdown() };
};

function buildStudioQualities(): void {
  const box = $('studio-qualities');
  box.replaceChildren(...(studioSlow?.qualities ?? []).map((quality) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'studio-quality';
    button.setAttribute('role', 'radio');
    button.dataset.quality = quality.id;
    button.append(Object.assign(document.createElement('strong'), { textContent: quality.label }), document.createElement('small'));
    button.addEventListener('click', () => {
      settings = { ...settings, ttsQuality: quality.id };
      saveSettings(settings);
      refreshStudioOptions();
    });
    return button;
  }));
}

/** Mostra a escolha de qualidade só com a voz lenta, com a espera prevista para o roteiro atual. */
function refreshStudioOptions(): void {
  const show = usingSlowStudio();
  $('studio-options').hidden = !show;
  if (!show || !studioSlow) return;
  const text = (splitSuggestion(ui.script.value)?.original ?? ui.script.value).trim();
  const audio = text ? estimateSeconds(text) / (Number(ui.ttsRate.value) || 1) : targetSeconds();
  const current = chosenQuality();
  for (const button of $('studio-qualities').querySelectorAll<HTMLButtonElement>('.studio-quality')) {
    const quality = studioSlow.qualities.find((q) => q.id === button.dataset.quality)!;
    button.setAttribute('aria-checked', String(quality.id === current?.id));
    button.disabled = narrating;
    button.querySelector('small')!.textContent = `espera de cerca de ${formatDuration(audio * quality.ratio * slowdown())}`;
  }
  const why = slowdown() > 1
    ? 'Neste servidor o VoiceStudio roda sem placa de vídeo, e este estilo é uma voz clonada, a mais demorada.'
    : 'Neste servidor o VoiceStudio roda sem placa de vídeo e demora.';
  $('studio-note').textContent = text
    ? `${why} Para este roteiro (cerca de ${formatDuration(audio)} de áudio):`
    : `${why} Escolha a qualidade:`;
}

$('narration-cancel').addEventListener('click', () => narrationAbort?.abort());

for (const select of [ui.ttsVoice, ui.ttsRate]) {
  select.addEventListener('change', () => {
    refreshStudioOptions();
    settings = { ...settings, ttsVoice: ui.ttsVoice.value, ttsRate: ui.ttsRate.value };
    showPlayback(true);
    saveSettings(settings);
  });
}

async function authorizeReplacement(versions: NarrationTake[]): Promise<string | boolean | undefined> {
  if (versions.length < HISTORY_LIMIT) return undefined;
  if (settings.narrationReplacement === 'replace') return true;
  const oldest = versions[0];
  ui.replaceMessage.textContent = `Você já tem três narrações. A nova vai substituir a ${takeLabel(oldest)}.`;
  ui.skipWarning.checked = false;
  ui.replace.returnValue = 'cancel';
  const closed = new Promise<void>(resolve => ui.replace.addEventListener('close', () => resolve(), { once: true }));
  ui.replace.showModal();
  await closed;
  if (ui.replace.returnValue !== 'replace') return false;
  if (!ui.skipWarning.checked) return oldest.id;
  settings = { ...settings, narrationReplacement: 'replace' };
  saveSettings(settings);
  return true;
}

ui.ttsGenerate.addEventListener('click', async () => {
  const script = ui.script.value.trim();
  clearStatus();
  if (pendingSuggestion()) return;
  if (!script) {
    addStatus('Cole o roteiro antes de gerar a voz.', 'error');
    ui.script.focus();
    return;
  }
  narrating = true;
  refreshControls();
  const voice = ui.ttsVoice.value;
  const voiceLabel = ui.ttsVoice.selectedOptions[0].text;
  const rate = Number(ui.ttsRate.value) || 1;
  let step: HTMLLIElement | undefined;
  try {
    let replace = await authorizeReplacement(history ? await history.read() : takes);
    if (replace === false) return;
    step = addStatus('Gerando a narração…');
    const slow = usingSlowStudio();
    const quality = slow ? chosenQuality() : undefined;
    const progressBox = $('narration-progress');
    if (slow) {
      narrationAbort = new AbortController();
      $('narration-bar').style.width = '2%';
      $('narration-eta').textContent = `Enviando ao VoiceStudio… espera prevista de cerca de ${formatDuration((estimateSeconds(script) / rate) * (quality?.ratio ?? 11))}.`;
      progressBox.hidden = false;
      refreshStudioOptions();
    }
    const result = await narrate(script, voice, rate, slow ? {
      quality: quality?.id,
      signal: narrationAbort?.signal,
      onProgress: (progress) => {
        const view = describeProgress(progress, quality?.ratio ?? 11, formatDuration);
        $('narration-bar').style.width = `${(view.fraction * 100).toFixed(1)}%`;
        $('narration-eta').textContent = view.text;
      },
    } : {});
    const buffer = await decodeAudioFile(result.file);
    const input = { ...result, id: crypto.randomUUID(), script, voiceLabel, rate, duration: buffer.duration };
    for (;;) {
      const update = history ? await history.add(input, replace) : appendTake(takes, input, replace);
      if (update.added) {
        takes = update.takes;
        selectAudio(update.added.file, buffer, update.added);
        step.className = 'ok';
        step.textContent = `Versão ${update.added.number} selecionada para o vídeo.`;
        break;
      }
      // Outra aba preencheu o histórico enquanto o servidor gerava o áudio.
      replace = await authorizeReplacement(update.takes);
      if (replace === false) {
        step.textContent = 'Substituição cancelada.';
        break;
      }
    }
  } catch (err) {
    if (!step) step = addStatus('');
    const cancelled = (err as Error).name === 'AbortError';
    step.className = cancelled ? 'warn' : 'error';
    step.textContent = (err as Error).message;
  } finally {
    narrating = false;
    narrationAbort = null;
    $('narration-progress').hidden = true;
    refreshControls();
    refreshStudioOptions();
  }
});

async function restoreNarrations(): Promise<void> {
  const owner = await initSession();
  if (!owner) return;
  try {
    history = await openNarrationHistory(owner);
    takes = await history.read();
    const latest = takes.at(-1);
    if (latest) await loadAudio(latest.file, latest);
  } catch {
    history = undefined;
    addStatus('O histórico ficará disponível apenas nesta aba porque o armazenamento local está indisponível.', 'warn');
  }
}

// ---------- roteiro: exemplo, melhorar texto e duração ----------

const targetSeconds = (): number => {
  const value = Number(ui.duration.value);
  return Number.isFinite(value) ? Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, value)) : DEFAULT_SECONDS;
};

/** Com sugestão pendente na caixa, não dá para narrar nem gerar: avisa e devolve true. */
function pendingSuggestion(): boolean {
  if (!splitSuggestion(ui.script.value)) return false;
  addStatus('Aceite ou descarte a sugestão de texto antes de continuar.', 'error');
  ui.acceptSuggestion.focus();
  return true;
}

function showImproveNote(message: string): void {
  ui.improveNote.textContent = message;
  ui.improveNote.hidden = !message;
}

function refreshScriptTools(): void {
  const target = targetSeconds();
  ui.durationLabel.textContent = formatDuration(target);
  const parts = splitSuggestion(ui.script.value);
  ui.suggestion.hidden = !parts;
  const text = (parts?.original ?? ui.script.value).trim();
  if (!text) {
    ui.durationHint.textContent = ui.improveNote.hidden ? 'O exemplo e o "Melhorar texto" escrevem um roteiro deste tamanho.' : 'Escolha a duração desejada da narração.';
    ui.durationHint.classList.remove('warn');
    return;
  }
  const estimate = estimateSeconds(text);
  const off = Math.abs(estimate - target) > Math.max(5, target * 0.35);
  ui.durationHint.classList.toggle('warn', off);
  ui.durationHint.textContent = off
    ? `O seu texto dá cerca de ${formatDuration(estimate)} de narração, ${estimate > target ? 'mais' : 'menos'} que a duração escolhida.${ui.improveNote.hidden ? ' "Melhorar texto" ajusta o tamanho.' : ''}`
    : `O seu texto dá cerca de ${formatDuration(estimate)} de narração.`;
}

ui.duration.value = settings.videoDuration;
if (!ui.duration.value) ui.duration.value = String(DEFAULT_SECONDS);
ui.duration.addEventListener('input', () => {
  settings = { ...settings, videoDuration: String(targetSeconds()) };
  saveSettings(settings);
  refreshScriptTools();
});
ui.script.addEventListener('input', refreshScriptTools);
ui.script.addEventListener('input', () => refreshStudioOptions());

let sampleTurn = Math.floor(Math.random() * 12);
ui.useSample.addEventListener('click', async () => {
  if (ui.useSample.disabled) return;
  ui.useSample.disabled = true;
  ui.useSample.textContent = 'Escrevendo…';
  try {
    const ai = await aiStatus();
    const sample = await sampleStory(sampleTurn++, targetSeconds(), ai.text);
    ui.script.value = sample.script;
    clearStatus();
    addStatus(sample.source === 'ai'
      ? `Exemplo novo: ${sample.theme}. Clique de novo para outra história.`
      : 'Exemplo pronto (a IA não respondeu agora). Clique de novo para outro.', sample.source === 'ai' ? 'ok' : 'warn');
    logEvent('sample_story', 'ok', { tema: sample.theme, origem: sample.source === 'ai' ? 'IA do Xilo' : 'lista pronta', duração: formatDuration(targetSeconds()), roteiro: sample.script.slice(0, 1_500) });
  } finally {
    ui.useSample.disabled = false;
    ui.useSample.textContent = 'Usar exemplo';
    refreshScriptTools();
    ui.script.focus();
  }
});

ui.improve.addEventListener('click', async () => {
  if (ui.improve.disabled) return;
  // com sugestão pendente, melhora de novo a partir do texto original
  const original = (splitSuggestion(ui.script.value)?.original ?? ui.script.value).trim();
  clearStatus();
  if (!original) {
    showImproveNote('Escreva ou cole o roteiro antes de melhorar.');
    ui.script.focus();
    return;
  }
  ui.improve.disabled = true;
  ui.improve.textContent = 'Melhorando…';
  try {
    const improved = await improveScript(original, targetSeconds());
    showImproveNote('');
    ui.script.value = joinSuggestion(original, improved);
    addStatus('Sugestão pronta, abaixo da linha tracejada. Aceite, descarte ou peça outra.', 'ok');
    logEvent('script_improved', 'ok', { duração: formatDuration(targetSeconds()), roteiro: original.slice(0, 700), sugestão: improved.slice(0, 1_500) });
  } catch (err) {
    showImproveNote((err as Error).message);
  } finally {
    ui.improve.disabled = false;
    ui.improve.textContent = 'Melhorar texto';
    refreshScriptTools();
  }
});

ui.acceptSuggestion.addEventListener('click', () => {
  const parts = splitSuggestion(ui.script.value);
  if (parts) ui.script.value = parts.suggestion;
  clearStatus();
  refreshScriptTools();
  ui.script.focus();
});

ui.discardSuggestion.addEventListener('click', () => {
  const parts = splitSuggestion(ui.script.value);
  if (parts) ui.script.value = parts.original;
  clearStatus();
  refreshScriptTools();
  ui.script.focus();
});

void aiStatus().then(ai => {
  if (!ai.text && !ui.improve.disabled) {
    showImproveNote('Melhorar texto precisa da IA de texto, indisponível neste servidor.');
    refreshScriptTools();
  }
});
refreshScriptTools();

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
  if (pendingSuggestion()) return;
  if (!script) {
    addStatus('Cole o roteiro antes de gerar.', 'error');
    ui.script.focus();
    return;
  }
  if (!audioFile) {
    addStatus('Gere a voz do roteiro ou envie o áudio da narração antes de gerar o vídeo.', 'error');
    return;
  }

  busy = true;
  ui.listen.pause();
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
    const spoken = narrated && narrated.file === file ? narrated.words : undefined;
    const timed = await createTimeline(script, file, buffer, settings, spoken);
    if (timed.warning) addStatus(timed.warning, 'warn');
    const timeline = timed.timeline;
    if (timeline.words.length === 0) throw new Error('O roteiro não tem palavras para legendar.');
    step.className = 'ok';
    step.textContent = `Tempos: ${timeline.words.length} palavras em ${timeline.sentences.length} frases (${
      { whisper: 'Whisper', edge: 'Edge TTS, tempo exato', local: 'alinhador local' }[timeline.source]
    }).`;

    const slots = splitScenes(timeline);
    const ai = await aiStatus();
    if (!is3dStyle(settings.videoStyle)) {
      if (!ai.images) {
        addStatus('A IA de imagens não está disponível agora. Fiz o vídeo em 3D.', 'warn');
      } else if (await generateIllustrated(script, slots, file, buffer, timeline, settings.videoStyle as IllustrationStyle)) {
        return;
      }
    }

    step = addStatus(`Dirigindo ${slots.length} cenas…`);
    // sem a IA do servidor (ex.: só o Vite rodando), "IA do Xilo" vira regras
    const directorSettings = settings.llmProvider === 'xilo' && !ai.text ? { ...settings, llmProvider: 'none' as const } : settings;
    const directedKey = `${script}|${settings.videoStyle}`;
    variation = directedKey === lastDirected ? variation + 1 : 0;
    lastDirected = directedKey;
    const directed = await directScenes(script, slots, directorSettings, (message) => {
      step.textContent = message;
    }, variation);
    if (directed.warning) addStatus(directed.warning, 'warn');
    const llmName = directorSettings.llmProvider === 'xilo' ? 'IA do Xilo' : `LLM (${directorSettings.llmProvider})`;
    const origin = { llm: llmName, rules: 'gerador por regras', mixed: `${llmName} + regras` }[directed.source];
    step.className = 'ok';
    step.textContent = `Cenas: ${directed.graph.scenes.length}, via ${origin}${variation ? ` (variação ${variation + 1})` : ''}.`;
    if (directed.story?.setting) addStatus(`História: ${directed.story.setting}${directed.story.tone ? `, tom ${directed.story.tone}` : ''}; ${directed.story.cast.length} personagens.`, 'ok');

    const comp = ensureEngine();
    project = { file, buffer, timeline, graph: directed.graph };
    comp.setTimeline(timeline);
    applyGraph(directed.graph);
    ui.jsonDetails.hidden = false;
    showPreview(comp, file, buffer);
    logEvent('video_generated', 'ok', {
      roteiro: script.slice(0, 1_500),
      estilo: ui.videoStyle.selectedOptions[0]?.textContent ?? settings.videoStyle,
      cenas: directed.graph.scenes.length,
      variação: variation + 1,
      direção: origin,
      duração: `${buffer.duration.toFixed(1)} s`,
      áudio: narrated?.file === file ? 'voz gerada' : 'áudio enviado',
      ...(directed.warning ? { aviso: directed.warning.slice(0, 300) } : {}),
    });
    finishGeneration();
  } catch (err) {
    logEvent('generation_failed', 'fail', { roteiro: script.slice(0, 1_500), estilo: settings.videoStyle, erro: ((err as Error).message || 'falha').slice(0, 300) });
    addStatus((err as Error).message || 'Falha ao gerar o vídeo.', 'error');
  } finally {
    busy = false;
    ui.generate.textContent = 'Gerar vídeo';
    refreshControls();
  }
}

function showPreview(comp: Compositor, file: File, buffer: AudioBuffer): void {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(file);
  player.src = audioUrl;
  player.currentTime = 0;
  ui.seek.max = String(buffer.duration);
  ui.seek.value = '0';
  ui.stageEmpty.hidden = true;
  comp.draw(0);
  updateTime(0);
}

function finishGeneration(): void {
  addStatus('Pronto. O preview está tocando.', 'ok');
  busy = false;
  refreshControls();
  setPlaying(true);
}

/**
 * Modo ilustrado: a IA escreve uma descrição por cena e desenha uma imagem para
 * cada uma. Devolve false se nem a primeira imagem sair, para cair no 3D.
 */
async function generateIllustrated(
  script: string,
  slots: ReturnType<typeof splitScenes>,
  file: File,
  buffer: AudioBuffer,
  timeline: Timeline,
  style: IllustrationStyle,
): Promise<boolean> {
  let step = addStatus(`Escrevendo a descrição de ${slots.length} cenas…`);
  const board = await storyboard(script, slots, true);
  if (board.warning) addStatus(board.warning, 'warn');
  step.className = 'ok';
  step.textContent = `Cenas: ${board.scenes.length}, descritas ${board.source === 'ai' ? 'pela IA do Xilo' : 'pelo próprio roteiro'}.`;

  illustrated?.dispose();
  const source = new IllustratedEngine();
  illustrated = source;
  source.setScenes(board.scenes);
  const comp = ensureCompositor(source);
  project = { file, buffer, timeline, graph: null };
  comp.setTimeline(timeline);
  ui.jsonDetails.hidden = true;
  showPreview(comp, file, buffer);

  let drawn = 0;
  let failures = 0;
  for (const [i, scene] of board.scenes.entries()) {
    step = addStatus(`Desenhando a cena ${i + 1} de ${board.scenes.length}…`);
    try {
      const blob = await aiImage(imagePrompt(scene, style, board.characters));
      source.setImage(scene.id, await createImageBitmap(blob));
      drawn++;
      step.className = 'ok';
      step.textContent = `Cena ${i + 1} de ${board.scenes.length} desenhada.`;
      // mostra a cena recém-desenhada no preview
      player.currentTime = Math.min(scene.startTime + 0.7, buffer.duration);
      dirty = true;
    } catch (err) {
      if (drawn === 0 && i === 0) {
        step.className = 'warn';
        step.textContent = `A IA não conseguiu desenhar (${(err as Error).message}). Vou fazer o vídeo em 3D.`;
        illustrated = null;
        source.dispose();
        return false;
      }
      failures++;
      source.markFailed(scene.id);
      step.className = 'warn';
      step.textContent = `Cena ${i + 1}: ${(err as Error).message}`;
      dirty = true;
    }
  }
  if (failures) addStatus(`${failures} cena(s) ficaram sem imagem. Gere de novo para tentar outra vez.`, 'warn');
  player.currentTime = 0;
  logEvent('video_generated', failures ? 'fail' : 'ok', {
    roteiro: script.slice(0, 1_500),
    estilo: `${ui.videoStyle.selectedOptions[0]?.textContent ?? style} (ilustrado por IA)`,
    cenas: board.scenes.length,
    imagens: drawn,
    semImagem: failures,
    direção: board.source === 'ai' ? 'IA do Xilo' : 'texto do roteiro',
    duração: `${buffer.duration.toFixed(1)} s`,
  });
  finishGeneration();
  return true;
}

ui.generate.addEventListener('click', () => void generate());

// os visuais 3D, agrupados por categoria, depois dos estilos ilustrados
for (const category of STYLE_CATEGORIES) {
  const group = document.createElement('optgroup');
  group.label = `3D · ${category}`;
  for (const style of RENDER_STYLES.filter((s) => s.category === category)) {
    group.append(new Option(style.label, `3d-${style.id}`));
  }
  ui.videoStyle.append(group);
}
const refreshVoicePicker = initStylePicker(ui.ttsVoice, ui.voiceButton, { title: 'Voz da narração', preview: voicePreview });
const refreshRatePicker = initStylePicker(ui.ttsRate, ui.rateButton, {
  title: 'Velocidade da fala', preview: option => textPreview(`${option.value.replace('.', ',')}×`),
});
bindPickerDialog(ui.version, ui.versionButton, {
  title: 'Narração para o vídeo', preview: option => textPreview(option.dataset.duration ?? '♪'),
});
for (const style of CAPTION_STYLES) {
  const option = new Option(style.label, style.id);
  option.dataset.detail = style.description;
  ui.captionStyle.append(option);
}
ui.captionStyle.value = settings.captionStyle;
const refreshCaptionPicker = initStylePicker(ui.captionStyle, ui.captionButton, {
  title: 'Estilo da legenda', preview: option => captionPreview(option, settings.captionAccent),
});
ui.captionStyle.addEventListener('change', () => {
  settings = { ...settings, captionStyle: captionStyle(ui.captionStyle.value) };
  saveSettings(settings);
  if (compositor) compositor.captionStyle = settings.captionStyle;
  dirty = true;
});

ui.videoStyle.value = settings.videoStyle;
initStylePicker(ui.videoStyle, ui.styleButton);
ui.videoStyle.addEventListener('change', () => {
  settings = { ...settings, videoStyle: ui.videoStyle.value as Settings['videoStyle'] };
  saveSettings(settings);
  updateBadge();
  // vídeo 3D já gerado: aplica o visual novo na hora, sem gerar de novo
  if (project?.graph && engine && is3dStyle(settings.videoStyle)) {
    ensureEngine();
    dirty = true;
  }
});

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
  ui.listen.pause();
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
    logEvent('video_exported', 'ok', {
      arquivo: link.download,
      tamanho: `${(result.blob.size / 1048576).toFixed(1)} MB`,
      duração: `${project.buffer.duration.toFixed(1)} s`,
      estilo: ui.videoStyle.selectedOptions[0]?.textContent ?? settings.videoStyle,
    });
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    step.className = aborted ? 'warn' : 'error';
    step.textContent = aborted ? 'Exportação cancelada.' : `Falha na exportação: ${(err as Error).message}`;
    logEvent('export_failed', 'fail', { erro: aborted ? 'cancelada' : (err as Error).message.slice(0, 300) });
  } finally {
    exporting = null;
    dirty = true;
    refreshControls();
  }
}

ui.exportBtn.addEventListener('click', () => void runExport());
ui.cancelExport.addEventListener('click', () => exporting?.abort());

// ---------- configurações ----------

// Só o que existe no formulário: voz, velocidade e estilo ficam na tela principal.
const SETTING_FIELDS = (Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>).filter(
  (name) => ui.settingsForm.elements.namedItem(name) !== null,
);

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
  refreshCaptionPicker();
  dirty = true;
  updateBadge();
});

// ---------- início ----------

initNarrationPlayer(ui.listen);
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

void Promise.all([restoreNarrations(), setupVoices()]).finally(() => {
  initializingAudio = false;
  refreshControls();
});
initVersionModal();

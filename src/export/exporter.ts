// Módulo 5: exportação. Grava o stream do Canvas Master junto com a trilha de
// áudio original, usando o relógio do AudioContext como referência de tempo.

import type { Compositor } from '../compositor/compositor';

export type ExportFormat = 'auto' | 'mp4' | 'webm';

export interface ExportOptions {
  format: ExportFormat;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
}

const MP4_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
];
const WEBM_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType(format: ExportFormat): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const order =
    format === 'mp4' ? MP4_TYPES : format === 'webm' ? WEBM_TYPES : [...MP4_TYPES, ...WEBM_TYPES];
  return order.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

const LEAD_IN = 0.1;
const TAIL = 0.15;

export async function exportVideo(
  compositor: Compositor,
  audio: AudioBuffer,
  options: ExportOptions,
): Promise<ExportResult> {
  const mimeType = pickMimeType(options.format);
  if (!mimeType) {
    throw new Error(
      options.format === 'auto'
        ? 'Este navegador não suporta gravação com MediaRecorder.'
        : `Este navegador não grava em ${options.format.toUpperCase()}. Tente o formato automático.`,
    );
  }
  const duration = audio.duration;
  const canvasStream = compositor.canvas.captureStream(options.fps ?? 30);
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = audio;
  source.connect(destination);

  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };

  let raf = 0;
  // aba em segundo plano congela o requestAnimationFrame: pausa áudio e
  // gravação juntos para o vídeo não ficar parado enquanto o som anda
  const onVisibility = (): void => {
    if (recorder.state === 'inactive') return;
    if (document.hidden) {
      if (recorder.state === 'recording') recorder.pause();
      void audioCtx.suspend();
    } else {
      void audioCtx.resume().then(() => {
        if (recorder.state === 'paused') recorder.resume();
      });
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const cleanup = (): void => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    try {
      source.stop();
    } catch {
      // a fonte pode nem ter começado
    }
    stream.getTracks().forEach((track) => track.stop());
    void audioCtx.close();
  };

  try {
    return await new Promise<ExportResult>((resolve, reject) => {
      const abort = (): void => {
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new DOMException('Exportação cancelada.', 'AbortError'));
      };
      if (options.signal?.aborted) return abort();
      options.signal?.addEventListener('abort', abort, { once: true });

      recorder.onerror = () => reject(new Error('O MediaRecorder falhou durante a gravação.'));
      recorder.onstop = () => {
        if (options.signal?.aborted) return;
        const type = mimeType.split(';')[0];
        resolve({
          blob: new Blob(chunks, { type }),
          mimeType,
          extension: type === 'video/mp4' ? 'mp4' : 'webm',
        });
      };

      compositor.draw(0);
      void audioCtx.resume().then(() => {
        if (options.signal?.aborted) return;
        recorder.start(1000);
        const startAt = audioCtx.currentTime + LEAD_IN;
        source.start(startAt);

        const tick = (): void => {
          // o frame desenhado é sempre o do relógio de áudio: sem deriva
          const t = audioCtx.currentTime - startAt;
          compositor.draw(Math.min(Math.max(t, 0), duration));
          options.onProgress?.(Math.min(1, Math.max(0, t / duration)));
          if (t >= duration + TAIL) {
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
    });
  } finally {
    cleanup();
  }
}

// O elemento de áudio continua responsável pelo tempo, pelo volume e pela reprodução.
export function initNarrationPlayer(audio: HTMLAudioElement): void {
  const controls = document.getElementById('listen-controls')!;
  const play = controls.querySelector<HTMLButtonElement>('#listen-play')!;
  const seek = controls.querySelector<HTMLInputElement>('#listen-seek')!;
  const time = controls.querySelector<HTMLElement>('#listen-time')!;
  const mute = controls.querySelector<HTMLButtonElement>('#listen-mute')!;
  const volume = controls.querySelector<HTMLInputElement>('#listen-volume')!;

  const clock = (seconds: number) => {
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };

  function syncPosition(): void {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const position = Math.min(audio.currentTime, duration);
    seek.disabled = !duration;
    seek.max = String(duration);
    seek.value = String(position);
    seek.setAttribute('aria-valuetext', `${clock(position)} de ${clock(duration)}`);
    time.textContent = `${clock(position)} / ${clock(duration)}`;
  }

  function syncPlay(): void {
    const playing = !audio.paused && !audio.ended;
    play.firstElementChild!.textContent = playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', playing ? 'Pausar áudio' : 'Reproduzir áudio');
    play.title = play.getAttribute('aria-label')!;
  }

  function syncVolume(): void {
    const silent = audio.muted || audio.volume === 0;
    mute.setAttribute('aria-pressed', String(silent));
    mute.title = silent ? 'Ativar som' : 'Silenciar áudio';
    volume.value = String(audio.muted ? 0 : audio.volume);
    volume.setAttribute('aria-valuetext', `${Math.round(Number(volume.value) * 100)}%`);
  }

  function useNativeControls(): void {
    controls.hidden = true;
    audio.controls = true;
  }

  play.addEventListener('click', () => {
    if (audio.paused) void audio.play().catch(error => {
      if (error.name !== 'AbortError') useNativeControls();
    });
    else audio.pause();
  });
  seek.addEventListener('input', () => {
    audio.currentTime = Number(seek.value);
    syncPosition();
  });
  mute.addEventListener('click', () => {
    if (audio.volume === 0) {
      audio.volume = 1;
      audio.muted = false;
    } else audio.muted = !audio.muted;
  });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
    audio.muted = false;
  });

  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'emptied', 'seeked']) {
    audio.addEventListener(event, syncPosition);
  }
  for (const event of ['play', 'pause', 'ended', 'emptied']) audio.addEventListener(event, syncPlay);
  audio.addEventListener('volumechange', syncVolume);
  audio.addEventListener('error', useNativeControls);
  audio.addEventListener('loadedmetadata', () => {
    audio.controls = false;
    controls.hidden = false;
  });
  syncPosition();
  syncPlay();
  syncVolume();
  audio.controls = false;
  controls.hidden = false;
}

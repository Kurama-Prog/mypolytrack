import type { AudioStore } from '../audio/settings';
import { element, qs } from './dom';

const MUTE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 9.4h3.2L12 5.4v13.2L7.2 14.6H4z" />
    <path class="audio-waves" d="M15.6 8.7a4.5 4.5 0 0 1 0 6.6M18.2 6.1a8 8 0 0 1 0 11.8" />
    <path class="audio-slash" d="M15 9l6 6M21 9l-6 6" />
  </svg>
`;

/** Small speaker toggle reused by the HUD and the volume panels. */
export class AudioMuteButton {
  readonly root: HTMLButtonElement;
  private readonly unsubscribe: () => void;

  constructor(store: AudioStore, className = 'audio-mute') {
    this.root = document.createElement('button');
    this.root.type = 'button';
    this.root.className = className;
    this.root.innerHTML = MUTE_ICON;

    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      store.toggleMute();
      this.root.blur();
    };
    this.root.addEventListener('click', onClick);

    this.unsubscribe = store.subscribe((params) => {
      this.root.classList.toggle('is-muted', params.muted);
      this.root.setAttribute('aria-label', params.muted ? 'Unmute audio' : 'Mute audio');
      this.root.setAttribute('aria-pressed', String(params.muted));
      this.root.title = params.muted ? 'Unmute (M)' : 'Mute (M)';
    });
  }

  dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }
}

/**
 * Music + SFX sliders with a mute toggle. Used in the settings modal, the pause
 * menu and (compact) inside the HUD.
 */
export class AudioPanel {
  readonly root: HTMLElement;
  private readonly music: HTMLInputElement;
  private readonly sfx: HTMLInputElement;
  private readonly musicValue: HTMLElement;
  private readonly sfxValue: HTMLElement;
  private readonly mute: AudioMuteButton;
  private readonly unsubscribe: () => void;

  constructor(private readonly store: AudioStore, options: { compact?: boolean } = {}) {
    this.root = element('div', `audio-panel${options.compact ? ' is-compact' : ''}`);
    this.root.innerHTML = `
      <div class="audio-panel-head">
        <span class="tune-title"><i></i>AUDIO</span>
        <span data-mute-host></span>
      </div>
      <div class="audio-panel-body">
        <label class="tune-row">
          <span class="tune-row-head">
            <span class="tune-name">MUSIC</span>
            <span class="tune-val is-music" data-music-value>55%</span>
          </span>
          <input type="range" min="0" max="1" step="0.05" value="0.55" data-music aria-label="Music volume" />
          <span class="tune-scale"><i>0%</i><i>100%</i></span>
        </label>
        <label class="tune-row">
          <span class="tune-row-head">
            <span class="tune-name">SOUND FX</span>
            <span class="tune-val is-sfx" data-sfx-value>80%</span>
          </span>
          <input type="range" min="0" max="1" step="0.05" value="0.8" data-sfx aria-label="Sound effect volume" />
          <span class="tune-scale"><i>0%</i><i>100%</i></span>
        </label>
        <p class="tune-hint">Press M to mute · saved on this device</p>
      </div>
    `;

    this.music = qs<HTMLInputElement>('[data-music]', this.root);
    this.sfx = qs<HTMLInputElement>('[data-sfx]', this.root);
    this.musicValue = qs('[data-music-value]', this.root);
    this.sfxValue = qs('[data-sfx-value]', this.root);

    this.music.style.setProperty('--fill-color', '#2ec4ff');
    this.sfx.style.setProperty('--fill-color', '#ffc93c');

    this.music.addEventListener('input', () => this.store.set({ music: Number(this.music.value) }));
    this.sfx.addEventListener('input', () => this.store.set({ sfx: Number(this.sfx.value) }));
    for (const input of [this.music, this.sfx]) {
      input.addEventListener('pointerup', () => input.blur());
    }

    this.mute = new AudioMuteButton(store);
    qs('[data-mute-host]', this.root).appendChild(this.mute.root);

    this.unsubscribe = store.subscribe((params) => {
      this.music.value = params.music.toFixed(2);
      this.sfx.value = params.sfx.toFixed(2);
      this.musicValue.textContent = `${Math.round(params.music * 100)}%`;
      this.sfxValue.textContent = `${Math.round(params.sfx * 100)}%`;
      this.music.style.setProperty('--fill', `${params.music * 100}%`);
      this.sfx.style.setProperty('--fill', `${params.sfx * 100}%`);
      this.root.classList.toggle('is-muted', params.muted);
    });
  }

  dispose(): void {
    this.unsubscribe();
    this.mute.dispose();
    this.root.remove();
  }
}

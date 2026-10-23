import type { TuningStore } from '../physics/tuning';
import type { AudioStore } from '../audio/settings';
import { AudioMuteButton } from './audio-panel';
import { element, formatSpeed, formatTime, qs } from './dom';
import { TuningPanel } from './tuning';

const TICKS = 22;

export class Hud {
  readonly root: HTMLElement;
  readonly tuningPanel: TuningPanel;

  private readonly timeEl: HTMLElement;
  private readonly bestEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly boostEl: HTMLElement;
  private readonly fillEl: HTMLElement;
  private readonly cpEl: HTMLElement;
  private readonly trackEl: HTMLElement;
  private readonly centerEl: HTMLElement;
  private readonly ticks: HTMLElement[];

  private lastTime = '';
  private lastBest = '';
  private lastSpeed = '';
  private lastCp = '';
  private countdownToken = 0;
  private toastNode: HTMLElement | null = null;
  private toastToken = 0;

  constructor(parent: HTMLElement, tuning: TuningStore, audio: AudioStore, trackName: string) {
    this.root = element('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-panel hud-time-panel">
          <span class="hud-label">TIME</span>
          <div class="hud-time" data-time>00:00.000</div>
          <div class="hud-sub"><span data-best>BEST --:--.---</span></div>
        </div>
      </div>
      <div class="hud-progress">
        <div class="hud-progress-meta"><span data-track>${trackName}</span><span data-cp>CP 0/0</span></div>
        <div class="hud-progress-track"><div class="hud-progress-fill" data-fill></div></div>
      </div>
      <div class="hud-tr">
        <div class="hud-audio" data-audio></div>
        <div data-tuning></div>
      </div>
      <div class="hud-br">
        <div class="speed-boost" data-boost>BOOST</div>
        <div class="speed-ticks" data-ticks>${'<i></i>'.repeat(TICKS)}</div>
        <div class="speed-value"><b data-speed>0</b><span>KM/H</span></div>
      </div>
      <div class="hud-center" data-center></div>
    `;
    parent.appendChild(this.root);

    this.timeEl = qs('[data-time]', this.root);
    this.bestEl = qs('[data-best]', this.root);
    this.speedEl = qs('[data-speed]', this.root);
    this.boostEl = qs('[data-boost]', this.root);
    this.fillEl = qs('[data-fill]', this.root);
    this.cpEl = qs('[data-cp]', this.root);
    this.trackEl = qs('[data-track]', this.root);
    this.centerEl = qs('[data-center]', this.root);
    this.ticks = Array.from(this.root.querySelectorAll<HTMLElement>('[data-ticks] i'));

    this.tuningPanel = new TuningPanel(tuning, {
      collapsible: true,
      hint: 'Live tuning — changes apply instantly'
    });
    qs('[data-tuning]', this.root).appendChild(this.tuningPanel.root);

    const mute = new AudioMuteButton(audio, 'audio-mute hud-mute');
    qs('[data-audio]', this.root).appendChild(mute.root);
  }

  show() {
    this.root.classList.add('is-live');
  }

  hide() {
    this.root.classList.remove('is-live');
    this.clearCenter();
  }

  setTrackName(name: string) {
    this.trackEl.textContent = name;
  }

  setTime(ms: number) {
    const text = formatTime(ms);
    if (text !== this.lastTime) {
      this.timeEl.textContent = text;
      this.lastTime = text;
    }
  }

  setBest(ms: number | null) {
    const text = ms === null ? 'BEST —' : `BEST ${formatTime(ms)}`;
    if (text !== this.lastBest) {
      this.bestEl.textContent = text;
      this.lastBest = text;
    }
  }

  setSpeed(speed: number) {
    const kmh = formatSpeed(speed);
    if (kmh !== this.lastSpeed) {
      this.speedEl.textContent = kmh;
      this.lastSpeed = kmh;
    }
    const ratio = Math.min(1, (speed * 3.6) / 230);
    const lit = Math.round(ratio * TICKS);
    for (let i = 0; i < TICKS; i++) {
      const tick = this.ticks[i];
      tick.classList.toggle('on', i < lit);
      tick.classList.toggle('hot', i < lit && i > TICKS * 0.6);
      tick.classList.toggle('max', i < lit && i > TICKS * 0.85);
    }
  }

  setBoost(active: boolean) {
    this.boostEl.classList.toggle('is-on', active);
  }

  setProgress(fraction: number, checkpoint: number, total: number) {
    this.fillEl.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
    const text = `CP ${checkpoint}/${total}`;
    if (text !== this.lastCp) {
      this.cpEl.textContent = text;
      this.lastCp = text;
    }
  }

  showCountdown(value: number | 'go') {
    const token = ++this.countdownToken;
    this.centerEl.innerHTML = `<div class="countdown${value === 'go' ? ' is-go' : ''}">${
      value === 'go' ? 'GO' : value
    }</div>`;
    window.setTimeout(
      () => {
        if (this.countdownToken === token) this.centerEl.innerHTML = '';
      },
      value === 'go' ? 950 : 900
    );
  }

  toast(text: string, tone: 'good' | 'bad' | 'plain' = 'plain') {
    if (this.toastNode) this.toastNode.remove();
    const token = ++this.toastToken;
    const node = element(
      'div',
      `toast${tone === 'good' ? ' is-good' : tone === 'bad' ? ' is-bad' : ''}`,
      text
    );
    this.centerEl.appendChild(node);
    this.toastNode = node;
    window.setTimeout(() => {
      if (this.toastToken === token && node.parentElement) node.remove();
    }, 1500);
  }

  clearCenter() {
    this.countdownToken++;
    this.centerEl.innerHTML = '';
  }
}

import type { TuningStore } from '../physics/tuning';
import type { AudioStore } from '../audio/settings';
import type { ScoreEntry } from '../storage/storage';
import type { Difficulty } from '../track/types';
import { AudioPanel } from './audio-panel';
import { escapeHtml, formatTime, qs } from './dom';
import { TuningPanel } from './tuning';

function screen(className: string): HTMLElement {
  const node = document.createElement('div');
  node.className = `screen ${className} is-hidden`;
  return node;
}

/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */

export class SettingsScreen {
  readonly root: HTMLElement;
  private readonly panel: TuningPanel;

  constructor(
    parent: HTMLElement,
    tuning: TuningStore,
    audio: AudioStore,
    handlers: { onClose: () => void; onClear: () => void }
  ) {
    this.root = screen('screen--modal');
    this.root.innerHTML = `
      <div class="modal-card modal-card--settings">
        <button class="modal-close" type="button" data-close aria-label="Close settings">×</button>
        <span class="eyebrow"><i></i>SETTINGS</span>
        <h2>DRIVE <em>SETUP</em></h2>
        <p class="modal-sub">
          Tune the car to the way you drive. Acceleration and brake force are
          applied instantly to the physics model and saved on this device.
        </p>
        <div class="modal-grid">
          <div class="modal-section">
            <div data-tune></div>
          </div>
          <div class="settings-col">
            <div class="modal-section">
              <div data-audio></div>
              <p class="modal-sub">
                Engine, brakes and the circuit soundtrack. Press <kbd>M</kbd> at any time to mute.
              </p>
            </div>
            <div class="modal-section">
              <div class="modal-section-head"><h3>LOCAL DATA</h3></div>
              <p class="modal-sub">
                Best runs and ghost replays live in this browser only — nothing is uploaded.
              </p>
              <div class="modal-actions">
                <button class="btn btn--danger" type="button" data-clear>
                  CLEAR ALL TIMES &amp; GHOSTS
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn--primary" type="button" data-done>DONE</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.panel = new TuningPanel(tuning, { inline: true });
    qs('[data-tune]', this.root).appendChild(this.panel.root);
    qs('[data-audio]', this.root).appendChild(new AudioPanel(audio, { compact: true }).root);

    qs<HTMLButtonElement>('[data-close]', this.root).addEventListener('click', handlers.onClose);
    qs<HTMLButtonElement>('[data-done]', this.root).addEventListener('click', handlers.onClose);
    qs<HTMLButtonElement>('[data-clear]', this.root).addEventListener('click', () => {
      handlers.onClear();
      const button = qs<HTMLButtonElement>('[data-clear]', this.root);
      button.textContent = 'LOCAL DATA CLEARED';
      window.setTimeout(() => {
        button.textContent = 'CLEAR ALL TIMES & GHOSTS';
      }, 1800);
    });
  }

  open() {
    this.root.classList.remove('is-hidden');
  }

  close() {
    this.root.classList.add('is-hidden');
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }
}

/* --------------------------------------------------------------------------
   Pause
   -------------------------------------------------------------------------- */

export class PauseScreen {
  readonly root: HTMLElement;
  private readonly panel: TuningPanel;

  constructor(
    parent: HTMLElement,
    tuning: TuningStore,
    audio: AudioStore,
    handlers: { onResume: () => void; onRestart: () => void; onQuit: () => void }
  ) {
    this.root = screen('screen--modal');
    this.root.innerHTML = `
      <div class="modal-card modal-card--pause">
        <span class="eyebrow"><i></i>PAUSED</span>
        <h2>HOLD YOUR <em>LINE.</em></h2>
        <p class="modal-sub">The clock is stopped. Re-tune the car or get straight back on track.</p>
        <div class="pause-stats">
          <div><span>TIME</span><b data-time>00:00.000</b></div>
          <div><span>CHECKPOINT</span><b data-cp>0/0</b></div>
          <div><span>RESPAWNS</span><b data-respawns>0</b></div>
        </div>
        <div class="modal-grid">
          <div class="modal-section">
            <div class="modal-section-head"><h3>LIVE TUNING</h3></div>
            <div data-tune></div>
          </div>
          <div class="modal-section">
            <div data-audio></div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn--primary" type="button" data-resume>RESUME</button>
          <button class="btn" type="button" data-restart>RESTART <kbd>R</kbd></button>
          <button class="btn btn--ghost" type="button" data-quit>QUIT TO MENU</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.panel = new TuningPanel(tuning, { inline: true });
    qs('[data-tune]', this.root).appendChild(this.panel.root);
    qs('[data-audio]', this.root).appendChild(new AudioPanel(audio, { compact: true }).root);

    qs<HTMLButtonElement>('[data-resume]', this.root).addEventListener('click', handlers.onResume);
    qs<HTMLButtonElement>('[data-restart]', this.root).addEventListener('click', handlers.onRestart);
    qs<HTMLButtonElement>('[data-quit]', this.root).addEventListener('click', handlers.onQuit);
  }

  open(stats: { time: number; checkpoint: number; total: number; respawns: number }) {
    qs('[data-time]', this.root).textContent = formatTime(stats.time);
    qs('[data-cp]', this.root).textContent = `${stats.checkpoint}/${stats.total}`;
    qs('[data-respawns]', this.root).textContent = String(stats.respawns);
    this.root.classList.remove('is-hidden');
  }

  close() {
    this.root.classList.add('is-hidden');
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }
}

/* --------------------------------------------------------------------------
   Results
   -------------------------------------------------------------------------- */

export interface ResultsData {
  trackName: string;
  difficulty: Difficulty;
  time: number;
  splits: number[];
  list: ScoreEntry[];
  rank: number;
  isBest: boolean;
}

export class ResultsScreen {
  readonly root: HTMLElement;

  constructor(
    parent: HTMLElement,
    handlers: { onRetry: () => void; onNext: () => void; onMenu: () => void }
  ) {
    this.root = screen('screen--results');
    this.root.innerHTML = `
      <div class="results-card">
        <div class="results-head">
          <div>
            <span class="eyebrow"><i></i>RUN COMPLETE</span>
            <h2 class="results-track" data-track>SUNSET VALLEY</h2>
            <div class="results-diff" data-diff></div>
          </div>
          <div class="res-time-wrap">
            <div class="res-time" data-time>00:00.000</div>
            <span class="res-badge" data-badge>NEW BEST!</span>
          </div>
        </div>
        <div class="results-body">
          <div>
            <div class="splits-head">
              <h3>SPLITS</h3>
              <span data-split-count></span>
            </div>
            <div data-splits></div>
          </div>
          <div>
            <div class="board-head">
              <h3>LOCAL TOP 5</h3>
              <span>THIS DEVICE</span>
            </div>
            <ul class="board-list" data-board></ul>
          </div>
        </div>
        <div class="results-actions">
          <button class="btn btn--primary" type="button" data-retry>RETRY <kbd>R</kbd></button>
          <button class="btn" type="button" data-next>NEXT CIRCUIT</button>
          <button class="btn btn--ghost" type="button" data-menu>MENU</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    qs<HTMLButtonElement>('[data-retry]', this.root).addEventListener('click', handlers.onRetry);
    qs<HTMLButtonElement>('[data-next]', this.root).addEventListener('click', handlers.onNext);
    qs<HTMLButtonElement>('[data-menu]', this.root).addEventListener('click', handlers.onMenu);
  }

  open(data: ResultsData) {
    qs('[data-track]', this.root).textContent = data.trackName;
    qs('[data-time]', this.root).textContent = formatTime(data.time);
    qs('[data-diff]', this.root).innerHTML =
      `<span class="diff diff--${data.difficulty.toLowerCase()}">${data.difficulty.toUpperCase()}</span>`;

    const badge = qs('[data-badge]', this.root);
    badge.classList.toggle('is-on', data.isBest);

    // Segment times between checkpoints
    const segments: number[] = [];
    let previous = 0;
    for (const split of data.splits) {
      segments.push(split - previous);
      previous = split;
    }
    if (data.splits.length > 0) segments.push(data.time - previous);

    const maxSegment = Math.max(1, ...segments);
    const minSegment = segments.length > 1 ? Math.min(...segments) : -1;
    const splitsHost = qs('[data-splits]', this.root);
    splitsHost.innerHTML = segments
      .map((segment, index) => {
        const width = Math.max(6, (segment / maxSegment) * 100);
        const best = segment === minSegment ? ' is-best' : '';
        const label = index < data.splits.length ? `CP ${index + 1}` : 'FINISH';
        return `
          <div class="split-row${best}">
            <span>${label}</span>
            <div class="split-bar"><i style="width:${width.toFixed(1)}%"></i></div>
            <b>${formatTime(segment)}</b>
          </div>
        `;
      })
      .join('');
    qs('[data-split-count]', this.root).textContent = `${segments.length} SECTORS`;

    const board = qs('[data-board]', this.root);
    if (data.list.length === 0) {
      board.innerHTML = '<li class="board-empty">No runs recorded yet.</li>';
    } else {
      board.innerHTML = data.list
        .map((entry, index) => {
          const isNew = index === data.rank;
          return `
            <li class="${index === 0 ? 'is-top' : ''}${isNew ? ' is-new' : ''}">
              <span class="rank">${String(index + 1).padStart(2, '0')}</span>
              <b>${formatTime(entry.time)}</b>
              <span class="date">${escapeHtml(entry.date)}</span>
            </li>
          `;
        })
        .join('');
    }

    this.root.classList.remove('is-hidden');
    this.root.scrollTop = 0;
  }

  close() {
    this.root.classList.add('is-hidden');
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }
}

import { TRACKS } from '../track';
import { buildCenterline } from '../track/builder';
import type { TrackDef } from '../track/types';
import type { TuningStore } from '../physics/tuning';
import { element, formatTime, qsa } from './dom';

interface ThumbInfo {
  length: number;
}

function drawThumbnail(canvas: HTMLCanvasElement, def: TrackDef): ThumbInfo {
  const W = 640;
  const H = 368;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { length: 0 };

  ctx.clearRect(0, 0, W, H);

  // Sky wash
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, def.palette.skyBottom);
  wash.addColorStop(0.55, def.palette.skyTop);
  wash.addColorStop(1, '#0b1421');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const samples = buildCenterline(def);
  const total = samples.length ? samples[samples.length - 1].s : 0;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const sample of samples) {
    minX = Math.min(minX, sample.pos.x);
    maxX = Math.max(maxX, sample.pos.x);
    minZ = Math.min(minZ, sample.pos.z);
    maxZ = Math.max(maxZ, sample.pos.z);
  }

  const pad = 54;
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
  const ox = W / 2 - ((minX + maxX) / 2) * scale;
  const oy = H / 2 - ((minZ + maxZ) / 2) * scale;
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + z * scale;

  const path = new Path2D();
  samples.forEach((sample, index) => {
    if (index === 0) path.moveTo(toX(sample.pos.x), toY(sample.pos.z));
    else path.lineTo(toX(sample.pos.x), toY(sample.pos.z));
  });

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = def.palette.accent;
  ctx.lineWidth = 34;
  ctx.stroke(path);

  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = 'rgba(6,12,20,0.85)';
  ctx.lineWidth = 16;
  ctx.stroke(path);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.stroke(path);

  ctx.strokeStyle = def.palette.accent;
  ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.9;
  ctx.stroke(path);
  ctx.globalAlpha = 1;

  // Checkpoint pips
  def.checkpoints.forEach((fraction) => {
    const index = Math.min(samples.length - 1, Math.max(0, Math.round(fraction * (samples.length - 1))));
    const sample = samples[index];
    ctx.beginPath();
    ctx.arc(toX(sample.pos.x), toY(sample.pos.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#2ec4ff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(4,10,18,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Start marker
  const start = samples[2] ?? samples[0];
  ctx.beginPath();
  ctx.arc(toX(start.pos.x), toY(start.pos.z), 8, 0, Math.PI * 2);
  ctx.fillStyle = def.palette.accent;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  return { length: total };
}

export interface MenuOptions {
  host: HTMLElement;
  tuning: TuningStore;
  bestTime: (trackId: string) => number | null;
  onStart: (index: number) => void;
  onPreview: (index: number) => void;
  onSettings: () => void;
}

export class Menu {
  readonly root: HTMLElement;
  private readonly cards: HTMLButtonElement[] = [];
  private selected = -1;

  constructor(private readonly options: MenuOptions) {
    this.root = element('div', 'screen screen--menu');
    this.root.innerHTML = `
      <header class="menu-top">
        <div class="brand">
          <div class="brand-mark"></div>
          <div class="brand-text">
            <h1>MYPOLY<span>TRACK</span></h1>
            <p>LOW-POLY TIME TRIAL</p>
          </div>
        </div>
        <div class="menu-top-actions">
          <div class="chip"><i class="dot"></i> THREE CIRCUITS</div>
          <button class="icon-btn" type="button" data-settings aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .33 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.6 1.6 0 0 0 15 19.4a1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.09A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.09A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.33-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.09A1.6 1.6 0 0 0 15 4.6a1.6 1.6 0 0 0 1.77-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9c.2.48.66.87 1.16 1H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main class="menu-main">
        <div class="menu-heading">
          <span class="eyebrow"><i></i> SELECT A CIRCUIT</span>
          <h2>CHASE THE<br /><em>PERFECT LINE.</em></h2>
          <p class="lede">
            Three handcrafted low-poly circuits. Find grip, cut the apex and shave
            milliseconds off your best run. Every thousandth counts.
          </p>
        </div>
        <div class="track-grid" data-grid></div>
      </main>

      <footer class="menu-foot">
        <div class="keys">
          <span class="key-group"><kbd>W</kbd><kbd>↑</kbd><span>ACCELERATE</span></span>
          <span class="key-group"><kbd>S</kbd><kbd>↓</kbd><span>BRAKE</span></span>
          <span class="key-group"><kbd>A</kbd><kbd>D</kbd><span>STEER</span></span>
          <span class="key-group"><kbd>R</kbd><span>RESTART</span></span>
          <span class="key-group"><kbd>ESC</kbd><span>PAUSE</span></span>
          <span class="key-group"><kbd>M</kbd><span>MUTE</span></span>
        </div>
        <div class="menu-foot-right">LOCAL TIME TRIAL · GHOST REPLAY ENABLED</div>
      </footer>
    `;

    options.host.appendChild(this.root);

    const grid = this.root.querySelector<HTMLElement>('[data-grid]');
    if (!grid) throw new Error('[menu] grid missing');

    TRACKS.forEach((def, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'track-card';
      card.dataset.index = String(index);
      card.innerHTML = `
        <div class="card-glow"></div>
        <div class="card-thumb"><canvas></canvas><span class="card-index">${String(index + 1).padStart(2, '0')}</span></div>
        <div class="card-body">
          <div class="card-row">
            <h3>${def.name}</h3>
            <span class="diff diff--${def.difficulty.toLowerCase()}">${def.difficulty.toUpperCase()}</span>
          </div>
          <p class="card-tag">${def.tagline}</p>
          <div class="card-meta">
            <div><span>LENGTH</span><b data-length>—</b></div>
            <div><span>BEST</span><b class="best is-empty" data-best>--:--.---</b></div>
          </div>
        </div>
        <span class="card-cta">START RUN →</span>
      `;

      const canvas = card.querySelector('canvas');
      if (canvas) {
        const info = drawThumbnail(canvas, def);
        const lengthEl = card.querySelector<HTMLElement>('[data-length]');
        if (lengthEl) lengthEl.textContent = `${(info.length / 1000).toFixed(2)} KM`;
      }

      card.addEventListener('click', () => options.onStart(index));
      card.addEventListener('pointerenter', () => this.setSelected(index, true));
      card.addEventListener('focus', () => this.setSelected(index, true));

      grid.appendChild(card);
      this.cards.push(card);
    });

    this.root.querySelector('[data-settings]')?.addEventListener('click', () => options.onSettings());

    this.refreshBests();
  }

  setSelected(index: number, notify = false) {
    if (this.selected === index) return;
    const changed = this.selected !== index;
    this.selected = index;
    this.cards.forEach((card, i) => card.classList.toggle('is-selected', i === index));
    if (notify && changed) this.options.onPreview(index);
  }

  refreshBests() {
    this.cards.forEach((card, index) => {
      const def = TRACKS[index];
      const el = card.querySelector<HTMLElement>('[data-best]');
      if (!el) return;
      const best = this.options.bestTime(def.id);
      if (best === null) {
        el.textContent = '—';
        el.classList.add('is-empty');
      } else {
        el.textContent = formatTime(best);
        el.classList.remove('is-empty');
      }
    });
  }

  show() {
    this.root.classList.remove('is-hidden');
  }

  hide() {
    this.root.classList.add('is-hidden');
  }

  get cardsList(): HTMLButtonElement[] {
    return qsa<HTMLButtonElement>('.track-card', this.root);
  }
}

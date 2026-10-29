import type { InputManager, VirtualKey } from '../engine/input';

const ICON = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>',
  throttle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5l7 13H5z" /></svg>',
  brake:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" /></svg>',
  pause:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>'
} as const;

interface ButtonSpec {
  key: VirtualKey;
  className: string;
  label: string;
  icon: string;
}

const BUTTONS: ButtonSpec[] = [
  { key: 'left', className: 'touch-key touch-key--steer touch-key--left', label: 'Steer left', icon: ICON.left },
  { key: 'right', className: 'touch-key touch-key--steer touch-key--right', label: 'Steer right', icon: ICON.right },
  { key: 'brake', className: 'touch-key touch-key--brake', label: 'Brake', icon: ICON.brake },
  { key: 'throttle', className: 'touch-key touch-key--throttle', label: 'Accelerate', icon: ICON.throttle }
];

/** Detects a device that should get on-screen controls. `?touch=1|0` overrides. */
function detectTouch(): boolean {
  const forced = new URLSearchParams(window.location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  if (typeof window.matchMedia !== 'function') return false;
  // Primary pointer is a finger → tablet / phone.
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  // Hover-capable devices with a touchscreen (e.g. touch laptops) keep the
  // keyboard layout, so only treat them as touch when nothing can hover.
  return window.matchMedia('(hover: none)').matches && (navigator.maxTouchPoints ?? 0) > 0;
}

/**
 * Glass-style on-screen driving pad for tablets. Writes straight into
 * `InputManager.setVirtual`, so keyboard handling stays untouched.
 */
export class TouchControls {
  readonly enabled: boolean;
  private readonly input: InputManager;
  private readonly root: HTMLDivElement;
  private readonly hint: HTMLDivElement | null = null;
  private readonly buttons = new Map<VirtualKey, HTMLElement>();
  private readonly activePointers = new Map<number, VirtualKey>();

  constructor(input: InputManager, parent: HTMLElement) {
    this.input = input;
    this.enabled = detectTouch();

    this.root = document.createElement('div');
    this.root.className = 'touch-controls is-hidden';
    this.root.setAttribute('aria-hidden', 'true');

    for (const spec of BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = spec.className;
      button.innerHTML = spec.icon;
      button.setAttribute('aria-label', spec.label);
      button.setAttribute('aria-pressed', 'false');
      this.bindHold(button, spec.key);
      this.buttons.set(spec.key, button);
      this.root.appendChild(button);
    }

    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'touch-key touch-key--pause';
    pause.innerHTML = ICON.pause;
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', (event) => {
      event.stopPropagation();
      input.trigger('pause');
    });
    this.root.appendChild(pause);

    if (this.enabled) {
      parent.appendChild(this.root);

      const hint = document.createElement('div');
      hint.className = 'rotate-hint';
      hint.innerHTML = `
        <div class="rotate-hint__icon"></div>
        <div class="rotate-hint__title">ROTATE YOUR DEVICE</div>
        <div class="rotate-hint__note">MyPolyTrack is built for landscape play — turn your tablet sideways for the full track view.</div>
      `;
      parent.appendChild(hint);
      this.hint = hint;

      document.documentElement.classList.add('has-touch');
    }
  }

  show() {
    if (!this.enabled) return;
    this.root.classList.remove('is-hidden');
    this.root.setAttribute('aria-hidden', 'false');
  }

  hide() {
    if (!this.enabled) return;
    this.releaseAll();
    this.root.classList.add('is-hidden');
    this.root.setAttribute('aria-hidden', 'true');
  }

  dispose() {
    this.releaseAll();
    this.root.remove();
    this.hint?.remove();
    document.documentElement.classList.remove('has-touch');
  }

  /* ------------------------------------------------------------- internals */

  private bindHold(button: HTMLButtonElement, key: VirtualKey) {
    const press = (event: PointerEvent) => {
      event.preventDefault();
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic or already-released pointers cannot be captured */
      }
      this.activePointers.set(event.pointerId, key);
      this.input.setVirtual(key, true);
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
    };

    const release = (event: PointerEvent) => {
      this.release(event.pointerId);
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private release(pointerId: number) {
    const key = this.activePointers.get(pointerId);
    if (!key) return;
    this.activePointers.delete(pointerId);

    for (const held of this.activePointers.values()) {
      if (held === key) return;
    }

    this.input.setVirtual(key, false);
    const button = this.buttons.get(key);
    button?.classList.remove('is-active');
    button?.setAttribute('aria-pressed', 'false');
  }

  private releaseAll() {
    for (const key of new Set(this.activePointers.values())) {
      this.input.setVirtual(key, false);
      const button = this.buttons.get(key);
      button?.classList.remove('is-active');
      button?.setAttribute('aria-pressed', 'false');
    }
    this.activePointers.clear();
  }
}

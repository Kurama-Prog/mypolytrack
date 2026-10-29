export type GameAction = 'restart' | 'pause' | 'confirm' | 'mute';

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
}

/** On-screen controls feed these instead of physical keys. */
export type VirtualKey = 'left' | 'right' | 'throttle' | 'brake';

const BLOCK_DEFAULT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyR',
  'Escape'
]);

export class InputManager {
  private keys = new Set<string>();
  private virtual = new Set<VirtualKey>();
  private listeners = new Set<(action: GameAction) => void>();

  attach() {
    window.addEventListener('keydown', this.handleDown, { passive: false });
    window.addEventListener('keyup', this.handleUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  detach() {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  onAction(listener: (action: GameAction) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Press or release a virtual (touch) button. Repeated calls are idempotent. */
  setVirtual(key: VirtualKey, pressed: boolean) {
    if (pressed) this.virtual.add(key);
    else this.virtual.delete(key);
  }

  /** Lets on-screen buttons reuse the keyboard action channel. */
  trigger(action: GameAction) {
    this.emit(action);
  }

  /** Drops both keyboard and virtual state — used when the race stops. */
  clear() {
    this.keys.clear();
    this.virtual.clear();
  }

  get drive(): DriveInput {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.virtual.has('left');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.virtual.has('right');
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.virtual.has('throttle');
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.virtual.has('brake');

    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0)
    };
  }

  private isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  private handleDown = (event: KeyboardEvent) => {
    if (BLOCK_DEFAULT.has(event.code)) event.preventDefault();

    if (event.code === 'Escape') {
      if (!event.repeat) this.emit('pause');
      return;
    }
    if (event.code === 'KeyR') {
      if (!event.repeat) this.emit('restart');
      return;
    }
    if (event.code === 'Enter') {
      if (!event.repeat) this.emit('confirm');
      return;
    }
    if (event.code === 'KeyM') {
      if (!event.repeat) this.emit('mute');
      return;
    }

    if (this.isEditable(event.target)) return;
    this.keys.add(event.code);
  };

  private handleUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  /** Tabbing away must not leave the throttle stuck on. */
  private handleVisibility = () => {
    if (document.hidden) this.clear();
  };

  private emit(action: GameAction) {
    for (const listener of this.listeners) listener(action);
  }
}

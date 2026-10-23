export type GameAction = 'restart' | 'pause' | 'confirm' | 'mute';

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
}

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
  private listeners = new Set<(action: GameAction) => void>();

  attach() {
    window.addEventListener('keydown', this.handleDown, { passive: false });
    window.addEventListener('keyup', this.handleUp);
    window.addEventListener('blur', this.clear);
  }

  detach() {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    window.removeEventListener('blur', this.clear);
  }

  onAction(listener: (action: GameAction) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear() {
    this.keys.clear();
  }

  get drive(): DriveInput {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown');

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

  private emit(action: GameAction) {
    for (const listener of this.listeners) listener(action);
  }
}

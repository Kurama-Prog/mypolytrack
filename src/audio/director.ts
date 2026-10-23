import { BgmSystem } from './bgm';
import { AudioBus } from './context';
import { EngineAudio } from './engine';
import { Sfx } from './sfx';
import type { AudioStore } from './settings';

export type AudioScene = 'menu' | 'race' | 'paused' | 'results';

export interface CarAudioTelemetry {
  /** World speed in units per second. */
  speed: number;
  throttle: number;
  brake: number;
  boost: boolean;
  grounded: boolean;
  airTime: number;
}

/** Music is ducked (not stopped) when the game is paused or showing results. */
const DUCK: Record<AudioScene, number> = {
  menu: 0.72,
  race: 1,
  paused: 0.3,
  results: 0.55
};

/**
 * Facade used by the game: owns the buses, the procedural soundtrack, the
 * engine/brake voices and the one-shot SFX. All methods are safe to call before
 * the user has interacted with the page (nothing will play until then).
 */
export class AudioSystem {
  private readonly bus: AudioBus;
  private readonly music: BgmSystem;
  private readonly engine: EngineAudio;
  private readonly sfx: Sfx;

  private scene: AudioScene = 'menu';
  private trackId: string | null = null;
  private lastBoost = false;
  private lastAirTime = 0;

  constructor(private readonly store: AudioStore) {
    this.bus = new AudioBus(store);
    this.music = new BgmSystem(this.bus);
    this.engine = new EngineAudio(this.bus);
    this.sfx = new Sfx(this.bus);
    this.bus.setDuck(DUCK.menu);
  }

  /** Delegated click feedback for every button / track card in the UI. */
  attachUi(root: HTMLElement): () => void {
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('button') || target.closest('.track-card')) this.sfx.play('click');
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }

  get currentTrack(): string | null {
    return this.trackId;
  }

  get currentScene(): AudioScene {
    return this.scene;
  }

  setTrack(trackId: string): void {
    if (this.trackId === trackId) return;
    this.trackId = trackId;
    this.music.play(trackId);
  }

  setScene(scene: AudioScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.bus.setDuck(DUCK[scene]);

    if (scene === 'race') {
      this.engine.start();
    } else {
      this.engine.stop();
      this.lastBoost = false;
      this.lastAirTime = 0;
    }
  }

  startRace(trackId: string): void {
    this.setTrack(trackId);
    this.setScene('race');
    this.engine.start();
  }

  countdown(value: number | 'go'): void {
    if (value === 'go') {
      this.sfx.play('ignition');
      this.sfx.play('go');
      this.engine.start();
    } else {
      this.sfx.play('count');
    }
  }

  checkpoint(): void {
    this.sfx.play('checkpoint');
  }

  respawn(): void {
    this.sfx.play('respawn');
  }

  finish(best: boolean): void {
    this.sfx.play('finish');
    if (best) window.setTimeout(() => this.sfx.play('best'), 380);
    this.setScene('results');
  }

  toggleMute(): boolean {
    this.store.toggleMute();
    return this.store.value.muted;
  }

  updateCar(input: CarAudioTelemetry): void {
    this.engine.update(input);
    if (this.scene !== 'race') return;

    if (input.boost && !this.lastBoost) this.sfx.play('boost');
    if (input.grounded && this.lastAirTime > 0.22) this.sfx.play('land');

    this.lastBoost = input.boost;
    this.lastAirTime = input.airTime;
  }

  dispose(): void {
    this.music.dispose();
    this.engine.dispose();
    this.bus.dispose();
  }
}

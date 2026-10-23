import * as THREE from 'three';
import { SceneRenderer } from '../engine/renderer';
import { CameraRig, type GroundProbe } from '../engine/camera-rig';
import { InputManager, type GameAction } from '../engine/input';
import { GameLoop } from '../engine/loop';
import { TuningStore } from '../physics/tuning';
import { TRACKS } from '../track';
import { buildTrack, type BuiltTrack } from '../track/builder';
import { makeGroundProbe } from '../track/scenery';
import { createCarModel } from './car-model';
import { RaceSession, type RaceResult } from './race';
import { GhostPlayer } from './ghost';
import {
  bestTime,
  clearAllProgress,
  loadGhost,
  loadSettings,
  saveGhost,
  saveSettings,
  submitScore,
  type GhostRecord
} from '../storage/storage';
import { Menu } from '../ui/menu';
import { Hud } from '../ui/hud';
import { PauseScreen, ResultsScreen, SettingsScreen } from '../ui/screens';
import { AudioStore, AudioSystem, loadAudioSettings, saveAudioSettings } from '../audio';

type GameState = 'boot' | 'menu' | 'loading' | 'race' | 'paused' | 'results';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export class Game {
  private readonly renderer: SceneRenderer;
  private readonly cameraRig = new CameraRig();
  private readonly input = new InputManager();
  private readonly loop: GameLoop;
  private readonly tuning: TuningStore;
  private readonly audioStore: AudioStore;
  private readonly audio: AudioSystem;

  private readonly menu: Menu;
  private readonly hud: Hud;
  private readonly settings: SettingsScreen;
  private readonly pause: PauseScreen;
  private readonly results: ResultsScreen;

  private readonly carModel = createCarModel({ bodyColor: 0xff5a3c, accentColor: 0xffc93c });
  private readonly ghostModel = createCarModel({ ghost: true });
  private readonly tracks = new Map<number, BuiltTrack>();

  private state: GameState = 'boot';
  private session: RaceSession | null = null;
  private ghost: GhostPlayer | null = null;
  private ghostRecord: GhostRecord | null = null;
  private trackIndex = 0;
  private orbitAngle = 0.9;
  private groundProbe: GroundProbe | null = null;
  private sceneTrack: THREE.Group | null = null;
  private transitioning = false;
  private saveTimer = 0;
  private audioSaveTimer = 0;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  constructor(canvas: HTMLCanvasElement, uiHost: HTMLElement) {
    this.renderer = new SceneRenderer(canvas);
    this.tuning = new TuningStore(loadSettings());
    this.audioStore = new AudioStore(loadAudioSettings());
    this.audio = new AudioSystem(this.audioStore);

    this.renderer.scene.add(this.carModel.group);
    this.renderer.scene.add(this.ghostModel.group);
    this.carModel.group.visible = false;
    this.ghostModel.group.visible = false;

    this.menu = new Menu({
      host: uiHost,
      tuning: this.tuning,
      bestTime,
      onStart: (index) => void this.startRace(index),
      onPreview: (index) => this.previewTrack(index),
      onSettings: () => this.settings.open()
    });

    this.hud = new Hud(uiHost, this.tuning, this.audioStore, TRACKS[0].name);

    this.settings = new SettingsScreen(uiHost, this.tuning, this.audioStore, {
      onClose: () => this.settings.close(),
      onClear: () => this.clearProgress()
    });

    this.pause = new PauseScreen(uiHost, this.tuning, this.audioStore, {
      onResume: () => this.resumeRace(),
      onRestart: () => void this.startRace(this.trackIndex),
      onQuit: () => this.quitToMenu()
    });

    this.results = new ResultsScreen(uiHost, {
      onRetry: () => void this.startRace(this.trackIndex),
      onNext: () => void this.startRace((this.trackIndex + 1) % TRACKS.length),
      onMenu: () => this.quitToMenu()
    });

    this.input.attach();
    this.input.onAction((action) => this.handleAction(action));
    window.addEventListener('resize', () => this.renderer.resize());
    this.audio.attachUi(uiHost);

    this.tuning.subscribe((params) => {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => saveSettings(params), 220);
    });

    this.audioStore.subscribe((params) => {
      window.clearTimeout(this.audioSaveTimer);
      this.audioSaveTimer = window.setTimeout(() => saveAudioSettings(params), 220);
    });

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (dt) => this.render(dt)
    );
    this.loop.start();

    (window as unknown as { __game: Game }).__game = this;

    void this.boot();
  }

  /* ------------------------------------------------------------------ boot */

  private async boot() {
    const bootEl = document.getElementById('boot');
    const fill = document.getElementById('boot-fill');
    const note = document.getElementById('boot-note');

    for (let i = 0; i < TRACKS.length; i++) {
      if (note) note.textContent = `BUILDING ${TRACKS[i].name}`;
      if (fill) fill.style.width = `${((i + 0.35) / TRACKS.length) * 100}%`;
      await nextFrame();
      this.ensureTrack(i);
      await nextFrame();
    }

    this.trackIndex = 0;
    this.mountTrack(this.ensureTrack(0), true);
    this.menu.setSelected(0);
    this.menu.refreshBests();

    if (fill) fill.style.width = '100%';
    if (note) note.textContent = 'READY';

    this.state = 'menu';
    this.audio.setScene('menu');
    this.audio.setTrack(TRACKS[0].id);
    this.menu.show();
    await wait(280);
    bootEl?.classList.add('is-done');
  }

  /* ----------------------------------------------------------------- state */

  private ensureTrack(index: number): BuiltTrack {
    const cached = this.tracks.get(index);
    if (cached) return cached;
    const built = buildTrack(TRACKS[index]);
    this.tracks.set(index, built);
    return built;
  }

  private mountTrack(track: BuiltTrack, snapCamera: boolean) {
    if (this.sceneTrack) this.renderer.scene.remove(this.sceneTrack);
    this.sceneTrack = track.group;
    this.renderer.scene.add(track.group);
    this.renderer.applyPalette(track.def.palette, track.def.ambient);
    if (snapCamera) {
      this.orbitAngle = 0.9;
      this.cameraRig.reset();
    }
  }

  private previewTrack(index: number) {
    if (this.state !== 'menu') return;
    if (index === this.trackIndex) return;
    this.trackIndex = index;
    this.mountTrack(this.ensureTrack(index), false);
    this.audio.setTrack(TRACKS[index].id);
  }

  private showMenu() {
    this.state = 'menu';
    this.session = null;
    this.hud.hide();
    this.pause.close();
    this.results.close();
    this.settings.close();
    this.carModel.group.visible = false;
    this.ghostModel.group.visible = false;
    this.menu.show();
    this.menu.refreshBests();
    this.menu.setSelected(this.trackIndex);
    this.cameraRig.reset();
    this.audio.setScene('menu');
    this.audio.setTrack(TRACKS[this.trackIndex].id);
  }

  private quitToMenu() {
    this.input.clear();
    this.showMenu();
  }

  private clearProgress() {
    clearAllProgress();
    this.menu.refreshBests();
    this.hud.setBest(null);
    this.ghostRecord = null;
    this.ghost = null;
  }

  /* ------------------------------------------------------------------ race */

  private async startRace(index: number) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.state = 'loading';
    this.input.clear();
    await this.fade(true);

    this.trackIndex = index;
    const track = this.ensureTrack(index);
    this.groundProbe = makeGroundProbe(track.def, track.query);
    this.mountTrack(track, true);
    this.audio.startRace(track.def.id);

    this.menu.hide();
    this.settings.close();
    this.pause.close();
    this.results.close();

    this.session = new RaceSession(track, this.tuning, {
      onCountdown: (value) => {
        this.hud.showCountdown(value);
        this.audio.countdown(value);
      },
      onCheckpoint: (cpIndex, total) => {
        this.hud.toast(`CHECKPOINT ${cpIndex + 1} / ${total}`, 'good');
        this.audio.checkpoint();
      },
      onRespawn: () => {
        this.hud.toast('RESPAWN', 'bad');
        this.audio.respawn();
      },
      onFinish: (result) => this.handleFinish(result)
    });

    this.ghostRecord = loadGhost(track.def.id);
    this.ghost = this.ghostRecord ? new GhostPlayer(this.ghostRecord) : null;
    this.ghostModel.group.visible = false;

    this.hud.setTrackName(track.def.name);
    this.hud.setBest(bestTime(track.def.id));
    this.hud.show();
    this.hud.setTime(0);
    this.hud.setSpeed(0);
    this.hud.setBoost(false);
    this.hud.setProgress(0, 0, track.checkpoints.length);
    this.hud.clearCenter();

    this.carModel.group.visible = true;
    this.syncVisuals(0, 0);

    this.cameraRig.reset();
    this.cameraRig.follow(
      this.renderer.camera,
      {
        position: this.session.car.pos,
        quaternion: this.session.car.quat,
        speed: 0
      },
      0,
      true,
      this.groundProbe
    );

    await this.fade(false);
    this.state = 'race';
    this.transitioning = false;
  }

  private handleFinish(result: RaceResult) {
    if (!this.session) return;
    const track = this.session.track;
    this.state = 'results';
    this.hud.hide();
    this.hud.clearCenter();
    this.ghostModel.group.visible = false;

    const submission = submitScore(track.def.id, result.time);
    if (result.ghost && submission.isBest) {
      saveGhost(track.def.id, result.ghost);
    }
    this.audio.finish(submission.isBest);
    this.ghostRecord = loadGhost(track.def.id);
    this.menu.refreshBests();
    this.hud.setBest(bestTime(track.def.id));

    const data = {
      trackName: track.def.name,
      difficulty: track.def.difficulty,
      time: result.time,
      splits: result.splits,
      list: submission.list,
      rank: submission.rank,
      isBest: submission.isBest
    };

    window.setTimeout(() => {
      if (this.state === 'results') this.results.open(data);
    }, 700);
  }

  private pauseRace() {
    if (!this.session) return;
    this.state = 'paused';
    this.input.clear();
    this.audio.setScene('paused');
    this.pause.open({
      time: this.session.time,
      checkpoint: this.session.nextCheckpoint,
      total: this.session.track.checkpoints.length,
      respawns: this.session.respawns
    });
  }

  private resumeRace() {
    if (this.state !== 'paused') return;
    this.pause.close();
    this.input.clear();
    this.state = 'race';
    this.audio.setScene('race');
  }

  private handleAction(action: GameAction) {
    if (action === 'pause') {
      if (this.state === 'race') this.pauseRace();
      else if (this.state === 'paused') this.resumeRace();
      else if (this.settings.isOpen) this.settings.close();
      return;
    }

    if (action === 'restart') {
      if (this.state === 'race' || this.state === 'paused' || this.state === 'results') {
        this.pause.close();
        this.results.close();
        void this.startRace(this.trackIndex);
      }
      return;
    }

    if (action === 'confirm') {
      if (this.state === 'results') {
        this.results.close();
        void this.startRace(this.trackIndex);
      } else if (this.state === 'menu' && !this.settings.isOpen) {
        void this.startRace(this.trackIndex);
      }
      return;
    }

    if (action === 'mute') {
      const muted = this.audio.toggleMute();
      if (this.state === 'race' || this.state === 'paused') {
        this.hud.toast(muted ? 'AUDIO MUTED' : 'AUDIO ON', 'plain');
      }
    }
  }

  /* ----------------------------------------------------------------- loop */

  private update(dt: number) {
    if (this.state === 'race' && this.session) {
      this.session.update(dt, this.input.drive);
    }
  }

  private render(dt: number) {
    if (this.state === 'menu' || this.state === 'boot' || this.state === 'loading') {
      const track = this.tracks.get(this.trackIndex);
      if (track) {
        this.orbitAngle += dt * 0.1;
        this.cameraRig.orbit(this.renderer.camera, this.heroPoint(track), 47, this.orbitAngle, dt);
      }
    } else if (this.session) {
      this.syncVisuals(dt, this.input.drive.steer);
      this.cameraRig.follow(
        this.renderer.camera,
        {
          position: this.session.car.pos,
          quaternion: this.session.car.quat,
          speed: this.session.car.speed
        },
        dt,
        false,
        this.groundProbe
      );
      this.updateGhost();
      this.audio.updateCar({
        speed: this.session.car.speed,
        throttle: this.input.drive.throttle,
        brake: this.input.drive.brake,
        boost: this.session.car.boosting,
        grounded: this.session.car.grounded,
        airTime: this.session.car.airTime
      });

      if (this.state === 'race') {
        this.hud.setTime(this.session.time);
        this.hud.setSpeed(this.session.car.speed);
        this.hud.setBoost(this.session.car.boosting);
        this.hud.setProgress(
          this.session.car.s / this.session.track.totalLength,
          this.session.nextCheckpoint,
          this.session.track.checkpoints.length
        );
      }
    }

    this.renderer.render();
  }

  private heroPoint(track: BuiltTrack): THREE.Vector3 {
    const index = Math.floor(track.samples.length * 0.27);
    return track.samples[index].pos;
  }

  private syncVisuals(dt: number, steer: number) {
    if (!this.session) return;
    const car = this.session.car;
    this.carModel.group.position.copy(car.pos);
    this.carModel.group.quaternion.copy(car.quat);
    this.carModel.update(car.grounded ? Math.abs(car.v) : car.speed, steer, dt);
  }

  private updateGhost() {
    if (!this.session || !this.ghost || !this.ghost.valid) {
      this.ghostModel.group.visible = false;
      return;
    }

    const seconds = this.session.time / 1000;
    const visible = this.session.phase === 'racing' && seconds <= this.ghost.duration + 0.6;
    this.ghostModel.group.visible = visible;
    if (!visible) return;

    if (this.ghost.sample(this.session.time, this.tmpPos, this.tmpQuat)) {
      this.ghostModel.group.position.copy(this.tmpPos);
      this.ghostModel.group.quaternion.copy(this.tmpQuat);
    }
  }

  private fade(on: boolean): Promise<void> {
    const el = document.getElementById('fade');
    if (el) el.classList.toggle('is-on', on);
    return wait(on ? 330 : 280);
  }
}

import { TUNING_LIMITS, type GripMode, type TuningStore } from '../physics/tuning';
import { percent, qs, qsa } from './dom';

export interface TuningPanelOptions {
  collapsible?: boolean;
  inline?: boolean;
  hint?: string;
}

export class TuningPanel {
  readonly root: HTMLElement;
  private readonly accel: HTMLInputElement;
  private readonly brake: HTMLInputElement;
  private readonly accelValue: HTMLElement;
  private readonly brakeValue: HTMLElement;
  private readonly modeButtons: HTMLButtonElement[];
  private readonly unsubscribe: () => void;

  constructor(private readonly tuning: TuningStore, options: TuningPanelOptions = {}) {
    const { collapsible = false, inline = false, hint } = options;

    this.root = document.createElement('div');
    this.root.className = `tune${inline ? ' tune--inline' : ''}`;
    this.root.innerHTML = `
      <div class="tune-head">
        <span class="tune-title"><i></i>TUNING</span>
        ${collapsible ? '<button class="tune-toggle" type="button" data-toggle aria-label="Collapse tuning">−</button>' : ''}
      </div>
      <div class="tune-body">
        <label class="tune-row">
          <span class="tune-row-head">
            <span class="tune-name">ACCELERATION</span>
            <span class="tune-val" data-accel-value>1.00×</span>
          </span>
          <input type="range" min="${TUNING_LIMITS.min}" max="${TUNING_LIMITS.max}" step="${TUNING_LIMITS.step}" value="1" data-accel />
          <span class="tune-scale"><i>0.50×</i><i>2.00×</i></span>
        </label>
        <label class="tune-row">
          <span class="tune-row-head">
            <span class="tune-name">BRAKE</span>
            <span class="tune-val is-brake" data-brake-value>1.00×</span>
          </span>
          <input type="range" min="${TUNING_LIMITS.min}" max="${TUNING_LIMITS.max}" step="${TUNING_LIMITS.step}" value="1" data-brake />
          <span class="tune-scale"><i>0.50×</i><i>2.00×</i></span>
        </label>
        <div class="tune-modes">
          <span class="tune-name">HANDLING</span>
          <div class="segmented">
            <button type="button" data-mode="grip">GRIP</button>
            <button type="button" data-mode="drift">DRIFT</button>
          </div>
        </div>
        <button class="tune-reset" type="button" data-reset>RESET DEFAULTS</button>
        ${hint ? `<p class="tune-hint">${hint}</p>` : ''}
      </div>
    `;

    this.accel = qs<HTMLInputElement>('[data-accel]', this.root);
    this.brake = qs<HTMLInputElement>('[data-brake]', this.root);
    this.accelValue = qs('[data-accel-value]', this.root);
    this.brakeValue = qs('[data-brake-value]', this.root);
    this.modeButtons = qsa<HTMLButtonElement>('[data-mode]', this.root);

    this.accel.style.setProperty('--fill-color', '#2ec4ff');
    this.brake.style.setProperty('--fill-color', '#ff5a3c');

    this.accel.addEventListener('input', () => {
      this.tuning.set({ acceleration: Number(this.accel.value) });
    });
    this.brake.addEventListener('input', () => {
      this.tuning.set({ brake: Number(this.brake.value) });
    });
    for (const input of [this.accel, this.brake]) {
      input.addEventListener('pointerup', () => input.blur());
    }

    for (const button of this.modeButtons) {
      button.addEventListener('click', () => {
        this.tuning.set({ gripMode: (button.dataset.mode as GripMode) ?? 'grip' });
      });
    }

    qs<HTMLButtonElement>('[data-reset]', this.root).addEventListener('click', () => this.tuning.reset());

    const toggle = this.root.querySelector<HTMLButtonElement>('[data-toggle]');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const collapsed = this.root.classList.toggle('is-collapsed');
        toggle.textContent = collapsed ? '+' : '−';
      });
    }

    this.unsubscribe = this.tuning.subscribe((params) => {
      this.accel.value = params.acceleration.toFixed(2);
      this.brake.value = params.brake.toFixed(2);
      this.accelValue.textContent = `${params.acceleration.toFixed(2)}×`;
      this.brakeValue.textContent = `${params.brake.toFixed(2)}×`;
      this.accel.style.setProperty(
        '--fill',
        `${percent(params.acceleration, TUNING_LIMITS.min, TUNING_LIMITS.max)}%`
      );
      this.brake.style.setProperty(
        '--fill',
        `${percent(params.brake, TUNING_LIMITS.min, TUNING_LIMITS.max)}%`
      );
      for (const button of this.modeButtons) {
        button.classList.toggle('is-on', button.dataset.mode === params.gripMode);
      }
    });
  }

  dispose() {
    this.unsubscribe();
    this.root.remove();
  }
}

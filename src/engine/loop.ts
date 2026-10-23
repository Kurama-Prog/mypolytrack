/**
 * Fixed-timestep game loop. Physics always advances in 1/120 s slices so the
 * handling feels identical on 60 Hz and 144 Hz displays.
 */
export class GameLoop {
  private readonly step = 1 / 120;
  private accumulator = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (dt: number) => void
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now() / 1000;
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (nowMs: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const now = nowMs / 1000;
    let frame = now - this.last;
    this.last = now;
    if (frame > 0.2) frame = 0.2;

    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= this.step && steps < 8) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    if (steps === 8) this.accumulator = 0;

    this.render(frame);
  };
}

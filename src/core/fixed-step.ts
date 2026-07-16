export class FixedStepClock {
  private accumulator = 0;
  public alpha = 0;

  constructor(
    private readonly step: number,
    private readonly maxFrame: number,
  ) {}

  advance(frameSeconds: number, update: (dt: number) => boolean | void): void {
    this.accumulator += Math.min(frameSeconds, this.maxFrame);
    while (this.accumulator + Number.EPSILON >= this.step) {
      const keepAdvancing = update(this.step);
      this.accumulator -= this.step;
      if (keepAdvancing === false) {
        this.accumulator = 0;
        break;
      }
    }
    this.alpha = this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}

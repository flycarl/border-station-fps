export class FixedStepClock {
  private accumulator = 0;
  public alpha = 0;

  constructor(
    private readonly step: number,
    private readonly maxFrame: number,
  ) {}

  advance(frameSeconds: number, update: (dt: number) => void): void {
    this.accumulator += Math.min(frameSeconds, this.maxFrame);
    while (this.accumulator + Number.EPSILON >= this.step) {
      update(this.step);
      this.accumulator -= this.step;
    }
    this.alpha = this.accumulator / this.step;
  }
}

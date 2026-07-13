import { idleCommand, type PlayerCommand } from '../core/types';

export class KeyboardMouseInput {
  private keys = new Set<string>();
  private buttons = new Set<number>();
  private yaw = 0;
  private pitch = 0;
  private slot: 1 | 2 | 3 | 4 = 1;

  private down = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
    if (event.code === 'Digit1') this.slot = 1;
    if (event.code === 'Digit2') this.slot = 2;
    if (event.code === 'Digit3') this.slot = 3;
    if (event.code === 'Digit4') this.slot = 4;
  };

  private up = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private mouseDown = (event: MouseEvent): void => {
    this.buttons.add(event.button);
  };

  private mouseUp = (event: MouseEvent): void => {
    this.buttons.delete(event.button);
  };

  resetHeldState = (): void => {
    this.keys.clear();
    this.buttons.clear();
  };

  private visibilityChange = (): void => {
    if (this.doc.visibilityState === 'hidden') {
      this.resetHeldState();
    }
  };

  private move = (event: MouseEvent): void => {
    if (this.doc.pointerLockElement) {
      this.yaw -= event.movementX * 0.002;
      this.pitch = Math.max(
        -1.5,
        Math.min(1.5, this.pitch - event.movementY * 0.002),
      );
    }
  };

  constructor(private readonly doc: Document) {
    doc.addEventListener('keydown', this.down);
    doc.addEventListener('keyup', this.up);
    doc.addEventListener('mousedown', this.mouseDown);
    doc.addEventListener('mouseup', this.mouseUp);
    doc.addEventListener('mousemove', this.move);
    doc.defaultView?.addEventListener('blur', this.resetHeldState);
    doc.addEventListener('visibilitychange', this.visibilityChange);
  }

  sample(): PlayerCommand {
    const command = idleCommand();
    command.moveX =
      Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    command.moveZ =
      Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    command.yaw = this.yaw;
    command.pitch = this.pitch;
    command.jump = this.keys.has('Space');
    command.crouch = this.keys.has('ControlLeft');
    command.walk = this.keys.has('ShiftLeft');
    command.fire = this.buttons.has(0);
    command.reload = this.keys.has('KeyR');
    command.interact = this.keys.has('KeyE');
    command.slot = this.slot;
    return command;
  }

  dispose(): void {
    this.doc.removeEventListener('keydown', this.down);
    this.doc.removeEventListener('keyup', this.up);
    this.doc.removeEventListener('mousedown', this.mouseDown);
    this.doc.removeEventListener('mouseup', this.mouseUp);
    this.doc.removeEventListener('mousemove', this.move);
    this.doc.defaultView?.removeEventListener('blur', this.resetHeldState);
    this.doc.removeEventListener('visibilitychange', this.visibilityChange);
  }
}

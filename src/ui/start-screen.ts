export class StartScreen {
  private readonly element: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly status: HTMLElement;
  private mode: 'start' | 'pause' | 'hidden' = 'start';

  constructor(
    private readonly root: HTMLElement,
    private readonly onStart: () => void,
    private readonly onRestart: () => void,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'mission-modal';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'mission-title');
    this.element.innerHTML = `
      <div class="mission-modal__panel">
        <p class="mission-modal__kicker">BORDER STATION // 突击队</p>
        <h1 id="mission-title"></h1>
        <p class="mission-modal__description"></p>
        <p class="mission-modal__controls">WASD / 鼠标 / E / R</p>
        <p class="mission-modal__status" role="status" aria-live="polite"></p>
        <div class="mission-modal__actions"></div>
      </div>
    `;
    this.title = this.require('#mission-title');
    this.description = this.require('.mission-modal__description');
    this.actions = this.require('.mission-modal__actions');
    this.status = this.require('.mission-modal__status');
    root.append(this.element);
    this.render();
  }

  setPaused(paused: boolean): void {
    this.mode = paused ? 'pause' : 'hidden';
    this.render();
  }

  setLockError(message: string): void {
    this.status.textContent = message;
  }

  dispose(): void {
    this.element.remove();
  }

  private render(): void {
    this.element.hidden = this.mode === 'hidden';
    this.actions.replaceChildren();
    if (this.mode === 'hidden') return;

    if (this.mode === 'start') {
      this.title.textContent = '边境站突入';
      this.description.textContent = '带领攻方突入站区，消灭守军或安装炸弹。';
      this.actions.append(this.button('开始任务', 'primary', () => {
        this.onStart();
      }));
      return;
    }

    this.title.textContent = '任务暂停';
    this.description.textContent = '鼠标已释放，战场保持冻结。';
    this.actions.append(
      this.button('继续', 'primary', () => {
        this.onStart();
      }),
      this.button('重新开始', 'secondary', () => this.onRestart()),
    );
  }

  private button(label: string, tone: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mission-modal__button mission-modal__button--${tone}`;
    button.textContent = label;
    button.addEventListener('click', action, { once: true });
    return button;
  }

  private require(selector: string): HTMLElement {
    const element = this.element.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Start screen element missing: ${selector}`);
    return element;
  }
}

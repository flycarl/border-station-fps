export interface HudSnapshot {
  attackScore: number;
  defenseScore: number;
  phase: string;
  phaseRemaining: number;
  health: number;
  armor: number;
  weaponName: string;
  magazine: number;
  reserve: number;
  bombState: string;
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function objectivePrompt(snapshot: HudSnapshot): string {
  if (snapshot.bombState === 'carried' && snapshot.phase === 'live') return '在目标区按住 E 安装炸弹';
  if (snapshot.bombState === 'planting') return '正在安装…';
  if (snapshot.bombState === 'planted') return '炸弹已安装';
  if (snapshot.bombState === 'defusing') return '正在拆除…';
  if (snapshot.bombState === 'dropped') return '炸弹已掉落';
  return '';
}

function statusAnnouncement(snapshot: HudSnapshot): string {
  if (snapshot.bombState === 'planted') return '炸弹已安装';
  if (snapshot.bombState === 'defused') return '炸弹已拆除';
  if (snapshot.bombState === 'exploded') return '炸弹已爆炸';
  if (snapshot.bombState === 'dropped') return '炸弹已掉落';
  if (snapshot.phase === 'result') return '回合结束';
  if (snapshot.phase === 'match-over') return '比赛结束';
  if (snapshot.phase === 'live') return '回合开始';
  return '';
}

export class Hud {
  private readonly element: HTMLElement;
  private readonly score: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly health: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly armor: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly announcer: HTMLElement;
  private lastStatusKey = '';

  constructor(private readonly root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.innerHTML = `
      <section class="hud__round" aria-label="比赛状态">
        <div class="hud__phase"></div>
        <div class="hud__score" data-testid="score"></div>
        <time class="hud__timer"></time>
      </section>
      <section class="hud__vitals" aria-label="生命状态">
        <span class="hud__label">生命</span>
        <strong class="hud__health"></strong>
        <span class="hud__health-track" aria-hidden="true"><span class="hud__health-fill"></span></span>
        <span class="hud__armor"></span>
      </section>
      <section class="hud__weapon" aria-label="武器状态">
        <span class="hud__weapon-name"></span>
        <strong class="hud__ammo"></strong>
      </section>
      <div class="hud__objective" data-testid="bomb-action"></div>
      <div class="hud__announcer" role="status" aria-live="polite"></div>
      <div class="hud__reticle" aria-hidden="true"></div>
    `;
    this.score = this.require('.hud__score');
    this.timer = this.require('.hud__timer');
    this.phase = this.require('.hud__phase');
    this.health = this.require('.hud__health');
    this.healthFill = this.require('.hud__health-fill');
    this.armor = this.require('.hud__armor');
    this.weapon = this.require('.hud__weapon-name');
    this.ammo = this.require('.hud__ammo');
    this.objective = this.require('.hud__objective');
    this.announcer = this.require('.hud__announcer');
    root.append(this.element);
  }

  render(snapshot: HudSnapshot): void {
    this.score.textContent = `${snapshot.attackScore}  —  ${snapshot.defenseScore}`;
    this.timer.textContent = formatTime(snapshot.phaseRemaining);
    this.phase.textContent = snapshot.phase.toUpperCase();
    this.health.textContent = String(Math.ceil(snapshot.health));
    this.healthFill.style.setProperty('--health', `${Math.max(0, Math.min(100, snapshot.health))}%`);
    this.armor.textContent = `护甲 ${Math.ceil(snapshot.armor)}`;
    this.weapon.textContent = snapshot.weaponName;
    this.ammo.textContent = `${snapshot.magazine} / ${snapshot.reserve}`;
    this.objective.textContent = objectivePrompt(snapshot);
    this.objective.hidden = this.objective.textContent === '';
    const statusKey = `${snapshot.phase}:${snapshot.bombState}`;
    if (statusKey !== this.lastStatusKey) {
      this.lastStatusKey = statusKey;
      const announcement = statusAnnouncement(snapshot);
      if (announcement) this.announcer.textContent = announcement;
    }
  }

  dispose(): void {
    this.element.remove();
  }

  private require(selector: string): HTMLElement {
    const element = this.element.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`HUD element missing: ${selector}`);
    return element;
  }
}

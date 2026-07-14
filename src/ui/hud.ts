export interface HudSnapshot {
  attackScore: number;
  defenseScore: number;
  attackersAlive: number;
  defendersAlive: number;
  phase: string;
  phaseRemaining: number;
  health: number;
  armor: number;
  weaponName: string;
  magazine: number;
  reserve: number;
  bombState: string;
  radar: RadarSnapshot;
}

export interface RadarBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RadarContact {
  id: string;
  team: 'attack' | 'defense';
  x: number;
  z: number;
  yaw: number;
  human: boolean;
  alive: boolean;
}

export interface RadarSnapshot {
  bounds: RadarBounds;
  bombSite: { x: number; z: number };
  contacts: RadarContact[];
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

export function projectRadarPosition(
  position: { x: number; z: number },
  bounds: RadarBounds,
): { left: number; top: number } {
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const depth = Math.max(0.001, bounds.maxZ - bounds.minZ);
  return {
    left: clampPercent(((position.x - bounds.minX) / width) * 100),
    top: clampPercent(((position.z - bounds.minZ) / depth) * 100),
  };
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
  private readonly attackersAlive: HTMLElement;
  private readonly defendersAlive: HTMLElement;
  private readonly health: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly armor: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly announcer: HTMLElement;
  private readonly radarPlot: HTMLElement;
  private readonly radarSite: HTMLElement;
  private readonly radarContacts = new Map<string, HTMLElement>();
  private lastStatusKey = '';

  constructor(private readonly root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.innerHTML = `
      <section class="hud__round" aria-label="比赛状态">
        <div class="hud__phase"></div>
        <div class="hud__alive hud__alive--attack" data-testid="attackers-alive"></div>
        <div class="hud__score" data-testid="score"></div>
        <time class="hud__timer"></time>
        <div class="hud__alive hud__alive--defense" data-testid="defenders-alive"></div>
      </section>
      <section class="hud__radar" aria-label="战术地图">
        <div class="hud__radar-heading"><span>战术地图</span><span>N</span></div>
        <div class="hud__radar-plot">
          <span class="hud__radar-site" title="爆破点 A">A</span>
        </div>
        <div class="hud__radar-legend"><span>● 攻方</span><span>● 守方</span></div>
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
    this.attackersAlive = this.require('.hud__alive--attack');
    this.defendersAlive = this.require('.hud__alive--defense');
    this.health = this.require('.hud__health');
    this.healthFill = this.require('.hud__health-fill');
    this.armor = this.require('.hud__armor');
    this.weapon = this.require('.hud__weapon-name');
    this.ammo = this.require('.hud__ammo');
    this.objective = this.require('.hud__objective');
    this.announcer = this.require('.hud__announcer');
    this.radarPlot = this.require('.hud__radar-plot');
    this.radarSite = this.require('.hud__radar-site');
    root.append(this.element);
  }

  render(snapshot: HudSnapshot): void {
    this.score.textContent = `${snapshot.attackScore}  —  ${snapshot.defenseScore}`;
    this.timer.textContent = formatTime(snapshot.phaseRemaining);
    this.phase.textContent = snapshot.phase.toUpperCase();
    this.attackersAlive.textContent = `攻方 ${snapshot.attackersAlive}`;
    this.defendersAlive.textContent = `守方 ${snapshot.defendersAlive}`;
    this.health.textContent = String(Math.ceil(snapshot.health));
    this.healthFill.style.setProperty('--health', `${Math.max(0, Math.min(100, snapshot.health))}%`);
    this.armor.textContent = `护甲 ${Math.ceil(snapshot.armor)}`;
    this.weapon.textContent = snapshot.weaponName;
    this.ammo.textContent = `${snapshot.magazine} / ${snapshot.reserve}`;
    this.objective.textContent = objectivePrompt(snapshot);
    this.objective.hidden = this.objective.textContent === '';
    this.renderRadar(snapshot.radar);
    const statusKey = `${snapshot.phase}:${snapshot.bombState}`;
    if (statusKey !== this.lastStatusKey) {
      this.lastStatusKey = statusKey;
      const announcement = statusAnnouncement(snapshot);
      this.announcer.textContent = announcement;
    }
  }

  dispose(): void {
    this.radarContacts.clear();
    this.element.remove();
  }

  private renderRadar(radar: RadarSnapshot): void {
    const sitePosition = projectRadarPosition(radar.bombSite, radar.bounds);
    this.radarSite.style.left = `${sitePosition.left}%`;
    this.radarSite.style.top = `${sitePosition.top}%`;

    const livingIds = new Set<string>();
    for (const contact of radar.contacts) {
      if (!contact.alive) continue;
      livingIds.add(contact.id);
      let marker = this.radarContacts.get(contact.id);
      if (!marker) {
        marker = document.createElement('span');
        marker.className = 'hud__radar-contact';
        marker.dataset.actorId = contact.id;
        marker.setAttribute('aria-label', contact.human ? '你的位置' : `${contact.team === 'attack' ? '攻方' : '守方'}队员`);
        this.radarContacts.set(contact.id, marker);
        this.radarPlot.append(marker);
      }
      marker.className = `hud__radar-contact hud__radar-contact--${contact.team}${contact.human ? ' hud__radar-contact--human' : ''}`;
      const position = projectRadarPosition(contact, radar.bounds);
      marker.style.left = `${position.left}%`;
      marker.style.top = `${position.top}%`;
      marker.style.setProperty('--heading', `${-contact.yaw}rad`);
    }

    for (const [id, marker] of this.radarContacts) {
      if (livingIds.has(id)) continue;
      marker.remove();
      this.radarContacts.delete(id);
    }
  }

  private require(selector: string): HTMLElement {
    const element = this.element.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`HUD element missing: ${selector}`);
    return element;
  }
}

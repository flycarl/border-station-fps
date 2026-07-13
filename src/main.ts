import './styles.css';
import { Game } from './game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!canvas || !uiRoot) throw new Error('Required app mount points are missing');

void Game.create(canvas, uiRoot).then((game) => game.start()).catch((error: unknown) => {
  const section = document.createElement('section');
  section.className = 'startup-error';
  section.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = '无法启动游戏';
  const detail = document.createElement('p');
  detail.textContent = error instanceof Error ? error.message : '未知错误';
  section.append(title, detail);
  uiRoot.replaceChildren(section);
});

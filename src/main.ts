import './styles.css';
import { WorldRuntime } from './world/world-runtime';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas');

void WorldRuntime.create(canvas).then((world) =>
  world.render({
    position: { x: 0, y: 2, z: 24 },
    yaw: Math.PI,
    pitch: 0,
  }),
);

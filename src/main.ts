import * as THREE from 'three';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x172733);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 2, 5);
scene.add(new THREE.HemisphereLight(0xbfd9e8, 0x8b6b42, 2.2));
const ground = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0xb08b59 }));
scene.add(ground);
renderer.render(scene, camera);

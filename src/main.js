import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  createOutdoorEnvironment,
  createOrbitControls,
  enableShadows,
  naturalizeMaterial,
  setupPanToggle,
} from './scene-utils.js';

const BG_COLOR = 0xf2ede8;
const MODEL_URL = `${import.meta.env.BASE_URL}models/mangrove.glb?v=draco1`;

const canvas = document.getElementById('canvas');
const panToggle = document.getElementById('pan-toggle');
const loaderEl = document.getElementById('loader');

function hideLoader() {
  if (!loaderEl) return;
  loaderEl.classList.add('is-hidden');
  window.setTimeout(() => loaderEl.remove(), 400);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setClearColor(BG_COLOR, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.48;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.environment = createOutdoorEnvironment(renderer);
scene.environmentIntensity = 0.7;

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
camera.position.set(0, 1.4, 6);

const controls = createOrbitControls(camera, canvas, { autoRotate: true });
controls.target.set(0, 0.8, 0);
controls.update();
setupPanToggle(controls, panToggle);

// 柔光提亮，减少白光洗白
scene.add(new THREE.AmbientLight(0xf4efe6, 1.15));

const hemiLight = new THREE.HemisphereLight(0xf8f4ec, 0xddd5c8, 1.35);
hemiLight.position.set(0, 10, 0);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffefd6, 2.2);
sunLight.position.set(4, 14, 6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.04;
sunLight.shadow.radius = 4;
sunLight.shadow.intensity = 0.2;
scene.add(sunLight);
scene.add(sunLight.target);

const skyFill = new THREE.DirectionalLight(0xf0ebe3, 0.9);
skyFill.position.set(-5, 9, -2);
scene.add(skyFill);

const bounceLight = new THREE.DirectionalLight(0xece4d8, 0.7);
bounceLight.position.set(0, -3, 4);
scene.add(bounceLight);

const rimLight = new THREE.DirectionalLight(0xf2eee8, 0.4);
rimLight.position.set(-2, 5, -8);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1, 64),
  new THREE.ShadowMaterial({ opacity: 0.15, color: 0x6a5e52 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function brightenTreeMaterial(material) {
  naturalizeMaterial(material);
  if (!material) return;

  // 降低反射白边，保留原色只做轻度提亮
  if ('envMapIntensity' in material) material.envMapIntensity = 0.35;
  if ('roughness' in material) {
    material.roughness = Math.min(Math.max(material.roughness ?? 0.75, 0.68), 0.88);
  }
  if ('specularIntensity' in material) {
    material.specularIntensity = Math.min(material.specularIntensity ?? 1, 0.12);
  }
  if (material.color) {
    material.color.r = Math.min(1, material.color.r * 1.12 + 0.02);
    material.color.g = Math.min(1, material.color.g * 1.18 + 0.03);
    material.color.b = Math.min(1, material.color.b * 1.06 + 0.01);
  }
  material.needsUpdate = true;
}

function setupSunAndGround(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  ground.position.set(center.x, box.min.y + 0.002, center.z);
  ground.scale.setScalar(maxDim * 1.35);

  sunLight.target.position.copy(center);
  sunLight.position.set(
    center.x + maxDim * 0.9,
    center.y + maxDim * 2.2,
    center.z + maxDim * 1.1,
  );

  const cam = sunLight.shadow.camera;
  const extent = maxDim * 0.85;
  cam.left = -extent;
  cam.right = extent;
  cam.top = extent;
  cam.bottom = -extent;
  cam.near = maxDim * 0.1;
  cam.far = maxDim * 6;
  cam.updateProjectionMatrix();
  sunLight.shadow.needsUpdate = true;
}

function updateCameraClipPlanes() {
  const distance = camera.position.distanceTo(controls.target);
  camera.near = Math.max(distance / 200, 0.001);
  camera.far = Math.max(distance * 200, 500);
  camera.updateProjectionMatrix();
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const fittedBox = new THREE.Box3().setFromObject(object);
  const fittedSize = fittedBox.getSize(new THREE.Vector3());
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  const maxDim = Math.max(fittedSize.x, fittedSize.y, fittedSize.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = maxDim / (2 * Math.tan(fov / 2));
  distance *= 1.55;

  camera.position.set(0, fittedSize.y * 0.12, distance);
  controls.target.copy(fittedCenter);
  controls.minDistance = maxDim * 0.15;
  controls.maxDistance = maxDim * 8;
  updateCameraClipPlanes();
  controls.update();
  setupSunAndGround(object);
}

function createPlaceholderTree() {
  const root = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({
    color: 0xa89078,
    roughness: 0.82,
    metalness: 0,
  });
  const leaf = new THREE.MeshStandardMaterial({
    color: 0x4f8f4a,
    roughness: 0.7,
    metalness: 0,
  });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 10), bark);
  trunk.position.y = 0.8;
  root.add(trunk);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), leaf);
  canopy.position.set(0, 2.15, 0);
  canopy.scale.set(1.35, 0.95, 1.2);
  root.add(canopy);
  return root;
}

function resizeRenderer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function frame() {
  resizeRenderer();
  controls.update();
  updateCameraClipPlanes();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function loadModel() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  try {
    const gltf = await loader.loadAsync(MODEL_URL);
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) brightenTreeMaterial(material);
    });
    enableShadows(model);
    scene.add(model);
    fitCameraToObject(model);
  } catch (error) {
    console.warn('Failed to load mangrove.glb, using placeholder.', error);
    const placeholder = createPlaceholderTree();
    enableShadows(placeholder);
    scene.add(placeholder);
    fitCameraToObject(placeholder);
  } finally {
    hideLoader();
    dracoLoader.dispose();
  }
}

loadModel();
frame();

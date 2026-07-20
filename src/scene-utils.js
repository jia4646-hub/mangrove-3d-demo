import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createOutdoorEnvironment(renderer) {
  const envScene = new THREE.Scene();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xc9d8c8, side: THREE.BackSide }),
  );
  envScene.add(sky);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(10, 32),
    new THREE.MeshBasicMaterial({ color: 0x3f5a44 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  envScene.add(ground);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc98a }),
  );
  sun.position.set(5, 7, 3);
  envScene.add(sun);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(envScene, 0.1).texture;
  pmrem.dispose();
  return envMap;
}

export function naturalizeMaterial(material) {
  if (!material) return;

  material.side = THREE.FrontSide;

  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  if (material.emissiveMap) {
    material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  }

  if ('metalnessMap' in material) material.metalnessMap = null;
  if ('metalness' in material) material.metalness = 0;
  if ('roughness' in material) {
    material.roughness = Math.max(material.roughness ?? 0.85, 0.75);
  }
  if ('envMapIntensity' in material) material.envMapIntensity = 0.45;
  if ('specularIntensity' in material) {
    material.specularIntensity = Math.min(material.specularIntensity ?? 1, 0.25);
  }
  if (material.emissive) material.emissive.set(0, 0, 0);

  material.needsUpdate = true;
}

export function enableShadows(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

export function setupPanToggle(controls, button) {
  let panMode = false;

  const setCanvasCursor = (enabled) => {
    controls.domElement.style.cursor = enabled ? 'move' : 'grab';
  };

  const applyMode = () => {
    button.classList.toggle('is-active', panMode);
    button.setAttribute('aria-pressed', panMode ? 'true' : 'false');
    controls.mouseButtons.LEFT = panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    setCanvasCursor(panMode);
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    panMode = !panMode;
    applyMode();
  });

  applyMode();
  return () => panMode;
}

export function loadSceneBackground(scene, renderer, url = '/bg-texture.png') {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        scene.background = texture;
        renderer.setClearColor(0xd8c9b0, 1);
        resolve(texture);
      },
      undefined,
      () => {
        scene.background = new THREE.Color(0x1a3d32);
        resolve(null);
      },
    );
  });
}

export function createOrbitControls(camera, canvas, { autoRotate = true } = {}) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = 1.1;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 0.2;
  controls.maxDistance = 100;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.update();
  return controls;
}

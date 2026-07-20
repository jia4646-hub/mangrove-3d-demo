import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  createOutdoorEnvironment,
  createOrbitControls,
  enableShadows,
  setupPanToggle,
} from './scene-utils.js';

const BG_COLOR = 0xf2ede8;
const MODEL_URL = `${import.meta.env.BASE_URL}models/leaf.glb?v=draco1`;

const canvas = document.getElementById('canvas');
const panToggle = document.getElementById('pan-toggle');
const loader = document.getElementById('loader');

function hideLoader() {
  if (!loader) return;
  loader.classList.add('is-hidden');
  window.setTimeout(() => loader.remove(), 400);
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
renderer.toneMappingExposure = 1.42;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.environment = createOutdoorEnvironment(renderer);
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
camera.position.set(0, 0.4, 3);

const controls = createOrbitControls(camera, canvas, { autoRotate: false });
controls.target.set(0, 0, 0);
controls.update();
setupPanToggle(controls, panToggle);

scene.add(new THREE.AmbientLight(0xf4efe6, 1.05));

const hemiLight = new THREE.HemisphereLight(0xf8f4ec, 0xddd5c8, 1.2);
hemiLight.position.set(0, 10, 0);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffefd6, 2.35);
sunLight.position.set(4, 14, 6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.04;
sunLight.shadow.radius = 4;
sunLight.shadow.intensity = 0.18;
scene.add(sunLight);
scene.add(sunLight.target);

const skyFill = new THREE.DirectionalLight(0xf0ebe3, 0.85);
skyFill.position.set(-5, 9, -2);
scene.add(skyFill);

const bounceLight = new THREE.DirectionalLight(0xece4d8, 0.6);
bounceLight.position.set(0, -3, 4);
scene.add(bounceLight);

const rimLight = new THREE.DirectionalLight(0xf2eee8, 0.45);
rimLight.position.set(-2, 5, -8);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1, 64),
  new THREE.ShadowMaterial({ opacity: 0.14, color: 0x6a5e52 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const windTime = { value: 0 };

function styleLeafSkin(material) {
  if (!material) return;

  material.side = THREE.FrontSide;
  material.vertexColors = false;

  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  if ('metalnessMap' in material) material.metalnessMap = null;
  if ('metalness' in material) material.metalness = 0;
  if (material.emissive) {
    material.emissive.set(0, 0, 0);
    material.emissiveIntensity = 0;
  }

  // 保留贴图本色，蜡质高光接近参考图
  if (material.color) material.color.set(0xffffff);
  if ('roughness' in material) material.roughness = 0.38;
  if ('envMapIntensity' in material) material.envMapIntensity = 0.55;
  if ('specularIntensity' in material) material.specularIntensity = 0.55;

  material.needsUpdate = true;
}

function applyRootFixedSwayShader(material, rootLocal, hingeLocal, tipSpan, amp, phase, speed) {
  if (!material || material.userData.rootFixedSway) return;
  material.userData.rootFixedSway = true;

  const uniforms = {
    uTime: windTime,
    uRoot: { value: rootLocal.clone() },
    uHinge: { value: hingeLocal.clone() },
    uTipSpan: { value: Math.max(tipSpan, 1e-4) },
    uAmp: { value: amp },
    uPhase: { value: phase },
    uSpeed: { value: speed },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform vec3 uRoot;
        uniform vec3 uHinge;
        uniform float uTipSpan;
        uniform float uAmp;
        uniform float uPhase;
        uniform float uSpeed;

        vec3 rotateAroundAxis(vec3 v, vec3 axis, float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        }
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        // 叶根权重=0 完全不动；越靠近叶尖权重越大，绕叶柄轴做上下旋转
        float dist = length(transformed - uRoot);
        float tipW = smoothstep(0.35 * uTipSpan, 0.98 * uTipSpan, dist);
        tipW = tipW * tipW; // 根部更大范围保持静止
        float wave = sin(uTime * uSpeed + uPhase) * 0.9
                   + sin(uTime * uSpeed * 1.35 + uPhase * 1.1) * 0.1;
        float angle = wave * uAmp * tipW;
        vec3 axis = normalize(uHinge);
        vec3 offset = transformed - uRoot;
        transformed = uRoot + rotateAroundAxis(offset, axis, angle);
        `,
      );
  };
  material.customProgramCacheKey = () =>
    `leaf-root-fixed-${amp.toFixed(4)}-${phase.toFixed(3)}`;
  material.needsUpdate = true;
}

function setupLeafSway(model) {
  model.updateMatrixWorld(true);

  const meshes = [];
  model.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  let maxDist = 0.001;
  const infos = meshes.map((mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    maxDist = Math.max(maxDist, center.length());
    return { mesh, box, center, size };
  });

  const worldUp = new THREE.Vector3(0, 1, 0);

  for (const { mesh, box, center, size } of infos) {
    const distFactor = center.length() / maxDist;
    const maxSize = Math.max(size.x, size.y, size.z);
    const minSize = Math.min(size.x, size.y, size.z);
    const compactness = minSize / Math.max(maxSize, 1e-6);

    // 枝干不动；贴着枝干的近端叶也不动
    const isStem = distFactor < 0.32 || (distFactor < 0.5 && compactness > 0.4);
    const isNearStemLeaf = !isStem && distFactor < 0.55;
    if (isStem || isNearStemLeaf) continue;

    // 叶根：最靠近植株中心的点
    const rootWorld = new THREE.Vector3(
      THREE.MathUtils.clamp(0, box.min.x, box.max.x),
      THREE.MathUtils.clamp(0, box.min.y, box.max.y),
      THREE.MathUtils.clamp(0, box.min.z, box.max.z),
    );

    const tipDirWorld = center.clone().sub(rootWorld);
    if (tipDirWorld.lengthSq() < 1e-8) tipDirWorld.set(0, 1, 0);
    tipDirWorld.normalize();

    let hingeWorld = new THREE.Vector3().crossVectors(tipDirWorld, worldUp);
    if (hingeWorld.lengthSq() < 1e-8) {
      hingeWorld.crossVectors(tipDirWorld, new THREE.Vector3(1, 0, 0));
    }
    hingeWorld.normalize();

    mesh.updateMatrixWorld(true);
    const invMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const rootLocal = rootWorld.clone().applyMatrix4(invMesh);
    const hingeLocal = hingeWorld.clone().transformDirection(invMesh).normalize();

    const tipCandidates = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let tipSpan = 0;
    for (const p of tipCandidates) {
      tipSpan = Math.max(tipSpan, rootLocal.distanceTo(p.clone().applyMatrix4(invMesh)));
    }

    const amp = THREE.MathUtils.degToRad(1.2 + distFactor * 1.4); // 约 1.2°~2.6°
    const phase = Math.random() * Math.PI * 2;
    const speed = 0.95 + Math.random() * 0.45; // 稍快一点，仍保持轻微

    const sourceMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const nextMaterials = sourceMaterials.map((material) => {
      const mat = material.clone();
      styleLeafSkin(mat);
      applyRootFixedSwayShader(mat, rootLocal, hingeLocal, tipSpan, amp, phase, speed);
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
  }
}

function updateLeafSway(timeSec) {
  windTime.value = timeSec;
}

function setupSunAndGround(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  ground.position.set(center.x, box.min.y + 0.002, center.z);
  ground.scale.setScalar(maxDim * 1.6);

  sunLight.target.position.copy(center);
  sunLight.position.set(
    center.x + maxDim * 0.9,
    center.y + maxDim * 2.2,
    center.z + maxDim * 1.1,
  );

  const cam = sunLight.shadow.camera;
  const extent = maxDim * 0.9;
  cam.left = -extent;
  cam.right = extent;
  cam.top = extent;
  cam.bottom = -extent;
  cam.near = maxDim * 0.1;
  cam.far = maxDim * 6;
  cam.updateProjectionMatrix();
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
  distance *= 1.7;

  camera.position.set(distance * 0.25, fittedSize.y * 0.1, distance);
  controls.target.copy(fittedCenter);
  controls.minDistance = maxDim * 0.2;
  controls.maxDistance = maxDim * 8;
  updateCameraClipPlanes();
  controls.update();
  setupSunAndGround(object);
}

function createPlaceholderLeaf() {
  const root = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 24, 16),
    new THREE.MeshStandardMaterial({
      color: 0x3f8a45,
      roughness: 0.4,
      metalness: 0,
    }),
  );
  blade.scale.set(1.2, 0.18, 0.7);
  root.add(blade);
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

function frame(now) {
  resizeRenderer();
  updateLeafSway(now * 0.001);
  controls.update();
  updateCameraClipPlanes();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function loadModel() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const loader3d = new GLTFLoader();
  loader3d.setDRACOLoader(dracoLoader);
  try {
    const gltf = await loader3d.loadAsync(MODEL_URL);
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) styleLeafSkin(material);
    });
    enableShadows(model);
    scene.add(model);
    fitCameraToObject(model);
    setupLeafSway(model);
  } catch (error) {
    console.warn('Failed to load leaf.glb, using placeholder.', error);
    const placeholder = createPlaceholderLeaf();
    enableShadows(placeholder);
    scene.add(placeholder);
    fitCameraToObject(placeholder);
    setupLeafSway(placeholder);
  } finally {
    hideLoader();
    dracoLoader.dispose();
  }
}

loadModel();
requestAnimationFrame(frame);

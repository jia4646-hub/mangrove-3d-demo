import { writeFileSync, mkdirSync } from 'fs';

/** Build a placeholder mangrove-like GLB without Three.js (Node-friendly). */

function align4(n) {
  return (n + 3) & ~3;
}

function cylinder(radiusTop, radiusBottom, height, radialSegments, yBase) {
  const positions = [];
  const indices = [];
  const half = height / 2;

  for (let y = 0; y <= 1; y++) {
    const v = y;
    const radius = y === 0 ? radiusBottom : radiusTop;
    const py = yBase + (y === 0 ? 0 : height);
    for (let x = 0; x < radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * Math.PI * 2;
      positions.push(Math.cos(theta) * radius, py, Math.sin(theta) * radius);
    }
  }

  // caps centers
  const bottomCenter = positions.length / 3;
  positions.push(0, yBase, 0);
  const topCenter = positions.length / 3;
  positions.push(0, yBase + height, 0);

  for (let x = 0; x < radialSegments; x++) {
    const next = (x + 1) % radialSegments;
    const a = x;
    const b = next;
    const c = radialSegments + next;
    const d = radialSegments + x;
    indices.push(a, b, d, b, c, d);
    indices.push(bottomCenter, next, x);
    indices.push(topCenter, radialSegments + x, radialSegments + next);
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

function sphere(radius, widthSeg, heightSeg, cx, cy, cz, sx = 1, sy = 1, sz = 1) {
  const positions = [];
  const indices = [];

  for (let y = 0; y <= heightSeg; y++) {
    const v = y / heightSeg;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSeg; x++) {
      const u = x / widthSeg;
      const theta = u * Math.PI * 2;
      positions.push(
        cx + -radius * Math.cos(theta) * Math.sin(phi) * sx,
        cy + radius * Math.cos(phi) * sy,
        cz + radius * Math.sin(theta) * Math.sin(phi) * sz,
      );
    }
  }

  for (let y = 0; y < heightSeg; y++) {
    for (let x = 0; x < widthSeg; x++) {
      const a = y * (widthSeg + 1) + x;
      const b = a + widthSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

function transform(mesh, fn) {
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = fn(p[i], p[i + 1], p[i + 2]);
    p[i] = x;
    p[i + 1] = y;
    p[i + 2] = z;
  }
  return mesh;
}

const parts = [];

function add(mesh, color) {
  parts.push({ ...mesh, color });
}

add(cylinder(0.18, 0.28, 1.6, 10, 0), [0.42, 0.27, 0.14, 1]);

{
  const b = cylinder(0.06, 0.1, 0.9, 8, 0);
  transform(b, (x, y, z) => {
    // rotate around Z by 0.75, then move
    const c = Math.cos(0.75);
    const s = Math.sin(0.75);
    const y2 = y - 0.45;
    return [c * x - s * y2 - 0.35, s * x + c * y2 + 1.45, z + 0.05];
  });
  add(b, [0.42, 0.27, 0.14, 1]);
}

{
  const b = cylinder(0.06, 0.1, 0.85, 8, 0);
  transform(b, (x, y, z) => {
    const ang = -0.7;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const y2 = y - 0.425;
    return [c * x - s * y2 + 0.32, s * x + c * y2 + 1.5, z - 0.05];
  });
  add(b, [0.42, 0.27, 0.14, 1]);
}

add(sphere(0.95, 14, 10, 0, 2.15, 0, 1.35, 0.95, 1.2), [0.25, 0.56, 0.23, 1]);
add(sphere(0.55, 12, 8, -0.55, 1.95, 0.15), [0.28, 0.6, 0.26, 1]);
add(sphere(0.5, 12, 8, 0.5, 2.0, -0.1), [0.22, 0.52, 0.2, 1]);

for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * Math.PI * 2;
  const prop = cylinder(0.04, 0.07, 0.9, 6, 0);
  transform(prop, (x, y, z) => {
    const rz = Math.cos(angle) * 0.55;
    const rx = Math.sin(angle) * 0.55;
    let yy = y - 0.45;
    // approx rotate X then Z
    let y1 = yy * Math.cos(rx) - z * Math.sin(rx);
    let z1 = yy * Math.sin(rx) + z * Math.cos(rx);
    let x2 = x * Math.cos(rz) - y1 * Math.sin(rz);
    let y2 = x * Math.sin(rz) + y1 * Math.cos(rz);
    return [
      x2 + Math.cos(angle) * 0.45,
      y2 + 0.25,
      z1 + Math.sin(angle) * 0.45,
    ];
  });
  add(prop, [0.35, 0.22, 0.11, 1]);
}

for (let i = 0; i < 36; i++) {
  const angle = (i / 36) * Math.PI * 2 + (i % 3) * 0.2;
  const radius = 0.35 + (i % 5) * 0.22;
  const height = 0.18 + (i % 4) * 0.08;
  const spike = cylinder(0.015, 0.025, height, 5, 0);
  transform(spike, (x, y, z) => [
    x + Math.cos(angle) * radius,
    y,
    z + Math.sin(angle) * radius,
  ]);
  add(spike, [0.35, 0.22, 0.11, 1]);
}

const bufferViews = [];
const accessors = [];
const materials = [];
const meshes = [];
const nodes = [];
const binParts = [];
let binSize = 0;

for (let i = 0; i < parts.length; i++) {
  const p = parts[i];
  const posBytes = p.positions.byteLength;
  const idxBytes = p.indices.byteLength;

  const posViewIndex = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: binSize, byteLength: posBytes, target: 34962 });
  binParts.push(Buffer.from(p.positions.buffer, p.positions.byteOffset, posBytes));
  const afterPos = align4(binSize + posBytes);
  if (afterPos > binSize + posBytes) binParts.push(Buffer.alloc(afterPos - binSize - posBytes));
  binSize = afterPos;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < p.positions.length; v += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p.positions[v + a]);
      max[a] = Math.max(max[a], p.positions[v + a]);
    }
  }

  const posAcc = accessors.length;
  accessors.push({
    bufferView: posViewIndex,
    componentType: 5126,
    count: p.positions.length / 3,
    type: 'VEC3',
    min,
    max,
  });

  const idxViewIndex = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: binSize, byteLength: idxBytes, target: 34963 });
  binParts.push(Buffer.from(p.indices.buffer, p.indices.byteOffset, idxBytes));
  const afterIdx = align4(binSize + idxBytes);
  if (afterIdx > binSize + idxBytes) binParts.push(Buffer.alloc(afterIdx - binSize - idxBytes));
  binSize = afterIdx;

  const idxAcc = accessors.length;
  accessors.push({
    bufferView: idxViewIndex,
    componentType: 5123,
    count: p.indices.length,
    type: 'SCALAR',
  });

  materials.push({
    name: `mat_${i}`,
    pbrMetallicRoughness: {
      baseColorFactor: p.color,
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
  });

  meshes.push({
    primitives: [
      {
        attributes: { POSITION: posAcc },
        indices: idxAcc,
        material: i,
      },
    ],
  });

  nodes.push({ mesh: i, name: `part_${i}` });
}

const json = {
  asset: { version: '2.0', generator: 'mangrove-3d-demo-placeholder' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binSize }],
};

let jsonStr = JSON.stringify(json);
while (jsonStr.length % 4 !== 0) jsonStr += ' ';
const jsonBytes = Buffer.from(jsonStr, 'utf8');
const binBuffer = Buffer.concat(binParts);

const totalLength = 12 + 8 + jsonBytes.length + 8 + binBuffer.length;
const glb = Buffer.alloc(totalLength);
let o = 0;
glb.writeUInt32LE(0x46546c67, o); o += 4;
glb.writeUInt32LE(2, o); o += 4;
glb.writeUInt32LE(totalLength, o); o += 4;
glb.writeUInt32LE(jsonBytes.length, o); o += 4;
glb.writeUInt32LE(0x4e4f534a, o); o += 4;
jsonBytes.copy(glb, o); o += jsonBytes.length;
glb.writeUInt32LE(binBuffer.length, o); o += 4;
glb.writeUInt32LE(0x004e4942, o); o += 4;
binBuffer.copy(glb, o);

mkdirSync('public/models', { recursive: true });
writeFileSync('public/models/mangrove.glb', glb);
console.log('Wrote public/models/mangrove.glb', glb.length, 'bytes');

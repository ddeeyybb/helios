import React, { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import * as turf from '@turf/turf';
import { Html } from '@react-three/drei';
import { calculateHaversine } from '../../services/roofAiService';
import {
  TreeSegmentData,
  RoofPolygonData,
  createProceduralTreeMesh,
  buildNeighborContextMesh,
  calculateDigosSunPosition,
  evaluatePanelObstructions,
  SolarPanelCheckItem,
  ObstructionResult,
} from '../../services/SolarShadowEngine';

export type RoofStyle =
  | 'Flat'
  | 'Minimal'
  | 'Polygon'
  | 'Trapezoid'
  | 'Triangle'
  | 'flat'
  | 'minimal'
  | 'polygon'
  | 'trapezoid'
  | 'triangle'
  | 'gable'
  | 'hip'
  | 'complex'
  | 'mono';

export interface ManualPanel {
  id: string;
  side: 'left' | 'right' | 'main' | 'front' | 'back' | 'north' | 'south' | 'east' | 'west';
  slantY: number;
  z: number; // coordinate along the respective ridge/eave axis
}

export interface GableMeshOptions {
  width: number;       // Meters along X-axis (E-W width)
  length: number;      // Meters along Z-axis (N-S depth)
  pitchDeg?: number;   // Pitch in degrees (e.g. 15°)
  elevation?: number;  // Floating elevation in meters (e.g. 3.8m)
  roofColor?: string;
  ridgeColor?: string;
}

/**
 * 1. Procedural Three.js Gable Roof Geometry Generator
 */
export function buildGableMesh({
  width,
  length,
  pitchDeg = 15,
  elevation = 3.8,
  roofColor = '#475569',
  ridgeColor = '#047857',
}: GableMeshOptions): THREE.Group {
  const group = new THREE.Group();
  if (width <= 0 || length <= 0) return group;

  const effectivePitch = Math.max(0, Math.min(45, pitchDeg));
  const pitchRad = (effectivePitch * Math.PI) / 180;
  const halfDepth = length / 2;
  const cosPitch = Math.max(0.0001, Math.cos(pitchRad));
  const roofRise = halfDepth * Math.tan(pitchRad);
  const slantHeight = halfDepth / cosPitch;

  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.35,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });

  const ridgeMat = new THREE.MeshStandardMaterial({
    color: ridgeColor,
    roughness: 0.3,
    metalness: 0.8,
  });

  // North Slope
  const northGroup = new THREE.Group();
  northGroup.position.set(0, elevation, -halfDepth);
  northGroup.rotation.x = -pitchRad;

  const northMesh = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.2, 0.12, slantHeight),
    roofMat
  );
  northMesh.position.set(0, 0.06, slantHeight / 2);
  northMesh.castShadow = true;
  northMesh.receiveShadow = true;
  northGroup.add(northMesh);
  group.add(northGroup);

  // South Slope
  const southGroup = new THREE.Group();
  southGroup.position.set(0, elevation, halfDepth);
  southGroup.rotation.x = pitchRad;

  const southMesh = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.2, 0.12, slantHeight),
    roofMat
  );
  southMesh.position.set(0, 0.06, -slantHeight / 2);
  southMesh.castShadow = true;
  southMesh.receiveShadow = true;
  southGroup.add(southMesh);
  group.add(southGroup);

  // Center Ridge Apex Cap
  if (effectivePitch > 0) {
    const ridgeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.3, 0.08, 0.25),
      ridgeMat
    );
    ridgeMesh.position.set(0, elevation + roofRise + 0.04, 0);
    ridgeMesh.castShadow = true;
    group.add(ridgeMesh);
  }

  return group;
}

export interface HipMeshOptions {
  width: number;       // Meters along X-axis
  length: number;      // Meters along Z-axis
  pitchDeg?: number;   // Pitch in degrees (e.g. 15° - 25°)
  elevation?: number;  // Floating elevation in meters (e.g. 3.8m)
  roofColor?: string;
  ridgeColor?: string;
}

/**
 * 2. Procedural Three.js Hip Roof Geometry Generator
 */
export function buildHipMesh({
  width,
  length,
  pitchDeg = 15,
  elevation = 3.8,
  roofColor = '#475569',
  ridgeColor = '#047857',
}: HipMeshOptions): THREE.Group {
  const group = new THREE.Group();
  if (width <= 0 || length <= 0) return group;

  const effectivePitch = Math.max(1, Math.min(45, pitchDeg));
  const pitchRad = (effectivePitch * Math.PI) / 180;

  const halfW = width / 2;
  const halfL = length / 2;
  const minHalf = Math.min(halfW, halfL);
  const roofRise = minHalf * Math.tan(pitchRad);
  const apexY = elevation + roofRise;

  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.35,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });

  const ridgeMat = new THREE.MeshStandardMaterial({
    color: ridgeColor,
    roughness: 0.3,
    metalness: 0.8,
  });

  const cNW = new THREE.Vector3(-halfW, elevation, -halfL);
  const cNE = new THREE.Vector3( halfW, elevation, -halfL);
  const cSE = new THREE.Vector3( halfW, elevation,  halfL);
  const cSW = new THREE.Vector3(-halfW, elevation,  halfL);

  let r1: THREE.Vector3;
  let r2: THREE.Vector3;
  let ridgeIsAlongX = true;

  if (width >= length) {
    const ridgeSpan = Math.max(0, width - length);
    const halfRidge = ridgeSpan / 2;
    r1 = new THREE.Vector3(-halfRidge, apexY, 0);
    r2 = new THREE.Vector3( halfRidge, apexY, 0);
    ridgeIsAlongX = true;
  } else {
    const ridgeSpan = Math.max(0, length - width);
    const halfRidge = ridgeSpan / 2;
    r1 = new THREE.Vector3(0, apexY, -halfRidge);
    r2 = new THREE.Vector3(0, apexY,  halfRidge);
    ridgeIsAlongX = false;
  }

  const positions: number[] = [];
  const uvs: number[] = [];

  function addTri(pA: THREE.Vector3, pB: THREE.Vector3, pC: THREE.Vector3) {
    positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z);
    uvs.push(0, 0, 1, 0, 0.5, 1);
  }

  function addQuad(pA: THREE.Vector3, pB: THREE.Vector3, pC: THREE.Vector3, pD: THREE.Vector3) {
    addTri(pA, pB, pC);
    addTri(pA, pC, pD);
  }

  if (ridgeIsAlongX) {
    if (r1.distanceTo(r2) > 0.001) {
      addQuad(cNW, cNE, r2, r1);
      addQuad(cSE, cSW, r1, r2);
    } else {
      addTri(cNW, cNE, r1);
      addTri(cSE, cSW, r1);
    }
    addTri(cNE, cSE, r2);
    addTri(cSW, cNW, r1);
  } else {
    if (r1.distanceTo(r2) > 0.001) {
      addQuad(cSW, cNW, r1, r2);
      addQuad(cNE, cSE, r2, r1);
    } else {
      addTri(cSW, cNW, r1);
      addTri(cNE, cSE, r1);
    }
    addTri(cNW, cNE, r1);
    addTri(cSE, cSW, r2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();

  const roofMesh = new THREE.Mesh(geom, roofMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // Sharp rafter edges
  const edges = new THREE.EdgesGeometry(geom, 15);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 });
  group.add(new THREE.LineSegments(edges, lineMat));

  // Central Ridge Cap / Apex Cap
  const ridgeLen = r1.distanceTo(r2);
  if (ridgeLen > 0.1) {
    const ridgeCap = new THREE.Mesh(
      new THREE.BoxGeometry(
        ridgeIsAlongX ? ridgeLen + 0.2 : 0.25,
        0.08,
        ridgeIsAlongX ? 0.25 : ridgeLen + 0.2
      ),
      ridgeMat
    );
    ridgeCap.position.set((r1.x + r2.x) / 2, apexY + 0.04, (r1.z + r2.z) / 2);
    ridgeCap.castShadow = true;
    group.add(ridgeCap);
  } else {
    const peakCap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), ridgeMat);
    peakCap.position.set(r1.x, apexY + 0.05, r1.z);
    peakCap.castShadow = true;
    group.add(peakCap);
  }

  return group;
}

export interface CustomPolygonMeshOptions {
  points: Array<[number, number] | { x: number; z: number }>; // GPS [lng, lat] or local meter coords {x, z}
  height?: number;     // Wall height in meters (default 3.5m)
  elevation?: number;  // Floating elevation in meters (e.g. 0 or 3.8m)
  pitchDeg?: number;   // Pitch in degrees (e.g. 15°)
  roofColor?: string;
  wallColor?: string;
  ridgeColor?: string;
}

/**
 * 3. Dynamic Three.js Extrude Geometry Generator for Arbitrary N-point Polygons (6, 8, or N points)
 * - Centroid-projects GeoJSON polygon into local meter vectors relative to (0, 0)
 * - Uses latitude cosine correction:
 *     xMeters = (lng - originLng) * 111320 * Math.cos(originLat * Math.PI / 180)
 *     yMeters = (lat - originLat) * 110574
 * - Constructs THREE.Shape() from the normalized vertex loop
 * - Sets THREE.ExtrudeGeometry depth to 3.5 meters and rotates -Math.PI / 2
 */
export function buildCustomPolygonMesh({
  points,
  height = 3.5,
  elevation = 0,
  pitchDeg = 15,
  roofColor = '#475569',
  wallColor = '#e2e8f0',
  ridgeColor = '#047857',
}: CustomPolygonMeshOptions): THREE.Group {
  const group = new THREE.Group();
  if (!points || points.length < 3) return group;

  // Convert GPS [lng, lat] to local metric coordinates centered around origin
  let localPoints: Array<{ x: number; z: number }> = [];
  const first = points[0];
  const isGeo = Array.isArray(first) && Math.abs(first[0]) > 1.0;

  if (isGeo) {
    const geoPoints = points as Array<[number, number]>;
    const closed = [...geoPoints, geoPoints[0]];
    const poly = turf.polygon([closed]);
    const centroid = turf.centroid(poly);
    const originLng = centroid.geometry.coordinates[0];
    const originLat = centroid.geometry.coordinates[1];

    localPoints = geoPoints.map(([lng, lat]) => {
      const xMeters = (lng - originLng) * 111320 * Math.cos((originLat * Math.PI) / 180);
      const yMeters = (lat - originLat) * 110574;
      return {
        x: parseFloat(xMeters.toFixed(3)),
        z: parseFloat((-yMeters).toFixed(3)), // In Three.js -Z is North
      };
    });
  } else {
    localPoints = points.map((p) => {
      if (Array.isArray(p)) return { x: p[0], z: p[1] };
      return { x: p.x, z: p.z };
    });
  }

  // Ensure vertices are sorted in clockwise order around centroid to prevent bow-tie self-intersection
  const center = {
    x: localPoints.reduce((acc, p) => acc + p.x, 0) / localPoints.length,
    z: localPoints.reduce((acc, p) => acc + p.z, 0) / localPoints.length,
  };
  localPoints.sort((a, b) => {
    return Math.atan2(a.z - center.z, a.x - center.x) - Math.atan2(b.z - center.z, b.x - center.x);
  });

  // 1. Construct 2D THREE.Shape for the polygon
  const shape = new THREE.Shape();
  shape.moveTo(localPoints[0].x, -localPoints[0].z);
  for (let i = 1; i < localPoints.length; i++) {
    shape.lineTo(localPoints[i].x, -localPoints[i].z);
  }
  shape.closePath();

  // 2. Extrude base walls vertically from Y = elevation (0) to Y = elevation + height (3.0m)
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const wallGeom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  wallGeom.rotateX(-Math.PI / 2);
  wallGeom.translate(0, elevation, 0);
  wallGeom.computeVertexNormals();

  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 3. Pitched or Flat Top Roof Cap (Eaves rest flush at Y = elevation + height)
  const effectivePitch = Math.max(0, Math.min(45, pitchDeg));
  const pitchRad = (effectivePitch * Math.PI) / 180;

  const xs = localPoints.map((p) => p.x);
  const zs = localPoints.map((p) => p.z);
  const polyWidth = Math.max(...xs) - Math.min(...xs);
  const polyLength = Math.max(...zs) - Math.min(...zs);
  const minSpan = Math.min(polyWidth, polyLength);
  const roofRise = effectivePitch > 0 ? (minSpan / 2) * Math.tan(pitchRad) : 0;
  const wallTopY = elevation + height;
  const apexY = wallTopY + roofRise;

  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.35,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });

  const ridgeMat = new THREE.MeshStandardMaterial({
    color: ridgeColor,
    roughness: 0.3,
    metalness: 0.8,
  });

  // Calculate polygon centroid for apex
  const centroidX = center.x;
  const centroidZ = center.z;

  if (effectivePitch > 0) {
    // Generate sloped roof triangular facets connecting perimeter edges to apex centroid
    const roofPositions: number[] = [];
    const roofUvs: number[] = [];

    for (let i = 0; i < localPoints.length; i++) {
      const pA = localPoints[i];
      const pB = localPoints[(i + 1) % localPoints.length];

      roofPositions.push(
        pA.x, wallTopY, pA.z,
        pB.x, wallTopY, pB.z,
        centroidX, apexY, centroidZ
      );
      roofUvs.push(0, 0, 1, 0, 0.5, 1);
    }

    const roofGeom = new THREE.BufferGeometry();
    roofGeom.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3));
    roofGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roofUvs, 2));
    roofGeom.computeVertexNormals();

    const pitchedRoofMesh = new THREE.Mesh(roofGeom, roofMat);
    pitchedRoofMesh.castShadow = true;
    pitchedRoofMesh.receiveShadow = true;
    group.add(pitchedRoofMesh);

    // Sharp rafter edge lines
    const edges = new THREE.EdgesGeometry(roofGeom, 10);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 });
    group.add(new THREE.LineSegments(edges, lineMat));

    // Apex peak sphere cap
    const peak = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), ridgeMat);
    peak.position.set(centroidX, apexY + 0.05, centroidZ);
    peak.castShadow = true;
    group.add(peak);
  } else {
    // Flat top deck
    const flatGeom = new THREE.ShapeGeometry(shape);
    flatGeom.rotateX(-Math.PI / 2);
    flatGeom.translate(0, wallTopY + 0.02, 0);

    const flatMesh = new THREE.Mesh(flatGeom, roofMat);
    flatMesh.castShadow = true;
    flatMesh.receiveShadow = true;
    group.add(flatMesh);
  }

  return group;
}

export interface ComplexLMeshOptions {
  width: number;
  length: number;
  pitchDeg?: number;
  elevation?: number;
  roofColor?: string;
  ridgeColor?: string;
}

/**
 * 4. Procedural Three.js Multi-Section / Complex L-Shaped Roof Generator
 */
export function buildComplexLMesh({
  width,
  length,
  pitchDeg = 15,
  elevation = 3.8,
  roofColor = '#475569',
  ridgeColor = '#047857',
}: ComplexLMeshOptions): THREE.Group {
  const group = new THREE.Group();
  if (width <= 0 || length <= 0) return group;

  // Main Section
  const mainWidth = width;
  const mainLength = length * 0.58;
  const mainHip = buildHipMesh({
    width: mainWidth,
    length: mainLength,
    pitchDeg,
    elevation,
    roofColor,
    ridgeColor,
  });
  mainHip.position.set(0, 0, -length * 0.21);
  group.add(mainHip);

  // Wing Section
  const wingWidth = width * 0.52;
  const wingLength = length * 0.52;
  const wingHip = buildHipMesh({
    width: wingWidth,
    length: wingLength,
    pitchDeg,
    elevation,
    roofColor,
    ridgeColor,
  });
  wingHip.position.set(-width * 0.24, 0, length * 0.24);
  group.add(wingHip);

  return group;
}

export interface FlatMeshOptions {
  width: number;
  length: number;
  elevation?: number;
  roofColor?: string;
  parapetColor?: string;
}

/**
 * 5. Procedural Three.js Flat Commercial / Residential Roof Generator
 */
export function buildFlatMesh({
  width,
  length,
  elevation = 3.8,
  roofColor = '#64748b',
  parapetColor = '#334155',
}: FlatMeshOptions): THREE.Group {
  const group = new THREE.Group();
  if (width <= 0 || length <= 0) return group;

  const deckMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.6,
    metalness: 0.1,
  });
  const parapetMat = new THREE.MeshStandardMaterial({
    color: parapetColor,
    roughness: 0.4,
    metalness: 0.2,
  });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.15, length), deckMat);
  deck.position.set(0, elevation, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const parapetH = 0.35;
  const parapetT = 0.15;

  const northP = new THREE.Mesh(new THREE.BoxGeometry(width, parapetH, parapetT), parapetMat);
  northP.position.set(0, elevation + parapetH / 2 + 0.05, -length / 2 + parapetT / 2);
  northP.castShadow = true;
  group.add(northP);

  const southP = new THREE.Mesh(new THREE.BoxGeometry(width, parapetH, parapetT), parapetMat);
  southP.position.set(0, elevation + parapetH / 2 + 0.05, length / 2 - parapetT / 2);
  southP.castShadow = true;
  group.add(southP);

  const westP = new THREE.Mesh(new THREE.BoxGeometry(parapetT, parapetH, length), parapetMat);
  westP.position.set(-width / 2 + parapetT / 2, elevation + parapetH / 2 + 0.05, 0);
  westP.castShadow = true;
  group.add(westP);

  const eastP = new THREE.Mesh(new THREE.BoxGeometry(parapetT, parapetH, length), parapetMat);
  eastP.position.set(width / 2 - parapetT / 2, elevation + parapetH / 2 + 0.05, 0);
  eastP.castShadow = true;
  group.add(eastP);

  return group;
}

export interface House3DEngineProps {
  hasRoof: boolean;
  roofStyle?: RoofStyle;
  polygonPoints?: Array<[number, number]>; // Dynamic N-point coordinates from satellite tracing
  width?: number;        // Flat 2D base width in meters (Three.js X-axis)
  depth?: number;        // Flat 2D base depth / length in meters (Three.js Z-axis)
  elevation?: number;    // Anti-gravity floating height above ground/grid
  pitchDeg: number;      // Roof pitch angle theta (0° - 45°)
  layoutMode: 'auto' | 'manual';
  autoEnabled: boolean;
  rows: number;          // Panel rows (auto mode, along slope)
  cols: number;          // Panel columns (auto mode, along ridge length)
  manualPanels: ManualPanel[];
  onAddManualPanel: (panel: ManualPanel) => void;
  onRemoveManualPanel: (panelId: string) => void;
  isLandscape?: boolean;
  moduleLength?: number; // Real-world meter length (default 1.73m)
  moduleWidth?: number;  // Real-world meter width (default 1.12m)
  moduleWattage?: number;// Rated power in Watts (e.g. 430W)
  moduleLabel?: string;  // Brand & model label
  // Tree & Shadow Casting Engine Props
  trees?: TreeSegmentData[];
  neighborContextRoofs?: RoofPolygonData[];
  sunAzimuth?: number;
  sunAltitude?: number;
  hourOfDay?: number;
  onObstructionStats?: (stats: { total: number; valid: number; obstructed: number }) => void;
}

/**
 * Visual Solar Module Mesh with Shaded/Invalid Safety State Highlighting
 */
const SolarModuleMesh: React.FC<{
  panel: { id: string; slantY: number; z: number; side?: string };
  width: number;
  length: number;
  isObstructed?: boolean;
  obstructionReason?: string;
  onClick?: (e: any) => void;
}> = ({ width, length, isObstructed, onClick }) => {
  return (
    <group onClick={onClick}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, 0.035, length]} />
        <meshStandardMaterial
          color={isObstructed ? '#ef4444' : '#090d16'}
          roughness={isObstructed ? 0.35 : 0.15}
          metalness={isObstructed ? 0.15 : 0.9}
          transparent={isObstructed}
          opacity={isObstructed ? 0.88 : 1.0}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(width, 0.035, length)]} />
        <lineBasicMaterial
          color={isObstructed ? '#f43f5e' : '#10b981'}
          linewidth={isObstructed ? 3 : 2}
        />
      </lineSegments>

      {isObstructed ? (
        <Html position={[0, 0.22, 0]} center distanceFactor={14}>
          <div className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg border border-rose-300 select-none whitespace-nowrap animate-pulse">
            ⚠️ SHADED / INVALID
          </div>
        </Html>
      ) : (
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width - 0.04, length - 0.04]} />
          <meshBasicMaterial color="#334155" wireframe />
        </mesh>
      )}
    </group>
  );
};

export const House3DEngine: React.FC<House3DEngineProps> = ({
  hasRoof,
  roofStyle = 'gable',
  polygonPoints,
  width = 12.0,
  depth = 10.0,
  elevation = 3.8,
  pitchDeg = 15,
  layoutMode,
  autoEnabled,
  rows = 2,
  cols = 4,
  manualPanels,
  onAddManualPanel,
  onRemoveManualPanel,
  isLandscape = false,
  moduleLength = 1.73,
  moduleWidth = 1.12,
  moduleWattage = 430,
  moduleLabel = 'REC Group Alpha Pure-R',
  trees = [],
  neighborContextRoofs = [],
  sunAzimuth,
  sunAltitude,
  hourOfDay = 11.0,
  onObstructionStats,
}) => {
  const [hoveredSide, setHoveredSide] = useState<'north' | 'south' | 'east' | 'west' | 'main' | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ slantY: number; x: number } | null>(null);

  // ---------------- 0. CRITICAL NON-ZERO SAFETY GUARDS ----------------
  if (
    !hasRoof ||
    width <= 0 ||
    depth <= 0 ||
    isNaN(width) ||
    isNaN(depth) ||
    !isFinite(width) ||
    !isFinite(depth)
  ) {
    return null;
  }

  // Exact 1:1 Metric Bounds
  const safeWidth = Math.max(0.5, Math.min(100.0, width));
  const safeDepth = Math.max(0.5, Math.min(100.0, depth));

  // ---------------- 1. THREE.JS 3D PROCEDURAL MESH ROUTER (5 Slope Classes) ----------------
  const styleLower = (roofStyle || '').toLowerCase();
  const isCustomPolygon = (polygonPoints && polygonPoints.length >= 3) || styleLower.includes('polygon');
  const isFlat = styleLower.includes('flat') || styleLower.includes('deck');
  const isMono = styleLower.includes('minimal') || styleLower.includes('mono') || styleLower.includes('shed');
  const isHip = styleLower.includes('trapezoid') || styleLower.includes('hip') || styleLower.includes('pyramid');
  const isComplex = styleLower.includes('complex') || (polygonPoints && polygonPoints.length > 4);

  const effectivePitch = isFlat ? 0 : isMono ? Math.max(5, Math.min(20, pitchDeg || 8)) : Math.max(0, Math.min(45, pitchDeg || 15));
  const pitchRad = (effectivePitch * Math.PI) / 180;
  const cosPitch = Math.cos(pitchRad);
  const safeCos = cosPitch > 0.0001 ? cosPitch : 1.0;

  const halfDepth = Math.max(0.25, safeDepth / 2);
  const halfWidth = Math.max(0.25, safeWidth / 2);
  const minHalf = Math.min(halfWidth, halfDepth);

  const roofRise = isMono
    ? safeDepth * Math.tan(pitchRad)
    : isHip || isComplex
    ? minHalf * Math.tan(pitchRad)
    : halfDepth * Math.tan(pitchRad);

  const slantHeight = isMono
    ? safeDepth / safeCos
    : isHip || isComplex
    ? minHalf / safeCos
    : halfDepth / safeCos;

  if (slantHeight <= 0 || isNaN(slantHeight) || !isFinite(slantHeight)) {
    return null;
  }

  // Module dimensions
  const rawL = Math.max(0.2, moduleLength || 1.73);
  const rawW = Math.max(0.2, moduleWidth || 1.12);
  const moduleL = isLandscape ? rawW : rawL;
  const moduleW = isLandscape ? rawL : rawW;

  const railHeight = 0.06;
  const railWidth = 0.05;

  // ---------------- 2. DIGOS CITY SOLAR CALCULATOR & SUN COORDINATES ----------------
  const digosSun = useMemo(() => {
    return calculateDigosSunPosition(hourOfDay, 80, 50.0);
  }, [hourOfDay]);

  const activeSunPos = useMemo(() => {
    if (typeof sunAzimuth === 'number' && typeof sunAltitude === 'number') {
      const azRad = (sunAzimuth * Math.PI) / 180;
      const altRad = (sunAltitude * Math.PI) / 180;
      return new THREE.Vector3(
        50 * Math.cos(altRad) * Math.sin(azRad),
        Math.max(3, 50 * Math.sin(altRad)),
        -50 * Math.cos(altRad) * Math.cos(azRad)
      );
    }
    return digosSun.sunPositionVector;
  }, [sunAzimuth, sunAltitude, digosSun]);

  // ---------------- 3. PROCEDURAL 3D TREES & NEIGHBORHOOD ISOLATION ----------------
  // Generate tree Three.js groups with castShadow = true
  const treeGroups = useMemo(() => {
    return trees.map((t) => createProceduralTreeMesh(t));
  }, [trees]);

  // Generate Neighbor Context Roof Meshes
  const neighborMeshes = useMemo(() => {
    return neighborContextRoofs.map((nr) => buildNeighborContextMesh(nr, 3.5));
  }, [neighborContextRoofs]);

  // ---------------- 4. AUTO-FILL PANELS ----------------
  const autoPanelGrid = useMemo(() => {
    if (!autoEnabled || rows <= 0 || cols <= 0) return [];

    const items: Array<{
      id: string;
      slantY: number;
      z: number;
      side: 'north' | 'south' | 'main';
    }> = [];

    const spacingX = Math.max(0.1, moduleW + 0.06);
    const spacingSlantY = Math.max(0.1, moduleL + 0.08);

    const startX = -((cols - 1) * spacingX) / 2;
    const startSlantY = (slantHeight - rows * spacingSlantY) / 2 + spacingSlantY / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offsetX = startX + c * spacingX;
        const offsetSlantY = startSlantY + r * spacingSlantY;

        if (offsetSlantY > slantHeight - 0.05 || offsetSlantY < 0.05) continue;
        if (Math.abs(offsetX) > safeWidth / 2 - moduleW / 2) continue;

        if (isMono || isFlat) {
          items.push({
            id: `auto-main-${r}-${c}`,
            slantY: offsetSlantY,
            z: offsetX,
            side: 'main',
          });
        } else {
          items.push({
            id: `auto-north-${r}-${c}`,
            slantY: offsetSlantY,
            z: offsetX,
            side: 'north',
          });

          items.push({
            id: `auto-south-${r}-${c}`,
            slantY: offsetSlantY,
            z: offsetX,
            side: 'south',
          });
        }
      }
    }
    return items;
  }, [autoEnabled, rows, cols, moduleW, moduleL, slantHeight, isMono, isFlat, safeWidth]);

  // Rails
  const railRows = useMemo(() => {
    if (rows <= 0) return [];
    const rails: Array<{ slantY: number }> = [];
    const spacingSlantY = Math.max(0.1, moduleL + 0.08);
    const startSlantY = (slantHeight - rows * spacingSlantY) / 2 + spacingSlantY / 2;

    for (let r = 0; r < rows; r++) {
      const rowCenter = startSlantY + r * spacingSlantY;
      rails.push({ slantY: rowCenter - moduleL * 0.25 });
      rails.push({ slantY: rowCenter + moduleL * 0.25 });
    }
    return rails;
  }, [rows, moduleL, slantHeight]);

  const activePanels = layoutMode === 'auto' ? autoPanelGrid : manualPanels;

  // ---------------- 5. REAL-TIME PANEL OBSTRUCTION & SHADOW CHECKER ----------------
  const obstructionMap = useMemo(() => {
    if (!treeGroups || treeGroups.length === 0 || activePanels.length === 0) {
      return new Map<string, ObstructionResult>();
    }

    const checkList: SolarPanelCheckItem[] = activePanels.map((p) => {
      let worldX = p.z;
      let worldY = elevation + 0.1;
      let worldZ = 0;

      if (isCustomPolygon) {
        const zDist = Math.max(0.1, halfDepth * 0.45);
        const distFromEave = Math.max(0, halfDepth - zDist);
        worldY = 3.2 + distFromEave * Math.tan(pitchRad);
        worldZ = p.side === 'north' ? -zDist : zDist;
      } else if (isMono) {
        const dist = p.slantY;
        worldY = elevation + dist * Math.sin(pitchRad);
        worldZ = -halfDepth + dist * Math.cos(pitchRad);
      } else if (isFlat) {
        worldY = elevation + 0.2;
        worldZ = p.slantY - halfDepth + 0.5;
      } else if (isComplex) {
        const zDist = safeDepth * 0.2;
        const distFromEave = Math.max(0, halfDepth - zDist);
        worldY = elevation + distFromEave * Math.tan(pitchRad);
        worldZ = p.side === 'north' ? -zDist : zDist;
      } else {
        const dist = p.slantY;
        if (p.side === 'north' || p.side === 'back' || p.side === 'left') {
          worldY = elevation + dist * Math.sin(pitchRad);
          worldZ = -halfDepth + dist * Math.cos(pitchRad);
        } else {
          worldY = elevation + dist * Math.sin(pitchRad);
          worldZ = halfDepth - dist * Math.cos(pitchRad);
        }
      }

      return {
        id: p.id,
        worldPosition: new THREE.Vector3(worldX, worldY, worldZ),
        dimensions: { width: moduleW, length: moduleL, thickness: 0.035 },
      };
    });

    return evaluatePanelObstructions(checkList, treeGroups, activeSunPos);
  }, [
    activePanels,
    treeGroups,
    activeSunPos,
    elevation,
    pitchRad,
    halfDepth,
    safeDepth,
    moduleW,
    moduleL,
    isCustomPolygon,
    isMono,
    isFlat,
    isComplex,
  ]);

  // Telemetry Sync
  useEffect(() => {
    if (onObstructionStats) {
      let obstructedCount = 0;
      obstructionMap.forEach((res) => {
        if (res.isObstructed) obstructedCount++;
      });
      onObstructionStats({
        total: activePanels.length,
        valid: activePanels.length - obstructedCount,
        obstructed: obstructedCount,
      });
    }
  }, [obstructionMap, activePanels.length, onObstructionStats]);

  const handleSlopeClick = (e: any, side: 'north' | 'south' | 'east' | 'west' | 'main') => {
    if (layoutMode !== 'manual') return;
    e.stopPropagation();

    const point = e.point;
    const snapGrid = 0.5;
    const rawX = Math.round(point.x / snapGrid) * snapGrid;
    const clampedX = Math.max(-safeWidth / 2 + moduleW / 2 + 0.05, Math.min(safeWidth / 2 - moduleW / 2 - 0.05, rawX));
    const defaultSlantY = Math.max(moduleL / 2 + 0.1, Math.min(slantHeight - moduleL / 2 - 0.1, slantHeight / 2));

    const newPanel: ManualPanel = {
      id: `manual-${side}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      side,
      slantY: defaultSlantY,
      z: clampedX,
    };

    onAddManualPanel(newPanel);
  };

  const handlePointerMove = (e: any, side: 'north' | 'south' | 'east' | 'west' | 'main') => {
    if (layoutMode !== 'manual') return;
    e.stopPropagation();
    const point = e.point;
    const snapGrid = 0.5;
    const rawX = Math.round(point.x / snapGrid) * snapGrid;
    const clampedX = Math.max(-safeWidth / 2 + moduleW / 2 + 0.05, Math.min(safeWidth / 2 - moduleW / 2 - 0.05, rawX));

    setHoveredSide(side);
    setHoverCoord({ slantY: slantHeight / 2, x: clampedX });
  };

  const handlePointerOut = () => {
    setHoveredSide(null);
    setHoverCoord(null);
  };

  const hipRidgeLength = Math.max(0, safeWidth - safeDepth);

  return (
    <group position={[0, 0, 0]}>
      {/* 
        ---------------- DIGOS REAL-TIME DIRECTIONAL SUN LIGHT ----------------
      */}
      <directionalLight
        position={activeSunPos}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      {/* 
        ---------------- PROCEDURAL 3D TREES (SHADOW CASTING) ----------------
      */}
      {treeGroups.map((tg, idx) => (
        <primitive key={`tree-${idx}`} object={tg} />
      ))}

      {/* 
        ---------------- DENSE NEIGHBORHOOD CONTEXT ROOFS (SEMI-TRANSPARENT GREY) ----------------
      */}
      {neighborMeshes.map((nm, idx) => (
        <primitive key={`context-roof-${idx}`} object={nm} />
      ))}

      {/* 
        ---------------- PROCEDURAL TARGET ROOF MESHES ----------------
      */}
      {isCustomPolygon && polygonPoints ? (
        /* DYNAMIC ARBITRARY N-POINT EXTRUDE GEOMETRY */
        <group position={[0, 0, 0]}>
          <primitive
            object={buildCustomPolygonMesh({
              points: polygonPoints,
              height: 3.2,
              elevation: 0,
              pitchDeg: effectivePitch,
            })}
          />

          {/* Panels mounted flush (+0.05m offset) on custom polygon roof */}
          {activePanels.map((p) => {
            const zDist = Math.max(0.1, halfDepth * 0.45);
            const distFromEave = Math.max(0, halfDepth - zDist);
            const surfaceY = 3.2 + distFromEave * Math.tan(pitchRad);
            const obs = obstructionMap.get(p.id);

            return (
              <group
                key={p.id}
                position={[p.z, surfaceY + 0.05, p.side === 'north' ? -zDist : zDist]}
                rotation={[p.side === 'north' ? -pitchRad : pitchRad, 0, 0]}
              >
                <SolarModuleMesh
                  panel={p}
                  width={moduleW}
                  length={moduleL}
                  isObstructed={obs?.isObstructed}
                  obstructionReason={obs?.reason}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                  }}
                />
              </group>
            );
          })}
        </group>
      ) : isMono ? (
        /* MONO-SLOPE (SHED) ROOF */
        <group position={[0, elevation, -halfDepth]} rotation={[-pitchRad, 0, 0]}>
          <mesh
            position={[0, 0.06, slantHeight / 2]}
            castShadow
            receiveShadow
            onClick={(e) => handleSlopeClick(e, 'main')}
            onPointerMove={(e) => handlePointerMove(e, 'main')}
            onPointerOut={handlePointerOut}
          >
            <boxGeometry args={[safeWidth + 0.2, 0.12, slantHeight]} />
            <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
          </mesh>

          <lineSegments position={[0, 0.06, slantHeight / 2]}>
            <edgesGeometry args={[new THREE.BoxGeometry(safeWidth + 0.2, 0.12, slantHeight)]} />
            <lineBasicMaterial color="#10b981" linewidth={2} />
          </lineSegments>

          {railRows.map((rail, idx) => (
            <mesh key={`main-rail-${idx}`} position={[0, 0.09, rail.slantY]} castShadow>
              <boxGeometry args={[safeWidth + 0.1, railHeight, railWidth]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.2} metalness={0.95} />
            </mesh>
          ))}

          {/* Panels flush at surfaceY + 0.05m */}
          {activePanels
            .filter((p) => p.side === 'main' || p.side === 'north' || p.side === 'left' || p.side === 'back')
            .map((p) => {
              const obs = obstructionMap.get(p.id);
              return (
                <group key={p.id} position={[p.z, 0.11, p.slantY]}>
                  <SolarModuleMesh
                    panel={p}
                    width={moduleW}
                    length={moduleL}
                    isObstructed={obs?.isObstructed}
                    obstructionReason={obs?.reason}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                    }}
                  />
                </group>
              );
            })}

          {layoutMode === 'manual' && hoveredSide === 'main' && hoverCoord && (
            <group position={[hoverCoord.x, 0.11, hoverCoord.slantY]}>
              <mesh>
                <boxGeometry args={[moduleW, 0.035, moduleL]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
              </mesh>
            </group>
          )}
        </group>
      ) : isFlat ? (
        /* FLAT COMMERCIAL / RESIDENTIAL ROOF */
        <group position={[0, 0, 0]}>
          <primitive object={buildFlatMesh({ width: safeWidth, length: safeDepth, elevation })} />

          {activePanels
            .filter((p) => p.side === 'main' || p.side === 'north' || p.side === 'south')
            .map((p) => {
              const obs = obstructionMap.get(p.id);
              return (
                <group
                  key={p.id}
                  position={[p.z, elevation + 0.2, p.slantY - halfDepth + 0.5]}
                  rotation={[-0.18, 0, 0]}
                >
                  <SolarModuleMesh
                    panel={p}
                    width={moduleW}
                    length={moduleL}
                    isObstructed={obs?.isObstructed}
                    obstructionReason={obs?.reason}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                    }}
                  />
                </group>
              );
            })}
        </group>
      ) : isComplex ? (
        /* MULTI-SECTION COMPLEX L-SHAPED ROOF */
        <group position={[0, 0, 0]}>
          <primitive
            object={buildComplexLMesh({
              width: safeWidth,
              length: safeDepth,
              pitchDeg: effectivePitch,
              elevation,
            })}
          />

          {activePanels.map((p) => {
            const zDist = safeDepth * 0.2;
            const distFromEave = Math.max(0, halfDepth - zDist);
            const surfaceY = elevation + distFromEave * Math.tan(pitchRad);
            const obs = obstructionMap.get(p.id);

            return (
              <group
                key={p.id}
                position={[p.z, surfaceY + 0.05, p.side === 'north' ? -zDist : zDist]}
                rotation={[p.side === 'north' ? -pitchRad : pitchRad, 0, 0]}
              >
                <SolarModuleMesh
                  panel={p}
                  width={moduleW}
                  length={moduleL}
                  isObstructed={obs?.isObstructed}
                  obstructionReason={obs?.reason}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                  }}
                />
              </group>
            );
          })}
        </group>
      ) : (
        /* GABLE AND 4-SLOPE HIP ROOFS */
        <>
          {/* North Slope */}
          <group position={[0, elevation, -halfDepth]} rotation={[-pitchRad, 0, 0]}>
            <mesh
              position={[0, 0.06, slantHeight / 2]}
              castShadow
              receiveShadow
              onClick={(e) => handleSlopeClick(e, 'north')}
              onPointerMove={(e) => handlePointerMove(e, 'north')}
              onPointerOut={handlePointerOut}
            >
              <boxGeometry
                args={[
                  isHip ? Math.max(0.5, safeWidth - (isHip ? slantHeight * 0.4 : 0)) : safeWidth + 0.2,
                  0.12,
                  slantHeight,
                ]}
              />
              <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
            </mesh>

            <lineSegments position={[0, 0.06, slantHeight / 2]}>
              <edgesGeometry
                args={[
                  new THREE.BoxGeometry(
                    isHip ? Math.max(0.5, safeWidth - (isHip ? slantHeight * 0.4 : 0)) : safeWidth + 0.2,
                    0.12,
                    slantHeight
                  ),
                ]}
              />
              <lineBasicMaterial color="#10b981" linewidth={2} />
            </lineSegments>

            {railRows.map((rail, idx) => (
              <mesh key={`n-rail-${idx}`} position={[0, 0.09, rail.slantY]} castShadow>
                <boxGeometry
                  args={[isHip ? Math.max(0.4, hipRidgeLength) : safeWidth + 0.1, railHeight, railWidth]}
                />
                <meshStandardMaterial color="#94a3b8" roughness={0.2} metalness={0.95} />
              </mesh>
            ))}

            {activePanels
              .filter((p) => p.side === 'north' || p.side === 'back' || p.side === 'left')
              .map((p) => {
                const obs = obstructionMap.get(p.id);
                return (
                  <group key={p.id} position={[p.z, 0.11, p.slantY]}>
                    <SolarModuleMesh
                      panel={p}
                      width={moduleW}
                      length={moduleL}
                      isObstructed={obs?.isObstructed}
                      obstructionReason={obs?.reason}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                      }}
                    />
                  </group>
                );
              })}

            {layoutMode === 'manual' && hoveredSide === 'north' && hoverCoord && (
              <group position={[hoverCoord.x, 0.11, hoverCoord.slantY]}>
                <mesh>
                  <boxGeometry args={[moduleW, 0.035, moduleL]} />
                  <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
                </mesh>
              </group>
            )}
          </group>

          {/* South Slope */}
          <group position={[0, elevation, halfDepth]} rotation={[pitchRad, 0, 0]}>
            <mesh
              position={[0, 0.06, -slantHeight / 2]}
              castShadow
              receiveShadow
              onClick={(e) => handleSlopeClick(e, 'south')}
              onPointerMove={(e) => handlePointerMove(e, 'south')}
              onPointerOut={handlePointerOut}
            >
              <boxGeometry
                args={[
                  isHip ? Math.max(0.5, safeWidth - (isHip ? slantHeight * 0.4 : 0)) : safeWidth + 0.2,
                  0.12,
                  slantHeight,
                ]}
              />
              <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
            </mesh>

            <lineSegments position={[0, 0.06, -slantHeight / 2]}>
              <edgesGeometry
                args={[
                  new THREE.BoxGeometry(
                    isHip ? Math.max(0.5, safeWidth - (isHip ? slantHeight * 0.4 : 0)) : safeWidth + 0.2,
                    0.12,
                    slantHeight
                  ),
                ]}
              />
              <lineBasicMaterial color="#10b981" linewidth={2} />
            </lineSegments>

            {railRows.map((rail, idx) => (
              <mesh key={`s-rail-${idx}`} position={[0, 0.09, -rail.slantY]} castShadow>
                <boxGeometry
                  args={[isHip ? Math.max(0.4, hipRidgeLength) : safeWidth + 0.1, railHeight, railWidth]}
                />
                <meshStandardMaterial color="#94a3b8" roughness={0.2} metalness={0.95} />
              </mesh>
            ))}

            {activePanels
              .filter((p) => p.side === 'south' || p.side === 'front' || p.side === 'right')
              .map((p) => {
                const obs = obstructionMap.get(p.id);
                return (
                  <group key={p.id} position={[p.z, 0.11, -p.slantY]}>
                    <SolarModuleMesh
                      panel={p}
                      width={moduleW}
                      length={moduleL}
                      isObstructed={obs?.isObstructed}
                      obstructionReason={obs?.reason}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                      }}
                    />
                  </group>
                );
              })}

            {layoutMode === 'manual' && hoveredSide === 'south' && hoverCoord && (
              <group position={[hoverCoord.x, 0.11, -hoverCoord.slantY]}>
                <mesh>
                  <boxGeometry args={[moduleW, 0.035, moduleL]} />
                  <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
                </mesh>
              </group>
            )}
          </group>

          {/* Hip Roof East & West Sloping Triangles */}
          {isHip && (
            <>
              <group position={[safeWidth / 2, elevation, 0]} rotation={[0, 0, -pitchRad]}>
                <mesh
                  position={[-slantHeight / 3, 0.06, 0]}
                  castShadow
                  receiveShadow
                  onClick={(e) => handleSlopeClick(e, 'east')}
                  onPointerMove={(e) => handlePointerMove(e, 'east')}
                  onPointerOut={handlePointerOut}
                >
                  <coneGeometry args={[halfDepth, slantHeight * 0.8, 3]} />
                  <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
                </mesh>
              </group>

              <group position={[-safeWidth / 2, elevation, 0]} rotation={[0, 0, pitchRad]}>
                <mesh
                  position={[slantHeight / 3, 0.06, 0]}
                  castShadow
                  receiveShadow
                  onClick={(e) => handleSlopeClick(e, 'west')}
                  onPointerMove={(e) => handlePointerMove(e, 'west')}
                  onPointerOut={handlePointerOut}
                >
                  <coneGeometry args={[halfDepth, slantHeight * 0.8, 3]} />
                  <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
                </mesh>
              </group>
            </>
          )}

          {/* Center Apex Ridge Cap */}
          <mesh position={[0, elevation + roofRise + 0.04, 0]} castShadow>
            <boxGeometry
              args={[isHip ? Math.max(0.4, hipRidgeLength + 0.2) : safeWidth + 0.3, 0.08, 0.25]}
            />
            <meshStandardMaterial color="#047857" roughness={0.3} metalness={0.8} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default House3DEngine;

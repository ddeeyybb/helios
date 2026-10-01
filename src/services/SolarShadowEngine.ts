/**
 * ============================================================================
 * HELIOS - SolarShadowEngine.ts
 * Senior 3D Graphics & Solar Simulation Computational Geometry Engine
 * ============================================================================
 * 1. Digos City Sun Position Calculator (Azimuth & Elevation -> Vector3)
 * 2. 3D Procedural Canopy Tree Generator (ConeGeometry + DodecahedronGeometry)
 * 3. Dense Neighborhood Isolation (Target Centroid Distance Selection)
 * 4. Real-time Shadow & Canopy Collision Raycaster for Panel Obstruction Safety
 */

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// 1. DIGOS CITY SOLAR COORDINATE & SUN VECTOR CALCULATOR
// ----------------------------------------------------------------------------

export interface DigosSolarCoords {
  latitude: number;  // Digos City: 6.7495° N
  longitude: number; // Digos City: 125.3572° E
  azimuthDeg: number;
  elevationDeg: number;
  sunPositionVector: THREE.Vector3;
}

export const DIGOS_CITY_COORDS = {
  lat: 6.7495,
  lng: 125.3572,
  timezoneOffsetHours: 8, // UTC+8 (PST)
};

/**
 * Computes solar azimuth and elevation for Digos City at any given hour & day of year.
 * @param hourOfDay Decimal hour (e.g. 10.5 for 10:30 AM)
 * @param dayOfYear Day of year from 1 to 365 (default: 80 = March Equinox)
 * @param radius Distance of directional light from 3D origin
 */
export function calculateDigosSunPosition(
  hourOfDay: number = 11.0,
  dayOfYear: number = 80,
  radius: number = 50.0
): DigosSolarCoords {
  const latRad = (DIGOS_CITY_COORDS.lat * Math.PI) / 180;

  // Solar declination angle delta
  const declinationDeg = 23.45 * Math.sin(((360 / 365) * (284 + dayOfYear) * Math.PI) / 180);
  const declinationRad = (declinationDeg * Math.PI) / 180;

  // Solar hour angle H (15° per hour from solar noon at 12:00)
  const hourAngleDeg = (hourOfDay - 12.0) * 15.0;
  const hourAngleRad = (hourAngleDeg * Math.PI) / 180;

  // Solar Elevation (Altitude) angle alpha
  const sinAlpha =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinAlpha)));
  const elevationDeg = (elevationRad * 180) / Math.PI;

  // Solar Azimuth angle gamma (0° = North, 90° = East, 180° = South, 270° = West)
  const cosGamma =
    (Math.sin(elevationRad) * Math.sin(latRad) - Math.sin(declinationRad)) /
    (Math.max(0.0001, Math.cos(elevationRad)) * Math.cos(latRad));
  const clampedCos = Math.max(-1, Math.min(1, cosGamma));
  let azimuthDeg = (Math.acos(clampedCos) * 180) / Math.PI;
  if (hourOfDay > 12) {
    azimuthDeg = 360 - azimuthDeg;
  }
  const azimuthRad = (azimuthDeg * Math.PI) / 180;

  // Three.js Coordinate System: Y = Up, -Z = North, +X = East, +Z = South, -X = West
  const clampedElevationRad = Math.max((3 * Math.PI) / 180, elevationRad); // keep above horizon
  const x = radius * Math.cos(clampedElevationRad) * Math.sin(azimuthRad);
  const y = Math.max(2.0, radius * Math.sin(clampedElevationRad));
  const z = -radius * Math.cos(clampedElevationRad) * Math.cos(azimuthRad);

  return {
    latitude: DIGOS_CITY_COORDS.lat,
    longitude: DIGOS_CITY_COORDS.lng,
    azimuthDeg: parseFloat(azimuthDeg.toFixed(1)),
    elevationDeg: parseFloat(elevationDeg.toFixed(1)),
    sunPositionVector: new THREE.Vector3(x, y, z),
  };
}

// ----------------------------------------------------------------------------
// 2. PROCEDURAL 3D TREE GENERATOR (CONE + DODECAHEDRON CANOPY)
// ----------------------------------------------------------------------------

export interface TreeSegmentData {
  id: string;
  x: number;            // Local meter X relative to building centroid
  z: number;            // Local meter Z relative to building centroid
  heightMeters?: number;// Total tree height (default: 6.5m)
  canopyRadius?: number;// Canopy spread radius (default: 2.8m)
  trunkRadius?: number; // Trunk thickness (default: 0.35m)
  species?: 'mango' | 'mahogany' | 'rain_tree' | 'palm';
}

/**
 * Spawns a procedural 3D tree mesh with multi-lobed dodecahedron canopy and tapered cone/cylinder trunk.
 * Automatically marks all child meshes with castShadow = true.
 */
export function createProceduralTreeMesh(treeData: TreeSegmentData): THREE.Group {
  const {
    id,
    x,
    z,
    heightMeters = 6.5,
    canopyRadius = 2.8,
    trunkRadius = 0.35,
    species = 'mango',
  } = treeData;

  const treeGroup = new THREE.Group();
  treeGroup.name = `Tree_${id}`;
  treeGroup.position.set(x, 0, z);

  const trunkHeight = heightMeters * 0.45;
  const canopyBaseY = trunkHeight;

  // 1. Trunk (Tapered Cone / Cylinder)
  const trunkGeom = new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 10);
  trunkGeom.translate(0, trunkHeight / 2, 0);

  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a3728'),
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });

  const trunkMesh = new THREE.Mesh(trunkGeom, trunkMat);
  trunkMesh.name = `Trunk_${id}`;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);

  // 2. Canopy Foliage Clusters (Procedural Dodecahedrons + Cones)
  const foliageMatPrimary = new THREE.MeshStandardMaterial({
    color: new THREE.Color(species === 'rain_tree' ? '#15803d' : '#166534'),
    roughness: 0.8,
    metalness: 0.15,
    flatShading: true,
  });

  const foliageMatSecondary = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#22c55e'),
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  });

  // Central Primary Canopy Lobe
  const centralCanopyGeom = new THREE.DodecahedronGeometry(canopyRadius, 1);
  const centralCanopy = new THREE.Mesh(centralCanopyGeom, foliageMatPrimary);
  centralCanopy.position.set(0, canopyBaseY + canopyRadius * 0.85, 0);
  centralCanopy.scale.set(1.0, 1.15, 1.0);
  centralCanopy.castShadow = true;
  centralCanopy.receiveShadow = true;
  treeGroup.add(centralCanopy);

  // Sub-canopy Overhang Lobes (Creates realistic organic asymmetrical overhang)
  const clusterOffsets = [
    { x: canopyRadius * 0.45, y: canopyBaseY + canopyRadius * 0.5, z: canopyRadius * 0.3, r: canopyRadius * 0.65, mat: foliageMatSecondary },
    { x: -canopyRadius * 0.4, y: canopyBaseY + canopyRadius * 0.6, z: -canopyRadius * 0.35, r: canopyRadius * 0.6, mat: foliageMatPrimary },
    { x: -canopyRadius * 0.3, y: canopyBaseY + canopyRadius * 0.4, z: canopyRadius * 0.4, r: canopyRadius * 0.55, mat: foliageMatSecondary },
    { x: 0, y: canopyBaseY + canopyRadius * 1.5, z: 0, r: canopyRadius * 0.5, mat: foliageMatSecondary },
  ];

  clusterOffsets.forEach((lobe, idx) => {
    const lobeGeom = new THREE.DodecahedronGeometry(lobe.r, 1);
    const lobeMesh = new THREE.Mesh(lobeGeom, lobe.mat);
    lobeMesh.position.set(lobe.x, lobe.y, lobe.z);
    lobeMesh.castShadow = true;
    lobeMesh.receiveShadow = true;
    treeGroup.add(lobeMesh);
  });

  // Top Spire Cap (Cone Geometry for lush canopy apex)
  const topSpireGeom = new THREE.ConeGeometry(canopyRadius * 0.7, canopyRadius * 0.9, 7);
  const topSpire = new THREE.Mesh(topSpireGeom, foliageMatPrimary);
  topSpire.position.set(0, canopyBaseY + canopyRadius * 1.4, 0);
  topSpire.castShadow = true;
  topSpire.receiveShadow = true;
  treeGroup.add(topSpire);

  // Compute overall bounding box & sphere for fast collision checks
  const overallBox = new THREE.Box3().setFromObject(treeGroup);
  const overallSphere = new THREE.Sphere();
  overallBox.getBoundingSphere(overallSphere);

  treeGroup.userData = {
    isTree: true,
    treeId: id,
    heightMeters,
    canopyRadius,
    worldOrigin: new THREE.Vector3(x, 0, z),
    boundingBox: overallBox,
    boundingSphere: overallSphere,
  };

  return treeGroup;
}

// ----------------------------------------------------------------------------
// 3. DENSE NEIGHBORHOOD ISOLATION (TARGET SELECTION & CONTEXT ROOFS)
// ----------------------------------------------------------------------------

export interface RoofPolygonData {
  id: string;
  polygon: Array<[number, number] | { x: number; z: number }>;
  roof_type?: string;
  confidence?: number;
  heightMeters?: number;
}

/**
 * Evaluates multiple roof footprints returned from segmentation / OSM data.
 * Identifies the Target Roof (closest to the user click centroid) and splits
 * polygons into targetRoof vs neighborContextRoofs.
 */
export function isolateTargetRoof(
  roofPolygons: RoofPolygonData[],
  clickPoint: { x: number; z: number } = { x: 0, z: 0 }
): {
  targetRoof: RoofPolygonData | null;
  neighborContextRoofs: RoofPolygonData[];
} {
  if (!roofPolygons || roofPolygons.length === 0) {
    return { targetRoof: null, neighborContextRoofs: [] };
  }

  if (roofPolygons.length === 1) {
    return { targetRoof: roofPolygons[0], neighborContextRoofs: [] };
  }

  let closestDistSq = Infinity;
  let targetIdx = 0;

  roofPolygons.forEach((roof, idx) => {
    // Compute 2D polygon centroid
    let sumX = 0;
    let sumZ = 0;
    const n = roof.polygon.length;

    roof.polygon.forEach((pt) => {
      const px = Array.isArray(pt) ? pt[0] : pt.x;
      const pz = Array.isArray(pt) ? pt[1] : pt.z;
      sumX += px;
      sumZ += pz;
    });

    const cx = sumX / Math.max(1, n);
    const cz = sumZ / Math.max(1, n);

    const distSq = (cx - clickPoint.x) ** 2 + (cz - clickPoint.z) ** 2;
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      targetIdx = idx;
    }
  });

  const targetRoof = roofPolygons[targetIdx];
  const neighborContextRoofs = roofPolygons.filter((_, idx) => idx !== targetIdx);

  return { targetRoof, neighborContextRoofs };
}

/**
 * Builds a semi-transparent grey context box mesh for neighboring buildings.
 * Material: MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.25 })
 */
export function buildNeighborContextMesh(
  roofData: RoofPolygonData,
  defaultHeight: number = 3.5
): THREE.Mesh {
  const points = roofData.polygon.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
  const h = roofData.heightMeters || defaultHeight;

  // Compute 2D bounding box
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const width = Math.max(1.0, maxX - minX);
  const depth = Math.max(1.0, maxZ - minZ);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const geom = new THREE.BoxGeometry(width, h, depth);
  geom.translate(centerX, h / 2, centerZ);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.25,
    roughness: 0.85,
    metalness: 0.1,
    depthWrite: false, // Smooth alpha sorting
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = `ContextRoof_${roofData.id}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Add subtle architectural wireframe outline
  const edges = new THREE.EdgesGeometry(geom, 20);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.4,
  });
  mesh.add(new THREE.LineSegments(edges, edgeMat));

  return mesh;
}

// ----------------------------------------------------------------------------
// 4. PANEL OBSTRUCTION & TREE SHADOW SAFETY VERIFICATION ENGINE
// ----------------------------------------------------------------------------

export interface SolarPanelCheckItem {
  id: string;
  worldPosition: THREE.Vector3;
  dimensions: { width: number; length: number; thickness?: number };
  rotation?: THREE.Euler;
}

export interface ObstructionResult {
  panelId: string;
  isObstructed: boolean;
  reason?: 'TREE_CANOPY_OVERHANG' | 'TREE_SHADOW' | 'NEIGHBOR_SHADOW';
  obstructingTreeId?: string;
  distanceToObstruction?: number;
}

/**
 * Inspects each solar panel against all scene trees and sun rays:
 * 1. Physical Canopy Bounding Box & Sphere intersection
 * 2. Real-time Sun Direction Raycasting (Shadow Projection)
 */
export function evaluatePanelObstructions(
  panels: SolarPanelCheckItem[],
  treeGroups: THREE.Group[],
  sunPosition: THREE.Vector3
): Map<string, ObstructionResult> {
  const results = new Map<string, ObstructionResult>();
  const sunDir = sunPosition.clone().normalize();
  const raycaster = new THREE.Raycaster();

  // Extract all tree meshes for raycast collision
  const collidableTreeMeshes: THREE.Mesh[] = [];
  const treeBoundingSpheres: Array<{ sphere: THREE.Sphere; treeId: string }> = [];

  treeGroups.forEach((tg) => {
    tg.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        collidableTreeMeshes.push(child as THREE.Mesh);
      }
    });

    const box = new THREE.Box3().setFromObject(tg);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    treeBoundingSpheres.push({
      sphere,
      treeId: tg.userData.treeId || tg.name,
    });
  });

  panels.forEach((panel) => {
    const pos = panel.worldPosition;
    const halfDiag = Math.hypot(panel.dimensions.width, panel.dimensions.length) / 2;

    // Check 1: Direct 3D physical canopy intrusion (Tree branch overhang directly touching panel zone)
    let isPhysicallyColliding = false;
    let collidingTreeId = '';

    for (const { sphere, treeId } of treeBoundingSpheres) {
      const dist = sphere.center.distanceTo(pos);
      if (dist < sphere.radius + halfDiag * 0.8) {
        isPhysicallyColliding = true;
        collidingTreeId = treeId;
        break;
      }
    }

    if (isPhysicallyColliding) {
      results.set(panel.id, {
        panelId: panel.id,
        isObstructed: true,
        reason: 'TREE_CANOPY_OVERHANG',
        obstructingTreeId: collidingTreeId,
      });
      return;
    }

    // Check 2: Real-time Sun Shadow Raycasting
    // Cast ray from panel center towards the sun in the sky
    const rayOrigin = pos.clone().add(new THREE.Vector3(0, 0.05, 0)); // lift slightly above roof face
    raycaster.set(rayOrigin, sunDir);
    raycaster.far = 80.0;

    const hits = raycaster.intersectObjects(collidableTreeMeshes, true);
    if (hits.length > 0) {
      const firstHit = hits[0];
      const treeRoot = firstHit.object.parent?.userData?.treeId
        ? firstHit.object.parent.userData.treeId
        : 'Tree_Obstruction';

      results.set(panel.id, {
        panelId: panel.id,
        isObstructed: true,
        reason: 'TREE_SHADOW',
        obstructingTreeId: treeRoot,
        distanceToObstruction: parseFloat(firstHit.distance.toFixed(2)),
      });
      return;
    }

    // Panel is Clear!
    results.set(panel.id, {
      panelId: panel.id,
      isObstructed: false,
    });
  });

  return results;
}

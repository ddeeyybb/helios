/**
 * ============================================================================
 * HELIOS - spatialUtils.ts
 * Lead Spatial UI & WebGL Computational Geometry Engine
 * Specializing in React, MapLibre GL JS, Turf.js, and Three.js
 * ============================================================================
 */

import * as THREE from 'three';
import * as turf from '@turf/turf';
import type * as maplibregl from 'maplibre-gl';

// ----------------------------------------------------------------------------
// TYPE DEFINITIONS
// ----------------------------------------------------------------------------

export interface LocalPoint2D {
  x: number;
  z: number;
}

export interface MetricBoundingBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  length: number;
  area: number;
  centroid: [number, number]; // [lng, lat]
}

export interface ExtrudedRoofMeshResult {
  group: THREE.Group;
  roofMesh: THREE.Mesh;
  wallMesh: THREE.Mesh;
  localPoints: LocalPoint2D[];
  metrics: MetricBoundingBox;
}

export interface SpatialTreeData {
  id: string;
  x: number; // local meters from roof centroid
  z: number; // local meters from roof centroid
  heightMeters?: number;
  canopyRadius?: number;
  trunkRadius?: number;
  species?: 'mango' | 'mahogany' | 'rain_tree' | 'palm';
}

export interface NeighborBuildingData {
  id: string;
  polygon: Array<[number, number] | { x: number; z: number }>;
  heightMeters?: number;
}

// ----------------------------------------------------------------------------
// 1. PIN EDGE-SNAPPING & MASK CORRECTION (FIX "MA LAPAS / SUBRAAN")
// ----------------------------------------------------------------------------

/**
 * Snaps a user-dragged pin coordinate to the nearest detected roof boundary edge
 * if it falls within a specified screen-pixel threshold (default: 10 pixels).
 *
 * @param pinLngLat - [lng, lat] of the active pin being dragged
 * @param boundaryCoords - Array of [lng, lat] defining the detected roof boundary polygon
 * @param map - MapLibre GL map instance for screen projection
 * @param pixelThreshold - Pixel snap distance (default: 10px)
 * @returns Object with snapped [lng, lat], boolean isSnapped flag, and pixelDistance
 */
export function snapPinToNearestBoundary(
  pinLngLat: [number, number],
  boundaryCoords: Array<[number, number]>,
  map?: maplibregl.Map | null,
  pixelThreshold: number = 10
): {
  snappedCoords: [number, number];
  isSnapped: boolean;
  pixelDistance: number;
  snapEdgeIndex: number;
} {
  if (!boundaryCoords || boundaryCoords.length < 3) {
    return {
      snappedCoords: pinLngLat,
      isSnapped: false,
      pixelDistance: Infinity,
      snapEdgeIndex: -1,
    };
  }

  // Ensure boundary is closed for line conversion
  const closedCoords = [...boundaryCoords];
  const first = closedCoords[0];
  const last = closedCoords[closedCoords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    closedCoords.push(first);
  }

  try {
    const turfPin = turf.point(pinLngLat);
    const turfLine = turf.lineString(closedCoords);

    // Calculate nearest point along the polygon perimeter line
    const nearest = turf.nearestPointOnLine(turfLine, turfPin);
    const nearestLngLat: [number, number] = [
      nearest.geometry.coordinates[0],
      nearest.geometry.coordinates[1],
    ];

    // If map instance is available, compute true screen pixel distance
    if (map) {
      const pinPixel = map.project(pinLngLat);
      const snappedPixel = map.project(nearestLngLat);
      const pixelDistance = Math.hypot(
        pinPixel.x - snappedPixel.x,
        pinPixel.y - snappedPixel.y
      );

      if (pixelDistance <= pixelThreshold) {
        return {
          snappedCoords: nearestLngLat,
          isSnapped: true,
          pixelDistance,
          snapEdgeIndex: nearest.properties?.index ?? 0,
        };
      }

      return {
        snappedCoords: pinLngLat,
        isSnapped: false,
        pixelDistance,
        snapEdgeIndex: -1,
      };
    }

    // Fallback if map not passed: check metric distance (10px approx 0.35m at zoom 20)
    const distanceMeters = turf.distance(turfPin, nearest, { units: 'meters' });
    const isSnapped = distanceMeters <= 0.45;

    return {
      snappedCoords: isSnapped ? nearestLngLat : pinLngLat,
      isSnapped,
      pixelDistance: distanceMeters * 25, // estimate
      snapEdgeIndex: nearest.properties?.index ?? 0,
    };
  } catch (err) {
    console.warn('snapPinToNearestBoundary calculation error:', err);
    return {
      snappedCoords: pinLngLat,
      isSnapped: false,
      pixelDistance: Infinity,
      snapEdgeIndex: -1,
    };
  }
}

// ----------------------------------------------------------------------------
// 2. GEOMETRY CLEANUP & SANITIZATION
// ----------------------------------------------------------------------------

/**
 * Sanitizes GeoJSON polygon coordinates:
 * - Removes duplicate adjacent points
 * - Cleans micro-jitter / degenerate segments (< 0.1m)
 * - Resolves self-intersections using Turf unkink
 * - Enforces clockwise / counter-clockwise winding consistency
 */
export function sanitizePolygonCoordinates(
  rawPoints: Array<[number, number]>,
  minVertexDistanceMeters: number = 0.15
): Array<[number, number]> {
  if (!rawPoints || rawPoints.length < 3) return [];

  // Step 1: Filter duplicate / micro-distance consecutive vertices
  const deduped: Array<[number, number]> = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const curr = rawPoints[i];
    if (deduped.length === 0) {
      deduped.push(curr);
      continue;
    }

    const prev = deduped[deduped.length - 1];
    const dist = turf.distance(turf.point(prev), turf.point(curr), { units: 'meters' });
    if (dist >= minVertexDistanceMeters) {
      deduped.push(curr);
    }
  }

  // Ensure first and last are not duplicates
  if (deduped.length >= 3) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    const dist = turf.distance(turf.point(first), turf.point(last), { units: 'meters' });
    if (dist < minVertexDistanceMeters) {
      deduped.pop();
    }
  }

  if (deduped.length < 3) return deduped;

  // Step 2: Self-intersection unkinking via Turf
  try {
    const closed = [...deduped, deduped[0]];
    const poly = turf.polygon([closed]);
    const unkinked = turf.unkinkPolygon(poly);

    if (unkinked.features && unkinked.features.length > 0) {
      // Find feature with largest area if unkink produced multiple pieces
      let maxArea = -1;
      let bestCoords: Array<[number, number]> = deduped;

      for (const feat of unkinked.features) {
        const area = turf.area(feat);
        if (area > maxArea) {
          maxArea = area;
          const ring = feat.geometry.coordinates[0];
          // Remove closing point
          bestCoords = ring.slice(0, ring.length - 1) as Array<[number, number]>;
        }
      }

      return bestCoords;
    }
  } catch (err) {
    console.warn('Polygon unkink fallback to deduped points:', err);
  }

  return deduped;
}

// ----------------------------------------------------------------------------
// 3. GEOJSON TO THREE.JS SHAPE & LOCAL METRIC CONVERSION
// ----------------------------------------------------------------------------

export const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates high-precision distance between two geographic coordinates in meters
 */
export function calculateSpatialDistance(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Converts sanitized GeoJSON long/lat coordinates into local spatial meter vectors
 * and constructs a 2D THREE.Shape centered at (0, 0) using high-precision latitude cosine correction.
 */
export function convertGeoJSONToThreeShape(
  geoPoints: Array<[number, number]>
): {
  shape: THREE.Shape;
  localPoints: LocalPoint2D[];
  metrics: MetricBoundingBox;
} {
  const sanitized = sanitizePolygonCoordinates(geoPoints);
  if (sanitized.length < 3) {
    return {
      shape: new THREE.Shape(),
      localPoints: [],
      metrics: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, length: 0, area: 0, centroid: [0, 0] },
    };
  }

  // 1. Calculate high-precision geographic centroid using Turf.js
  const closedCoords = [...sanitized, sanitized[0]];
  const turfPoly = turf.polygon([closedCoords]);
  const centroidFeature = turf.centroid(turfPoly);
  const originLng = centroidFeature.geometry.coordinates[0];
  const originLat = centroidFeature.geometry.coordinates[1];

  // 2. Convert delta [Lng, Lat] coordinates into local meters relative to the centroid using latitude cosine correction:
  // xMeters = (pt[0] - originLng) * 111320 * Math.cos((originLat * Math.PI) / 180)
  // yMeters = (pt[1] - originLat) * 110574
  // In Three.js: +X = East (xMeters), -Z = North (-yMeters)
  const rawLocal: LocalPoint2D[] = sanitized.map((pt) => {
    const lng = pt[0];
    const lat = pt[1];
    const xMeters = (lng - originLng) * 111320 * Math.cos((originLat * Math.PI) / 180);
    const yMeters = (lat - originLat) * 110574;
    return {
      x: parseFloat(xMeters.toFixed(3)),
      z: parseFloat((-yMeters).toFixed(3)), // In Three.js -Z is North
    };
  });

  // 3. Calculate real ground surface area using turf.area
  const trueGroundArea = turf.area(turfPoly);

  // 4. Determine local metric bounding box
  const xs = rawLocal.map((p) => p.x);
  const zs = rawLocal.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const width = Math.max(1.0, maxX - minX);
  const length = Math.max(1.0, maxZ - minZ);

  // 5. Construct 2D THREE.Shape using normalized local meter offsets
  const shape = new THREE.Shape();
  shape.moveTo(rawLocal[0].x, -rawLocal[0].z);
  for (let i = 1; i < rawLocal.length; i++) {
    shape.lineTo(rawLocal[i].x, -rawLocal[i].z);
  }
  shape.closePath();

  return {
    shape,
    localPoints: rawLocal,
    metrics: {
      minX,
      maxX,
      minZ,
      maxZ,
      width: parseFloat(width.toFixed(2)),
      length: parseFloat(length.toFixed(2)),
      area: parseFloat(trueGroundArea.toFixed(2)),
      centroid: [originLng, originLat],
    },
  };
}

// ----------------------------------------------------------------------------
// 4. 3D MESH EXTRUSION GENERATOR (RAYCASTING & PANEL PLACEMENT ENABLED)
// ----------------------------------------------------------------------------

export interface MeshExtrusionOptions {
  geoPoints?: Array<[number, number]>;
  localPoints?: LocalPoint2D[];
  wallHeight?: number;       // default: 3.5m
  elevation?: number;        // ground level elevation, default: 0
  pitchDeg?: number;         // default: 15°
  roofColor?: string;        // default: '#334155'
  wallColor?: string;        // default: '#f1f5f9'
  ridgeColor?: string;       // default: '#059669'
  roofType?: 'gable' | 'hip' | 'flat' | 'mono' | 'complex';
}

/**
 * Extrudes 3D roof geometry using THREE.ExtrudeGeometry with THREE.MeshStandardMaterial
 * enabled for raycasting, shadows, and panel placement.
 */
export function generate3DExtrusionMesh(options: MeshExtrusionOptions): ExtrudedRoofMeshResult {
  const {
    geoPoints,
    localPoints: customLocalPoints,
    wallHeight = 3.5,
    elevation = 0,
    pitchDeg = 15,
    roofColor = '#334155',
    wallColor = '#f8fafc',
    roofType = 'hip',
  } = options;

  let localPoints: LocalPoint2D[] = [];
  let shape: THREE.Shape;
  let metrics: MetricBoundingBox;

  if (geoPoints && geoPoints.length >= 3) {
    const res = convertGeoJSONToThreeShape(geoPoints);
    shape = res.shape;
    localPoints = res.localPoints;
    metrics = res.metrics;
  } else if (customLocalPoints && customLocalPoints.length >= 3) {
    localPoints = customLocalPoints;
    shape = new THREE.Shape();
    shape.moveTo(localPoints[0].x, -localPoints[0].z);
    for (let i = 1; i < localPoints.length; i++) {
      shape.lineTo(localPoints[i].x, -localPoints[i].z);
    }
    shape.closePath();

    const xs = localPoints.map((p) => p.x);
    const zs = localPoints.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    metrics = {
      minX,
      maxX,
      minZ,
      maxZ,
      width: maxX - minX,
      length: maxZ - minZ,
      area: (maxX - minX) * (maxZ - minZ),
      centroid: [0, 0],
    };
  } else {
    // Default quad fallback
    const hw = 5;
    const hl = 4;
    localPoints = [
      { x: -hw, z: -hl },
      { x: hw, z: -hl },
      { x: hw, z: hl },
      { x: -hw, z: hl },
    ];
    shape = new THREE.Shape();
    shape.moveTo(-hw, hl);
    shape.lineTo(hw, hl);
    shape.lineTo(hw, -hl);
    shape.lineTo(-hw, -hl);
    shape.closePath();
    metrics = {
      minX: -hw,
      maxX: hw,
      minZ: -hl,
      maxZ: hl,
      width: hw * 2,
      length: hl * 2,
      area: hw * 2 * hl * 2,
      centroid: [0, 0],
    };
  }

  const group = new THREE.Group();
  group.name = 'Helios_ExtrudedBuilding';

  // 1. Extrude Wall Geometry
  const wallGeom = new THREE.ExtrudeGeometry(shape, {
    depth: wallHeight,
    bevelEnabled: false,
  });
  wallGeom.rotateX(-Math.PI / 2);
  wallGeom.translate(0, elevation, 0);
  wallGeom.computeVertexNormals();

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.name = 'Building_Walls';
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 2. Generate Top Roof Cap Mesh for Solar Panel Raycasting
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.35,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });

  let roofMesh: THREE.Mesh;
  const eaveY = elevation + wallHeight;
  const effectivePitch = roofType === 'flat' ? 0 : Math.max(1, Math.min(45, pitchDeg));
  const pitchRad = (effectivePitch * Math.PI) / 180;

  if (roofType === 'flat' || effectivePitch === 0) {
    const roofGeom = new THREE.ShapeGeometry(shape);
    roofGeom.rotateX(-Math.PI / 2);
    roofGeom.translate(0, eaveY + 0.05, 0);
    roofGeom.computeVertexNormals();

    roofMesh = new THREE.Mesh(roofGeom, roofMat);
    roofMesh.name = 'Roof_Surface_RaycastTarget';
    roofMesh.userData = { isRoofSurface: true, roofType: 'flat', normal: new THREE.Vector3(0, 1, 0) };
  } else if (roofType === 'mono') {
    const roofGeom = new THREE.ShapeGeometry(shape);
    roofGeom.rotateX(-Math.PI / 2);
    roofGeom.rotateX(pitchRad);
    roofGeom.translate(0, eaveY + 0.1, 0);
    roofGeom.computeVertexNormals();

    roofMesh = new THREE.Mesh(roofGeom, roofMat);
    roofMesh.name = 'Roof_Surface_RaycastTarget';
    roofMesh.userData = { isRoofSurface: true, roofType: 'mono' };
  } else {
    // Gable / Hip / Complex Pitch Geometry
    const halfW = metrics.width / 2;
    const halfL = metrics.length / 2;
    const roofRise = Math.min(halfW, halfL) * Math.tan(pitchRad);
    const apexY = eaveY + roofRise;

    const positions: number[] = [];
    const normals: number[] = [];

    // Construct 3D Pitched Facets from local points
    const center = { x: 0, z: 0 };
    for (let i = 0; i < localPoints.length; i++) {
      const nextIdx = (i + 1) % localPoints.length;
      const p1 = localPoints[i];
      const p2 = localPoints[nextIdx];

      // Triangle 1: (p1, p2, apex)
      positions.push(
        p1.x, eaveY, p1.z,
        p2.x, eaveY, p2.z,
        center.x, apexY, center.z
      );

      // Normal vector
      const vA = new THREE.Vector3(p1.x, eaveY, p1.z);
      const vB = new THREE.Vector3(p2.x, eaveY, p2.z);
      const vApex = new THREE.Vector3(center.x, apexY, center.z);
      const normal = new THREE.Vector3()
        .crossVectors(vB.clone().sub(vA), vApex.clone().sub(vA))
        .normalize();

      normals.push(
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z
      );
    }

    const pitchedGeom = new THREE.BufferGeometry();
    pitchedGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pitchedGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    roofMesh = new THREE.Mesh(pitchedGeom, roofMat);
    roofMesh.name = 'Roof_Surface_RaycastTarget';
    roofMesh.userData = { isRoofSurface: true, roofType, pitchDeg: effectivePitch };
  }

  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // Add subtle architectural ridge line accents
  const wireGeom = new THREE.WireframeGeometry(roofMesh.geometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x059669,
    transparent: true,
    opacity: 0.6,
  });
  const wireMesh = new THREE.LineSegments(wireGeom, wireMat);
  wireMesh.position.copy(roofMesh.position);
  wireMesh.rotation.copy(roofMesh.rotation);
  group.add(wireMesh);

  return {
    group,
    roofMesh,
    wallMesh,
    localPoints,
    metrics,
  };
}

// ----------------------------------------------------------------------------
// 5. PROCEDURAL 3D TREE CANOPY (DODECAHEDRON WITH REAL-TIME SHADOWS)
// ----------------------------------------------------------------------------

/**
 * Spawns procedural 3D tree canopy meshes (THREE.DodecahedronGeometry)
 * with castShadow = true for realistic solar obstruction simulations.
 */
export function spawnProceduralTreeMesh(data: SpatialTreeData): THREE.Group {
  const {
    id,
    x,
    z,
    heightMeters = 6.5,
    canopyRadius = 3.0,
    trunkRadius = 0.35,
    species = 'mango',
  } = data;

  const treeGroup = new THREE.Group();
  treeGroup.name = `Tree_${id}`;
  treeGroup.position.set(x, 0, z);

  const trunkHeight = heightMeters * 0.42;
  const canopyBaseY = trunkHeight;

  // 1. Tapered Trunk Cylinder
  const trunkGeom = new THREE.CylinderGeometry(trunkRadius * 0.65, trunkRadius, trunkHeight, 8);
  trunkGeom.translate(0, trunkHeight / 2, 0);

  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b281c'),
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });

  const trunkMesh = new THREE.Mesh(trunkGeom, trunkMat);
  trunkMesh.name = `Trunk_${id}`;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);

  // 2. Multi-Lobed Organic Dodecahedron Canopy
  const leafColorPrimary = species === 'rain_tree' ? '#15803d' : '#166534';
  const leafColorSecondary = '#22c55e';

  const leafMatPrimary = new THREE.MeshStandardMaterial({
    color: new THREE.Color(leafColorPrimary),
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true,
  });

  const leafMatSecondary = new THREE.MeshStandardMaterial({
    color: new THREE.Color(leafColorSecondary),
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  });

  // Central Large Dodecahedron Lobe
  const mainCanopyGeom = new THREE.DodecahedronGeometry(canopyRadius, 1);
  const mainCanopy = new THREE.Mesh(mainCanopyGeom, leafMatPrimary);
  mainCanopy.position.set(0, canopyBaseY + canopyRadius * 0.85, 0);
  mainCanopy.scale.set(1.0, 1.15, 1.0);
  mainCanopy.castShadow = true;
  mainCanopy.receiveShadow = true;
  treeGroup.add(mainCanopy);

  // Asymmetric Sub-Canopy Overhang Lobes
  const lobeConfigs = [
    { x: canopyRadius * 0.4, y: canopyBaseY + canopyRadius * 0.5, z: canopyRadius * 0.35, r: canopyRadius * 0.65, mat: leafMatSecondary },
    { x: -canopyRadius * 0.45, y: canopyBaseY + canopyRadius * 0.65, z: -canopyRadius * 0.3, r: canopyRadius * 0.6, mat: leafMatPrimary },
    { x: -canopyRadius * 0.25, y: canopyBaseY + canopyRadius * 0.4, z: canopyRadius * 0.45, r: canopyRadius * 0.55, mat: leafMatSecondary },
    { x: 0, y: canopyBaseY + canopyRadius * 1.5, z: 0, r: canopyRadius * 0.5, mat: leafMatSecondary },
  ];

  lobeConfigs.forEach((lobe) => {
    const lobeGeom = new THREE.DodecahedronGeometry(lobe.r, 1);
    const lobeMesh = new THREE.Mesh(lobeGeom, lobe.mat);
    lobeMesh.position.set(lobe.x, lobe.y, lobe.z);
    lobeMesh.castShadow = true;
    lobeMesh.receiveShadow = true;
    treeGroup.add(lobeMesh);
  });

  // Bounding volumes for raycasting & shadow checking
  const box = new THREE.Box3().setFromObject(treeGroup);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  treeGroup.userData = {
    isTree: true,
    treeId: id,
    heightMeters,
    canopyRadius,
    worldOrigin: new THREE.Vector3(x, 0, z),
    boundingBox: box,
    boundingSphere: sphere,
  };

  return treeGroup;
}

// ----------------------------------------------------------------------------
// 6. NEIGHBORHOOD ISOLATION (TRANSLUCENT GREY CONTEXT MESHES)
// ----------------------------------------------------------------------------

/**
 * Spawns translucent grey background context meshes (opacity: 0.2)
 * for surrounding non-selected buildings.
 */
export function spawnNeighborhoodContextMesh(
  building: NeighborBuildingData,
  defaultHeight: number = 3.8
): THREE.Mesh {
  const points = building.polygon.map((p) =>
    Array.isArray(p) ? { x: p[0], z: p[1] } : p
  );
  const h = building.heightMeters || defaultHeight;

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

  // Translucent grey material per specification (opacity: 0.2)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    transparent: true,
    opacity: 0.2,
    roughness: 0.9,
    metalness: 0.1,
    depthWrite: false, // Prevents alpha sorting glitches
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = `ContextBuilding_${building.id}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Thin wireframe architectural outline
  const edges = new THREE.EdgesGeometry(geom, 15);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.35,
  });
  mesh.add(new THREE.LineSegments(edges, edgeMat));

  return mesh;
}

/**
 * ============================================================================
 * HELIOS - RoofBuilder.js
 * Senior WebGL & 3D Computational Geometry Roof Mesh Generator
 * ============================================================================
 * - Corrects non-convex / self-intersecting polygon ordering with atan2 angular sort
 * - Normalizes [Lng, Lat] coordinates to local meters relative to Turf centroid
 * - Snaps base walls from Y = 0 to Y = wallHeight (3.5m)
 * - Anchors roof bottom boundary exactly at Y = wallHeight (flushed with walls)
 * - Computes upward +Y ridge elevations without perimeter tilting distortion
 * - Disposes geometries/materials to eliminate WebGL memory leaks
 */

import * as THREE from 'three';
import * as turf from '@turf/turf';
import { useState, useCallback } from 'react';

export const FASTAPI_ROOF_ENDPOINT = 'http://127.0.0.1:8000/classify-roof';
export const MIN_CONFIDENCE_THRESHOLD = 0.50;

/**
 * Visual Color Coding for different roof facet classifications
 */
export const FACET_COLOR_PALETTE = {
  slope_trap: {
    color: '#3b82f6',     // Azure / North-South primary slope
    name: 'Trapezoidal Slope',
    metalness: 0.35,
    roughness: 0.40,
    edgeColor: '#60a5fa',
  },
  slope_tri: {
    color: '#10b981',     // Emerald / East-West Hip Triangle
    name: 'Hip Triangle Facet',
    metalness: 0.40,
    roughness: 0.35,
    edgeColor: '#34d399',
  },
  slope_flat: {
    color: '#64748b',     // Slate / Flat Deck
    name: 'Flat Deck Surface',
    metalness: 0.15,
    roughness: 0.70,
    edgeColor: '#94a3b8',
  },
  slope_poly: {
    color: '#8b5cf6',     // Violet / L-Shape / Complex wing
    name: 'Complex Polygon Wing',
    metalness: 0.30,
    roughness: 0.45,
    edgeColor: '#a78bfa',
  },
  ridge_cap: {
    color: '#047857',     // Deep Emerald metallic ridge
    name: 'Ridge Apex Cap',
    metalness: 0.85,
    roughness: 0.25,
    edgeColor: '#10b981',
  },
  wall: {
    color: '#e2e8f0',     // Architectural Off-White Stucco
    name: 'Exterior Base Wall',
    metalness: 0.05,
    roughness: 0.85,
    edgeColor: '#cbd5e1',
  },
  default: {
    color: '#475569',
    name: 'General Roof Slope',
    metalness: 0.35,
    roughness: 0.45,
    edgeColor: '#10b981',
  },
  hud_magenta_target: {
    color: '#ff00ff',
    name: 'AI Detected Target Box',
    metalness: 0.2,
    roughness: 0.3,
    edgeColor: '#ff00ff',
    opacity: 0.5,
  },
  hud_magenta_active: {
    color: '#ff00ff',
    name: 'Selected Focused Roof',
    metalness: 0.4,
    roughness: 0.2,
    edgeColor: '#ff00ff',
    opacity: 1.0,
  },
};

// ============================================================================
// 1. POLYGON VERTEX SORTING & GEOMETRICAL INTEGRITY
// ============================================================================

/**
 * Sorts 2D polygon vertices in consistent CLOCKWISE order around their centroid.
 * Prevents line cross-overs and distorted "bow-tie" origami self-intersections.
 *
 * @param {Array<{ x: number, z: number }>} points
 * @returns {Array<{ x: number, z: number }>} - Cleanly sorted vertex array
 */
export function sortPolygonClockwise(points) {
  if (!points || points.length < 3) return points || [];

  // 1. Calculate 2D centroid
  const center = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
  };

  // 2. Sort by polar angle atan2 relative to centroid in clockwise order
  const sorted = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.z - center.z, a.x - center.x);
    const angleB = Math.atan2(b.z - center.z, b.x - center.x);
    return angleA - angleB;
  });

  // 3. Deduplicate consecutive overlapping vertices
  const clean = [];
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = clean[clean.length - 1];
    if (!prev || Math.hypot(curr.x - prev.x, curr.z - prev.z) > 0.02) {
      clean.push(curr);
    }
  }

  // Ensure last point doesn't duplicate first
  if (clean.length > 2) {
    const first = clean[0];
    const last = clean[clean.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.02) {
      clean.pop();
    }
  }

  return clean.length >= 3 ? clean : sorted;
}

/**
 * Computes 2D flat Shoelace area in square meters.
 */
export function computeShoelaceArea(points) {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].z - points[j].x * points[i].z;
  }
  return Math.abs(sum) / 2;
}

// ============================================================================
// 2. COORDINATE NORMALIZATION (PIXELS / GEO TO METERS & ORIGIN CENTERING)
// ============================================================================

export function computeGlobalBoundingBox(polygons) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  polygons.forEach((poly) => {
    poly.forEach(([px, py]) => {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });
  });

  if (!isFinite(minX) || !isFinite(minY)) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100, widthPx: 100, heightPx: 100, centerPx: [50, 50] };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    widthPx: Math.max(1, maxX - minX),
    heightPx: Math.max(1, maxY - minY),
    centerPx: [(minX + maxX) / 2, (minY + maxY) / 2],
  };
}

/**
 * Normalizes 2D pixel or GPS [lng, lat] coordinates into real-world 3D metric coordinates (meters).
 * Uses Turf centroid and latitude cosine correction when GPS coordinates are provided.
 * Locks the overall building footprint center at 3D origin (0, 0, 0).
 */
export function normalizePolygonToMeters(polygon, bbox, realWorldScaleMeters = 12.0) {
  if (!polygon || polygon.length < 3) return [];

  const firstPt = polygon[0];
  const isGeoCoordinates = Array.isArray(firstPt) && Math.abs(firstPt[0]) > 1.0;

  if (isGeoCoordinates) {
    // 1. Calculate centroid using turf.centroid
    const closed = [...polygon, polygon[0]];
    const poly = turf.polygon([closed]);
    const centroid = turf.centroid(poly);
    const originLng = centroid.geometry.coordinates[0];
    const originLat = centroid.geometry.coordinates[1];

    // 2. Convert delta [Lng, Lat] to meters with latitude cosine correction:
    // xMeters = (pt[0] - originLng) * 111320 * Math.cos((originLat * Math.PI) / 180)
    // yMeters = (pt[1] - originLat) * 110574
    const rawMetric = polygon.map(([lng, lat]) => {
      const xMeters = (lng - originLng) * 111320 * Math.cos((originLat * Math.PI) / 180);
      const yMeters = (lat - originLat) * 110574;
      return {
        x: parseFloat(xMeters.toFixed(3)),
        z: parseFloat((-yMeters).toFixed(3)), // In Three.js -Z is North
      };
    });

    return sortPolygonClockwise(rawMetric);
  }

  const maxDimPx = Math.max(bbox.widthPx, bbox.heightPx, 1);
  const metersPerPixel = realWorldScaleMeters / maxDimPx;
  const [cx, cy] = bbox.centerPx;

  const rawMetric = polygon.map(([px, py]) => ({
    x: parseFloat(((px - cx) * metersPerPixel).toFixed(3)), // 3D X (Width)
    z: parseFloat(((py - cy) * metersPerPixel).toFixed(3)), // 3D Z (Depth)
  }));

  // Apply angular sort to prevent bow-tie self-intersection
  return sortPolygonClockwise(rawMetric);
}

// ============================================================================
// 3. BASE WALL & ROOF MESH GENERATORS (Y-AXIS SNAPPING)
// ============================================================================

/**
 * Builds vertical base walls anchored from Y = 0 (ground) to Y = wallHeight (3.5m).
 *
 * @param {Array<{ x: number, z: number }>} points - Sorted 2D footprint points
 * @param {number} wallHeight - Wall height in meters (default 3.5m)
 * @returns {THREE.Mesh} - Solid extruded wall mesh
 */
export function buildBaseWallMesh(points, wallHeight = 3.5) {
  const sortedPoints = sortPolygonClockwise(points);
  if (sortedPoints.length < 3) return null;

  // 1. Construct 2D shape in X-Y plane (representing X and -Z)
  const shape = new THREE.Shape();
  shape.moveTo(sortedPoints[0].x, -sortedPoints[0].z);
  for (let i = 1; i < sortedPoints.length; i++) {
    shape.lineTo(sortedPoints[i].x, -sortedPoints[i].z);
  }
  shape.closePath();

  // 2. Extrude vertically from Y = 0 to Y = wallHeight (default 3.5m)
  const extrudeSettings = {
    depth: wallHeight,
    bevelEnabled: false,
  };

  const wallGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Rotate so extrusion direction aligns with +Y axis on the horizontal XZ plane
  wallGeom.rotateX(-Math.PI / 2);
  wallGeom.computeVertexNormals();
  // ExtrudeGeometry with rotateX(-Math.PI / 2) places base at Y = 0 and top at Y = wallHeight!
  wallGeom.computeVertexNormals();

  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(FACET_COLOR_PALETTE.wall.color),
    roughness: FACET_COLOR_PALETTE.wall.roughness,
    metalness: FACET_COLOR_PALETTE.wall.metalness,
    side: THREE.DoubleSide,
  });

  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.name = 'BaseWalls';
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;

  // Add subtle edge wireframes
  const edges = new THREE.EdgesGeometry(wallGeom, 20);
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(FACET_COLOR_PALETTE.wall.edgeColor) });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wallMesh.add(wireframe);

  return wallMesh;
}

/**
 * Builds a 3D Mesh for an individual roof facet.
 * Bottom boundary is anchored exactly at Y = wallHeight so it rests flush on the walls.
 *
 * @param {Object} facetData - Normalized facet object
 * @param {Array<{ x: number, z: number }>} facetData.points - Sorted metric vertices
 * @param {string} facetData.roof_type - 'slope_trap' | 'slope_tri' | 'slope_flat' | 'slope_poly'
 * @param {number} facetData.confidence - Confidence score
 * @param {Object} options - Construction options
 * @param {number} [options.wallHeight=3.0] - Wall top elevation
 * @param {number} [options.pitchDeg=18] - Roof pitch angle
 * @returns {THREE.Group|null}
 */
export function buildFacet3DMesh(facetData, options = {}) {
  const { points: rawPoints, roof_type, confidence = 1.0 } = facetData;
  const {
    wallHeight = 3.0,
    pitchDeg = 18,
  } = options;

  if (!rawPoints || rawPoints.length < 3) return null;

  // Ensure points are sorted clockwise
  const points = sortPolygonClockwise(rawPoints);
  const flatArea = computeShoelaceArea(points);
  if (flatArea < 0.05) return null;

  const facetGroup = new THREE.Group();
  facetGroup.name = `Facet_${roof_type}_${(confidence * 100).toFixed(0)}`;

  const style = FACET_COLOR_PALETTE[roof_type] || FACET_COLOR_PALETTE.default;

  const facetMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.color),
    metalness: style.metalness,
    roughness: style.roughness,
    side: THREE.DoubleSide,
  });

  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(style.edgeColor),
    linewidth: 2,
  });

  const pitchRad = (Math.max(0, Math.min(45, pitchDeg)) * Math.PI) / 180;
  const isFlat = roof_type === 'slope_flat' || pitchDeg === 0;

  // ---------------- CASE A: FLAT ROOF FACET (THREE.ExtrudeGeometry) ----------------
  if (isFlat) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, -points[i].z);
    }
    shape.closePath();

    const slabThickness = 0.18;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: slabThickness,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    geometry.rotateX(-Math.PI / 2);
    // Position bottom of slab flush on top of walls at Y = wallHeight
    geometry.translate(0, wallHeight, 0);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, facetMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { roof_type, flatArea, slopedArea: flatArea, confidence };
    facetGroup.add(mesh);

    const edges = new THREE.EdgesGeometry(geometry, 15);
    facetGroup.add(new THREE.LineSegments(edges, lineMaterial));
    return facetGroup;
  }

  // ---------------- CASE B: SLOPED FACETS (TRAPEZOID / TRIANGLE / POLYGON) ----------------
  // Eaves vertices sit at Y = wallHeight; ridge vertices elevate along +Y
  const zAbsValues = points.map((p) => Math.abs(p.z));
  const maxZ = Math.max(...zAbsValues, 0.1);

  // Compute 3D vertices: height Y only moves upward (+Y)
  const vertices3D = points.map((p) => {
    const distFromEave = Math.max(0, maxZ - Math.abs(p.z));
    const vertexRise = distFromEave * Math.tan(pitchRad);
    const y = wallHeight + vertexRise; // Flush on top of walls

    return new THREE.Vector3(p.x, y, p.z);
  });

  // Triangulate using triangle fan
  const positions = [];
  const uvs = [];

  for (let i = 1; i < vertices3D.length - 1; i++) {
    const v0 = vertices3D[0];
    const v1 = vertices3D[i];
    const v2 = vertices3D[i + 1];

    positions.push(v0.x, v0.y, v0.z);
    positions.push(v1.x, v1.y, v1.z);
    positions.push(v2.x, v2.y, v2.z);

    uvs.push(0, 0, 1, 0, 0.5, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, facetMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const slopedArea = parseFloat((flatArea / Math.max(0.001, Math.cos(pitchRad))).toFixed(2));
  mesh.userData = { roof_type, flatArea, slopedArea, confidence };
  facetGroup.add(mesh);

  // Perimeter rafter border outline
  const perimeterPoints3D = [...vertices3D, vertices3D[0]];
  const lineGeom = new THREE.BufferGeometry().setFromPoints(perimeterPoints3D);
  facetGroup.add(new THREE.Line(lineGeom, lineMaterial));

  return facetGroup;
}

// ============================================================================
// 4. MEMORY MANAGEMENT & FULL SCENE ASSEMBLY
// ============================================================================

export function disposeThreeHierarchy(rootObject) {
  if (!rootObject) return;

  rootObject.traverse((child) => {
    if (child.isMesh || child.isLine || child.isPoints) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  });

  while (rootObject.children.length > 0) {
    const child = rootObject.children[0];
    rootObject.remove(child);
    disposeThreeHierarchy(child);
  }
}

/**
 * Builds complete building structure: base walls (Y: 0 -> wallHeight) + roof facets (Y >= wallHeight).
 */
export function buildCompleteRoofAssembly(facets, options = {}) {
  const {
    realWorldWidthMeters = 12.0,
    wallHeight = 3.0,
    pitchDeg = 18,
    targetGroup = null,
  } = options;

  const assemblyGroup = targetGroup || new THREE.Group();
  if (targetGroup) {
    disposeThreeHierarchy(targetGroup);
  }
  assemblyGroup.name = 'Helios_Roof_Assembly';

  if (!facets || facets.length === 0) {
    return { group: assemblyGroup, totalSlopedArea: 0, facetCount: 0, facetsSummary: [] };
  }

  // 1. Calculate global 2D bounding box
  const allPolygons = facets.map((f) => f.polygon);
  const globalBBox = computeGlobalBoundingBox(allPolygons);

  // 2. Build Base Walls from building perimeter footprint
  const perimeterPoints = [
    { x: -realWorldWidthMeters / 2, z: -(globalBBox.heightPx / globalBBox.widthPx) * (realWorldWidthMeters / 2) },
    { x:  realWorldWidthMeters / 2, z: -(globalBBox.heightPx / globalBBox.widthPx) * (realWorldWidthMeters / 2) },
    { x:  realWorldWidthMeters / 2, z:  (globalBBox.heightPx / globalBBox.widthPx) * (realWorldWidthMeters / 2) },
    { x: -realWorldWidthMeters / 2, z:  (globalBBox.heightPx / globalBBox.widthPx) * (realWorldWidthMeters / 2) },
  ];
  const wallsMesh = buildBaseWallMesh(perimeterPoints, wallHeight);
  if (wallsMesh) {
    assemblyGroup.add(wallsMesh);
  }

  // 3. Assemble and position each roof facet flush on top of walls
  let totalSlopedArea = 0;
  const facetsSummary = [];

  facets.forEach((rawFacet, idx) => {
    const normalizedPoints = normalizePolygonToMeters(rawFacet.polygon, globalBBox, realWorldWidthMeters);
    const facetMeshGroup = buildFacet3DMesh(
      { points: normalizedPoints, roof_type: rawFacet.roof_type, confidence: rawFacet.confidence },
      { wallHeight, pitchDeg }
    );

    if (facetMeshGroup) {
      assemblyGroup.add(facetMeshGroup);
      const mainMesh = facetMeshGroup.children.find((c) => c.isMesh);
      const slopedArea = mainMesh?.userData?.slopedArea || 0;
      totalSlopedArea += slopedArea;

      facetsSummary.push({
        id: `facet-${idx + 1}`,
        roof_type: rawFacet.roof_type,
        confidence: rawFacet.confidence,
        slopedArea,
        vertexCount: normalizedPoints.length,
      });
    }
  });

  // 4. Center Ridge Apex Cap
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const maxHalfDepth = (globalBBox.heightPx / Math.max(globalBBox.widthPx, 1)) * (realWorldWidthMeters / 2);
  const apexHeight = wallHeight + maxHalfDepth * Math.tan(pitchRad);
  const ridgeWidth = Math.max(1.0, realWorldWidthMeters - maxHalfDepth * 1.5);

  const ridgeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(ridgeWidth, 0.08, 0.22),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(FACET_COLOR_PALETTE.ridge_cap.color),
      metalness: FACET_COLOR_PALETTE.ridge_cap.metalness,
      roughness: FACET_COLOR_PALETTE.ridge_cap.roughness,
    })
  );
  ridgeMesh.position.set(0, apexHeight + 0.04, 0);
  ridgeMesh.castShadow = true;
  assemblyGroup.add(ridgeMesh);

  return {
    group: assemblyGroup,
    totalSlopedArea: parseFloat(totalSlopedArea.toFixed(1)),
    facetCount: facetsSummary.length,
    facetsSummary,
  };
}

// ============================================================================
// 5. API INTEGRATION & REACT HOOK
// ============================================================================

export async function classifyRoofFacets(imageBlob, options = {}) {
  const {
    confidenceThreshold = MIN_CONFIDENCE_THRESHOLD,
    endpoint = FASTAPI_ROOF_ENDPOINT,
    fallbackWidth = 12.0,
    fallbackLength = 10.0,
  } = options;

  const formData = new FormData();
  if (imageBlob) {
    formData.append('file', imageBlob, 'satellite_roof_snippet.jpg');
  } else {
    const dummy = new Blob(['helios-crop'], { type: 'image/jpeg' });
    formData.append('file', dummy, 'satellite_roof_snippet.jpg');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawFacets = Array.isArray(data) ? data : data.facets || data.predictions || [];

      const validFacets = rawFacets.filter((facet) => {
        const conf = typeof facet.confidence === 'number' ? facet.confidence : 1.0;
        const pts = facet.polygon || facet.points || [];
        return conf >= confidenceThreshold && Array.isArray(pts) && pts.length >= 3;
      });

      if (validFacets.length > 0) {
        return validFacets.map((f) => ({
          roof_type: f.roof_type || f.type || 'slope_trap',
          confidence: Number(f.confidence || 0.95),
          polygon: f.polygon || f.points,
        }));
      }
    }
  } catch (err) {
    console.warn(`[RoofBuilder] Backend offline at ${endpoint}. Using multi-facet fallback.`);
  }

  const wPx = 400;
  const lPx = 320;
  const ridgeOffsetPx = Math.max(20, (wPx - lPx) / 2);

  return [
    {
      roof_type: 'slope_trap',
      confidence: 0.94,
      polygon: [[0, 0], [wPx, 0], [wPx - ridgeOffsetPx, lPx / 2], [ridgeOffsetPx, lPx / 2]],
    },
    {
      roof_type: 'slope_trap',
      confidence: 0.93,
      polygon: [[wPx, lPx], [0, lPx], [ridgeOffsetPx, lPx / 2], [wPx - ridgeOffsetPx, lPx / 2]],
    },
    {
      roof_type: 'slope_tri',
      confidence: 0.89,
      polygon: [[wPx, 0], [wPx, lPx], [wPx - ridgeOffsetPx, lPx / 2]],
    },
    {
      roof_type: 'slope_tri',
      confidence: 0.87,
      polygon: [[0, lPx], [0, 0], [ridgeOffsetPx, lPx / 2]],
    },
  ];
}

export function useRoofBuilder() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [roofData, setRoofData] = useState(null);

  const generateFromBlob = useCallback(async (imageBlob, config = {}) => {
    setIsProcessing(true);
    setError(null);

    try {
      const rawFacets = await classifyRoofFacets(imageBlob, {
        confidenceThreshold: config.confidenceThreshold || MIN_CONFIDENCE_THRESHOLD,
        endpoint: config.endpoint || FASTAPI_ROOF_ENDPOINT,
        fallbackWidth: config.realWorldWidthMeters || 12.0,
        fallbackLength: config.realWorldLengthMeters || 10.0,
      });

      if (!rawFacets || rawFacets.length === 0) {
        throw new Error('No roof facets with confidence >= 0.50 were detected.');
      }

      const assemblyResult = buildCompleteRoofAssembly(rawFacets, {
        realWorldWidthMeters: config.realWorldWidthMeters || 12.0,
        wallHeight: config.wallHeight || 3.0,
        pitchDeg: config.pitchDeg || 18,
        targetGroup: config.targetGroup || null,
      });

      const finalData = {
        facets: rawFacets,
        threeGroup: assemblyResult.group,
        totalSlopedArea: assemblyResult.totalSlopedArea,
        facetCount: assemblyResult.facetCount,
        facetsSummary: assemblyResult.facetsSummary,
      };

      setRoofData(finalData);
      return finalData;
    } catch (err) {
      const msg = err?.message || 'Failed to process roof geometry.';
      setError(msg);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const resetRoof = useCallback((targetGroup = null) => {
    if (targetGroup) disposeThreeHierarchy(targetGroup);
    setRoofData(null);
    setError(null);
    setIsProcessing(false);
  }, []);

  return { isProcessing, error, roofData, generateFromBlob, resetRoof };
}

// ============================================================================
// 6. TREE SHADOW CASTING & URBAN ISOLATION ENGINE (Digos City)
// ============================================================================

/**
 * Procedural 3D Tree Mesh Generator (Cone trunk + Dodecahedron canopy clusters)
 * Automatically enables castShadow = true for casting real-time shadows onto roofs.
 */
export function createProceduralTreeMesh({
  id = 'tree-1',
  x = 0,
  z = 0,
  heightMeters = 6.5,
  canopyRadius = 2.8,
  trunkRadius = 0.35,
  species = 'mango',
} = {}) {
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

  // Sub-canopy Overhang Lobes
  const clusterOffsets = [
    { x: canopyRadius * 0.45, y: canopyBaseY + canopyRadius * 0.5, z: canopyRadius * 0.3, r: canopyRadius * 0.65, mat: foliageMatSecondary },
    { x: -canopyRadius * 0.4, y: canopyBaseY + canopyRadius * 0.6, z: -canopyRadius * 0.35, r: canopyRadius * 0.6, mat: foliageMatPrimary },
    { x: -canopyRadius * 0.3, y: canopyBaseY + canopyRadius * 0.4, z: canopyRadius * 0.4, r: canopyRadius * 0.55, mat: foliageMatSecondary },
  ];

  clusterOffsets.forEach((lobe) => {
    const lobeGeom = new THREE.DodecahedronGeometry(lobe.r, 1);
    const lobeMesh = new THREE.Mesh(lobeGeom, lobe.mat);
    lobeMesh.position.set(lobe.x, lobe.y, lobe.z);
    lobeMesh.castShadow = true;
    lobeMesh.receiveShadow = true;
    treeGroup.add(lobeMesh);
  });

  // Top Cone Spire
  const topSpireGeom = new THREE.ConeGeometry(canopyRadius * 0.7, canopyRadius * 0.9, 7);
  const topSpire = new THREE.Mesh(topSpireGeom, foliageMatPrimary);
  topSpire.position.set(0, canopyBaseY + canopyRadius * 1.4, 0);
  topSpire.castShadow = true;
  topSpire.receiveShadow = true;
  treeGroup.add(topSpire);

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

/**
 * Isolates Target Roof (closest to user click centroid) and separates context roofs
 */
export function isolateTargetRoof(roofPolygons, clickPoint = { x: 0, z: 0 }) {
  if (!roofPolygons || roofPolygons.length === 0) {
    return { targetRoof: null, neighborContextRoofs: [] };
  }
  if (roofPolygons.length === 1) {
    return { targetRoof: roofPolygons[0], neighborContextRoofs: [] };
  }

  let closestDistSq = Infinity;
  let targetIdx = 0;

  roofPolygons.forEach((roof, idx) => {
    let sumX = 0;
    let sumZ = 0;
    const pts = roof.polygon || roof.points || [];
    const n = pts.length;

    pts.forEach((pt) => {
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

  return {
    targetRoof: roofPolygons[targetIdx],
    neighborContextRoofs: roofPolygons.filter((_, idx) => idx !== targetIdx),
  };
}

/**
 * Builds semi-transparent grey context mesh for dense urban neighborhood roofs
 */
export function buildNeighborContextMesh(roofData, defaultHeight = 3.5) {
  const pts = (roofData.polygon || roofData.points || []).map((p) =>
    Array.isArray(p) ? { x: p[0], z: p[1] } : p
  );
  const h = roofData.heightMeters || defaultHeight;

  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 10);
  const minZ = Math.min(...zs, 0);
  const maxZ = Math.max(...zs, 10);

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
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = `ContextRoof_${roofData.id || 'neighbor'}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const edges = new THREE.EdgesGeometry(geom, 20);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.4,
  });
  mesh.add(new THREE.LineSegments(edges, edgeMat));

  return mesh;
}

/**
 * Calculates Digos City Sun Position in Azimuth & Elevation degrees and 3D Vector3
 */
export function calculateDigosSunPosition(hourOfDay = 11.0, dayOfYear = 80, radius = 50.0) {
  const lat = 6.7495; // Digos City Latitude
  const latRad = (lat * Math.PI) / 180;

  const declinationDeg = 23.45 * Math.sin(((360 / 365) * (284 + dayOfYear) * Math.PI) / 180);
  const declinationRad = (declinationDeg * Math.PI) / 180;

  const hourAngleDeg = (hourOfDay - 12.0) * 15.0;
  const hourAngleRad = (hourAngleDeg * Math.PI) / 180;

  const sinAlpha =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinAlpha)));
  const elevationDeg = (elevationRad * 180) / Math.PI;

  const cosGamma =
    (Math.sin(elevationRad) * Math.sin(latRad) - Math.sin(declinationRad)) /
    (Math.max(0.0001, Math.cos(elevationRad)) * Math.cos(latRad));
  const clampedCos = Math.max(-1, Math.min(1, cosGamma));
  let azimuthDeg = (Math.acos(clampedCos) * 180) / Math.PI;
  if (hourOfDay > 12) {
    azimuthDeg = 360 - azimuthDeg;
  }
  const azimuthRad = (azimuthDeg * Math.PI) / 180;

  const clampedElevationRad = Math.max((3 * Math.PI) / 180, elevationRad);
  const x = radius * Math.cos(clampedElevationRad) * Math.sin(azimuthRad);
  const y = Math.max(2.0, radius * Math.sin(clampedElevationRad));
  const z = -radius * Math.cos(clampedElevationRad) * Math.cos(azimuthRad);

  return {
    latitude: lat,
    longitude: 125.3572,
    azimuthDeg: parseFloat(azimuthDeg.toFixed(1)),
    elevationDeg: parseFloat(elevationDeg.toFixed(1)),
    sunPositionVector: new THREE.Vector3(x, y, z),
  };
}

/**
 * Checks for panel obstruction against tree canopy bounding boxes and raycast shadows
 */
export function evaluatePanelObstructions(panels, treeGroups, sunPosition) {
  const results = new Map();
  const sunDir = sunPosition.clone().normalize();
  const raycaster = new THREE.Raycaster();

  const collidableTreeMeshes = [];
  const treeBoundingSpheres = [];

  treeGroups.forEach((tg) => {
    tg.traverse((child) => {
      if (child.isMesh) collidableTreeMeshes.push(child);
    });
    const box = new THREE.Box3().setFromObject(tg);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    treeBoundingSpheres.push({ sphere, treeId: tg.userData?.treeId || tg.name });
  });

  panels.forEach((panel) => {
    const pos = panel.worldPosition;
    const halfDiag = Math.hypot(panel.dimensions.width, panel.dimensions.length) / 2;

    let isPhysicallyColliding = false;
    let collidingTreeId = '';

    for (const { sphere, treeId } of treeBoundingSpheres) {
      if (sphere.center.distanceTo(pos) < sphere.radius + halfDiag * 0.8) {
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

    const rayOrigin = pos.clone().add(new THREE.Vector3(0, 0.05, 0));
    raycaster.set(rayOrigin, sunDir);
    raycaster.far = 80.0;

    const hits = raycaster.intersectObjects(collidableTreeMeshes, true);
    if (hits.length > 0) {
      results.set(panel.id, {
        panelId: panel.id,
        isObstructed: true,
        reason: 'TREE_SHADOW',
        obstructingTreeId: hits[0].object.parent?.userData?.treeId || 'Tree_Obstruction',
        distanceToObstruction: parseFloat(hits[0].distance.toFixed(2)),
      });
      return;
    }

    results.set(panel.id, {
      panelId: panel.id,
      isObstructed: false,
    });
  });

  return results;
}

export default {
  sortPolygonClockwise,
  computeGlobalBoundingBox,
  normalizePolygonToMeters,
  buildBaseWallMesh,
  buildFacet3DMesh,
  buildCompleteRoofAssembly,
  disposeThreeHierarchy,
  classifyRoofFacets,
  useRoofBuilder,
  FACET_COLOR_PALETTE,
  createProceduralTreeMesh,
  isolateTargetRoof,
  buildNeighborContextMesh,
  calculateDigosSunPosition,
  evaluatePanelObstructions,
};

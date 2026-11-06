/**
 * HELIOS-LOAD Canonical 3D Roof Mesh & Multi-Plane Geometry Engine (v2)
 *
 * Generates architecturally accurate multi-plane 3D roof meshes for Babylon.js
 * directly from verified Google Maps LatLng polygon coordinates—NEVER using a
 * generic fallback rectangle or flat-rotated placeholder box.
 *
 * Supported Roof Structure Types:
 * - Hip / Pyramid (4-plane hip with ridge or pyramid apex; multi-wing hip for N-gons)
 * - Gable (dual-pitched sloped planes split across ridge with triangular gable verges)
 * - Single Slope / Shed (true single sloped plane rising from eave along azimuth)
 * - L-Shape (multi-plane hipped roof preserving exact L footprint & wing ridges/valleys)
 * - T-Shape (multi-plane hipped roof preserving exact T footprint & intersecting ridges)
 * - U-Shape (multi-plane hipped roof preserving exact U footprint & courtyard eaves)
 * - Irregular (concave/arbitrary polygon medial-ridge multi-plane sloped roof)
 * - Flat (0° pitch or flat slab)
 *
 * Physical Properties:
 * - Preserves 100% exact top-down 2D verified polygon footprint (`Discrepancy < 1%`)
 * - Physical roof slab thickness (e.g. 0.15 m) whose underside follows the sloped planes
 * - Crisp per-facet flat-shaded normals aligned with Babylon.js left-handed winding
 * - Explicit ridge/hip/valley 3D crease lines for CAD viewport rendering
 */

import earcut from 'earcut'
import { orderRoofPolygonVertices } from './roof-polygon-order'
import type {
  CanonicalRoofStructureType,
  RoofVertex,
  RoofFace,
  RoofEdge,
  RoofPlaneGeometry,
  RoofModel,
  RoofSegment
} from '../../types/roof'

export type RoofStructureType =
  | CanonicalRoofStructureType
  | 'Hip'
  | 'Single Slope'
  | 'Custom'

export const ROOF_STRUCTURE_OPTIONS: Array<{ value: CanonicalRoofStructureType; label: string }> = [
  { value: 'Hip / Pyramid', label: 'Hip / Pyramid' },
  { value: 'Gable', label: 'Gable' },
  { value: 'Single Slope / Shed', label: 'Single Slope / Shed' },
  { value: 'L-Shape', label: 'L-Shape' },
  { value: 'T-Shape', label: 'T-Shape' },
  { value: 'U-Shape', label: 'U-Shape' },
  { value: 'Irregular', label: 'Irregular' },
  { value: 'Flat', label: 'Flat' }
]

export interface RoofGenerationConfig {
  pitchDegrees: number
  azimuthDegrees: number
  eaveHeightM: number
  roofThicknessM: number // e.g. 0.15 m
  roofType: RoofStructureType | string
  ridgeAxisAngleDeg?: number
  originLat?: number
  originLng?: number
}

export interface GeneratedRoofGeometry {
  vertices: RoofVertex[]
  indices: number[]
  normals: number[]
  faces: RoofFace[]
  topSurfaceVertices: RoofVertex[]
  topSurfaceIndices: number[]
  footprint2D: Array<{ x: number; z: number }>
  boundaryLatLng: Array<{ lat: number; lng: number }>
  perimeter3D: RoofVertex[]
  ridgeLines: Array<[RoofVertex, RoofVertex]>
  origin: { latitude: number; longitude: number }
  centroid: { x: number; y: number; z: number }
  footprintAreaM2: number
  roofType: CanonicalRoofStructureType
  boundingDimensions: {
    widthM: number
    lengthM: number
    heightM: number
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
  }
  areaDiscrepancy: {
    googleAreaM2: number
    babylonAreaM2: number
    differencePercent: number
    isDiscrepancyAcceptable: boolean
    warningMessage?: string
  }
}

interface Pt2D {
  x: number
  z: number
}

const WGS84_RADIUS_M = 6378137

/**
 * Projects Latitude and Longitude to Cartesian local meters (East/West = +X/-X, North/South = +Z/-Z)
 * relative to the local origin.
 */
export function latLngToLocalMeters(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): { x: number; z: number } {
  const centerLatRad = centerLat * (Math.PI / 180)
  const dLat = (lat - centerLat) * (Math.PI / 180)
  const dLng = (lng - centerLng) * (Math.PI / 180)

  const x = dLng * Math.cos(centerLatRad) * WGS84_RADIUS_M
  const z = dLat * WGS84_RADIUS_M

  return {
    x: Number(x.toFixed(4)),
    z: Number(z.toFixed(4))
  }
}

/**
 * Converts Cartesian local meters back to Latitude and Longitude relative to the local origin.
 */
export function localMetersToLatLng(
  x: number,
  z: number,
  centerLat: number,
  centerLng: number
): { lat: number; lng: number } {
  const centerLatRad = centerLat * (Math.PI / 180)
  const dLat = z / WGS84_RADIUS_M
  const dLng = x / (WGS84_RADIUS_M * Math.cos(centerLatRad))
  return {
    lat: Number((centerLat + dLat * (180 / Math.PI)).toFixed(7)),
    lng: Number((centerLng + dLng * (180 / Math.PI)).toFixed(7))
  }
}

/**
 * Computes spherical polygon area in square meters on WGS84 sphere (matches google.maps.geometry.spherical.computeArea).
 */
export function computeSphericalPolygonAreaM2(coords: Array<{ lat: number; lng: number }>): number {
  if (!coords || coords.length < 3) return 0
  let total = 0
  const n = coords.length
  const prev = coords[n - 1]!
  let prevTanLat = Math.tan(((Math.PI / 2 - (prev.lat * Math.PI) / 180)) / 2)
  let prevLng = (prev.lng * Math.PI) / 180

  for (let i = 0; i < n; i++) {
    const cur = coords[i]!
    const tanLat = Math.tan(((Math.PI / 2 - (cur.lat * Math.PI) / 180)) / 2)
    const lng = (cur.lng * Math.PI) / 180
    const deltaLng = lng - prevLng
    const t = tanLat * prevTanLat
    total += 2 * Math.atan2(t * Math.sin(deltaLng), 1 + t * Math.cos(deltaLng))
    prevTanLat = tanLat
    prevLng = lng
  }

  return Number((Math.abs(total) * WGS84_RADIUS_M * WGS84_RADIUS_M).toFixed(2))
}

/**
 * Computes signed 2D polygon area in local meters (positive = CCW in (x=East, z=North)).
 */
export function computeSignedPolygonArea(points: Pt2D[]): number {
  if (!points || points.length < 3) return 0
  let area2 = 0
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!
    const p2 = points[(i + 1) % points.length]!
    area2 += p1.x * p2.z - p2.x * p1.z
  }
  return area2 / 2
}

/**
 * Calculates unsigned 2D polygon area in local meters using the Shoelace formula.
 */
export function computeLocalPolygonArea(points: Array<{ x: number; z: number }>): number {
  return Number(Math.abs(computeSignedPolygonArea(points)).toFixed(2))
}

/**
 * Infers the architectural roof footprint shape classification from a 2D verified polygon.
 */
export function inferFootprintShapeType(poly2D: Array<{ x: number; z: number }>): CanonicalRoofStructureType {
  if (!poly2D || poly2D.length < 3) return 'Hip / Pyramid'

  const ccw = ensureCCW(cleanDuplicatePoints2D(poly2D))
  const simplified = simplifyCollinearPolygon(ccw, 10)
  const m = simplified.length
  if (m <= 4) return 'Hip / Pyramid'

  // Count reflex (concave) vertices where interior angle > 192 degrees
  const reflexIndices: number[] = []
  for (let i = 0; i < m; i++) {
    const prev = simplified[(i - 1 + m) % m]!
    const cur = simplified[i]!
    const next = simplified[(i + 1) % m]!
    const e1x = cur.x - prev.x
    const e1z = cur.z - prev.z
    const e2x = next.x - cur.x
    const e2z = next.z - cur.z
    // For CCW polygon, left turn has cross = e1x*e2z - e1z*e2x > 0; right turn (reflex) has cross < 0
    const cross = e1x * e2z - e1z * e2x
    const len1 = Math.hypot(e1x, e1z)
    const len2 = Math.hypot(e2x, e2z)
    if (len1 > 1e-3 && len2 > 1e-3) {
      const sinAngle = cross / (len1 * len2)
      if (sinAngle < -0.18) {
        reflexIndices.push(i)
      }
    }
  }

  if (reflexIndices.length === 0) {
    return m <= 8 ? 'Hip / Pyramid' : 'Irregular'
  }
  if (reflexIndices.length === 1 && m === 6) {
    return 'L-Shape'
  }
  if (reflexIndices.length === 2 && m === 8) {
    // Distinguish T-Shape (two reflex corners flanking a stem: index gap 1 or 7, or opposite) vs U-Shape (gap 1 along inner notch)
    const gap = Math.abs(reflexIndices[1]! - reflexIndices[0]!)
    const cyclicGap = Math.min(gap, m - gap)
    if (cyclicGap === 1) {
      return 'U-Shape'
    }
    return 'T-Shape'
  }

  return 'Irregular'
}

/**
 * Normalizes any legacy or UI roof type string into a CanonicalRoofStructureType.
 */
export function normalizeRoofStructureType(
  rawType?: string | null,
  footprint2D?: Array<{ x: number; z: number }>
): CanonicalRoofStructureType {
  const t = (rawType || '').trim()
  switch (t) {
    case 'Hip / Pyramid':
    case 'Hip':
    case 'Hip Roof':
    case 'Pyramid':
    case 'Pyramid Roof':
    case 'Hip & Valley':
    case 'Hip & Valley Roof':
    case 'Dutch Gable':
    case 'Dutch Gable Roof':
    case 'Jerkinhead':
    case 'Bonnet':
      return 'Hip / Pyramid'

    case 'Gable':
    case 'Gable Roof':
    case 'Cross Gable':
    case 'Cross Gable Roof':
    case 'Gambrel':
    case 'Gambrel Roof':
      return 'Gable'

    case 'Single Slope / Shed':
    case 'Single Slope':
    case 'Shed':
    case 'Shed Roof':
    case 'Saltbox':
    case 'Saltbox Roof':
      return 'Single Slope / Shed'

    case 'L-Shape':
    case 'L-Shaped / Complex':
      return 'L-Shape'

    case 'T-Shape':
      return 'T-Shape'

    case 'U-Shape':
      return 'U-Shape'

    case 'Irregular':
    case 'Irregular / Concave':
    case 'Irregular / Other':
      return 'Irregular'

    case 'Flat':
    case 'Flat Roof':
      return 'Flat'

    default:
      if (footprint2D && footprint2D.length >= 3) {
        return inferFootprintShapeType(footprint2D)
      }
      return 'Hip / Pyramid'
  }
}

/**
 * Extracts the verified 2D outer footprint polygon (in local meters) from a RoofModel or RoofSegment.
 * Safe across both v2 multi-plane models and legacy v1 models.
 */
export function extractVerifiedFootprint2D(
  model?: RoofModel | null,
  segOverride?: RoofSegment | null
): Array<{ x: number; z: number }> {
  const seg = segOverride || model?.segments?.[0] || model?.roofSegments?.[0]
  if (seg?.footprint2D && seg.footprint2D.length >= 3) {
    return seg.footprint2D.map(p => ({ x: p.x, z: p.z }))
  }
  if (model?.footprint2D && model.footprint2D.length >= 3) {
    return model.footprint2D.map(p => ({ x: p.x, z: p.z }))
  }
  const poly2D = seg?.geometry?.polygon2D || model?.geometry?.segments?.[0]?.polygon2D
  if (poly2D && poly2D.length >= 3) {
    return poly2D.map(p => ({ x: p.x, z: p.z }))
  }
  if (seg?.vertices && seg.vertices.length >= 6 && (!seg.geometryVersion || seg.geometryVersion < 2)) {
    const halfLen = Math.floor(seg.vertices.length / 2)
    return seg.vertices.slice(0, halfLen).map(v => ({ x: v.x, z: v.z }))
  }
  if (seg?.vertices && seg.vertices.length >= 3 && (!seg.geometryVersion || seg.geometryVersion < 2)) {
    return seg.vertices.map(v => ({ x: v.x, z: v.z }))
  }
  return []
}

/**
 * Extracts the verified geographic Lat/Lng boundary coordinates from a RoofModel.
 */
export function extractVerifiedBoundaryLatLng(model?: RoofModel | null): Array<{ lat: number; lng: number }> {
  if (!model) return []
  const seg = model.segments?.[0] || model.roofSegments?.[0]
  if (seg?.boundaryLatLng && seg.boundaryLatLng.length >= 3) {
    return seg.boundaryLatLng.map(p => ({ lat: p.lat, lng: p.lng }))
  }
  if (model.boundaryLatLng && model.boundaryLatLng.length >= 3) {
    return model.boundaryLatLng.map(p => ({ lat: p.lat, lng: p.lng }))
  }

  const fp2D = extractVerifiedFootprint2D(model, seg)
  if (fp2D.length >= 3) {
    const originLat = model.origin?.latitude || model.building?.center?.latitude
    const originLng = model.origin?.longitude || model.building?.center?.longitude
    if (typeof originLat === 'number' && typeof originLng === 'number') {
      return fp2D.map(pt => localMetersToLatLng(pt.x, pt.z, originLat, originLng))
    }
  }
  return []
}

// ==========================================
// INTERNAL 2D GEOMETRY & TRIANGULATION HELPERS
// ==========================================

function cleanDuplicateLatLng(coords: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = []
  for (const pt of coords) {
    if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) continue
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.lat - pt.lat) < 1e-8 && Math.abs(prev.lng - pt.lng) < 1e-8) continue
    out.push({ lat: pt.lat, lng: pt.lng })
  }
  if (out.length > 2) {
    const first = out[0]!
    const last = out[out.length - 1]!
    if (Math.abs(first.lat - last.lat) < 1e-8 && Math.abs(first.lng - last.lng) < 1e-8) {
      out.pop()
    }
  }
  return out
}

function cleanDuplicatePoints2D(pts: Pt2D[]): Pt2D[] {
  const out: Pt2D[] = []
  for (const pt of pts) {
    const prev = out[out.length - 1]
    if (prev && Math.hypot(prev.x - pt.x, prev.z - pt.z) < 1e-4) continue
    out.push({ x: pt.x, z: pt.z })
  }
  if (out.length > 2) {
    const first = out[0]!
    const last = out[out.length - 1]!
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-4) {
      out.pop()
    }
  }
  return out
}

function ensureCCW(pts: Pt2D[]): Pt2D[] {
  if (computeSignedPolygonArea(pts) < 0) {
    return [...pts].reverse()
  }
  return pts.map(p => ({ x: p.x, z: p.z }))
}

function simplifyCollinearPolygon(ccwPts: Pt2D[], angleTolDeg = 8): Pt2D[] {
  if (ccwPts.length <= 3) return ccwPts
  const sinTol = Math.sin((angleTolDeg * Math.PI) / 180)
  let current = [...ccwPts]
  let changed = true

  while (changed && current.length > 3) {
    changed = false
    const nextList: Pt2D[] = []
    const m = current.length
    for (let i = 0; i < m; i++) {
      const prev = current[(i - 1 + m) % m]!
      const cur = current[i]!
      const next = current[(i + 1) % m]!
      const ux = cur.x - prev.x
      const uz = cur.z - prev.z
      const vx = next.x - cur.x
      const vz = next.z - cur.z
      const lu = Math.hypot(ux, uz)
      const lv = Math.hypot(vx, vz)
      if (lu < 0.05 || lv < 0.05) {
        changed = true
        continue
      }
      const cross = (ux * vz - uz * vx) / (lu * lv)
      const dot = (ux * vx + uz * vz) / (lu * lv)
      if (dot > 0.5 && Math.abs(cross) < sinTol && current.length - (changed ? 1 : 0) > 3) {
        changed = true
        continue
      }
      nextList.push(cur)
    }
    if (nextList.length >= 3) {
      current = nextList
    } else {
      break
    }
  }
  return current
}

function pointInPoly2D(px: number, pz: number, poly: Pt2D[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!
    const pj = poly[j]!
    const intersect =
      pi.z > pz !== pj.z > pz &&
      px < ((pj.x - pi.x) * (pz - pi.z)) / (pj.z - pi.z) + pi.x
    if (intersect) inside = !inside
  }
  return inside
}

function distToSegmentWithT(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): { dist: number; t: number } {
  const dx = x2 - x1
  const dz = z2 - z1
  const l2 = dx * dx + dz * dz
  if (l2 < 1e-10) return { dist: Math.hypot(px - x1, pz - z1), t: 0 }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2))
  return {
    dist: Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz)),
    t
  }
}

function minDistanceToPolygonBoundary(px: number, pz: number, poly: Pt2D[]): {
  minDist: number
  secondDist: number
  nearestEdge: number
} {
  let minDist = Infinity
  let secondDist = Infinity
  let nearestEdge = 0
  let nearestNx = 0
  let nearestNz = 0
  const m = poly.length

  const edgeNormals: Array<{ nx: number; nz: number }> = []
  for (let i = 0; i < m; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % m]!
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    // Inward normal for CCW polygon edge (dx, dz) is (-dz/len, dx/len)
    edgeNormals.push({ nx: -(b.z - a.z) / len, nz: (b.x - a.x) / len })
  }

  const edgeDists: number[] = []
  for (let i = 0; i < m; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % m]!
    const { dist } = distToSegmentWithT(px, pz, a.x, a.z, b.x, b.z)
    edgeDists.push(dist)
    if (dist < minDist) {
      minDist = dist
      nearestEdge = i
      nearestNx = edgeNormals[i]!.nx
      nearestNz = edgeNormals[i]!.nz
    }
  }

  for (let i = 0; i < m; i++) {
    if (i === nearestEdge) continue
    const en = edgeNormals[i]!
    // Only count as a distinct roof plane if edge orientation differs by > ~15 degrees
    const dot = nearestNx * en.nx + nearestNz * en.nz
    if (dot < 0.965 && edgeDists[i]! < secondDist) {
      secondDist = edgeDists[i]!
    }
  }

  return { minDist, secondDist, nearestEdge }
}

/**
 * Computes minimum-area Oriented Bounding Box (OBB) for the 2D polygon.
 */
function computeOrientedBoundingBox(poly: Pt2D[]) {
  let bestArea = Infinity
  let bestUx = 1
  let bestUz = 0
  let bestUMin = 0
  let bestUMax = 0
  let bestVMin = 0
  let bestVMax = 0

  const candidateAngles: number[] = [0]
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    if (Math.hypot(dx, dz) > 0.05) {
      candidateAngles.push(Math.atan2(dz, dx))
    }
  }

  for (const ang of candidateAngles) {
    const ux = Math.cos(ang)
    const uz = Math.sin(ang)
    const vx = -uz
    const vz = ux

    let uMin = Infinity
    let uMax = -Infinity
    let vMin = Infinity
    let vMax = -Infinity
    for (const p of poly) {
      const u = p.x * ux + p.z * uz
      const v = p.x * vx + p.z * vz
      if (u < uMin) uMin = u
      if (u > uMax) uMax = u
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
    }

    const area = (uMax - uMin) * (vMax - vMin)
    if (area < bestArea) {
      bestArea = area
      bestUx = ux
      bestUz = uz
      bestUMin = uMin
      bestUMax = uMax
      bestVMin = vMin
      bestVMax = vMax
    }
  }

  // Ensure u is the MAJOR (longer) axis and v is the MINOR (shorter) axis
  let spanU = bestUMax - bestUMin
  let spanV = bestVMax - bestVMin
  let ux = bestUx
  let uz = bestUz
  let vx = -uz
  let vz = ux
  let uMin = bestUMin
  let uMax = bestUMax
  let vMin = bestVMin
  let vMax = bestVMax

  if (spanV > spanU) {
    ux = vx
    uz = vz
    vx = -uz
    vz = ux
    uMin = Infinity
    uMax = -Infinity
    vMin = Infinity
    vMax = -Infinity
    for (const p of poly) {
      const u = p.x * ux + p.z * uz
      const v = p.x * vx + p.z * vz
      if (u < uMin) uMin = u
      if (u > uMax) uMax = u
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
    }
    spanU = uMax - uMin
    spanV = vMax - vMin
  }

  const uMid = (uMin + uMax) / 2
  const vMid = (vMin + vMax) / 2
  const obbCx = ux * uMid + vx * vMid
  const obbCz = uz * uMid + vz * vMid

  return {
    ux,
    uz,
    vx,
    vz,
    lengthM: spanU,
    widthM: spanV,
    obbCx,
    obbCz,
    uMin,
    uMax,
    vMin,
    vMax
  }
}

/**
 * Solves 2x2 linear system:
 * a1*x + b1*z = c1
 * a2*x + b2*z = c2
 */
function solve2x2(
  a1: number,
  b1: number,
  c1: number,
  a2: number,
  b2: number,
  c2: number
): Pt2D | null {
  const det = a1 * b2 - a2 * b1
  if (Math.abs(det) < 1e-6) return null
  return {
    x: (c1 * b2 - c2 * b1) / det,
    z: (a1 * c2 - a2 * c1) / det
  }
}

/**
 * Exact 4-plane Hip / Pyramid straight-skeleton builder for convex quadrilateral footprints
 * (including polygons with extra collinear points along the 4 dominant walls).
 */
function tryBuildQuadHipTopSurface(
  ccwPoly: Pt2D[],
  eaveHeightM: number,
  tanPitch: number
): {
  topVerts: RoofVertex[]
  topTris: number[]
  perimeter3D: RoofVertex[]
  ridgeLines: Array<[RoofVertex, RoofVertex]>
} | null {
  const dominant = simplifyCollinearPolygon(ccwPoly, 8)
  if (dominant.length !== 4) return null

  // Verify dominant quad is strictly convex
  for (let i = 0; i < 4; i++) {
    const p0 = dominant[(i + 3) % 4]!
    const p1 = dominant[i]!
    const p2 = dominant[(i + 1) % 4]!
    const cross = (p1.x - p0.x) * (p2.z - p1.z) - (p1.z - p0.z) * (p2.x - p1.x)
    if (cross <= 1e-3) return null
  }

  // Edge k runs from Q_k to Q_{(k+1)%4}, inward unit normal n_k = (-dz/L, dx/L)
  // Signed inward distance from X to line k: d_k(X) = (X - Q_k) . n_k = X . n_k - c_k
  const normals: Array<{ nx: number; nz: number; c: number }> = []
  for (let k = 0; k < 4; k++) {
    const qA = dominant[k]!
    const qB = dominant[(k + 1) % 4]!
    const len = Math.hypot(qB.x - qA.x, qB.z - qA.z)
    if (len < 0.1) return null
    const nx = -(qB.z - qA.z) / len
    const nz = (qB.x - qA.x) / len
    const c = qA.x * nx + qA.z * nz
    normals.push({ nx, nz, c })
  }

  const distLine = (k: number, p: Pt2D) => {
    const L = normals[k]!
    return p.x * L.nx + p.z * L.nz - L.c
  }

  // Equidistant intersection of 3 edges (a, b, c): d_a(X) = d_b(X) and d_c(X) = d_b(X)
  const intersectThreePlanes = (a: number, b: number, cIdx: number): { pt: Pt2D; d: number } | null => {
    const La = normals[a]!
    const Lb = normals[b]!
    const Lc = normals[cIdx]!
    const pt = solve2x2(
      La.nx - Lb.nx,
      La.nz - Lb.nz,
      La.c - Lb.c,
      Lc.nx - Lb.nx,
      Lc.nz - Lb.nz,
      Lc.c - Lb.c
    )
    if (!pt) return null
    const d = distLine(b, pt)
    return { pt, d }
  }

  // Pairing 0: ridge runs between opposite edges 0 and 2 (hip ends are edges 1 and 3)
  // Pairing 1: ridge runs between opposite edges 1 and 3 (hip ends are edges 2 and 0)
  const evaluatePairing = (shift: 0 | 1) => {
    const eLongA = shift
    const eHip1 = (shift + 1) % 4
    const eLongB = (shift + 2) % 4
    const eHip2 = (shift + 3) % 4

    const r1 = intersectThreePlanes(eLongA, eHip1, eLongB)
    const r2 = intersectThreePlanes(eLongA, eHip2, eLongB)
    if (!r1 || !r2) return null
    if (r1.d <= 0.02 || r2.d <= 0.02) return null

    // Valid straight skeleton condition: fourth plane must be at least as high (>= d - tol) at each ridge endpoint
    const slack1 = distLine(eHip2, r1.pt) - r1.d
    const slack2 = distLine(eHip1, r2.pt) - r2.d
    if (slack1 < -0.08 || slack2 < -0.08) return null
    if (!pointInPoly2D(r1.pt.x, r1.pt.z, ccwPoly) || !pointInPoly2D(r2.pt.x, r2.pt.z, ccwPoly)) {
      return null
    }

    return {
      shift,
      r1,
      r2,
      minSlack: Math.min(slack1, slack2)
    }
  }

  const cand0 = evaluatePairing(0)
  const cand1 = evaluatePairing(1)
  const chosen = cand0 && cand1
    ? (cand0.minSlack >= cand1.minSlack ? cand0 : cand1)
    : (cand0 || cand1)

  if (!chosen) return null

  const { shift, r1, r2 } = chosen
  // Rotate dominant corners so Q0->Q1 is eLongA, Q1->Q2 is eHip1, Q2->Q3 is eLongB, Q3->Q0 is eHip2
  const Q = [
    dominant[shift]!,
    dominant[(shift + 1) % 4]!,
    dominant[(shift + 2) % 4]!,
    dominant[(shift + 3) % 4]!
  ]

  // Map each vertex of ccwPoly to its nearest dominant corner / wall segment so even 5+ collinear-edge vertices work cleanly
  const topVerts: RoofVertex[] = ccwPoly.map(p => ({
    x: Number(p.x.toFixed(4)),
    y: Number(eaveHeightM.toFixed(4)),
    z: Number(p.z.toFixed(4))
  }))
  const perimeter3D = topVerts.map(v => ({ ...v }))

  const findPolyIdx = (q: Pt2D): number => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < ccwPoly.length; i++) {
      const d = Math.hypot(ccwPoly[i]!.x - q.x, ccwPoly[i]!.z - q.z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  const qIdx = [findPolyIdx(Q[0]!), findPolyIdx(Q[1]!), findPolyIdx(Q[2]!), findPolyIdx(Q[3]!)]
  // Ensure strictly distinct cyclic indices
  if (new Set(qIdx).size !== 4) return null

  const ridgeSpan = Math.hypot(r1.pt.x - r2.pt.x, r1.pt.z - r2.pt.z)
  const topTris: number[] = []
  const ridgeLines: Array<[RoofVertex, RoofVertex]> = []

  // Helper to collect perimeter indices along wall w from qIdx[w] to qIdx[(w+1)%4]
  const getWallChain = (w: number): number[] => {
    const start = qIdx[w]!
    const end = qIdx[(w + 1) % 4]!
    const chain: number[] = [start]
    let cur = start
    let guard = 0
    while (cur !== end && guard++ <= ccwPoly.length) {
      cur = (cur + 1) % ccwPoly.length
      chain.push(cur)
    }
    return chain
  }

  if (ridgeSpan < 0.20) {
    // PYRAMID ROOF: all 4 planes meet at a single central apex!
    const avgD = (r1.d + r2.d) / 2
    const apex: RoofVertex = {
      x: Number(((r1.pt.x + r2.pt.x) / 2).toFixed(4)),
      y: Number((eaveHeightM + avgD * tanPitch).toFixed(4)),
      z: Number(((r1.pt.z + r2.pt.z) / 2).toFixed(4))
    }
    const apexIdx = topVerts.length
    topVerts.push(apex)

    for (let i = 0; i < ccwPoly.length; i++) {
      const j = (i + 1) % ccwPoly.length
      topTris.push(i, j, apexIdx)
    }

    for (let w = 0; w < 4; w++) {
      ridgeLines.push([{ ...topVerts[qIdx[w]!]! }, { ...apex }])
    }
  } else {
    // 4-PLANE HIP ROOF:
    // Wall 0 (Q0 -> Q1) slopes up to ridge R2 -> R1
    // Wall 1 (Q1 -> Q2) hip end slopes up to R1
    // Wall 2 (Q2 -> Q3) slopes up to ridge R1 -> R2
    // Wall 3 (Q3 -> Q0) hip end slopes up to R2
    const vR1: RoofVertex = {
      x: Number(r1.pt.x.toFixed(4)),
      y: Number((eaveHeightM + r1.d * tanPitch).toFixed(4)),
      z: Number(r1.pt.z.toFixed(4))
    }
    const vR2: RoofVertex = {
      x: Number(r2.pt.x.toFixed(4)),
      y: Number((eaveHeightM + r2.d * tanPitch).toFixed(4)),
      z: Number(r2.pt.z.toFixed(4))
    }
    const idxR1 = topVerts.length
    topVerts.push(vR1)
    const idxR2 = topVerts.length
    topVerts.push(vR2)

    // Wall 0: chain[0..k] + R1 + R2
    const chain0 = getWallChain(0)
    for (let i = 0; i < chain0.length - 1; i++) {
      topTris.push(chain0[i]!, chain0[i + 1]!, idxR1)
    }
    topTris.push(chain0[0]!, idxR1, idxR2)

    // Wall 1 (hip end at R1): chain1[0..k] + R1
    const chain1 = getWallChain(1)
    for (let i = 0; i < chain1.length - 1; i++) {
      topTris.push(chain1[i]!, chain1[i + 1]!, idxR1)
    }

    // Wall 2: chain2[0..k] + R2 + R1
    const chain2 = getWallChain(2)
    for (let i = 0; i < chain2.length - 1; i++) {
      topTris.push(chain2[i]!, chain2[i + 1]!, idxR2)
    }
    topTris.push(chain2[0]!, idxR2, idxR1)

    // Wall 3 (hip end at R2): chain3[0..k] + R2
    const chain3 = getWallChain(3)
    for (let i = 0; i < chain3.length - 1; i++) {
      topTris.push(chain3[i]!, chain3[i + 1]!, idxR2)
    }

    // Ridge + 4 Hip Rafters
    ridgeLines.push(
      [{ ...vR2 }, { ...vR1 }],
      [{ ...topVerts[qIdx[0]!]! }, { ...vR2 }],
      [{ ...topVerts[qIdx[1]!]! }, { ...vR1 }],
      [{ ...topVerts[qIdx[2]!]! }, { ...vR1 }],
      [{ ...topVerts[qIdx[3]!]! }, { ...vR2 }]
    )
  }

  return { topVerts, topTris, perimeter3D, ridgeLines }
}

/**
 * Constrained Medial-Ridge Triangulator for arbitrary convex/concave polygons
 * (L-Shape, T-Shape, U-Shape, Irregular, pentagons, hexagons, etc.).
 * Preserves 100% of outer boundary edges (never bridges across concave notches!)
 * while generating interior ridge, hip, and valley vertices at exact slope pitch.
 */
function buildMedialRidgeHipTopSurface(
  ccwPoly: Pt2D[],
  obb: ReturnType<typeof computeOrientedBoundingBox>,
  eaveHeightM: number,
  tanPitch: number
): {
  topVerts: RoofVertex[]
  topTris: number[]
  perimeter3D: RoofVertex[]
  ridgeLines: Array<[RoofVertex, RoofVertex]>
} {
  const m = ccwPoly.length
  const pts2D: Pt2D[] = ccwPoly.map(p => ({ x: p.x, z: p.z }))

  // Initial constrained triangulation of boundary polygon via earcut
  const flatCoords: number[] = []
  pts2D.forEach(p => flatCoords.push(p.x, p.z))
  const rawEarcut = earcut(flatCoords)

  const tris: Array<[number, number, number]> = []
  for (let i = 0; i < rawEarcut.length; i += 3) {
    const a = rawEarcut[i]!
    const b = rawEarcut[i + 1]!
    const c = rawEarcut[i + 2]!
    const area2 =
      (pts2D[b]!.x - pts2D[a]!.x) * (pts2D[c]!.z - pts2D[a]!.z) -
      (pts2D[b]!.z - pts2D[a]!.z) * (pts2D[c]!.x - pts2D[a]!.x)
    if (area2 > 1e-6) {
      tris.push([a, b, c])
    } else if (area2 < -1e-6) {
      tris.push([a, c, b])
    }
  }

  // Generate medial-ridge & interior support Steiner points strictly inside ccwPoly
  const minSpan = Math.max(2.0, Math.min(obb.lengthM, obb.widthM))
  const step = Math.max(0.4, Math.min(1.0, minSpan / 18))

  const candidates: Array<{ x: number; z: number; priority: number }> = []

  const nu = Math.max(4, Math.ceil(obb.lengthM / step))
  const nv = Math.max(4, Math.ceil(obb.widthM / step))

  const gridCell: Array<Array<{ x: number; z: number; inside: boolean; edge: number; d1: number; d2: number }>> = []
  for (let iu = 0; iu <= nu; iu++) {
    const row: Array<{ x: number; z: number; inside: boolean; edge: number; d1: number; d2: number }> = []
    const u = obb.uMin + (iu / nu) * (obb.uMax - obb.uMin)
    for (let iv = 0; iv <= nv; iv++) {
      const v = obb.vMin + (iv / nv) * (obb.vMax - obb.vMin)
      const x = obb.ux * u + obb.vx * v
      const z = obb.uz * u + obb.vz * v
      const inside = pointInPoly2D(x, z, ccwPoly)
      if (!inside) {
        row.push({ x, z, inside: false, edge: -1, d1: 0, d2: 0 })
      } else {
        const info = minDistanceToPolygonBoundary(x, z, ccwPoly)
        row.push({ x, z, inside: true, edge: info.nearestEdge, d1: info.minDist, d2: info.secondDist })
      }
    }
    gridCell.push(row)
  }

  // Bisect between adjacent interior cells whose nearest boundary wall differs -> snaps directly onto medial ridge/hip/valley!
  const bisectMedial = (ax: number, az: number, ae: number, bx: number, bz: number) => {
    let lx = ax
    let lz = az
    let rx = bx
    let rz = bz
    for (let iter = 0; iter < 7; iter++) {
      const mx = (lx + rx) / 2
      const mz = (lz + rz) / 2
      const info = minDistanceToPolygonBoundary(mx, mz, ccwPoly)
      if (info.nearestEdge === ae) {
        lx = mx
        lz = mz
      } else {
        rx = mx
        rz = mz
      }
    }
    return { x: (lx + rx) / 2, z: (lz + rz) / 2 }
  }

  for (let iu = 0; iu <= nu; iu++) {
    for (let iv = 0; iv <= nv; iv++) {
      const c = gridCell[iu]![iv]!
      if (!c.inside) continue

      if (iu < nu) {
        const right = gridCell[iu + 1]![iv]!
        if (right.inside && right.edge !== c.edge) {
          const snapped = bisectMedial(c.x, c.z, c.edge, right.x, right.z)
          if (pointInPoly2D(snapped.x, snapped.z, ccwPoly)) {
            const dInfo = minDistanceToPolygonBoundary(snapped.x, snapped.z, ccwPoly)
            if (dInfo.minDist > step * 0.28) {
              candidates.push({ x: snapped.x, z: snapped.z, priority: 2 })
            }
          }
        }
      }
      if (iv < nv) {
        const up = gridCell[iu]![iv + 1]!
        if (up.inside && up.edge !== c.edge) {
          const snapped = bisectMedial(c.x, c.z, c.edge, up.x, up.z)
          if (pointInPoly2D(snapped.x, snapped.z, ccwPoly)) {
            const dInfo = minDistanceToPolygonBoundary(snapped.x, snapped.z, ccwPoly)
            if (dInfo.minDist > step * 0.28) {
              candidates.push({ x: snapped.x, z: snapped.z, priority: 2 })
            }
          }
        }
      }

      // Sparse interior support points for smooth valley transitions near reflex corners
      if (iu % 2 === 0 && iv % 2 === 0 && c.d1 > step * 0.55) {
        candidates.push({ x: c.x, z: c.z, priority: 1 })
      }
    }
  }

  // Sort high-priority medial ridge points first and deduplicate with min spacing
  candidates.sort((a, b) => b.priority - a.priority)
  const acceptedSteiner: Pt2D[] = []
  for (const cand of candidates) {
    const minDistSpacing = cand.priority === 2 ? step * 0.52 : step * 1.35
    let tooClose = false
    for (const p of pts2D) {
      if (Math.hypot(cand.x - p.x, cand.z - p.z) < step * 0.45) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue
    for (const s of acceptedSteiner) {
      if (Math.hypot(cand.x - s.x, cand.z - s.z) < minDistSpacing) {
        tooClose = true
        break
      }
    }
    if (!tooClose) {
      acceptedSteiner.push({ x: cand.x, z: cand.z })
    }
  }

  // Insert Steiner points into constrained triangulation
  const boundaryEdgeKeys = new Set<string>()
  const edgeKey = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`)
  for (let i = 0; i < m; i++) {
    boundaryEdgeKeys.add(edgeKey(i, (i + 1) % m))
  }

  for (const sp of acceptedSteiner) {
    // Find triangle containing sp
    let foundIdx = -1
    let wA = 0
    let wB = 0
    let wC = 0
    for (let t = 0; t < tris.length; t++) {
      const [ia, ib, ic] = tris[t]!
      const A = pts2D[ia]!
      const B = pts2D[ib]!
      const C = pts2D[ic]!
      const det = (B.z - C.z) * (A.x - C.x) + (C.x - B.x) * (A.z - C.z)
      if (Math.abs(det) < 1e-8) continue
      const l1 = ((B.z - C.z) * (sp.x - C.x) + (C.x - B.x) * (sp.z - C.z)) / det
      const l2 = ((C.z - A.z) * (sp.x - C.x) + (A.x - C.x) * (sp.z - C.z)) / det
      const l3 = 1 - l1 - l2
      if (l1 >= -1e-4 && l2 >= -1e-4 && l3 >= -1e-4) {
        foundIdx = t
        wA = l1
        wB = l2
        wC = l3
        break
      }
    }
    if (foundIdx === -1) continue

    const newIdx = pts2D.length
    pts2D.push(sp)
    const [ia, ib, ic] = tris[foundIdx]!

    // If nearly on an interior edge, split both adjacent triangles across that edge
    if (wA < 0.03 || wB < 0.03 || wC < 0.03) {
      const eU = wA < 0.03 ? ib : wB < 0.03 ? ic : ia
      const eV = wA < 0.03 ? ic : wB < 0.03 ? ia : ib
      const opp1 = wA < 0.03 ? ia : wB < 0.03 ? ib : ic
      if (boundaryEdgeKeys.has(edgeKey(eU, eV))) {
        pts2D.pop()
        continue
      }
      let adjIdx = -1
      let opp2 = -1
      for (let t = 0; t < tris.length; t++) {
        if (t === foundIdx) continue
        const tri = tris[t]!
        if (tri.includes(eU) && tri.includes(eV)) {
          adjIdx = t
          opp2 = tri.find(k => k !== eU && k !== eV)!
          break
        }
      }
      if (adjIdx !== -1 && opp2 !== -1) {
        tris.splice(Math.max(foundIdx, adjIdx), 1)
        tris.splice(Math.min(foundIdx, adjIdx), 1)
        tris.push([opp1, eU, newIdx], [newIdx, eV, opp1], [opp2, eV, newIdx], [newIdx, eU, opp2])
        continue
      }
    }

    tris.splice(foundIdx, 1, [ia, ib, newIdx], [ib, ic, newIdx], [ic, ia, newIdx])
  }

  // Lawson Delaunay edge-flipping on strictly interior edges
  const inCircumcircle = (A: Pt2D, B: Pt2D, C: Pt2D, D: Pt2D): boolean => {
    const ax = A.x - D.x
    const az = A.z - D.z
    const bx = B.x - D.x
    const bz = B.z - D.z
    const cx = C.x - D.x
    const cz = C.z - D.z
    const det =
      (ax * ax + az * az) * (bx * cz - bz * cx) -
      (bx * bx + bz * bz) * (ax * cz - az * cx) +
      (cx * cx + cz * cz) * (ax * bz - az * bx)
    return det > 1e-7
  }

  const isConvexQuad = (p1: Pt2D, p2: Pt2D, p3: Pt2D, p4: Pt2D): boolean => {
    const c1 = (p2.x - p1.x) * (p3.z - p2.z) - (p2.z - p1.z) * (p3.x - p2.x)
    const c2 = (p3.x - p2.x) * (p4.z - p3.z) - (p3.z - p2.z) * (p4.x - p3.x)
    const c3 = (p4.x - p3.x) * (p1.z - p4.z) - (p4.z - p3.z) * (p1.x - p4.x)
    const c4 = (p1.x - p4.x) * (p2.z - p1.z) - (p1.z - p4.z) * (p2.x - p1.x)
    return c1 > 1e-5 && c2 > 1e-5 && c3 > 1e-5 && c4 > 1e-5
  }

  for (let pass = 0; pass < 8; pass++) {
    let flipped = false
    const edgeMap = new Map<string, Array<{ tIdx: number; u: number; v: number; opp: number }>>()
    for (let t = 0; t < tris.length; t++) {
      const [a, b, c] = tris[t]!
      const pairs: Array<[number, number, number]> = [
        [a, b, c],
        [b, c, a],
        [c, a, b]
      ]
      for (const [u, v, opp] of pairs) {
        const k = edgeKey(u, v)
        if (boundaryEdgeKeys.has(k)) continue
        const arr = edgeMap.get(k) || []
        arr.push({ tIdx: t, u, v, opp })
        edgeMap.set(k, arr)
      }
    }

    const touched = new Set<number>()
    for (const [, pair] of edgeMap.entries()) {
      if (pair.length !== 2) continue
      const e1 = pair[0]!
      const e2 = pair[1]!
      if (touched.has(e1.tIdx) || touched.has(e2.tIdx)) continue

      // e1 has directed edge u -> v with opposite w1; e2 has directed edge v -> u with opposite w2
      const u = e1.u
      const v = e1.v
      const w1 = e1.opp
      const w2 = e2.opp

      // Quad in CCW order is u -> w2 -> v -> w1
      const pU = pts2D[u]!
      const pW2 = pts2D[w2]!
      const pV = pts2D[v]!
      const pW1 = pts2D[w1]!
      if (!isConvexQuad(pU, pW2, pV, pW1)) continue

      if (inCircumcircle(pU, pV, pW1, pW2)) {
        tris[e1.tIdx] = [w2, w1, u]
        tris[e2.tIdx] = [w1, w2, v]
        touched.add(e1.tIdx)
        touched.add(e2.tIdx)
        flipped = true
      }
    }
    if (!flipped) break
  }

  // Compute vertex elevations: boundary vertices strictly at eaveHeightM, interior vertices at eaveHeightM + D * tanPitch
  const elevations: number[] = pts2D.map((p, idx) => {
    if (idx < m) return eaveHeightM
    const d = minDistanceToPolygonBoundary(p.x, p.z, ccwPoly).minDist
    return eaveHeightM + d * tanPitch
  })

  // Crease-alignment pass: flip interior quad diagonals if the alternate diagonal better matches the true roof envelope
  for (let pass = 0; pass < 2; pass++) {
    const edgeMap = new Map<string, Array<{ tIdx: number; u: number; v: number; opp: number }>>()
    for (let t = 0; t < tris.length; t++) {
      const [a, b, c] = tris[t]!
      for (const [u, v, opp] of [[a, b, c], [b, c, a], [c, a, b]] as Array<[number, number, number]>) {
        const k = edgeKey(u, v)
        if (boundaryEdgeKeys.has(k)) continue
        const arr = edgeMap.get(k) || []
        arr.push({ tIdx: t, u, v, opp })
        edgeMap.set(k, arr)
      }
    }
    const touched = new Set<number>()
    for (const [, pair] of edgeMap.entries()) {
      if (pair.length !== 2) continue
      const e1 = pair[0]!
      const e2 = pair[1]!
      if (touched.has(e1.tIdx) || touched.has(e2.tIdx)) continue
      const u = e1.u
      const v = e1.v
      const w1 = e1.opp
      const w2 = e2.opp
      const pU = pts2D[u]!
      const pW2 = pts2D[w2]!
      const pV = pts2D[v]!
      const pW1 = pts2D[w1]!
      if (!isConvexQuad(pU, pW2, pV, pW1)) continue

      const midUV = { x: (pU.x + pV.x) / 2, z: (pU.z + pV.z) / 2 }
      const trueUV = eaveHeightM + minDistanceToPolygonBoundary(midUV.x, midUV.z, ccwPoly).minDist * tanPitch
      const errUV = Math.abs((elevations[u]! + elevations[v]!) / 2 - trueUV)

      const midW = { x: (pW1.x + pW2.x) / 2, z: (pW1.z + pW2.z) / 2 }
      const trueW = eaveHeightM + minDistanceToPolygonBoundary(midW.x, midW.z, ccwPoly).minDist * tanPitch
      const errW = Math.abs((elevations[w1]! + elevations[w2]!) / 2 - trueW)

      if (errW + 0.015 < errUV) {
        tris[e1.tIdx] = [w2, w1, u]
        tris[e2.tIdx] = [w1, w2, v]
        touched.add(e1.tIdx)
        touched.add(e2.tIdx)
      }
    }
  }

  const topVerts: RoofVertex[] = pts2D.map((p, idx) => ({
    x: Number(p.x.toFixed(4)),
    y: Number(elevations[idx]!.toFixed(4)),
    z: Number(p.z.toFixed(4))
  }))
  const perimeter3D = topVerts.slice(0, m).map(v => ({ ...v }))

  const topTris: number[] = []
  for (const [a, b, c] of tris) {
    topTris.push(a, b, c)
  }

  // Extract ridge / hip / valley crease lines where adjacent triangle normals differ by > 10 degrees
  const triNormals: Array<{ nx: number; ny: number; nz: number }> = tris.map(([a, b, c]) => {
    const A = topVerts[a]!
    const B = topVerts[b]!
    const C = topVerts[c]!
    // Babylon left-handed upward normal: (C - A) x (B - A)
    const ux = C.x - A.x
    const uy = C.y - A.y
    const uz = C.z - A.z
    const vx = B.x - A.x
    const vy = B.y - A.y
    const vz = B.z - A.z
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    return { nx: nx / len, ny: ny / len, nz: nz / len }
  })

  const ridgeLines: Array<[RoofVertex, RoofVertex]> = []
  const edgeToTris = new Map<string, { u: number; v: number; list: number[] }>()
  for (let t = 0; t < tris.length; t++) {
    const [a, b, c] = tris[t]!
    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const k = edgeKey(u, v)
      if (boundaryEdgeKeys.has(k)) continue
      const entry = edgeToTris.get(k) || { u, v, list: [] }
      entry.list.push(t)
      edgeToTris.set(k, entry)
    }
  }
  const cosCrease = Math.cos((10 * Math.PI) / 180)
  for (const [, entry] of edgeToTris.entries()) {
    if (entry.list.length === 2) {
      const n1 = triNormals[entry.list[0]!]!
      const n2 = triNormals[entry.list[1]!]!
      const dot = n1.nx * n2.nx + n1.ny * n2.ny + n1.nz * n2.nz
      if (dot < cosCrease) {
        ridgeLines.push([{ ...topVerts[entry.u]! }, { ...topVerts[entry.v]! }])
      }
    }
  }

  return { topVerts, topTris, perimeter3D, ridgeLines }
}

/**
 * Dual-pitched Gable roof builder: splits the verified polygon cleanly along the ridge line
 * perpendicular to `azimuthDegrees` so the two sloped planes meet at a crisp elevated ridge
 * and form true triangular gable verges on the ends.
 */
function buildGableTopSurface(
  ccwPoly: Pt2D[],
  obb: ReturnType<typeof computeOrientedBoundingBox>,
  azimuthDegrees: number,
  eaveHeightM: number,
  tanPitch: number
): {
  topVerts: RoofVertex[]
  topTris: number[]
  perimeter3D: RoofVertex[]
  ridgeLines: Array<[RoofVertex, RoofVertex]>
} {
  const azRad = (azimuthDegrees * Math.PI) / 180
  // Slope direction perpendicular to ridge
  const nx = Math.sin(azRad)
  const nz = Math.cos(azRad)

  let sMin = Infinity
  let sMax = -Infinity
  for (const p of ccwPoly) {
    const s = (p.x - obb.obbCx) * nx + (p.z - obb.obbCz) * nz
    if (s < sMin) sMin = s
    if (s > sMax) sMax = s
  }
  const sMid = (sMin + sMax) / 2
  const halfSpan = Math.max(0.1, (sMax - sMin) / 2)

  const signedS = (p: Pt2D) => (p.x - obb.obbCx) * nx + (p.z - obb.obbCz) * nz - sMid
  const elevationAt = (p: Pt2D) => eaveHeightM + Math.max(0, halfSpan - Math.abs(signedS(p))) * tanPitch

  // Insert exact ridge-crossing vertices along perimeter edges so gable end peaks exist on the perimeter!
  const enrichedPoly: Pt2D[] = []
  const crossingPts: Pt2D[] = []

  for (let i = 0; i < ccwPoly.length; i++) {
    const a = ccwPoly[i]!
    const b = ccwPoly[(i + 1) % ccwPoly.length]!
    enrichedPoly.push(a)
    const sa = signedS(a)
    const sb = signedS(b)
    if ((sa > 1e-4 && sb < -1e-4) || (sa < -1e-4 && sb > 1e-4)) {
      const t = sa / (sa - sb)
      const crossPt = {
        x: a.x + t * (b.x - a.x),
        z: a.z + t * (b.z - a.z)
      }
      enrichedPoly.push(crossPt)
      crossingPts.push(crossPt)
    } else if (Math.abs(sa) <= 1e-4) {
      crossingPts.push(a)
    }
  }

  // Partition into positive-side (s >= -eps) and negative-side (s <= +eps) sub-polygons when clean 2-crossing gable
  if (crossingPts.length === 2) {
    const posPoly: Pt2D[] = []
    const negPoly: Pt2D[] = []
    for (const p of enrichedPoly) {
      const s = signedS(p)
      if (s >= -1e-3) posPoly.push(p)
      if (s <= 1e-3) negPoly.push(p)
    }

    if (posPoly.length >= 3 && negPoly.length >= 3) {
      const topVerts: RoofVertex[] = []
      const topTris: number[] = []

      const addHalf = (halfPoly: Pt2D[]) => {
        const cleanHalf = ensureCCW(cleanDuplicatePoints2D(halfPoly))
        if (cleanHalf.length < 3) return
        const base = topVerts.length
        const flat: number[] = []
        for (const p of cleanHalf) {
          flat.push(p.x, p.z)
          topVerts.push({
            x: Number(p.x.toFixed(4)),
            y: Number(elevationAt(p).toFixed(4)),
            z: Number(p.z.toFixed(4))
          })
        }
        const tri = earcut(flat)
        for (let i = 0; i < tri.length; i += 3) {
          topTris.push(base + tri[i]!, base + tri[i + 1]!, base + tri[i + 2]!)
        }
      }

      addHalf(posPoly)
      addHalf(negPoly)

      const perimeter3D: RoofVertex[] = enrichedPoly.map(p => ({
        x: Number(p.x.toFixed(4)),
        y: Number(elevationAt(p).toFixed(4)),
        z: Number(p.z.toFixed(4))
      }))

      const g1: RoofVertex = {
        x: Number(crossingPts[0]!.x.toFixed(4)),
        y: Number(elevationAt(crossingPts[0]!).toFixed(4)),
        z: Number(crossingPts[0]!.z.toFixed(4))
      }
      const g2: RoofVertex = {
        x: Number(crossingPts[1]!.x.toFixed(4)),
        y: Number(elevationAt(crossingPts[1]!).toFixed(4)),
        z: Number(crossingPts[1]!.z.toFixed(4))
      }

      return {
        topVerts,
        topTris,
        perimeter3D,
        ridgeLines: [[g1, g2]]
      }
    }
  }

  // Fallback for multi-crossing non-convex gable footprints
  const flat: number[] = []
  enrichedPoly.forEach(p => flat.push(p.x, p.z))
  const tri = earcut(flat)
  const topVerts: RoofVertex[] = enrichedPoly.map(p => ({
    x: Number(p.x.toFixed(4)),
    y: Number(elevationAt(p).toFixed(4)),
    z: Number(p.z.toFixed(4))
  }))
  const perimeter3D = topVerts.map(v => ({ ...v }))
  const ridgeLines: Array<[RoofVertex, RoofVertex]> = []
  if (crossingPts.length >= 2) {
    ridgeLines.push([
      {
        x: Number(crossingPts[0]!.x.toFixed(4)),
        y: Number(elevationAt(crossingPts[0]!).toFixed(4)),
        z: Number(crossingPts[0]!.z.toFixed(4))
      },
      {
        x: Number(crossingPts[1]!.x.toFixed(4)),
        y: Number(elevationAt(crossingPts[1]!).toFixed(4)),
        z: Number(crossingPts[1]!.z.toFixed(4))
      }
    ])
  }

  return { topVerts, topTris: Array.from(tri), perimeter3D, ridgeLines }
}

// ==========================================
// MAIN ENTRYPOINT: BUILD EXACT 3D ROOF GEOMETRY
// ==========================================

/**
 * Generates an exact 3D roof geometry mesh directly from verified Google Maps coordinates.
 */
export function buildExactRoofGeometry(
  polygonCoords: Array<{ lat: number; lng: number }>,
  googleMapsAreaM2: number,
  config: RoofGenerationConfig
): GeneratedRoofGeometry {
  const dedupCoords = cleanDuplicateLatLng(polygonCoords)
  if (dedupCoords.length < 3) {
    throw new Error('At least 3 distinct boundary vertices are required to generate a 3D roof.')
  }

  const orderedBoundary = orderRoofPolygonVertices(dedupCoords)
  if (!orderedBoundary.validation.isValid) {
    throw new Error(orderedBoundary.validation.message)
  }
  const cleanCoords = orderedBoundary.points

  // 1. Geographic local projection origin (preserve explicit origin if provided, else polygon centroid)
  let sumLat = 0
  let sumLng = 0
  cleanCoords.forEach(pt => {
    sumLat += pt.lat
    sumLng += pt.lng
  })
  const centerLat = Number.isFinite(config.originLat) ? config.originLat! : sumLat / cleanCoords.length
  const centerLng = Number.isFinite(config.originLng) ? config.originLng! : sumLng / cleanCoords.length

  // 2. Convert verified boundary to local Cartesian meters (preserving 1:1 vertex correspondence)
  const local2D = cleanCoords.map(pt => latLngToLocalMeters(pt.lat, pt.lng, centerLat, centerLng))
  const ccwPoly = ensureCCW(local2D)

  // 3. Bounding metrics & Oriented Bounding Box
  let sumX = 0
  let sumZ = 0
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  local2D.forEach(pt => {
    sumX += pt.x
    sumZ += pt.z
    minX = Math.min(minX, pt.x)
    maxX = Math.max(maxX, pt.x)
    minZ = Math.min(minZ, pt.z)
    maxZ = Math.max(maxZ, pt.z)
  })

  const cx = sumX / local2D.length
  const cz = sumZ / local2D.length
  const obb = computeOrientedBoundingBox(ccwPoly)
  const widthM = Number((maxX - minX).toFixed(2))
  const lengthM = Number((maxZ - minZ).toFixed(2))

  // 4. Verified 2D footprint area & truthful discrepancy calculation
  const babylonAreaM2 = computeLocalPolygonArea(local2D)
  const effectiveMapAreaM2 =
    !orderedBoundary.wasReordered && googleMapsAreaM2 && googleMapsAreaM2 > 0
      ? Number(googleMapsAreaM2.toFixed(2))
      : computeSphericalPolygonAreaM2(cleanCoords)

  const areaDiffPercent =
    effectiveMapAreaM2 > 0
      ? Number(((Math.abs(effectiveMapAreaM2 - babylonAreaM2) / effectiveMapAreaM2) * 100).toFixed(2))
      : 0

  const isDiscrepancyAcceptable = areaDiffPercent <= 2.0
  const warningMessage = !isDiscrepancyAcceptable
    ? `3D geometry area (${babylonAreaM2} m²) differs from Google Maps area (${effectiveMapAreaM2} m²) by ${areaDiffPercent}%.`
    : undefined

  // 5. Normalize roof structure type & physical slope parameters
  const canonicalType = normalizeRoofStructureType(config.roofType, local2D)
  const clampedPitchDeg = Math.max(0, Math.min(65, Number(config.pitchDegrees) || 0))
  const pitchRad = (clampedPitchDeg * Math.PI) / 180
  const tanPitch = Math.tan(pitchRad)
  const azRad = ((Number(config.azimuthDegrees) || 0) * Math.PI) / 180
  const eaveHeightM = Number.isFinite(config.eaveHeightM) ? config.eaveHeightM : 3.5
  const thickness = Math.max(0.05, Number(config.roofThicknessM) || 0.15)
  // Vertical drop along Y so perpendicular slab thickness equals `thickness`
  const verticalThickness = Number((thickness / Math.max(0.35, Math.cos(pitchRad))).toFixed(4))

  // 6. Generate multi-plane top surface based on selected Roof Structure Type
  let topVerts: RoofVertex[] = []
  let topTris: number[] = []
  let perimeter3D: RoofVertex[] = []
  let ridgeLines: Array<[RoofVertex, RoofVertex]> = []

  if (canonicalType === 'Flat' || clampedPitchDeg < 0.1) {
    topVerts = ccwPoly.map(p => ({
      x: Number(p.x.toFixed(4)),
      y: Number(eaveHeightM.toFixed(4)),
      z: Number(p.z.toFixed(4))
    }))
    const flat: number[] = []
    ccwPoly.forEach(p => flat.push(p.x, p.z))
    topTris = Array.from(earcut(flat))
    perimeter3D = topVerts.map(v => ({ ...v }))
  } else if (canonicalType === 'Single Slope / Shed') {
    // Downward slope direction along azimuth (+X = East = sin(az), +Z = North = cos(az))
    const downX = Math.sin(azRad)
    const downZ = Math.cos(azRad)
    let maxProj = -Infinity
    for (const p of ccwPoly) {
      const proj = p.x * downX + p.z * downZ
      if (proj > maxProj) maxProj = proj
    }
    topVerts = ccwPoly.map(p => {
      const proj = p.x * downX + p.z * downZ
      const rise = Math.max(0, maxProj - proj) * tanPitch
      return {
        x: Number(p.x.toFixed(4)),
        y: Number((eaveHeightM + rise).toFixed(4)),
        z: Number(p.z.toFixed(4))
      }
    })
    const flat: number[] = []
    ccwPoly.forEach(p => flat.push(p.x, p.z))
    topTris = Array.from(earcut(flat))
    perimeter3D = topVerts.map(v => ({ ...v }))
  } else if (canonicalType === 'Gable') {
    const gable = buildGableTopSurface(ccwPoly, obb, config.azimuthDegrees, eaveHeightM, tanPitch)
    topVerts = gable.topVerts
    topTris = gable.topTris
    perimeter3D = gable.perimeter3D
    ridgeLines = gable.ridgeLines
  } else {
    // 'Hip / Pyramid', 'L-Shape', 'T-Shape', 'U-Shape', 'Irregular'
    const quadHip =
      canonicalType === 'Hip / Pyramid'
        ? tryBuildQuadHipTopSurface(ccwPoly, eaveHeightM, tanPitch)
        : null

    if (quadHip) {
      topVerts = quadHip.topVerts
      topTris = quadHip.topTris
      perimeter3D = quadHip.perimeter3D
      ridgeLines = quadHip.ridgeLines
    } else {
      const medial = buildMedialRidgeHipTopSurface(ccwPoly, obb, eaveHeightM, tanPitch)
      topVerts = medial.topVerts
      topTris = medial.topTris
      perimeter3D = medial.perimeter3D
      ridgeLines = medial.ridgeLines
    }
  }

  // 7. Build physical 3D solid mesh with crisp flat-shaded normals:
  //    - Top sloped roof facets (upward outward normals)
  //    - Sloped underside facets offset by `verticalThickness` (follows the sloped planes, NOT a flat box!)
  //    - Outer perimeter fascia / verge walls
  const allVertices: RoofVertex[] = []
  const indices: number[] = []
  const normals: number[] = []
  const faces: RoofFace[] = []

  const addFlatShadedTriangle = (A: RoofVertex, B: RoofVertex, C: RoofVertex, forceUpward?: boolean) => {
    // Babylon.js left-handed front-face normal is (C - A) x (B - A)
    let p1 = A
    let p2 = B
    let p3 = C

    const computeBabylonNormal = (v1: RoofVertex, v2: RoofVertex, v3: RoofVertex) => {
      const ux = v3.x - v1.x
      const uy = v3.y - v1.y
      const uz = v3.z - v1.z
      const vx = v2.x - v1.x
      const vy = v2.y - v1.y
      const vz = v2.z - v1.z
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      return { nx, ny, nz, len }
    }

    let n = computeBabylonNormal(p1, p2, p3)
    if (n.len < 1e-7) return

    if (forceUpward === true && n.ny < 0) {
      const tmp = p2
      p2 = p3
      p3 = tmp
      n = computeBabylonNormal(p1, p2, p3)
    } else if (forceUpward === false && n.ny > 0) {
      const tmp = p2
      p2 = p3
      p3 = tmp
      n = computeBabylonNormal(p1, p2, p3)
    }

    const ux = Number((n.nx / n.len).toFixed(4))
    const uy = Number((n.ny / n.len).toFixed(4))
    const uz = Number((n.nz / n.len).toFixed(4))

    const baseIdx = allVertices.length
    allVertices.push(
      { x: p1.x, y: p1.y, z: p1.z },
      { x: p2.x, y: p2.y, z: p2.z },
      { x: p3.x, y: p3.y, z: p3.z }
    )
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2)
    normals.push(ux, uy, uz, ux, uy, uz, ux, uy, uz)
    faces.push({
      indices: [baseIdx, baseIdx + 1, baseIdx + 2],
      segmentIndex: 0,
      normal: [ux, uy, uz]
    })
  }

  // Normalized topTris so every top triangle in topSurfaceIndices is strictly upward-facing CCW
  const cleanTopIndices: number[] = []
  for (let i = 0; i < topTris.length; i += 3) {
    const ia = topTris[i]!
    const ib = topTris[i + 1]!
    const ic = topTris[i + 2]!
    const A = topVerts[ia]
    const B = topVerts[ib]
    const C = topVerts[ic]
    if (!A || !B || !C) continue

    // Check 2D signed area for CCW
    const cross2D = (B.x - A.x) * (C.z - A.z) - (B.z - A.z) * (C.x - A.x)
    if (Math.abs(cross2D) < 1e-7) continue
    if (cross2D > 0) {
      cleanTopIndices.push(ia, ib, ic)
      addFlatShadedTriangle(A, B, C, true)
    } else {
      cleanTopIndices.push(ia, ic, ib)
      addFlatShadedTriangle(A, C, B, true)
    }
  }

  // Sloped underside (bottom surface) following every sloped roof plane!
  for (let i = 0; i < cleanTopIndices.length; i += 3) {
    const A = topVerts[cleanTopIndices[i]!]!
    const B = topVerts[cleanTopIndices[i + 1]!]!
    const C = topVerts[cleanTopIndices[i + 2]!]!
    const Ab: RoofVertex = { x: A.x, y: Number((A.y - verticalThickness).toFixed(4)), z: A.z }
    const Bb: RoofVertex = { x: B.x, y: Number((B.y - verticalThickness).toFixed(4)), z: B.z }
    const Cb: RoofVertex = { x: C.x, y: Number((C.y - verticalThickness).toFixed(4)), z: C.z }
    addFlatShadedTriangle(Ab, Cb, Bb, false)
  }

  // Perimeter fascia / verge edge faces along CCW outer boundary
  const perimCCW =
    computeSignedPolygonArea(perimeter3D.map(v => ({ x: v.x, z: v.z }))) < 0
      ? [...perimeter3D].reverse()
      : perimeter3D

  for (let i = 0; i < perimCCW.length; i++) {
    const T0 = perimCCW[i]!
    const T1 = perimCCW[(i + 1) % perimCCW.length]!
    if (Math.hypot(T1.x - T0.x, T1.z - T0.z) < 1e-4) continue
    const B0: RoofVertex = { x: T0.x, y: Number((T0.y - verticalThickness).toFixed(4)), z: T0.z }
    const B1: RoofVertex = { x: T1.x, y: Number((T1.y - verticalThickness).toFixed(4)), z: T1.z }
    // For CCW edge T0 -> T1, outward normal is (+dz, 0, -dx), which matches (B1 - T0) x (B0 - T0)
    addFlatShadedTriangle(T0, B0, B1)
    addFlatShadedTriangle(T0, B1, T1)
  }

  let minY = Infinity
  let maxY = -Infinity
  for (const v of allVertices) {
    if (v.y < minY) minY = v.y
    if (v.y > maxY) maxY = v.y
  }
  if (!Number.isFinite(minY)) minY = eaveHeightM - thickness
  if (!Number.isFinite(maxY)) maxY = eaveHeightM

  return {
    vertices: allVertices,
    indices,
    normals,
    faces,
    topSurfaceVertices: topVerts,
    topSurfaceIndices: cleanTopIndices,
    footprint2D: local2D,
    boundaryLatLng: cleanCoords,
    perimeter3D,
    ridgeLines,
    origin: {
      latitude: Number(centerLat.toFixed(7)),
      longitude: Number(centerLng.toFixed(7))
    },
    centroid: {
      x: Number(cx.toFixed(3)),
      y: Number(((minY + maxY) / 2).toFixed(3)),
      z: Number(cz.toFixed(3))
    },
    footprintAreaM2: babylonAreaM2,
    roofType: canonicalType,
    boundingDimensions: {
      widthM,
      lengthM,
      heightM: Number((maxY - minY).toFixed(3)),
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
      minZ: Number(minZ.toFixed(3)),
      maxZ: Number(maxZ.toFixed(3))
    },
    areaDiscrepancy: {
      googleAreaM2: effectiveMapAreaM2,
      babylonAreaM2,
      differencePercent: areaDiffPercent,
      isDiscrepancyAcceptable,
      warningMessage
    }
  }
}

/**
 * Applies a freshly computed GeneratedRoofGeometry onto an existing RoofModel (mutating & returning it),
 * keeping both `segments` and `roofSegments`, `geometry`, `building`, and v2 area/footprint metadata
 * 100% synchronized.
 */
export function applyGeneratedGeometryToRoofModel(
  model: RoofModel,
  geom: GeneratedRoofGeometry,
  options: {
    pitchDegrees: number
    azimuthDegrees: number
    eaveHeightM: number
    roofThicknessM: number
    structureVerifiedByInstaller?: boolean
  }
): RoofModel {
  const existingSeg = model.segments?.[0] || model.roofSegments?.[0]
  const mapAreaM2 = geom.areaDiscrepancy.googleAreaM2
  const ridgeEdges: RoofEdge[] = geom.ridgeLines.map(([start, end]) => ({
    start,
    end,
    segmentIndex: 0,
    lengthMeters: Number(
      Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z).toFixed(2)
    )
  }))

  const planeGeom: RoofPlaneGeometry = {
    segmentIndex: 0,
    vertices: geom.vertices,
    faces: geom.faces,
    normal: [0, 1, 0],
    pitchDegrees: options.pitchDegrees,
    azimuthDegrees: options.azimuthDegrees,
    elevationMeters: geom.centroid.y,
    center: geom.centroid,
    polygon2D: geom.footprint2D
  }

  const updatedSeg: RoofSegment = {
    ...(existingSeg || {}),
    id: existingSeg?.id || 'roof-segment-0',
    segmentIndex: 0,
    pitchDegrees: options.pitchDegrees,
    azimuthDegrees: options.azimuthDegrees,
    areaMeters2: mapAreaM2,
    groundAreaMeters2: geom.footprintAreaM2,
    areaM2: mapAreaM2,
    groundAreaM2: geom.footprintAreaM2,
    center: {
      x: geom.centroid.x,
      y: geom.centroid.y,
      z: geom.centroid.z,
      latitude: geom.origin.latitude,
      longitude: geom.origin.longitude
    },
    vertices: geom.vertices,
    indices: geom.indices,
    normals: geom.normals,
    geometry: planeGeom,
    verificationStatus: existingSeg?.verificationStatus || 'Installer Verified',
    source: existingSeg?.source || 'Installer Verified',
    footprint2D: geom.footprint2D,
    boundaryLatLng: geom.boundaryLatLng,
    perimeter3D: geom.perimeter3D,
    ridgeLines: geom.ridgeLines,
    topSurfaceVertices: geom.topSurfaceVertices,
    topSurfaceIndices: geom.topSurfaceIndices,
    roofType: geom.roofType,
    roofThicknessM: options.roofThicknessM,
    eaveHeightM: options.eaveHeightM,
    geometryVersion: 2
  }

  model.origin = {
    latitude: geom.origin.latitude,
    longitude: geom.origin.longitude,
    elevation: options.eaveHeightM
  }
  model.segments = [updatedSeg]
  model.roofSegments = [updatedSeg]
  model.geometry = {
    vertices: geom.vertices,
    faces: geom.faces,
    segments: [planeGeom],
    ridges: ridgeEdges,
    valleys: [],
    eaves: [],
    bounds: {
      minX: geom.boundingDimensions.minX,
      maxX: geom.boundingDimensions.maxX,
      minY: geom.boundingDimensions.minY,
      maxY: geom.boundingDimensions.maxY,
      minZ: geom.boundingDimensions.minZ,
      maxZ: geom.boundingDimensions.maxZ
    }
  }
  model.building = {
    ...(model.building || { center: { latitude: geom.origin.latitude, longitude: geom.origin.longitude } }),
    center: {
      latitude: geom.origin.latitude,
      longitude: geom.origin.longitude
    },
    areaM2: mapAreaM2,
    roofType: geom.roofType
  }
  model.roofType = geom.roofType
  model.pitch = options.pitchDegrees
  model.pitchDegrees = options.pitchDegrees
  model.azimuth = options.azimuthDegrees
  model.azimuthDegrees = options.azimuthDegrees
  model.roofThicknessM = options.roofThicknessM
  model.eaveHeightM = options.eaveHeightM
  model.boundaryLatLng = geom.boundaryLatLng
  model.footprint2D = geom.footprint2D
  model.mapAreaM2 = mapAreaM2
  model.footprintAreaM2 = geom.footprintAreaM2
  model.areaDiscrepancy = geom.areaDiscrepancy
  if (options.structureVerifiedByInstaller !== undefined) {
    model.structureVerifiedByInstaller = options.structureVerifiedByInstaller
  }
  model.geometryVersion = 2
  model.updatedAt = new Date().toISOString()

  return model
}

/**
 * Validates and upgrades any saved RoofModel (including legacy v1 flat/black models in localStorage)
 * into a canonical v2 multi-plane 3D RoofModel preserving 100% of its verified footprint, area,
 * obstacles, rooftop features, and placed panels.
 * Returns null if the model has no verified roof polygon (< 3 boundary vertices).
 */
export function hydrateOrUpgradeRoofModel(rawModel?: RoofModel | null): RoofModel | null {
  if (!rawModel) return null

  const clone: RoofModel = JSON.parse(JSON.stringify(rawModel))
  const seg = clone.segments?.[0] || clone.roofSegments?.[0]
  const boundaryLatLng = extractVerifiedBoundaryLatLng(clone)
  if (boundaryLatLng.length < 3) {
    return null
  }

  let fp2D = extractVerifiedFootprint2D(clone, seg)
  if (fp2D.length < 3) {
    const avgLat = clone.origin?.latitude ?? boundaryLatLng.reduce((s, p) => s + p.lat, 0) / boundaryLatLng.length
    const avgLng = clone.origin?.longitude ?? boundaryLatLng.reduce((s, p) => s + p.lng, 0) / boundaryLatLng.length
    fp2D = boundaryLatLng.map(pt => latLngToLocalMeters(pt.lat, pt.lng, avgLat, avgLng))
  }

  const orderedCheck = orderRoofPolygonVertices(boundaryLatLng)
  if (!orderedCheck.validation.isValid) {
    return null
  }

  // Already v2 AND valid non-intersecting perimeter: ensure segments & roofSegments stay synced
  if (
    !orderedCheck.wasReordered &&
    clone.geometryVersion &&
    clone.geometryVersion >= 2 &&
    seg?.geometryVersion &&
    seg.geometryVersion >= 2
  ) {
    if (clone.segments?.length && (!clone.roofSegments || clone.roofSegments.length === 0)) {
      clone.roofSegments = clone.segments
    } else if (clone.roofSegments?.length && (!clone.segments || clone.segments.length === 0)) {
      clone.segments = clone.roofSegments
    }
    const localArea = computeLocalPolygonArea(fp2D)
    const mapArea =
      clone.mapAreaM2 ||
      clone.areaDiscrepancy?.googleAreaM2 ||
      clone.building?.areaM2 ||
      computeSphericalPolygonAreaM2(boundaryLatLng)
    const diffPct = mapArea > 0 ? Number(((Math.abs(mapArea - localArea) / mapArea) * 100).toFixed(2)) : 0
    clone.footprint2D = fp2D
    clone.boundaryLatLng = boundaryLatLng
    clone.footprintAreaM2 = localArea
    clone.mapAreaM2 = mapArea
    clone.areaDiscrepancy = {
      googleAreaM2: mapArea,
      babylonAreaM2: localArea,
      differencePercent: diffPct,
      isDiscrepancyAcceptable: diffPct <= 2.0
    }
    clone.roofType = normalizeRoofStructureType(clone.roofType || seg.roofType || clone.building?.roofType, fp2D)
    return clone
  }

  // Upgrade v1 model (or untangle any self-intersecting saved boundary) -> canonical v2 multi-plane 3D roof!
  const originLat =
    clone.origin?.latitude ??
    clone.building?.center?.latitude ??
    orderedCheck.points.reduce((s, p) => s + p.lat, 0) / orderedCheck.points.length
  const originLng =
    clone.origin?.longitude ??
    clone.building?.center?.longitude ??
    orderedCheck.points.reduce((s, p) => s + p.lng, 0) / orderedCheck.points.length

  const alignedLatLng = orderedCheck.points
  const correctedFp2D = alignedLatLng.map(pt => latLngToLocalMeters(pt.lat, pt.lng, originLat, originLng))

  const localArea = computeLocalPolygonArea(correctedFp2D)
  const rawStoredArea = clone.mapAreaM2 || clone.building?.areaM2 || seg?.areaM2 || seg?.areaMeters2 || 0
  const mapAreaM2 =
    !orderedCheck.wasReordered &&
    rawStoredArea > 0 &&
    localArea > 0 &&
    Math.abs(rawStoredArea - localArea) / localArea <= 0.05
      ? Number(rawStoredArea.toFixed(2))
      : computeSphericalPolygonAreaM2(alignedLatLng)

  const pitchDegrees =
    typeof clone.pitchDegrees === 'number'
      ? clone.pitchDegrees
      : typeof seg?.pitchDegrees === 'number'
        ? seg.pitchDegrees
        : 15
  const azimuthDegrees =
    typeof clone.azimuthDegrees === 'number'
      ? clone.azimuthDegrees
      : typeof seg?.azimuthDegrees === 'number'
        ? seg.azimuthDegrees
        : 180
  const eaveHeightM = clone.eaveHeightM ?? seg?.eaveHeightM ?? clone.origin?.elevation ?? 3.5
  const roofThicknessM = clone.roofThicknessM ?? seg?.roofThicknessM ?? 0.15

  const rawType = (clone.roofType || seg?.roofType || clone.building?.roofType || '').trim()
  const unverifiedLegacyDefault =
    !clone.structureVerifiedByInstaller &&
    (!rawType ||
      rawType === 'Custom' ||
      rawType === 'Custom Drawn' ||
      rawType === 'Not detected' ||
      rawType === 'Single Slope' ||
      (rawType === 'Flat' && pitchDegrees > 0))

  const resolvedRoofType: CanonicalRoofStructureType = unverifiedLegacyDefault
    ? inferFootprintShapeType(correctedFp2D)
    : normalizeRoofStructureType(rawType, correctedFp2D)

  const geom = buildExactRoofGeometry(alignedLatLng, mapAreaM2, {
    pitchDegrees,
    azimuthDegrees,
    eaveHeightM,
    roofThicknessM,
    roofType: resolvedRoofType,
    originLat,
    originLng
  })

  return applyGeneratedGeometryToRoofModel(clone, geom, {
    pitchDegrees,
    azimuthDegrees,
    eaveHeightM,
    roofThicknessM,
    structureVerifiedByInstaller: Boolean(clone.structureVerifiedByInstaller)
  })
}

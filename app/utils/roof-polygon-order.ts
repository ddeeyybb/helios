/**
 * HELIOS-LOAD Roof Polygon Perimeter Ordering & Validation Engine
 *
 * Guarantees that manually drawn or edited roof vertices on Google Maps and in
 * Babylon.js 3D reconstruction always follow a valid, non-self-intersecting outer
 * perimeter without moving any user-placed vertex coordinates.
 */

const EARTH_RADIUS_M = 6378137

function projectLatLngToMeters(lat: number, lng: number, centerLat: number, centerLng: number): { x: number; y: number } {
  const dLatRad = ((lat - centerLat) * Math.PI) / 180
  const dLngRad = ((lng - centerLng) * Math.PI) / 180
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  return {
    x: dLngRad * EARTH_RADIUS_M * cosLat,
    y: dLatRad * EARTH_RADIUS_M
  }
}

function unprojectMetersToLatLng(x: number, y: number, centerLat: number, centerLng: number): GeoLatLng {
  const cosLat = Math.max(1e-6, Math.cos((centerLat * Math.PI) / 180))
  const dLat = (y / EARTH_RADIUS_M) * (180 / Math.PI)
  const dLng = (x / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI)
  return {
    lat: centerLat + dLat,
    lng: centerLng + dLng
  }
}

export interface GeoLatLng {
  lat: number
  lng: number
}

export interface PolygonCrossingInfo {
  edgeA: [number, number]
  edgeB: [number, number]
  intersection: GeoLatLng
}

export interface PolygonValidationResult {
  isValid: boolean
  hasSelfIntersection: boolean
  hasDuplicatePoints: boolean
  hasZeroArea: boolean
  message: string
  crossings: PolygonCrossingInfo[]
}

export interface OrderedRoofPolygonResult {
  points: GeoLatLng[]
  originalIndices: number[]
  wasReordered: boolean
  validation: PolygonValidationResult
}

interface ProjectedVertex {
  originalIndex: number
  point: GeoLatLng
  x: number // East meters
  y: number // North meters
}

export const SELF_INTERSECTION_ERROR_MESSAGE =
  'Roof lines cannot cross. Please adjust the roof points.'

function projectVertices(points: GeoLatLng[]): {
  originLat: number
  originLng: number
  verts: ProjectedVertex[]
} {
  if (points.length === 0) {
    return { originLat: 0, originLng: 0, verts: [] }
  }
  const originLat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const originLng = points.reduce((s, p) => s + p.lng, 0) / points.length

  const verts: ProjectedVertex[] = points.map((p, idx) => {
    const m = projectLatLngToMeters(p.lat, p.lng, originLat, originLng)
    return {
      originalIndex: idx,
      point: { lat: p.lat, lng: p.lng },
      x: m.x,
      y: m.y
    }
  })

  return { originLat, originLng, verts }
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pointToSegmentDist2D(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): { dist: number; t: number; projX: number; projY: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) {
    return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0, projX: a.x, projY: a.y }
  }
  const rawT = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  const t = Math.max(0, Math.min(1, rawT))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return {
    dist: Math.hypot(p.x - projX, p.y - projY),
    t,
    projX,
    projY
  }
}

/**
 * Exact 2D segment-segment intersection test (both proper crossings and improper
 * vertex-on-edge touches/collinear overlaps) for non-adjacent polygon edges.
 */
function checkSegmentsIntersect2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  tol = 1e-3
): { intersects: boolean; x: number; y: number } {
  const minABx = Math.min(a.x, b.x) - tol
  const maxABx = Math.max(a.x, b.x) + tol
  const minABy = Math.min(a.y, b.y) - tol
  const maxABy = Math.max(a.y, b.y) + tol
  const minCDx = Math.min(c.x, d.x) - tol
  const maxCDx = Math.max(c.x, d.x) + tol
  const minCDy = Math.min(c.y, d.y) - tol
  const maxCDy = Math.max(c.y, d.y) + tol

  if (maxABx < minCDx || maxCDx < minABx || maxABy < minCDy || maxCDy < minABy) {
    return { intersects: false, x: 0, y: 0 }
  }

  // Improper contact: endpoint of one non-adjacent segment touches the other segment
  const dCA = pointToSegmentDist2D(c, a, b)
  if (dCA.dist <= tol) return { intersects: true, x: dCA.projX, y: dCA.projY }
  const dDA = pointToSegmentDist2D(d, a, b)
  if (dDA.dist <= tol) return { intersects: true, x: dDA.projX, y: dDA.projY }
  const dAC = pointToSegmentDist2D(a, c, d)
  if (dAC.dist <= tol) return { intersects: true, x: dAC.projX, y: dAC.projY }
  const dBC = pointToSegmentDist2D(b, c, d)
  if (dBC.dist <= tol) return { intersects: true, x: dBC.projX, y: dBC.projY }

  const rX = b.x - a.x
  const rY = b.y - a.y
  const sX = d.x - c.x
  const sY = d.y - c.y
  const denom = rX * sY - rY * sX

  if (Math.abs(denom) < 1e-10) {
    return { intersects: false, x: 0, y: 0 }
  }

  const qpX = c.x - a.x
  const qpY = c.y - a.y
  const t = (qpX * sY - qpY * sX) / denom
  const u = (qpX * rY - qpY * rX) / denom

  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return {
      intersects: true,
      x: a.x + t * rX,
      y: a.y + t * rY
    }
  }

  return { intersects: false, x: 0, y: 0 }
}

function computeSignedArea2D(order: number[], verts: ProjectedVertex[]): number {
  const n = order.length
  if (n < 3) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = verts[order[i]!]!
    const b = verts[order[(i + 1) % n]!]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function computePerimeter2D(order: number[], verts: ProjectedVertex[]): number {
  const n = order.length
  if (n < 2) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = verts[order[i]!]!
    const b = verts[order[(i + 1) % n]!]!
    sum += dist2D(a, b)
  }
  return sum
}

/**
 * Computes minimum vertex corner angle (degrees, in [0, 180]) around the cycle.
 * Used to detect needle/hairpin spikes where an edge doubles back along itself.
 */
function computeMinCornerAngleDeg(order: number[], verts: ProjectedVertex[]): number {
  const n = order.length
  if (n < 3) return 180
  let minDeg = 180
  for (let i = 0; i < n; i++) {
    const prev = verts[order[(i - 1 + n) % n]!]!
    const curr = verts[order[i]!]!
    const next = verts[order[(i + 1) % n]!]!
    const ux = prev.x - curr.x
    const uy = prev.y - curr.y
    const vx = next.x - curr.x
    const vy = next.y - curr.y
    const lu = Math.hypot(ux, uy)
    const lv = Math.hypot(vx, vy)
    if (lu < 1e-6 || lv < 1e-6) return 0
    const cosA = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
    const deg = (Math.acos(cosA) * 180) / Math.PI
    if (deg < minDeg) minDeg = deg
  }
  return minDeg
}

function computeMinNonIncidentClearanceM(order: number[], verts: ProjectedVertex[]): number {
  const n = order.length
  if (n < 4) return Infinity
  let minClearance = Infinity
  for (let i = 0; i < n; i++) {
    const p = verts[order[i]!]!
    for (let j = 0; j < n; j++) {
      const jNext = (j + 1) % n
      if (i === j || i === jNext) continue
      const a = verts[order[j]!]!
      const b = verts[order[jNext]!]!
      const { dist } = pointToSegmentDist2D(p, a, b)
      if (dist < minClearance) minClearance = dist
    }
  }
  return minClearance
}

function evaluateOrderValidity(
  order: number[],
  verts: ProjectedVertex[],
  originLat: number,
  originLng: number
): PolygonValidationResult {
  const n = order.length
  if (n < 3) {
    return {
      isValid: false,
      hasSelfIntersection: false,
      hasDuplicatePoints: false,
      hasZeroArea: true,
      message: 'At least 3 roof points are required.',
      crossings: []
    }
  }

  for (let i = 0; i < n; i++) {
    const p = verts[order[i]!]!
    if (!Number.isFinite(p.point.lat) || !Number.isFinite(p.point.lng)) {
      return {
        isValid: false,
        hasSelfIntersection: false,
        hasDuplicatePoints: false,
        hasZeroArea: true,
        message: 'Invalid coordinates detected in roof boundary.',
        crossings: []
      }
    }
  }

  // 1. Check duplicate points (any two distinct vertices closer than 2 cm)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dist2D(verts[order[i]!]!, verts[order[j]!]!) < 0.02) {
        return {
          isValid: false,
          hasSelfIntersection: true,
          hasDuplicatePoints: true,
          hasZeroArea: false,
          message: SELF_INTERSECTION_ERROR_MESSAGE,
          crossings: [
            {
              edgeA: [i, (i + 1) % n],
              edgeB: [j, (j + 1) % n],
              intersection: verts[order[i]!]!.point
            }
          ]
        }
      }
    }
  }

  const crossings: PolygonCrossingInfo[] = []

  // 2. Check non-adjacent edge intersections & improper vertex-on-edge touches
  for (let i = 0; i < n; i++) {
    const iNext = (i + 1) % n
    const a = verts[order[i]!]!
    const b = verts[order[iNext]!]!

    for (let j = i + 1; j < n; j++) {
      const jNext = (j + 1) % n
      if (iNext === j || jNext === i) continue

      const c = verts[order[j]!]!
      const d = verts[order[jNext]!]!
      const hit = checkSegmentsIntersect2D(a, b, c, d, 1e-3)
      if (hit.intersects) {
        crossings.push({
          edgeA: [i, iNext],
          edgeB: [j, jNext],
          intersection: unprojectMetersToLatLng(hit.x, hit.y, originLat, originLng)
        })
      }
    }
  }

  // 3. Check adjacent 180° fold-back overlaps (e.g. P4 -> P5 -> P1 doubling straight back over P4)
  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n
    const nextIdx = (i + 1) % n
    const prev = verts[order[prevIdx]!]!
    const curr = verts[order[i]!]!
    const next = verts[order[nextIdx]!]!
    const ux = prev.x - curr.x
    const uy = prev.y - curr.y
    const vx = next.x - curr.x
    const vy = next.y - curr.y
    const lu = Math.hypot(ux, uy)
    const lv = Math.hypot(vx, vy)
    if (lu > 1e-5 && lv > 1e-5) {
      const cosA = (ux * vx + uy * vy) / (lu * lv)
      if (cosA > 0.9985) {
        crossings.push({
          edgeA: [prevIdx, i],
          edgeB: [i, nextIdx],
          intersection: curr.point
        })
      }
    }
  }

  if (crossings.length > 0) {
    return {
      isValid: false,
      hasSelfIntersection: true,
      hasDuplicatePoints: false,
      hasZeroArea: false,
      message: SELF_INTERSECTION_ERROR_MESSAGE,
      crossings
    }
  }

  const area = Math.abs(computeSignedArea2D(order, verts))
  if (area < 0.05) {
    return {
      isValid: false,
      hasSelfIntersection: true,
      hasDuplicatePoints: false,
      hasZeroArea: true,
      message: SELF_INTERSECTION_ERROR_MESSAGE,
      crossings: []
    }
  }

  return {
    isValid: true,
    hasSelfIntersection: false,
    hasDuplicatePoints: false,
    hasZeroArea: false,
    message: '',
    crossings: []
  }
}

/**
 * Public validator for a sequence of Google Maps LatLng roof vertices.
 */
export function validateRoofPolygon(points: GeoLatLng[]): PolygonValidationResult {
  const { originLat, originLng, verts } = projectVertices(points)
  const order = verts.map((_, i) => i)
  return evaluateOrderValidity(order, verts, originLat, originLng)
}

/**
 * 2-opt uncrossing pass: iteratively reverses sub-chains whenever two non-adjacent
 * edges cross or overlap, strictly reducing Euclidean perimeter at every step.
 */
function untangleOrder2Opt(
  initialOrder: number[],
  verts: ProjectedVertex[],
  originLat: number,
  originLng: number
): number[] {
  const order = [...initialOrder]
  const n = order.length
  if (n < 4) return order

  const maxPasses = n * n * 2
  for (let pass = 0; pass < maxPasses; pass++) {
    let swapped = false

    for (let i = 0; i < n && !swapped; i++) {
      const iNext = (i + 1) % n
      for (let j = i + 2; j < n && !swapped; j++) {
        const jNext = (j + 1) % n
        if (jNext === i) continue

        const a = verts[order[i]!]!
        const b = verts[order[iNext]!]!
        const c = verts[order[j]!]!
        const d = verts[order[jNext]!]!

        const hit = checkSegmentsIntersect2D(a, b, c, d, 1e-3)
        const curLen = dist2D(a, b) + dist2D(c, d)
        const newLen = dist2D(a, c) + dist2D(b, d)

        if (hit.intersects || newLen + 1e-6 < curLen - 1e-4 && hit.intersects) {
          // Reverse sub-segment from iNext..j inclusive
          let left = iNext
          let right = j
          while (left < right) {
            const tmp = order[left]!
            order[left] = order[right]!
            order[right] = tmp
            left++
            right--
          }
          swapped = true
        }
      }
    }

    if (!swapped) break
  }

  // Secondary check for adjacent collinear fold-backs resolved by single-point relocation
  const val = evaluateOrderValidity(order, verts, originLat, originLng)
  if (!val.isValid && n >= 4) {
    for (let i = 0; i < n; i++) {
      const vIdx = order[i]!
      const without = order.filter((_, k) => k !== i)
      let bestCandidate: number[] | null = null
      let bestCost = Infinity
      for (let e = 0; e < without.length; e++) {
        const cand = [...without.slice(0, e + 1), vIdx, ...without.slice(e + 1)]
        const cVal = evaluateOrderValidity(cand, verts, originLat, originLng)
        if (cVal.isValid) {
          const perim = computePerimeter2D(cand, verts)
          if (perim < bestCost) {
            bestCost = perim
            bestCandidate = cand
          }
        }
      }
      if (bestCandidate) {
        return bestCandidate
      }
    }
  }

  return order
}

/**
 * Builds perimeter order by sorting vertices around a reference center (centroid or bbox midpoint).
 */
function buildPolarOrderAroundCenter(
  verts: ProjectedVertex[],
  cx: number,
  cy: number,
  originLat: number,
  originLng: number
): number[] {
  const indices = verts.map((_, i) => i)
  indices.sort((ia, ib) => {
    const a = verts[ia]!
    const b = verts[ib]!
    const angA = Math.atan2(a.y - cy, a.x - cx)
    const angB = Math.atan2(b.y - cy, b.x - cx)
    if (Math.abs(angA - angB) > 1e-7) {
      return angB - angA // Clockwise descending angle
    }
    const dA = Math.hypot(a.x - cx, a.y - cy)
    const dB = Math.hypot(b.x - cx, b.y - cy)
    return dA - dB
  })
  return untangleOrder2Opt(indices, verts, originLat, originLng)
}

/**
 * Computes strict 2D Convex Hull vertex indices in Counter-Clockwise order using Monotone Chain.
 */
function computeStrictConvexHullCCW(verts: ProjectedVertex[]): number[] {
  const n = verts.length
  if (n <= 3) return verts.map((_, i) => i)

  const sorted = verts
    .map((_, i) => i)
    .sort((ia, ib) => {
      const a = verts[ia]!
      const b = verts[ib]!
      if (Math.abs(a.x - b.x) > 1e-9) return a.x - b.x
      return a.y - b.y
    })

  const cross = (oIdx: number, aIdx: number, bIdx: number) => {
    const o = verts[oIdx]!
    const a = verts[aIdx]!
    const b = verts[bIdx]!
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  }

  const lower: number[] = []
  for (const idx of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, idx) <= 1e-6) {
      lower.pop()
    }
    lower.push(idx)
  }

  const upper: number[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const idx = sorted[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, idx) <= 1e-6) {
      upper.pop()
    }
    upper.push(idx)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/**
 * Checks whether all strict Convex Hull vertices appear in strictly monotonic cyclic order
 * around `order` (either CW or CCW). Any out-of-order hull visit implies an interior crossing or wrap.
 */
function isConvexHullOrderMonotonic(order: number[], strictHullCCW: number[]): boolean {
  if (strictHullCCW.length <= 3) return true
  const hullPos = new Map<number, number>()
  strictHullCCW.forEach((vIdx, hIdx) => hullPos.set(vIdx, hIdx))

  const visitedHullPositions: number[] = []
  for (const vIdx of order) {
    const hp = hullPos.get(vIdx)
    if (hp !== undefined) visitedHullPositions.push(hp)
  }

  const m = visitedHullPositions.length
  if (m <= 3) return true

  // Check cyclic ascending (CCW) or cyclic descending (CW)
  let ascDrops = 0
  let descDrops = 0
  for (let i = 0; i < m; i++) {
    const cur = visitedHullPositions[i]!
    const nxt = visitedHullPositions[(i + 1) % m]!
    if (nxt < cur) ascDrops++
    if (nxt > cur) descDrops++
  }

  return ascDrops <= 1 || descDrops <= 1
}

/**
 * Builds perimeter order starting from the 2D Convex Hull, splicing collinear edge vertices first
 * and iteratively inserting remaining concave pocket vertices into their closest non-intersecting edge.
 */
function buildHullPocketInsertionOrder(
  verts: ProjectedVertex[],
  strictHullCCW: number[],
  originLat: number,
  originLng: number
): number[] {
  const n = verts.length
  if (strictHullCCW.length < 3) {
    return buildPolarOrderAroundCenter(verts, 0, 0, originLat, originLng)
  }

  const inCycle = new Set<number>(strictHullCCW)
  let cycle = [...strictHullCCW]

  // Step 1: Splice collinear / near-collinear boundary points (dist <= 0.04m) in exact t-order along hull edges
  const collinearAdded: Array<{ edgeStartVertex: number; t: number; vIdx: number }> = []
  for (let vIdx = 0; vIdx < n; vIdx++) {
    if (inCycle.has(vIdx)) continue
    const p = verts[vIdx]!
    let bestEdge = -1
    let bestDist = Infinity
    let bestT = 0
    for (let e = 0; e < cycle.length; e++) {
      const a = verts[cycle[e]!]!
      const b = verts[cycle[(e + 1) % cycle.length]!]!
      const { dist, t } = pointToSegmentDist2D(p, a, b)
      if (t > 0.001 && t < 0.999 && dist <= 0.04 && dist < bestDist) {
        bestDist = dist
        bestEdge = e
        bestT = t
      }
    }
    if (bestEdge !== -1) {
      collinearAdded.push({ edgeStartVertex: cycle[bestEdge]!, t: bestT, vIdx })
      inCycle.add(vIdx)
    }
  }

  if (collinearAdded.length > 0) {
    const expanded: number[] = []
    for (let e = 0; e < cycle.length; e++) {
      const startV = cycle[e]!
      expanded.push(startV)
      const onThisEdge = collinearAdded
        .filter(item => item.edgeStartVertex === startV)
        .sort((a, b) => a.t - b.t)
      for (const item of onThisEdge) {
        expanded.push(item.vIdx)
      }
    }
    cycle = expanded
  }

  // Step 2: Iteratively insert remaining concave interior vertices into closest valid boundary segment
  while (inCycle.size < n) {
    let bestV = -1
    let bestInsertAfter = -1
    let bestCost = Infinity

    for (let vIdx = 0; vIdx < n; vIdx++) {
      if (inCycle.has(vIdx)) continue
      const p = verts[vIdx]!

      for (let e = 0; e < cycle.length; e++) {
        const a = verts[cycle[e]!]!
        const b = verts[cycle[(e + 1) % cycle.length]!]!
        const segDist = pointToSegmentDist2D(p, a, b).dist
        const detour = dist2D(a, p) + dist2D(p, b) - dist2D(a, b)
        const cost = segDist + 0.35 * detour

        if (cost >= bestCost) continue

        const candidate = [...cycle.slice(0, e + 1), vIdx, ...cycle.slice(e + 1)]
        const val = evaluateOrderValidity(candidate, verts, originLat, originLng)
        if (val.isValid) {
          bestCost = cost
          bestV = vIdx
          bestInsertAfter = e
        }
      }
    }

    if (bestV !== -1 && bestInsertAfter !== -1) {
      cycle = [
        ...cycle.slice(0, bestInsertAfter + 1),
        bestV,
        ...cycle.slice(bestInsertAfter + 1)
      ]
      inCycle.add(bestV)
    } else {
      // Fallback: insert remaining vertex at minimum detour and untangle via 2-opt
      let fallbackV = -1
      for (let vIdx = 0; vIdx < n; vIdx++) {
        if (!inCycle.has(vIdx)) {
          fallbackV = vIdx
          break
        }
      }
      if (fallbackV === -1) break
      cycle.push(fallbackV)
      inCycle.add(fallbackV)
      cycle = untangleOrder2Opt(cycle, verts, originLat, originLng)
    }
  }

  return untangleOrder2Opt(cycle, verts, originLat, originLng)
}

/**
 * Rotates and orients a closed cycle so vertex 0 (Point 1) remains at index 0,
 * and traversal direction (CW vs CCW) matches Point 1 -> Point 2 as closely as possible.
 */
function alignCycleToFirstVertex(cycle: number[], verts: ProjectedVertex[]): number[] {
  const n = cycle.length
  if (n < 3) return [...cycle]

  const rotateToZero = (arr: number[]): number[] => {
    const idx0 = arr.indexOf(0)
    if (idx0 <= 0) return [...arr]
    return [...arr.slice(idx0), ...arr.slice(0, idx0)]
  }

  const fwd = rotateToZero(cycle)
  const rev = rotateToZero([...cycle].reverse())

  const pos1Fwd = fwd.indexOf(1)
  const pos1Rev = rev.indexOf(1)

  if (pos1Fwd !== -1 && pos1Rev !== -1 && pos1Fwd !== pos1Rev) {
    return pos1Fwd < pos1Rev ? fwd : rev
  }

  // Tie-breaker when Point 2 is exactly antipodal to Point 1 (e.g. index n/2 in even n):
  // Prefer Clockwise orientation on map (signedArea < 0 in East-North coordinates)
  const areaFwd = computeSignedArea2D(fwd, verts)
  return areaFwd <= 0 ? fwd : rev
}

function sameDirectedCycle(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Scores a valid non-self-intersecting candidate polygon (lower score is better).
 * Rewards short perimeter, convex-hull monotonicity, and non-spiky interior angles.
 */
function scoreValidCandidate(
  order: number[],
  verts: ProjectedVertex[],
  strictHullCCW: number[]
): number {
  const perim = computePerimeter2D(order, verts)
  const minAngle = computeMinCornerAngleDeg(order, verts)
  const hullMono = isConvexHullOrderMonotonic(order, strictHullCCW)

  let penalty = 0
  if (!hullMono) penalty += perim * 0.5
  if (minAngle < 45) {
    penalty += ((45 - minAngle) / 45) * perim * 0.35
  }
  return perim + penalty
}

/**
 * Determines the valid non-self-intersecting outer perimeter order for a set of roof points.
 * - Preserves exact user-placed coordinates (never moves any vertex).
 * - Preserves the current order if it already forms a clean, valid, non-intersecting perimeter
 *   without interior shortcuts or hull inversions (supporting complex concave L/T/U roofs).
 * - Automatically untangles and sorts vertices around the true perimeter whenever the current
 *   order crosses itself, folds back, or connects non-adjacent points across the roof.
 */
export function orderRoofPolygonVertices(points: GeoLatLng[]): OrderedRoofPolygonResult {
  const n = points.length
  if (n < 3) {
    const copy = points.map(p => ({ lat: p.lat, lng: p.lng }))
    return {
      points: copy,
      originalIndices: points.map((_, i) => i),
      wasReordered: false,
      validation: validateRoofPolygon(copy)
    }
  }

  const { originLat, originLng, verts } = projectVertices(points)
  const identityOrder = verts.map((_, i) => i)
  const initialValidation = evaluateOrderValidity(identityOrder, verts, originLat, originLng)

  // If duplicate points exist or n === 3, no permutation can resolve duplicate vertices
  if (initialValidation.hasDuplicatePoints || n === 3) {
    return {
      points: verts.map(v => v.point),
      originalIndices: identityOrder,
      wasReordered: false,
      validation: initialValidation
    }
  }

  const strictHullCCW = computeStrictConvexHullCCW(verts)

  // Generate candidate perimeter orders
  const meanCx = verts.reduce((s, v) => s + v.x, 0) / n
  const meanCy = verts.reduce((s, v) => s + v.y, 0) / n
  const minX = Math.min(...verts.map(v => v.x))
  const maxX = Math.max(...verts.map(v => v.x))
  const minY = Math.min(...verts.map(v => v.y))
  const maxY = Math.max(...verts.map(v => v.y))
  const bboxCx = (minX + maxX) / 2
  const bboxCy = (minY + maxY) / 2

  const rawCandidates: number[][] = [
    buildHullPocketInsertionOrder(verts, strictHullCCW, originLat, originLng),
    buildPolarOrderAroundCenter(verts, meanCx, meanCy, originLat, originLng),
    buildPolarOrderAroundCenter(verts, bboxCx, bboxCy, originLat, originLng),
    untangleOrder2Opt(identityOrder, verts, originLat, originLng)
  ]

  // For n <= 7 (e.g. 4-to-7 vertex roofs), if all heuristic candidates somehow still crossed
  // due to extreme concavity, search exact valid simple cycles (max 360 cycles for n=7, < 0.2ms)
  let validCandidates: Array<{ order: number[]; validation: PolygonValidationResult; score: number }> = []
  for (const cand of rawCandidates) {
    const aligned = alignCycleToFirstVertex(cand, verts)
    if (validCandidates.some(vc => sameDirectedCycle(vc.order, aligned))) continue
    const val = evaluateOrderValidity(aligned, verts, originLat, originLng)
    if (val.isValid) {
      validCandidates.push({
        order: aligned,
        validation: val,
        score: scoreValidCandidate(aligned, verts, strictHullCCW)
      })
    }
  }

  if (validCandidates.length === 0 && n <= 8) {
    const rest = identityOrder.slice(1)
    const permute = (arr: number[], start: number): boolean => {
      if (start === arr.length) {
        const trial = [0, ...arr]
        const val = evaluateOrderValidity(trial, verts, originLat, originLng)
        if (val.isValid) {
          const aligned = alignCycleToFirstVertex(trial, verts)
          validCandidates.push({
            order: aligned,
            validation: evaluateOrderValidity(aligned, verts, originLat, originLng),
            score: scoreValidCandidate(aligned, verts, strictHullCCW)
          })
          if (validCandidates.length >= 12) return true
        }
        return false
      }
      for (let i = start; i < arr.length; i++) {
        const tmp = arr[start]!
        arr[start] = arr[i]!
        arr[i] = tmp
        if (permute(arr, start + 1)) return true
        arr[i] = arr[start]!
        arr[start] = tmp
      }
      return false
    }
    permute(rest, 0)
  }

  if (validCandidates.length === 0) {
    // Truly degenerate configuration (e.g., all points strictly collinear): return validation error
    return {
      points: verts.map(v => v.point),
      originalIndices: identityOrder,
      wasReordered: false,
      validation: initialValidation.isValid
        ? {
            isValid: false,
            hasSelfIntersection: true,
            hasDuplicatePoints: false,
            hasZeroArea: true,
            message: SELF_INTERSECTION_ERROR_MESSAGE,
            crossings: []
          }
        : initialValidation
    }
  }

  validCandidates.sort((a, b) => a.score - b.score)
  const best = validCandidates[0]!

  // Check if the current order is ALREADY a clean, non-intersecting, hull-monotonic, spike-free perimeter
  if (initialValidation.isValid) {
    const currentHullMono = isConvexHullOrderMonotonic(identityOrder, strictHullCCW)
    const currentMinAngle = computeMinCornerAngleDeg(identityOrder, verts)
    const currentMinClearance = computeMinNonIncidentClearanceM(identityOrder, verts)
    const currentPerim = computePerimeter2D(identityOrder, verts)
    const bestPerim = computePerimeter2D(best.order, verts)

    const keepCurrent =
      currentHullMono &&
      currentMinAngle >= 28 &&
      currentMinClearance >= 0.12 &&
      (currentMinAngle >= 60
        ? bestPerim >= currentPerim * 0.82
        : bestPerim >= currentPerim * 0.90)

    if (keepCurrent) {
      return {
        points: verts.map(v => v.point),
        originalIndices: identityOrder,
        wasReordered: false,
        validation: initialValidation
      }
    }
  }

  const orderedPoints = best.order.map(idx => verts[idx]!.point)
  const finalValidation = evaluateOrderValidity(
    orderedPoints.map((_, i) => i),
    projectVertices(orderedPoints).verts,
    originLat,
    originLng
  )

  return {
    points: orderedPoints,
    originalIndices: best.order,
    wasReordered: !sameDirectedCycle(best.order, identityOrder),
    validation: finalValidation
  }
}

/**
 * Inserts a newly added point into the optimal non-intersecting perimeter edge of an existing roof polygon.
 * Used when clicking to add vertices in Manual Draw Mode or Edit Mode (+ ADD POINT).
 */
export function insertPointIntoRoofPerimeter(
  existingPoints: GeoLatLng[],
  newPoint: GeoLatLng
): {
  points: GeoLatLng[]
  insertedIndex: number
  validation: PolygonValidationResult
} {
  if (existingPoints.length < 3) {
    const next = [...existingPoints.map(p => ({ lat: p.lat, lng: p.lng })), { lat: newPoint.lat, lng: newPoint.lng }]
    return {
      points: next,
      insertedIndex: next.length - 1,
      validation: validateRoofPolygon(next)
    }
  }

  // First ensure existing points are in a valid perimeter order
  const baseOrdered = orderRoofPolygonVertices(existingPoints).points
  const combined = [...baseOrdered, { lat: newPoint.lat, lng: newPoint.lng }]
  const { originLat, originLng, verts } = projectVertices(combined)
  const newIdx = combined.length - 1
  const newVert = verts[newIdx]!
  const strictHullCCW = computeStrictConvexHullCCW(verts)

  // Evaluate inserting `newIdx` into every perimeter edge (e -> (e+1)%m) of baseOrdered
  const m = baseOrdered.length
  let bestCandidateOrder: number[] | null = null
  let bestInsertedPos = -1
  let bestCost = Infinity

  for (let e = 0; e < m; e++) {
    const a = verts[e]!
    const b = verts[(e + 1) % m]!
    const trialOrder = [
      ...Array.from({ length: e + 1 }, (_, k) => k),
      newIdx,
      ...Array.from({ length: m - e - 1 }, (_, k) => e + 1 + k)
    ]

    const val = evaluateOrderValidity(trialOrder, verts, originLat, originLng)
    if (!val.isValid) continue

    const hullMono = isConvexHullOrderMonotonic(trialOrder, strictHullCCW)
    const minAngle = computeMinCornerAngleDeg(trialOrder, verts)
    const minClearance = computeMinNonIncidentClearanceM(trialOrder, verts)
    if (!hullMono || minAngle < 18 || minClearance < 0.08) continue

    const segDist = pointToSegmentDist2D(newVert, a, b).dist
    const detour = dist2D(a, newVert) + dist2D(newVert, b) - dist2D(a, b)
    const cost = segDist * 0.65 + detour * 0.35

    if (cost < bestCost) {
      bestCost = cost
      bestCandidateOrder = trialOrder
      bestInsertedPos = e + 1
    }
  }

  if (bestCandidateOrder) {
    // Check that general perimeter solver doesn't find a substantially shorter non-shortcut perimeter
    // (e.g. when a 4th or 5th point expands the polygon into a new quadrant)
    const fullOrdered = orderRoofPolygonVertices(combined)
    if (fullOrdered.validation.isValid) {
      const candPerim = computePerimeter2D(bestCandidateOrder, verts)
      const fullPerim = computePerimeter2D(fullOrdered.originalIndices, verts)
      if (fullPerim < candPerim * 0.94) {
        const posInFull = fullOrdered.originalIndices.indexOf(newIdx)
        return {
          points: fullOrdered.points,
          insertedIndex: posInFull >= 0 ? posInFull : fullOrdered.points.length - 1,
          validation: fullOrdered.validation
        }
      }
    }

    const resultPts = bestCandidateOrder.map(idx => verts[idx]!.point)
    return {
      points: resultPts,
      insertedIndex: bestInsertedPos,
      validation: validateRoofPolygon(resultPts)
    }
  }

  // Fallback to full perimeter ordering across all points
  const ordered = orderRoofPolygonVertices(combined)
  const pos = ordered.originalIndices.indexOf(newIdx)
  return {
    points: ordered.points,
    insertedIndex: pos >= 0 ? pos : ordered.points.length - 1,
    validation: ordered.validation
  }
}

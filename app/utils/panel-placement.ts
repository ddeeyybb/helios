/**
 * HELIOS-LOAD Physical Solar Panel Placement Engine
 * 
 * Accurately fits physical PV modules inside the installer-drawn roof footprint:
 * - Computes polygon contraction / roof setback buffer (default 0.5m)
 * - Removes obstruction exclusion zones (trees, water tanks, chimneys, etc.)
 * - Validates that every individual panel physically fits within the usable boundary
 * - Prevents panel overlap and obstruction collisions
 * - Computes true physical capacity (kWp) from actually placed panels
 */

import type { PlacedSolarPanel, RoofObstacle, RooftopFeature } from '../../types/roof'
import { DEFAULT_MOUNTING_CLEARANCE_M } from './roof-surface'

export interface PanelPlacementConfig {
  panelWidthM: number // e.g. 1.134 m
  panelLengthM: number // e.g. 2.278 m
  panelWattageW: number // e.g. 550 W
  setbackM: number // e.g. 0.5 m
  panelSpacingM: number // e.g. 0.05 m
  orientation: 'portrait' | 'landscape'
  pitchDegrees: number
  azimuthDegrees: number
  eaveHeightM: number
}

/**
 * Standard Ray-Casting algorithm for point-in-polygon test (works for convex & concave polygons).
 */
export function pointInPolygon(
  point: { x: number; z: number },
  polygon: Array<{ x: number; z: number }>
): boolean {
  if (!polygon || polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue

    const xi = pi.x
    const zi = pi.z
    const xj = pj.x
    const zj = pj.z

    const intersect = ((zi > point.z) !== (zj > point.z)) &&
      (point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Calculates 2D polygon area in square meters using Shoelace formula.
 */
export function calculatePolygon2DArea(polygon: Array<{ x: number; z: number }>): number {
  if (!polygon || polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue

    area += pi.x * pj.z
    area -= pj.x * pi.z
  }
  return Number((Math.abs(area) / 2).toFixed(2))
}

/**
 * Insets a 2D polygon inward by a setback distance in meters.
 * Creates the usable solar zone inside the roof boundary.
 */
export function computeSetbackPolygon(
  polygon: Array<{ x: number; z: number }>,
  setbackM = 0.5
): Array<{ x: number; z: number }> {
  if (!polygon || polygon.length < 3) return []
  if (setbackM <= 0) return polygon.map(p => ({ ...p }))

  // Compute centroid
  let sumX = 0
  let sumZ = 0
  polygon.forEach(p => {
    sumX += p.x
    sumZ += p.z
  })
  const cx = sumX / polygon.length
  const cz = sumZ / polygon.length

  // Move each vertex inward toward the centroid by setback ratio
  return polygon.map(pt => {
    const dx = cx - pt.x
    const dz = cz - pt.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.01) return { ...pt }

    // Clamp shift so polygon doesn't invert
    const shift = Math.min(dist * 0.45, setbackM)
    return {
      x: Number((pt.x + (dx / dist) * shift).toFixed(3)),
      z: Number((pt.z + (dz / dist) * shift).toFixed(3))
    }
  })
}

/**
 * Checks if a panel candidate rectangle intersects any obstruction exclusion zone.
 */
function panelCollidesWithObstruction(
  panelCenter: { x: number; z: number },
  panelHalfW: number,
  panelHalfL: number,
  obstructions: RoofObstacle[]
): boolean {
  for (const obs of obstructions) {
    const ox = obs.position?.x ?? 0
    const oz = obs.position?.z ?? 0

    let exclusionRadius = 1.0
    if (obs.type === 'Tree') {
      exclusionRadius = (obs.canopyRadiusM || 3.0) + 0.3
    } else if (obs.type === 'Water Tank') {
      exclusionRadius = (obs.radiusM || 1.2) + 0.4
    } else if (obs.type === 'Chimney' || obs.type === 'Building') {
      exclusionRadius = Math.max(obs.widthM || 1, obs.lengthM || 1) / 2 + 0.5
    } else {
      exclusionRadius = 1.2
    }

    const dist = Math.hypot(panelCenter.x - ox, panelCenter.z - oz)
    const panelBoundingRadius = Math.hypot(panelHalfW, panelHalfL)

    if (dist < exclusionRadius + panelBoundingRadius) {
      return true
    }
  }
  return false
}

/**
 * Checks if a panel candidate rectangle intersects any physical rooftop feature.
 */
export function panelCollidesWithRoofFeature(
  panelCenter: { x: number; z: number },
  panelHalfW: number,
  panelHalfL: number,
  features: RooftopFeature[] = []
): boolean {
  for (const feat of features) {
    if (feat.enabled === false) continue
    const fx = feat.position?.x ?? 0
    const fz = feat.position?.z ?? 0
    const fw = (feat.widthM || 1.0) / 2
    const fl = (feat.lengthM || 1.0) / 2

    // Axis-aligned bounding box collision with safety clearance
    const dx = Math.abs(panelCenter.x - fx)
    const dz = Math.abs(panelCenter.z - fz)
    if (dx < panelHalfW + fw + 0.05 && dz < panelHalfL + fl + 0.05) {
      return true
    }
  }
  return false
}

/**
 * Checks if a panel candidate rectangle intersects any estimated shadow exclusion polygon.
 */
function panelCollidesWithShadow(
  corners: Array<{ x: number; z: number }>,
  shadowPolygons: Array<{ points: Array<{ x: number; z: number }> }>
): boolean {
  for (const shadow of shadowPolygons) {
    if (!shadow.points || shadow.points.length < 3) continue
    for (const c of corners) {
      if (pointInPolygon(c, shadow.points)) {
        return true
      }
    }
  }
  return false
}

/**
 * Validates whether an individual placed panel is valid or invalid.
 */
export function validateIndividualPanel(
  panel: PlacedSolarPanel,
  roofPolygon: Array<{ x: number; z: number }>,
  setbackM = 0.5,
  obstructions: RoofObstacle[] = [],
  shadowPolygons: Array<{ points: Array<{ x: number; z: number }> }> = [],
  allPanels: PlacedSolarPanel[] = [],
  excludeShadows = false,
  roofFeatures: RooftopFeature[] = []
): { isValid: boolean; reason?: string } {
  const halfW = (panel.widthM || 1.134) / 2
  const halfL = (panel.lengthM || 2.278) / 2
  const corners = [
    { x: panel.x - halfW, z: panel.z - halfL },
    { x: panel.x + halfW, z: panel.z - halfL },
    { x: panel.x + halfW, z: panel.z + halfL },
    { x: panel.x - halfW, z: panel.z + halfL },
    { x: panel.x, z: panel.z }
  ]

  // 1. Outside roof boundary
  const insideRoof = corners.every(c => pointInPolygon(c, roofPolygon))
  if (!insideRoof) {
    return { isValid: false, reason: 'Panel is outside usable roof boundary.' }
  }

  // 2. Inside setback zone
  const setbackPoly = computeSetbackPolygon(roofPolygon, setbackM)
  const insideSetback = corners.every(c => pointInPolygon(c, setbackPoly))
  if (!insideSetback) {
    return { isValid: false, reason: 'Panel violates roof setback buffer.' }
  }

  // 3. Rooftop feature collision (Requirement 20)
  if (panelCollidesWithRoofFeature({ x: panel.x, z: panel.z }, halfW, halfL, roofFeatures)) {
    return { isValid: false, reason: 'Rooftop feature collision: panel overlaps roof feature.' }
  }

  // 4. Obstruction collision
  if (panelCollidesWithObstruction({ x: panel.x, z: panel.z }, halfW, halfL, obstructions)) {
    return { isValid: false, reason: 'Panel collides with obstruction exclusion zone.' }
  }

  // 4. Shadow exclusion zone
  if (excludeShadows && shadowPolygons.length > 0 && panelCollidesWithShadow(corners, shadowPolygons)) {
    return { isValid: false, reason: 'Panel is inside estimated shadow exclusion zone.' }
  }

  // 5. Overlaps another panel
  for (const other of allPanels) {
    if (other.id === panel.id) continue
    const dx = Math.abs(panel.x - other.x)
    const dz = Math.abs(panel.z - other.z)
    const minSpacingX = (panel.widthM + other.widthM) / 2 - 0.05
    const minSpacingZ = (panel.lengthM + other.lengthM) / 2 - 0.05
    if (dx < minSpacingX && dz < minSpacingZ) {
      return { isValid: false, reason: 'Panel overlaps another solar panel.' }
    }
  }

  return { isValid: true }
}

/**
 * Snaps a panel's candidate position (x, z) to adjacent panel edges, rows, and columns.
 */
export function snapPanelPosition(
  candidateX: number,
  candidateZ: number,
  width: number,
  length: number,
  spacing = 0.05,
  otherPanels: PlacedSolarPanel[] = [],
  ignoreId?: string,
  snapThresholdM = 0.35
): { x: number; z: number; snapped: boolean; snapType?: 'edge-x' | 'edge-z' | 'row' | 'col' } {
  let snappedX = candidateX
  let snappedZ = candidateZ
  let snapped = false
  let snapType: 'edge-x' | 'edge-z' | 'row' | 'col' | undefined

  for (const other of otherPanels) {
    if (other.id === ignoreId) continue
    const oWidth = other.widthM || width
    const oLength = other.lengthM || length

    // 1. Check Row Snapping (Aligned Z, snapped along X edge)
    if (Math.abs(candidateZ - other.z) < snapThresholdM) {
      // Right edge
      const rightX = other.x + (oWidth + width) / 2 + spacing
      if (Math.abs(candidateX - rightX) < snapThresholdM) {
        snappedX = Number(rightX.toFixed(3))
        snappedZ = other.z
        snapped = true
        snapType = 'edge-x'
        break
      }
      // Left edge
      const leftX = other.x - (oWidth + width) / 2 - spacing
      if (Math.abs(candidateX - leftX) < snapThresholdM) {
        snappedX = Number(leftX.toFixed(3))
        snappedZ = other.z
        snapped = true
        snapType = 'edge-x'
        break
      }
      // Aligned center Z
      snappedZ = other.z
      snapped = true
      snapType = 'row'
    }

    // 2. Check Column Snapping (Aligned X, snapped along Z edge)
    if (Math.abs(candidateX - other.x) < snapThresholdM) {
      // Top edge
      const topZ = other.z + (oLength + length) / 2 + spacing
      if (Math.abs(candidateZ - topZ) < snapThresholdM) {
        snappedZ = Number(topZ.toFixed(3))
        snappedX = other.x
        snapped = true
        snapType = 'edge-z'
        break
      }
      // Bottom edge
      const bottomZ = other.z - (oLength + length) / 2 - spacing
      if (Math.abs(candidateZ - bottomZ) < snapThresholdM) {
        snappedZ = Number(bottomZ.toFixed(3))
        snappedX = other.x
        snapped = true
        snapType = 'edge-z'
        break
      }
      // Aligned center X
      snappedX = other.x
      snapped = true
      snapType = 'col'
    }
  }

  return { x: snappedX, z: snappedZ, snapped, snapType }
}

/**
 * Places physical solar panels systematically inside the usable roof boundary.
 */
export function placeSolarPanelsInsideRoof(
  roofPolygon: Array<{ x: number; z: number }>,
  obstructions: RoofObstacle[] = [],
  config: PanelPlacementConfig,
  shadowPolygons: Array<{ points: Array<{ x: number; z: number }> }> = [],
  excludeShadows = false,
  roofFeatures: RooftopFeature[] = []
): {
  placedPanels: PlacedSolarPanel[]
  setbackPolygon: Array<{ x: number; z: number }>
  totalFittedPanels: number
  systemCapacityKwp: number
} {
  if (!roofPolygon || roofPolygon.length < 3) {
    return {
      placedPanels: [],
      setbackPolygon: [],
      totalFittedPanels: 0,
      systemCapacityKwp: 0
    }
  }

  const setbackPoly = computeSetbackPolygon(roofPolygon, config.setbackM)
  if (setbackPoly.length < 3) {
    return {
      placedPanels: [],
      setbackPolygon: [],
      totalFittedPanels: 0,
      systemCapacityKwp: 0
    }
  }

  // Determine bounding box of setback polygon
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  setbackPoly.forEach(pt => {
    minX = Math.min(minX, pt.x)
    maxX = Math.max(maxX, pt.x)
    minZ = Math.min(minZ, pt.z)
    maxZ = Math.max(maxZ, pt.z)
  })

  const isPortrait = config.orientation !== 'landscape'
  const pWidth = isPortrait ? config.panelWidthM : config.panelLengthM
  const pLength = isPortrait ? config.panelLengthM : config.panelWidthM
  const stepX = pWidth + config.panelSpacingM
  const stepZ = pLength + config.panelSpacingM

  const halfW = pWidth / 2
  const halfL = pLength / 2

  const pitchRad = (config.pitchDegrees * Math.PI) / 180
  const azRad = (config.azimuthDegrees * Math.PI) / 180
  const sinAz = Math.sin(azRad)
  const cosAz = Math.cos(azRad)

  // Compute centroid of the polygon for slope height offset
  let sumX = 0
  let sumZ = 0
  roofPolygon.forEach(p => {
    sumX += p.x
    sumZ += p.z
  })
  const centroidX = sumX / roofPolygon.length
  const centroidZ = sumZ / roofPolygon.length

  const placedPanels: PlacedSolarPanel[] = []
  let panelIdCounter = 1

  // Sweep the bounding box in a structured grid
  for (let z = minZ + halfL; z <= maxZ - halfL; z += stepZ) {
    for (let x = minX + halfW; x <= maxX - halfW; x += stepX) {
      // Test all 4 corners of the candidate panel against the setback polygon
      const corners = [
        { x: x - halfW, z: z - halfL },
        { x: x + halfW, z: z - halfL },
        { x: x + halfW, z: z + halfL },
        { x: x - halfW, z: z + halfL },
        { x, z } // center point
      ]

      const allCornersInside = corners.every(c => pointInPolygon(c, setbackPoly))
      if (!allCornersInside) continue

      // Test against rooftop features (Requirement 20)
      if (panelCollidesWithRoofFeature({ x, z }, halfW, halfL, roofFeatures)) {
        continue
      }

      // Test against obstructions and exclusion zones
      if (panelCollidesWithObstruction({ x, z }, halfW, halfL, obstructions)) {
        continue
      }

      // Test against shadow exclusion zones if enabled
      if (excludeShadows && shadowPolygons.length > 0 && panelCollidesWithShadow(corners, shadowPolygons)) {
        continue
      }

      // Calculate 3D surface elevation for the panel
      const distAlongSlope = -((x - centroidX) * sinAz + (z - centroidZ) * cosAz)
      const y = Number((config.eaveHeightM + DEFAULT_MOUNTING_CLEARANCE_M + distAlongSlope * Math.sin(pitchRad)).toFixed(3))

      // Panel normal vector
      const nx = -Math.sin(pitchRad) * sinAz
      const ny = Math.cos(pitchRad)
      const nz = -Math.sin(pitchRad) * cosAz

      placedPanels.push({
        id: `pv-mod-${panelIdCounter++}`,
        x: Number(x.toFixed(3)),
        y,
        z: Number(z.toFixed(3)),
        widthM: pWidth,
        lengthM: pLength,
        rotationY: azRad,
        tiltPitchDeg: config.pitchDegrees,
        normal: [nx, ny, nz],
        wattageW: config.panelWattageW
      })
    }
  }

  const totalFittedPanels = placedPanels.length
  const systemCapacityKwp = Number(((totalFittedPanels * config.panelWattageW) / 1000).toFixed(2))

  return {
    placedPanels,
    setbackPolygon: setbackPoly,
    totalFittedPanels,
    systemCapacityKwp
  }
}

/**
 * HELIOS-LOAD Canonical 3D Roof Mesh & Geometry Engine
 * 
 * Generates exact 3D polygon meshes for Babylon.js directly from Google Maps
 * LatLng coordinates without forcing roofs into generic rectangles or bounding boxes.
 * 
 * Supports:
 * - Rectangles, Squares, Triangles, Trapezoids
 * - L-shapes, T-shapes, U-shapes
 * - Concave and irregular polygons
 * - Multi-segment roof geometries
 * - Ear-clipping triangulation (earcut)
 * - Structural types: Flat, Single Slope, Gable, Hip, Custom
 * - Realistic configurable roof thickness (e.g. 0.15m) with top, bottom, and side faces
 * - Metric area verification comparing Google Maps area vs Babylon 3D footprint area
 */

import earcut from 'earcut'
import type { RoofVertex, RoofFace, RoofPlaneGeometry, RoofSegment, RoofModel } from '~/types/roof'

export type RoofStructureType = 'Flat' | 'Single Slope' | 'Gable' | 'Hip' | 'Custom'

export interface RoofGenerationConfig {
  pitchDegrees: number
  azimuthDegrees: number
  eaveHeightM: number
  roofThicknessM: number // e.g. 0.15 m
  roofType: RoofStructureType | string
  ridgeAxisAngleDeg?: number
}

export interface GeneratedRoofGeometry {
  vertices: RoofVertex[]
  indices: number[]
  normals: number[]
  faces: RoofFace[]
  topSurfaceVertices: RoofVertex[]
  centroid: { x: number; y: number; z: number }
  footprintAreaM2: number
  boundingDimensions: { widthM: number; lengthM: number; heightM: number }
  areaDiscrepancy: {
    googleAreaM2: number
    babylonAreaM2: number
    differencePercent: number
    isDiscrepancyAcceptable: boolean
    warningMessage?: string
  }
}

/**
 * Projects Latitude and Longitude to Cartesian local meters (East/West = X, North/South = Z)
 * relative to the roof centroid origin.
 */
export function latLngToLocalMeters(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): { x: number; z: number } {
  const earthRadiusM = 6378137 // WGS84 major radius
  const latRad = lat * (Math.PI / 180)
  const centerLatRad = centerLat * (Math.PI / 180)

  const dLat = (lat - centerLat) * (Math.PI / 180)
  const dLng = (lng - centerLng) * (Math.PI / 180)

  const x = dLng * Math.cos(centerLatRad) * earthRadiusM
  const z = dLat * earthRadiusM

  return {
    x: Number(x.toFixed(3)),
    z: Number(z.toFixed(3))
  }
}

/**
 * Converts Cartesian local meters back to Latitude and Longitude
 * relative to the roof centroid origin.
 */
export function localMetersToLatLng(
  x: number,
  z: number,
  centerLat: number,
  centerLng: number
): { lat: number; lng: number } {
  const earthRadiusM = 6378137
  const centerLatRad = centerLat * (Math.PI / 180)
  const dLat = z / earthRadiusM
  const dLng = x / (earthRadiusM * Math.cos(centerLatRad))
  return {
    lat: Number((centerLat + dLat * (180 / Math.PI)).toFixed(7)),
    lng: Number((centerLng + dLng * (180 / Math.PI)).toFixed(7))
  }
}

/**
 * Calculates 2D polygon area in local meters using the Shoelace formula.
 */
export function computeLocalPolygonArea(points: Array<{ x: number; z: number }>): number {
  if (!points || points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const pi = points[i]
    const pj = points[j]
    if (pi && pj) {
      area += pi.x * pj.z
      area -= pj.x * pi.z
    }
  }
  return Number((Math.abs(area) / 2).toFixed(2))
}

/**
 * Distance from point (px, pz) to line segment (x1, z1)-(x2, z2) in 2D.
 */
function distToSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1)
  if (l2 === 0) return Math.hypot(px - x1, pz - z1)
  let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * (x2 - x1)), pz - (z1 + t * (z2 - z1)))
}

/**
 * Generates an exact 3D roof geometry mesh from drawn Google Maps coordinates.
 */
export function buildExactRoofGeometry(
  polygonCoords: Array<{ lat: number; lng: number }>,
  googleMapsAreaM2: number,
  config: RoofGenerationConfig
): GeneratedRoofGeometry {
  if (!polygonCoords || polygonCoords.length < 3) {
    throw new Error('At least 3 boundary vertices are required to generate a 3D roof.')
  }

  // 1. Calculate geographic centroid for local projection
  let sumLat = 0
  let sumLng = 0
  polygonCoords.forEach(pt => {
    sumLat += pt.lat
    sumLng += pt.lng
  })
  const centerLat = sumLat / polygonCoords.length
  const centerLng = sumLng / polygonCoords.length

  // 2. Convert boundary to local meters
  const local2D = polygonCoords.map(pt => latLngToLocalMeters(pt.lat, pt.lng, centerLat, centerLng))

  // 3. Compute centroid in local coordinates
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
  const widthM = Number((maxX - minX).toFixed(2))
  const lengthM = Number((maxZ - minZ).toFixed(2))

  // 4. Compute 2D polygon area and verify with Google Maps spherical area
  const babylonAreaM2 = computeLocalPolygonArea(local2D)
  const areaDiffPercent = googleMapsAreaM2 > 0
    ? Number((Math.abs(googleMapsAreaM2 - babylonAreaM2) / googleMapsAreaM2 * 100).toFixed(2))
    : 0

  const isDiscrepancyAcceptable = areaDiffPercent <= 5.0
  const warningMessage = !isDiscrepancyAcceptable
    ? `3D geometry area (${babylonAreaM2} m²) differs from Google Maps area (${googleMapsAreaM2} m²) by ${areaDiffPercent}%.`
    : undefined

  // 5. Compute elevation Y for each top vertex based on Roof Structure Type
  const pitchRad = (config.pitchDegrees * Math.PI) / 180
  const azRad = (config.azimuthDegrees * Math.PI) / 180
  const sinAz = Math.sin(azRad)
  const cosAz = Math.cos(azRad)
  const thickness = config.roofThicknessM || 0.15

  // Structural elevation calculator
  function computeTopElevation(x: number, z: number): number {
    switch (config.roofType) {
      case 'Flat':
        return config.eaveHeightM

      case 'Single Slope': {
        const distAlongSlope = -((x - cx) * sinAz + (z - cz) * cosAz)
        return Number((config.eaveHeightM + distAlongSlope * Math.sin(pitchRad)).toFixed(3))
      }

      case 'Gable': {
        // Ridge line runs through centroid perpendicular to azimuth or along major axis
        const ridgeAngle = azRad + Math.PI / 2
        const nx = -Math.sin(ridgeAngle)
        const nz = Math.cos(ridgeAngle)
        const distFromRidge = (x - cx) * nx + (z - cz) * nz
        const halfSpan = Math.max(widthM, lengthM) / 2
        const rise = Math.max(0, (halfSpan - Math.abs(distFromRidge))) * Math.sin(pitchRad)
        return Number((config.eaveHeightM + rise).toFixed(3))
      }

      case 'Hip': {
        // Slopes inward from every perimeter edge
        let minDist = Infinity
        for (let i = 0; i < local2D.length; i++) {
          const j = (i + 1) % local2D.length
          const pi = local2D[i]
          const pj = local2D[j]
          if (pi && pj) {
            const d = distToSegment(x, z, pi.x, pi.z, pj.x, pj.z)
            minDist = Math.min(minDist, d)
          }
        }
        const maxRise = (Math.min(widthM, lengthM) / 2) * Math.sin(pitchRad)
        const rise = Math.min(maxRise, minDist * Math.sin(pitchRad))
        return Number((config.eaveHeightM + rise).toFixed(3))
      }

      case 'Custom':
      default: {
        const distAlongSlope = -((x - cx) * sinAz + (z - cz) * cosAz)
        return Number((config.eaveHeightM + distAlongSlope * Math.sin(pitchRad)).toFixed(3))
      }
    }
  }

  // Generate top vertices
  const topVertices: RoofVertex[] = local2D.map(pt => ({
    x: pt.x,
    y: computeTopElevation(pt.x, pt.z),
    z: pt.z
  }))

  // Generate bottom vertices (with thickness)
  const bottomVertices: RoofVertex[] = topVertices.map(v => ({
    x: v.x,
    y: Number((v.y - thickness).toFixed(3)),
    z: v.z
  }))

  // 6. Triangulate Top Surface using earcut (handles concave, L-shape, T-shape, irregular)
  const flatCoords: number[] = []
  local2D.forEach(pt => {
    flatCoords.push(pt.x, pt.z)
  })
  const topTriangles = earcut(flatCoords)

  const allVertices: RoofVertex[] = [...topVertices, ...bottomVertices]
  const indices: number[] = []
  const N = topVertices.length

  // Top Surface Triangles
  for (let i = 0; i < topTriangles.length; i += 3) {
    const a = topTriangles[i]
    const b = topTriangles[i + 1]
    const c = topTriangles[i + 2]
    if (a !== undefined && b !== undefined && c !== undefined) {
      indices.push(a, b, c)
      indices.push(a, c, b)
    }
  }

  // Bottom Surface Triangles (offset indices by N)
  for (let i = 0; i < topTriangles.length; i += 3) {
    const a = topTriangles[i]
    const b = topTriangles[i + 1]
    const c = topTriangles[i + 2]
    if (a !== undefined && b !== undefined && c !== undefined) {
      indices.push(a + N, c + N, b + N)
      indices.push(a + N, b + N, c + N)
    }
  }

  // 7. Perimeter Side Skirts / Thickness Walls
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    const topI = i
    const topJ = j
    const botI = i + N
    const botJ = j + N

    // Two triangles per perimeter edge quad
    indices.push(topI, topJ, botJ)
    indices.push(topI, botJ, botI)

    // Double sided
    indices.push(topI, botJ, topJ)
    indices.push(topI, botI, botJ)
  }

  // 8. Compute vertex normals
  const normals: number[] = new Array(allVertices.length * 3).fill(0)
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i]
    const i2 = indices[i + 1]
    const i3 = indices[i + 2]
    if (i1 === undefined || i2 === undefined || i3 === undefined) continue

    const v1 = allVertices[i1]
    const v2 = allVertices[i2]
    const v3 = allVertices[i3]
    if (!v1 || !v2 || !v3) continue

    const ax = v2.x - v1.x
    const ay = v2.y - v1.y
    const az = v2.z - v1.z

    const bx = v3.x - v1.x
    const by = v3.y - v1.y
    const bz = v3.z - v1.z

    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx

    normals[i1 * 3] = (normals[i1 * 3] ?? 0) + nx
    normals[i1 * 3 + 1] = (normals[i1 * 3 + 1] ?? 0) + ny
    normals[i1 * 3 + 2] = (normals[i1 * 3 + 2] ?? 0) + nz

    normals[i2 * 3] = (normals[i2 * 3] ?? 0) + nx
    normals[i2 * 3 + 1] = (normals[i2 * 3 + 1] ?? 0) + ny
    normals[i2 * 3 + 2] = (normals[i2 * 3 + 2] ?? 0) + nz

    normals[i3 * 3] = (normals[i3 * 3] ?? 0) + nx
    normals[i3 * 3 + 1] = (normals[i3 * 3 + 1] ?? 0) + ny
    normals[i3 * 3 + 2] = (normals[i3 * 3 + 2] ?? 0) + nz
  }

  // Normalize normal vectors
  for (let i = 0; i < allVertices.length; i++) {
    const x = normals[i * 3] ?? 0
    const y = normals[i * 3 + 1] ?? 0
    const z = normals[i * 3 + 2] ?? 0
    const len = Math.hypot(x, y, z) || 1
    normals[i * 3] = Number((x / len).toFixed(3))
    normals[i * 3 + 1] = Number((y / len).toFixed(3))
    normals[i * 3 + 2] = Number((z / len).toFixed(3))
  }

  const faces: RoofFace[] = []
  for (let i = 0; i < indices.length; i += 6) {
    const idx0 = indices[i]
    const idx1 = indices[i + 1]
    const idx2 = indices[i + 2]
    if (idx0 !== undefined && idx1 !== undefined && idx2 !== undefined) {
      faces.push({
        indices: [idx0, idx1, idx2],
        segmentIndex: 0
      })
    }
  }

  let maxY = -Infinity
  let minY = Infinity
  allVertices.forEach(v => {
    maxY = Math.max(maxY, v.y)
    minY = Math.min(minY, v.y)
  })

  return {
    vertices: allVertices,
    indices,
    normals,
    faces,
    topSurfaceVertices: topVertices,
    centroid: { x: Number(cx.toFixed(3)), y: Number(((minY + maxY) / 2).toFixed(3)), z: Number(cz.toFixed(3)) },
    footprintAreaM2: babylonAreaM2,
    boundingDimensions: { widthM, lengthM, heightM: Number((maxY - minY).toFixed(2)) },
    areaDiscrepancy: {
      googleAreaM2: googleMapsAreaM2,
      babylonAreaM2,
      differencePercent: areaDiffPercent,
      isDiscrepancyAcceptable,
      warningMessage
    }
  }
}

import { Vector3, Quaternion, Ray, type Scene, type AbstractMesh } from '@babylonjs/core'
import type { RoofModel, RoofSegment, PlacedSolarPanel } from '~/types/roof'
import { pointInPolygon } from '~/utils/panel-placement'

export interface RoofSurfaceResult {
  x: number
  y: number
  z: number
  normal: Vector3
  pitchDeg: number
  azimuthDeg: number
  segmentIndex: number
  segmentId?: string
  isValid: boolean
}

/**
 * Standard mounting clearance gap between bottom of panel and roof surface (meters).
 * 0.04m (4 cm) provides realistic CAD physical mounting without floating.
 */
export const DEFAULT_MOUNTING_CLEARANCE_M = 0.04

/**
 * Calculates the exact 3D roof surface contact point and surface normal
 * at a given local (x, z) horizontal coordinate.
 *
 * Source of truth hierarchy:
 * 1. Babylon 3D Mesh Raycast (exact intersection against actual geometry)
 * 2. Triangulated Face Barycentric Interpolation (exact for irregular/pitched geometry)
 * 3. Analytical Pitch/Azimuth Slope Equation (fallback)
 */
export function getRoofSurfaceAtLocalPoint(
  x: number,
  z: number,
  roofModel?: RoofModel | null,
  scene?: Scene | null
): RoofSurfaceResult {
  // 1. Raycast against actual Babylon Roof Mesh if scene is active
  if (scene) {
    try {
      const rayOrigin = new Vector3(x, 60, z)
      const rayDir = new Vector3(0, -1, 0)
      const ray = new Ray(rayOrigin, rayDir, 120)

      const hit = scene.pickWithRay(
        ray,
        (mesh: AbstractMesh) => mesh.name.startsWith('RoofSegment') && mesh.isPickable
      )

      if (hit && hit.hit && hit.pickedPoint) {
        const seg = (hit.pickedMesh?.metadata as any)?.segment as RoofSegment | undefined
        const rawNormal = hit.getNormal(true) || new Vector3(0, 1, 0)
        // Ensure normal points upward
        const normal = rawNormal.y < 0 ? rawNormal.scale(-1) : rawNormal
        normal.normalize()

        const pitchDeg = seg?.pitchDegrees ?? 0
        const azimuthDeg = seg?.azimuthDegrees ?? 180

        return {
          x,
          y: Number(hit.pickedPoint.y.toFixed(4)),
          z,
          normal,
          pitchDeg,
          azimuthDeg,
          segmentIndex: seg?.segmentIndex ?? 0,
          segmentId: seg?.id || (seg ? `seg-${seg.segmentIndex ?? 0}` : undefined),
          isValid: true
        }
      }
    } catch {
      // Fall through to analytical calculation if scene pick fails
    }
  }

  // 2. Analytical calculation from RoofModel segments
  const segs = roofModel?.roofSegments || roofModel?.segments || []
  if (segs.length > 0) {
    for (const seg of segs) {
      if (!seg.vertices || seg.vertices.length < 3) continue

      const halfLen = Math.floor(seg.vertices.length / 2)
      const topVertices = seg.vertices.slice(0, halfLen)
      const topPoly = topVertices.map(v => ({ x: v.x, z: v.z }))

      // Check if (x, z) is inside this segment's 2D footprint
      if (pointInPolygon({ x, z }, topPoly)) {
        // A. If indices exist, interpolate across triangles using barycentric coordinates
        if (seg.indices && seg.indices.length >= 3) {
          for (let i = 0; i < seg.indices.length; i += 3) {
            const i1 = seg.indices[i]
            const i2 = seg.indices[i + 1]
            const i3 = seg.indices[i + 2]
            if (i1 === undefined || i2 === undefined || i3 === undefined) continue
            // Only consider top surface triangles (vertex index < halfLen)
            if (i1 >= halfLen || i2 >= halfLen || i3 >= halfLen) continue

            const v1 = topVertices[i1]
            const v2 = topVertices[i2]
            const v3 = topVertices[i3]
            if (!v1 || !v2 || !v3) continue

            // Barycentric coordinates in 2D (x, z)
            const det = (v2.z - v3.z) * (v1.x - v3.x) + (v3.x - v2.x) * (v1.z - v3.z)
            if (Math.abs(det) < 1e-6) continue

            const w1 = ((v2.z - v3.z) * (x - v3.x) + (v3.x - v2.x) * (z - v3.z)) / det
            const w2 = ((v3.z - v1.z) * (x - v3.x) + (v1.x - v3.x) * (z - v3.z)) / det
            const w3 = 1 - w1 - w2

            if (w1 >= -0.01 && w2 >= -0.01 && w3 >= -0.01) {
              const exactY = w1 * v1.y + w2 * v2.y + w3 * v3.y

              // Compute normal of triangle ABC
              const edge1 = new Vector3(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z)
              const edge2 = new Vector3(v3.x - v1.x, v3.y - v1.y, v3.z - v1.z)
              let normal = Vector3.Cross(edge1, edge2).normalize()
              if (normal.y < 0) normal = normal.scale(-1)

              return {
                x,
                y: Number(exactY.toFixed(4)),
                z,
                normal,
                pitchDeg: seg.pitchDegrees ?? 0,
                azimuthDeg: seg.azimuthDegrees ?? 180,
                segmentIndex: seg.segmentIndex ?? 0,
                segmentId: seg.id || `seg-${seg.segmentIndex ?? 0}`,
                isValid: true
              }
            }
          }
        }

        // B. Plane slope formula based on pitch & azimuth
        const pitchRad = ((seg.pitchDegrees || 0) * Math.PI) / 180
        const azRad = ((seg.azimuthDegrees || 180) * Math.PI) / 180
        const sinAz = Math.sin(azRad)
        const cosAz = Math.cos(azRad)

        const cx = seg.center?.x ?? 0
        const cz = seg.center?.z ?? 0
        const baseElevation = seg.center?.y ?? (roofModel?.origin?.elevation ?? 3.5)

        const distAlongSlope = -((x - cx) * sinAz + (z - cz) * cosAz)
        const y = Number((baseElevation + distAlongSlope * Math.sin(pitchRad)).toFixed(4))

        const normal = new Vector3(
          -Math.sin(pitchRad) * sinAz,
          Math.cos(pitchRad),
          -Math.sin(pitchRad) * cosAz
        ).normalize()

        return {
          x,
          y,
          z,
          normal,
          pitchDeg: seg.pitchDegrees || 0,
          azimuthDeg: seg.azimuthDegrees || 180,
          segmentIndex: seg.segmentIndex || 0,
          segmentId: seg.id || `seg-${seg.segmentIndex ?? 0}`,
          isValid: true
        }
      }
    }
  }

  // 3. Fallback: Base roof elevation
  const fallbackY = roofModel?.origin?.elevation ?? 3.5
  return {
    x,
    y: fallbackY,
    z,
    normal: new Vector3(0, 1, 0),
    pitchDeg: 0,
    azimuthDeg: 180,
    segmentIndex: 0,
    isValid: false
  }
}

/**
 * Computes the 3D rotation Quaternion that orients a panel flat onto a roof surface
 * with the given normal, while respecting the panel's in-plane rotation angle (azimuth/orientation).
 */
export function computePanelRotationQuaternion(
  normal: Vector3,
  inPlaneRotationY: number
): Quaternion {
  const up = normal.clone().normalize()
  if (up.y < 0) up.scaleInPlace(-1)

  // Reference in-plane forward vector
  const forwardH = new Vector3(Math.sin(inPlaneRotationY), 0, Math.cos(inPlaneRotationY))

  // Project forwardH onto the roof plane: forward = forwardH - (forwardH . up) * up
  let forward = forwardH.subtract(up.scale(Vector3.Dot(forwardH, up)))
  if (forward.lengthSquared() < 0.001) {
    // If degenerate (normal parallel to forwardH), use perpendicular reference
    const alt = Math.abs(up.y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0)
    forward = alt.subtract(up.scale(Vector3.Dot(alt, up)))
  }
  forward.normalize()

  // Right vector = up x forward
  const right = Vector3.Cross(up, forward).normalize()

  // Construct orthonormal basis quaternion
  return Quaternion.RotationQuaternionFromAxis(right, up, forward)
}

/**
 * Ensures a solar panel's Y elevation and normal vector match the actual roof surface.
 */
export function snapPanelToRoofSurface(
  panel: PlacedSolarPanel,
  roofModel?: RoofModel | null,
  scene?: Scene | null,
  clearanceM = DEFAULT_MOUNTING_CLEARANCE_M
): RoofSurfaceResult {
  const surface = getRoofSurfaceAtLocalPoint(panel.x, panel.z, roofModel, scene)
  panel.y = Number((surface.y + clearanceM).toFixed(4))
  panel.normal = [surface.normal.x, surface.normal.y, surface.normal.z]
  panel.tiltPitchDeg = surface.pitchDeg
  return surface
}

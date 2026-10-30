/**
 * HELIOS-LOAD Roof Plane Fitting Engine
 * 
 * Performs least-squares regression on 3D DSM point clouds to compute
 * mathematically robust roof plane equations, surface normal vectors,
 * calculated pitch degrees, and calculated azimuth orientations.
 */

import type { RoofVertex, RoofPlaneEquation } from '../../../types/roof'

export interface FittedPlaneResult {
  equation: RoofPlaneEquation // ax + by + cz + d = 0 where b is normalized
  normal: [number, number, number] // Unit surface normal vector [nx, ny, nz] pointing upwards
  calculatedPitchDegrees: number // Slope from horizontal plane (0 to 90 degrees)
  calculatedAzimuthDegrees: number // Orientation clockwise from North (0 to 360 degrees)
  averageElevationMeters: number
  residualErrorRms: number
  pointCount: number
}

export class PlaneFittingService {
  /**
   * Fits a 3D plane y = c0*x + c1*z + c2 using least squares regression
   * on a cloud of points {x, y, z}.
   */
  static fitPlaneToPoints(points: RoofVertex[]): FittedPlaneResult | null {
    if (!points || points.length < 3) return null

    let sumX = 0
    let sumZ = 0
    let sumY = 0
    let sumXX = 0
    let sumZZ = 0
    let sumXZ = 0
    let sumXY = 0
    let sumZY = 0

    const N = points.length

    for (const p of points) {
      sumX += p.x
      sumZ += p.z
      sumY += p.y
      sumXX += p.x * p.x
      sumZZ += p.z * p.z
      sumXZ += p.x * p.z
      sumXY += p.x * p.y
      sumZY += p.z * p.y
    }

    // Solve 3x3 linear system for plane y = c0*x + c1*z + c2:
    // [ sumXX  sumXZ  sumX ] [ c0 ] = [ sumXY ]
    // [ sumXZ  sumZZ  sumZ ] [ c1 ] = [ sumZY ]
    // [ sumX   sumZ     N  ] [ c2 ] = [ sumY  ]
    const A = [
      [sumXX, sumXZ, sumX],
      [sumXZ, sumZZ, sumZ],
      [sumX, sumZ, N]
    ]
    const B = [sumXY, sumZY, sumY]

    const coeffs = this.solve3x3(A, B)
    if (!coeffs) return null

    const [slopeX, slopeZ, interceptY] = coeffs

    // Surface normal vector from y = slopeX*x + slopeZ*z + interceptY:
    // slopeX*x - y + slopeZ*z + interceptY = 0
    // Vector (-slopeX, 1, -slopeZ) points upward (+y)
    let nx = -slopeX
    let ny = 1.0
    let nz = -slopeZ

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len === 0) return null

    nx /= len
    ny /= len
    nz /= len

    // Pitch: angle between normal and vertical up vector (0, 1, 0)
    // cos(pitch) = ny
    const clampedNy = Math.max(-1, Math.min(1, ny))
    const pitchRad = Math.acos(clampedNy)
    const calculatedPitch = Number(((pitchRad * 180) / Math.PI).toFixed(1))

    // Azimuth: horizontal direction of the downhill slope or facing direction
    // For a plane sloping down towards direction (dx, dz), the horizontal gradient is (slopeX, slopeZ).
    // The surface faces in direction of steepest descent: (nx, nz)
    let calculatedAzimuth = (Math.atan2(nx, nz) * 180) / Math.PI
    if (calculatedAzimuth < 0) calculatedAzimuth += 360
    calculatedAzimuth = Number(calculatedAzimuth.toFixed(1))

    // RMS residual error
    let sumSqErr = 0
    for (const p of points) {
      const expectedY = slopeX * p.x + slopeZ * p.z + interceptY
      sumSqErr += (p.y - expectedY) * (p.y - expectedY)
    }
    const rms = Number(Math.sqrt(sumSqErr / N).toFixed(3))

    return {
      equation: {
        a: Number(slopeX.toFixed(4)),
        b: -1,
        c: Number(slopeZ.toFixed(4)),
        d: Number(interceptY.toFixed(4))
      },
      normal: [Number(nx.toFixed(4)), Number(ny.toFixed(4)), Number(nz.toFixed(4))],
      calculatedPitchDegrees: calculatedPitch,
      calculatedAzimuthDegrees: calculatedAzimuth,
      averageElevationMeters: Number((sumY / N).toFixed(2)),
      residualErrorRms: rms,
      pointCount: N
    }
  }

  /**
   * Analytical plane equation and normal generator from pitch and azimuth angles
   */
  static normalFromPitchAndAzimuth(pitchDeg: number, azimuthDeg: number): [number, number, number] {
    const pitchRad = (pitchDeg * Math.PI) / 180
    const azRad = (azimuthDeg * Math.PI) / 180

    // Flat roof
    if (pitchDeg <= 0.1) return [0, 1, 0]

    // Surface normal tilted by pitchDeg facing azimuthDeg
    // Azimuth is 0° = North (+z), 90° = East (+x), 180° = South (-z), 270° = West (-x)
    const sinPitch = Math.sin(pitchRad)
    const cosPitch = Math.cos(pitchRad)
    const sinAz = Math.sin(azRad)
    const cosAz = Math.cos(azRad)

    const nx = sinPitch * sinAz
    const ny = cosPitch
    const nz = sinPitch * cosAz

    return [Number(nx.toFixed(4)), Number(ny.toFixed(4)), Number(nz.toFixed(4))]
  }

  /**
   * Solves a 3x3 system of linear equations using Cramer's rule
   */
  private static solve3x3(A: number[][], B: number[]): [number, number, number] | null {
    const det = this.det3x3(A)
    if (Math.abs(det) < 1e-9) return null

    const Ax = [
      [B[0]!, A[0]![1]!, A[0]![2]!],
      [B[1]!, A[1]![1]!, A[1]![2]!],
      [B[2]!, A[2]![1]!, A[2]![2]!]
    ]
    const Ay = [
      [A[0]![0]!, B[0]!, A[0]![2]!],
      [A[1]![0]!, B[1]!, A[1]![2]!],
      [A[2]![0]!, B[2]!, A[2]![2]!]
    ]
    const Az = [
      [A[0]![0]!, A[0]![1]!, B[0]!],
      [A[1]![0]!, A[1]![1]!, B[1]!],
      [A[2]![0]!, A[2]![1]!, B[2]!]
    ]

    return [this.det3x3(Ax) / det, this.det3x3(Ay) / det, this.det3x3(Az) / det]
  }

  private static det3x3(m: number[][]): number {
    return (
      m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
      m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
      m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
    )
  }
}

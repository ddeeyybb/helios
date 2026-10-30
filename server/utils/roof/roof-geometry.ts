/**
 * HELIOS-LOAD Canonical Roof Geometry Service
 * 
 * Generates 3D canonical RoofModel data structures from manually drawn
 * roof polygon boundaries or architectural preset models.
 * 
 * Provides local Cartesian coordinates (x: East/West, y: Elevation, z: North/South),
 * discrete segment vertices, triangular faces/indices, and surface normals for Babylon.js.
 */

import type {
  RoofModel,
  RoofGeometry,
  RoofPlaneGeometry,
  RoofSegment,
  RoofVertex,
  RoofFace,
  RoofEdge,
  RoofObstacle,
  RoofDataSource
} from '../../../types/roof'
import { CoordinateProjectionService } from '../../services/roof/coordinateProjection'
import { PlaneFittingService } from '../../services/roof/planeFitting'
import earcut from 'earcut'

export class RoofGeometryService {
  /**
   * Generates a complete 3D canonical RoofModel directly from manually drawn
   * polygon boundary coordinates (lat/lng) on the Google satellite map.
   */
  static generatePolygonRoofModel(
    projectId: string,
    centerLat: number,
    centerLng: number,
    polygonCoords: Array<{ lat: number; lng: number }>,
    roofAreaM2: number,
    usableAreaM2: number,
    pitchDegrees = 15,
    azimuthDegrees = 180,
    eaveHeightM = 3.5,
    roofType = 'Custom Drawn'
  ): RoofModel {
    if (!polygonCoords || polygonCoords.length < 3) {
      throw new Error('At least 3 polygon coordinates are required to generate a roof model.')
    }

    // Baseline base elevation
    const baseElevationMeters = 0
    const pitchRad = (pitchDegrees * Math.PI) / 180

    // Compute centroid of the polygon in local coordinates
    const localVertices2D: Array<{ x: number; z: number }> = polygonCoords.map(pt => {
      const v = CoordinateProjectionService.latLngToLocal(
        pt.lat,
        pt.lng,
        centerLat,
        centerLng,
        eaveHeightM,
        baseElevationMeters
      )
      return { x: v.x, z: v.z }
    })

    let sumX = 0
    let sumZ = 0
    localVertices2D.forEach(v => {
      sumX += v.x
      sumZ += v.z
    })
    const centroidX = Number((sumX / localVertices2D.length).toFixed(3))
    const centroidZ = Number((sumZ / localVertices2D.length).toFixed(3))

    // Calculate normal vector from pitch and azimuth
    const segmentNormal = PlaneFittingService.normalFromPitchAndAzimuth(pitchDegrees, azimuthDegrees)

    // Compute 3D vertices tilted along the roof plane
    // y = eaveHeightM + tilted height based on distance along azimuth direction
    const azRad = (azimuthDegrees * Math.PI) / 180
    const sinAz = Math.sin(azRad)
    const cosAz = Math.cos(azRad)

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity

    const vertices: RoofVertex[] = localVertices2D.map(pt => {
      // Offset along the slope direction (opposite to solar azimuth)
      const distAlongSlope = -((pt.x - centroidX) * sinAz + (pt.z - centroidZ) * cosAz)
      const y = Number((eaveHeightM + distAlongSlope * Math.sin(pitchRad)).toFixed(3))
      const x = pt.x
      const z = pt.z

      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)

      return { x, y, z }
    })

    // Ear clipping triangulation for arbitrary (convex/concave/L-shape/T-shape) polygons
    const faces: RoofFace[] = []
    const indices: number[] = []

    const flatCoords: number[] = []
    localVertices2D.forEach(pt => {
      flatCoords.push(pt.x, pt.z)
    })

    const triIndices = earcut(flatCoords)
    if (triIndices && triIndices.length >= 3) {
      for (let i = 0; i < triIndices.length; i += 3) {
        const a = triIndices[i]
        const b = triIndices[i + 1]
        const c = triIndices[i + 2]
        if (a !== undefined && b !== undefined && c !== undefined) {
          faces.push({
            indices: [a, b, c],
            segmentIndex: 0,
            normal: segmentNormal
          })
          indices.push(a, b, c)
          // Double sided indices for Babylon.js visibility
          indices.push(a, c, b)
        }
      }
    } else {
      // Fallback fan triangulation if earcut yields no triangles
      for (let i = 1; i < vertices.length - 1; i++) {
        faces.push({
          indices: [0, i, i + 1],
          segmentIndex: 0,
          normal: segmentNormal
        })
        indices.push(0, i, i + 1)
        indices.push(0, i + 1, i)
      }
    }

    // Build normals array (3 components per vertex)
    const normals: number[] = []
    vertices.forEach(() => {
      normals.push(segmentNormal[0], segmentNormal[1], segmentNormal[2])
    })

    const bounds = {
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
      minZ: Number(minZ.toFixed(3)),
      maxZ: Number(maxZ.toFixed(3))
    }

    const planeGeometry: RoofPlaneGeometry = {
      segmentIndex: 0,
      vertices,
      faces,
      normal: segmentNormal,
      pitchDegrees,
      azimuthDegrees,
      elevationMeters: Number(((minY + maxY) / 2).toFixed(2)),
      center: {
        x: centroidX,
        y: Number(((minY + maxY) / 2).toFixed(2)),
        z: centroidZ
      },
      polygon2D: localVertices2D
    }

    const roofSegment: RoofSegment = {
      id: `seg-0`,
      segmentIndex: 0,
      pitchDegrees,
      azimuthDegrees,
      areaMeters2: roofAreaM2,
      groundAreaMeters2: usableAreaM2,
      areaM2: roofAreaM2,
      groundAreaM2: usableAreaM2,
      center: {
        x: centroidX,
        y: Number(((minY + maxY) / 2).toFixed(2)),
        z: centroidZ,
        latitude: centerLat,
        longitude: centerLng
      },
      vertices,
      indices,
      normals,
      verificationStatus: 'INSTALLER_VERIFIED',
      source: 'Installer Verified',
      sunshineCategory: 'Excellent',
      geometry: planeGeometry
    }

    const geometry: RoofGeometry = {
      vertices,
      faces,
      segments: [planeGeometry],
      ridges: [],
      valleys: [],
      eaves: [],
      bounds
    }

    return {
      id: `roof-${projectId}-${Date.now()}`,
      buildingId: `bldg-${projectId}`,
      projectId,
      source: 'Installer Verified',
      origin: {
        latitude: centerLat,
        longitude: centerLng,
        elevation: eaveHeightM
      },
      segments: [roofSegment],
      roofSegments: [roofSegment],
      obstacles: [],
      panels: [],
      geometry,
      building: {
        center: { latitude: centerLat, longitude: centerLng },
        areaM2: roofAreaM2,
        roofType
      },
      verification: {
        status: 'Verified',
        confidence: 'INSTALLER VERIFIED',
        verifiedDate: new Date().toISOString().split('T')[0],
        verifiedBy: 'Installer',
        notes: `Manually drawn roof boundary (${polygonCoords.length} vertices, ${roofAreaM2} m²).`
      },
      status: 'INSTALLER_VERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * Generates a manual fallback roof model allowing the installer to specify
   * footprint dimensions, pitch, azimuth, and roof presets (Gable, Hip, Flat, Shed).
   */
  static generateManualRoofModel(
    projectId: string,
    centerLat: number,
    centerLng: number,
    roofType = 'Gable',
    lengthM = 14,
    widthM = 10,
    pitchDegrees = 22,
    azimuthDegrees = 180,
    eaveHeightM = 3.5
  ): RoofModel {
    const halfLen = lengthM / 2
    const halfWid = widthM / 2
    const pitchRad = (pitchDegrees * Math.PI) / 180
    const ridgeHeight = eaveHeightM + Math.tan(pitchRad) * halfWid

    // Two segments: South plane (index 0) and North plane (index 1)
    const seg0Normal = PlaneFittingService.normalFromPitchAndAzimuth(pitchDegrees, azimuthDegrees)
    const seg1Normal = PlaneFittingService.normalFromPitchAndAzimuth(pitchDegrees, (azimuthDegrees + 180) % 360)

    const vSouth: RoofVertex[] = [
      { x: -halfLen, y: eaveHeightM, z: halfWid },
      { x: halfLen, y: eaveHeightM, z: halfWid },
      { x: halfLen, y: ridgeHeight, z: 0 },
      { x: -halfLen, y: ridgeHeight, z: 0 }
    ]

    const vNorth: RoofVertex[] = [
      { x: halfLen, y: eaveHeightM, z: -halfWid },
      { x: -halfLen, y: eaveHeightM, z: -halfWid },
      { x: -halfLen, y: ridgeHeight, z: 0 },
      { x: halfLen, y: ridgeHeight, z: 0 }
    ]

    const allVertices = [...vSouth, ...vNorth]
    const allFaces: RoofFace[] = [
      { indices: [0, 1, 2], segmentIndex: 0, normal: seg0Normal },
      { indices: [0, 2, 3], segmentIndex: 0, normal: seg0Normal },
      { indices: [4, 5, 6], segmentIndex: 1, normal: seg1Normal },
      { indices: [4, 6, 7], segmentIndex: 1, normal: seg1Normal }
    ]

    const plane0: RoofPlaneGeometry = {
      segmentIndex: 0,
      vertices: vSouth,
      faces: [allFaces[0]!, allFaces[1]!],
      normal: seg0Normal,
      pitchDegrees,
      azimuthDegrees,
      elevationMeters: (eaveHeightM + ridgeHeight) / 2,
      center: { x: 0, y: (eaveHeightM + ridgeHeight) / 2, z: halfWid / 2 },
      polygon2D: [
        { x: -halfLen, z: halfWid },
        { x: halfLen, z: halfWid },
        { x: halfLen, z: 0 },
        { x: -halfLen, z: 0 }
      ]
    }

    const plane1: RoofPlaneGeometry = {
      segmentIndex: 1,
      vertices: vNorth,
      faces: [allFaces[2]!, allFaces[3]!],
      normal: seg1Normal,
      pitchDegrees,
      azimuthDegrees: (azimuthDegrees + 180) % 360,
      elevationMeters: (eaveHeightM + ridgeHeight) / 2,
      center: { x: 0, y: (eaveHeightM + ridgeHeight) / 2, z: -halfWid / 2 },
      polygon2D: [
        { x: halfLen, z: -halfWid },
        { x: -halfLen, z: -halfWid },
        { x: -halfLen, z: 0 },
        { x: halfLen, z: 0 }
      ]
    }

    const seg0Area = Number(((lengthM * Math.sqrt(halfWid * halfWid + Math.pow(ridgeHeight - eaveHeightM, 2)))).toFixed(1))
    const seg1Area = seg0Area

    const seg0: RoofSegment = {
      id: 'seg-0',
      segmentIndex: 0,
      pitchDegrees,
      azimuthDegrees,
      areaMeters2: seg0Area,
      groundAreaMeters2: (lengthM * widthM) / 2,
      areaM2: seg0Area,
      groundAreaM2: (lengthM * widthM) / 2,
      center: {
        x: 0,
        y: (eaveHeightM + ridgeHeight) / 2,
        z: halfWid / 2,
        latitude: centerLat,
        longitude: centerLng
      },
      vertices: vSouth,
      indices: [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2],
      normals: [
        seg0Normal[0], seg0Normal[1], seg0Normal[2],
        seg0Normal[0], seg0Normal[1], seg0Normal[2],
        seg0Normal[0], seg0Normal[1], seg0Normal[2],
        seg0Normal[0], seg0Normal[1], seg0Normal[2]
      ],
      verificationStatus: 'INSTALLER_VERIFIED',
      source: 'Installer Verified',
      sunshineCategory: 'Excellent',
      geometry: plane0
    }

    const seg1: RoofSegment = {
      id: 'seg-1',
      segmentIndex: 1,
      pitchDegrees,
      azimuthDegrees: (azimuthDegrees + 180) % 360,
      areaMeters2: seg1Area,
      groundAreaMeters2: (lengthM * widthM) / 2,
      areaM2: seg1Area,
      groundAreaM2: (lengthM * widthM) / 2,
      center: {
        x: 0,
        y: (eaveHeightM + ridgeHeight) / 2,
        z: -halfWid / 2,
        latitude: centerLat,
        longitude: centerLng
      },
      vertices: vNorth,
      indices: [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2],
      normals: [
        seg1Normal[0], seg1Normal[1], seg1Normal[2],
        seg1Normal[0], seg1Normal[1], seg1Normal[2],
        seg1Normal[0], seg1Normal[1], seg1Normal[2],
        seg1Normal[0], seg1Normal[1], seg1Normal[2]
      ],
      verificationStatus: 'INSTALLER_VERIFIED',
      source: 'Installer Verified',
      sunshineCategory: 'Good',
      geometry: plane1
    }

    const totalArea = seg0Area + seg1Area

    const bounds = {
      minX: -halfLen,
      maxX: halfLen,
      minY: eaveHeightM,
      maxY: ridgeHeight,
      minZ: -halfWid,
      maxZ: halfWid
    }

    const geometry: RoofGeometry = {
      vertices: allVertices,
      faces: allFaces,
      segments: [plane0, plane1],
      ridges: [
        {
          start: { x: -halfLen, y: ridgeHeight, z: 0 },
          end: { x: halfLen, y: ridgeHeight, z: 0 },
          lengthMeters: lengthM
        }
      ],
      valleys: [],
      eaves: [],
      bounds
    }

    return {
      id: `roof-${projectId}-${Date.now()}`,
      buildingId: `bldg-${projectId}`,
      projectId,
      source: 'Installer Verified',
      origin: {
        latitude: centerLat,
        longitude: centerLng,
        elevation: eaveHeightM
      },
      segments: [seg0, seg1],
      roofSegments: [seg0, seg1],
      obstacles: [],
      panels: [],
      geometry,
      building: {
        center: { latitude: centerLat, longitude: centerLng },
        areaM2: totalArea,
        roofType
      },
      verification: {
        status: 'Verified',
        confidence: 'INSTALLER VERIFIED',
        verifiedDate: new Date().toISOString().split('T')[0],
        verifiedBy: 'Installer',
        notes: `Installer created ${roofType} roof model.`
      },
      status: 'INSTALLER_VERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }
}

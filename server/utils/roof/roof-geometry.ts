/**
 * HELIOS-LOAD Canonical Roof Geometry Service
 *
 * Generates canonical v2 multi-plane 3D RoofModel structures strictly from
 * installer-verified roof polygon boundaries (lat/lng) drawn on the satellite map.
 * Never uses hardcoded rectangular dimensions or unverified presets.
 */

import type { RoofModel } from '../../../types/roof'
import {
  buildExactRoofGeometry,
  applyGeneratedGeometryToRoofModel,
  computeSphericalPolygonAreaM2
} from '../../../app/utils/roof-mesh-generator'

export class RoofGeometryService {
  /**
   * Generates a complete canonical v2 3D RoofModel directly from manually drawn
   * and verified polygon boundary coordinates (lat/lng) on the Google satellite map.
   */
  static generatePolygonRoofModel(
    projectId: string,
    _centerLat: number,
    _centerLng: number,
    polygonCoords: Array<{ lat: number; lng: number }>,
    roofAreaM2: number,
    _usableAreaM2: number,
    pitchDegrees = 15,
    azimuthDegrees = 180,
    eaveHeightM = 3.5,
    roofType = 'Hip / Pyramid',
    roofThicknessM = 0.15
  ): RoofModel {
    if (!polygonCoords || polygonCoords.length < 3) {
      throw new Error('At least 3 verified polygon coordinates are required to generate a roof model.')
    }

    const effectiveMapArea =
      roofAreaM2 && roofAreaM2 > 0 ? roofAreaM2 : computeSphericalPolygonAreaM2(polygonCoords)

    const geom = buildExactRoofGeometry(polygonCoords, effectiveMapArea, {
      pitchDegrees,
      azimuthDegrees,
      eaveHeightM,
      roofThicknessM,
      roofType
    })

    const baseModel: RoofModel = {
      id: `roof-${projectId}-${Date.now()}`,
      buildingId: `bldg-${projectId}`,
      projectId,
      source: 'Installer Verified',
      origin: {
        latitude: geom.origin.latitude,
        longitude: geom.origin.longitude,
        elevation: eaveHeightM
      },
      segments: [],
      roofSegments: [],
      obstacles: [],
      roofFeatures: [],
      panels: [],
      geometry: {
        vertices: [],
        faces: [],
        segments: [],
        ridges: [],
        valleys: [],
        eaves: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }
      },
      verification: {
        status: 'Verified',
        confidence: 'INSTALLER VERIFIED',
        verifiedDate: new Date().toISOString().split('T')[0],
        verifiedBy: 'Installer',
        notes: `Verified roof boundary (${polygonCoords.length} vertices, ${geom.areaDiscrepancy.googleAreaM2.toFixed(1)} m²).`
      },
      status: 'INSTALLER_VERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    return applyGeneratedGeometryToRoofModel(baseModel, geom, {
      pitchDegrees,
      azimuthDegrees,
      eaveHeightM,
      roofThicknessM
    })
  }
}

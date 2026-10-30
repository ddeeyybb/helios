import { defineEventHandler, readBody } from 'h3'
import type { RoofModel } from '../../../types/roof'
import { RoofGeometryService } from '../../utils/roof/roof-geometry'

// Server memory store for project roof models
const roofModelStore = new Map<string, RoofModel>()

export function getStoredRoofModel(projectId: string): RoofModel | undefined {
  return roofModelStore.get(projectId) || roofModelStore.get('current-project')
}

export function setStoredRoofModel(projectId: string, model: RoofModel): void {
  roofModelStore.set(projectId, model)
  roofModelStore.set('current-project', model)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body) {
    return {
      success: false,
      message: 'No payload provided.'
    }
  }

  const {
    projectId,
    action, // 'polygon' | 'manual' | 'save_verified'
    polygonConfig,
    verifiedModel,
    manualConfig,
    obstacles
  } = body

  const pid = projectId || body.model?.projectId || body.verifiedModel?.projectId || 'current-project'
  const targetVerified = verifiedModel || body.model

  // Action 1: Save verified roof model directly
  if (action === 'save_verified' && targetVerified) {
    const updatedModel: RoofModel = {
      ...targetVerified,
      obstacles: targetVerified.obstacles || [],
      panels: targetVerified.panels || [],
      source: 'Installer Verified',
      verification: {
        status: 'Verified',
        confidence: 'INSTALLER VERIFIED',
        verifiedDate: new Date().toISOString().split('T')[0],
        verifiedBy: targetVerified.verification?.verifiedBy || 'Lead PV System Designer',
        notes: targetVerified.verification?.notes || body.verificationNotes || ''
      },
      status: 'INSTALLER_VERIFIED',
      updatedAt: new Date().toISOString()
    }

    setStoredRoofModel(pid, updatedModel)

    return {
      success: true,
      message: 'Verified RoofModel saved successfully.',
      data: updatedModel
    }
  }

  // Action 2: Generate 3D RoofModel from manually drawn polygon coordinates
  if (action === 'polygon' && polygonConfig) {
    const {
      centerLat = 6.7497,
      centerLng = 125.3572,
      coordinates = [],
      roofAreaM2 = 100,
      usableAreaM2 = 80,
      pitchDegrees = 15,
      azimuthDegrees = 180,
      eaveHeightM = 3.5,
      roofType = 'Custom Drawn'
    } = polygonConfig

    if (!coordinates || coordinates.length < 3) {
      return {
        success: false,
        message: 'At least 3 boundary coordinates are required to calculate roof geometry.',
        data: null
      }
    }

    try {
      const model = RoofGeometryService.generatePolygonRoofModel(
        pid,
        centerLat,
        centerLng,
        coordinates,
        roofAreaM2,
        usableAreaM2,
        pitchDegrees,
        azimuthDegrees,
        eaveHeightM,
        roofType
      )

      if (obstacles && obstacles.length > 0) {
        model.obstacles = obstacles
      }

      setStoredRoofModel(pid, model)

      return {
        success: true,
        message: '3D RoofModel generated from manual roof boundary.',
        data: model
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to generate roof geometry from polygon.',
        data: null
      }
    }
  }

  // Action 3: Generate manual roof model from geometric presets
  if (action === 'manual' || manualConfig) {
    const {
      centerLat = 6.7497,
      centerLng = 125.3572,
      roofType = 'Gable',
      lengthM = 14,
      widthM = 10,
      pitchDegrees = 22,
      azimuthDegrees = 180,
      eaveHeightM = 3.5
    } = manualConfig || {}

    const model = RoofGeometryService.generateManualRoofModel(
      pid,
      centerLat,
      centerLng,
      roofType,
      lengthM,
      widthM,
      pitchDegrees,
      azimuthDegrees,
      eaveHeightM
    )

    if (obstacles && obstacles.length > 0) {
      model.obstacles = obstacles
    }

    setStoredRoofModel(pid, model)

    return {
      success: true,
      message: 'Manual 3D RoofModel generated successfully.',
      data: model
    }
  }

  return {
    success: false,
    message: 'Unknown action specified.'
  }
})

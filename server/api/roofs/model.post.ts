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
    action, // 'polygon' | 'save_verified'
    polygonConfig,
    verifiedModel,
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

  // Action 2: Generate 3D RoofModel strictly from verified polygon coordinates
  if (action === 'polygon' && polygonConfig) {
    const {
      centerLat = 0,
      centerLng = 0,
      coordinates = [],
      roofAreaM2 = 0,
      usableAreaM2 = 0,
      pitchDegrees = 15,
      azimuthDegrees = 180,
      eaveHeightM = 3.5,
      roofThicknessM = 0.15,
      roofType = 'Hip / Pyramid'
    } = polygonConfig

    if (!coordinates || coordinates.length < 3) {
      return {
        success: false,
        message: 'No verified roof yet. Draw and confirm the roof first.',
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
        roofType,
        roofThicknessM
      )

      if (obstacles && obstacles.length > 0) {
        model.obstacles = obstacles
      }

      setStoredRoofModel(pid, model)

      return {
        success: true,
        message: '3D RoofModel generated from verified roof boundary.',
        data: model
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to generate roof geometry from verified polygon.',
        data: null
      }
    }
  }

  return {
    success: false,
    message: 'No verified roof yet. Draw and confirm the roof first.'
  }
})

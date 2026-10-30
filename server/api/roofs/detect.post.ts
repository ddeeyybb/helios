import { defineEventHandler, readBody } from 'h3'
import { RoofDetectionService } from '../../services/roof/detectionService'
import type { RoofDetectionResult } from '../../../types/roof'

export default defineEventHandler(async (event): Promise<RoofDetectionResult> => {
  const body = await readBody(event)

  if (!body) {
    return {
      success: false,
      source: 'ai-assisted',
      message: 'No coordinate payload provided for roof detection.'
    }
  }

  const { latitude, longitude, placeId } = body
  const lat = Number(latitude)
  const lng = Number(longitude)

  if (isNaN(lat) || isNaN(lng)) {
    return {
      success: false,
      source: 'ai-assisted',
      message: 'Valid latitude and longitude numbers are required.'
    }
  }

  return await RoofDetectionService.detect(lat, lng, placeId)
})

import { defineEventHandler, getQuery } from 'h3'
import { GOOGLE_API_KEY } from '../config/google-api'
import type { PlacesSearchResponse } from '../../../../types/google/places'

/**
 * Google Places Autocomplete API Endpoint
 * Provides place suggestions for Digos City and Davao del Sur region
 */
export default defineEventHandler(async (event): Promise<PlacesSearchResponse> => {
  const query = getQuery(event)
  const input = query.input as string | undefined

  if (!input || input.trim().length === 0) {
    return {
      success: true,
      predictions: []
    }
  }

  if (!GOOGLE_API_KEY) {
    return {
      success: false,
      predictions: [],
      message: 'Google API key is not configured.'
    }
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
    url.searchParams.set('input', input.trim())
    url.searchParams.set('key', GOOGLE_API_KEY)
    url.searchParams.set('components', 'country:ph')
    // Location bias towards Digos City (6.7497, 125.3572, radius ~20km)
    url.searchParams.set('location', '6.7497,125.3572')
    url.searchParams.set('radius', '20000')

    const response = await fetch(url.toString())
    if (!response.ok) {
      return {
        success: false,
        predictions: [],
        message: `Google Places error: HTTP ${response.status}`
      }
    }

    const data = await response.json()
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return {
        success: false,
        predictions: [],
        message: data.error_message || `Places API status: ${data.status}`
      }
    }

    const predictions = (data.predictions || []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || '',
      types: p.types
    }))

    return {
      success: true,
      predictions
    }
  } catch (err: any) {
    return {
      success: false,
      predictions: [],
      message: err?.message || 'Places search request failed.'
    }
  }
})

import { defineEventHandler, getQuery } from 'h3'
import { GOOGLE_API_KEY } from '../config/google-api'
import type { GeocodingResult } from '../../../../types/google/geocoding'

/**
 * Google Geocoding API Server Endpoint
 * Provides reverse geocoding (lat, lng) and forward geocoding (address, place_id)
 */
export default defineEventHandler(async (event): Promise<GeocodingResult> => {
  const query = getQuery(event)
  const lat = query.lat as string | undefined
  const lng = query.lng as string | undefined
  const address = query.address as string | undefined
  const placeId = (query.place_id || query.placeId) as string | undefined

  if (!GOOGLE_API_KEY) {
    return {
      success: false,
      message: 'Google API key is not configured.'
    }
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('key', GOOGLE_API_KEY)

    if (lat && lng) {
      url.searchParams.set('latlng', `${lat},${lng}`)
    } else if (placeId) {
      url.searchParams.set('place_id', placeId)
    } else if (address) {
      url.searchParams.set('address', address)
    } else {
      return {
        success: false,
        message: 'Must provide lat/lng, address, or place_id.'
      }
    }

    const response = await fetch(url.toString())
    if (!response.ok) {
      return {
        success: false,
        message: `Google Geocoding error: HTTP ${response.status}`
      }
    }

    const data = await response.json()
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return {
        success: false,
        message: data.error_message || `Geocoding status: ${data.status}`
      }
    }

    const first = data.results[0]
    return {
      success: true,
      location: {
        lat: first.geometry.location.lat,
        lng: first.geometry.location.lng,
        formattedAddress: first.formatted_address,
        placeId: first.place_id,
        name: first.address_components?.[0]?.long_name,
        components: first.address_components?.map((c: any) => ({
          longName: c.long_name,
          shortName: c.short_name,
          types: c.types
        }))
      }
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Geocoding request failed.'
    }
  }
})

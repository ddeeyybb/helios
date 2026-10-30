/// <reference types="@types/google.maps" />

import { ref } from 'vue'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { PlacesSearchResponse, GeocodingResult } from '../../types/google'

declare global {
  interface Window {
    gm_authFailure?: () => void
  }
}

export type GoogleMapsStatus = 'idle' | 'loading' | 'ready' | 'missing_key' | 'error'

const mapStatus = ref<GoogleMapsStatus>('idle')
const errorMessage = ref<string>('')
let loadPromise: Promise<typeof google> | null = null
let cachedApiKey = ''
let isOptionsSet = false

export function useGoogleMaps() {
  async function fetchConfigApiKey(): Promise<string> {
    if (cachedApiKey) return cachedApiKey
    try {
      const res = await $fetch<{ apiKey?: string }>('/api/google/config/google-api')
      if (res && res.apiKey && res.apiKey !== 'PASTE_YOUR_GOOGLE_API_KEY_HERE') {
        cachedApiKey = res.apiKey
        return cachedApiKey
      }
    } catch {
      // Configuration fetch error
    }
    return ''
  }

  async function initGoogleMaps(): Promise<typeof google | null> {
    if (!import.meta.client || typeof window === 'undefined') return null

    if (mapStatus.value === 'ready' && window.google?.maps) {
      return window.google
    }

    const apiKey = await fetchConfigApiKey()

    if (!apiKey) {
      mapStatus.value = 'missing_key'
      errorMessage.value = 'Google API key is not configured in server/api/google/config/google-api.ts.'
      return null
    }

    // Set up global auth failure interceptor for invalid/unauthorized keys
    window.gm_authFailure = () => {
      mapStatus.value = 'error'
      errorMessage.value = 'Google Maps API authentication failed. Verify that your API key in server/api/google/config/google-api.ts is valid and has Maps JavaScript API enabled.'
    }

    if (loadPromise) {
      try {
        await loadPromise
        mapStatus.value = 'ready'
        errorMessage.value = ''
        return window.google
      } catch (err: any) {
        mapStatus.value = 'error'
        errorMessage.value = 'Google Maps could not be loaded.'
        return null
      }
    }

    mapStatus.value = 'loading'
    errorMessage.value = ''

    if (!isOptionsSet) {
      setOptions({
        key: apiKey,
        v: 'weekly'
      })
      isOptionsSet = true
    }

    loadPromise = (async () => {
      await Promise.all([
        importLibrary('maps'),
        importLibrary('places'),
        importLibrary('geometry'),
        importLibrary('marker')
      ])
      return window.google
    })()

    try {
      const googleObj = await loadPromise
      mapStatus.value = 'ready'
      errorMessage.value = ''
      return googleObj
    } catch (err: any) {
      mapStatus.value = 'error'
      errorMessage.value = err?.message || 'Google Maps could not be loaded.'
      loadPromise = null
      return null
    }
  }

  function retry() {
    loadPromise = null
    cachedApiKey = ''
    mapStatus.value = 'idle'
    errorMessage.value = ''
    return initGoogleMaps()
  }

  // Reverse geocoding via server geocoding endpoint
  async function reverseGeocode(lat: number, lng: number): Promise<{
    formattedAddress: string
    placeId?: string
    name?: string
  }> {
    try {
      const res = await $fetch<GeocodingResult>('/api/google/geocoding/address', {
        query: { lat, lng }
      })
      if (res.success && res.location) {
        return {
          formattedAddress: res.location.formattedAddress,
          placeId: res.location.placeId,
          name: res.location.name
        }
      }
    } catch {
      // Endpoint error fallback
    }

    // Client fallback if window.google.maps is already initialized
    if (import.meta.client && window.google?.maps) {
      return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder()
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
            const first = results[0]
            resolve({
              formattedAddress: first.formatted_address || 'Address information unavailable.',
              placeId: first.place_id,
              name: first.address_components?.[0]?.long_name
            })
          } else {
            resolve({ formattedAddress: 'Address information unavailable.' })
          }
        })
      })
    }

    return { formattedAddress: 'Address information unavailable.' }
  }

  // Forward geocoding via server endpoint
  async function geocodeAddress(address?: string, placeId?: string): Promise<{
    lat: number
    lng: number
    formattedAddress: string
    placeId?: string
    name?: string
  } | null> {
    try {
      const queryParams: Record<string, string> = {}
      if (placeId) queryParams.place_id = placeId
      else if (address) queryParams.address = address
      else return null

      const res = await $fetch<GeocodingResult>('/api/google/geocoding/address', {
        query: queryParams
      })
      if (res.success && res.location) {
        return {
          lat: res.location.lat,
          lng: res.location.lng,
          formattedAddress: res.location.formattedAddress,
          placeId: res.location.placeId,
          name: res.location.name
        }
      }
    } catch {
      // Endpoint error
    }
    return null
  }

  // Google Places search via server endpoint
  async function searchPlaces(input: string): Promise<PlacesSearchResponse> {
    try {
      return await $fetch<PlacesSearchResponse>('/api/google/places/search', {
        query: { input }
      })
    } catch (err: any) {
      return {
        success: false,
        predictions: [],
        message: err?.message || 'Error searching places.'
      }
    }
  }

  const hasApiKey = computed(() => mapStatus.value !== 'missing_key')

  return {
    mapStatus,
    hasApiKey,
    errorMessage,
    initGoogleMaps,
    retry,
    reverseGeocode,
    geocodeAddress,
    searchPlaces
  }
}

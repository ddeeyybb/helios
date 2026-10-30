<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { isInsideDigos } from '~/data/sampleProperties'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import { useGoogleMaps } from '~/composables/useGoogleMaps'

const {
  selectCoordinates,
  isPinModeActive,
  togglePinMode,
  centerMapOnDigos
} = useSiteAssessment()

const {
  mapStatus,
  geocodeAddress,
  reverseGeocode,
  searchPlaces,
  initGoogleMaps
} = useGoogleMaps()

const searchQuery = ref('')
const isSearching = ref(false)
const searchFeedback = ref('')
const isSearchDropdownOpen = ref(false)
const isOutsideModalOpen = ref(false)
const outsideAddressInfo = ref('')

interface GooglePlacePrediction {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
  types?: string[]
}

const placePredictions = ref<GooglePlacePrediction[]>([])
let autocompleteService: google.maps.places.AutocompleteService | null = null
let debounceTimer: any = null

async function initAutocompleteService() {
  if (!import.meta.client) return
  const g = await initGoogleMaps()
  if (g?.maps?.places?.AutocompleteService) {
    autocompleteService = new g.maps.places.AutocompleteService()
  }
}

watch(
  () => mapStatus.value,
  (status) => {
    if (status === 'ready') {
      initAutocompleteService()
    }
  }
)

onMounted(() => {
  initAutocompleteService()
})

async function fetchGooglePlacePredictions(input: string) {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length < 2) {
    placePredictions.value = []
    searchFeedback.value = ''
    return
  }

  isSearching.value = true
  searchFeedback.value = ''

  // 1. Try Client-side AutocompleteService
  if (autocompleteService && window.google?.maps) {
    try {
      autocompleteService.getPlacePredictions(
        {
          input: trimmed,
          locationBias: new google.maps.Circle({
            center: { lat: 6.7497, lng: 125.3572 },
            radius: 25000
          }),
          componentRestrictions: { country: 'ph' }
        },
        (predictions, status) => {
          isSearching.value = false
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length > 0) {
            placePredictions.value = predictions.map(p => ({
              placeId: p.place_id,
              description: p.description,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text || '',
              types: p.types
            }))
            isSearchDropdownOpen.value = true
            searchFeedback.value = ''
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            fallbackServerSearch(trimmed)
          } else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
            searchFeedback.value = 'Place search is unavailable. Please enable Google Places API.'
            placePredictions.value = []
          } else {
            fallbackServerSearch(trimmed)
          }
        }
      )
      return
    } catch {
      // client error fallback
    }
  }

  // 2. Server-side search fallback
  await fallbackServerSearch(trimmed)
}

async function fallbackServerSearch(trimmed: string) {
  const res = await searchPlaces(trimmed)
  isSearching.value = false
  if (res.success && res.predictions && res.predictions.length > 0) {
    placePredictions.value = res.predictions
    isSearchDropdownOpen.value = true
    searchFeedback.value = ''
  } else {
    placePredictions.value = []
    if (res.message && (res.message.includes('Places error') || res.message.includes('REQUEST_DENIED') || res.message.includes('API key'))) {
      searchFeedback.value = 'Place search is unavailable. Please enable Google Places API.'
    } else {
      searchFeedback.value = 'No matching place found.'
    }
  }
}

watch(searchQuery, (newVal) => {
  clearTimeout(debounceTimer)
  searchFeedback.value = ''
  if (!newVal.trim()) {
    placePredictions.value = []
    return
  }

  debounceTimer = setTimeout(() => {
    fetchGooglePlacePredictions(newVal)
  }, 280)
})

async function handleSelectGooglePrediction(pred: GooglePlacePrediction) {
  isSearching.value = true
  searchFeedback.value = ''

  let lat: number | null = null
  let lng: number | null = null
  let formattedAddress = pred.description
  let name = pred.mainText || pred.description
  let placeTypes: string[] = pred.types || []
  let viewport: any = null

  if (window.google?.maps) {
    // 1. Try PlacesService.getDetails
    if (window.google.maps.places?.PlacesService) {
      try {
        const dummyDiv = document.createElement('div')
        const placesService = new google.maps.places.PlacesService(dummyDiv)
        await new Promise<void>((resolve) => {
          placesService.getDetails(
            {
              placeId: pred.placeId,
              fields: ['name', 'formatted_address', 'geometry', 'types']
            },
            (place, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
                lat = place.geometry.location.lat()
                lng = place.geometry.location.lng()
                if (place.geometry.viewport) {
                  viewport = {
                    north: place.geometry.viewport.getNorthEast().lat(),
                    east: place.geometry.viewport.getNorthEast().lng(),
                    south: place.geometry.viewport.getSouthWest().lat(),
                    west: place.geometry.viewport.getSouthWest().lng()
                  }
                }
                if (place.name) name = place.name
                if (place.formatted_address) formattedAddress = place.formatted_address
                if (place.types) placeTypes = place.types
              }
              resolve()
            }
          )
        })
      } catch {
        // fallback
      }
    }

    // 2. Geocoder fallback
    if (lat === null || lng === null) {
      try {
        const geocoder = new google.maps.Geocoder()
        await new Promise<void>((resolve) => {
          geocoder.geocode({ placeId: pred.placeId }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results[0]?.geometry?.location) {
              const first = results[0]
              lat = first.geometry.location.lat()
              lng = first.geometry.location.lng()
              if (first.geometry.viewport) {
                viewport = {
                  north: first.geometry.viewport.getNorthEast().lat(),
                  east: first.geometry.viewport.getNorthEast().lng(),
                  south: first.geometry.viewport.getSouthWest().lat(),
                  west: first.geometry.viewport.getSouthWest().lng()
                }
              }
              if (first.formatted_address) formattedAddress = first.formatted_address
              if (first.types) placeTypes = first.types
            }
            resolve()
          })
        })
      } catch {
        // fallback
      }
    }
  }

  // 3. Server geocoding fallback
  if (lat === null || lng === null) {
    const geo = await geocodeAddress(pred.description, pred.placeId)
    if (geo) {
      lat = geo.lat
      lng = geo.lng
      formattedAddress = geo.formattedAddress
      if (geo.name) name = geo.name
    }
  }

  isSearching.value = false

  if (lat === null || lng === null) {
    searchFeedback.value = 'Failed to locate coordinates for this place.'
    return
  }

  // Validate that result is inside Digos City
  if (!isInsideDigos(lat, lng)) {
    outsideAddressInfo.value = formattedAddress
    isOutsideModalOpen.value = true
    isSearchDropdownOpen.value = false
    return
  }

  const isCity = placeTypes.includes('locality') ||
                 placeTypes.includes('administrative_area_level_2') ||
                 (name.toLowerCase().includes('digos') && (name.toLowerCase().includes('city') || pred.description.toLowerCase().includes('digos city')))

  const isBarangay = placeTypes.includes('sublocality') || placeTypes.includes('neighborhood')
  const suggestedZoom = isCity ? 14 : (isBarangay ? 16 : 19)

  selectCoordinates(
    lat,
    lng,
    name,
    formattedAddress,
    'Google Places',
    pred.placeId,
    suggestedZoom,
    placeTypes,
    viewport
  )

  searchQuery.value = name
  isSearchDropdownOpen.value = false
}

function returnToDigosCity() {
  isOutsideModalOpen.value = false
  searchQuery.value = ''
  centerMapOnDigos()
}

async function handleSearchSubmit() {
  const query = searchQuery.value.trim()
  if (!query) return

  // If predictions exist, select the top suggestion
  if (placePredictions.value.length > 0 && placePredictions.value[0]) {
    handleSelectGooglePrediction(placePredictions.value[0])
    return
  }

  isSearching.value = true
  searchFeedback.value = ''

  // 1. Check if query is latitude, longitude (e.g. "6.7497, 125.3572")
  const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+)[,\s]+([-+]?[0-9]*\.?[0-9]+)$/)
  if (coordMatch && coordMatch[1] && coordMatch[2]) {
    const lat = parseFloat(coordMatch[1])
    const lng = parseFloat(coordMatch[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      if (window.google?.maps) {
        const geo = await reverseGeocode(lat, lng)
        selectCoordinates(
          lat,
          lng,
          geo.name ? `Site: ${geo.name}` : `Survey Site (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`,
          geo.formattedAddress,
          'Google Geocoding API',
          geo.placeId,
          19
        )
      } else {
        selectCoordinates(lat, lng, `Manual Site (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`, query, 'Installer Input', undefined, 19)
      }
      isSearching.value = false
      isSearchDropdownOpen.value = false
      return
    }
  }

  // 2. Geocode with Google Geocoding API
  if (window.google?.maps) {
    const geo = await geocodeAddress(query)
    isSearching.value = false
    if (geo) {
      if (!isInsideDigos(geo.lat, geo.lng)) {
        outsideAddressInfo.value = geo.formattedAddress
        isOutsideModalOpen.value = true
        isSearchDropdownOpen.value = false
        return
      }

      const isCity = query.toLowerCase().includes('digos')
      const zoom = isCity ? 14 : 19

      selectCoordinates(
        geo.lat,
        geo.lng,
        geo.name ? `Site: ${geo.name}` : `Site: ${query.slice(0, 32)}`,
        geo.formattedAddress,
        'Google Geocoding API',
        geo.placeId,
        zoom
      )
      isSearchDropdownOpen.value = false
      return
    } else {
      searchFeedback.value = 'No matching place found.'
      return
    }
  }

  isSearching.value = false
  searchFeedback.value = 'No matching place found.'
}

function handleSearchFocus() {
  if (placePredictions.value.length > 0) {
    isSearchDropdownOpen.value = true
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Compact Top Action Area (Collapsed header maximizing vertical space for Google Maps) -->
    <div class="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
      <!-- Search Property Input -->
      <div class="relative flex-1">
        <div class="relative">
          <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search property, address, or landmark..."
            @focus="handleSearchFocus"
            @keydown.enter="handleSearchSubmit"
            class="w-full pl-10 pr-24 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
          />
          <button
            type="button"
            @click="handleSearchSubmit"
            :disabled="isSearching"
            class="absolute right-1.5 top-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span v-if="isSearching" class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <span>Locate</span>
          </button>
        </div>

        <!-- Real Google Places Autocomplete Dropdown directly below search bar -->
        <div
          v-if="isSearchDropdownOpen && placePredictions.length > 0"
          class="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 max-h-80 overflow-y-auto"
        >
          <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Google Places Suggestions</span>
            <span class="text-[9px] text-blue-600 font-semibold">Live GIS</span>
          </div>
          <button
            v-for="item in placePredictions"
            :key="item.placeId"
            type="button"
            @click="handleSelectGooglePrediction(item)"
            class="w-full text-left px-3 py-2 text-xs hover:bg-blue-50/60 flex items-start gap-2.5 transition-colors border-b border-slate-50 last:border-0 cursor-pointer"
          >
            <svg class="w-4 h-4 text-blue-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div class="min-w-0 flex-1">
              <span class="font-semibold text-slate-800 block truncate">{{ item.mainText }}</span>
              <span class="text-[11px] text-slate-500 truncate block">{{ item.secondaryText }}</span>
            </div>
          </button>
        </div>

        <!-- Inline Search Feedback (Requirement 14) -->
        <p v-if="searchFeedback" class="text-[11px] text-rose-600 mt-1 font-medium px-1">
          {{ searchFeedback }}
        </p>
      </div>

      <!-- CENTER ON DIGOS Button (Requirement 7) -->
      <button
        type="button"
        @click="centerMapOnDigos"
        class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
        title="Center map on Digos City (lat: 6.7497, lng: 125.3572, zoom 14)"
      >
        <svg class="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <polygon points="12 8 16 12 12 16 12 8" />
        </svg>
        <span>CENTER ON DIGOS</span>
      </button>

      <!-- Click Map to Select (Pin Mode) Button -->
      <button
        type="button"
        @click="togglePinMode"
        :class="[
          'px-4 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer',
          isPinModeActive
            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
        ]"
      >
        <svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span>{{ isPinModeActive ? 'Pin Mode Active (Click Map)' : 'Click Map to Select' }}</span>
      </button>
    </div>

    <!-- Location Outside Project Area Modal -->
    <div
      v-if="isOutsideModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
        <div class="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          ⚠️
        </div>
        <div class="space-y-1.5">
          <h3 class="text-base font-bold text-slate-900">LOCATION OUTSIDE PROJECT AREA</h3>
          <p class="text-xs text-slate-600 leading-relaxed">
            HELIOS-LOAD currently supports solar site assessment within Digos City.
          </p>
          <div v-if="outsideAddressInfo" class="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-xs font-mono text-rose-800 break-words mt-2">
            {{ outsideAddressInfo }}
          </div>
        </div>
        <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600">
          Supported Area: Digos City, Davao del Sur, Philippines
        </div>
        <button
          type="button"
          @click="returnToDigosCity"
          class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          RETURN TO DIGOS CITY
        </button>
      </div>
    </div>
  </div>
</template>

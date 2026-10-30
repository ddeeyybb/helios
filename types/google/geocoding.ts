export interface GeocodedLocation {
  lat: number
  lng: number
  formattedAddress: string
  placeId?: string
  name?: string
  components?: Array<{
    longName: string
    shortName: string
    types: string[]
  }>
}

export interface GeocodingResult {
  success: boolean
  location?: GeocodedLocation | null
  message?: string
}

export interface PlaceStructuredFormatting {
  mainText: string
  secondaryText: string
}

export interface PlacePredictionItem {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
  types?: string[]
}

export interface PlacesSearchResponse {
  success: boolean
  predictions: PlacePredictionItem[]
  message?: string
}

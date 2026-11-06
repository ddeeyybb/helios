export interface SelectedProperty {
  id: string
  buildingId?: string
  latitude: number
  longitude: number
  footprintGeometry?: {
    type: 'Polygon'
    coordinates: number[][][]
  } | null
  footprintAreaM2?: number | null
  city: 'Digos City' | string
  province: 'Davao del Sur' | string
  source: string
  status: string
  name?: string
  address?: string
}

export interface PropertyLocation {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  city?: 'Digos City' | string
  province?: 'Davao del Sur' | string
  status: 'Ready for Site Assessment' | 'Draft' | 'In Review' | 'Needs Roof Verification' | string
  notes?: string
  source?: 'Installer Map Click' | 'DEMO DATA' | 'Google Maps' | 'Google Geocoding API' | 'Installer Input' | string
  placeId?: string
  buildingId?: string
  suggestedZoom?: number
  types?: string[]
  viewport?: {
    north: number
    south: number
    east: number
    west: number
  }
  footprintGeometry?: {
    type: 'Polygon'
    coordinates: number[][][]
  } | null
  footprintAreaM2?: number | null
  roofType?: RoofTypeOption | 'Custom Drawn' | 'Not detected' | string
}

export type RoofTypeOption =
  | 'Hip / Pyramid'
  | 'Gable'
  | 'Single Slope / Shed'
  | 'L-Shape'
  | 'T-Shape'
  | 'U-Shape'
  | 'Irregular'
  | 'Flat'
  | 'Hip'
  | 'Single Slope'
  | 'Dutch Gable'
  | 'Hip & Valley'
  | 'Cross Gable'
  | 'Gambrel'
  | 'Pyramid'
  | 'Saltbox'
  | 'Clerestory'
  | 'Jerkinhead'
  | 'Butterfly'
  | 'Bonnet'
  | 'M'
  | 'Shed'
  | 'Flat'
  | 'Arched'
  | 'L-Shaped / Complex'
  | 'Irregular / Other'
  | 'Custom Drawn'
  | 'Unknown'
  | 'Gable Roof'
  | 'Hip Roof'
  | 'Dutch Gable Roof'
  | 'Hip & Valley Roof'
  | 'Cross Gable Roof'
  | 'Gambrel Roof'
  | 'Pyramid Roof'
  | 'Saltbox Roof'
  | 'Clerestory Roof'
  | 'Jerkinhead Roof'
  | 'Butterfly Roof'
  | 'Bonnet Roof'
  | 'M Roof'
  | 'Shed Roof'
  | 'Flat Roof'
  | 'Arched Roof'

export interface RoofAssessmentData {
  roofAssessmentStatus: 'Not analyzed' | 'In Progress' | 'Verified'
  roofType: RoofTypeOption | 'Not detected'
  roofArea: string
  roofPitch: string
  usableArea: string
  verificationNotes?: string
  buildingInsights?: Record<string, any> | null
  solarPotentialStatus?: 'Not requested' | 'Loading' | 'Available' | 'Unavailable'
  solarMessage?: string
}

export interface WorkflowStep {
  id: number
  name: string
  shortDesc: string
  status: 'completed' | 'active' | 'pending' | 'locked'
  route?: string
}

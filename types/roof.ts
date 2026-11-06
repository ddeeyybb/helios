/**
 * HELIOS-LOAD Canonical Roof Data Model
 * 
 * Defines the single source of truth for roof geometry, segments, obstacles,
 * and verification state across Site Assessment, 2D Editor, and 3D Babylon.js.
 */

export type RoofDataSource =
  | 'Google Estimate'
  | 'DSM Derived'
  | 'Installer Verified'
  | 'User Entered'
  | 'Calculated'
  | 'Unavailable'

export type CanonicalRoofStructureType =
  | 'Hip / Pyramid'
  | 'Gable'
  | 'Single Slope / Shed'
  | 'L-Shape'
  | 'T-Shape'
  | 'U-Shape'
  | 'Irregular'
  | 'Flat'

export interface RoofVertex {
  x: number // East/West distance in meters relative to building center
  y: number // Elevation in meters (local ground / base = 0)
  z: number // North/South distance in meters relative to building center
}

export interface RoofFace {
  indices: [number, number, number] // Triangle vertex indices
  segmentIndex: number
  normal?: [number, number, number]
}

export interface RoofPlaneEquation {
  a: number
  b: number
  c: number
  d: number // ax + by + cz + d = 0
}

export interface RoofPlaneGeometry {
  segmentIndex: number
  vertices: RoofVertex[]
  faces: RoofFace[]
  planeEquation?: RoofPlaneEquation
  normal: [number, number, number]
  pitchDegrees: number
  azimuthDegrees: number
  calculatedPitch?: number
  calculatedAzimuth?: number
  elevationMeters: number
  center: RoofVertex
  polygon2D: Array<{ x: number; z: number }> // Footprint coordinates in local meters
}

export interface RoofEdge {
  start: RoofVertex
  end: RoofVertex
  segmentIndex?: number
  lengthMeters: number
}

export interface RoofGeometry {
  vertices: RoofVertex[]
  faces: RoofFace[]
  segments: RoofPlaneGeometry[]
  ridges: RoofEdge[]
  valleys: RoofEdge[]
  eaves: RoofEdge[]
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
  }
}

export interface RoofSegment {
  id: string
  segmentIndex: number
  pitchDegrees: number
  azimuthDegrees: number
  areaMeters2: number
  groundAreaMeters2?: number
  sunshineQuantiles?: number[]
  center: RoofVertex & {
    latitude?: number
    longitude?: number
  }
  boundingBox?: {
    sw: { latitude: number; longitude: number }
    ne: { latitude: number; longitude: number }
  }
  planeHeightAtCenterMeters?: number
  vertices: RoofVertex[]
  indices: number[]
  normals: number[]
  sourceQuality?: string
  verificationStatus: string
  source: RoofDataSource | string

  // Convenience fields for UI presentation
  areaM2?: number
  groundAreaM2?: number
  planeHeightMeters?: number
  orientation?: string
  calculatedPitch?: number
  calculatedAzimuth?: number
  sunshineCategory?: 'Excellent' | 'Good' | 'Moderate' | 'Low'
  potentialPanels?: number
  yearlyEnergyDcKwh?: number
  geometry?: RoofPlaneGeometry

  // Canonical v2 verified footprint & multi-plane 3D metadata
  footprint2D?: Array<{ x: number; z: number }>
  boundaryLatLng?: Array<{ lat: number; lng: number }>
  perimeter3D?: RoofVertex[]
  ridgeLines?: Array<[RoofVertex, RoofVertex]>
  topSurfaceVertices?: RoofVertex[]
  topSurfaceIndices?: number[]
  roofType?: CanonicalRoofStructureType | string
  roofThicknessM?: number
  eaveHeightM?: number
  geometryVersion?: number
}

export type ObstacleType =
  | 'Chimney'
  | 'Skylight'
  | 'Water Tank'
  | 'HVAC'
  | 'Vent'
  | 'Satellite Dish'
  | 'Tree'
  | 'Building'
  | 'Antenna'
  | 'Utility Structure'
  | 'Other'

export type RooftopFeatureType =
  | 'Chimney'
  | 'Vent'
  | 'Water Tank'
  | 'Roof Equipment'
  | 'Skylight'
  | 'Roof Structure'
  | 'Other'

export interface RooftopFeature {
  id: string
  name?: string
  type: RooftopFeatureType
  latitude?: number
  longitude?: number
  position: RoofVertex // Local coordinates (x, y, z) on the roof surface
  widthM: number
  lengthM: number
  heightM: number
  rotationY?: number // In-plane rotation (radians)
  rotationDeg?: number // In-plane rotation (degrees)
  tiltPitchDeg?: number
  normal?: [number, number, number]
  roofSegmentId?: string
  segmentIndex?: number
  shadingRelevant?: boolean // Default true
  source?: 'INSTALLER_VERIFIED' | 'Installer Provided' | 'User Entered'
  notes?: string
  enabled?: boolean
  locked?: boolean
  visible?: boolean
}

export interface RoofObstacle {
  id: string
  name?: string
  type: ObstacleType
  location?: string
  latitude?: number
  longitude?: number
  canopyRadiusM?: number
  radiusM?: number
  trunkRadiusM?: number
  distanceFromRoofM?: number
  polygonFootprint?: Array<{ lat: number; lng: number }>
  position: RoofVertex // Local coordinates (x, y, z) in meters relative to building center
  widthM: number
  lengthM: number
  heightM: number
  rotationY?: number
  segmentIndex?: number
  notes?: string
  source?: 'GOOGLE_DETECTED' | 'INSTALLER_VERIFIED' | 'USER_ENTERED' | 'Installer Provided'
  enabled?: boolean
  locked?: boolean
  visible?: boolean
  canopyDiameterM?: number
  trunkDiameterM?: number
}

export interface PlacedSolarPanel {
  id: string
  x: number // Local X meters
  y: number // Local Y elevation meters
  z: number // Local Z meters
  widthM: number
  lengthM: number
  rotationY: number
  tiltPitchDeg: number
  normal: [number, number, number]
  wattageW: number
  thicknessM?: number
  azimuthDeg?: number
  manufacturer?: string
  modelName?: string
  efficiencyPercent?: number
  status?: 'VALID' | 'INVALID'
  validationReason?: string
  locked?: boolean
  visible?: boolean
  segmentId?: string
}

export interface ShadingAssessmentRecord {
  date: string
  time: string
  preset: 'Today' | 'Morning' | 'Noon' | 'Afternoon' | 'Custom'
  solarAltitudeDeg: number
  solarAzimuthDeg: number
  sunAboveHorizon: boolean
  directSunAreaM2: number
  shadedAreaM2: number
  shadingPercentage: number
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH'
  shadowLengthM: number
  shadowPolygons?: Array<{
    obstacleId: string
    obstacleType: string
    points: Array<{ x: number; y: number; z: number }>
  }>
}

export interface RoofVerification {
  status: 'Not Verified' | 'Verified' | 'Requires Review'
  confidence:
    | 'HIGH CONFIDENCE'
    | 'MEDIUM CONFIDENCE'
    | 'LOW CONFIDENCE'
    | 'MANUAL VERIFICATION REQUIRED'
    | 'INSTALLER VERIFIED'
  verifiedBy?: string
  verifiedDate?: string
  notes?: string
}

export type RoofModelStatus =
  | 'NOT_ANALYZED'
  | 'GOOGLE_DATA_FOUND'
  | 'DSM_FOUND'
  | 'ROOF_MODEL_GENERATED'
  | 'REQUIRES_VERIFICATION'
  | 'VERIFIED'
  | 'GOOGLE_ESTIMATE'
  | 'PARTIALLY_VERIFIED'
  | 'INSTALLER_VERIFIED'

export interface RoofModel {
  buildingId: string
  id: string
  projectId?: string
  source: RoofDataSource | string
  origin: {
    latitude: number
    longitude: number
    elevation?: number
  }
  segments: RoofSegment[]
  roofSegments: RoofSegment[] // Alias for backward compatibility
  obstacles: RoofObstacle[]
  roofFeatures?: RooftopFeature[]
  panels: any[]
  geometry: RoofGeometry
  building?: {
    center: {
      latitude: number
      longitude: number
    }
    boundingBox?: {
      sw: { latitude: number; longitude: number }
      ne: { latitude: number; longitude: number }
    }
    areaM2?: number
    roofType?: string
  }

  verification: RoofVerification
  status: RoofModelStatus
  createdAt: string
  updatedAt: string

  // Convenience & backward compatibility fields
  roofType?: string
  pitch?: number
  pitchDegrees?: number
  azimuth?: number
  azimuthDegrees?: number
  roofThicknessM?: number
  eaveHeightM?: number
  boundaryLatLng?: Array<{ lat: number; lng: number }>
  footprint2D?: Array<{ x: number; z: number }>
  mapAreaM2?: number
  footprintAreaM2?: number
  areaDiscrepancy?: {
    googleAreaM2: number
    babylonAreaM2: number
    differencePercent: number
    isDiscrepancyAcceptable: boolean
    warningMessage?: string
  }
  structureVerifiedByInstaller?: boolean
  geometryVersion?: number
  dimensions?: {
    lengthM?: number
    widthM?: number
    eaveHeightM?: number
    planesCount?: number
  }
}

// ==========================================
// MANUAL ROOF DRAWING & VERIFICATION
// ==========================================

export type DetectionSource = 'manual'

export interface VerifiedRoofPolygon {
  source: DetectionSource
  verified: boolean
  verifiedBy?: string
  verifiedAt?: string
  installerEditsCount: number
  points: Array<{ lat: number; lng: number }>
  areaM2: number
}

export type RoofAssessmentState =
  | 'IDLE'
  | 'EDITING'
  | 'CONFIRMED'

export type RoofDrawingMode =
  | 'none'
  | 'manual-draw'
  | 'edit-points'
  | 'add-point'



import type { RoofTypeOption } from './assessment'
import type { RoofModel, RoofSegment, RoofObstacle } from '../../types/roof'

export type { RoofModel, RoofSegment, RoofObstacle }

export type ClientType = 'Residential' | 'Commercial' | 'Industrial'

export interface Client {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  clientType: ClientType
  notes: string
  createdAt: string
  updatedAt: string
}

export type ProjectStatus =
  | 'Draft'
  | 'Site Assessment'
  | 'Roof Verification'
  | 'Solar Analysis'
  | 'Load Analysis'
  | 'System Design'
  | 'Feasibility Review'
  | 'Report Ready'
  | 'Completed'

export interface RooftopObstacle {
  id: string
  type:
    | 'Chimney'
    | 'Vent'
    | 'Water tank'
    | 'HVAC'
    | 'Skylight'
    | 'Antenna'
    | 'Tree obstruction'
    | 'Other'
  location: string
  widthM: number
  lengthM: number
  heightM?: number
  notes: string
}

export type AccuracyConfidence =
  | 'HIGH CONFIDENCE'
  | 'MEDIUM CONFIDENCE'
  | 'LOW CONFIDENCE'
  | 'MANUAL VERIFICATION REQUIRED'
  | 'INSTALLER VERIFIED'

export type RoofStyleType =
  | 'Gable'
  | 'Hip'
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

export interface RoofSegmentModel {
  id: string
  segmentIndex: number
  areaM2: number
  groundAreaM2: number
  pitchDegrees: number
  azimuthDegrees: number
  orientation: string
  center?: { latitude: number; longitude: number }
  boundingBox?: {
    sw: { latitude: number; longitude: number }
    ne: { latitude: number; longitude: number }
  }
  planeHeightAtCenterMeters?: number
  sunshineQuantiles?: number[]
  sunshineCategory: 'Excellent' | 'Good' | 'Moderate' | 'Low'
  potentialPanels: number
  yearlyEnergyDcKwh?: number
  source: 'GOOGLE_ESTIMATE' | 'INSTALLER_VERIFIED' | 'USER_ENTERED'
}

export interface RoofVerificationData {
  status: 'Not Verified' | 'Verified' | 'Requires Review'
  confidence: AccuracyConfidence
  verifiedBy: string
  verifiedDate: string
  roofType: RoofStyleType | RoofTypeOption | 'Custom Drawn' | 'Not detected'
  googleAreaM2: number | null
  verifiedAreaM2: number | null
  googlePitchDeg: number | null
  verifiedPitchDeg: number | null
  azimuthDeg: number | null
  verifiedAzimuthDeg?: number | null
  usableAreaM2: number | null
  buildingWidthM?: number | null
  buildingLengthM?: number | null
  ridgeHeightM?: number | null
  eaveHeightM?: number | null
  segments: RoofSegmentModel[]
  obstacles: RooftopObstacle[]
  shadingConcerns: string
  notes: string
}


export interface SolarAnalysisData {
  buildingInsights?: Record<string, any> | null
  imageryQuality: string
  imageryDate: string
  maxSunshineHoursPerYear: number | null
  carbonOffsetKgPerMwh: number | null
  maxArrayPanelsCount: number | null
  maxArrayAreaMeters2: number | null
  estimatedAnnualProductionKwh: number | null
  installerOverrideProductionKwh: number | null
  status: 'Pending' | 'Completed' | 'Unavailable'
  notes: string
}

export interface LoadAnalysisData {
  billingMethod: 'monthly_kwh' | 'monthly_bills' | 'daily_average'
  monthlyKwh: number[]
  monthlyBills: number[]
  annualKwh: number
  avgMonthlyKwh: number
  avgDailyKwh: number
  peakDemandKw: number
  baseLoadKw: number
  tariffRatePerKwh: number
  currency: string
  hasHourlyProfile: boolean
  hourlyProfile: number[]
  solarCoveragePercent: number
  selfConsumptionPercent: number
  gridDependencyPercent: number
  notes: string
}

export type EquipmentCategory =
  | 'PV Modules'
  | 'Inverters'
  | 'Batteries'
  | 'Charge Controllers'
  | 'Racking'
  | 'Other BOS Equipment'

export interface EquipmentItem {
  id: string
  category: EquipmentCategory
  manufacturer: string
  model: string
  ratedPowerW?: number
  efficiency?: number
  voc?: number
  isc?: number
  tempCoeff?: number
  lengthMm?: number
  widthMm?: number
  depthMm?: number
  weightKg?: number
  maxDcInputW?: number
  mpptVoltageMin?: number
  mpptVoltageMax?: number
  mpptCount?: number
  maxInputCurrentA?: number
  capacityKwh?: number
  batteryVoltageV?: number
  cRate?: number
  cycleLife?: number
  dodPercent?: number
  priceEstimate?: number
  notes?: string
}

export interface SystemSizingData {
  selectedModuleId: string | null
  moduleCount: number
  moduleWattage: number
  systemDcCapacityKwp: number
  selectedInverterId: string | null
  inverterCount: number
  inverterCapacityKw: number
  dcAcRatio: number
  inverterCompatibility: 'Compatible' | 'Requires Review' | 'Incompatible'
  inverterNotes: string
  hasBatteryStorage: boolean
  selectedBatteryId: string | null
  batteryCount: number
  desiredBackupHours: number
  criticalLoadKw: number
  usableBatteryKwh: number
  estimatedAutonomyHours: number
}

export interface FeasibilityCriterion {
  name: string
  category: string
  status: 'pass' | 'warning' | 'fail' | 'insufficient'
  message: string
}

export interface FeasibilityData {
  overallResult: 'Suitable' | 'Requires Review' | 'Limited Suitability' | 'Insufficient Data'
  criteria: FeasibilityCriterion[]
  summary: string
  installerSignoff: boolean
  signoffDate: string | null
  installerName: string
}

export interface Project {
  id: string
  name: string
  clientId: string
  clientName: string
  address: string
  latitude: number | null
  longitude: number | null
  status: ProjectStatus
  currentStep: number
  createdAt: string
  updatedAt: string
  roofVerification: RoofVerificationData
  roofModel?: RoofModel | null
  solarAnalysis: SolarAnalysisData
  loadAnalysis: LoadAnalysisData
  systemSizing: SystemSizingData
  feasibility: FeasibilityData
}

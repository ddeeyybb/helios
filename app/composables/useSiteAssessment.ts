import { ref, computed, watch } from 'vue'
import type { PropertyLocation, RoofTypeOption } from '~/types/assessment'
import type {
  RoofModel,
  RoofSegment,
  RoofObstacle,
  ObstacleType,
  PlacedSolarPanel,
  ShadingAssessmentRecord,
  RoofVertex,
  RoofFace,
  RoofPlaneGeometry,
  RooftopFeature,
  VerifiedRoofPolygon,
  RoofAssessmentState,
  RoofDrawingMode
} from '~/types/roof'
import { SAMPLE_PROPERTIES, isInsideDigos } from '~/data/sampleProperties'
import { useInstallerData } from '~/composables/useInstallerData'
import {
  calculateSolarPosition,
  evaluateShadingAssessment,
  calculateAnnualSolarEnergy,
  registerObstacleDistance,
  type SolarPositionResult
} from '~/utils/solar-calculations'
import {
  placeSolarPanelsInsideRoof,
  validateIndividualPanel,
  type PanelPlacementConfig
} from '~/utils/panel-placement'
import {
  buildExactRoofGeometry,
  applyGeneratedGeometryToRoofModel,
  hydrateOrUpgradeRoofModel,
  extractVerifiedBoundaryLatLng,
  extractVerifiedFootprint2D,
  computeSphericalPolygonAreaM2,
  inferFootprintShapeType,
  normalizeRoofStructureType,
  latLngToLocalMeters,
  ROOF_STRUCTURE_OPTIONS,
  type RoofStructureType,
  type GeneratedRoofGeometry
} from '~/utils/roof-mesh-generator'
import { snapPanelToRoofSurface } from '~/utils/roof-surface'
import {
  orderRoofPolygonVertices,
  insertPointIntoRoofPerimeter,
  SELF_INTERSECTION_ERROR_MESSAGE,
  type PolygonCrossingInfo
} from '~/utils/roof-polygon-order'

// ==========================================
// SINGLETON STATE ACROSS INSTALLER WORKFLOW
// ==========================================

const selectedProperty = ref<PropertyLocation | null>(null)
const centerOnDigosTrigger = ref<number>(0)
const isPinModeActive = ref(false)
const roofAssessmentStatus = ref<'Not analyzed' | 'In Progress' | 'Verified'>('Not analyzed')
const currentStep = ref<number>(1)
const isClassificationModalOpen = ref(false)
const manualClassification = ref<RoofTypeOption | ''>('')

// Manual Roof Boundary & Verification State
const roofAssessmentState = ref<RoofAssessmentState>('IDLE')
const roofDrawingMode = ref<RoofDrawingMode>('none')
const installerEditsCount = ref<number>(0)
const pointHistory = ref<Array<Array<{ lat: number; lng: number }>>>([])
const pointRedoHistory = ref<Array<Array<{ lat: number; lng: number }>>>([])
const selectedVertexIndex = ref<number | null>(null)
const verifiedRoofData = ref<VerifiedRoofPolygon | null>(null)

// Drawing and Geometry State
const isDrawingRoof = ref<boolean>(false)
const drawnRoofPoints = ref<Array<{ lat: number; lng: number }>>([])
const roofBoundaryDrawn = ref<boolean>(false)
const roofAreaSqM = ref<number>(0)
const usableRoofPercent = ref<number>(80) // 80% default (options: 70%, 75%, 80%, 85%, 90%)
const boundaryValidationMessage = ref<string>('')
const boundaryCrossings = ref<PolygonCrossingInfo[]>([])

// Roof Structure & Physical Properties (INSTALLER PROVIDED)
const roofStructureType = ref<RoofStructureType>('Hip / Pyramid')
const structureVerifiedByInstaller = ref<boolean>(false)
const roofType = ref<RoofTypeOption | 'Custom Drawn' | 'Not detected'>('Custom Drawn')
const roofPitchDegrees = ref<number>(15)
const roofAzimuthDegrees = ref<number>(180) // 180° = South facing default
const roofThicknessM = ref<number>(0.15)
const eaveHeightM = ref<number>(3.5)
const lastSyncedProjectId = ref<string | null>(null)
let isHydratingFromProject = false

// Multi-segment Roof Support
const roofSegmentsList = ref<RoofSegment[]>([])
const activeSegmentIndex = ref<number>(0)

// Obstructions (Trees, Water Tanks, Chimneys, Buildings, etc.)
// Purely data-driven: strictly ZERO default/fake trees or sample obstructions
const obstructions = ref<RoofObstacle[]>([])
const isAddingObstruction = ref<boolean>(false)
const pendingObstructionType = ref<ObstacleType>('Tree')

// Rooftop Features (Installer Verified from Satellite: Chimneys, Water Tanks, Vents, etc.)
// Purely data-driven: strictly ZERO default/demo features on clean roof
const rooftopFeatures = ref<RooftopFeature[]>([])

// Solar Panel Sizing Assumptions
const panelWattageW = ref<number>(550) // 550W default
const panelWidthM = ref<number>(1.134)
const panelHeightM = ref<number>(2.278) // Also used as panelLengthM
const panelLengthM = ref<number>(2.278)
const panelSpacingM = ref<number>(0.05)
const setbackM = ref<number>(0.5) // 0.5m roof setback
const panelOrientation = ref<'portrait' | 'landscape'>('portrait')
const peakSunHours = ref<number>(4.5) // Digos City default: 4.5 PSH / day
const performanceRatio = ref<number>(0.80) // 80% default PR

// Physical Placement Output
const placedPanels = ref<PlacedSolarPanel[]>([])
const setbackPolygonPoints = ref<Array<{ x: number; z: number }>>([])

// Shading Simulation State
const shadingDate = ref<string>(new Date().toISOString().split('T')[0] || '2026-10-15')
const shadingTime = ref<string>('12:00')
const shadingPreset = ref<'Today' | 'Morning' | 'Noon' | 'Afternoon' | 'Custom'>('Noon')
const shadingAssessment = ref<ShadingAssessmentRecord | null>(null)

// Generated 3D Mesh & Canonical Model
const generatedGeometry = ref<GeneratedRoofGeometry | null>(null)
const activeRoofModel = ref<RoofModel | null>(null)
const isGeneratingGeometry = ref<boolean>(false)
const roofSegments = ref<RoofSegment[]>([])
const installerVerified = ref<boolean>(false)
const installerNotes = ref<string>('')

// Telemetry & Diagnostics
const debugPanelVisible = ref(false)
const debugMetrics = ref({
  selectedLatitude: 0,
  selectedLongitude: 0,
  roofBoundaryStatus: 'NOT_DRAWN',
  roofAreaSqM: 0,
  usableAreaSqM: 0,
  estimatedPanels: 0,
  systemCapacityKwp: 0,
  annualEnergyKwh: 0,
  roofGeometryStatus: 'PENDING',
  roofModelStatus: 'PENDING',
  roofMeshCount: 0,
  roofVerticesCount: 0,
  roofFacesCount: 0,
  model3dLoaded: false
})

export function useSiteAssessment() {
  const hasSelectedProperty = computed(() => !!selectedProperty.value)
  const { activeProject, updateProject } = useInstallerData()

  // Computed Usable Roof Area (MAP-CALCULATED * INSTALLER ASSUMPTION %)
  const usableRoofAreaSqM = computed(() => {
    return Number((roofAreaSqM.value * (usableRoofPercent.value / 100)).toFixed(1))
  })

  // Physical Placed Panel Count (must strictly be 0 if roofAreaSqM is 0 or boundary not drawn)
  const physicalPanelCount = computed(() => {
    if (roofAreaSqM.value <= 0 || !roofBoundaryDrawn.value) return 0
    return placedPanels.value.length
  })
  const estimatedPanelCount = computed(() => {
    if (roofAreaSqM.value <= 0 || !roofBoundaryDrawn.value) return 0
    return placedPanels.value.length
  })

  // Theoretical max panels for informational potential analysis
  const theoreticalMaxPanels = computed(() => {
    if (roofAreaSqM.value <= 0 || !roofBoundaryDrawn.value || usableRoofAreaSqM.value <= 0) return 0
    const pArea = (panelWidthM.value + panelSpacingM.value) * (panelLengthM.value + panelSpacingM.value)
    if (pArea <= 0) return 0
    return Math.floor(usableRoofAreaSqM.value / pArea)
  })

  // Physical System Capacity (kWp) - strictly 0 when roof area is 0 or 0 panels placed
  const estimatedSystemCapacityKwp = computed(() => {
    if (roofAreaSqM.value <= 0 || !roofBoundaryDrawn.value || physicalPanelCount.value <= 0) return 0
    return Number(((physicalPanelCount.value * panelWattageW.value) / 1000).toFixed(2))
  })

  // Dynamic Shading Factor derived from Shading Assessment (1.00 when zero obstructions)
  const dynamicShadingFactor = computed(() => {
    if (!shadingAssessment.value || obstructions.value.length === 0) return 1.00
    const lossFraction = shadingAssessment.value.shadingPercentage / 100
    // Shading factor between 0.40 and 1.00
    return Math.max(0.40, Number((1 - lossFraction * 0.85).toFixed(2)))
  })

  // Estimated Annual Energy Generation (kWh/year)
  const annualEnergyCalculation = computed(() => {
    if (roofAreaSqM.value <= 0 || !roofBoundaryDrawn.value || estimatedSystemCapacityKwp.value <= 0) {
      return {
        estimatedAnnualEnergyKwh: 0,
        formulaString: '0 kWh/yr (Awaiting valid roof boundary)'
      }
    }
    return calculateAnnualSolarEnergy(
      estimatedSystemCapacityKwp.value,
      peakSunHours.value,
      performanceRatio.value,
      dynamicShadingFactor.value
    )
  })

  const estimatedAnnualEnergyKwh = computed(() => annualEnergyCalculation.value.estimatedAnnualEnergyKwh)
  const energyFormulaString = computed(() => annualEnergyCalculation.value.formulaString)

  // Current Solar Position for target date/time
  const currentSolarPosition = computed<SolarPositionResult>(() => {
    const lat = selectedProperty.value?.latitude ?? 6.7497
    const lng = selectedProperty.value?.longitude ?? 125.3572
    const [hStr, mStr] = shadingTime.value.split(':')
    const d = new Date(shadingDate.value)
    d.setHours(parseInt(hStr || '12', 10), parseInt(mStr || '0', 10), 0)
    return calculateSolarPosition(lat, lng, d)
  })

  // Area Discrepancy & Verification (derived truthfully from active canonical geometry)
  const babylonFootprintAreaM2 = computed(
    () => activeRoofModel.value?.footprintAreaM2 ?? generatedGeometry.value?.footprintAreaM2 ?? 0
  )
  const areaDiscrepancy = computed(
    () => activeRoofModel.value?.areaDiscrepancy ?? generatedGeometry.value?.areaDiscrepancy
  )
  const areaDifferencePercent = computed(() => areaDiscrepancy.value?.differencePercent ?? 0)
  const isGeometryAreaValid = computed(() => areaDiscrepancy.value?.isDiscrepancyAcceptable ?? true)
  const isBoundarySelfIntersecting = computed(() => boundaryCrossings.value.length > 0)

  // String formatted values for UI
  const roofArea = computed(() => roofAreaSqM.value > 0 ? `${roofAreaSqM.value.toFixed(1)} m²` : '--')
  const usableArea = computed(() => usableRoofAreaSqM.value > 0 ? `${usableRoofAreaSqM.value.toFixed(1)} m²` : '--')
  const roofPitch = computed(() => `${roofPitchDegrees.value}°`)
  const maxPanelCount = computed(() => physicalPanelCount.value || estimatedPanelCount.value || null)
  const yearlyEnergyDcKwh = computed(() => estimatedAnnualEnergyKwh.value || null)
  const maxSunshineHours = computed(() => Math.round(peakSunHours.value * 365))
  const carbonOffsetKg = computed(() => Math.round(estimatedAnnualEnergyKwh.value * 0.708))

  // Exact 10-Badge Pipeline Status
  const roofPipelineStatus = computed(() => {
    const isSelected = !!selectedProperty.value
    const isDrawn = roofBoundaryDrawn.value && drawnRoofPoints.value.length >= 3
    const isAreaCalculated = roofAreaSqM.value > 0
    const isStructureDefined = !!roofStructureType.value
    const isGeometryReady = (generatedGeometry.value?.vertices?.length ?? 0) > 0
    const isObstructionsAssessed = obstructions.value.length > 0
    const isSolarCalculated = physicalPanelCount.value > 0 || estimatedPanelCount.value > 0
    const isShadingEstimated = !!shadingAssessment.value
    const meshCount = (generatedGeometry.value?.faces?.length ?? 0) > 0 ? 1 : 0
    const is3dReady = !!activeRoofModel.value && (activeRoofModel.value.geometry?.faces?.length ?? 0) > 0

    return {
      building: {
        pass: isSelected,
        text: isSelected ? 'SELECTED' : 'NOT SELECTED'
      },
      roofBoundary: {
        pass: isDrawn,
        text: isDrawn ? 'DRAWN' : 'NOT DRAWN'
      },
      roofArea: {
        pass: isAreaCalculated,
        text: isAreaCalculated ? 'CALCULATED' : 'WAITING'
      },
      roofStructure: {
        pass: isStructureDefined,
        text: isStructureDefined ? 'DEFINED' : 'WAITING'
      },
      roofGeometry: {
        pass: isGeometryReady,
        text: isGeometryReady ? 'READY' : 'WAITING'
      },
      obstructionsAssessed: {
        pass: isObstructionsAssessed,
        text: isObstructionsAssessed ? `${obstructions.value.length} LOGGED` : 'NONE'
      },
      solarLayout: {
        pass: isSolarCalculated,
        text: isSolarCalculated ? 'CALCULATED' : 'WAITING'
      },
      shadingEstimated: {
        pass: isShadingEstimated,
        text: isShadingEstimated ? `${shadingAssessment.value?.shadingPercentage}% RISK` : 'PENDING'
      },
      babylonMeshes: {
        pass: meshCount > 0,
        text: meshCount > 0 ? 'GENERATED' : 'WAITING'
      },
      roof3d: {
        pass: is3dReady,
        text: is3dReady ? 'READY' : 'WAITING'
      }
    }
  })

  // ==========================================
  // CORE GEOMETRY & PHYSICAL PLACEMENT ENGINE
  // ==========================================

  function computeAccuratePolygonArea(pts: Array<{ lat: number; lng: number }>): number {
    if (pts.length < 3) return 0
    if (import.meta.client && window.google?.maps?.geometry?.spherical) {
      const path = pts.map(pt => new google.maps.LatLng(pt.lat, pt.lng))
      return Number(google.maps.geometry.spherical.computeArea(path).toFixed(1))
    }
    return Number(computeSphericalPolygonAreaM2(pts).toFixed(1))
  }

  function normalizeAndValidateBoundary(reorderInPlace = true): boolean {
    if (drawnRoofPoints.value.length < 3) {
      boundaryCrossings.value = []
      boundaryValidationMessage.value = ''
      roofAreaSqM.value = 0
      return false
    }

    const ordered = orderRoofPolygonVertices(drawnRoofPoints.value)
    if (reorderInPlace && ordered.wasReordered) {
      drawnRoofPoints.value = ordered.points
    }

    boundaryCrossings.value = ordered.validation.crossings
    if (!ordered.validation.isValid) {
      boundaryValidationMessage.value = ordered.validation.message || SELF_INTERSECTION_ERROR_MESSAGE
      roofAreaSqM.value = 0
      return false
    }

    boundaryValidationMessage.value = ''
    roofAreaSqM.value = computeAccuratePolygonArea(ordered.points)
    return true
  }

  function validateBoundaryPoints(): boolean {
    if (drawnRoofPoints.value.length < 3) {
      boundaryValidationMessage.value = 'Invalid roof boundary. At least 3 points required.'
      boundaryCrossings.value = []
      return false
    }
    return normalizeAndValidateBoundary(true)
  }

  /**
   * Recalculates the complete multi-plane 3D roof mesh, physical solar panel layout,
   * and shading assessment directly from the verified drawn boundary.
   */
  async function recalculateAll() {
    if (isHydratingFromProject) return
    if (!drawnRoofPoints.value || drawnRoofPoints.value.length < 3) return
    if (!validateBoundaryPoints()) return

    isGeneratingGeometry.value = true

    try {
      if (roofAreaSqM.value <= 0) {
        recalculateAreaFromPoints()
      }

      // 1. Build Exact Multi-Plane 3D Roof Mesh Geometry with sloped slab thickness
      const geom = buildExactRoofGeometry(
        drawnRoofPoints.value,
        roofAreaSqM.value,
        {
          pitchDegrees: roofPitchDegrees.value,
          azimuthDegrees: roofAzimuthDegrees.value,
          eaveHeightM: eaveHeightM.value,
          roofThicknessM: roofThicknessM.value,
          roofType: roofStructureType.value
        }
      )
      generatedGeometry.value = geom
      if (roofStructureType.value !== geom.roofType) {
        isHydratingFromProject = true
        roofStructureType.value = geom.roofType
        isHydratingFromProject = false
      }

      // Exact local coordinate origin from the verified roof polygon
      const centerLat = geom.origin.latitude
      const centerLng = geom.origin.longitude
      obstructions.value.forEach((obs, idx) => {
        if (!obs.position) {
          obs.position = { x: 5 + idx * 3, y: eaveHeightM.value, z: -3 }
        }
        registerObstacleDistance(obs.id, obs.distanceFromRoofM ?? 2.0)
      })

      // 2. Physical Panel Placement inside Verified 2D Footprint Setback Polygon avoiding Obstructions
      const topPolygon2D = geom.footprint2D
      const placementResult = placeSolarPanelsInsideRoof(
        topPolygon2D,
        obstructions.value,
        {
          panelWidthM: panelWidthM.value,
          panelLengthM: panelLengthM.value,
          panelWattageW: panelWattageW.value,
          setbackM: setbackM.value,
          panelSpacingM: panelSpacingM.value,
          orientation: panelOrientation.value,
          pitchDegrees: roofPitchDegrees.value,
          azimuthDegrees: roofAzimuthDegrees.value,
          eaveHeightM: eaveHeightM.value
        }
      )

      // Setback polygon points outline for rendering
      setbackPolygonPoints.value = placementResult.setbackPolygon

      // 3. Evaluate Estimated Shading Simulation
      const solPos = currentSolarPosition.value
      shadingAssessment.value = evaluateShadingAssessment(
        topPolygon2D,
        usableRoofAreaSqM.value,
        obstructions.value,
        solPos.solarAltitudeDeg,
        solPos.solarAzimuthDeg,
        shadingDate.value,
        shadingTime.value,
        shadingPreset.value,
        eaveHeightM.value
      )

      // 4. Assemble Canonical v2 RoofModel
      const baseModel: RoofModel = {
        id: activeRoofModel.value?.id || `model-${Date.now()}`,
        buildingId: selectedProperty.value?.buildingId || 'installer-drawn-building',
        projectId: activeProject.value?.id || 'current-project',
        source: 'Installer Verified',
        origin: {
          latitude: centerLat,
          longitude: centerLng,
          elevation: eaveHeightM.value
        },
        segments: [],
        roofSegments: [],
        obstacles: obstructions.value,
        roofFeatures: rooftopFeatures.value,
        panels: [],
        geometry: {
          vertices: [],
          faces: [],
          segments: [],
          ridges: [],
          valleys: [],
          eaves: [],
          bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }
        },
        verification: {
          status: 'Verified',
          confidence: 'INSTALLER VERIFIED',
          verifiedBy: 'Field Solar Installer',
          verifiedDate: new Date().toISOString().split('T')[0],
          notes: installerNotes.value || 'Accurately derived from verified Google Maps roof boundary.'
        },
        status: 'VERIFIED',
        createdAt: activeRoofModel.value?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const canonicalModel = applyGeneratedGeometryToRoofModel(baseModel, geom, {
        pitchDegrees: roofPitchDegrees.value,
        azimuthDegrees: roofAzimuthDegrees.value,
        eaveHeightM: eaveHeightM.value,
        roofThicknessM: roofThicknessM.value,
        structureVerifiedByInstaller: structureVerifiedByInstaller.value
      })

      if (canonicalModel.segments[0]) {
        canonicalModel.segments[0].potentialPanels = placementResult.totalFittedPanels
        canonicalModel.segments[0].yearlyEnergyDcKwh = estimatedAnnualEnergyKwh.value
      }

      // Do NOT automatically place panels on clean roofs!
      // If panels already exist (from saved model or manual placement), snap & validate them against updated multi-plane geometry
      if (placedPanels.value && placedPanels.value.length > 0) {
        placedPanels.value = placedPanels.value.map(p => {
          const copy = { ...p }
          snapPanelToRoofSurface(copy, canonicalModel, null)
          const val = validateIndividualPanel(copy, topPolygon2D, setbackM.value, obstructions.value, [], placedPanels.value)
          return {
            ...copy,
            status: val.isValid ? 'VALID' : 'INVALID',
            validationReason: val.reason
          }
        })
      } else {
        placedPanels.value = []
      }
      canonicalModel.panels = placedPanels.value

      roofSegments.value = canonicalModel.segments
      roofSegmentsList.value = canonicalModel.segments

      activeRoofModel.value = canonicalModel
      installerVerified.value = true
      roofAssessmentStatus.value = 'Verified'

      // Update telemetry
      debugMetrics.value.roofBoundaryStatus = 'DRAWN'
      debugMetrics.value.roofAreaSqM = roofAreaSqM.value
      debugMetrics.value.usableAreaSqM = usableRoofAreaSqM.value
      debugMetrics.value.estimatedPanels = placementResult.totalFittedPanels
      debugMetrics.value.systemCapacityKwp = placementResult.systemCapacityKwp
      debugMetrics.value.annualEnergyKwh = estimatedAnnualEnergyKwh.value
      debugMetrics.value.roofMeshCount = 1
      debugMetrics.value.roofVerticesCount = geom.vertices.length
      debugMetrics.value.roofFacesCount = geom.faces.length
      debugMetrics.value.roofGeometryStatus = 'READY'
      debugMetrics.value.roofModelStatus = 'READY'
      debugMetrics.value.model3dLoaded = true

      // Sync with active project store
      syncWithProject()
    } catch (err) {
      console.error('Error rebuilding 3D roof and panels:', err)
    } finally {
      isGeneratingGeometry.value = false
    }
  }

  function syncWithProject() {
    if (!activeProject.value) return

    updateProject(activeProject.value.id, {
      status: 'Roof Verification',
      currentStep: Math.max(activeProject.value.currentStep, 2),
      roofModel: activeRoofModel.value || undefined,
      systemSizing: {
        ...activeProject.value.systemSizing,
        moduleCount: physicalPanelCount.value || estimatedPanelCount.value,
        moduleWattage: panelWattageW.value,
        systemDcCapacityKwp: estimatedSystemCapacityKwp.value
      },
      solarAnalysis: {
        ...activeProject.value.solarAnalysis,
        status: 'Completed',
        maxArrayPanelsCount: physicalPanelCount.value || estimatedPanelCount.value,
        maxArrayAreaMeters2: usableRoofAreaSqM.value,
        maxSunshineHoursPerYear: Math.round(peakSunHours.value * 365),
        estimatedAnnualProductionKwh: estimatedAnnualEnergyKwh.value,
        installerOverrideProductionKwh: estimatedAnnualEnergyKwh.value,
        notes: `Physical layout: ${physicalPanelCount.value} modules on ${roofAreaSqM.value} m² roof boundary (${usableRoofPercent.value}% usable, ${panelWattageW.value}W modules, ${peakSunHours.value} PSH, ${(performanceRatio.value * 100).toFixed(0)}% PR, ${(dynamicShadingFactor.value * 100).toFixed(0)}% SF).`
      },
      roofVerification: {
        ...activeProject.value.roofVerification,
        status: 'Verified',
        confidence: 'INSTALLER VERIFIED',
        roofType: roofStructureType.value as any,
        verifiedPitchDeg: roofPitchDegrees.value,
        verifiedAreaM2: roofAreaSqM.value,
        usableAreaM2: usableRoofAreaSqM.value,
        segments: activeRoofModel.value?.roofSegments as any
      }
    })
  }

  // ==========================================
  // PROPERTY SELECTION & DRAWING ACTIONS
  // ==========================================

  function selectProperty(property: PropertyLocation) {
    selectedProperty.value = property
    currentStep.value = 1
    debugMetrics.value.selectedLatitude = property.latitude
    debugMetrics.value.selectedLongitude = property.longitude

    if (activeProject.value) {
      updateProject(activeProject.value.id, {
        latitude: property.latitude,
        longitude: property.longitude,
        address: property.address,
        ...(property.roofType ? {
          roofVerification: {
            ...activeProject.value.roofVerification,
            roofType: property.roofType as any
          }
        } : {})
      })
    }
  }

  function centerMapOnDigos() {
    centerOnDigosTrigger.value++
  }

  function selectCoordinates(
    lat: number,
    lng: number,
    name?: string,
    address?: string,
    source?: string,
    placeId?: string,
    suggestedZoom?: number,
    types?: string[],
    viewport?: { north: number; south: number; east: number; west: number }
  ) {
    const prop: PropertyLocation = {
      id: placeId || `pin-${lat.toFixed(5)}-${lng.toFixed(5)}`,
      name: name || `Survey Site (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`,
      address: address || 'Address lookup in progress...',
      latitude: lat,
      longitude: lng,
      status: 'Verified Pin',
      source: (source as any) || 'Google Maps',
      roofType: 'Custom Drawn',
      suggestedZoom,
      types,
      viewport
    }

    selectedProperty.value = prop
    debugMetrics.value.selectedLatitude = prop.latitude
    debugMetrics.value.selectedLongitude = prop.longitude

    if (activeProject.value) {
      updateProject(activeProject.value.id, {
        latitude: prop.latitude,
        longitude: prop.longitude,
        address: prop.address
      })
    }
  }

  function clearSelection() {
    selectedProperty.value = null
    clearRoof()
  }

  function recalculateAreaFromPoints() {
    if (drawnRoofPoints.value.length < 3) {
      roofAreaSqM.value = 0
      boundaryCrossings.value = []
      boundaryValidationMessage.value = ''
      return
    }
    normalizeAndValidateBoundary(true)
  }

  function inferInitialStructureFromPoints(coords: Array<{ lat: number; lng: number }>) {
    if (structureVerifiedByInstaller.value || coords.length < 3) return
    const avgLat = coords.reduce((s, p) => s + p.lat, 0) / coords.length
    const avgLng = coords.reduce((s, p) => s + p.lng, 0) / coords.length
    const localPts = coords.map(pt => latLngToLocalMeters(pt.lat, pt.lng, avgLat, avgLng))
    roofStructureType.value = inferFootprintShapeType(localPts)
  }

  function setInstallerRoofStructureType(type: RoofStructureType) {
    structureVerifiedByInstaller.value = true
    roofStructureType.value = normalizeRoofStructureType(type, extractVerifiedFootprint2D(activeRoofModel.value))
  }

  function savePointHistorySnapshot() {
    pointHistory.value.push(drawnRoofPoints.value.map(p => ({ lat: p.lat, lng: p.lng })))
    pointRedoHistory.value = []
  }

  function recordDragStartSnapshot() {
    savePointHistorySnapshot()
  }

  function startManualDrawRoof() {
    roofAssessmentState.value = 'IDLE'
    roofDrawingMode.value = 'manual-draw'
    drawnRoofPoints.value = []
    roofBoundaryDrawn.value = false
    roofAreaSqM.value = 0
    isDrawingRoof.value = true
    structureVerifiedByInstaller.value = false
    pointHistory.value = []
    pointRedoHistory.value = []
    installerEditsCount.value = 0
    boundaryValidationMessage.value = ''
    boundaryCrossings.value = []
  }

  function enterEditPointsMode() {
    if (drawnRoofPoints.value.length < 3) return
    normalizeAndValidateBoundary(true)
    savePointHistorySnapshot()
    roofAssessmentState.value = 'EDITING'
    roofDrawingMode.value = 'edit-points'
    isDrawingRoof.value = false
  }

  function toggleAddPointMode() {
    if (drawnRoofPoints.value.length < 3) return
    if (roofDrawingMode.value === 'add-point') {
      roofDrawingMode.value = 'edit-points'
    } else {
      roofDrawingMode.value = 'add-point'
    }
    roofAssessmentState.value = 'EDITING'
  }

  function undoRoofPointEdit() {
    if (pointHistory.value.length > 0) {
      pointRedoHistory.value.push(drawnRoofPoints.value.map(p => ({ lat: p.lat, lng: p.lng })))
      const prev = pointHistory.value.pop()
      if (prev) {
        drawnRoofPoints.value = prev.map(p => ({ lat: p.lat, lng: p.lng }))
        installerEditsCount.value++
        selectedVertexIndex.value = null
        recalculateAreaFromPoints()
      }
    }
  }

  function redoRoofPointEdit() {
    if (pointRedoHistory.value.length > 0) {
      pointHistory.value.push(drawnRoofPoints.value.map(p => ({ lat: p.lat, lng: p.lng })))
      const next = pointRedoHistory.value.pop()
      if (next) {
        drawnRoofPoints.value = next.map(p => ({ lat: p.lat, lng: p.lng }))
        installerEditsCount.value++
        selectedVertexIndex.value = null
        recalculateAreaFromPoints()
      }
    }
  }

  function insertRoofPointAt(_index: number, lat: number, lng: number) {
    savePointHistorySnapshot()
    const inserted = insertPointIntoRoofPerimeter(drawnRoofPoints.value, { lat, lng })
    drawnRoofPoints.value = inserted.points
    selectedVertexIndex.value = inserted.insertedIndex
    installerEditsCount.value++
    boundaryCrossings.value = inserted.validation.crossings
    if (!inserted.validation.isValid) {
      boundaryValidationMessage.value = inserted.validation.message || SELF_INTERSECTION_ERROR_MESSAGE
      roofAreaSqM.value = 0
    } else {
      boundaryValidationMessage.value = ''
      roofAreaSqM.value = computeAccuratePolygonArea(inserted.points)
    }
  }

  function deleteRoofPointAt(index: number): boolean {
    if (drawnRoofPoints.value.length <= 3) {
      boundaryValidationMessage.value = 'At least 3 roof points are required.'
      return false
    }
    savePointHistorySnapshot()
    drawnRoofPoints.value.splice(index, 1)
    installerEditsCount.value++
    selectedVertexIndex.value = null
    normalizeAndValidateBoundary(true)
    return true
  }

  async function confirmRoofAssessment() {
    if (drawnRoofPoints.value.length < 3) {
      boundaryValidationMessage.value = 'At least 3 roof points are required to confirm the roof.'
      return false
    }

    const isValid = normalizeAndValidateBoundary(true)
    if (!isValid) {
      boundaryValidationMessage.value = SELF_INTERSECTION_ERROR_MESSAGE
      return false
    }

    inferInitialStructureFromPoints(drawnRoofPoints.value)
    isDrawingRoof.value = false
    roofBoundaryDrawn.value = true
    roofAssessmentState.value = 'CONFIRMED'
    roofDrawingMode.value = 'none'
    roofAssessmentStatus.value = 'Verified'

    verifiedRoofData.value = {
      source: 'manual',
      verified: true,
      verifiedBy: 'Lead PV System Designer',
      verifiedAt: new Date().toISOString(),
      installerEditsCount: installerEditsCount.value,
      points: [...drawnRoofPoints.value],
      areaM2: roofAreaSqM.value
    }

    // Strictly ZERO auto-placed panels and ZERO auto-placed trees on newly confirmed roof
    placedPanels.value = []

    // Rebuild canonical multi-plane 3D geometry in Babylon
    await recalculateAll()

    return true
  }

  function redrawRoofManually() {
    savePointHistorySnapshot()
    clearRoof()
    startManualDrawRoof()
  }

  function startRoofAssessment() {
    if (!selectedProperty.value) return
    currentStep.value = 2
    roofAssessmentStatus.value = 'In Progress'
  }

  function startDrawRoof() {
    startManualDrawRoof()
  }

  function addRoofPoint(lat: number, lng: number) {
    savePointHistorySnapshot()
    if (drawnRoofPoints.value.length < 3) {
      drawnRoofPoints.value.push({ lat, lng })
      installerEditsCount.value++
      if (drawnRoofPoints.value.length === 3) {
        normalizeAndValidateBoundary(true)
      } else {
        boundaryCrossings.value = []
        boundaryValidationMessage.value = ''
      }
      return
    }

    const inserted = insertPointIntoRoofPerimeter(drawnRoofPoints.value, { lat, lng })
    drawnRoofPoints.value = inserted.points
    installerEditsCount.value++
    boundaryCrossings.value = inserted.validation.crossings
    if (!inserted.validation.isValid) {
      boundaryValidationMessage.value = inserted.validation.message || SELF_INTERSECTION_ERROR_MESSAGE
      roofAreaSqM.value = 0
    } else {
      boundaryValidationMessage.value = ''
      roofAreaSqM.value = computeAccuratePolygonArea(inserted.points)
    }
  }

  function updateRoofPoint(index: number, lat: number, lng: number, finalizeOrder = false) {
    if (!drawnRoofPoints.value[index]) return
    drawnRoofPoints.value[index] = { lat, lng }
    installerEditsCount.value++

    if (drawnRoofPoints.value.length < 3) return

    if (finalizeOrder) {
      const ordered = orderRoofPolygonVertices(drawnRoofPoints.value)
      if (ordered.wasReordered) {
        drawnRoofPoints.value = ordered.points
        const newIdx = ordered.originalIndices.indexOf(index)
        if (selectedVertexIndex.value === index && newIdx !== -1) {
          selectedVertexIndex.value = newIdx
        }
      }
      boundaryCrossings.value = ordered.validation.crossings
      if (!ordered.validation.isValid) {
        boundaryValidationMessage.value = ordered.validation.message || SELF_INTERSECTION_ERROR_MESSAGE
        roofAreaSqM.value = 0
      } else {
        boundaryValidationMessage.value = ''
        roofAreaSqM.value = computeAccuratePolygonArea(ordered.points)
      }
    } else {
      normalizeAndValidateBoundary(false)
    }
  }

  function undoLastRoofPoint() {
    if (pointHistory.value.length > 0) {
      const prev = pointHistory.value.pop()
      if (prev) {
        drawnRoofPoints.value = prev.map(p => ({ lat: p.lat, lng: p.lng }))
        installerEditsCount.value++
        if (drawnRoofPoints.value.length >= 3) {
          normalizeAndValidateBoundary(true)
        } else {
          roofAreaSqM.value = 0
          boundaryCrossings.value = []
          boundaryValidationMessage.value = ''
        }
      }
      return
    }
    if (drawnRoofPoints.value.length > 0) {
      drawnRoofPoints.value.pop()
      installerEditsCount.value++
      if (drawnRoofPoints.value.length >= 3) {
        normalizeAndValidateBoundary(true)
      } else {
        roofAreaSqM.value = 0
        boundaryCrossings.value = []
        boundaryValidationMessage.value = ''
      }
    }
  }

  async function finishRoof(_calculatedAreaM2?: number): Promise<boolean> {
    if (drawnRoofPoints.value.length < 3) {
      boundaryValidationMessage.value = 'Please click at least 3 points around the roof boundary.'
      return false
    }

    const isValid = normalizeAndValidateBoundary(true)
    if (!isValid) {
      boundaryValidationMessage.value = SELF_INTERSECTION_ERROR_MESSAGE
      return false
    }

    isDrawingRoof.value = false
    roofBoundaryDrawn.value = true
    roofAssessmentState.value = 'CONFIRMED'
    roofDrawingMode.value = 'none'
    roofAssessmentStatus.value = 'Verified'

    inferInitialStructureFromPoints(drawnRoofPoints.value)

    verifiedRoofData.value = {
      source: 'manual',
      verified: true,
      verifiedBy: 'Lead PV System Designer',
      verifiedAt: new Date().toISOString(),
      installerEditsCount: installerEditsCount.value,
      points: [...drawnRoofPoints.value],
      areaM2: roofAreaSqM.value
    }

    await recalculateAll()
    return true
  }

  function clearRoof() {
    isDrawingRoof.value = false
    roofBoundaryDrawn.value = false
    roofAssessmentState.value = 'IDLE'
    roofDrawingMode.value = 'none'
    selectedVertexIndex.value = null
    pointHistory.value = []
    pointRedoHistory.value = []
    drawnRoofPoints.value = []
    roofAreaSqM.value = 0
    activeRoofModel.value = null
    roofSegments.value = []
    roofSegmentsList.value = []
    placedPanels.value = []
    setbackPolygonPoints.value = []
    obstructions.value = [] // Zero obstructions on clean roof
    rooftopFeatures.value = [] // Clean roof starts with 0 rooftop features (Requirement 23)
    shadingAssessment.value = null
    generatedGeometry.value = null
    installerVerified.value = false
    boundaryValidationMessage.value = ''
    boundaryCrossings.value = []
    roofAssessmentStatus.value = selectedProperty.value ? 'In Progress' : 'Not analyzed'

    debugMetrics.value.roofBoundaryStatus = 'NOT_DRAWN'
    debugMetrics.value.roofAreaSqM = 0
    debugMetrics.value.usableAreaSqM = 0
    debugMetrics.value.estimatedPanels = 0
    debugMetrics.value.systemCapacityKwp = 0
    debugMetrics.value.annualEnergyKwh = 0
    debugMetrics.value.roofGeometryStatus = 'PENDING'
    debugMetrics.value.roofModelStatus = 'PENDING'
    debugMetrics.value.roofMeshCount = 0
    debugMetrics.value.model3dLoaded = false
  }

  function redrawRoof() {
    clearRoof()
    startDrawRoof()
  }

  // ==========================================
  // OBSTRUCTION ACTIONS
  // ==========================================

  function addObstruction(obs: Partial<RoofObstacle>) {
    // Section 6: Tree Data Validation - strictly require height and canopyRadius
    if (obs.type === 'Tree') {
      if (!obs.heightM || obs.heightM <= 0 || !obs.canopyRadiusM || obs.canopyRadiusM <= 0) {
        throw new Error('Tree dimensions incomplete. Enter tree height and canopy radius before generating the 3D tree.')
      }
    }

    const newId = obs.id || `obs-${Date.now()}`
    
    // Section 8: Tree Location mapped via Google Maps latitude/longitude to local coordinates
    let position = obs.position
    if (!position && obs.latitude && obs.longitude && drawnRoofPoints.value.length > 0) {
      const sumLat = drawnRoofPoints.value.reduce((s, p) => s + p.lat, 0) / drawnRoofPoints.value.length
      const sumLng = drawnRoofPoints.value.reduce((s, p) => s + p.lng, 0) / drawnRoofPoints.value.length
      const local = latLngToLocalMeters(obs.latitude, obs.longitude, sumLat, sumLng)
      position = { x: local.x, y: 0, z: local.z }
    } else if (!position) {
      const dist = obs.distanceFromRoofM ?? 3.0
      position = { x: dist, y: 0, z: dist }
    }

    const newObstacle: RoofObstacle = {
      id: newId,
      name: obs.name || (obs.type === 'Tree' ? `Tree #${obstructions.value.filter(o => o.type === 'Tree').length + 1}` : `${obs.type || 'Obstruction'} #${obstructions.value.length + 1}`),
      type: obs.type || 'Tree',
      heightM: obs.heightM || (obs.type === 'Tree' ? 8.0 : 3.0),
      canopyRadiusM: obs.type === 'Tree' ? obs.canopyRadiusM : undefined,
      radiusM: obs.radiusM,
      trunkRadiusM: obs.trunkRadiusM,
      widthM: obs.widthM || (obs.type === 'Tree' && obs.canopyRadiusM ? obs.canopyRadiusM * 2 : 2.0),
      lengthM: obs.lengthM || (obs.type === 'Tree' && obs.canopyRadiusM ? obs.canopyRadiusM * 2 : 2.0),
      distanceFromRoofM: obs.distanceFromRoofM ?? 2.0,
      position,
      latitude: obs.latitude,
      longitude: obs.longitude,
      source: 'Installer Provided',
      notes: obs.notes
    }

    obstructions.value.push(newObstacle)
    registerObstacleDistance(newId, newObstacle.distanceFromRoofM ?? 2.0)
    recalculateAll()
  }

  function updateObstruction(id: string, updates: Partial<RoofObstacle>) {
    const idx = obstructions.value.findIndex(o => o.id === id)
    if (idx !== -1) {
      const existing = obstructions.value[idx]
      if (!existing) return
      obstructions.value[idx] = { ...existing, ...updates, id }
      if (updates.distanceFromRoofM !== undefined) {
        registerObstacleDistance(id, updates.distanceFromRoofM)
      }
      recalculateAll()
    }
  }

  function removeObstruction(id: string) {
    obstructions.value = obstructions.value.filter(o => o.id !== id)
    recalculateAll()
  }

  // ==========================================
  // SHADING ASSESSMENT ACTIONS
  // ==========================================

  function calculateShadow(preset?: 'Today' | 'Morning' | 'Noon' | 'Afternoon' | 'Custom') {
    if (preset) {
      shadingPreset.value = preset
      if (preset === 'Morning') shadingTime.value = '09:00'
      else if (preset === 'Noon') shadingTime.value = '12:00'
      else if (preset === 'Afternoon') shadingTime.value = '15:00'
      else if (preset === 'Today') shadingTime.value = '12:00'
    }
    recalculateAll()
  }

  function hydrateStateFromProjectModel(rawModel?: RoofModel | null) {
    if (isDrawingRoof.value) return
    const upgraded = hydrateOrUpgradeRoofModel(rawModel)
    if (!upgraded) {
      clearRoof()
      return
    }

    isHydratingFromProject = true
    try {
      const boundary = extractVerifiedBoundaryLatLng(upgraded)
      const mapArea =
        upgraded.mapAreaM2 ||
        upgraded.areaDiscrepancy?.googleAreaM2 ||
        upgraded.building?.areaM2 ||
        computeSphericalPolygonAreaM2(boundary)

      activeRoofModel.value = upgraded
      drawnRoofPoints.value = boundary
      roofBoundaryDrawn.value = boundary.length >= 3
      roofAreaSqM.value = Number(mapArea.toFixed(1))
      roofStructureType.value = normalizeRoofStructureType(
        upgraded.roofType || upgraded.building?.roofType,
        upgraded.footprint2D
      )
      structureVerifiedByInstaller.value = Boolean(upgraded.structureVerifiedByInstaller)
      roofPitchDegrees.value = upgraded.pitchDegrees ?? upgraded.segments?.[0]?.pitchDegrees ?? 15
      roofAzimuthDegrees.value = upgraded.azimuthDegrees ?? upgraded.segments?.[0]?.azimuthDegrees ?? 180
      roofThicknessM.value = upgraded.roofThicknessM ?? 0.15
      eaveHeightM.value = upgraded.eaveHeightM ?? upgraded.origin?.elevation ?? 3.5

      roofSegments.value = upgraded.segments || []
      roofSegmentsList.value = upgraded.segments || []
      obstructions.value = upgraded.obstacles || []
      rooftopFeatures.value = upgraded.roofFeatures || []
      placedPanels.value = upgraded.panels || []
      roofAssessmentState.value = 'CONFIRMED'
      roofDrawingMode.value = 'none'
      roofAssessmentStatus.value = 'Verified'
      installerVerified.value = true

      if (boundary.length >= 3) {
        generatedGeometry.value = buildExactRoofGeometry(boundary, roofAreaSqM.value, {
          pitchDegrees: roofPitchDegrees.value,
          azimuthDegrees: roofAzimuthDegrees.value,
          eaveHeightM: eaveHeightM.value,
          roofThicknessM: roofThicknessM.value,
          roofType: roofStructureType.value,
          originLat: upgraded.origin?.latitude,
          originLng: upgraded.origin?.longitude
        })
      }
    } finally {
      isHydratingFromProject = false
    }
  }

  // Keep singleton state synchronized with the active project's verified roof model
  watch(
    () => activeProject.value?.id,
    newId => {
      if ((newId ?? null) === lastSyncedProjectId.value) return
      lastSyncedProjectId.value = newId ?? null
      hydrateStateFromProjectModel(activeProject.value?.roofModel)
    },
    { immediate: true }
  )

  // Watchers to trigger real-time updates when installer changes assumptions
  watch(
    [roofStructureType, roofPitchDegrees, roofAzimuthDegrees, roofThicknessM, setbackM, usableRoofPercent, panelOrientation, panelWattageW],
    () => {
      if (isHydratingFromProject || isGeneratingGeometry.value) return
      if (roofBoundaryDrawn.value && drawnRoofPoints.value.length >= 3) {
        recalculateAll()
      }
    }
  )

  // Backward-compatible method wrappers
  function calculateSolar() {
    recalculateAll()
  }

  async function saveVerifiedRoofModel(
    model?: RoofModel | null,
    notes = ''
  ): Promise<{ success: boolean; message: string; data?: RoofModel }> {
    const targetModel = model || activeRoofModel.value
    if (!targetModel) {
      return {
        success: false,
        message: 'No valid roof model available to verify and save.'
      }
    }

    // Preserve verification notes & update verification state
    if (notes) {
      installerNotes.value = notes
    }
    installerVerified.value = true
    roofAssessmentStatus.value = 'Verified'

    // Canonical verification payload
    targetModel.source = 'Installer Verified'
    targetModel.status = 'INSTALLER_VERIFIED'
    targetModel.verification = {
      status: 'Verified',
      confidence: 'INSTALLER VERIFIED',
      verifiedDate: targetModel.verification?.verifiedDate || new Date().toISOString().split('T')[0],
      verifiedBy: targetModel.verification?.verifiedBy || 'Lead PV System Designer',
      notes: notes || targetModel.verification?.notes || installerNotes.value || ''
    }
    targetModel.updatedAt = new Date().toISOString()

    // Ensure all roof segments reflect installer verification
    if (targetModel.roofSegments && targetModel.roofSegments.length > 0) {
      targetModel.roofSegments.forEach(s => {
        s.source = 'INSTALLER_VERIFIED'
        s.verificationStatus = 'Verified'
      })
    }
    if (targetModel.segments && targetModel.segments.length > 0) {
      targetModel.segments.forEach(s => {
        s.source = 'INSTALLER_VERIFIED'
        s.verificationStatus = 'Verified'
      })
    }

    // Update active roof model in composable state
    activeRoofModel.value = targetModel

    // Persist to server store via existing /api/roofs/model endpoint
    const pid = activeProject.value?.id || 'current-project'
    try {
      const res = await $fetch<{ success: boolean; message?: string; data?: RoofModel }>('/api/roofs/model', {
        method: 'POST',
        body: {
          projectId: pid,
          action: 'save_verified',
          verifiedModel: targetModel
        }
      })
      if (res?.data) {
        activeRoofModel.value = res.data
      }
    } catch (err) {
      console.warn('Persisting roof model to server store (/api/roofs/model) failed, preserved locally:', err)
    }

    // Sync with project in useInstallerData (localStorage)
    syncWithProject()

    return {
      success: true,
      message: 'Verified RoofModel saved successfully.',
      data: activeRoofModel.value || targetModel
    }
  }

  async function saveRoofModel(notes = '') {
    const res = await saveVerifiedRoofModel(activeRoofModel.value, notes)
    return res.success
  }

  function verifyRoofData() {
    installerVerified.value = true
    roofAssessmentStatus.value = 'Verified'
    currentStep.value = 3
    syncWithProject()
  }

  function togglePinMode() {
    isPinModeActive.value = !isPinModeActive.value
  }

  function openClassificationModal() {
    isClassificationModalOpen.value = true
  }

  function closeClassificationModal() {
    isClassificationModalOpen.value = false
  }

  function applyManualClassification(type: RoofTypeOption) {
    manualClassification.value = type
    roofType.value = type
    setInstallerRoofStructureType(type as RoofStructureType)
    isClassificationModalOpen.value = false
  }

  function autoArrangePanels() {
    if (!generatedGeometry.value) return 0
    const topPolygon2D = generatedGeometry.value.footprint2D
    const placementResult = placeSolarPanelsInsideRoof(
      topPolygon2D,
      obstructions.value,
      {
        panelWidthM: panelWidthM.value,
        panelLengthM: panelLengthM.value,
        panelWattageW: panelWattageW.value,
        setbackM: setbackM.value,
        panelSpacingM: panelSpacingM.value,
        orientation: panelOrientation.value,
        pitchDegrees: roofPitchDegrees.value,
        azimuthDegrees: roofAzimuthDegrees.value,
        eaveHeightM: eaveHeightM.value
      }
    )
    placedPanels.value = placementResult.placedPanels.map(p => {
      const copy = { ...p }
      if (activeRoofModel.value) {
        snapPanelToRoofSurface(copy, activeRoofModel.value, null)
      }
      return copy
    })
    return placementResult.totalFittedPanels
  }

  function clearAllPanels() {
    placedPanels.value = []
  }

  return {
    selectedProperty,
    hasSelectedProperty,
    isPinModeActive,
    roofAssessmentStatus,
    roofType,
    roofStructureType,
    structureVerifiedByInstaller,
    roofStructureOptions: ROOF_STRUCTURE_OPTIONS,
    setInstallerRoofStructureType,
    hydrateStateFromProjectModel,
    roofArea,
    roofPitch,
    usableArea,
    currentStep,
    isClassificationModalOpen,
    manualClassification,
    // Solar & Sizing Telemetry
    maxPanelCount,
    yearlyEnergyDcKwh,
    maxSunshineHours,
    carbonOffsetKg,
    roofSegments,
    roofSegmentsList,
    activeSegmentIndex,
    activeRoofModel,
    isGeneratingGeometry,
    installerVerified,
    installerNotes,
    roofPipelineStatus,
    // Manual Drawing & Sizing Engine
    isDrawingRoof,
    drawnRoofPoints,
    roofBoundaryDrawn,
    roofAreaSqM,
    usableRoofPercent,
    usableRoofAreaSqM,
    panelWattageW,
    panelWidthM,
    panelHeightM,
    panelLengthM,
    panelSpacingM,
    setbackM,
    panelOrientation,
    peakSunHours,
    performanceRatio,
    dynamicShadingFactor,
    roofPitchDegrees,
    roofAzimuthDegrees,
    roofThicknessM,
    eaveHeightM,
    physicalPanelCount,
    estimatedPanelCount,
    estimatedSystemCapacityKwp,
    estimatedAnnualEnergyKwh,
    energyFormulaString,
    placedPanels,
    setbackPolygonPoints,
    // Obstructions & Rooftop Features
    obstructions,
    rooftopFeatures,
    isAddingObstruction,
    pendingObstructionType,
    // Shading Assessment
    shadingDate,
    shadingTime,
    shadingPreset,
    shadingAssessment,
    currentSolarPosition,
    // 3D Geometry & Area Verification
    generatedGeometry,
    babylonFootprintAreaM2,
    areaDiscrepancy,
    areaDifferencePercent,
    isGeometryAreaValid,
    boundaryValidationMessage,
    boundaryCrossings,
    isBoundarySelfIntersecting,
    recordDragStartSnapshot,
    // Debug & Diagnostics
    debugMetrics,
    debugPanelVisible,
    // Manual Roof Boundary Workflow
    roofAssessmentState,
    roofDrawingMode,
    installerEditsCount,
    pointHistory,
    pointRedoHistory,
    selectedVertexIndex,
    verifiedRoofData,
    startManualDrawRoof,
    enterEditPointsMode,
    toggleAddPointMode,
    undoRoofPointEdit,
    redoRoofPointEdit,
    insertRoofPointAt,
    deleteRoofPointAt,
    confirmRoofAssessment,
    redrawRoofManually,
    recalculateAreaFromPoints,
    // Actions
    centerOnDigosTrigger,
    centerMapOnDigos,
    selectProperty,
    selectCoordinates,
    clearSelection,
    startRoofAssessment,
    startDrawRoof,
    addRoofPoint,
    updateRoofPoint,
    undoLastRoofPoint,
    finishRoof,
    clearRoof,
    redrawRoof,
    recalculateAll,
    calculateSolar,
    autoArrangePanels,
    clearAllPanels,
    theoreticalMaxPanels,
    saveRoofModel,
    saveVerifiedRoofModel,
    verifyRoofData,
    togglePinMode,
    openClassificationModal,
    closeClassificationModal,
    applyManualClassification,
    addObstruction,
    updateObstruction,
    removeObstruction,
    calculateShadow
  }
}

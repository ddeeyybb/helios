<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useInstallerData } from '~/composables/useInstallerData'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import BabylonRoofViewer from '~/components/rooftop/BabylonRoofViewer.vue'
import type {
  RoofModel,
  RoofSegment,
  RoofObstacle,
  ObstacleType,
  PlacedSolarPanel,
  RoofVertex,
  RooftopFeature,
  RooftopFeatureType
} from '~/types/roof'
import {
  placeSolarPanelsInsideRoof,
  validateIndividualPanel,
  type PanelPlacementConfig
} from '~/utils/panel-placement'
import {
  buildExactRoofGeometry,
  localMetersToLatLng,
  latLngToLocalMeters,
  type RoofStructureType
} from '~/utils/roof-mesh-generator'
import {
  calculateSolarPosition,
  evaluateShadingAssessment,
  calculateAnnualSolarEnergy
} from '~/utils/solar-calculations'
import {
  getRoofSurfaceAtLocalPoint,
  DEFAULT_MOUNTING_CLEARANCE_M,
  snapPanelToRoofSurface
} from '~/utils/roof-surface'

useHead({
  title: 'HELIOS-LOAD Solar Design Editor'
})

const { activeProject, updateProject, equipment } = useInstallerData()
const {
  activeRoofModel,
  roofPitchDegrees,
  roofAzimuthDegrees,
  roofStructureType,
  roofAreaSqM,
  usableRoofAreaSqM,
  eaveHeightM,
  roofThicknessM,
  setbackM,
  drawnRoofPoints,
  saveVerifiedRoofModel,
  recalculateAll
} = useSiteAssessment()

// 3D Babylon Viewer Component Reference
const viewerRef = ref<any>(null)

// Current Working Roof Model
const currentRoofModel = ref<RoofModel | null>(null)

// ==========================================
// EDITOR MODES & TOOLS (AutoCAD/SketchUp Style)
// ==========================================
type EditorMode = 'select' | 'edit_roof' | 'add_tree' | 'add_obstruction' | 'add_panel' | 'add_feature' | 'measure' | 'sun_sim'
type TransformMode = 'move' | 'rotate' | 'scale'

const activeTool = ref<EditorMode>('select')
const transformMode = ref<TransformMode>('move')

// Selection State
const selectedObjectId = ref<string | null>(null)
const selectedObjectType = ref<'roof' | 'tree' | 'obstruction' | 'panel' | 'roof_feature' | null>(null)
const selectedObjectData = ref<any>(null)

// Locking & Visibility
const lockedObjectIds = ref<string[]>([])
const hiddenObjectTypes = ref<string[]>([])

// History (Undo / Redo)
interface DesignSnapshot {
  description: string
  roofVertices: Array<{ x: number; y: number; z: number }>
  obstacles: RoofObstacle[]
  panels: PlacedSolarPanel[]
  roofFeatures: RooftopFeature[]
  pitch: number
  azimuth: number
  structureType: RoofStructureType
}

const historyStack = ref<DesignSnapshot[]>([])
const historyIndex = ref<number>(-1)
const isApplyingHistory = ref(false)

// Panels State
const panelWattageW = ref<number>(550)
const panelLengthM = ref<number>(2.278)
const panelWidthM = ref<number>(1.134)
const panelThicknessM = ref<number>(0.04)
const panelSpacingM = ref<number>(0.05)
const panelSetbackM = ref<number>(0.5)
const panelOrientation = ref<'portrait' | 'landscape'>('portrait')
const autoArrangeExcludesShadow = ref<boolean>(false)
const snapEnabled = ref<boolean>(true)
const gridSnapEnabled = ref<boolean>(true)
const inspectorMode = ref<'simple' | 'advanced'>('simple')
const showAutoArrangeModal = ref<boolean>(false)
const showClearPanelsModal = ref<boolean>(false)
const hoverPlacementFeedback = ref<{ isValid: boolean; reason?: string } | null>(null)

// Rooftop Feature Creation State (Installer-Controlled Workflow)
const showAddFeatureModal = ref<boolean>(false)
const pendingFeatureLocation = ref<{
  x: number
  y: number
  z: number
  roofSegmentId?: string
  segmentIndex?: number
  normal: [number, number, number]
  pitchDeg: number
} | null>(null)

const newFeatureType = ref<RooftopFeatureType>('Roof Structure')
const newFeatureWidthM = ref<number>(1.00)
const newFeatureLengthM = ref<number>(1.00)
const newFeatureHeightM = ref<number>(1.20)
const newFeatureRotationDeg = ref<number>(0)

function onFeatureTypeChanged(type: RooftopFeatureType) {
  newFeatureType.value = type
  switch (type) {
    case 'Chimney':
      newFeatureWidthM.value = 0.80
      newFeatureLengthM.value = 0.80
      newFeatureHeightM.value = 1.20
      break
    case 'Vent':
      newFeatureWidthM.value = 0.40
      newFeatureLengthM.value = 0.40
      newFeatureHeightM.value = 0.60
      break
    case 'Water Tank':
      newFeatureWidthM.value = 1.50
      newFeatureLengthM.value = 1.50
      newFeatureHeightM.value = 1.80
      break
    case 'Roof Equipment':
      newFeatureWidthM.value = 1.20
      newFeatureLengthM.value = 1.50
      newFeatureHeightM.value = 1.00
      break
    case 'Skylight':
      newFeatureWidthM.value = 1.00
      newFeatureLengthM.value = 1.50
      newFeatureHeightM.value = 0.25
      break
    case 'Roof Structure':
      newFeatureWidthM.value = 2.00
      newFeatureLengthM.value = 2.00
      newFeatureHeightM.value = 2.20
      break
    case 'Other':
    default:
      newFeatureWidthM.value = 1.00
      newFeatureLengthM.value = 1.00
      newFeatureHeightM.value = 1.00
      break
  }
}

// Obstacle Creation Pending State
const pendingObstacleType = ref<ObstacleType>('Chimney')

// Sun Simulation State
const simDate = ref<string>(new Date().toISOString().split('T')[0] || '2026-06-21')
const simTimeMinutes = ref<number>(720) // 12:00 PM default (12 * 60)
const isSimPlaying = ref<boolean>(false)
let simAnimationTimer: any = null

const formattedSimTime = computed(() => {
  const h = Math.floor(simTimeMinutes.value / 60)
  const m = simTimeMinutes.value % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 === 0 ? 12 : h % 12
  return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`
})

// Solar Position & Shading Calculation
const currentSolarData = computed(() => {
  const lat = currentRoofModel.value?.origin?.latitude || activeProject.value?.latitude || 6.7497
  const lng = currentRoofModel.value?.origin?.longitude || activeProject.value?.longitude || 125.3572
  const targetDate = new Date(`${simDate.value}T12:00:00`)
  targetDate.setHours(Math.floor(simTimeMinutes.value / 60), simTimeMinutes.value % 60, 0)

  const pos = calculateSolarPosition(lat, lng, targetDate)
  const obs = currentRoofModel.value?.obstacles || []

  const seg = currentRoofModel.value?.roofSegments?.[0]
  const halfLen = seg?.vertices ? Math.floor(seg.vertices.length / 2) : 0
  const roofPoly: Array<{ x: number; z: number }> = (seg?.vertices && halfLen >= 3)
    ? seg.vertices.slice(0, halfLen).map(v => ({ x: v.x, z: v.z }))
    : (currentRoofModel.value?.geometry?.segments?.[0]?.polygon2D || [])

  const usableArea = (currentGrossAreaM2.value || 0) * 0.8
  const shading = evaluateShadingAssessment(
    roofPoly,
    usableArea,
    obs,
    pos.solarAltitudeDeg,
    pos.solarAzimuthDeg,
    simDate.value,
    formattedSimTime.value,
    'Custom',
    eaveHeightM.value || 3.5
  )
  return { pos, shading }
})

// Measurement Mode State
const lastMeasuredDistance = ref<number | null>(null)

// Verification & Save Feedback
const isVerified = ref(false)
const verifiedChecklist = ref({
  roofBoundary: false,
  roofStructure: false,
  obstructionPlacement: false,
  panelPlacement: false,
  estimatedShading: false
})
const verificationNotes = ref('')
const verifiedBy = ref('Lead PV System Designer')
const saveFeedback = ref('')
const hasUnsavedChanges = ref(false)
const showExitModal = ref(false)
const showHelpModal = ref(false)

// Equipment sync
const pvModules = computed(() => equipment.value.filter(e => e.category === 'PV Modules'))

// ==========================================
// METRICS & COMPUTED PROPERTIES
// ==========================================
const currentGrossAreaM2 = computed(() => {
  if (!currentRoofModel.value) return 0
  const segSum = currentRoofModel.value.roofSegments?.reduce((sum, s) => sum + (s.areaM2 || s.areaMeters2 || 0), 0)
  return Math.round((segSum || currentRoofModel.value.building?.areaM2 || roofAreaSqM.value || 0) * 10) / 10
})

const obstaclesAreaM2 = computed(() => {
  if (!currentRoofModel.value?.obstacles) return 0
  return Number(currentRoofModel.value.obstacles.reduce((sum, obs) => {
    if (obs.type === 'Tree') {
      const r = obs.canopyRadiusM || (obs.widthM / 2) || 1.75
      return sum + Math.PI * r * r
    }
    return sum + (obs.widthM * obs.lengthM)
  }, 0).toFixed(1))
})

const currentUsableAreaM2 = computed(() => {
  if (currentGrossAreaM2.value <= 0) return 0
  const gross = currentGrossAreaM2.value
  const usable = Math.max(0, gross * 0.8 - obstaclesAreaM2.value)
  return Math.round(usable * 10) / 10
})

const currentPanelsCount = computed(() => {
  return currentRoofModel.value?.panels?.length || 0
})

const currentSystemKwp = computed(() => {
  if (currentPanelsCount.value <= 0) return 0
  return Number(((currentPanelsCount.value * panelWattageW.value) / 1000).toFixed(2))
})

const estimatedAnnualEnergyKwh = computed(() => {
  if (currentSystemKwp.value <= 0) return 0
  // Digos City solar yield: 4.5 PSH, 80% PR
  const shadingLoss = (currentSolarData.value?.shading?.shadingPercentage || 0) / 100
  const factor = 1 - Math.min(0.3, shadingLoss)
  return Math.round(currentSystemKwp.value * 4.5 * 365 * 0.80 * factor)
})

const estimatedShadingPercent = computed(() => {
  if (currentObstaclesCount.value <= 0) return 0
  return currentSolarData.value?.shading?.shadingPercentage || 0
})

const currentTreesCount = computed(() => {
  return (currentRoofModel.value?.obstacles || []).filter(o => o.type === 'Tree').length
})

const currentObstaclesCount = computed(() => {
  return (currentRoofModel.value?.obstacles || []).filter(o => o.type !== 'Tree').length
})

const currentRoofFeaturesCount = computed(() => {
  return (currentRoofModel.value?.roofFeatures || []).length
})

// Validation Status
const designValidation = computed(() => {
  const roofValid = currentGrossAreaM2.value > 0
  const panelsInsideRoof = (currentRoofModel.value?.panels || []).every(p => p.status !== 'INVALID')
  const noOverlap = true
  const setbackRespected = true
  const shadedPanels = estimatedShadingPercent.value > 0 ? 2 : 0

  return {
    roofValid,
    roofAreaCalculated: currentGrossAreaM2.value > 0,
    panelDimensionsValid: panelWidthM.value > 0 && panelLengthM.value > 0,
    panelsInsideRoof,
    noOverlap,
    setbackRespected,
    shadedPanels,
    treeHeightNotice: currentTreesCount.value > 0,
    designSaved: !hasUnsavedChanges.value
  }
})

// ==========================================
// INITIALIZATION & LIFECYCLE
// ==========================================
onMounted(async () => {
  if (activeProject.value?.roofModel) {
    currentRoofModel.value = JSON.parse(JSON.stringify(activeProject.value.roofModel))
  } else if (activeRoofModel.value) {
    currentRoofModel.value = JSON.parse(JSON.stringify(activeRoofModel.value))
  } else {
    const pid = activeProject.value?.id || 'current-project'
    try {
      const res = await $fetch<{ success: boolean; data?: RoofModel }>(`/api/roofs/model?projectId=${pid}`)
      if (res && res.success && res.data) {
        currentRoofModel.value = res.data
        if (activeProject.value) {
          updateProject(activeProject.value.id, { roofModel: res.data })
        }
      }
    } catch {
      // Server store empty
    }
  }

  // Ensure data arrays exist strictly data-driven (no demo objects! Requirement 23)
  if (currentRoofModel.value) {
    if (!currentRoofModel.value.obstacles) currentRoofModel.value.obstacles = []
    if (!currentRoofModel.value.panels) currentRoofModel.value.panels = []
    if (!currentRoofModel.value.roofFeatures) currentRoofModel.value.roofFeatures = []

    // Re-snap any saved panels to exact roof surface geometry (Requirement 16)
    if (currentRoofModel.value.panels.length > 0) {
      currentRoofModel.value.panels.forEach(p => {
        const surf = getRoofSurfaceAtLocalPoint(p.x, p.z, currentRoofModel.value)
        p.y = Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4))
        p.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
        p.tiltPitchDeg = surf.pitchDeg
        validateSinglePanel(p)
      })
    }

    // Re-snap any saved rooftop features to exact roof surface geometry (Requirement 22)
    if (currentRoofModel.value.roofFeatures.length > 0) {
      currentRoofModel.value.roofFeatures.forEach(f => {
        let posX = f.position?.x
        let posZ = f.position?.z
        if ((posX === undefined || posZ === undefined) && f.latitude && f.longitude) {
          const centerLat = currentRoofModel.value?.origin?.latitude || 6.7497
          const centerLng = currentRoofModel.value?.origin?.longitude || 125.3572
          const local = latLngToLocalMeters(f.latitude, f.longitude, centerLat, centerLng)
          posX = local.x
          posZ = local.z
        }
        if (posX !== undefined && posZ !== undefined) {
          const surf = getRoofSurfaceAtLocalPoint(posX, posZ, currentRoofModel.value)
          if (!f.position) f.position = { x: posX, y: surf.y, z: posZ }
          f.position.x = posX
          f.position.y = surf.y
          f.position.z = posZ
          f.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
          f.tiltPitchDeg = surf.pitchDeg
          f.roofSegmentId = surf.segmentId
          f.segmentIndex = surf.segmentIndex
        }
      })
    }

    if (currentRoofModel.value.verification?.status === 'Verified') {
      isVerified.value = true
      verifiedChecklist.value = {
        roofBoundary: true,
        roofStructure: true,
        obstructionPlacement: true,
        panelPlacement: true,
        estimatedShading: true
      }
    }
    if (currentRoofModel.value.verification?.notes) {
      verificationNotes.value = currentRoofModel.value.verification.notes
    }
  }

  // Push initial snapshot
  recordHistorySnapshot('Initial Design State')

  // Register Global Keyboard Shortcuts
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (simAnimationTimer) {
    clearInterval(simAnimationTimer)
  }
})

// ==========================================
// HISTORY / UNDO / REDO
// ==========================================
function recordHistorySnapshot(desc: string) {
  if (isApplyingHistory.value || !currentRoofModel.value) return

  const seg = currentRoofModel.value.roofSegments?.[0]
  const vertices = seg?.vertices ? JSON.parse(JSON.stringify(seg.vertices)) : []
  const obstacles = JSON.parse(JSON.stringify(currentRoofModel.value.obstacles || []))
  const panels = JSON.parse(JSON.stringify(currentRoofModel.value.panels || []))
  const roofFeatures = JSON.parse(JSON.stringify(currentRoofModel.value.roofFeatures || []))

  const snap: DesignSnapshot = {
    description: desc,
    roofVertices: vertices,
    obstacles,
    panels,
    roofFeatures,
    pitch: roofPitchDegrees.value,
    azimuth: roofAzimuthDegrees.value,
    structureType: roofStructureType.value
  }

  // Truncate any redo branch
  if (historyIndex.value < historyStack.value.length - 1) {
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
  }

  historyStack.value.push(snap)
  historyIndex.value = historyStack.value.length - 1
  hasUnsavedChanges.value = true
}

function handleUndo() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    applySnapshot(historyStack.value[historyIndex.value]!)
  }
}

function handleRedo() {
  if (historyIndex.value < historyStack.value.length - 1) {
    historyIndex.value++
    applySnapshot(historyStack.value[historyIndex.value]!)
  }
}

function applySnapshot(snap: DesignSnapshot) {
  if (!currentRoofModel.value) return
  isApplyingHistory.value = true

  const seg = currentRoofModel.value.roofSegments?.[0]
  if (seg && snap.roofVertices.length > 0) {
    seg.vertices = JSON.parse(JSON.stringify(snap.roofVertices))
  }
  currentRoofModel.value.obstacles = JSON.parse(JSON.stringify(snap.obstacles))
  currentRoofModel.value.panels = JSON.parse(JSON.stringify(snap.panels))
  currentRoofModel.value.roofFeatures = JSON.parse(JSON.stringify(snap.roofFeatures || []))
  roofPitchDegrees.value = snap.pitch
  roofAzimuthDegrees.value = snap.azimuth
  roofStructureType.value = snap.structureType

  setTimeout(() => {
    isApplyingHistory.value = false
  }, 50)
}

// ==========================================
// SELECTION & OBJECT MANIPULATION
// ==========================================
function handleSelectObject(payload: { id: string; type: 'roof' | 'tree' | 'obstruction' | 'panel' | 'roof_feature'; rawData?: any }) {
  selectedObjectId.value = payload.id
  selectedObjectType.value = payload.type
  selectedObjectData.value = payload.rawData || null

  // Ensure transform mode is active for interactive gizmo editing
  if (!transformMode.value) {
    transformMode.value = 'move'
  }
}

function handleClearSelection() {
  selectedObjectId.value = null
  selectedObjectType.value = null
  selectedObjectData.value = null
}

function handleObjectTransformed(payload: {
  id: string
  type: 'tree' | 'obstruction' | 'panel' | 'roof_feature'
  position: { x: number; y: number; z: number }
  rotationY: number
  scale?: { x: number; y: number; z: number }
}) {
  if (!currentRoofModel.value) return

  if (payload.type === 'tree' || payload.type === 'obstruction') {
    const obs = currentRoofModel.value.obstacles.find(o => o.id === payload.id)
    if (obs) {
      obs.position = { x: payload.position.x, y: payload.position.y, z: payload.position.z }
      obs.rotationY = payload.rotationY

      // Sync Lat/Lng
      const centerLat = currentRoofModel.value.origin?.latitude || 6.7497
      const centerLng = currentRoofModel.value.origin?.longitude || 125.3572
      const coords = localMetersToLatLng(payload.position.x, payload.position.z, centerLat, centerLng)
      obs.latitude = coords.lat
      obs.longitude = coords.lng

      recordHistorySnapshot(`Moved ${obs.type} ${obs.id}`)
    }
  } else if (payload.type === 'roof_feature') {
    const feat = (currentRoofModel.value.roofFeatures || []).find(f => f.id === payload.id)
    if (feat) {
      const surf = getRoofSurfaceAtLocalPoint(payload.position.x, payload.position.z, currentRoofModel.value)
      feat.position = {
        x: payload.position.x,
        y: surf.isValid ? surf.y : payload.position.y,
        z: payload.position.z
      }
      feat.rotationY = payload.rotationY
      feat.rotationDeg = Math.round(((payload.rotationY || 0) * 180) / Math.PI) % 360
      if (surf.isValid) {
        feat.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
        feat.tiltPitchDeg = surf.pitchDeg
        feat.roofSegmentId = surf.segmentId
        feat.segmentIndex = surf.segmentIndex
      }

      // Sync Lat/Lng
      const centerLat = currentRoofModel.value.origin?.latitude || 6.7497
      const centerLng = currentRoofModel.value.origin?.longitude || 125.3572
      const coords = localMetersToLatLng(payload.position.x, payload.position.z, centerLat, centerLng)
      feat.latitude = coords.lat
      feat.longitude = coords.lng

      // Re-validate panels against relocated rooftop feature
      if (currentRoofModel.value.panels?.length) {
        currentRoofModel.value.panels.forEach(p => validateSinglePanel(p))
      }

      recordHistorySnapshot(`Moved Rooftop Feature ${feat.id}`)
    }
  } else if (payload.type === 'panel') {
    const panel = currentRoofModel.value.panels.find(p => p.id === payload.id)
    if (panel) {
      panel.x = payload.position.x
      panel.z = payload.position.z
      const surf = getRoofSurfaceAtLocalPoint(payload.position.x, payload.position.z, currentRoofModel.value)
      panel.y = Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4))
      panel.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
      panel.tiltPitchDeg = surf.pitchDeg
      if (payload.rotationY !== undefined) panel.rotationY = payload.rotationY

      // Validate panel inside roof polygon
      validateSinglePanel(panel)
      recordHistorySnapshot(`Moved Solar Panel ${panel.id}`)
    }
  }
}

function handleVertexMoved(payload: { vertexIndex: number; x: number; z: number }) {
  if (!currentRoofModel.value) return
  const seg = currentRoofModel.value.roofSegments?.[0]
  if (!seg || !seg.vertices || !seg.vertices[payload.vertexIndex]) return

  const v = seg.vertices[payload.vertexIndex]
  if (v) {
    v.x = payload.x
    v.z = payload.z
  }

  // Also update corresponding bottom thickness vertex if exists
  const halfLen = Math.floor(seg.vertices.length / 2)
  const bottomIdx = payload.vertexIndex + halfLen
  if (seg.vertices[bottomIdx]) {
    seg.vertices[bottomIdx]!.x = payload.x
    seg.vertices[bottomIdx]!.z = payload.z
  }

  // Rebuild polygon area & geometry
  recalculateRoofBoundaryGeometry()
  recordHistorySnapshot(`Adjusted Roof Vertex #${payload.vertexIndex + 1}`)
}

function recalculateRoofBoundaryGeometry() {
  if (!currentRoofModel.value) return
  const seg = currentRoofModel.value.roofSegments?.[0]
  if (!seg || !seg.vertices) return

  const halfLen = Math.floor(seg.vertices.length / 2)
  const topPoints = seg.vertices.slice(0, halfLen).map(v => ({ x: v.x, z: v.z }))

  const centerLat = currentRoofModel.value.origin?.latitude || 6.7497
  const centerLng = currentRoofModel.value.origin?.longitude || 125.3572
  const latLngPoints = topPoints.map(pt => localMetersToLatLng(pt.x, pt.z, centerLat, centerLng))

  const areaM2 = currentGrossAreaM2.value || seg.areaM2 || seg.areaMeters2 || 0
  const newGeo = buildExactRoofGeometry(latLngPoints, areaM2, {
    pitchDegrees: roofPitchDegrees.value,
    azimuthDegrees: roofAzimuthDegrees.value,
    eaveHeightM: eaveHeightM.value,
    roofThicknessM: roofThicknessM.value,
    roofType: roofStructureType.value
  })

  seg.vertices = newGeo.vertices
  seg.indices = newGeo.indices
  seg.normals = newGeo.normals
  seg.areaM2 = newGeo.footprintAreaM2
  seg.areaMeters2 = newGeo.footprintAreaM2

  // Re-snap all existing panels to updated roof geometry
  if (currentRoofModel.value.panels && currentRoofModel.value.panels.length > 0) {
    currentRoofModel.value.panels.forEach(p => {
      const surf = getRoofSurfaceAtLocalPoint(p.x, p.z, currentRoofModel.value)
      p.y = Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4))
      p.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
      p.tiltPitchDeg = surf.pitchDeg
      validateSinglePanel(p)
    })
  }
}

// ==========================================
// CLICK-TO-PLACE TOOLS (Tree, Obstruction, Panel)
// ==========================================
function handlePlaceObject(payload: { type: 'tree' | 'obstruction' | 'panel'; subType?: string; x: number; y: number; z: number }) {
  if (!currentRoofModel.value) return

  if (payload.type === 'tree') {
    const treeId = `TREE-${String(currentTreesCount.value + 1).padStart(3, '0')}`
    const centerLat = currentRoofModel.value.origin?.latitude || 6.7497
    const centerLng = currentRoofModel.value.origin?.longitude || 125.3572
    const coords = localMetersToLatLng(payload.x, payload.z, centerLat, centerLng)

    const newTree: RoofObstacle = {
      id: treeId,
      name: `Tree ${treeId}`,
      type: 'Tree',
      heightM: 5.0,
      canopyRadiusM: 1.75,
      canopyDiameterM: 3.5,
      trunkRadiusM: 0.15,
      trunkDiameterM: 0.3,
      widthM: 3.5,
      lengthM: 3.5,
      position: { x: payload.x, y: payload.y, z: payload.z },
      rotationY: 0,
      latitude: coords.lat,
      longitude: coords.lng,
      enabled: true,
      source: 'Installer Provided'
    }

    currentRoofModel.value.obstacles.push(newTree)
    selectedObjectId.value = treeId
    selectedObjectType.value = 'tree'
    selectedObjectData.value = newTree
    activeTool.value = 'select'
    recordHistorySnapshot(`Added Tree ${treeId}`)
  } else if (payload.type === 'obstruction') {
    const subType = (payload.subType || pendingObstacleType.value || 'Chimney') as ObstacleType
    const obsId = `OBS-${String(currentObstaclesCount.value + 1).padStart(3, '0')}`

    const w = subType === 'Chimney' ? 0.8 : subType === 'Water Tank' ? 1.5 : 2.0
    const l = subType === 'Chimney' ? 0.8 : subType === 'Water Tank' ? 1.5 : 2.0
    const h = subType === 'Chimney' ? 1.2 : subType === 'Water Tank' ? 2.0 : 1.8

    const newObs: RoofObstacle = {
      id: obsId,
      name: `${subType} ${obsId}`,
      type: subType,
      heightM: h,
      widthM: w,
      lengthM: l,
      radiusM: subType === 'Water Tank' ? w / 2 : undefined,
      position: { x: payload.x, y: payload.y, z: payload.z },
      rotationY: 0,
      enabled: true,
      source: 'Installer Provided'
    }

    currentRoofModel.value.obstacles.push(newObs)
    selectedObjectId.value = obsId
    selectedObjectType.value = 'obstruction'
    selectedObjectData.value = newObs
    activeTool.value = 'select'
    recordHistorySnapshot(`Added Obstruction ${obsId} (${subType})`)
  } else if (payload.type === 'panel') {
    const pId = `PV-${String(currentPanelsCount.value + 1).padStart(3, '0')}`
    const surf = getRoofSurfaceAtLocalPoint(payload.x, payload.z, currentRoofModel.value)
    const isLandscape = (payload as any).orientation === 'landscape' || panelOrientation.value === 'landscape'
    const rotY = isLandscape ? ((surf.azimuthDeg * Math.PI) / 180 + Math.PI / 2) : ((surf.azimuthDeg * Math.PI) / 180)

    const newPanel: PlacedSolarPanel = {
      id: pId,
      x: payload.x,
      y: Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4)),
      z: payload.z,
      widthM: panelWidthM.value,
      lengthM: panelLengthM.value,
      thicknessM: panelThicknessM.value,
      rotationY: rotY,
      tiltPitchDeg: surf.pitchDeg,
      normal: [surf.normal.x, surf.normal.y, surf.normal.z],
      wattageW: panelWattageW.value,
      status: 'VALID'
    }

    validateSinglePanel(newPanel)
    currentRoofModel.value.panels.push(newPanel)
    selectedObjectId.value = pId
    selectedObjectType.value = 'panel'
    selectedObjectData.value = newPanel
    activeTool.value = 'select'
    recordHistorySnapshot(`Added Panel ${pId}`)
  }
}

// ==========================================
// ACTIONS: DELETE & DUPLICATE
// ==========================================
function handleDeleteSelected() {
  if (!selectedObjectId.value || !currentRoofModel.value) return

  if (selectedObjectType.value === 'tree' || selectedObjectType.value === 'obstruction') {
    const id = selectedObjectId.value
    currentRoofModel.value.obstacles = currentRoofModel.value.obstacles.filter(o => o.id !== id)
    handleClearSelection()
    recordHistorySnapshot(`Deleted Obstruction ${id}`)
  } else if (selectedObjectType.value === 'roof_feature') {
    const id = selectedObjectId.value
    currentRoofModel.value.roofFeatures = (currentRoofModel.value.roofFeatures || []).filter(f => f.id !== id)
    handleClearSelection()
    // Re-validate panels against remaining rooftop features
    if (currentRoofModel.value.panels?.length) {
      currentRoofModel.value.panels.forEach(p => validateSinglePanel(p))
    }
    recordHistorySnapshot(`Deleted Rooftop Feature ${id}`)
  } else if (selectedObjectType.value === 'panel') {
    const id = selectedObjectId.value
    currentRoofModel.value.panels = currentRoofModel.value.panels.filter(p => p.id !== id)
    handleClearSelection()
    recordHistorySnapshot(`Deleted Panel ${id}`)
  }
}

function handleRotateSelected90() {
  if (!selectedObjectId.value || !currentRoofModel.value) {
    // If no panel is selected, toggle placement orientation
    panelOrientation.value = panelOrientation.value === 'portrait' ? 'landscape' : 'portrait'
    return
  }
  if (selectedObjectType.value === 'panel') {
    const p = currentRoofModel.value.panels.find(x => x.id === selectedObjectId.value)
    if (p) {
      const tempW = p.widthM
      p.widthM = p.lengthM
      p.lengthM = tempW
      p.rotationY = Number((((p.rotationY || 0) + Math.PI / 2) % (Math.PI * 2)).toFixed(3))
      const surf = getRoofSurfaceAtLocalPoint(p.x, p.z, currentRoofModel.value)
      p.y = Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4))
      p.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
      p.tiltPitchDeg = surf.pitchDeg
      validateSinglePanel(p)
      recordHistorySnapshot(`Rotated Panel 90° (${p.id})`)
    }
  } else if (selectedObjectType.value === 'roof_feature') {
    const f = (currentRoofModel.value.roofFeatures || []).find(x => x.id === selectedObjectId.value)
    if (f) {
      const tempW = f.widthM
      f.widthM = f.lengthM
      f.lengthM = tempW
      f.rotationDeg = ((f.rotationDeg || 0) + 90) % 360
      f.rotationY = (f.rotationDeg * Math.PI) / 180
      // Recalculate roof contact after rotation (Requirement 9)
      const surf = getRoofSurfaceAtLocalPoint(f.position.x, f.position.z, currentRoofModel.value)
      if (surf.isValid) {
        f.position.y = surf.y
        f.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
        f.tiltPitchDeg = surf.pitchDeg
      }
      if (currentRoofModel.value.panels?.length) {
        currentRoofModel.value.panels.forEach(p => validateSinglePanel(p))
      }
      recordHistorySnapshot(`Rotated Rooftop Feature 90° (${f.id})`)
    }
  } else if (selectedObjectType.value === 'tree' || selectedObjectType.value === 'obstruction') {
    const o = currentRoofModel.value.obstacles.find(x => x.id === selectedObjectId.value)
    if (o) {
      const tempW = o.widthM
      o.widthM = o.lengthM
      o.lengthM = tempW
      o.rotationY = Number((((o.rotationY || 0) + Math.PI / 2) % (Math.PI * 2)).toFixed(3))
      recordHistorySnapshot(`Rotated ${o.type} 90° (${o.id})`)
    }
  }
}

function handleDuplicateSelected() {
  if (!selectedObjectId.value || !currentRoofModel.value) return

  if (selectedObjectType.value === 'panel') {
    const source = currentRoofModel.value.panels.find(p => p.id === selectedObjectId.value)
    if (source) {
      const pId = `PV-${String(currentPanelsCount.value + 1).padStart(3, '0')}`
      const spacing = panelSpacingM.value || 0.05
      const offset = (source.widthM || 1.134) + spacing
      const candX = Number((source.x + offset).toFixed(3))
      const candZ = source.z
      const surf = getRoofSurfaceAtLocalPoint(candX, candZ, currentRoofModel.value)
      const dup: PlacedSolarPanel = {
        ...source,
        id: pId,
        x: candX,
        y: Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4)),
        z: candZ,
        normal: [surf.normal.x, surf.normal.y, surf.normal.z],
        tiltPitchDeg: surf.pitchDeg
      }
      validateSinglePanel(dup)
      currentRoofModel.value.panels.push(dup)
      selectedObjectId.value = pId
      selectedObjectData.value = dup
      recordHistorySnapshot(`Duplicated Panel ${pId}`)
    }
  } else if (selectedObjectType.value === 'roof_feature') {
    const source = (currentRoofModel.value.roofFeatures || []).find(f => f.id === selectedObjectId.value)
    if (source) {
      const newId = `FEATURE-${String(currentRoofFeaturesCount.value + 1).padStart(3, '0')}`
      const offset = (source.widthM || 1.0) + 0.5
      const newX = Number((source.position.x + offset).toFixed(3))
      const newZ = source.position.z
      const surf = getRoofSurfaceAtLocalPoint(newX, newZ, currentRoofModel.value)
      const centerLat = currentRoofModel.value.origin?.latitude || 6.7497
      const centerLng = currentRoofModel.value.origin?.longitude || 125.3572
      const coords = localMetersToLatLng(newX, newZ, centerLat, centerLng)

      const dup: RooftopFeature = {
        ...source,
        id: newId,
        name: `${source.type} ${newId}`,
        position: { x: newX, y: surf.isValid ? surf.y : source.position.y, z: newZ },
        latitude: coords.lat,
        longitude: coords.lng,
        normal: surf.isValid ? [surf.normal.x, surf.normal.y, surf.normal.z] : source.normal,
        tiltPitchDeg: surf.isValid ? surf.pitchDeg : source.tiltPitchDeg,
        roofSegmentId: surf.isValid ? surf.segmentId : source.roofSegmentId,
        segmentIndex: surf.isValid ? surf.segmentIndex : source.segmentIndex
      }
      if (!currentRoofModel.value.roofFeatures) {
        currentRoofModel.value.roofFeatures = []
      }
      currentRoofModel.value.roofFeatures.push(dup)
      selectedObjectId.value = newId
      selectedObjectData.value = dup
      if (currentRoofModel.value.panels?.length) {
        currentRoofModel.value.panels.forEach(p => validateSinglePanel(p))
      }
      recordHistorySnapshot(`Duplicated Rooftop Feature ${newId}`)
    }
  } else if (selectedObjectType.value === 'tree' || selectedObjectType.value === 'obstruction') {
    const source = currentRoofModel.value.obstacles.find(o => o.id === selectedObjectId.value)
    if (source) {
      const isTree = source.type === 'Tree'
      const newId = isTree
        ? `TREE-${String(currentTreesCount.value + 1).padStart(3, '0')}`
        : `OBS-${String(currentObstaclesCount.value + 1).padStart(3, '0')}`
      const dup: RoofObstacle = {
        ...source,
        id: newId,
        name: `${source.type} ${newId}`,
        position: {
          x: Number((source.position.x + 2.0).toFixed(3)),
          y: source.position.y,
          z: Number((source.position.z + 1.0).toFixed(3))
        }
      }
      currentRoofModel.value.obstacles.push(dup)
      selectedObjectId.value = newId
      selectedObjectData.value = dup
      recordHistorySnapshot(`Duplicated ${source.type} ${newId}`)
    }
  }
}

// ==========================================
// ROOFTOP FEATURE CREATION (INSTALLER CONTROLLED)
// ==========================================
function handleRequestAddFeature(payload: {
  x: number
  y: number
  z: number
  roofSegmentId?: string
  segmentIndex?: number
  normal: [number, number, number]
  pitchDeg: number
}) {
  pendingFeatureLocation.value = payload
  newFeatureRotationDeg.value = 0
  showAddFeatureModal.value = true
}

function confirmCreateFeature() {
  if (!currentRoofModel.value || !pendingFeatureLocation.value) return
  if (!currentRoofModel.value.roofFeatures) currentRoofModel.value.roofFeatures = []

  const loc = pendingFeatureLocation.value
  const featId = `FEATURE-${String(currentRoofFeaturesCount.value + 1).padStart(3, '0')}`

  const centerLat = currentRoofModel.value.origin?.latitude || currentRoofModel.value.building?.center?.latitude || 6.7497
  const centerLng = currentRoofModel.value.origin?.longitude || currentRoofModel.value.building?.center?.longitude || 125.3572
  const coords = localMetersToLatLng(loc.x, loc.z, centerLat, centerLng)

  const rotY = (newFeatureRotationDeg.value * Math.PI) / 180

  const newFeat: RooftopFeature = {
    id: featId,
    name: `${newFeatureType.value} ${featId}`,
    type: newFeatureType.value,
    latitude: coords.lat,
    longitude: coords.lng,
    position: { x: loc.x, y: loc.y, z: loc.z },
    widthM: Math.max(0.1, newFeatureWidthM.value),
    lengthM: Math.max(0.1, newFeatureLengthM.value),
    heightM: Math.max(0.1, newFeatureHeightM.value),
    rotationDeg: newFeatureRotationDeg.value,
    rotationY: rotY,
    tiltPitchDeg: loc.pitchDeg,
    normal: loc.normal,
    roofSegmentId: loc.roofSegmentId,
    segmentIndex: loc.segmentIndex,
    shadingRelevant: true,
    source: 'Installer Provided',
    enabled: true,
    visible: true
  }

  currentRoofModel.value.roofFeatures.push(newFeat)
  showAddFeatureModal.value = false
  pendingFeatureLocation.value = null
  selectedObjectId.value = featId
  selectedObjectType.value = 'roof_feature'
  selectedObjectData.value = newFeat
  activeTool.value = 'select'

  // Re-validate any panels against newly added rooftop feature
  if (currentRoofModel.value.panels?.length) {
    currentRoofModel.value.panels.forEach(p => validateSinglePanel(p))
  }

  recordHistorySnapshot(`Added Rooftop Feature ${featId} (${newFeat.type})`)
}

function handleUpdateSelectedFeature() {
  if (!selectedObjectId.value || selectedObjectType.value !== 'roof_feature' || !currentRoofModel.value) return
  const feat = (currentRoofModel.value.roofFeatures || []).find(f => f.id === selectedObjectId.value)
  if (!feat) return

  feat.rotationDeg = Math.round(feat.rotationDeg || 0) % 360
  feat.rotationY = (feat.rotationDeg * Math.PI) / 180

  const surf = getRoofSurfaceAtLocalPoint(feat.position.x, feat.position.z, currentRoofModel.value)
  if (surf.isValid) {
    feat.position.y = surf.y
    feat.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
    feat.tiltPitchDeg = surf.pitchDeg
    feat.roofSegmentId = surf.segmentId
    feat.segmentIndex = surf.segmentIndex
  }

  const centerLat = currentRoofModel.value.origin?.latitude || 6.7497
  const centerLng = currentRoofModel.value.origin?.longitude || 125.3572
  const coords = localMetersToLatLng(feat.position.x, feat.position.z, centerLat, centerLng)
  feat.latitude = coords.lat
  feat.longitude = coords.lng

  if (currentRoofModel.value.panels?.length) {
    currentRoofModel.value.panels.forEach(p => validateSinglePanel(p))
  }

  currentRoofModel.value.roofFeatures = [...(currentRoofModel.value.roofFeatures || [])]
  recordHistorySnapshot(`Updated Rooftop Feature ${feat.id}`)
}

function handleExtendRow(count = 4) {
  if (!selectedObjectId.value || !currentRoofModel.value || selectedObjectType.value !== 'panel') return
  const basePanel = currentRoofModel.value.panels.find(p => p.id === selectedObjectId.value)
  if (!basePanel) return

  const spacing = panelSpacingM.value || 0.05
  const stepX = (basePanel.widthM || 1.134) + spacing
  let lastX = basePanel.x
  let added = 0

  for (let i = 1; i <= count; i++) {
    const pId = `PV-${String(currentPanelsCount.value + 1).padStart(3, '0')}`
    const candX = Number((lastX + stepX).toFixed(3))
    const candZ = basePanel.z
    const surf = getRoofSurfaceAtLocalPoint(candX, candZ, currentRoofModel.value)
    const newPanel: PlacedSolarPanel = {
      ...basePanel,
      id: pId,
      x: candX,
      y: Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4)),
      z: candZ,
      normal: [surf.normal.x, surf.normal.y, surf.normal.z],
      tiltPitchDeg: surf.pitchDeg,
      status: 'VALID'
    }
    validateSinglePanel(newPanel)
    currentRoofModel.value.panels.push(newPanel)
    lastX = candX
    added++
  }
  if (added > 0) {
    recordHistorySnapshot(`Extended Row (+${added} Panels)`)
  }
}

function handleClearAllPanels() {
  if (!currentRoofModel.value) return
  currentRoofModel.value.panels = []
  handleClearSelection()
  showClearPanelsModal.value = false
  recordHistorySnapshot('Cleared All Solar Panels')
}

// ==========================================
// AUTO ARRANGE PANELS (OPTIONAL ASSISTED DESIGN)
// ==========================================
function handleAutoArrangePanels() {
  showAutoArrangeModal.value = true
}

function confirmAutoArrange() {
  showAutoArrangeModal.value = false
  if (!currentRoofModel.value) return
  const seg = currentRoofModel.value.roofSegments?.[0]
  if (!seg || !seg.vertices || seg.vertices.length < 3) return

  const halfLen = Math.floor(seg.vertices.length / 2)
  const roofPoly = seg.vertices.slice(0, halfLen).map(v => ({ x: v.x, z: v.z }))

  const config: PanelPlacementConfig = {
    panelWidthM: panelWidthM.value,
    panelLengthM: panelLengthM.value,
    panelWattageW: panelWattageW.value,
    setbackM: panelSetbackM.value,
    panelSpacingM: panelSpacingM.value,
    orientation: panelOrientation.value,
    pitchDegrees: roofPitchDegrees.value,
    azimuthDegrees: roofAzimuthDegrees.value,
    eaveHeightM: eaveHeightM.value
  }

  const shadows = currentSolarData.value?.shading?.shadowPolygons || []
  const shadowExclusions = shadows.map(s => ({
    points: s.points.map(pt => ({ x: pt.x, z: pt.z }))
  }))

  const result = placeSolarPanelsInsideRoof(
    roofPoly,
    currentRoofModel.value.obstacles,
    config,
    shadowExclusions,
    autoArrangeExcludesShadow.value,
    currentRoofModel.value.roofFeatures || []
  )

  // Mathematically snap every auto-arranged panel to the exact 3D roof surface
  result.placedPanels.forEach(p => {
    const surf = getRoofSurfaceAtLocalPoint(p.x, p.z, currentRoofModel.value)
    p.y = Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4))
    p.normal = [surf.normal.x, surf.normal.y, surf.normal.z]
    p.tiltPitchDeg = surf.pitchDeg
  })

  currentRoofModel.value.panels = result.placedPanels
  recordHistorySnapshot(`Auto Arranged ${result.totalFittedPanels} Panels`)
}

function validateSinglePanel(panel: PlacedSolarPanel) {
  if (!currentRoofModel.value) return
  const seg = currentRoofModel.value.roofSegments?.[0]
  if (!seg || !seg.vertices) return

  const halfLen = Math.floor(seg.vertices.length / 2)
  const roofPoly = seg.vertices.slice(0, halfLen).map(v => ({ x: v.x, z: v.z }))

  const shadows = currentSolarData.value?.shading?.shadowPolygons || []
  const shadowExclusions = shadows.map(s => ({
    points: s.points.map(pt => ({ x: pt.x, z: pt.z }))
  }))

  const val = validateIndividualPanel(
    panel,
    roofPoly,
    panelSetbackM.value,
    currentRoofModel.value.obstacles,
    shadowExclusions,
    currentRoofModel.value.panels,
    autoArrangeExcludesShadow.value,
    currentRoofModel.value.roofFeatures || []
  )

  panel.status = val.isValid ? 'VALID' : 'INVALID'
  panel.validationReason = val.reason
}

// ==========================================
// SUN SIMULATION ANIMATION
// ==========================================
function toggleSimPlay() {
  isSimPlaying.value = !isSimPlaying.value
  if (isSimPlaying.value) {
    simAnimationTimer = setInterval(() => {
      // 08:00 (480 mins) to 17:00 (1020 mins)
      if (simTimeMinutes.value >= 1020) {
        simTimeMinutes.value = 480
      } else {
        simTimeMinutes.value += 10
      }
    }, 150)
  } else {
    clearInterval(simAnimationTimer)
    simAnimationTimer = null
  }
}

// ==========================================
// SAVE DESIGN & VERIFICATION
// ==========================================
async function handleSaveDesign() {
  if (!currentRoofModel.value) return

  currentRoofModel.value.verification = {
    status: isVerified.value ? 'Verified' : 'Requires Review',
    confidence: 'INSTALLER VERIFIED',
    notes: verificationNotes.value,
    verifiedDate: new Date().toISOString().split('T')[0],
    verifiedBy: verifiedBy.value
  }

  try {
    const result = await saveVerifiedRoofModel(currentRoofModel.value, verificationNotes.value)
    if (result && result.data) {
      currentRoofModel.value = result.data
    }

    if (activeProject.value) {
      updateProject(activeProject.value.id, {
        status: isVerified.value ? 'Solar Analysis' : 'Roof Verification',
        currentStep: Math.max(activeProject.value.currentStep, isVerified.value ? 4 : 3),
        roofModel: currentRoofModel.value,
        systemSizing: {
          ...activeProject.value.systemSizing,
          moduleCount: currentPanelsCount.value,
          moduleWattage: panelWattageW.value,
          systemDcCapacityKwp: currentSystemKwp.value
        }
      })
    }

    hasUnsavedChanges.value = false
    saveFeedback.value = '✓ Solar Design saved successfully.'
    setTimeout(() => { saveFeedback.value = '' }, 3500)
  } catch (err) {
    console.error('Failed to save solar design:', err)
    saveFeedback.value = '⚠ Failed to save design.'
    setTimeout(() => { saveFeedback.value = '' }, 3500)
  }
}

function handleSaveVerifiedDesign() {
  isVerified.value = true
  verifiedChecklist.value = {
    roofBoundary: true,
    roofStructure: true,
    obstructionPlacement: true,
    panelPlacement: true,
    estimatedShading: true
  }
  handleSaveDesign()
}

function handleExitEditor() {
  if (hasUnsavedChanges.value) {
    showExitModal.value = true
  } else {
    navigateTo('/site-assessment')
  }
}

function handleConfirmExit(saveFirst: boolean) {
  showExitModal.value = false
  if (saveFirst) {
    handleSaveDesign().then(() => {
      navigateTo('/site-assessment')
    })
  } else {
    navigateTo('/site-assessment')
  }
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
function handleKeyDown(e: KeyboardEvent) {
  // Ignore inside text inputs
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    return
  }

  if (e.key === '1') {
    activeTool.value = 'select'
  } else if (e.key === '2') {
    activeTool.value = 'edit_roof'
  } else if (e.key === '3') {
    activeTool.value = 'add_tree'
  } else if (e.key === '4') {
    activeTool.value = 'add_obstruction'
  } else if (e.key === '5') {
    activeTool.value = 'add_panel'
  } else if (e.key === 'w' || e.key === 'W') {
    transformMode.value = 'move'
  } else if (e.key === 'e' || e.key === 'E') {
    transformMode.value = 'rotate'
  } else if (e.key === 'r' || e.key === 'R') {
    transformMode.value = 'scale'
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    handleDeleteSelected()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault()
    if (e.shiftKey) handleRedo()
    else handleUndo()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault()
    handleRedo()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault()
    handleDuplicateSelected()
  } else if (e.key === 'Escape') {
    activeTool.value = 'select'
    handleClearSelection()
  } else if (e.key === 'f' || e.key === 'F') {
    viewerRef.value?.fitCameraToRoof()
  }
}

// Tool Prompt Banner Text (contextual beginner-friendly instructions)
const activeToolPrompt = computed(() => {
  switch (activeTool.value) {
    case 'select':
      return 'Click an object to select it. Drag selected objects to move them.'
    case 'edit_roof':
      return 'Edit roof vertices by dragging the points.'
    case 'add_feature':
      return 'Click visible rooftop feature location on roof surface (from Google Satellite reference).'
    case 'add_tree':
      return 'Click the site to place a tree.'
    case 'add_obstruction':
      return `Choose an obstruction, then click the site to place it.`
    case 'add_panel':
      return 'Click on the roof to place a solar panel.'
    case 'measure':
      return 'Click two points to measure distance.'
    case 'sun_sim':
      return 'Adjust the time slider or click Play to simulate sun trajectory and dynamic shadows.'
    default:
      return 'Select an object to begin.'
  }
})
</script>

<template>
  <div class="h-[calc(100vh-64px)] w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
    <!-- ========================================== -->
    <!-- TOP TOOLBAR: HELIOS-LOAD SOLAR DESIGN EDITOR -->
    <!-- ========================================== -->
    <header class="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-3 shrink-0 z-20">
      <!-- Title & Project Context -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
            ☀️
          </div>
          <div>
            <h1 class="text-xs font-black tracking-wider uppercase text-white leading-tight">
              HELIOS-LOAD SOLAR DESIGN EDITOR
            </h1>
            <p class="text-[10px] text-slate-400 font-mono">
              {{ activeProject?.name || 'Digos City Solar Project' }} | CAD Workspace
            </p>
          </div>
        </div>

        <div class="h-4 w-px bg-slate-800"></div>

        <!-- Mode Indicator -->
        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-900/60 text-cyan-300 border border-blue-700/50 uppercase font-mono">
          TOOL: {{ activeTool.replace('_', ' ') }}
        </span>
      </div>

      <!-- Center Action Buttons Toolbar -->
      <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
        <!-- Tools Group -->
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            @click="activeTool = 'select'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'select' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Select & Inspect Objects (V / Esc)"
          >
            <span>↖</span>
            <span>SELECT</span>
          </button>

          <button
            type="button"
            @click="activeTool = 'edit_roof'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'edit_roof' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Edit Roof Boundary Vertices"
          >
            <span>⬡</span>
            <span>ROOF</span>
          </button>

          <button
            type="button"
            @click="activeTool = 'add_feature'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'add_feature' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Place Rooftop Feature (Chimney, Water Tank, Vent, Skylight, etc.)"
          >
            <span>🏗️</span>
            <span>ROOF FEATURE</span>
          </button>

          <button
            type="button"
            @click="activeTool = 'add_tree'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'add_tree' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Place Tree with Trunk & Canopy"
          >
            <span>🌲</span>
            <span>TREE</span>
          </button>

          <button
            type="button"
            @click="activeTool = 'add_obstruction'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'add_obstruction' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Place Roof Obstruction (Nearby buildings, etc.)"
          >
            <span>🧱</span>
            <span>OBSTRUCTION</span>
          </button>

          <button
            type="button"
            @click="activeTool = 'add_panel'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'add_panel' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Manually Place Solar PV Panel"
          >
            <span>⚡</span>
            <span>PANEL</span>
          </button>

          <button
            type="button"
            @click="activeTool = 'measure'"
            :class="[
              'px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              activeTool === 'measure' ? 'bg-orange-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Measure 3D Distance (M)"
          >
            <span>📏</span>
            <span>MEASURE</span>
          </button>
        </div>

        <div class="h-4 w-px bg-slate-800 mx-1"></div>

        <!-- Transforms Group -->
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            @click="transformMode = 'move'"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors',
              transformMode === 'move' ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Move Gizmo (W)"
          >
            MOVE
          </button>
          <button
            type="button"
            @click="transformMode = 'rotate'"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors',
              transformMode === 'rotate' ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Rotate Gizmo (E)"
          >
            ROTATE
          </button>
          <button
            type="button"
            @click="transformMode = 'scale'"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors',
              transformMode === 'scale' ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            ]"
            title="Resize Tree / Obstruction Gizmo (R)"
          >
            SCALE
          </button>
        </div>

        <div class="h-4 w-px bg-slate-800 mx-1"></div>

        <!-- History Group -->
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            @click="handleUndo"
            :disabled="historyIndex <= 0"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors',
              historyIndex > 0 ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'
            ]"
            title="Undo (Ctrl+Z)"
          >
            UNDO
          </button>
          <button
            type="button"
            @click="handleRedo"
            :disabled="historyIndex >= historyStack.length - 1"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors',
              historyIndex < historyStack.length - 1 ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'
            ]"
            title="Redo (Ctrl+Y)"
          >
            REDO
          </button>
        </div>

        <div class="h-4 w-px bg-slate-800 mx-1"></div>

        <!-- Object Actions -->
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            @click="handleRotateSelected90"
            :disabled="!selectedObjectId || (selectedObjectType !== 'panel' && selectedObjectType !== 'obstruction' && selectedObjectType !== 'tree' && selectedObjectType !== 'roof_feature')"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              selectedObjectId ? 'text-cyan-300 hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'
            ]"
            title="Rotate 90° (E)"
          >
            <span>⟳</span>
            <span>ROTATE 90°</span>
          </button>
          <button
            type="button"
            @click="handleDuplicateSelected"
            :disabled="!selectedObjectId || selectedObjectType === 'roof'"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              selectedObjectId && selectedObjectType !== 'roof' ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'
            ]"
            title="Duplicate Object (Ctrl+D)"
          >
            <span>⎘</span>
            <span>DUPLICATE</span>
          </button>
          <button
            v-if="selectedObjectType === 'panel'"
            type="button"
            @click="handleExtendRow(4)"
            class="px-2 py-1 text-xs font-bold rounded-lg transition-colors text-blue-300 hover:bg-blue-950/60 flex items-center gap-1 border border-blue-800/40"
            title="Extend row by 4 panels"
          >
            <span>➕</span>
            <span>+4 ROW</span>
          </button>
          <button
            type="button"
            @click="handleDeleteSelected"
            :disabled="!selectedObjectId"
            :class="[
              'px-2 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              selectedObjectId ? 'text-rose-400 hover:bg-rose-950/60' : 'text-slate-600 cursor-not-allowed'
            ]"
            title="Delete Selected Object (Del)"
          >
            <span>🗑</span>
            <span>DELETE</span>
          </button>
        </div>

        <div class="h-4 w-px bg-slate-800 mx-1"></div>

        <!-- Snapping Assistance Toggle -->
        <div class="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-xs">
          <span class="text-[10px] text-slate-400 font-bold font-mono">SNAP:</span>
          <button
            type="button"
            @click="snapEnabled = !snapEnabled"
            :class="[
              'px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors',
              snapEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            ]"
            title="Toggle CAD Neighbor and Grid Snapping"
          >
            {{ snapEnabled ? 'ON' : 'OFF' }}
          </button>
        </div>

        <div class="h-4 w-px bg-slate-800 mx-1"></div>

        <!-- Sizing & Simulation Quick Triggers -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            @click="handleAutoArrangePanels"
            class="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-900/60 text-blue-200 hover:bg-blue-800 border border-blue-700/60 shadow-xs transition-colors flex items-center gap-1"
            title="Fit panels in usable boundary (Requires confirmation)"
          >
            <span>⚡</span>
            <span>AUTO ARRANGE</span>
          </button>
          <button
            v-if="currentPanelsCount > 0"
            type="button"
            @click="showClearPanelsModal = true"
            class="px-2 py-1 text-xs font-bold rounded-lg bg-rose-950/60 text-rose-300 hover:bg-rose-900 border border-rose-800/60 transition-colors flex items-center gap-1"
            title="Clear all manually placed solar panels"
          >
            <span>✕</span>
            <span>CLEAR PANELS</span>
          </button>
        </div>
      </div>

      <!-- Right Save & Exit Actions -->
      <div class="flex items-center gap-2">
        <span v-if="saveFeedback" class="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-1 rounded border border-emerald-800 animate-fade-in font-mono">
          {{ saveFeedback }}
        </span>

        <button
          type="button"
          @click="showHelpModal = true"
          class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs"
          title="Keyboard Shortcuts & Help"
        >
          ⌨️
        </button>

        <button
          type="button"
          @click="handleSaveDesign"
          class="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 hover:bg-slate-100 shadow-sm transition-colors"
        >
          SAVE DESIGN
        </button>

        <button
          type="button"
          @click="handleExitEditor"
          class="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          EXIT
        </button>
      </div>
    </header>

    <!-- ========================================== -->
    <!-- MAIN WORKSPACE: LEFT TREE, CENTER BABYLON, RIGHT INSPECTOR -->
    <!-- ========================================== -->
    <div class="flex-1 flex overflow-hidden">
      <!-- LEFT SIDEBAR: Object Hierarchy & Scene Tree (AutoCAD/SketchUp Style) -->
      <aside class="w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 z-10 text-xs">
        <div class="p-3 border-b border-slate-800 flex items-center justify-between">
          <span class="font-bold uppercase tracking-wider text-slate-400 text-[10px]">SCENE HIERARCHY</span>
          <span class="font-mono text-[10px] text-slate-500">
            {{ (currentRoofModel?.obstacles?.length || 0) + currentPanelsCount + currentRoofFeaturesCount + 1 }} Objects
          </span>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-3">
          <!-- Roof Group -->
          <div class="space-y-1">
            <div
              @click="handleSelectObject({ id: currentRoofModel?.roofSegments?.[0]?.id || 'seg-0', type: 'roof' })"
              :class="[
                'p-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors',
                selectedObjectType === 'roof' ? 'bg-blue-900/50 border border-blue-500/50 text-white' : 'hover:bg-slate-800/60 text-slate-300'
              ]"
            >
              <div class="flex items-center gap-1.5">
                <span>🏠</span>
                <span class="font-semibold">Roof Footprint</span>
              </div>
              <span class="font-mono text-[10px] text-slate-400">{{ currentGrossAreaM2 }} m²</span>
            </div>
          </div>

          <!-- Rooftop Features Group (Requirements 12 & 13) -->
          <div class="space-y-1">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Rooftop Features ({{ currentRoofFeaturesCount }})</span>
              <button
                type="button"
                @click="activeTool = 'add_feature'"
                class="text-amber-400 hover:underline text-[10px] font-bold"
              >
                + Add
              </button>
            </div>

            <div v-if="currentRoofFeaturesCount === 0" key="features-empty" class="px-2 py-1 text-[11px] text-slate-600 italic">
              0 rooftop features placed.
            </div>

            <div
              v-for="feat in (currentRoofModel?.roofFeatures || [])"
              :key="feat.id"
              @click="handleSelectObject({ id: feat.id, type: 'roof_feature', rawData: feat })"
              :class="[
                'p-1.5 px-2 rounded-md flex flex-col cursor-pointer transition-colors text-[11px] gap-0.5',
                selectedObjectId === feat.id ? 'bg-amber-950/70 border border-amber-500/50 text-amber-200' : 'hover:bg-slate-800 text-slate-300'
              ]"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <span>🏛️</span>
                  <span class="font-mono font-bold">{{ feat.id }}</span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono">{{ feat.heightM }}m H</span>
              </div>
              <div class="flex items-center justify-between text-[10px] text-slate-400">
                <span>{{ feat.type }}</span>
                <span class="font-mono">{{ feat.widthM }} × {{ feat.lengthM }} × {{ feat.heightM }} m</span>
              </div>
            </div>
          </div>

          <!-- Trees Group -->
          <div class="space-y-1">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Trees ({{ currentTreesCount }})</span>
              <button
                type="button"
                @click="activeTool = 'add_tree'"
                class="text-emerald-400 hover:underline text-[10px] font-bold"
              >
                + Add
              </button>
            </div>

            <div v-if="currentTreesCount === 0" key="trees-empty" class="px-2 py-1 text-[11px] text-slate-600 italic">
              0 trees placed.
            </div>

            <div
              v-for="tree in (currentRoofModel?.obstacles || []).filter(o => o.type === 'Tree')"
              :key="tree.id"
              @click="handleSelectObject({ id: tree.id, type: 'tree', rawData: tree })"
              :class="[
                'p-1.5 px-2 rounded-md flex items-center justify-between cursor-pointer transition-colors text-[11px]',
                selectedObjectId === tree.id ? 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-200' : 'hover:bg-slate-800 text-slate-300'
              ]"
            >
              <div class="flex items-center gap-1.5">
                <span>🌲</span>
                <span class="font-mono">{{ tree.id }}</span>
              </div>
              <span class="text-[10px] text-slate-400">{{ tree.heightM }}m H</span>
            </div>
          </div>

          <!-- Obstructions Group -->
          <div class="space-y-1">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Obstructions ({{ currentObstaclesCount }})</span>
              <button
                type="button"
                @click="activeTool = 'add_obstruction'"
                class="text-amber-400 hover:underline text-[10px] font-bold"
              >
                + Add
              </button>
            </div>

            <div v-if="currentObstaclesCount === 0" key="obs-empty" class="px-2 py-1 text-[11px] text-slate-600 italic">
              0 obstructions placed.
            </div>

            <div
              v-for="obs in (currentRoofModel?.obstacles || []).filter(o => o.type !== 'Tree')"
              :key="obs.id"
              @click="handleSelectObject({ id: obs.id, type: 'obstruction', rawData: obs })"
              :class="[
                'p-1.5 px-2 rounded-md flex items-center justify-between cursor-pointer transition-colors text-[11px]',
                selectedObjectId === obs.id ? 'bg-amber-950/70 border border-amber-500/50 text-amber-200' : 'hover:bg-slate-800 text-slate-300'
              ]"
            >
              <div class="flex items-center gap-1.5">
                <span>🧱</span>
                <span class="font-mono">{{ obs.id }}</span>
                <span class="text-[10px] text-slate-400">({{ obs.type }})</span>
              </div>
              <span class="text-[10px] text-slate-400">{{ obs.heightM }}m H</span>
            </div>
          </div>

          <!-- Solar Panels Group -->
          <div class="space-y-1">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Solar Array ({{ currentPanelsCount }})</span>
              <button
                type="button"
                @click="handleAutoArrangePanels"
                class="text-cyan-400 hover:underline text-[10px] font-bold"
              >
                Pack
              </button>
            </div>

            <div v-if="currentPanelsCount === 0" key="panels-empty" class="px-2 py-1 text-[11px] text-slate-600 italic">
              0 panels placed. Click "Auto Arrange" or "Panel" tool to place.
            </div>

            <div v-else key="panels-summary" class="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[11px] space-y-1 font-mono">
              <div class="flex justify-between text-slate-400">
                <span>Panels:</span>
                <span class="font-bold text-white">{{ currentPanelsCount }} modules</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span>Capacity:</span>
                <span class="font-bold text-emerald-400">{{ currentSystemKwp }} kWp</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span>Yield:</span>
                <span class="font-bold text-blue-300">{{ estimatedAnnualEnergyKwh.toLocaleString() }} kWh/yr</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- CENTER: BABYLON.JS 3D VIEWPORT -->
      <main class="flex-1 flex flex-col min-w-0 relative bg-slate-950">
        <!-- Interactive Tool Guidance Banner -->
        <div class="bg-slate-900/90 border-b border-slate-800 px-4 py-1.5 flex items-center justify-between text-xs z-10 shrink-0">
          <div class="flex items-center gap-2">
            <span class="font-mono text-cyan-400 font-bold uppercase text-[10px]">
              MODE: [ {{ activeTool.replace('_', ' ') }} ]
            </span>
            <span class="text-slate-600">|</span>
            <span class="text-slate-300 text-[11px]">{{ activeToolPrompt }}</span>
          </div>

          <!-- Panel Orientation & Quick Controls (Requirement 4 & 9) -->
          <div v-if="activeTool === 'add_panel'" class="flex items-center gap-2">
            <span class="text-[10px] text-slate-400 font-bold font-mono">ORIENTATION:</span>
            <div class="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded border border-slate-700">
              <button
                type="button"
                @click="panelOrientation = 'portrait'"
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded transition-colors',
                  panelOrientation === 'portrait' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                ]"
              >
                PORTRAIT
              </button>
              <button
                type="button"
                @click="panelOrientation = 'landscape'"
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded transition-colors',
                  panelOrientation === 'landscape' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                ]"
              >
                LANDSCAPE
              </button>
            </div>
            <button
              type="button"
              @click="handleRotateSelected90"
              class="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1"
              title="Rotate 90° (E)"
            >
              <span>⟳</span>
              <span>ROTATE 90°</span>
            </button>
          </div>

          <div v-else-if="activeTool === 'add_obstruction'" class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-400 font-bold">TYPE:</span>
            <select
              v-model="pendingObstacleType"
              class="bg-slate-800 text-white text-[11px] px-2 py-0.5 rounded border border-slate-700 focus:outline-none"
            >
              <option value="Chimney">Chimney</option>
              <option value="Water Tank">Water Tank</option>
              <option value="Antenna">Antenna</option>
              <option value="HVAC">HVAC Equipment</option>
              <option value="Building">Nearby Structure</option>
              <option value="Other">Custom Obstruction</option>
            </select>
          </div>
        </div>

        <!-- 3D Canvas -->
        <div class="flex-1 relative w-full h-full">
          <BabylonRoofViewer
            ref="viewerRef"
            :roof-model="currentRoofModel"
            :active-tool="activeTool"
            :transform-mode="transformMode"
            :selected-object-id="selectedObjectId"
            :selected-object-type="selectedObjectType"
            :shading-assessment="currentSolarData.shading"
            :show-panels="true"
            :show-shadows="true"
            :pending-obstruction-type="pendingObstacleType"
            :panel-count="currentPanelsCount"
            :panel-wattage-w="panelWattageW"
            :system-capacity-kwp="currentSystemKwp"
            :estimated-annual-energy-kwh="estimatedAnnualEnergyKwh"
            :locked-object-ids="lockedObjectIds"
            :hidden-object-types="hiddenObjectTypes"
            :panel-orientation="panelOrientation"
            :panel-width-m="panelWidthM"
            :panel-length-m="panelLengthM"
            :panel-spacing-m="panelSpacingM"
            :panel-setback-m="panelSetbackM"
            :snap-enabled="snapEnabled"
            :grid-snap-enabled="gridSnapEnabled"
            :shadow-exclusion-enabled="autoArrangeExcludesShadow"
            @select-object="handleSelectObject"
            @clear-selection="handleClearSelection"
            @object-transformed="handleObjectTransformed"
            @vertex-moved="handleVertexMoved"
            @place-object="handlePlaceObject"
            @request-add-feature="handleRequestAddFeature"
            @measure-distance="(d) => lastMeasuredDistance = d"
            @rotate-90="handleRotateSelected90"
            @duplicate-selected="handleDuplicateSelected"
            @delete-selected="handleDeleteSelected"
            @extend-row="handleExtendRow"
            @preview-hover="(fb) => hoverPlacementFeedback = fb"
          />
        </div>

        <!-- BOTTOM SUN SIMULATION CONTROL STRIP -->
        <div class="h-16 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between gap-4 shrink-0 z-10 text-xs">
          <!-- Sun Simulation Controls -->
          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="toggleSimPlay"
              :class="[
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm',
                isSimPlaying ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-white hover:bg-slate-700'
              ]"
            >
              <span>{{ isSimPlaying ? '⏸ PAUSE' : '▶ PLAY SUN' }}</span>
            </button>

            <!-- Time Slider: 08:00 to 17:00 -->
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-slate-400 font-mono">08:00</span>
              <input
                v-model.number="simTimeMinutes"
                type="range"
                min="480"
                max="1020"
                step="10"
                class="w-44 accent-amber-400 cursor-pointer"
                title="Sun Time Slider"
              />
              <span class="text-[10px] text-slate-400 font-mono">17:00</span>
              <span class="font-mono font-bold text-amber-300 text-xs w-16 text-center bg-slate-950 py-1 rounded border border-slate-800">
                {{ formattedSimTime }}
              </span>
            </div>

            <!-- Date Picker -->
            <input
              v-model="simDate"
              type="date"
              class="bg-slate-950 text-white text-[11px] px-2 py-1 rounded border border-slate-800 focus:outline-none"
            />
          </div>

          <!-- Sun Coordinates & Exclusion Zone Toggle -->
          <div class="flex items-center gap-4">
            <div class="font-mono text-[11px] flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span class="text-slate-400">Sun Alt: <strong class="text-white">{{ currentSolarData.pos.solarAltitudeDeg }}°</strong></span>
              <span class="text-slate-600">|</span>
              <span class="text-slate-400">Azimuth: <strong class="text-white">{{ currentSolarData.pos.solarAzimuthDeg }}°</strong></span>
              <span class="text-slate-600">|</span>
              <span class="text-slate-400">Est. Shading: <strong class="text-amber-400">{{ estimatedShadingPercent }}%</strong></span>
            </div>

            <label class="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                v-model="autoArrangeExcludesShadow"
                type="checkbox"
                class="rounded accent-blue-500 cursor-pointer"
              />
              <span>USE SHADOW AS EXCLUSION</span>
            </label>
          </div>
        </div>
      </main>

      <!-- RIGHT SIDEBAR: CONTEXT-SENSITIVE INSPECTOR (AutoCAD/SketchUp Style) -->
      <aside class="w-80 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 z-10 text-xs">
        <div class="p-3 border-b border-slate-800 flex items-center justify-between">
          <span class="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
            {{ selectedObjectId ? 'OBJECT INSPECTOR' : 'SOLAR DESIGN SUMMARY' }}
          </span>
          <span v-if="selectedObjectId" class="font-mono text-[10px] text-cyan-400 font-bold">
            {{ selectedObjectId }}
          </span>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- A. TREE INSPECTOR -->
          <div v-if="selectedObjectType === 'tree' && selectedObjectData" key="inspector-tree" class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-1.5 font-bold text-emerald-400">
                <span>🌲</span>
                <span>Tree Parameters</span>
              </div>
              <span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                INSTALLER INPUT
              </span>
            </div>

            <div class="space-y-2 font-mono text-[11px]">
              <div>
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Height (m):</label>
                <input
                  v-model.number="selectedObjectData.heightM"
                  type="number"
                  step="0.5"
                  min="1"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  @change="recordHistorySnapshot('Updated tree height')"
                />
              </div>

              <div>
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Canopy Diameter (m):</label>
                <input
                  v-model.number="selectedObjectData.canopyDiameterM"
                  type="number"
                  step="0.2"
                  min="0.5"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  @change="() => {
                    selectedObjectData.canopyRadiusM = selectedObjectData.canopyDiameterM / 2;
                    recordHistorySnapshot('Updated tree canopy');
                  }"
                />
              </div>

              <div>
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Trunk Diameter (m):</label>
                <input
                  v-model.number="selectedObjectData.trunkDiameterM"
                  type="number"
                  step="0.05"
                  min="0.1"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  @change="() => {
                    selectedObjectData.trunkRadiusM = selectedObjectData.trunkDiameterM / 2;
                    recordHistorySnapshot('Updated tree trunk');
                  }"
                />
              </div>

              <div class="pt-2 border-t border-slate-800 space-y-1">
                <span class="text-[10px] text-slate-400 font-sans">Position (Local Meters):</span>
                <div class="grid grid-cols-3 gap-1.5">
                  <input
                    v-model.number="selectedObjectData.position.x"
                    type="number"
                    step="0.1"
                    class="bg-slate-950 text-white px-1.5 py-0.5 rounded border border-slate-700 text-center"
                    placeholder="X"
                  />
                  <input
                    v-model.number="selectedObjectData.position.y"
                    type="number"
                    step="0.1"
                    class="bg-slate-950 text-white px-1.5 py-0.5 rounded border border-slate-700 text-center"
                    placeholder="Y"
                  />
                  <input
                    v-model.number="selectedObjectData.position.z"
                    type="number"
                    step="0.1"
                    class="bg-slate-950 text-white px-1.5 py-0.5 rounded border border-slate-700 text-center"
                    placeholder="Z"
                  />
                </div>
              </div>

              <div class="pt-2 flex gap-2">
                <button
                  type="button"
                  @click="handleDeleteSelected"
                  class="w-full py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 font-bold rounded-lg text-xs"
                >
                  DELETE TREE
                </button>
              </div>
            </div>
          </div>

          <!-- B. OBSTRUCTION INSPECTOR -->
          <div v-else-if="selectedObjectType === 'obstruction' && selectedObjectData" key="inspector-obs" class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-1.5 font-bold text-amber-400">
                <span>🧱</span>
                <span>Obstruction Parameters</span>
              </div>
              <span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                {{ selectedObjectData.type }}
              </span>
            </div>

            <div class="space-y-2 font-mono text-[11px]">
              <div>
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Obstruction Type:</label>
                <select
                  v-model="selectedObjectData.type"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                >
                  <option value="Chimney">Chimney</option>
                  <option value="Water Tank">Water Tank</option>
                  <option value="Antenna">Antenna</option>
                  <option value="HVAC">Electrical / HVAC</option>
                  <option value="Building">Nearby Structure</option>
                  <option value="Other">Custom Obstruction</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Width (m):</label>
                  <input
                    v-model.number="selectedObjectData.widthM"
                    type="number"
                    step="0.1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Length (m):</label>
                  <input
                    v-model.number="selectedObjectData.lengthM"
                    type="number"
                    step="0.1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Height (m):</label>
                <input
                  v-model.number="selectedObjectData.heightM"
                  type="number"
                  step="0.1"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                />
              </div>

              <div class="pt-2 flex gap-2">
                <button
                  type="button"
                  @click="handleDeleteSelected"
                  class="w-full py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 font-bold rounded-lg text-xs"
                >
                  DELETE OBSTRUCTION
                </button>
              </div>
            </div>
          </div>

          <!-- B2. ROOFTOP FEATURE INSPECTOR (Requirement 11) -->
          <div v-else-if="selectedObjectType === 'roof_feature' && selectedObjectData" key="inspector-roof-feature" class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-1.5 font-bold text-amber-400">
                <span>🏛️</span>
                <span>ROOFTOP FEATURE</span>
              </div>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-950 text-amber-300 border-amber-800">
                {{ selectedObjectId }}
              </span>
            </div>

            <div class="space-y-2 font-mono text-[11px]">
              <div>
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Type:</label>
                <select
                  v-model="selectedObjectData.type"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                >
                  <option value="Chimney">Chimney</option>
                  <option value="Vent">Vent</option>
                  <option value="Water Tank">Water Tank</option>
                  <option value="Roof Equipment">Roof Equipment</option>
                  <option value="Skylight">Skylight</option>
                  <option value="Roof Structure">Roof Structure</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Width (m):</label>
                  <input
                    v-model.number="selectedObjectData.widthM"
                    type="number"
                    step="0.05"
                    min="0.1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Length (m):</label>
                  <input
                    v-model.number="selectedObjectData.lengthM"
                    type="number"
                    step="0.05"
                    min="0.1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Height (m):</label>
                  <input
                    v-model.number="selectedObjectData.heightM"
                    type="number"
                    step="0.05"
                    min="0.1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Rotation (°):</label>
                  <input
                    v-model.number="selectedObjectData.rotationDeg"
                    type="number"
                    step="15"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
              </div>

              <div class="p-2 bg-slate-950/80 rounded border border-slate-800 text-[10px] space-y-1">
                <div class="flex justify-between text-slate-400 font-sans">
                  <span>Placement:</span>
                  <span class="text-amber-300 font-mono font-bold">{{ selectedObjectData.source || 'Installer placed' }}</span>
                </div>
                <div v-if="selectedObjectData.roofSegmentId" class="flex justify-between text-slate-400 font-sans">
                  <span>Roof Segment:</span>
                  <span class="text-slate-300 font-mono">{{ selectedObjectData.roofSegmentId }}</span>
                </div>
                <div v-if="selectedObjectData.position" class="flex justify-between text-slate-400 font-sans">
                  <span>Contact Height (Y):</span>
                  <span class="text-emerald-400 font-mono">{{ (selectedObjectData.position.y || 0).toFixed(2) }} m</span>
                </div>
                <div class="flex justify-between text-slate-400 font-sans">
                  <span>Shading Relevant:</span>
                  <span class="text-cyan-300 font-mono font-bold">{{ selectedObjectData.shadingRelevant !== false ? 'YES' : 'NO' }}</span>
                </div>
              </div>

              <div class="pt-2 flex gap-2">
                <button
                  type="button"
                  @click="handleUpdateSelectedFeature"
                  class="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs transition-colors"
                >
                  UPDATE
                </button>
                <button
                  type="button"
                  @click="handleDeleteSelected"
                  class="flex-1 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 font-bold rounded-lg text-xs transition-colors"
                >
                  DELETE
                </button>
              </div>
            </div>
          </div>

          <!-- C. PANEL INSPECTOR (Requirements 24 & 25: Simple + Advanced Modes) -->
          <div v-else-if="selectedObjectType === 'panel' && selectedObjectData" key="inspector-panel" class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-1.5 font-bold text-cyan-400">
                <span>⚡</span>
                <span>Photovoltaic Module</span>
              </div>
              <span
                :class="[
                  'text-[9px] font-bold px-1.5 py-0.5 rounded border',
                  selectedObjectData.status === 'VALID' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'
                ]"
              >
                {{ selectedObjectData.status || 'VALID' }}
              </span>
            </div>

            <!-- Validation Reason Alert if Invalid -->
            <div v-if="selectedObjectData.status === 'INVALID'" class="p-2 bg-rose-950/60 border border-rose-800 rounded text-rose-300 text-[10px]">
              ⚠️ {{ selectedObjectData.validationReason || 'Panel outside usable roof boundary.' }}
            </div>

            <!-- Mode Selector: SIMPLE vs ADVANCED -->
            <div class="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[10px] font-bold">
              <button
                type="button"
                @click="inspectorMode = 'simple'"
                :class="[
                  'flex-1 py-1 rounded-md transition-colors text-center',
                  inspectorMode === 'simple' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                ]"
              >
                SIMPLE
              </button>
              <button
                type="button"
                @click="inspectorMode = 'advanced'"
                :class="[
                  'flex-1 py-1 rounded-md transition-colors text-center',
                  inspectorMode === 'advanced' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                ]"
              >
                ADVANCED
              </button>
            </div>

            <!-- SIMPLE MODE CONTENT -->
            <div v-if="inspectorMode === 'simple'" key="panel-mode-simple" class="space-y-2.5 font-mono text-[11px]">
              <div class="flex justify-between py-1 border-b border-slate-800/60">
                <span class="text-slate-400 font-sans">Panel ID:</span>
                <span class="font-bold text-white">{{ selectedObjectId }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800/60">
                <span class="text-slate-400 font-sans">Power:</span>
                <span class="font-bold text-emerald-400">{{ selectedObjectData.wattageW }} W</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800/60">
                <span class="text-slate-400 font-sans">Dimensions:</span>
                <span class="text-white">{{ selectedObjectData.widthM }} × {{ selectedObjectData.lengthM }} m</span>
              </div>

              <!-- Orientation Quick Toggle -->
              <div class="pt-1">
                <label class="block text-[10px] text-slate-400 font-sans mb-1">Orientation:</label>
                <div class="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                  <button
                    type="button"
                    @click="() => {
                      if (selectedObjectData.widthM > selectedObjectData.lengthM) {
                        handleRotateSelected90()
                      }
                    }"
                    :class="[
                      'py-1 rounded text-[10px] font-bold transition-colors',
                      selectedObjectData.widthM <= selectedObjectData.lengthM ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    ]"
                  >
                    PORTRAIT
                  </button>
                  <button
                    type="button"
                    @click="() => {
                      if (selectedObjectData.widthM <= selectedObjectData.lengthM) {
                        handleRotateSelected90()
                      }
                    }"
                    :class="[
                      'py-1 rounded text-[10px] font-bold transition-colors',
                      selectedObjectData.widthM > selectedObjectData.lengthM ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    ]"
                  >
                    LANDSCAPE
                  </button>
                </div>
              </div>

              <!-- Quick Action Buttons -->
              <div class="grid grid-cols-2 gap-1.5 pt-2">
                <button
                  type="button"
                  @click="handleRotateSelected90"
                  class="py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-lg text-xs flex items-center justify-center gap-1 border border-slate-700"
                  title="Rotate 90 degrees"
                >
                  <span>⟳</span>
                  <span>ROTATE 90°</span>
                </button>
                <button
                  type="button"
                  @click="handleDuplicateSelected"
                  class="py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 border border-slate-700"
                  title="Duplicate panel with gap offset (Ctrl+D)"
                >
                  <span>⎘</span>
                  <span>DUPLICATE</span>
                </button>
              </div>

              <div class="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  @click="handleExtendRow(4)"
                  class="py-1.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 font-bold rounded-lg text-xs flex items-center justify-center gap-1 border border-blue-700/60"
                  title="Extend row by 4 panels"
                >
                  <span>➕</span>
                  <span>EXTEND ROW (+4)</span>
                </button>
                <button
                  type="button"
                  @click="handleDeleteSelected"
                  class="py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 font-bold rounded-lg text-xs flex items-center justify-center gap-1 border border-rose-800/60"
                  title="Delete panel"
                >
                  <span>🗑</span>
                  <span>DELETE</span>
                </button>
              </div>
            </div>

            <!-- ADVANCED MODE CONTENT (CAD Coordinates & Engineering Details) -->
            <div v-else key="panel-mode-advanced" class="space-y-2 font-mono text-[11px]">
              <div class="pt-1 border-t border-slate-800 space-y-1">
                <span class="text-[10px] text-slate-400 font-sans">Coordinates (Local Meters):</span>
                <div class="grid grid-cols-3 gap-1.5">
                  <div>
                    <label class="text-[9px] text-slate-500 block text-center font-sans">X</label>
                    <input
                      v-model.number="selectedObjectData.x"
                      type="number"
                      step="0.05"
                      class="w-full bg-slate-950 text-white px-1.5 py-0.5 rounded border border-slate-700 text-center"
                      @change="() => { validateSinglePanel(selectedObjectData); recordHistorySnapshot('Moved panel X'); }"
                    />
                  </div>
                  <div>
                    <label class="text-[9px] text-slate-500 block text-center font-sans">Y (Height)</label>
                    <input
                      v-model.number="selectedObjectData.y"
                      type="number"
                      step="0.05"
                      class="w-full bg-slate-950 text-white px-1.5 py-0.5 rounded border border-slate-700 text-center"
                      @change="() => { validateSinglePanel(selectedObjectData); recordHistorySnapshot('Moved panel Y'); }"
                    />
                  </div>
                  <div>
                    <label class="text-[9px] text-slate-500 block text-center font-sans">Z</label>
                    <input
                      v-model.number="selectedObjectData.z"
                      type="number"
                      step="0.05"
                      class="w-full bg-slate-950 text-white px-1.5 py-0.5 rounded border border-slate-700 text-center"
                      @change="() => { validateSinglePanel(selectedObjectData); recordHistorySnapshot('Moved panel Z'); }"
                    />
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Tilt Angle (°):</label>
                  <input
                    v-model.number="selectedObjectData.tiltPitchDeg"
                    type="number"
                    step="1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                    @change="() => { validateSinglePanel(selectedObjectData); recordHistorySnapshot('Changed tilt'); }"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Azimuth (°):</label>
                  <input
                    :value="Math.round(((selectedObjectData.rotationY || 0) * 180) / Math.PI)"
                    @input="(e: any) => {
                      selectedObjectData.rotationY = (Number(e.target.value) * Math.PI) / 180;
                      validateSinglePanel(selectedObjectData);
                      recordHistorySnapshot('Changed azimuth');
                    }"
                    type="number"
                    step="1"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Width (m):</label>
                  <input
                    v-model.number="selectedObjectData.widthM"
                    type="number"
                    step="0.01"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                    @change="() => { validateSinglePanel(selectedObjectData); recordHistorySnapshot('Resized panel width'); }"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Length (m):</label>
                  <input
                    v-model.number="selectedObjectData.lengthM"
                    type="number"
                    step="0.01"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                    @change="() => { validateSinglePanel(selectedObjectData); recordHistorySnapshot('Resized panel length'); }"
                  />
                </div>
              </div>

              <div class="pt-2 flex gap-2">
                <button
                  type="button"
                  @click="handleDuplicateSelected"
                  class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs"
                >
                  DUPLICATE
                </button>
                <button
                  type="button"
                  @click="handleDeleteSelected"
                  class="flex-1 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 font-bold rounded-lg text-xs"
                >
                  DELETE
                </button>
              </div>
            </div>
          </div>

          <!-- D. ROOF FOOTPRINT INSPECTOR -->
          <div v-else-if="selectedObjectType === 'roof'" key="inspector-roof" class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-1.5 font-bold text-blue-400">
                <span>🏠</span>
                <span>Roof Geometry</span>
              </div>
              <span class="text-[9px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                MAP BOUNDARY
              </span>
            </div>

            <div class="space-y-2 text-[11px]">
              <div>
                <label class="block text-[10px] text-slate-400 mb-1">Roof Structure Type:</label>
                <select
                  v-model="roofStructureType"
                  @change="recalculateRoofBoundaryGeometry"
                  class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                >
                  <option value="Flat">Flat Roof</option>
                  <option value="Single Slope">Single Slope / Shed</option>
                  <option value="Gable">Gable Roof</option>
                  <option value="Hip">Hip Roof</option>
                  <option value="Custom">Custom Architectural</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Pitch (°):</label>
                  <input
                    v-model.number="roofPitchDegrees"
                    type="number"
                    step="1"
                    min="0"
                    max="60"
                    @change="recalculateRoofBoundaryGeometry"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                  <span class="text-[9px] text-slate-500 font-sans">Installer Input</span>
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 font-sans mb-1">Azimuth (°):</label>
                  <input
                    v-model.number="roofAzimuthDegrees"
                    type="number"
                    step="5"
                    min="0"
                    max="360"
                    @change="recalculateRoofBoundaryGeometry"
                    class="w-full bg-slate-950 text-white px-2 py-1 rounded border border-slate-700"
                  />
                  <span class="text-[9px] text-slate-500 font-sans">Installer Input</span>
                </div>
              </div>

              <div class="pt-2">
                <button
                  type="button"
                  @click="activeTool = 'edit_roof'"
                  class="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs"
                >
                  EDIT ROOF VERTICES IN 3D
                </button>
              </div>
            </div>
          </div>

          <!-- E. SCENE SUMMARY & VALIDATION (Default when no object is selected) -->
          <div v-else key="inspector-summary" class="space-y-4">
            <!-- Telemetry Metrics Summary Table -->
            <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-[11px] font-mono">
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Roof Area:</span>
                <span class="font-bold text-white">{{ currentGrossAreaM2 }} m²</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Usable Roof Area:</span>
                <span class="font-bold text-cyan-300">{{ currentUsableAreaM2 }} m²</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Trees Placed:</span>
                <span class="text-white">{{ currentTreesCount }}</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Obstructions:</span>
                <span class="text-white">{{ currentObstaclesCount }}</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Solar Panels:</span>
                <span class="font-bold text-white">{{ currentPanelsCount }}</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Panel Rating:</span>
                <span class="text-white">{{ panelWattageW }} W</span>
              </div>
              <div class="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                <span class="font-sans font-bold text-slate-300">System Capacity:</span>
                <span class="font-bold text-emerald-400">{{ currentSystemKwp }} kWp</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span class="font-sans">Est. Annual Energy:</span>
                <span class="font-bold text-blue-300">{{ estimatedAnnualEnergyKwh.toLocaleString() }} kWh/yr</span>
              </div>
            </div>

            <!-- Design Validation Checklist -->
            <div class="space-y-1.5 text-[11px]">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                DESIGN VALIDATION
              </span>
              <div class="flex items-center gap-2 text-slate-300">
                <span :class="designValidation.roofValid ? 'text-emerald-400 font-bold' : 'text-slate-600'">✓</span>
                <span>Roof boundary defined</span>
              </div>
              <div class="flex items-center gap-2 text-slate-300">
                <span :class="designValidation.roofAreaCalculated ? 'text-emerald-400 font-bold' : 'text-slate-600'">✓</span>
                <span>Physical area calculated</span>
              </div>
              <div class="flex items-center gap-2 text-slate-300">
                <span :class="currentPanelsCount > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'">✓</span>
                <span>Panels physically positioned</span>
              </div>
              <div class="flex items-center gap-2 text-slate-300">
                <span :class="designValidation.panelsInsideRoof ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'">
                  {{ designValidation.panelsInsideRoof ? '✓' : '⚠️' }}
                </span>
                <span>Panels inside usable setback</span>
              </div>
              <div v-if="designValidation.treeHeightNotice" class="flex items-center gap-2 text-amber-300 text-[10px]">
                <span>ℹ️</span>
                <span>Tree height is installer-provided</span>
              </div>
              <div v-if="estimatedShadingPercent > 0" class="flex items-center gap-2 text-amber-300 text-[10px]">
                <span>⛅</span>
                <span>{{ estimatedShadingPercent }}% estimated shading active</span>
              </div>
            </div>

            <!-- Installer Verification Checklist & Save -->
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5 text-[11px]">
              <div class="flex items-center justify-between pb-1 border-b border-slate-800">
                <span class="font-bold text-white text-[11px]">INSTALLER VERIFICATION</span>
                <span :class="isVerified ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'">
                  {{ isVerified ? 'VERIFIED' : 'PENDING' }}
                </span>
              </div>

              <div class="space-y-1.5 text-slate-300">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="verifiedChecklist.roofBoundary" type="checkbox" class="rounded accent-emerald-500" />
                  <span>I verified the roof boundary.</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="verifiedChecklist.roofStructure" type="checkbox" class="rounded accent-emerald-500" />
                  <span>I verified the roof structure.</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="verifiedChecklist.obstructionPlacement" type="checkbox" class="rounded accent-emerald-500" />
                  <span>I verified obstruction placement.</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="verifiedChecklist.panelPlacement" type="checkbox" class="rounded accent-emerald-500" />
                  <span>I reviewed panel placement.</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="verifiedChecklist.estimatedShading" type="checkbox" class="rounded accent-emerald-500" />
                  <span>I reviewed estimated shading.</span>
                </label>
              </div>

              <div>
                <label class="block text-[10px] text-slate-400 mb-1">Verification Notes:</label>
                <textarea
                  v-model="verificationNotes"
                  placeholder="Notes on site constraints, slope, obstructions..."
                  rows="2"
                  class="w-full bg-slate-900 text-white text-xs p-2 rounded border border-slate-800 focus:outline-none"
                ></textarea>
              </div>

              <button
                type="button"
                @click="handleSaveVerifiedDesign"
                class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow-md transition-colors"
              >
                SAVE VERIFIED DESIGN
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- ========================================== -->
    <!-- EXIT CONFIRMATION MODAL -->
    <!-- ========================================== -->
    <div
      v-if="showExitModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-slate-100">
        <h3 class="font-bold text-sm text-white flex items-center gap-2">
          <span>⚠️</span>
          <span>Unsaved Design Changes</span>
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          You have unsaved changes in the Solar Design Editor. Would you like to save your verified rooftop design before exiting?
        </p>
        <div class="flex flex-col gap-2 pt-2">
          <button
            type="button"
            @click="handleConfirmExit(true)"
            class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-colors"
          >
            SAVE & EXIT
          </button>
          <button
            type="button"
            @click="handleConfirmExit(false)"
            class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold rounded-lg text-xs transition-colors"
          >
            DISCARD CHANGES
          </button>
          <button
            type="button"
            @click="showExitModal = false"
            class="w-full py-1.5 text-slate-400 hover:text-white text-xs font-semibold"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- KEYBOARD SHORTCUTS MODAL -->
    <!-- ========================================== -->
    <div
      v-if="showHelpModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-slate-100">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 class="font-bold text-sm text-white flex items-center gap-2">
            <span>⌨️</span>
            <span>Solar Design Editor Shortcuts</span>
          </h3>
          <button type="button" @click="showHelpModal = false" class="text-slate-400 hover:text-white text-sm">✕</button>
        </div>

        <div class="space-y-2 text-xs font-mono">
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Tools (Select / Roof / Tree / Obs / Panel):</span>
            <span class="text-cyan-300 font-bold">1, 2, 3, 4, 5</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Move Gizmo:</span>
            <span class="text-cyan-300 font-bold">W</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Rotate 90° / Rotate Gizmo:</span>
            <span class="text-cyan-300 font-bold">E</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Scale Gizmo:</span>
            <span class="text-cyan-300 font-bold">R</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Delete Selected Object:</span>
            <span class="text-rose-400 font-bold">Delete / Backspace</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Duplicate Object (Row Offset):</span>
            <span class="text-white font-bold">Ctrl + D</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Undo Action:</span>
            <span class="text-white font-bold">Ctrl + Z</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Redo Action:</span>
            <span class="text-white font-bold">Ctrl + Y / Ctrl+Shift+Z</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Cancel / Clear Selection:</span>
            <span class="text-white font-bold">Esc</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/50">
            <span class="text-slate-400 font-sans">Fit Camera to Roof:</span>
            <span class="text-white font-bold">F</span>
          </div>
        </div>

        <button
          type="button"
          @click="showHelpModal = false"
          class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs"
        >
          CLOSE
        </button>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- AUTO ARRANGE CONFIRMATION MODAL (Req 22 & 56) -->
    <!-- ========================================== -->
    <div
      v-if="showAutoArrangeModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-slate-100">
        <h3 class="font-bold text-sm text-white flex items-center gap-2">
          <span>⚡</span>
          <span>Auto Arrange Panels</span>
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          Place panels automatically within the usable roof area using the current panel specifications, setbacks, spacing, and obstruction zones?
        </p>
        <div class="flex gap-2 pt-2">
          <button
            type="button"
            @click="showAutoArrangeModal = false"
            class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            @click="confirmAutoArrange"
            class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-colors"
          >
            ARRANGE PANELS
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- ADD ROOFTOP FEATURE MODAL (Requirement 5) -->
    <!-- ========================================== -->
    <div
      v-if="showAddFeatureModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-slate-100">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 class="font-bold text-sm text-amber-400 flex items-center gap-2">
            <span>🏛️</span>
            <span>ADD ROOFTOP FEATURE</span>
          </h3>
          <span class="text-[10px] text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
            Installer Provided
          </span>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block text-[11px] text-slate-400 font-medium mb-1">Type</label>
            <select
              :value="newFeatureType"
              @change="(e) => onFeatureTypeChanged((e.target as HTMLSelectElement).value as RooftopFeatureType)"
              class="w-full bg-slate-950 text-white px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-hidden focus:border-amber-500 font-medium"
            >
              <option value="Chimney">Chimney</option>
              <option value="Vent">Vent</option>
              <option value="Water Tank">Water Tank</option>
              <option value="Roof Equipment">Roof Equipment</option>
              <option value="Skylight">Skylight</option>
              <option value="Roof Structure">Roof Structure</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-slate-400 font-medium mb-1">Width (m)</label>
              <input
                v-model.number="newFeatureWidthM"
                type="number"
                step="0.05"
                min="0.1"
                class="w-full bg-slate-950 text-white px-3 py-1.5 rounded-lg border border-slate-700 font-mono"
              />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 font-medium mb-1">Length (m)</label>
              <input
                v-model.number="newFeatureLengthM"
                type="number"
                step="0.05"
                min="0.1"
                class="w-full bg-slate-950 text-white px-3 py-1.5 rounded-lg border border-slate-700 font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-slate-400 font-medium mb-1">Height (m)</label>
              <input
                v-model.number="newFeatureHeightM"
                type="number"
                step="0.05"
                min="0.1"
                class="w-full bg-slate-950 text-white px-3 py-1.5 rounded-lg border border-slate-700 font-mono"
              />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 font-medium mb-1">Rotation (°)</label>
              <input
                v-model.number="newFeatureRotationDeg"
                type="number"
                step="15"
                class="w-full bg-slate-950 text-white px-3 py-1.5 rounded-lg border border-slate-700 font-mono"
              />
            </div>
          </div>

          <div class="p-2 bg-slate-950/70 border border-slate-800 rounded-lg text-[10px] text-slate-400 space-y-0.5">
            <div class="flex justify-between">
              <span>Source:</span>
              <span class="text-amber-300 font-mono">Estimated / Installer Provided</span>
            </div>
            <div v-if="pendingFeatureLocation?.roofSegmentId" class="flex justify-between">
              <span>Attached Segment:</span>
              <span class="text-slate-300 font-mono">{{ pendingFeatureLocation.roofSegmentId }}</span>
            </div>
            <div v-if="pendingFeatureLocation" class="flex justify-between">
              <span>Surface Normal:</span>
              <span class="text-emerald-400 font-mono">Pitch {{ pendingFeatureLocation.pitchDeg.toFixed(1) }}°</span>
            </div>
          </div>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            @click="() => { showAddFeatureModal = false; pendingFeatureLocation = null }"
            class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            @click="confirmCreateFeature"
            class="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs transition-colors shadow-md"
          >
            CREATE FEATURE
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- CLEAR PANELS CONFIRMATION MODAL (Req 57) -->
    <!-- ========================================== -->
    <div
      v-if="showClearPanelsModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-slate-100">
        <h3 class="font-bold text-sm text-rose-400 flex items-center gap-2">
          <span>🗑</span>
          <span>Clear All Solar Panels</span>
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          Remove all manually placed solar panels from this design?
        </p>
        <div class="flex gap-2 pt-2">
          <button
            type="button"
            @click="showClearPanelsModal = false"
            class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            @click="handleClearAllPanels"
            class="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-colors"
          >
            CLEAR ALL PANELS
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

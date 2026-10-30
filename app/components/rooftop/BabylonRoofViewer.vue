<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Mesh,
  VertexData,
  LinesMesh,
  TransformNode,
  GizmoManager,
  HighlightLayer,
  PointerEventTypes,
  Quaternion,
  Ray,
  type Nullable,
  type PointerInfo
} from '@babylonjs/core'
import earcut from 'earcut'
import type { RoofModel, RoofSegment, RoofObstacle, PlacedSolarPanel, ShadingAssessmentRecord, ObstacleType, RooftopFeature, RooftopFeatureType } from '~/types/roof'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import { latLngToLocalMeters } from '~/utils/roof-mesh-generator'
import {
  snapPanelPosition,
  validateIndividualPanel,
  pointInPolygon,
  computeSetbackPolygon
} from '~/utils/panel-placement'
import {
  getRoofSurfaceAtLocalPoint,
  computePanelRotationQuaternion,
  snapPanelToRoofSurface,
  DEFAULT_MOUNTING_CLEARANCE_M
} from '~/utils/roof-surface'

const props = withDefaults(
  defineProps<{
    roofModel?: RoofModel | null
    activeTool?: 'select' | 'edit_roof' | 'add_tree' | 'add_obstruction' | 'add_panel' | 'add_feature' | 'measure' | 'sun_sim'
    transformMode?: 'move' | 'rotate' | 'scale' | null
    selectedObjectId?: string | null
    selectedObjectType?: 'roof' | 'tree' | 'obstruction' | 'panel' | 'roof_feature' | null
    shadingAssessment?: ShadingAssessmentRecord | null
    showPanels?: boolean
    showShadows?: boolean
    showSetback?: boolean
    pendingObstructionType?: ObstacleType
    panelCount?: number
    panelWattageW?: number
    systemCapacityKwp?: number
    estimatedAnnualEnergyKwh?: number
    lockedObjectIds?: string[]
    hiddenObjectTypes?: string[]
    panelOrientation?: 'portrait' | 'landscape'
    panelWidthM?: number
    panelLengthM?: number
    panelSpacingM?: number
    panelSetbackM?: number
    snapEnabled?: boolean
    gridSnapEnabled?: boolean
    shadowExclusionEnabled?: boolean
    showRoofContactDebug?: boolean
  }>(),
  {
    roofModel: null,
    activeTool: 'select',
    transformMode: 'move',
    selectedObjectId: null,
    selectedObjectType: null,
    shadingAssessment: null,
    showPanels: true,
    showShadows: true,
    showSetback: true,
    pendingObstructionType: 'Chimney',
    panelCount: 0,
    panelWattageW: 550,
    systemCapacityKwp: 0,
    estimatedAnnualEnergyKwh: 0,
    lockedObjectIds: () => [],
    hiddenObjectTypes: () => [],
    panelOrientation: 'portrait',
    panelWidthM: 1.134,
    panelLengthM: 2.278,
    panelSpacingM: 0.05,
    panelSetbackM: 0.5,
    snapEnabled: true,
    gridSnapEnabled: true,
    shadowExclusionEnabled: false,
    showRoofContactDebug: false
  }
)

const emit = defineEmits<{
  (e: 'select-object', payload: { id: string; type: 'roof' | 'tree' | 'obstruction' | 'panel' | 'roof_feature'; rawData?: any }): void
  (e: 'clear-selection'): void
  (e: 'object-transformed', payload: { id: string; type: 'tree' | 'obstruction' | 'panel' | 'roof_feature'; position: { x: number; y: number; z: number }; rotationY: number; scale?: { x: number; y: number; z: number } }): void
  (e: 'vertex-moved', payload: { vertexIndex: number; x: number; z: number }): void
  (e: 'place-object', payload: { type: 'tree' | 'obstruction' | 'panel'; subType?: string; x: number; y: number; z: number; orientation?: 'portrait' | 'landscape' }): void
  (e: 'request-add-feature', payload: { x: number; y: number; z: number; roofSegmentId?: string; segmentIndex?: number; normal: [number, number, number]; pitchDeg: number }): void
  (e: 'measure-distance', distanceM: number): void
  (e: 'reset-camera'): void
  (e: 'rotate-90'): void
  (e: 'duplicate-selected'): void
  (e: 'delete-selected'): void
  (e: 'extend-row', count?: number): void
  (e: 'preview-hover', payload: { isValid: boolean; reason?: string; x: number; y: number; z: number } | null): void
}>()

const {
  placedPanels,
  obstructions,
  roofThicknessM,
  roofPitchDegrees,
  roofAzimuthDegrees,
  roofStructureType,
  setbackM,
  setbackPolygonPoints,
  babylonFootprintAreaM2,
  roofAreaSqM,
  areaDifferencePercent,
  isGeometryAreaValid
} = useSiteAssessment()

const currentObstaclesList = computed(() => {
  return ((props.roofModel?.obstacles?.length ? props.roofModel.obstacles : obstructions.value) as RoofObstacle[]) || []
})
const currentPanelsList = computed(() => {
  return ((props.roofModel?.panels?.length ? props.roofModel.panels : placedPanels.value) as PlacedSolarPanel[]) || []
})
const currentFeaturesList = computed(() => {
  return ((props.roofModel?.roofFeatures as RooftopFeature[]) || [])
})
const currentFeaturesCount = computed(() => currentFeaturesList.value.length)
const currentTreesCount = computed(() => currentObstaclesList.value.filter(o => o.type === 'Tree').length)
const currentNonTreeObstaclesCount = computed(() => currentObstaclesList.value.filter(o => o.type !== 'Tree').length)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: Engine | null = null
let scene: Scene | null = null
let camera: ArcRotateCamera | null = null
let gizmoManager: GizmoManager | null = null
let highlightLayer: HighlightLayer | null = null
let isDisposed = false
let isInitialized = false
let renderLoop: (() => void) | null = null

// Mesh & Node Registries
const rootNodesMap = new Map<string, TransformNode>()
const segmentMeshes = new Map<number, Mesh>()
let vertexHandleMeshes: Mesh[] = []
let panelMeshes: Mesh[] = []
let obstacleMeshes: Mesh[] = []
let featureMeshes: Mesh[] = []
let shadowMeshes: Mesh[] = []
const edgeMeshes: LinesMesh[] = []
let measurementLineMesh: LinesMesh | null = null
let measurePointAMesh: Mesh | null = null
let measurePointBMesh: Mesh | null = null

// Materials
let defaultMaterial: StandardMaterial | null = null
let selectedRoofMaterial: StandardMaterial | null = null
let panelMaterial: StandardMaterial | null = null
let panelFrameMaterial: StandardMaterial | null = null
let invalidPanelMaterial: StandardMaterial | null = null
let trunkMaterial: StandardMaterial | null = null
let canopyMaterial: StandardMaterial | null = null
let waterTankMaterial: StandardMaterial | null = null
let obstacleMaterial: StandardMaterial | null = null
let chimneyFeatureMat: StandardMaterial | null = null
let ventFeatureMat: StandardMaterial | null = null
let waterTankFeatureMat: StandardMaterial | null = null
let equipmentFeatureMat: StandardMaterial | null = null
let skylightGlassMat: StandardMaterial | null = null
let skylightFrameMat: StandardMaterial | null = null
let roofStructureFeatureMat: StandardMaterial | null = null
let otherFeatureMat: StandardMaterial | null = null
let shadowMaterial: StandardMaterial | null = null
let vertexHandleMat: StandardMaterial | null = null
let vertexHandleActiveMat: StandardMaterial | null = null
let measurePointMat: StandardMaterial | null = null
let previewMaterialValid: StandardMaterial | null = null
let previewMaterialInvalid: StandardMaterial | null = null

// Preview Meshes
let previewPanelRoot: TransformNode | null = null
let previewPanelMesh: Mesh | null = null
let previewPanelFrameMesh: Mesh | null = null

// Direct CAD Dragging State
let isDirectDragging = false
let draggedNode: TransformNode | null = null
let dragStartPointerX = 0
let dragStartPointerY = 0
let dragHasMoved = false

// Placement Feedback & Context Menu
const previewStatus = ref<{
  visible: boolean
  isValid: boolean
  reason: string
  x: number
  y: number
  z: number
} | null>(null)

const contextMenuState = ref<{
  visible: boolean
  x: number
  y: number
  objectId: string | null
  objectType: 'roof' | 'tree' | 'obstruction' | 'panel' | 'roof_feature' | null
}>({
  visible: false,
  x: 0,
  y: 0,
  objectId: null,
  objectType: null
})

// Sun direction light
let sunLight: DirectionalLight | null = null

// Measuring state in 3D
let measurePointA: Vector3 | null = null
let measurePointB: Vector3 | null = null
const currentMeasuredDistance = ref<number | null>(null)

function initBabylon() {
  if (isInitialized || engine || !canvasRef.value || !import.meta.client) return
  isDisposed = false

  try {
    engine = new Engine(canvasRef.value, true, { preserveDrawingBuffer: true, stencil: true })
    scene = new Scene(engine)
    scene.clearColor = new Color4(0.06, 0.09, 0.16, 1) // Professional CAD slate navy

    // Engineering Orbit Camera
    camera = new ArcRotateCamera(
      'RoofEngineeringCamera',
      -Math.PI / 3,
      Math.PI / 3.2,
      28,
      new Vector3(0, 3.5, 0),
      scene
    )
    camera.attachControl(canvasRef.value, true)
    camera.lowerRadiusLimit = 4
    camera.upperRadiusLimit = 120
    camera.wheelPrecision = 35

    // Ambient Hemispheric Light
    const hemiLight = new HemisphericLight('HemiLight', new Vector3(0, 1, 0), scene)
    hemiLight.intensity = 0.75
    hemiLight.groundColor = new Color3(0.15, 0.2, 0.3)

    // Directional Sun Light
    sunLight = new DirectionalLight('SunLight', new Vector3(-0.5, -1, -0.5), scene)
    sunLight.position = new Vector3(20, 35, 20)
    sunLight.intensity = 1.3

    // Ground Grid Datum Plane
    const ground = MeshBuilder.CreateGround('GridDatum', { width: 90, height: 90, subdivisions: 45 }, scene)
    const groundMat = new StandardMaterial('GroundMat', scene)
    groundMat.diffuseColor = new Color3(0.10, 0.14, 0.22)
    groundMat.wireframe = true
    ground.material = groundMat
    ground.position.y = -0.05
    ground.isPickable = true // Allows raycast ground picking for tree/obstacle placement

    // Gizmo Manager & Highlight Layer
    highlightLayer = new HighlightLayer('hlLayer', scene)
    highlightLayer.innerGlow = true
    highlightLayer.outerGlow = true

    gizmoManager = new GizmoManager(scene)
    gizmoManager.usePointerToAttachGizmos = false
    gizmoManager.clearGizmoOnEmptyPointerEvent = false
    gizmoManager.positionGizmoEnabled = false
    gizmoManager.rotationGizmoEnabled = false
    gizmoManager.scaleGizmoEnabled = false

    // Initialize Materials
    initMaterials()

    // Build Scene Geometry
    buildAll3DObjects()

    // Register Pointer Interactions (Picking, Gizmo Drags, Vertex Edit, Click-to-Place, Measure)
    setupPointerInteractions()

    renderLoop = () => {
      if (isDisposed) return
      if (!scene || scene.isDisposed) return
      scene.render()
    }
    engine.runRenderLoop(renderLoop)

    window.addEventListener('resize', handleResize)
    isInitialized = true
  } catch (err) {
    console.error('Failed to initialize Babylon.js 3D Solar Design Editor:', err)
  }
}

function initMaterials() {
  if (!scene) return

  defaultMaterial = new StandardMaterial('DefaultRoofMat', scene)
  defaultMaterial.diffuseColor = new Color3(0.24, 0.33, 0.46) // Engineering slate blue
  defaultMaterial.specularColor = new Color3(0.15, 0.15, 0.15)
  defaultMaterial.backFaceCulling = false

  selectedRoofMaterial = new StandardMaterial('SelectedRoofMat', scene)
  selectedRoofMaterial.diffuseColor = new Color3(0.18, 0.38, 0.62)
  selectedRoofMaterial.emissiveColor = new Color3(0.04, 0.08, 0.16)
  selectedRoofMaterial.backFaceCulling = false

  panelMaterial = new StandardMaterial('PvPanelMat', scene)
  panelMaterial.diffuseColor = new Color3(0.04, 0.07, 0.16) // Monocrystalline dark blue PV surface
  panelMaterial.specularColor = new Color3(0.8, 0.9, 1.0)
  panelMaterial.emissiveColor = new Color3(0.01, 0.02, 0.05)

  panelFrameMaterial = new StandardMaterial('PvFrameMat', scene)
  panelFrameMaterial.diffuseColor = new Color3(0.55, 0.60, 0.68) // Aluminum silver frame

  invalidPanelMaterial = new StandardMaterial('InvalidPvMat', scene)
  invalidPanelMaterial.diffuseColor = new Color3(0.75, 0.15, 0.15) // Warning red for invalid placement
  invalidPanelMaterial.emissiveColor = new Color3(0.2, 0.02, 0.02)

  trunkMaterial = new StandardMaterial('TrunkMat', scene)
  trunkMaterial.diffuseColor = new Color3(0.38, 0.25, 0.15) // Tree trunk wood brown

  canopyMaterial = new StandardMaterial('CanopyMat', scene)
  canopyMaterial.diffuseColor = new Color3(0.12, 0.55, 0.22) // Tree canopy vibrant foliage green
  canopyMaterial.specularColor = new Color3(0.1, 0.2, 0.1)

  waterTankMaterial = new StandardMaterial('TankMat', scene)
  waterTankMaterial.diffuseColor = new Color3(0.55, 0.65, 0.75) // Industrial metallic silver
  waterTankMaterial.specularColor = new Color3(0.8, 0.85, 0.9)

  obstacleMaterial = new StandardMaterial('ObstacleMat', scene)
  obstacleMaterial.diffuseColor = new Color3(0.85, 0.45, 0.15) // Amber warning structure

  chimneyFeatureMat = new StandardMaterial('ChimneyFeatMat', scene)
  chimneyFeatureMat.diffuseColor = new Color3(0.65, 0.28, 0.18) // Terracotta masonry brick
  chimneyFeatureMat.specularColor = new Color3(0.12, 0.1, 0.08)

  ventFeatureMat = new StandardMaterial('VentFeatMat', scene)
  ventFeatureMat.diffuseColor = new Color3(0.24, 0.28, 0.32) // Gunmetal galvanized vent
  ventFeatureMat.specularColor = new Color3(0.3, 0.35, 0.4)

  waterTankFeatureMat = new StandardMaterial('WaterTankFeatMat', scene)
  waterTankFeatureMat.diffuseColor = new Color3(0.68, 0.74, 0.82) // Stainless steel / industrial water reservoir
  waterTankFeatureMat.specularColor = new Color3(0.85, 0.9, 0.95)

  equipmentFeatureMat = new StandardMaterial('EquipmentFeatMat', scene)
  equipmentFeatureMat.diffuseColor = new Color3(0.36, 0.40, 0.45) // HVAC slate / heavy equipment
  equipmentFeatureMat.specularColor = new Color3(0.25, 0.25, 0.3)

  skylightGlassMat = new StandardMaterial('SkylightGlassMat', scene)
  skylightGlassMat.diffuseColor = new Color3(0.45, 0.75, 0.95) // Glass daylight tint
  skylightGlassMat.alpha = 0.65
  skylightGlassMat.backFaceCulling = false

  skylightFrameMat = new StandardMaterial('SkylightFrameMat', scene)
  skylightFrameMat.diffuseColor = new Color3(0.18, 0.22, 0.28) // Anodized aluminum dark frame

  roofStructureFeatureMat = new StandardMaterial('StructureFeatMat', scene)
  roofStructureFeatureMat.diffuseColor = new Color3(0.78, 0.76, 0.72) // Architectural penthouse / rooftop enclosure
  roofStructureFeatureMat.specularColor = new Color3(0.15, 0.15, 0.15)

  otherFeatureMat = new StandardMaterial('OtherFeatMat', scene)
  otherFeatureMat.diffuseColor = new Color3(0.48, 0.52, 0.56) // Neutral architectural structure

  shadowMaterial = new StandardMaterial('ShadowMat', scene)
  shadowMaterial.diffuseColor = new Color3(0.04, 0.05, 0.08) // Semi-transparent shadow
  shadowMaterial.alpha = 0.55
  shadowMaterial.backFaceCulling = false
  shadowMaterial.disableLighting = true

  vertexHandleMat = new StandardMaterial('VertexHandleMat', scene)
  vertexHandleMat.diffuseColor = new Color3(0.06, 0.82, 0.95) // Cyan glowing vertex sphere
  vertexHandleMat.emissiveColor = new Color3(0.06, 0.82, 0.95)

  vertexHandleActiveMat = new StandardMaterial('VertexHandleActiveMat', scene)
  vertexHandleActiveMat.diffuseColor = new Color3(0.98, 0.75, 0.18) // Amber active vertex handle
  vertexHandleActiveMat.emissiveColor = new Color3(0.98, 0.75, 0.18)

  measurePointMat = new StandardMaterial('MeasurePointMat', scene)
  measurePointMat.diffuseColor = new Color3(1.0, 0.55, 0.0)
  measurePointMat.emissiveColor = new Color3(1.0, 0.55, 0.0)

  previewMaterialValid = new StandardMaterial('PreviewPvValidMat', scene)
  previewMaterialValid.diffuseColor = new Color3(0.06, 0.85, 0.95)
  previewMaterialValid.emissiveColor = new Color3(0.03, 0.35, 0.45)
  previewMaterialValid.alpha = 0.65
  previewMaterialValid.backFaceCulling = false

  previewMaterialInvalid = new StandardMaterial('PreviewPvInvalidMat', scene)
  previewMaterialInvalid.diffuseColor = new Color3(0.95, 0.20, 0.20)
  previewMaterialInvalid.emissiveColor = new Color3(0.45, 0.05, 0.05)
  previewMaterialInvalid.alpha = 0.65
  previewMaterialInvalid.backFaceCulling = false
}

function handleResize() {
  engine?.resize()
}

function clearAllMeshes() {
  if (highlightLayer) {
    highlightLayer.removeAllMeshes()
  }
  if (gizmoManager) {
    gizmoManager.attachToMesh(null)
    gizmoManager.attachToNode(null)
  }

  rootNodesMap.forEach(node => node.dispose())
  rootNodesMap.clear()

  segmentMeshes.forEach(mesh => mesh.dispose())
  segmentMeshes.clear()

  vertexHandleMeshes.forEach(mesh => mesh.dispose())
  vertexHandleMeshes = []

  panelMeshes.forEach(mesh => mesh.dispose())
  panelMeshes = []

  obstacleMeshes.forEach(mesh => mesh.dispose())
  obstacleMeshes = []

  featureMeshes.forEach(mesh => mesh.dispose())
  featureMeshes = []

  shadowMeshes.forEach(mesh => mesh.dispose())
  shadowMeshes = []

  edgeMeshes.forEach(mesh => mesh.dispose())
  edgeMeshes.length = 0

  if (measurementLineMesh) {
    measurementLineMesh.dispose()
    measurementLineMesh = null
  }
  if (measurePointAMesh) {
    measurePointAMesh.dispose()
    measurePointAMesh = null
  }
  if (measurePointBMesh) {
    measurePointBMesh.dispose()
    measurePointBMesh = null
  }
}

function buildAll3DObjects() {
  if (!scene) return
  clearAllMeshes()

  buildExactRoofMesh()
  buildSetbackOutline()
  buildPlacedSolarPanels()
  buildObstacles()
  buildRooftopFeatures()
  buildDynamicShadows()
  buildRoofVertexHandles()
  updateGizmoAndSelection()
}

/**
 * 1. Build Exact 3D Roof Solid Mesh from polygon vertices using earcut triangulation & thickness.
 */
function buildExactRoofMesh() {
  if (!scene) return
  const model = props.roofModel
  const segs = model?.segments || model?.roofSegments || []
  if (!model || segs.length === 0) return

  segs.forEach(seg => {
    const segIdx = seg.segmentIndex
    const segMesh = new Mesh(`RoofSegment_${segIdx}`, scene!)
    segMesh.metadata = { id: seg.id || `seg-${segIdx}`, type: 'roof', segment: seg }

    const positions: number[] = []
    const indices: number[] = []
    const normals: number[] = []

    if (seg.vertices && seg.vertices.length >= 3) {
      seg.vertices.forEach(v => {
        positions.push(v.x, v.y, v.z)
      })

      if (seg.indices && seg.indices.length >= 3) {
        indices.push(...seg.indices)
      } else {
        const flat: number[] = []
        seg.vertices.forEach(v => flat.push(v.x, v.z))
        const tri = earcut(flat)
        for (let i = 0; i < tri.length; i += 3) {
          const a = tri[i]
          const b = tri[i + 1]
          const c = tri[i + 2]
          if (a !== undefined && b !== undefined && c !== undefined) {
            indices.push(a, b, c)
            indices.push(a, c, b)
          }
        }
      }

      if (seg.normals && seg.normals.length === positions.length) {
        normals.push(...seg.normals)
      } else {
        VertexData.ComputeNormals(positions, indices, normals)
      }
    }

    if (positions.length >= 9 && indices.length >= 3) {
      const vertexData = new VertexData()
      vertexData.positions = positions
      vertexData.indices = indices
      vertexData.normals = normals
      vertexData.applyToMesh(segMesh)

      const isSelected = props.selectedObjectType === 'roof' && (props.selectedObjectId === seg.id || props.selectedObjectId === `seg-${segIdx}`)
      segMesh.material = isSelected ? selectedRoofMaterial : defaultMaterial
      segMesh.isPickable = true
      segmentMeshes.set(segIdx, segMesh)
      rootNodesMap.set(`RoofSegment_${segIdx}`, segMesh)

      // Outer Perimeter Wireframe Edge Lines
      if (seg.vertices && seg.vertices.length >= 3) {
        const topPerimeterPts = seg.vertices
          .slice(0, Math.floor(seg.vertices.length / 2))
          .map(v => new Vector3(v.x, v.y + 0.02, v.z))
        if (topPerimeterPts.length > 2) {
          topPerimeterPts.push(topPerimeterPts[0]!.clone())
          const edgeLine = MeshBuilder.CreateLines(`edge_top_${segIdx}`, { points: topPerimeterPts }, scene!)
          edgeLine.color = new Color3(0.2, 0.45, 0.85)
          edgeLine.isPickable = false
          edgeMeshes.push(edgeLine)
        }
      }
    }
  })
}

/**
 * 2. Build Setback Usable Solar Area Outline.
 */
function buildSetbackOutline() {
  if (!scene || !props.showSetback || !setbackPolygonPoints.value || setbackPolygonPoints.value.length < 3) return
  const model = props.roofModel
  const seg = model?.segments?.[0] || model?.roofSegments?.[0]
  const eaveY = seg?.center?.y ?? 3.5

  const setbackPts = setbackPolygonPoints.value.map(pt => new Vector3(pt.x, eaveY + 0.04, pt.z))
  setbackPts.push(setbackPts[0]!.clone())

  const setbackLine = MeshBuilder.CreateLines('setback_outline', { points: setbackPts }, scene)
  setbackLine.color = new Color3(0.06, 0.75, 0.9) // Cyan glowing line
  setbackLine.isPickable = false
  edgeMeshes.push(setbackLine)
}

/**
 * 3. Build Photovoltaic Panels physically placed inside boundary.
 */
function buildPlacedSolarPanels() {
  if (!scene || !props.showPanels || props.hiddenObjectTypes?.includes('panel')) return
  panelMeshes.forEach(m => m.dispose())
  panelMeshes = []

  const panels = currentPanelsList.value
  if (!panels || panels.length === 0) return

  panels.forEach((p, idx) => {
    const pId = p.id || `PANEL-${idx + 1}`
    const width = p.widthM || 1.134
    const length = p.lengthM || 2.278
    const thickness = p.thicknessM || 0.04

    // 1. Calculate exact roof surface height and normal at panel location
    const surf = snapPanelToRoofSurface(p, props.roofModel, scene, DEFAULT_MOUNTING_CLEARANCE_M)
    const surfNormal = surf.normal
    const rotY = p.rotationY || 0

    // 2. Root node positioned at exact roof contact point + mounting clearance along normal
    const panelRoot = new TransformNode(`panelRoot_${pId}`, scene!)
    const surfaceContactPt = new Vector3(p.x, surf.y, p.z)
    panelRoot.position = surfaceContactPt.add(surfNormal.scale(DEFAULT_MOUNTING_CLEARANCE_M))
    panelRoot.rotationQuaternion = computePanelRotationQuaternion(surfNormal, rotY)
    panelRoot.metadata = { id: pId, type: 'panel', data: p, surfaceContact: surfaceContactPt }

    // 3. Child meshes offset vertically so local Y = 0 is the exact bottom surface of the frame
    // PV Blue Surface Mesh
    const pvMesh = MeshBuilder.CreateBox(
      `pv-surface-${pId}`,
      { width: width - 0.03, depth: length - 0.03, height: thickness },
      scene!
    )
    pvMesh.position.y = thickness / 2
    pvMesh.material = p.status === 'INVALID' ? invalidPanelMaterial : panelMaterial
    pvMesh.parent = panelRoot
    pvMesh.isPickable = true
    pvMesh.metadata = { id: pId, type: 'panel', rootId: `panelRoot_${pId}`, data: p }
    panelMeshes.push(pvMesh)

    // Aluminum Frame Mesh
    const frameMesh = MeshBuilder.CreateBox(
      `pv-frame-${pId}`,
      { width, depth: length, height: thickness * 0.9 },
      scene!
    )
    frameMesh.position.y = (thickness * 0.9) / 2
    frameMesh.material = panelFrameMaterial
    frameMesh.parent = panelRoot
    frameMesh.isPickable = false
    panelMeshes.push(frameMesh)

    rootNodesMap.set(`panelRoot_${pId}`, panelRoot)

    // Development Debug Marker: Show exact roof surface contact point (Requirement 22)
    if (props.showRoofContactDebug) {
      const contactMarker = MeshBuilder.CreateSphere(`debug_contact_${pId}`, { diameter: 0.06 }, scene!)
      contactMarker.position = surfaceContactPt
      const debugMat = new StandardMaterial(`debug_mat_${pId}`, scene!)
      debugMat.emissiveColor = new Color3(1, 0, 0.2)
      contactMarker.material = debugMat
      contactMarker.isPickable = false
      panelMeshes.push(contactMarker)
    }
  })
}

/**
 * 4. Build Realistic 3D Obstructions (Trees, Water Tanks, Chimneys, Buildings).
 * Strictly data-driven: NEVER creates an obstruction unless an actual record exists.
 */
function buildObstacles() {
  if (!scene) return
  obstacleMeshes.forEach(m => m.dispose())
  obstacleMeshes = []

  const obsList = currentObstaclesList.value
  if (!obsList || obsList.length === 0) return

  obsList.forEach((obs, idx) => {
    if (!obs || !obs.type) return
    const obsId = obs.id || `OBS-${idx + 1}`
    if (obs.type === 'Tree' && props.hiddenObjectTypes?.includes('tree')) return
    if (obs.type !== 'Tree' && props.hiddenObjectTypes?.includes('obstruction')) return

    let posX = obs.position?.x
    let posY = obs.position?.y ?? 0
    let posZ = obs.position?.z

    if ((posX === undefined || posZ === undefined) && obs.latitude && obs.longitude) {
      const centerLat = props.roofModel?.origin?.latitude || props.roofModel?.building?.center?.latitude || 6.7497
      const centerLng = props.roofModel?.origin?.longitude || props.roofModel?.building?.center?.longitude || 125.3572
      const local = latLngToLocalMeters(obs.latitude, obs.longitude, centerLat, centerLng)
      posX = local.x
      posZ = local.z
    }

    if (posX === undefined || posZ === undefined) return

    if (obs.type === 'Tree') {
      const height = obs.heightM || 5.0
      const canopyRadius = obs.canopyRadiusM || (obs.canopyDiameterM ? obs.canopyDiameterM / 2 : 1.75)
      const trunkHeight = Math.max(0.8, height * 0.4)
      const canopyHeight = height - trunkHeight
      const trunkRadius = obs.trunkRadiusM || (obs.trunkDiameterM ? obs.trunkDiameterM / 2 : 0.15)

      const treeRoot = new TransformNode(`treeRoot_${obsId}`, scene!)
      treeRoot.position = new Vector3(posX, posY, posZ)
      treeRoot.metadata = { id: obsId, type: 'tree', data: obs }
      rootNodesMap.set(`treeRoot_${obsId}`, treeRoot)

      // 1. Cylindrical Trunk (Brown wood bark)
      const trunk = MeshBuilder.CreateCylinder(`tree_trunk_${obsId}`, {
        height: trunkHeight,
        diameter: trunkRadius * 2,
        tessellation: 16
      }, scene!)
      trunk.material = trunkMaterial
      trunk.position = new Vector3(0, trunkHeight / 2, 0)
      trunk.parent = treeRoot
      trunk.isPickable = true
      trunk.metadata = { id: obsId, type: 'tree', rootId: `treeRoot_${obsId}`, data: obs }
      obstacleMeshes.push(trunk)

      // 2. Canopy Geometry (Green foliage spread)
      const canopy = MeshBuilder.CreateSphere(`tree_canopy_${obsId}`, {
        diameterX: canopyRadius * 2,
        diameterZ: canopyRadius * 2,
        diameterY: canopyHeight * 1.4,
        segments: 16
      }, scene!)
      canopy.material = canopyMaterial
      canopy.position = new Vector3(0, trunkHeight + canopyHeight / 2, 0)
      canopy.parent = treeRoot
      canopy.isPickable = true
      canopy.metadata = { id: obsId, type: 'tree', rootId: `treeRoot_${obsId}`, data: obs }
      obstacleMeshes.push(canopy)
    } else {
      const obsRoot = new TransformNode(`obsRoot_${obsId}`, scene!)
      obsRoot.position = new Vector3(posX, posY, posZ)
      obsRoot.metadata = { id: obsId, type: 'obstruction', data: obs }
      rootNodesMap.set(`obsRoot_${obsId}`, obsRoot)

      if (obs.type === 'Water Tank') {
        const height = obs.heightM || 2.0
        const tankRadius = obs.radiusM || (obs.widthM ? obs.widthM / 2 : 1.0)
        const tank = MeshBuilder.CreateCylinder(`water_tank_${obsId}`, {
          height,
          diameter: tankRadius * 2,
          tessellation: 24
        }, scene!)
        tank.material = waterTankMaterial
        tank.position = new Vector3(0, height / 2, 0)
        tank.parent = obsRoot
        tank.isPickable = true
        tank.metadata = { id: obsId, type: 'obstruction', rootId: `obsRoot_${obsId}`, data: obs }
        obstacleMeshes.push(tank)
      } else if (obs.type === 'Chimney') {
        const height = obs.heightM || 1.2
        const w = obs.widthM || 0.8
        const l = obs.lengthM || 0.8
        const chimney = MeshBuilder.CreateBox(`chimney_${obsId}`, { width: w, depth: l, height }, scene!)
        chimney.material = obstacleMaterial
        chimney.position = new Vector3(0, height / 2, 0)
        chimney.parent = obsRoot
        chimney.isPickable = true
        chimney.metadata = { id: obsId, type: 'obstruction', rootId: `obsRoot_${obsId}`, data: obs }
        obstacleMeshes.push(chimney)
      } else {
        const height = obs.heightM || 1.8
        const w = obs.widthM || 1.5
        const l = obs.lengthM || 1.5
        const box = MeshBuilder.CreateBox(`structure_${obsId}`, { width: w, depth: l, height }, scene!)
        box.material = obstacleMaterial
        box.position = new Vector3(0, height / 2, 0)
        box.parent = obsRoot
        box.isPickable = true
        box.metadata = { id: obsId, type: 'obstruction', rootId: `obsRoot_${obsId}`, data: obs }
        obstacleMeshes.push(box)
      }
    }
  })
}

/**
 * 4b. Build Installer-Controlled 3D Rooftop Features (Chimney, Vent, Water Tank, Roof Equipment, Skylight, Roof Structure, Other)
 * Strictly data-driven: Attached flush directly to the reconstructed roof surface using getRoofSurfaceAtLocalPoint.
 */
function buildRooftopFeatures() {
  if (!scene || props.hiddenObjectTypes?.includes('roof_feature')) return
  featureMeshes.forEach(m => m.dispose())
  featureMeshes = []

  const features = currentFeaturesList.value
  if (!features || features.length === 0) return

  features.forEach((feat, idx) => {
    if (!feat || !feat.type) return
    const featId = feat.id || `FEATURE-${String(idx + 1).padStart(3, '0')}`

    let posX = feat.position?.x
    let posZ = feat.position?.z

    if ((posX === undefined || posZ === undefined) && feat.latitude && feat.longitude) {
      const centerLat = props.roofModel?.origin?.latitude || props.roofModel?.building?.center?.latitude || 6.7497
      const centerLng = props.roofModel?.origin?.longitude || props.roofModel?.building?.center?.longitude || 125.3572
      const local = latLngToLocalMeters(feat.latitude, feat.longitude, centerLat, centerLng)
      posX = local.x
      posZ = local.z
    }

    if (posX === undefined || posZ === undefined) return

    // 1. Calculate exact roof surface height, plane normal, and segment at feature location
    const surf = getRoofSurfaceAtLocalPoint(posX, posZ, props.roofModel, scene)
    const surfNormal = surf.normal
    const rotDeg = feat.rotationDeg !== undefined ? feat.rotationDeg : (feat.rotationY ? (feat.rotationY * 180) / Math.PI : 0)
    const rotY = (rotDeg * Math.PI) / 180

    // 2. Feature Root node positioned precisely on the roof surface (NO floating gap!)
    const featRoot = new TransformNode(`featRoot_${featId}`, scene!)
    featRoot.position = new Vector3(posX, surf.y, posZ)
    featRoot.rotationQuaternion = computePanelRotationQuaternion(surfNormal, rotY)
    featRoot.metadata = { id: featId, type: 'roof_feature', data: feat, surfaceContact: new Vector3(posX, surf.y, posZ) }
    rootNodesMap.set(`featRoot_${featId}`, featRoot)

    const w = Math.max(0.1, feat.widthM || 1.0)
    const l = Math.max(0.1, feat.lengthM || 1.0)
    const h = Math.max(0.1, feat.heightM || 1.2)

    if (feat.type === 'Water Tank') {
      // Cylindrical Tank on Roof
      const tankRadius = Math.min(w, l) / 2
      const tankMesh = MeshBuilder.CreateCylinder(`feat_tank_${featId}`, {
        height: h,
        diameter: tankRadius * 2,
        tessellation: 24
      }, scene!)
      tankMesh.material = waterTankFeatureMat
      tankMesh.position = new Vector3(0, h / 2, 0)
      tankMesh.parent = featRoot
      tankMesh.isPickable = true
      tankMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(tankMesh)

      // Tank Dome Cap
      const domeMesh = MeshBuilder.CreateSphere(`feat_tank_dome_${featId}`, {
        diameter: tankRadius * 1.95,
        slice: 0.5,
        segments: 16
      }, scene!)
      domeMesh.material = waterTankFeatureMat
      domeMesh.position = new Vector3(0, h, 0)
      domeMesh.parent = featRoot
      domeMesh.isPickable = false
      featureMeshes.push(domeMesh)

      // Stand/Cradle support legs
      const legHeight = Math.min(0.25, h * 0.2)
      const legMesh = MeshBuilder.CreateBox(`feat_tank_legs_${featId}`, {
        width: tankRadius * 1.6,
        depth: tankRadius * 1.6,
        height: legHeight
      }, scene!)
      legMesh.material = skylightFrameMat
      legMesh.position = new Vector3(0, legHeight / 2, 0)
      legMesh.parent = featRoot
      legMesh.isPickable = false
      featureMeshes.push(legMesh)
    } else if (feat.type === 'Chimney') {
      // Masonry Body
      const bodyMesh = MeshBuilder.CreateBox(`feat_chimney_${featId}`, { width: w, depth: l, height: h }, scene!)
      bodyMesh.material = chimneyFeatureMat
      bodyMesh.position = new Vector3(0, h / 2, 0)
      bodyMesh.parent = featRoot
      bodyMesh.isPickable = true
      bodyMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(bodyMesh)

      // Chimney Overhanging Cap Lip
      const capH = 0.08
      const capMesh = MeshBuilder.CreateBox(`feat_chimney_cap_${featId}`, {
        width: w * 1.12,
        depth: l * 1.12,
        height: capH
      }, scene!)
      capMesh.material = roofStructureFeatureMat
      capMesh.position = new Vector3(0, h + capH / 2, 0)
      capMesh.parent = featRoot
      capMesh.isPickable = false
      featureMeshes.push(capMesh)

      // Flue Outlet Pipe
      const flueDiameter = Math.min(w, l) * 0.4
      const flueH = 0.15
      const flueMesh = MeshBuilder.CreateCylinder(`feat_chimney_flue_${featId}`, {
        diameter: flueDiameter,
        height: flueH,
        tessellation: 16
      }, scene!)
      flueMesh.material = ventFeatureMat
      flueMesh.position = new Vector3(0, h + capH + flueH / 2, 0)
      flueMesh.parent = featRoot
      flueMesh.isPickable = false
      featureMeshes.push(flueMesh)
    } else if (feat.type === 'Vent') {
      // Roof Vent Cowl Pipe
      const ventDiameter = Math.min(w, l) * 0.6
      const pipeMesh = MeshBuilder.CreateCylinder(`feat_vent_pipe_${featId}`, {
        diameter: ventDiameter,
        height: h * 0.85,
        tessellation: 16
      }, scene!)
      pipeMesh.material = ventFeatureMat
      pipeMesh.position = new Vector3(0, (h * 0.85) / 2, 0)
      pipeMesh.parent = featRoot
      pipeMesh.isPickable = true
      pipeMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(pipeMesh)

      // Hooded Vent Cap
      const hoodMesh = MeshBuilder.CreateCylinder(`feat_vent_hood_${featId}`, {
        diameterTop: ventDiameter * 1.5,
        diameterBottom: ventDiameter * 1.1,
        height: h * 0.25,
        tessellation: 16
      }, scene!)
      hoodMesh.material = ventFeatureMat
      hoodMesh.position = new Vector3(0, h * 0.85 + (h * 0.25) / 2, 0)
      hoodMesh.parent = featRoot
      hoodMesh.isPickable = false
      featureMeshes.push(hoodMesh)
    } else if (feat.type === 'Skylight') {
      // Aluminum Curb Frame
      const curbH = Math.min(0.12, h * 0.5)
      const curbMesh = MeshBuilder.CreateBox(`feat_skylight_curb_${featId}`, {
        width: w,
        depth: l,
        height: curbH
      }, scene!)
      curbMesh.material = skylightFrameMat
      curbMesh.position = new Vector3(0, curbH / 2, 0)
      curbMesh.parent = featRoot
      curbMesh.isPickable = true
      curbMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(curbMesh)

      // Translucent Glazing Glass Pane
      const glassH = 0.04
      const glassMesh = MeshBuilder.CreateBox(`feat_skylight_glass_${featId}`, {
        width: w - 0.08,
        depth: l - 0.08,
        height: glassH
      }, scene!)
      glassMesh.material = skylightGlassMat
      glassMesh.position = new Vector3(0, curbH + glassH / 2, 0)
      glassMesh.parent = featRoot
      glassMesh.isPickable = false
      featureMeshes.push(glassMesh)
    } else if (feat.type === 'Roof Equipment') {
      // HVAC Unit Cabinet Box
      const equipMesh = MeshBuilder.CreateBox(`feat_equip_${featId}`, { width: w, depth: l, height: h }, scene!)
      equipMesh.material = equipmentFeatureMat
      equipMesh.position = new Vector3(0, h / 2, 0)
      equipMesh.parent = featRoot
      equipMesh.isPickable = true
      equipMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(equipMesh)

      // Top Fan Grille Disc
      const fanDia = Math.min(w, l) * 0.65
      const fanMesh = MeshBuilder.CreateCylinder(`feat_fan_${featId}`, {
        diameter: fanDia,
        height: 0.05,
        tessellation: 18
      }, scene!)
      fanMesh.material = skylightFrameMat
      fanMesh.position = new Vector3(0, h + 0.025, 0)
      fanMesh.parent = featRoot
      fanMesh.isPickable = false
      featureMeshes.push(fanMesh)
    } else if (feat.type === 'Roof Structure') {
      // Architectural Enclosure / Penthouse
      const structMesh = MeshBuilder.CreateBox(`feat_struct_${featId}`, { width: w, depth: l, height: h }, scene!)
      structMesh.material = roofStructureFeatureMat
      structMesh.position = new Vector3(0, h / 2, 0)
      structMesh.parent = featRoot
      structMesh.isPickable = true
      structMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(structMesh)

      // Parapet / Roof Coping Border Cap
      const capMesh = MeshBuilder.CreateBox(`feat_struct_cap_${featId}`, {
        width: w + 0.08,
        depth: l + 0.08,
        height: 0.08
      }, scene!)
      capMesh.material = skylightFrameMat
      capMesh.position = new Vector3(0, h + 0.04, 0)
      capMesh.parent = featRoot
      capMesh.isPickable = false
      featureMeshes.push(capMesh)
    } else {
      // Other Architectural Feature
      const otherMesh = MeshBuilder.CreateBox(`feat_other_${featId}`, { width: w, depth: l, height: h }, scene!)
      otherMesh.material = otherFeatureMat
      otherMesh.position = new Vector3(0, h / 2, 0)
      otherMesh.parent = featRoot
      otherMesh.isPickable = true
      otherMesh.metadata = { id: featId, type: 'roof_feature', rootId: `featRoot_${featId}`, data: feat }
      featureMeshes.push(otherMesh)
    }
  })
}

/**
 * 5. Build Dynamic Estimated Shadows.
 */
function buildDynamicShadows() {
  if (!scene || !props.showShadows || props.hiddenObjectTypes?.includes('shadow')) return
  shadowMeshes.forEach(m => m.dispose())
  shadowMeshes = []

  const obsList = currentObstaclesList.value
  if (!obsList || obsList.length === 0) return

  const shadows = props.shadingAssessment?.shadowPolygons
  if (!shadows || shadows.length === 0) return

  // Update directional sunlight position to match calculated solar position
  if (sunLight && props.shadingAssessment) {
    const altRad = (props.shadingAssessment.solarAltitudeDeg * Math.PI) / 180
    const azRad = (props.shadingAssessment.solarAzimuthDeg * Math.PI) / 180
    const sunDirX = -Math.cos(altRad) * Math.sin(azRad)
    const sunDirY = -Math.sin(altRad)
    const sunDirZ = -Math.cos(altRad) * Math.cos(azRad)
    sunLight.direction = new Vector3(sunDirX, sunDirY, sunDirZ)
  }

  shadows.forEach((shadow, idx) => {
    if (shadow.points.length < 3) return

    const shadowMesh = new Mesh(`estimated_shadow_${idx}`, scene!)
    const positions: number[] = []
    const indices: number[] = []

    shadow.points.forEach(pt => {
      positions.push(pt.x, 0.02, pt.z)
    })

    const flat: number[] = []
    shadow.points.forEach(pt => flat.push(pt.x, pt.z))
    const tri = earcut(flat)

    for (let i = 0; i < tri.length; i += 3) {
      const a = tri[i]
      const b = tri[i + 1]
      const c = tri[i + 2]
      if (a !== undefined && b !== undefined && c !== undefined) {
        indices.push(a, b, c)
        indices.push(a, c, b)
      }
    }

    const normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)

    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.indices = indices
    vertexData.normals = normals
    vertexData.applyToMesh(shadowMesh)

    shadowMesh.material = shadowMaterial
    shadowMesh.isPickable = false
    shadowMeshes.push(shadowMesh)
  })
}

/**
 * 6. Build Roof Vertex Handles for interactive polygon boundary vertex editing.
 */
function buildRoofVertexHandles() {
  if (!scene) return
  vertexHandleMeshes.forEach(m => m.dispose())
  vertexHandleMeshes = []

  if (props.activeTool !== 'edit_roof') return

  const seg = props.roofModel?.segments?.[0] || props.roofModel?.roofSegments?.[0]
  if (!seg || !seg.vertices || seg.vertices.length < 3) return

  const topPerimeterPts = seg.vertices.slice(0, Math.floor(seg.vertices.length / 2))
  topPerimeterPts.forEach((v, vIdx) => {
    const handleMesh = MeshBuilder.CreateSphere(`vertexHandle_${vIdx}`, { diameter: 0.65, segments: 12 }, scene!)
    handleMesh.position = new Vector3(v.x, v.y + 0.1, v.z)
    handleMesh.material = vertexHandleMat
    handleMesh.isPickable = true
    handleMesh.metadata = { id: `vertex-${vIdx}`, type: 'roof_vertex', vertexIndex: vIdx }
    vertexHandleMeshes.push(handleMesh)
  })
}

/**
 * 7. Update Gizmo & Selection Highlighting.
 */
function updateGizmoAndSelection() {
  if (!gizmoManager || !scene) return

  if (highlightLayer) {
    highlightLayer.removeAllMeshes()
  }

  if (!props.selectedObjectId || props.activeTool !== 'select') {
    gizmoManager.attachToMesh(null)
    gizmoManager.attachToNode(null)
    return
  }

  // Find target node in rootNodesMap
  let targetNode: Nullable<TransformNode> = null
  for (const [key, node] of rootNodesMap.entries()) {
    if (node.metadata?.id === props.selectedObjectId) {
      targetNode = node
      break
    }
  }

  // If selecting a roof segment
  if (!targetNode && props.selectedObjectType === 'roof') {
    for (const [, mesh] of segmentMeshes.entries()) {
      if (mesh.metadata?.id === props.selectedObjectId) {
        targetNode = mesh
        break
      }
    }
  }

  if (targetNode) {
    // Add highlight
    if (highlightLayer) {
      if (targetNode instanceof Mesh) {
        highlightLayer.addMesh(targetNode, new Color3(0.06, 0.82, 0.95))
      } else {
        targetNode.getChildMeshes().forEach(child => {
          if (child instanceof Mesh) {
            highlightLayer?.addMesh(child, new Color3(0.06, 0.82, 0.95))
          }
        })
      }
    }

    // Attach Gizmo
    const isRoof = props.selectedObjectType === 'roof'
    const isLocked = props.lockedObjectIds?.includes(props.selectedObjectId)

    if (isLocked || isRoof) {
      gizmoManager.positionGizmoEnabled = false
      gizmoManager.rotationGizmoEnabled = false
      gizmoManager.scaleGizmoEnabled = false
      gizmoManager.attachToNode(null)
      return
    }

    // Attach gizmo to root node
    if (targetNode instanceof Mesh) {
      gizmoManager.attachToMesh(targetNode)
    } else {
      gizmoManager.attachToNode(targetNode)
    }

    // Configure gizmo modes based on transformMode prop
    gizmoManager.positionGizmoEnabled = props.transformMode === 'move'
    gizmoManager.rotationGizmoEnabled = props.transformMode === 'rotate'
    // Scale gizmo enabled for trees & obstructions, but blocked for panels to preserve physical specifications
    gizmoManager.scaleGizmoEnabled = props.transformMode === 'scale' && props.selectedObjectType !== 'panel'

    // Attach gizmo drag listeners to emit object-transformed
    if (gizmoManager.gizmos.positionGizmo) {
      gizmoManager.gizmos.positionGizmo.xGizmo.dragBehavior.onDragEndObservable.add(() => emitTransform(targetNode!))
      gizmoManager.gizmos.positionGizmo.yGizmo.dragBehavior.onDragEndObservable.add(() => emitTransform(targetNode!))
      gizmoManager.gizmos.positionGizmo.zGizmo.dragBehavior.onDragEndObservable.add(() => emitTransform(targetNode!))
    }
    if (gizmoManager.gizmos.rotationGizmo) {
      gizmoManager.gizmos.rotationGizmo.yGizmo.dragBehavior.onDragEndObservable.add(() => emitTransform(targetNode!))
    }
    if (gizmoManager.gizmos.scaleGizmo) {
      gizmoManager.gizmos.scaleGizmo.uniformScaleGizmo.dragBehavior.onDragEndObservable.add(() => emitTransform(targetNode!))
    }
  } else {
    gizmoManager.attachToMesh(null)
    gizmoManager.attachToNode(null)
  }
}

function emitTransform(node: TransformNode) {
  if (!node.metadata) return
  const pos = node.position
  const rotY = node.rotation.y
  const scale = node.scaling
  emit('object-transformed', {
    id: node.metadata.id,
    type: node.metadata.type,
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotationY: rotY,
    scale: { x: scale.x, y: scale.y, z: scale.z }
  })
}

/**
 * 8. Setup Interactive Pointer Raycasting.
 */
let draggingVertexIndex: number | null = null

function setupPointerInteractions() {
  if (!scene) return

  scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
    switch (pointerInfo.type) {
      case PointerEventTypes.POINTERDOWN:
        handlePointerDown(pointerInfo)
        break
      case PointerEventTypes.POINTERMOVE:
        handlePointerMove(pointerInfo)
        break
      case PointerEventTypes.POINTERUP:
        handlePointerUp()
        break
    }
  })
}

function updatePanelPreview(x: number, y: number, z: number, valid: boolean) {
  if (!scene) return
  if (!previewPanelRoot) {
    previewPanelRoot = new TransformNode('preview_panel_root', scene)
    previewPanelMesh = MeshBuilder.CreateBox('preview_panel_mesh', { width: 1.1, depth: 2.2, height: 0.04 }, scene)
    previewPanelMesh.position.y = 0.04 / 2
    previewPanelMesh.parent = previewPanelRoot
    previewPanelMesh.isPickable = false

    previewPanelFrameMesh = MeshBuilder.CreateBox('preview_panel_frame', { width: 1.134, depth: 2.278, height: 0.035 }, scene)
    previewPanelFrameMesh.position.y = 0.035 / 2
    previewPanelFrameMesh.parent = previewPanelRoot
    previewPanelFrameMesh.material = panelFrameMaterial
    previewPanelFrameMesh.isPickable = false
  }

  const isLandscape = props.panelOrientation === 'landscape'
  const w = isLandscape ? (props.panelLengthM || 2.278) : (props.panelWidthM || 1.134)
  const l = isLandscape ? (props.panelWidthM || 1.134) : (props.panelLengthM || 2.278)

  previewPanelMesh!.scaling = new Vector3(w - 0.03, 1, l - 0.03)
  previewPanelFrameMesh!.scaling = new Vector3(w, 1, l)

  // Snap preview root directly to exact mathematical roof surface
  const surf = getRoofSurfaceAtLocalPoint(x, z, props.roofModel, scene)
  previewPanelRoot.position = new Vector3(x, surf.y, z).add(surf.normal.scale(DEFAULT_MOUNTING_CLEARANCE_M))

  const inPlaneRot = isLandscape ? Math.PI / 2 : 0
  previewPanelRoot.rotationQuaternion = computePanelRotationQuaternion(surf.normal, inPlaneRot)

  previewPanelMesh!.material = valid ? previewMaterialValid : previewMaterialInvalid
  previewPanelRoot.setEnabled(true)
}

function handlePointerDown(pointerInfo: PointerInfo) {
  if (!scene || pointerInfo.event.button !== 0) return // Left click only

  const pickResult = scene.pick(scene.pointerX, scene.pointerY)
  if (!pickResult || !pickResult.hit) return

  const pickedMesh = pickResult.pickedMesh
  const hitPoint = pickResult.pickedPoint

  // A. EDIT ROOF MODE: Drag or pick vertex handle
  if (props.activeTool === 'edit_roof') {
    if (pickedMesh && pickedMesh.metadata?.type === 'roof_vertex') {
      draggingVertexIndex = pickedMesh.metadata.vertexIndex
      if (camera) camera.detachControl()
      pickedMesh.material = vertexHandleActiveMat
      return
    }
  }

  // B. ADD TREE MODE
  if (props.activeTool === 'add_tree' && hitPoint) {
    emit('place-object', {
      type: 'tree',
      x: Number(hitPoint.x.toFixed(3)),
      y: Number(Math.max(0, hitPoint.y).toFixed(3)),
      z: Number(hitPoint.z.toFixed(3))
    })
    return
  }

  // C. ADD OBSTRUCTION MODE
  if (props.activeTool === 'add_obstruction' && hitPoint) {
    emit('place-object', {
      type: 'obstruction',
      subType: props.pendingObstructionType,
      x: Number(hitPoint.x.toFixed(3)),
      y: Number(Math.max(0, hitPoint.y).toFixed(3)),
      z: Number(hitPoint.z.toFixed(3))
    })
    return
  }

  // D. ADD PANEL MODE
  if (props.activeTool === 'add_panel') {
    // Raycast only on roof surface (never GridDatum for solar panels!)
    const roofPick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name.startsWith('RoofSegment'))
    if (roofPick && roofPick.hit && roofPick.pickedPoint) {
      let finalX = roofPick.pickedPoint.x
      let finalZ = roofPick.pickedPoint.z

      const isLandscape = props.panelOrientation === 'landscape'
      const curW = isLandscape ? (props.panelLengthM || 2.278) : (props.panelWidthM || 1.134)
      const curL = isLandscape ? (props.panelWidthM || 1.134) : (props.panelLengthM || 2.278)

      if (props.snapEnabled) {
        const snapped = snapPanelPosition(
          finalX,
          finalZ,
          curW,
          curL,
          props.panelSpacingM || 0.05,
          currentPanelsList.value
        )
        finalX = snapped.x
        finalZ = snapped.z
      }

      // Exact mathematical roof surface contact point at (finalX, finalZ)
      const surf = getRoofSurfaceAtLocalPoint(finalX, finalZ, props.roofModel, scene)
      if (!surf.isValid) return

      emit('place-object', {
        type: 'panel',
        orientation: props.panelOrientation,
        x: Number(finalX.toFixed(3)),
        y: Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4)),
        z: Number(finalZ.toFixed(3))
      })
      return
    }
  }

  // D2. ADD ROOF FEATURE MODE (Installer-Controlled Rooftop Feature Workflow)
  if (props.activeTool === 'add_feature') {
    // Raycast strictly against reconstructed RoofSegment (Never ground/grid/fixed Y!)
    const roofPick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name.startsWith('RoofSegment'))
    if (roofPick && roofPick.hit && roofPick.pickedPoint) {
      const hitPt = roofPick.pickedPoint
      const surf = getRoofSurfaceAtLocalPoint(hitPt.x, hitPt.z, props.roofModel, scene)
      if (surf.isValid) {
        emit('request-add-feature', {
          x: Number(hitPt.x.toFixed(3)),
          y: Number(surf.y.toFixed(4)),
          z: Number(hitPt.z.toFixed(3)),
          roofSegmentId: surf.segmentId,
          segmentIndex: surf.segmentIndex,
          normal: [surf.normal.x, surf.normal.y, surf.normal.z],
          pitchDeg: surf.pitchDeg
        })
        return
      }
    }
  }

  // E. MEASURE MODE
  if (props.activeTool === 'measure' && hitPoint) {
    handleMeasureClick(hitPoint)
    return
  }

  // F. SELECT MODE: Direct Drag or Raycast Selection
  if (props.activeTool === 'select') {
    if (pickedMesh) {
      const root = (pickedMesh.parent instanceof TransformNode && (pickedMesh.parent as any).metadata)
        ? (pickedMesh.parent as TransformNode)
        : (pickedMesh.metadata ? pickedMesh : null)

      if (root && root.metadata && ['panel', 'tree', 'obstruction', 'roof_feature'].includes(root.metadata.type)) {
        emit('select-object', {
          id: root.metadata.id,
          type: root.metadata.type,
          rawData: root.metadata.data
        })
        draggedNode = root
        dragStartPointerX = scene.pointerX
        dragStartPointerY = scene.pointerY
        dragHasMoved = false
        isDirectDragging = true
        if (camera) camera.detachControl()
        return
      } else if (pickedMesh.metadata?.type === 'roof') {
        emit('select-object', {
          id: pickedMesh.metadata.id,
          type: 'roof',
          rawData: pickedMesh.metadata.data
        })
        return
      } else if (pickedMesh.name === 'GridDatum') {
        emit('clear-selection')
      }
    } else {
      emit('clear-selection')
    }
  }
}

function handlePointerMove(pointerInfo: PointerInfo) {
  if (!scene) return

  // A. Edit Roof Vertex Dragging
  if (draggingVertexIndex !== null && props.activeTool === 'edit_roof') {
    const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh.name === 'GridDatum' || mesh.name.startsWith('RoofSegment'))
    if (pickResult && pickResult.hit && pickResult.pickedPoint) {
      const pt = pickResult.pickedPoint
      const handleMesh = vertexHandleMeshes[draggingVertexIndex]
      if (handleMesh) {
        handleMesh.position.x = pt.x
        handleMesh.position.z = pt.z
      }
    }
    return
  }

  // B. Direct Dragging of Selected Object Across Roof (CAD Style)
  if (isDirectDragging && draggedNode) {
    const dist = Math.hypot(scene.pointerX - dragStartPointerX, scene.pointerY - dragStartPointerY)
    if (dist > 3) {
      dragHasMoved = true
    }

    if (draggedNode.metadata?.type === 'panel') {
      const pickResult = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name.startsWith('RoofSegment'))
      if (pickResult && pickResult.hit && pickResult.pickedPoint) {
        let targetX = pickResult.pickedPoint.x
        let targetZ = pickResult.pickedPoint.z

        const pData = draggedNode.metadata.data || {}
        const w = pData.widthM || props.panelWidthM || 1.134
        const l = pData.lengthM || props.panelLengthM || 2.278

        if (props.snapEnabled) {
          const snapped = snapPanelPosition(
            targetX,
            targetZ,
            w,
            l,
            props.panelSpacingM || 0.05,
            currentPanelsList.value,
            draggedNode.metadata.id
          )
          targetX = snapped.x
          targetZ = snapped.z
        }

        const surf = getRoofSurfaceAtLocalPoint(targetX, targetZ, props.roofModel, scene)
        const surfNormal = surf.normal
        const rotY = pData.rotationY || 0

        draggedNode.position = new Vector3(targetX, surf.y, targetZ).add(surfNormal.scale(DEFAULT_MOUNTING_CLEARANCE_M))
        draggedNode.rotationQuaternion = computePanelRotationQuaternion(surfNormal, rotY)

        if (pData) {
          pData.x = targetX
          pData.y = Number((surf.y + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4))
          pData.z = targetZ
          pData.normal = [surfNormal.x, surfNormal.y, surfNormal.z]
          pData.tiltPitchDeg = surf.pitchDeg
        }
      }
    } else if (draggedNode.metadata?.type === 'roof_feature') {
      // Feature follows and slides across the actual roof surface
      const pickResult = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name.startsWith('RoofSegment'))
      if (pickResult && pickResult.hit && pickResult.pickedPoint) {
        const targetX = pickResult.pickedPoint.x
        const targetZ = pickResult.pickedPoint.z
        const fData = draggedNode.metadata.data || {}
        const surf = getRoofSurfaceAtLocalPoint(targetX, targetZ, props.roofModel, scene)
        if (surf.isValid) {
          const surfNormal = surf.normal
          const rotDeg = fData.rotationDeg !== undefined ? fData.rotationDeg : (fData.rotationY ? (fData.rotationY * 180) / Math.PI : 0)
          const rotY = (rotDeg * Math.PI) / 180

          draggedNode.position = new Vector3(targetX, surf.y, targetZ)
          draggedNode.rotationQuaternion = computePanelRotationQuaternion(surfNormal, rotY)

          if (fData) {
            if (!fData.position) fData.position = {}
            fData.position.x = Number(targetX.toFixed(3))
            fData.position.y = Number(surf.y.toFixed(4))
            fData.position.z = Number(targetZ.toFixed(3))
            fData.normal = [surfNormal.x, surfNormal.y, surfNormal.z]
            fData.tiltPitchDeg = surf.pitchDeg
            fData.roofSegmentId = surf.segmentId
            fData.segmentIndex = surf.segmentIndex

            const centerLat = props.roofModel?.origin?.latitude || props.roofModel?.building?.center?.latitude || 6.7497
            const centerLng = props.roofModel?.origin?.longitude || props.roofModel?.building?.center?.longitude || 125.3572
            const coords = localMetersToLatLng(targetX, targetZ, centerLat, centerLng)
            fData.latitude = coords.lat
            fData.longitude = coords.lng
          }
        }
      }
    } else {
      const pickResult = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name.startsWith('RoofSegment') || m.name === 'GridDatum')
      if (pickResult && pickResult.hit && pickResult.pickedPoint) {
        draggedNode.position.x = pickResult.pickedPoint.x
        draggedNode.position.y = Math.max(0, pickResult.pickedPoint.y)
        draggedNode.position.z = pickResult.pickedPoint.z
      }
    }
    return
  }

  // C. Add Panel Live Preview & Cursor Snapping
  if (props.activeTool === 'add_panel') {
    const pickResult = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name.startsWith('RoofSegment'))
    if (pickResult && pickResult.hit && pickResult.pickedPoint) {
      let candX = pickResult.pickedPoint.x
      let candZ = pickResult.pickedPoint.z

      const isLandscape = props.panelOrientation === 'landscape'
      const curW = isLandscape ? (props.panelLengthM || 2.278) : (props.panelWidthM || 1.134)
      const curL = isLandscape ? (props.panelWidthM || 1.134) : (props.panelLengthM || 2.278)

      if (props.snapEnabled) {
        const snapped = snapPanelPosition(
          candX,
          candZ,
          curW,
          curL,
          props.panelSpacingM || 0.05,
          currentPanelsList.value
        )
        candX = snapped.x
        candZ = snapped.z
      }

      const surf = getRoofSurfaceAtLocalPoint(candX, candZ, props.roofModel, scene)
      const candY = surf.y

      const seg = props.roofModel?.roofSegments?.[0]
      const halfLen = seg?.vertices ? Math.floor(seg.vertices.length / 2) : 0
      const roofPoly = (seg?.vertices && halfLen >= 3)
        ? seg.vertices.slice(0, halfLen).map(v => ({ x: v.x, z: v.z }))
        : (props.roofModel?.geometry?.segments?.[0]?.polygon2D || [])

      const candidatePanel: PlacedSolarPanel = {
        id: 'preview',
        x: candX,
        y: Number((candY + DEFAULT_MOUNTING_CLEARANCE_M).toFixed(4)),
        z: candZ,
        widthM: curW,
        lengthM: curL,
        thicknessM: 0.04,
        rotationY: isLandscape ? Math.PI / 2 : 0,
        tiltPitchDeg: surf.pitchDeg,
        normal: [surf.normal.x, surf.normal.y, surf.normal.z],
        wattageW: props.panelWattageW || 550,
        status: 'VALID'
      }

      const shadows = (props.shadingAssessment?.shadowPolygons || []).map(s => ({
        points: s.points.map(pt => ({ x: pt.x, z: pt.z }))
      }))

      const val = validateIndividualPanel(
        candidatePanel,
        roofPoly,
        props.panelSetbackM || 0.5,
        currentObstaclesList.value,
        shadows,
        currentPanelsList.value,
        props.shadowExclusionEnabled || false
      )

      updatePanelPreview(candX, candY, candZ, val.isValid)
      previewStatus.value = {
        visible: true,
        isValid: val.isValid,
        reason: val.reason || (val.isValid ? 'Valid location' : 'Cannot place panel here'),
        x: candX,
        y: candY,
        z: candZ
      }
      emit('preview-hover', {
        isValid: val.isValid,
        reason: val.reason,
        x: candX,
        y: candY,
        z: candZ
      })
    } else {
      if (previewPanelRoot) previewPanelRoot.setEnabled(false)
      previewStatus.value = null
      emit('preview-hover', null)
    }
  } else {
    if (previewPanelRoot) previewPanelRoot.setEnabled(false)
    if (previewStatus.value) previewStatus.value = null
  }
}

function handlePointerUp() {
  if (draggingVertexIndex !== null && canvasRef.value && camera) {
    camera.attachControl(canvasRef.value, true)
    const handleMesh = vertexHandleMeshes[draggingVertexIndex]
    if (handleMesh) {
      handleMesh.material = vertexHandleMat
      emit('vertex-moved', {
        vertexIndex: draggingVertexIndex,
        x: Number(handleMesh.position.x.toFixed(3)),
        z: Number(handleMesh.position.z.toFixed(3))
      })
    }
    draggingVertexIndex = null
  }

  if (isDirectDragging && draggedNode) {
    if (canvasRef.value && camera) {
      camera.attachControl(canvasRef.value, true)
    }
    if (dragHasMoved) {
      emitTransform(draggedNode)
    }
    draggedNode = null
    isDirectDragging = false
  }
}

function handleMeasureClick(point: Vector3) {
  if (!scene) return

  if (!measurePointA) {
    measurePointA = point.clone()
    if (measurePointAMesh) measurePointAMesh.dispose()
    measurePointAMesh = MeshBuilder.CreateSphere('measureA', { diameter: 0.4 }, scene)
    measurePointAMesh.position = measurePointA
    measurePointAMesh.material = measurePointMat

    if (measurementLineMesh) {
      measurementLineMesh.dispose()
      measurementLineMesh = null
    }
    if (measurePointBMesh) {
      measurePointBMesh.dispose()
      measurePointBMesh = null
    }
    currentMeasuredDistance.value = null
  } else {
    measurePointB = point.clone()
    if (measurePointBMesh) measurePointBMesh.dispose()
    measurePointBMesh = MeshBuilder.CreateSphere('measureB', { diameter: 0.4 }, scene)
    measurePointBMesh.position = measurePointB
    measurePointBMesh.material = measurePointMat

    // Draw Line between Point A and Point B
    if (measurementLineMesh) measurementLineMesh.dispose()
    measurementLineMesh = MeshBuilder.CreateLines('measureLine', {
      points: [measurePointA, measurePointB]
    }, scene)
    measurementLineMesh.color = new Color3(1.0, 0.65, 0.0) // Orange measurement line

    const dist = Number(Vector3.Distance(measurePointA, measurePointB).toFixed(2))
    currentMeasuredDistance.value = dist
    emit('measure-distance', dist)

    measurePointA = null // Reset for next measurement
    measurePointB = null
  }
}

// Camera Controls
function setCameraPreset(preset: 'top' | 'front' | 'side' | 'fit' | 'reset') {
  if (!camera) return
  switch (preset) {
    case 'top':
      camera.alpha = -Math.PI / 2
      camera.beta = 0.001
      camera.radius = 32
      camera.target = new Vector3(0, 3.5, 0)
      break
    case 'front':
      camera.alpha = -Math.PI / 2
      camera.beta = Math.PI / 2
      camera.radius = 32
      camera.target = new Vector3(0, 3.5, 0)
      break
    case 'side':
      camera.alpha = 0
      camera.beta = Math.PI / 2
      camera.radius = 32
      camera.target = new Vector3(0, 3.5, 0)
      break
    case 'fit':
    case 'reset':
      fitCameraToRoof()
      break
  }
}

function fitCameraToRoof() {
  if (!camera) return
  camera.target = new Vector3(0, 3.5, 0)
  camera.radius = 28
  camera.alpha = -Math.PI / 3
  camera.beta = Math.PI / 3.2
  emit('reset-camera')
}



// 1. Selection & Gizmo Transform Watcher (Never recreates 3D meshes)
watch(
  () => [props.selectedObjectId, props.selectedObjectType, props.transformMode, props.lockedObjectIds],
  () => {
    updateGizmoAndSelection()
  }
)

// 2. Active Tool Watcher
watch(
  () => props.activeTool,
  (tool) => {
    buildRoofVertexHandles()
    updateGizmoAndSelection()
    if (tool !== 'add_panel' && previewPanelRoot) {
      previewPanelRoot.setEnabled(false)
      previewStatus.value = null
    }
  }
)

// 3. Roof Structure / Geometry Watcher
watch(
  () => [
    props.roofModel?.roofSegments?.[0]?.pitchDegrees,
    props.roofModel?.roofSegments?.[0]?.azimuthDegrees,
    props.roofModel?.roofSegments?.[0]?.vertices?.length,
    roofStructureType.value,
    roofPitchDegrees.value,
    roofAzimuthDegrees.value
  ],
  () => {
    buildExactRoofMesh()
    buildSetbackOutline()
    buildRoofVertexHandles()
    buildPlacedSolarPanels()
    buildRooftopFeatures()
  }
)

// 4. Solar Panels Count / Dimensions Watcher
watch(
  () => [
    currentPanelsList.value.length,
    props.showPanels,
    props.panelOrientation,
    props.panelWidthM,
    props.panelLengthM
  ],
  () => {
    buildPlacedSolarPanels()
    updateGizmoAndSelection()
  }
)

// 5. Obstacles Count / Visibility Watcher
watch(
  () => [
    currentObstaclesList.value.length,
    props.hiddenObjectTypes?.length
  ],
  () => {
    buildObstacles()
    buildDynamicShadows()
    updateGizmoAndSelection()
  }
)

// 5b. Rooftop Features Watcher
watch(
  () => [
    currentFeaturesList.value.length,
    props.hiddenObjectTypes?.length,
    props.roofModel?.roofFeatures
  ],
  () => {
    buildRooftopFeatures()
    updateGizmoAndSelection()
  },
  { deep: true }
)

// 6. Shading & Shadows Watcher
watch(
  () => [
    props.shadingAssessment?.solarAltitudeDeg,
    props.shadingAssessment?.solarAzimuthDeg,
    props.showShadows
  ],
  () => {
    buildDynamicShadows()
  }
)

// 7. Setback Outline Watcher
watch(
  () => [
    props.showSetback,
    props.panelSetbackM
  ],
  () => {
    buildSetbackOutline()
  }
)

function handleContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (!scene) return
  const pick = scene.pick(scene.pointerX, scene.pointerY)
  let objId: string | null = null
  let objType: any = null
  if (pick && pick.hit && pick.pickedMesh) {
    const meta = pick.pickedMesh.metadata || (pick.pickedMesh.parent as any)?.metadata
    if (meta) {
      objId = meta.id
      objType = meta.type
      emit('select-object', { id: meta.id, type: meta.type, rawData: meta.data })
    }
  }
  if (!objId && props.selectedObjectId) {
    objId = props.selectedObjectId
    objType = props.selectedObjectType
  }
  contextMenuState.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    objectId: objId,
    objectType: objType
  }
}

function handleGlobalClick() {
  if (contextMenuState.value.visible) {
    contextMenuState.value.visible = false
  }
}

onMounted(() => {
  if (isDisposed) isDisposed = false
  initBabylon()
  if (canvasRef.value) {
    canvasRef.value.addEventListener('contextmenu', handleContextMenu)
  }
  window.addEventListener('click', handleGlobalClick)
})

onBeforeUnmount(() => {
  isDisposed = true
  isInitialized = false
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('click', handleGlobalClick)
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('contextmenu', handleContextMenu)
  }
  if (engine && renderLoop) {
    engine.stopRenderLoop(renderLoop)
  }
  if (gizmoManager) {
    gizmoManager.dispose()
    gizmoManager = null
  }
  clearAllMeshes()
  scene?.dispose()
  engine?.dispose()
  scene = null
  engine = null
})

defineExpose({
  setCameraPreset,
  fitCameraToRoof,
  setTopView: () => setCameraPreset('top'),
  setSolarDesignView: () => fitCameraToRoof(),
  getCanvas: () => canvasRef.value
})
</script>

<template>
  <div class="relative w-full h-full min-h-[350px] bg-slate-950 rounded-xl overflow-hidden select-none border border-slate-800">
    <!-- WebGL Canvas for Babylon.js -->
    <canvas ref="canvasRef" class="w-full h-full block focus:outline-none"></canvas>

    <!-- Top Left Overlay: Active Tool Indicator & Hint -->
    <div class="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
      <div class="bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-blue-500/40 shadow-xl text-white space-y-1">
        <div class="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>HELIOS-LOAD 3D ENGINE</span>
        </div>
        <div class="font-mono text-xs text-blue-200 font-semibold flex items-center gap-2">
          <span>TOOL: <strong class="text-white uppercase">{{ activeTool.replace('_', ' ') }}</strong></span>
          <span class="text-slate-600">|</span>
          <span>TRANSFORM: <strong class="text-cyan-300 uppercase">{{ transformMode || 'NONE' }}</strong></span>
        </div>
        <div v-if="currentMeasuredDistance !== null" class="text-[11px] font-mono text-amber-300 font-bold pt-0.5">
          Measured Distance: {{ currentMeasuredDistance }} m
        </div>
      </div>
    </div>

    <!-- Live Placement Tooltip Banner (CAD-Style Cursor / Status Banner) -->
    <div
      v-show="previewStatus && (activeTool === 'add_panel' || activeTool === 'add_tree' || activeTool === 'add_obstruction' || activeTool === 'add_feature')"
      class="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-150"
    >
      <div
        :class="[
          'px-4 py-1.5 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 border backdrop-blur-md font-sans tracking-wide',
          previewStatus?.isValid
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
            : 'bg-rose-950/90 text-rose-300 border-rose-500/60'
        ]"
      >
        <span class="text-sm font-black">{{ previewStatus?.isValid ? '✓' : '✕' }}</span>
        <span>{{ previewStatus?.isValid ? 'VALID PLACEMENT — Click to place' : (previewStatus?.reason || '') }}</span>
      </div>
    </div>

    <!-- Top Right Overlay: Floating Camera Controls -->
    <div class="absolute top-3 right-3 z-10 flex flex-col gap-2 pointer-events-auto items-end">
      <div class="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-xl">
        <button
          type="button"
          @click="setCameraPreset('top')"
          title="Top Overhead View (Orthogonal for 2D Layout)"
          class="px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          TOP
        </button>
        <button
          type="button"
          @click="fitCameraToRoof"
          title="Solar 3D Verification View"
          class="px-2 py-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
        >
          3D VIEW
        </button>
        <button
          type="button"
          @click="setCameraPreset('front')"
          title="Front Elevation View"
          class="px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          FRONT
        </button>
        <button
          type="button"
          @click="setCameraPreset('side')"
          title="Side Profile View"
          class="px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          SIDE
        </button>
        <div class="w-px h-3 bg-slate-700 mx-0.5"></div>
        <button
          type="button"
          @click="setCameraPreset('fit')"
          title="Fit Camera to Roof Geometry"
          class="px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          FIT
        </button>
      </div>

      <!-- Geometry Area Verification Badge -->
      <div
        v-if="roofAreaSqM > 0"
        class="bg-slate-950/90 backdrop-blur-md rounded-xl p-2.5 border border-slate-800 shadow-xl text-white text-[10px] font-mono space-y-1"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-slate-400">Map Area:</span>
          <span class="font-bold text-slate-100">{{ roofAreaSqM.toFixed(1) }} m²</span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-slate-400">Babylon Footprint:</span>
          <span class="font-bold text-slate-100">{{ babylonFootprintAreaM2.toFixed(1) }} m²</span>
        </div>
        <div class="flex items-center justify-between gap-3 pt-0.5 border-t border-slate-800">
          <span class="text-slate-400">Discrepancy:</span>
          <span :class="isGeometryAreaValid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'">
            {{ areaDifferencePercent }}%
          </span>
        </div>
      </div>
    </div>

    <!-- Bottom Left Overlay: Interactive 3D Legend -->
    <div class="absolute bottom-3 left-3 z-10 pointer-events-auto bg-slate-950/85 backdrop-blur-md rounded-xl p-2.5 border border-slate-800 shadow-xl text-white text-[10px] space-y-1">
      <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400 block mb-1">3D SCENE LEGEND</span>
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-xs bg-[#3d5475]"></span>
        <span class="text-slate-300">ROOF FOOTPRINT ({{ roofThicknessM }}m Thickness)</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-xs border border-cyan-400 bg-cyan-400/20"></span>
        <span class="text-slate-300">USABLE AREA ({{ setbackM }}m Setback)</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-xs bg-[#0a1128] border border-blue-400"></span>
        <span class="text-slate-300">SOLAR PANELS ({{ currentPanelsList.length }})</span>
      </div>
      <!-- Rooftop Features Legend (Requirement 14: Only display when count > 0) -->
      <div v-if="currentFeaturesCount > 0" class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-xs bg-[#c25e2a] border border-amber-400"></span>
        <span class="text-slate-300 font-medium">ROOFTOP FEATURES ({{ currentFeaturesCount }})</span>
      </div>
      <!-- Dynamic Trees Legend -->
      <div class="flex items-center gap-2">
        <span :class="['w-2.5 h-2.5 rounded-full', currentTreesCount > 0 ? 'bg-emerald-500' : 'bg-slate-600']"></span>
        <span class="text-slate-300 font-medium">TREES ({{ currentTreesCount }})</span>
      </div>
      <!-- Dynamic Obstructions Legend -->
      <div class="flex items-center gap-2">
        <span :class="['w-2.5 h-2.5 rounded-xs', currentNonTreeObstaclesCount > 0 ? 'bg-amber-500' : 'bg-slate-600']"></span>
        <span class="text-slate-300 font-medium">OBSTRUCTIONS ({{ currentNonTreeObstaclesCount }})</span>
      </div>
      <!-- Dynamic Shadow Legend -->
      <div class="flex items-center gap-2">
        <span :class="['w-2.5 h-2.5 rounded-xs border', (currentObstaclesList.length > 0 && shadingAssessment?.shadowPolygons?.length) ? 'bg-[#0f172a] opacity-60 border-slate-600' : 'bg-slate-800 border-slate-700 opacity-30']"></span>
        <span class="text-slate-300">
          {{ (currentObstaclesList.length > 0 && shadingAssessment && shadingAssessment.shadowPolygons?.length)
            ? `ESTIMATED SHADOW (Alt: ${shadingAssessment.solarAltitudeDeg}°, Az: ${shadingAssessment.solarAzimuthDeg}°)`
            : 'NO ESTIMATED SHADOW' }}
        </span>
      </div>
    </div>

    <!-- Right-Click CAD Context Menu -->
    <div
      v-if="contextMenuState.visible"
      :style="{ top: `${contextMenuState.y}px`, left: `${contextMenuState.x}px` }"
      class="fixed z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-1 shadow-2xl min-w-[170px] text-xs font-sans text-slate-200 select-none"
    >
      <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
        {{ contextMenuState.objectId ? `${contextMenuState.objectType}: ${contextMenuState.objectId}` : 'Canvas Actions' }}
      </div>

      <div v-if="contextMenuState.objectType === 'panel'" key="menu-panel">
        <button
          type="button"
          @click="() => { emit('rotate-90'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between text-cyan-300 transition-colors"
        >
          <span>Rotate 90°</span>
          <span class="text-[10px] text-slate-500 font-mono">E</span>
        </button>
        <button
          type="button"
          @click="() => { emit('duplicate-selected'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Duplicate</span>
          <span class="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
        </button>
        <button
          type="button"
          @click="() => { emit('extend-row', 4); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between text-blue-300 transition-colors"
        >
          <span>Extend Row (+4)</span>
          <span class="text-[10px] text-slate-500 font-mono">+4</span>
        </button>
        <div class="h-px bg-slate-800 my-1"></div>
        <button
          type="button"
          @click="() => { emit('delete-selected'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-rose-950/70 text-rose-300 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Delete Panel</span>
          <span class="text-[10px] text-slate-500 font-mono">Del</span>
        </button>
      </div>

      <div v-else-if="contextMenuState.objectType === 'roof_feature'" key="menu-roof-feature">
        <button
          type="button"
          @click="() => { emit('rotate-90'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between text-amber-300 transition-colors"
        >
          <span>Rotate 90°</span>
          <span class="text-[10px] text-slate-500 font-mono">E</span>
        </button>
        <button
          type="button"
          @click="() => { emit('duplicate-selected'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Duplicate</span>
          <span class="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
        </button>
        <div class="h-px bg-slate-800 my-1"></div>
        <button
          type="button"
          @click="() => { emit('delete-selected'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-rose-950/70 text-rose-300 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Delete Feature</span>
          <span class="text-[10px] text-slate-500 font-mono">Del</span>
        </button>
      </div>

      <div v-else-if="contextMenuState.objectId" key="menu-object">
        <button
          type="button"
          @click="() => { emit('duplicate-selected'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Duplicate</span>
          <span class="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
        </button>
        <button
          type="button"
          @click="() => { emit('delete-selected'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-rose-950/70 text-rose-300 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Delete</span>
          <span class="text-[10px] text-slate-500 font-mono">Del</span>
        </button>
      </div>

      <div v-else key="menu-canvas">
        <button
          type="button"
          @click="() => { setCameraPreset('top'); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Top 2D View</span>
        </button>
        <button
          type="button"
          @click="() => { fitCameraToRoof(); contextMenuState.visible = false; }"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors"
        >
          <span>Reset 3D View</span>
          <span class="text-[10px] text-slate-500 font-mono">F</span>
        </button>
      </div>
    </div>
  </div>
</template>

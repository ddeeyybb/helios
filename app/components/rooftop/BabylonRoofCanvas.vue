<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
  AbstractMesh,
  VertexData,
  PointerEventTypes,
  LinesMesh
} from '@babylonjs/core'
import type { RoofModel, RoofSegment, RoofObstacle, RoofVertex } from '~/types/roof'

const props = defineProps<{
  roofModel?: RoofModel | null
  selectedSegmentId?: string | null
  panelCount?: number
  panelWidthM?: number
  panelLengthM?: number
  panelOrientation?: 'portrait' | 'landscape'
  panelSpacingM?: number
  measurementMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-segment', segment: RoofSegment): void
  (e: 'measured-distance', distanceMeters: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: Engine | null = null
let scene: Scene | null = null
let camera: ArcRotateCamera | null = null

// Meshes collections
let segmentMeshes: Map<number, Mesh> = new Map()
let panelMeshes: Mesh[] = []
let obstacleMeshes: Mesh[] = []
let edgeMeshes: LinesMesh[] = []
let measurementLine: LinesMesh | null = null

// Measurement points in 3D
let measurePointA: Vector3 | null = null
let measurePointB: Vector3 | null = null

// Materials
let defaultSegmentMaterial: StandardMaterial | null = null
let selectedSegmentMaterial: StandardMaterial | null = null
let obstacleMaterial: StandardMaterial | null = null
let panelMaterial: StandardMaterial | null = null

function initBabylon() {
  if (!canvasRef.value || !import.meta.client) return

  try {
    engine = new Engine(canvasRef.value, true, { preserveDrawingBuffer: true, stencil: true })
    scene = new Scene(engine)
    scene.clearColor = new Color4(0.94, 0.96, 0.98, 1)

    // Engineering Orbit Camera
    camera = new ArcRotateCamera(
      'RoofEngineeringCamera',
      -Math.PI / 3,
      Math.PI / 3.2,
      25,
      new Vector3(0, 3, 0),
      scene
    )
    camera.attachControl(canvasRef.value, true)
    camera.lowerRadiusLimit = 4
    camera.upperRadiusLimit = 80
    camera.wheelPrecision = 35

    // Lighting (Sunlight + Ambient)
    const hemiLight = new HemisphericLight('HemiLight', new Vector3(0, 1, 0), scene)
    hemiLight.intensity = 0.8
    hemiLight.groundColor = new Color3(0.82, 0.84, 0.9)

    const sunLight = new DirectionalLight('SunLight', new Vector3(-1, -2, -1), scene)
    sunLight.position = new Vector3(15, 30, 15)
    sunLight.intensity = 1.1

    // Ground Grid Datum Plane (Local coordinate reference)
    const ground = MeshBuilder.CreateGround('GridDatum', { width: 50, height: 50, subdivisions: 25 }, scene)
    const groundMat = new StandardMaterial('GroundMat', scene)
    groundMat.diffuseColor = new Color3(0.9, 0.92, 0.95)
    groundMat.wireframe = true
    ground.material = groundMat
    ground.position.y = -0.05
    ground.isPickable = false

    // Initialize Materials
    defaultSegmentMaterial = new StandardMaterial('DefaultRoofSegMat', scene)
    defaultSegmentMaterial.diffuseColor = new Color3(0.25, 0.35, 0.48) // Technical slate blue
    defaultSegmentMaterial.specularColor = new Color3(0.15, 0.15, 0.15)
    defaultSegmentMaterial.backFaceCulling = false

    selectedSegmentMaterial = new StandardMaterial('SelectedRoofSegMat', scene)
    selectedSegmentMaterial.diffuseColor = new Color3(0.15, 0.55, 0.95) // Bright active engineering blue
    selectedSegmentMaterial.emissiveColor = new Color3(0.05, 0.15, 0.25)
    selectedSegmentMaterial.specularColor = new Color3(0.3, 0.3, 0.3)
    selectedSegmentMaterial.backFaceCulling = false

    obstacleMaterial = new StandardMaterial('ObstacleMat', scene)
    obstacleMaterial.diffuseColor = new Color3(0.9, 0.45, 0.15) // Warning orange
    obstacleMaterial.specularColor = new Color3(0.2, 0.2, 0.2)

    panelMaterial = new StandardMaterial('PvPanelMat', scene)
    panelMaterial.diffuseColor = new Color3(0.1, 0.15, 0.28) // Monocrystalline dark blue
    panelMaterial.specularColor = new Color3(0.7, 0.8, 0.95) // Monocrystalline glass sheen

    // Setup Mesh Raycasting & Interaction
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.pickInfo?.hit) {
        handleMeshClick(pointerInfo.pickInfo.pickedMesh, pointerInfo.pickInfo.pickedPoint)
      }
    })

    // Build the 3D roof
    buildRoofMeshes()

    engine.runRenderLoop(() => {
      if (scene && scene.activeCamera) {
        scene.render()
      }
    })

    window.addEventListener('resize', onWindowResize)
  } catch (err) {
    console.error('Babylon.js initialization error:', err)
  }
}

function onWindowResize() {
  if (engine) engine.resize()
}

function clearAllMeshes() {
  segmentMeshes.forEach(mesh => mesh.dispose())
  segmentMeshes.clear()

  panelMeshes.forEach(mesh => mesh.dispose())
  panelMeshes = []

  obstacleMeshes.forEach(mesh => mesh.dispose())
  obstacleMeshes = []

  edgeMeshes.forEach(mesh => mesh.dispose())
  edgeMeshes = []

  if (measurementLine) {
    measurementLine.dispose()
    measurementLine = null
  }
}

function buildRoofMeshes() {
  if (!scene) return
  clearAllMeshes()

  const model = props.roofModel
  if (!model || !model.geometry || !model.geometry.segments || model.geometry.segments.length === 0) {
    return
  }

  // 1. Build One Discrete Babylon Mesh Per Roof Segment (Requirement 18)
  model.geometry.segments.forEach((segGeom) => {
    const segIdx = segGeom.segmentIndex
    const segMesh = new Mesh(`roof-segment-${segIdx}`, scene)

    const positions: number[] = []
    const indices: number[] = []
    const normals: number[] = []

    // Push local coordinates
    segGeom.vertices.forEach(v => {
      positions.push(v.x, v.y, v.z)
    })

    // Construct triangulated indices
    if (segGeom.vertices.length >= 4) {
      // 2 triangles: (0, 1, 2) and (0, 2, 3)
      indices.push(0, 1, 2, 0, 2, 3)
      // Double sided indices
      indices.push(0, 2, 1, 0, 3, 2)
    } else if (segGeom.vertices.length === 3) {
      indices.push(0, 1, 2, 0, 2, 1)
    }

    VertexData.ComputeNormals(positions, indices, normals)

    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.indices = indices
    vertexData.normals = normals
    vertexData.applyToMesh(segMesh)

    // Check if this segment is selected
    const isSelected = props.selectedSegmentId === `seg-${segIdx}`
    segMesh.material = isSelected ? selectedSegmentMaterial : defaultSegmentMaterial
    segMesh.isPickable = true

    segmentMeshes.set(segIdx, segMesh)

    // Draw segment boundary edges (Ridge, Valley, Eave wireframe lines)
    if (segGeom.vertices.length >= 4) {
      const boundaryPts = [
        new Vector3(segGeom.vertices[0]!.x, segGeom.vertices[0]!.y + 0.02, segGeom.vertices[0]!.z),
        new Vector3(segGeom.vertices[1]!.x, segGeom.vertices[1]!.y + 0.02, segGeom.vertices[1]!.z),
        new Vector3(segGeom.vertices[2]!.x, segGeom.vertices[2]!.y + 0.02, segGeom.vertices[2]!.z),
        new Vector3(segGeom.vertices[3]!.x, segGeom.vertices[3]!.y + 0.02, segGeom.vertices[3]!.z),
        new Vector3(segGeom.vertices[0]!.x, segGeom.vertices[0]!.y + 0.02, segGeom.vertices[0]!.z)
      ]
      const edgeLine = MeshBuilder.CreateLines(`edge-seg-${segIdx}`, { points: boundaryPts }, scene)
      edgeLine.color = new Color3(0.2, 0.28, 0.38)
      edgeLine.isPickable = false
      edgeMeshes.push(edgeLine)
    }
  })

  // 2. Build Roof Obstacles in the SAME Coordinate System (Requirement 22)
  if (model.obstacles && model.obstacles.length > 0) {
    model.obstacles.forEach((obs, index) => {
      const w = obs.widthM || 1.0
      const l = obs.lengthM || 1.0
      const h = obs.heightM || 0.8

      const obsMesh = MeshBuilder.CreateBox(`obstacle-${index}-${obs.type}`, { width: w, depth: l, height: h }, scene)
      obsMesh.material = obstacleMaterial
      obsMesh.position = new Vector3(obs.position.x, obs.position.y + h / 2, obs.position.z)
      if (obs.rotationY) obsMesh.rotation.y = obs.rotationY

      obstacleMeshes.push(obsMesh)
    })
  }

  // 3. Build Solar Panels Mounted Directly on Selected Roof Segment Surface (Requirement 23 & 24)
  buildSolarPanels()

  // Frame the camera to fit the full roof geometry
  fitCameraToRoof()
}

function buildSolarPanels() {
  if (!scene || !props.roofModel || (props.panelCount ?? 0) <= 0) return

  panelMeshes.forEach(m => m.dispose())
  panelMeshes = []

  const model = props.roofModel
  const segments = model.geometry.segments
  if (segments.length === 0) return

  // Identify target segment (either selected segment or primary South-facing segment)
  let targetSeg = segments[0]
  if (props.selectedSegmentId) {
    const found = segments.find(s => `seg-${s.segmentIndex}` === props.selectedSegmentId)
    if (found) targetSeg = found
  } else {
    // Pick segment with highest solar potential or South azimuth
    const southFacing = segments.find(s => s.azimuthDegrees >= 135 && s.azimuthDegrees <= 225)
    if (southFacing) targetSeg = southFacing
  }

  if (!targetSeg) return

  const isPortrait = props.panelOrientation !== 'landscape'
  const pWidth = isPortrait ? (props.panelWidthM || 1.05) : (props.panelLengthM || 2.1)
  const pLength = isPortrait ? (props.panelLengthM || 2.1) : (props.panelWidthM || 1.05)
  const spacing = props.panelSpacingM || 0.05
  const count = props.panelCount || 18

  // Calculate panel placement on the segment plane
  const segCenter = targetSeg.center
  const pitchRad = (targetSeg.pitchDegrees * Math.PI) / 180
  const azRad = (targetSeg.azimuthDegrees * Math.PI) / 180

  const cols = Math.min(count, Math.max(2, Math.floor(Math.sqrt(count * 1.5))))
  const rows = Math.ceil(count / cols)

  let placed = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (placed >= count) break

      const panel = MeshBuilder.CreateBox(
        `pv-panel-${placed}`,
        { width: pWidth, depth: pLength, height: 0.05 },
        scene
      )
      panel.material = panelMaterial

      // Grid offsets centered on the roof plane
      const u = (c - (cols - 1) / 2) * (pWidth + spacing)
      const v = (r - (rows - 1) / 2) * (pLength + spacing)

      // Transform grid (u, v) into tilted 3D roof plane coordinates
      const sinAz = Math.sin(azRad)
      const cosAz = Math.cos(azRad)
      const cosPitch = Math.cos(pitchRad)
      const sinPitch = Math.sin(pitchRad)

      // Local offsets relative to segment center
      const dx = u * cosAz - v * sinAz * cosPitch
      const dz = -u * sinAz - v * cosAz * cosPitch
      const dy = v * sinPitch + 0.1 // 10cm racking standoff above roof surface

      panel.position = new Vector3(
        segCenter.x + dx,
        segCenter.y + dy,
        segCenter.z + dz
      )

      // Tilted with roof plane
      panel.rotation.x = pitchRad * Math.cos(azRad)
      panel.rotation.z = -pitchRad * Math.sin(azRad)
      panel.rotation.y = azRad

      panelMeshes.push(panel)
      placed++
    }
  }
}

function handleMeshClick(pickedMesh: AbstractMesh | null | undefined, pickedPoint: Vector3 | null | undefined) {
  if (!pickedMesh) return

  // Measurement tool mode (Requirement 21)
  if (props.measurementMode && pickedPoint) {
    if (!measurePointA) {
      measurePointA = pickedPoint.clone()
    } else {
      measurePointB = pickedPoint.clone()
      const dist = Vector3.Distance(measurePointA, measurePointB)
      emit('measured-distance', Number(dist.toFixed(2)))

      // Draw measurement line
      if (measurementLine) measurementLine.dispose()
      measurementLine = MeshBuilder.CreateLines(
        'measurementLine',
        { points: [measurePointA, measurePointB] },
        scene
      )
      measurementLine.color = new Color3(1, 0.8, 0) // Yellow line

      // Reset for next measurement
      measurePointA = null
      measurePointB = null
    }
    return
  }

  // Segment picking
  const name = pickedMesh.name
  if (name.startsWith('roof-segment-')) {
    const idxStr = name.replace('roof-segment-', '')
    const segIdx = parseInt(idxStr, 10)
    const segment = props.roofModel?.roofSegments.find(s => s.segmentIndex === segIdx)
    if (segment) {
      emit('select-segment', segment)
    }
  }
}

function fitCameraToRoof() {
  if (!camera || !props.roofModel?.geometry?.bounds) return
  const bounds = props.roofModel.geometry.bounds

  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2

  const sizeX = bounds.maxX - bounds.minX
  const sizeZ = bounds.maxZ - bounds.minZ
  const maxDim = Math.max(sizeX, sizeZ, 12)

  camera.target = new Vector3(centerX, centerY, centerZ)
  camera.radius = maxDim * 1.8
}

// Camera View Presets (Requirement 20)
function setViewPreset(preset: 'top' | '3d' | 'north' | 'south' | 'east' | 'west' | 'fit') {
  if (!camera) return

  switch (preset) {
    case 'top':
      camera.alpha = -Math.PI / 2
      camera.beta = 0.01 // Straight down
      break
    case '3d':
      camera.alpha = -Math.PI / 3
      camera.beta = Math.PI / 3.2
      break
    case 'north':
      camera.alpha = Math.PI / 2 // Look South
      camera.beta = Math.PI / 3
      break
    case 'south':
      camera.alpha = -Math.PI / 2 // Look North
      camera.beta = Math.PI / 3
      break
    case 'east':
      camera.alpha = 0 // Look West
      camera.beta = Math.PI / 3
      break
    case 'west':
      camera.alpha = Math.PI // Look East
      camera.beta = Math.PI / 3
      break
    case 'fit':
      fitCameraToRoof()
      break
  }
}

defineExpose({
  setViewPreset,
  fitCameraToRoof
})

// Watchers
watch(() => props.roofModel, () => {
  buildRoofMeshes()
}, { deep: true })

watch(() => props.selectedSegmentId, (newId) => {
  segmentMeshes.forEach((mesh, idx) => {
    const isSelected = newId === `seg-${idx}`
    mesh.material = isSelected ? selectedSegmentMaterial : defaultSegmentMaterial
  })
  buildSolarPanels()
})

watch([() => props.panelCount, () => props.panelOrientation], () => {
  buildSolarPanels()
})

onMounted(() => {
  initBabylon()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  if (scene) scene.dispose()
  if (engine) engine.dispose()
})
</script>

<template>
  <div class="relative w-full h-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
    <!-- Babylon.js WebGL Canvas -->
    <canvas ref="canvasRef" class="w-full h-full block outline-none cursor-grab active:cursor-grabbing"></canvas>

    <!-- Top Left CAD Status Overlay -->
    <div class="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 text-cyan-400 border border-slate-700 backdrop-blur-sm text-xs font-mono">
        <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        <span>3D ROOF VIEWPORT</span>
      </div>

      <div class="px-2.5 py-1 rounded-lg bg-black/60 text-[11px] text-slate-300 backdrop-blur-sm font-mono border border-slate-800/80">
        <span>Segments: {{ roofModel?.roofSegments.length || 0 }} | Meshes: {{ segmentMeshes.size }}</span>
      </div>
    </div>

    <!-- 3D Camera Controls Bar (Requirement 20) -->
    <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 shadow-xl z-20">
      <button
        type="button"
        @click="setViewPreset('top')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        TOP
      </button>
      <button
        type="button"
        @click="setViewPreset('3d')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        3D
      </button>
      <div class="w-px h-4 bg-slate-700 mx-0.5"></div>
      <button
        type="button"
        @click="setViewPreset('north')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        N
      </button>
      <button
        type="button"
        @click="setViewPreset('south')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        S
      </button>
      <button
        type="button"
        @click="setViewPreset('east')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        E
      </button>
      <button
        type="button"
        @click="setViewPreset('west')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        W
      </button>
      <div class="w-px h-4 bg-slate-700 mx-0.5"></div>
      <button
        type="button"
        @click="setViewPreset('fit')"
        class="px-2.5 py-1 text-[11px] font-bold rounded-lg text-cyan-400 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
      >
        FIT ROOF
      </button>
    </div>

    <!-- Empty State Watermark if no RoofModel is loaded yet -->
    <div
      v-if="!roofModel || !roofModel.geometry || roofModel.geometry.segments.length === 0"
      class="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm text-center pointer-events-none"
    >
      <div class="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mb-3 border border-slate-700">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      </div>
      <h4 class="text-sm font-bold text-white mb-1">No Verified Roof Model Loaded</h4>
      <p class="text-xs text-slate-400 max-w-sm">
        Complete property site assessment or click "Analyze Building" to generate the 3D roof from real Google Solar telemetry.
      </p>
    </div>
  </div>
</template>

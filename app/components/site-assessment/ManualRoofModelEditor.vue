<script setup lang="ts">
import { ref, computed } from 'vue'
import type { RoofModel, RoofSegment, RoofVertex, RoofObstacle, ObstacleType } from '~/types/roof'
import { ALL_ROOF_TYPES } from '~/data/sampleProperties'

const props = defineProps<{
  isOpen: boolean
  centerLat?: number
  centerLng?: number
  initialModel?: RoofModel | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', model: RoofModel): void
}>()

// Active tab
const activeTab = ref<'segments' | 'vertices' | 'obstacles' | 'footprint'>('footprint')

// Building Footprint & Roof Parameters
const roofType = ref('Gable')
const buildingLength = ref(14)
const buildingWidth = ref(10)
const defaultPitch = ref(22)
const defaultAzimuth = ref(180)
const eaveHeight = ref(3.5)

// Editable Segments
interface EditableSegment {
  id: string
  segmentIndex: number
  pitchDegrees: number
  azimuthDegrees: number
  areaM2: number
  centerX: number
  centerZ: number
  elevationY: number
  vertices: RoofVertex[]
}

const segments = ref<EditableSegment[]>([
  {
    id: 'seg-0',
    segmentIndex: 0,
    pitchDegrees: 22,
    azimuthDegrees: 180,
    areaM2: 75.5,
    centerX: 0,
    centerZ: 2.5,
    elevationY: 4.5,
    vertices: [
      { x: -7, y: 3.5, z: 5 },
      { x: 7, y: 3.5, z: 5 },
      { x: 7, y: 5.5, z: 0 },
      { x: -7, y: 5.5, z: 0 }
    ]
  },
  {
    id: 'seg-1',
    segmentIndex: 1,
    pitchDegrees: 22,
    azimuthDegrees: 0,
    areaM2: 75.5,
    centerX: 0,
    centerZ: -2.5,
    elevationY: 4.5,
    vertices: [
      { x: 7, y: 3.5, z: -5 },
      { x: -7, y: 3.5, z: -5 },
      { x: -7, y: 5.5, z: 0 },
      { x: 7, y: 5.5, z: 0 }
    ]
  }
])

const activeSegmentIndex = ref(0)
const activeSegment = computed(() => {
  return segments.value.find(s => s.segmentIndex === activeSegmentIndex.value) || segments.value[0] || null
})

// Obstacles / No-Panel Areas
const obstacles = ref<RoofObstacle[]>([])

function addSegment() {
  const newIdx = segments.value.length
  const halfLen = buildingLength.value / 2
  const halfWid = buildingWidth.value / 2
  const newSeg: EditableSegment = {
    id: `seg-${newIdx}`,
    segmentIndex: newIdx,
    pitchDegrees: 20,
    azimuthDegrees: (newIdx * 90) % 360,
    areaM2: Number(((buildingLength.value * buildingWidth.value) / 2).toFixed(1)),
    centerX: 0,
    centerZ: 0,
    elevationY: eaveHeight.value + 1.5,
    vertices: [
      { x: -halfLen, y: eaveHeight.value, z: halfWid },
      { x: halfLen, y: eaveHeight.value, z: halfWid },
      { x: halfLen, y: eaveHeight.value + 2, z: 0 },
      { x: -halfLen, y: eaveHeight.value + 2, z: 0 }
    ]
  }
  segments.value.push(newSeg)
  activeSegmentIndex.value = newIdx
}

function removeSegment(idx: number) {
  if (segments.value.length <= 1) return
  segments.value = segments.value.filter(s => s.segmentIndex !== idx)
  // Re-index
  segments.value.forEach((s, i) => {
    s.segmentIndex = i
    s.id = `seg-${i}`
  })
  activeSegmentIndex.value = 0
}

function addVertex(seg: EditableSegment) {
  const lastV = seg.vertices[seg.vertices.length - 1] || { x: 0, y: 3.5, z: 0 }
  seg.vertices.push({
    x: Number((lastV.x + 1).toFixed(2)),
    y: Number(lastV.y.toFixed(2)),
    z: Number((lastV.z + 1).toFixed(2))
  })
}

function removeVertex(seg: EditableSegment, vIdx: number) {
  if (seg.vertices.length <= 3) return // Keep at least 3 vertices for a polygon
  seg.vertices.splice(vIdx, 1)
}

function addObstacle() {
  obstacles.value.push({
    id: `obs-${Date.now()}`,
    type: 'HVAC',
    position: { x: 0, y: eaveHeight.value + 1, z: 0 },
    widthM: 1.2,
    lengthM: 1.2,
    heightM: 0.8,
    source: 'INSTALLER_VERIFIED',
    notes: 'No-panel exclusion zone'
  })
}

function removeObstacle(obsId: string) {
  obstacles.value = obstacles.value.filter(o => o.id !== obsId)
}

function generateModelFromInputs(): RoofModel {
  const cLat = props.centerLat || 6.7443
  const cLng = props.centerLng || 125.3565

  const allVertices: RoofVertex[] = []
  const allFaces: any[] = []
  const planeGeometries: any[] = []

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  const canonicalSegments: RoofSegment[] = segments.value.map((s) => {
    const pitchRad = (s.pitchDegrees * Math.PI) / 180
    const azRad = (s.azimuthDegrees * Math.PI) / 180

    const nx = Math.sin(pitchRad) * Math.sin(azRad)
    const ny = Math.cos(pitchRad)
    const nz = Math.sin(pitchRad) * Math.cos(azRad)

    const baseVertexIdx = allVertices.length

    s.vertices.forEach(v => {
      allVertices.push({ ...v })
      if (v.x < minX) minX = v.x
      if (v.x > maxX) maxX = v.x
      if (v.y < minY) minY = v.y
      if (v.y > maxY) maxY = v.y
      if (v.z < minZ) minZ = v.z
      if (v.z > maxZ) maxZ = v.z
    })

    const localIndices: number[] = []
    if (s.vertices.length >= 4) {
      localIndices.push(0, 1, 2, 0, 2, 3)
      allFaces.push({ indices: [baseVertexIdx, baseVertexIdx + 1, baseVertexIdx + 2], segmentIndex: s.segmentIndex, normal: [nx, ny, nz] })
      allFaces.push({ indices: [baseVertexIdx, baseVertexIdx + 2, baseVertexIdx + 3], segmentIndex: s.segmentIndex, normal: [nx, ny, nz] })
    } else {
      localIndices.push(0, 1, 2)
      allFaces.push({ indices: [baseVertexIdx, baseVertexIdx + 1, baseVertexIdx + 2], segmentIndex: s.segmentIndex, normal: [nx, ny, nz] })
    }

    const normals: number[] = []
    for (let i = 0; i < s.vertices.length; i++) {
      normals.push(Number(nx.toFixed(4)), Number(ny.toFixed(4)), Number(nz.toFixed(4)))
    }

    const planeGeom = {
      segmentIndex: s.segmentIndex,
      vertices: s.vertices,
      faces: allFaces.filter(f => f.segmentIndex === s.segmentIndex),
      normal: [nx, ny, nz] as [number, number, number],
      pitchDegrees: s.pitchDegrees,
      azimuthDegrees: s.azimuthDegrees,
      elevationMeters: s.elevationY,
      center: { x: s.centerX, y: s.elevationY, z: s.centerZ },
      polygon2D: s.vertices.map(v => ({ x: v.x, z: v.z }))
    }
    planeGeometries.push(planeGeom)

    return {
      id: `seg-${s.segmentIndex}`,
      segmentIndex: s.segmentIndex,
      pitchDegrees: s.pitchDegrees,
      azimuthDegrees: s.azimuthDegrees,
      areaMeters2: s.areaM2,
      groundAreaMeters2: Number((s.areaM2 * 0.92).toFixed(1)),
      center: {
        x: s.centerX,
        y: s.elevationY,
        z: s.centerZ,
        latitude: cLat,
        longitude: cLng
      },
      planeHeightAtCenterMeters: s.elevationY,
      vertices: s.vertices,
      indices: localIndices,
      normals,
      sourceQuality: 'INSTALLER_ENTERED',
      verificationStatus: 'Installer Verified',
      source: 'User Entered',

      areaM2: s.areaM2,
      groundAreaM2: Number((s.areaM2 * 0.92).toFixed(1)),
      planeHeightMeters: s.elevationY,
      orientation: s.azimuthDegrees >= 135 && s.azimuthDegrees <= 225 ? 'South' : 'North',
      geometry: planeGeom
    }
  })

  const totalArea = canonicalSegments.reduce((sum, s) => sum + s.areaMeters2, 0)

  return {
    buildingId: `manual-bldg-${Date.now()}`,
    id: `manual-roof-${Date.now()}`,
    source: 'manual',
    roofType: roofType.value,
    pitch: defaultPitch.value,
    pitchDegrees: defaultPitch.value,
    azimuth: defaultAzimuth.value,
    azimuthDegrees: defaultAzimuth.value,
    dimensions: {
      lengthM: buildingLength.value,
      widthM: buildingWidth.value,
      eaveHeightM: eaveHeight.value,
      planesCount: segments.value.length
    },
    origin: {
      latitude: cLat,
      longitude: cLng,
      elevation: eaveHeight.value
    },
    segments: canonicalSegments,
    roofSegments: canonicalSegments,
    obstacles: obstacles.value,
    panels: [],
    building: {
      center: { latitude: cLat, longitude: cLng },
      areaM2: Math.round(totalArea),
      roofType: roofType.value
    },
    geometry: {
      vertices: allVertices,
      faces: allFaces,
      segments: planeGeometries,
      ridges: [],
      valleys: [],
      eaves: [],
      bounds: {
        minX: isFinite(minX) ? minX : -buildingLength.value / 2,
        maxX: isFinite(maxX) ? maxX : buildingLength.value / 2,
        minY: isFinite(minY) ? minY : eaveHeight.value,
        maxY: isFinite(maxY) ? maxY : eaveHeight.value + 3,
        minZ: isFinite(minZ) ? minZ : -buildingWidth.value / 2,
        maxZ: isFinite(maxZ) ? maxZ : buildingWidth.value / 2
      }
    },
    verification: {
      status: 'Verified',
      confidence: 'INSTALLER VERIFIED',
      notes: 'Manually drawn and verified by installer.',
      verifiedDate: new Date().toISOString().split('T')[0],
      verifiedBy: 'Lead PV System Designer'
    },
    status: 'INSTALLER_VERIFIED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function handleSave() {
  const model = generateModelFromInputs()
  emit('save', model)
  emit('close')
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800">
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            <h3 class="font-bold text-base text-slate-900 leading-tight">Manual Roof Model Editor</h3>
            <p class="text-xs text-slate-500">Draw boundaries, create segments, edit vertices & mark obstacles (Fallback Mode)</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
            INSTALLER ENTERED
          </span>
          <button
            type="button"
            @click="emit('close')"
            class="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="px-5 border-b border-slate-100 flex gap-4 bg-slate-50/40 text-xs font-semibold">
        <button
          type="button"
          @click="activeTab = 'segments'"
          :class="['py-3 border-b-2 transition-colors flex items-center gap-1.5', activeTab === 'segments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800']"
        >
          <span>📐</span>
          <span>Roof Segments ({{ segments.length }})</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'vertices'"
          :class="['py-3 border-b-2 transition-colors flex items-center gap-1.5', activeTab === 'vertices' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800']"
        >
          <span>📍</span>
          <span>Vertices Editor</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'obstacles'"
          :class="['py-3 border-b-2 transition-colors flex items-center gap-1.5', activeTab === 'obstacles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800']"
        >
          <span>🚫</span>
          <span>No-Panel Areas ({{ obstacles.length }})</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'footprint'"
          :class="['py-3 border-b-2 transition-colors flex items-center gap-1.5', activeTab === 'footprint' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800']"
        >
          <span>🏠</span>
          <span>Footprint & Bounds</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="p-6 flex-1 overflow-y-auto space-y-6 text-xs">
        <!-- 1. ROOF SEGMENTS TAB -->
        <div v-if="activeTab === 'segments'" class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-slate-600 text-xs">Configure discrete roof plane facets. Each segment will become a distinct Babylon.js mesh.</p>
            <button
              type="button"
              @click="addSegment"
              class="py-1.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold rounded-lg flex items-center gap-1"
            >
              + Add Roof Segment
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="s in segments"
              :key="s.segmentIndex"
              :class="[
                'p-4 rounded-xl border transition-all space-y-3',
                activeSegmentIndex === s.segmentIndex ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'
              ]"
              @click="activeSegmentIndex = s.segmentIndex"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-blue-600"></span>
                  RoofSegment_{{ s.segmentIndex }}
                </span>
                <button
                  v-if="segments.length > 1"
                  type="button"
                  @click.stop="removeSegment(s.segmentIndex)"
                  class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-0.5 rounded hover:bg-rose-50"
                >
                  Delete Segment
                </button>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase block">Pitch (°)</label>
                  <input v-model.number="s.pitchDegrees" type="number" step="0.5" class="w-full p-1.5 text-xs rounded border border-slate-200 font-mono" />
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase block">Azimuth (°)</label>
                  <input v-model.number="s.azimuthDegrees" type="number" step="1" class="w-full p-1.5 text-xs rounded border border-slate-200 font-mono" />
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase block">Area (m²)</label>
                  <input v-model.number="s.areaM2" type="number" step="0.5" class="w-full p-1.5 text-xs rounded border border-slate-200 font-mono" />
                </div>
              </div>

              <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Vertices: <strong>{{ s.vertices.length }} points</strong></span>
                <button
                  type="button"
                  @click.stop="activeSegmentIndex = s.segmentIndex; activeTab = 'vertices'"
                  class="text-blue-600 font-semibold hover:underline"
                >
                  Edit 3D Coordinates →
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. VERTICES EDITOR TAB -->
        <div v-if="activeTab === 'vertices'" class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-bold text-sm text-slate-900">
                Editing Coordinates for: RoofSegment_{{ activeSegment?.segmentIndex }}
              </h4>
              <p class="text-slate-500 text-[11px]">Specify local East (x), Elevation (y), and North (z) meters for each boundary corner.</p>
            </div>
            <div class="flex items-center gap-2">
              <select v-model="activeSegmentIndex" class="p-1.5 text-xs rounded border border-slate-200">
                <option v-for="s in segments" :key="s.segmentIndex" :value="s.segmentIndex">
                  RoofSegment_{{ s.segmentIndex }}
                </option>
              </select>
              <button
                v-if="activeSegment"
                type="button"
                @click="addVertex(activeSegment)"
                class="py-1.5 px-2.5 bg-blue-50 text-blue-700 font-bold rounded border border-blue-200"
              >
                + Add Vertex
              </button>
            </div>
          </div>

          <div v-if="activeSegment" class="bg-slate-50 rounded-xl p-3 border border-slate-200 overflow-x-auto">
            <table class="w-full text-left font-mono text-xs">
              <thead>
                <tr class="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200 pb-2">
                  <th class="py-1 px-2">Vertex</th>
                  <th class="py-1 px-2">X (East / West, m)</th>
                  <th class="py-1 px-2">Y (Elevation, m)</th>
                  <th class="py-1 px-2">Z (North / South, m)</th>
                  <th class="py-1 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60">
                <tr v-for="(v, vIdx) in activeSegment.vertices" :key="vIdx">
                  <td class="py-2 px-2 font-bold text-slate-700 font-sans">V_{{ vIdx }}</td>
                  <td class="py-2 px-2">
                    <input v-model.number="v.x" type="number" step="0.1" class="w-24 p-1 rounded border border-slate-300 bg-white" />
                  </td>
                  <td class="py-2 px-2">
                    <input v-model.number="v.y" type="number" step="0.1" class="w-24 p-1 rounded border border-slate-300 bg-white" />
                  </td>
                  <td class="py-2 px-2">
                    <input v-model.number="v.z" type="number" step="0.1" class="w-24 p-1 rounded border border-slate-300 bg-white" />
                  </td>
                  <td class="py-2 px-2 text-right">
                    <button
                      type="button"
                      @click="removeVertex(activeSegment, vIdx)"
                      :disabled="activeSegment.vertices.length <= 3"
                      class="text-rose-500 hover:text-rose-700 font-sans text-xs disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3. OBSTACLES TAB -->
        <div v-if="activeTab === 'obstacles'" class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-slate-600 text-xs">Mark chimneys, vents, HVAC units, or keep-out zones on the roof planes.</p>
            <button
              type="button"
              @click="addObstacle"
              class="py-1.5 px-3 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 font-bold rounded-lg flex items-center gap-1"
            >
              + Add No-Panel Area
            </button>
          </div>

          <div v-if="obstacles.length === 0" class="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No obstacles marked yet. Click above to add keep-out zones.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="obs in obstacles"
              :key="obs.id"
              class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
            >
              <div class="grid grid-cols-4 gap-2 flex-1">
                <div>
                  <label class="text-[9px] uppercase font-bold text-slate-400 block">Type</label>
                  <select v-model="obs.type" class="w-full p-1 text-xs rounded border border-slate-200">
                    <option value="HVAC">HVAC</option>
                    <option value="Chimney">Chimney</option>
                    <option value="Vent">Vent</option>
                    <option value="Skylight">Skylight</option>
                    <option value="Water Tank">Water Tank</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="text-[9px] uppercase font-bold text-slate-400 block">Width (m)</label>
                  <input v-model.number="obs.widthM" type="number" step="0.1" class="w-full p-1 text-xs rounded border border-slate-200 font-mono" />
                </div>
                <div>
                  <label class="text-[9px] uppercase font-bold text-slate-400 block">Length (m)</label>
                  <input v-model.number="obs.lengthM" type="number" step="0.1" class="w-full p-1 text-xs rounded border border-slate-200 font-mono" />
                </div>
                <div>
                  <label class="text-[9px] uppercase font-bold text-slate-400 block">Height (m)</label>
                  <input v-model.number="obs.heightM" type="number" step="0.1" class="w-full p-1 text-xs rounded border border-slate-200 font-mono" />
                </div>
              </div>
              <button
                type="button"
                @click="removeObstacle(obs.id)"
                class="text-rose-500 hover:text-rose-700 p-1"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <!-- 4. FOOTPRINT TAB -->
        <div v-if="activeTab === 'footprint'" class="space-y-4">
          <p class="text-slate-600 text-xs">Define general building footprint dimensions and base elevation.</p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div class="col-span-2 md:col-span-1">
              <label class="text-[10px] uppercase font-bold text-slate-500 block">Roof Classification</label>
              <select v-model="roofType" class="w-full p-2 text-xs rounded-lg border border-slate-200 bg-white">
                <option v-for="t in ALL_ROOF_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-500 block">Roof Pitch (°)</label>
              <input v-model.number="defaultPitch" type="number" step="0.5" class="w-full p-2 text-xs rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-500 block">Roof Azimuth (°)</label>
              <input v-model.number="defaultAzimuth" type="number" step="1" class="w-full p-2 text-xs rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-500 block">Building Length (m)</label>
              <input v-model.number="buildingLength" type="number" step="0.5" class="w-full p-2 text-xs rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-500 block">Building Width (m)</label>
              <input v-model.number="buildingWidth" type="number" step="0.5" class="w-full p-2 text-xs rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-500 block">Base Eave Height (m)</label>
              <input v-model.number="eaveHeight" type="number" step="0.1" class="w-full p-2 text-xs rounded-lg border border-slate-200 font-mono" />
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div class="text-xs text-slate-500">
          Total Segments: <strong class="text-slate-800">{{ segments.length }}</strong> |
          Total Vertices: <strong class="text-slate-800">{{ segments.reduce((sum, s) => sum + s.vertices.length, 0) }}</strong>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="emit('close')"
            class="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="handleSave"
            class="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
          >
            <span>✓</span>
            <span>Save Roof Model (INSTALLER ENTERED)</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

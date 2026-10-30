<script setup lang="ts">
import { ref, watch } from 'vue'
import type { RoofObstacle, ObstacleType } from '~/types/roof'

const props = defineProps<{
  isOpen: boolean
  initialObstacle?: Partial<RoofObstacle> | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', obstacle: Partial<RoofObstacle>): void
}>()

const obstacleTypes: Array<{ type: ObstacleType; label: string; icon: string }> = [
  { type: 'Tree', label: 'Tree / Canopy', icon: '🌳' },
  { type: 'Water Tank', label: 'Water Tank', icon: '🛢️' },
  { type: 'Building', label: 'Neighboring Building', icon: '🏢' },
  { type: 'Chimney', label: 'Chimney / Flue', icon: '🧱' },
  { type: 'Antenna', label: 'Antenna / Mast', icon: '📡' },
  { type: 'Utility Structure', label: 'Utility / HVAC', icon: '⚡' },
  { type: 'Other', label: 'Other Obstruction', icon: '⚠️' }
]

const formType = ref<ObstacleType>('Tree')
const formName = ref('Tree')
const formHeightM = ref<number | null>(null)
const formCanopyRadiusM = ref<number | null>(null)
const formTrunkRadiusM = ref<number | null>(null)
const formRadiusM = ref<number | null>(null)
const formWidthM = ref<number | null>(null)
const formLengthM = ref<number | null>(null)
const formDistanceM = ref<number>(2.0)
const formNotes = ref('')
const validationError = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      validationError.value = ''
      if (props.initialObstacle) {
        formType.value = props.initialObstacle.type || 'Tree'
        formName.value = props.initialObstacle.name || `${props.initialObstacle.type || 'Tree'}`
        formHeightM.value = props.initialObstacle.heightM ?? null
        formCanopyRadiusM.value = props.initialObstacle.canopyRadiusM ?? null
        formTrunkRadiusM.value = props.initialObstacle.trunkRadiusM ?? null
        formRadiusM.value = props.initialObstacle.radiusM ?? null
        formWidthM.value = props.initialObstacle.widthM ?? null
        formLengthM.value = props.initialObstacle.lengthM ?? null
        formDistanceM.value = props.initialObstacle.distanceFromRoofM ?? 2.0
        formNotes.value = props.initialObstacle.notes || ''
      } else {
        formType.value = 'Tree'
        formName.value = ''
        formHeightM.value = null
        formCanopyRadiusM.value = null
        formTrunkRadiusM.value = null
        formRadiusM.value = null
        formWidthM.value = null
        formLengthM.value = null
        formDistanceM.value = 2.0
        formNotes.value = ''
      }
    }
  }
)

function onTypeChange() {
  validationError.value = ''
  if (formType.value === 'Tree') {
    formName.value = formName.value || 'Tree'
  } else if (formType.value === 'Water Tank') {
    formName.value = formName.value || 'Water Tank'
  } else if (formType.value === 'Chimney') {
    formName.value = formName.value || 'Rooftop Chimney'
  } else if (formType.value === 'Building') {
    formName.value = formName.value || 'Adjacent Structure'
  } else {
    formName.value = formName.value || `${formType.value}`
  }
}

function handleSave() {
  validationError.value = ''

  if (formType.value === 'Tree') {
    if (!formHeightM.value || formHeightM.value <= 0 || !formCanopyRadiusM.value || formCanopyRadiusM.value <= 0) {
      validationError.value = 'Tree dimensions incomplete. Enter tree height and canopy radius before generating the 3D tree.'
      return
    }
  } else if (!formHeightM.value || formHeightM.value <= 0) {
    validationError.value = 'Obstruction height must be specified.'
    return
  }

  const result: Partial<RoofObstacle> = {
    id: props.initialObstacle?.id,
    type: formType.value,
    name: formName.value.trim() || `${formType.value}`,
    heightM: Number(formHeightM.value),
    canopyRadiusM: formType.value === 'Tree' ? Number(formCanopyRadiusM.value) : undefined,
    trunkRadiusM: formType.value === 'Tree' && formTrunkRadiusM.value ? Number(formTrunkRadiusM.value) : undefined,
    radiusM: formType.value === 'Water Tank' ? Number(formRadiusM.value || 1.2) : undefined,
    widthM: Number(formWidthM.value || (formType.value === 'Tree' ? Number(formCanopyRadiusM.value) * 2 : 2.0)),
    lengthM: Number(formLengthM.value || (formType.value === 'Tree' ? Number(formCanopyRadiusM.value) * 2 : 2.0)),
    distanceFromRoofM: Number(formDistanceM.value) || 0,
    notes: formNotes.value.trim(),
    source: 'Installer Provided'
  }
  emit('save', result)
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn"
    @click.self="$emit('close')"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden text-slate-800">
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center text-lg">
            ⚠️
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 leading-tight">
              {{ initialObstacle?.id ? 'Edit Rooftop Obstruction' : 'Add Rooftop Obstruction' }}
            </h3>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded uppercase">
                INSTALLER PROVIDED
              </span>
              <span class="text-[11px] text-slate-400">Manual Measurement Entry</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          @click="$emit('close')"
          class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
        <!-- Obstruction Type Grid -->
        <div class="space-y-1.5">
          <label class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Obstruction Type</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              v-for="item in obstacleTypes"
              :key="item.type"
              type="button"
              @click="formType = item.type; onTypeChange()"
              :class="[
                'p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all',
                formType === item.type
                  ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-bold shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              ]"
            >
              <span class="text-base">{{ item.icon }}</span>
              <span class="text-[11px] leading-tight">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <!-- Name / Label -->
        <div class="space-y-1">
          <label class="text-[11px] font-semibold text-slate-700 block">Identifier / Name</label>
          <input
            v-model="formName"
            type="text"
            placeholder="e.g. Tree #1, Main Water Tank, HVAC Unit"
            class="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <!-- Physical Dimensions Grid -->
        <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Physical Dimensions</span>
            <span class="text-[10px] text-slate-400">Values entered in meters (m)</span>
          </div>

          <!-- Height (Required for all) -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] font-semibold text-slate-700 block mb-1">
                Height (m) <span class="text-rose-500">*</span>
              </label>
              <div class="relative">
                <input
                  v-model.number="formHeightM"
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="40"
                  class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <span class="absolute right-2.5 top-1.5 text-[11px] text-slate-400 font-mono">meters</span>
              </div>
            </div>

            <!-- Distance from roof perimeter -->
            <div>
              <label class="text-[11px] font-semibold text-slate-700 block mb-1">
                Distance from Roof (m)
              </label>
              <div class="relative">
                <input
                  v-model.number="formDistanceM"
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <span class="absolute right-2.5 top-1.5 text-[11px] text-slate-400 font-mono">meters</span>
              </div>
            </div>
          </div>

          <!-- Specific fields for Tree -->
          <div v-if="formType === 'Tree'" class="pt-2 border-t border-slate-200/80 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-[11px] font-semibold text-slate-700 block mb-1">
                  Canopy Radius (m) <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <input
                    v-model.number="formCanopyRadiusM"
                    type="number"
                    step="0.2"
                    min="0.5"
                    max="15"
                    placeholder="e.g. 3.0"
                    class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <span class="absolute right-2.5 top-1.5 text-[11px] text-slate-400 font-mono">meters</span>
                </div>
              </div>

              <div>
                <label class="text-[11px] font-semibold text-slate-700 block mb-1">
                  Trunk Radius (m)
                </label>
                <div class="relative">
                  <input
                    v-model.number="formTrunkRadiusM"
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="2.0"
                    placeholder="e.g. 0.25"
                    class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <span class="absolute right-2.5 top-1.5 text-[11px] text-slate-400 font-mono">meters</span>
                </div>
              </div>
            </div>
            <p v-if="formCanopyRadiusM" class="text-[10px] text-slate-500">
              Total canopy spread diameter: <strong>{{ (formCanopyRadiusM * 2).toFixed(1) }} meters</strong>.
            </p>
          </div>

          <!-- Specific fields for Water Tank -->
          <div v-else-if="formType === 'Water Tank'" class="pt-2 border-t border-slate-200/80">
            <label class="text-[11px] font-semibold text-slate-700 block mb-1">
              Tank Radius (m)
            </label>
            <div class="relative">
              <input
                v-model.number="formRadiusM"
                type="number"
                step="0.1"
                min="0.3"
                max="10"
                class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <span class="absolute right-2.5 top-1.5 text-[11px] text-slate-400 font-mono">meters</span>
            </div>
          </div>

          <!-- Specific fields for Chimney / Building / Other -->
          <div v-else class="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/80">
            <div>
              <label class="text-[11px] font-semibold text-slate-700 block mb-1">Width (m)</label>
              <input
                v-model.number="formWidthM"
                type="number"
                step="0.2"
                min="0.3"
                max="30"
                class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label class="text-[11px] font-semibold text-slate-700 block mb-1">Length (m)</label>
              <input
                v-model.number="formLengthM"
                type="number"
                step="0.2"
                min="0.3"
                max="30"
                class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="space-y-1">
          <label class="text-[11px] font-semibold text-slate-700 block">Installer Field Notes</label>
          <input
            v-model="formNotes"
            type="text"
            placeholder="e.g. Overhanging mango tree branches on SE corner"
            class="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <!-- Validation Error Banner -->
      <div v-if="validationError" class="p-3 bg-rose-50 border-t border-rose-200 text-rose-700 text-[11px] font-medium flex items-center gap-1.5">
        <span>⚠️</span>
        <span>{{ validationError }}</span>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          @click="$emit('close')"
          class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="handleSave"
          class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
        >
          <span>✓ Save Obstruction</span>
        </button>
      </div>
    </div>
  </div>
</template>

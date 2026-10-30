<script setup lang="ts">
import { ref, computed } from 'vue'
import { ALL_ROOF_TYPES } from '~/data/sampleProperties'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import type { RoofTypeOption } from '~/types/assessment'

const {
  isClassificationModalOpen,
  closeClassificationModal,
  applyManualClassification,
  roofType
} = useSiteAssessment()

const searchQuery = ref('')
const selectedOption = ref<RoofTypeOption | ''>(roofType.value !== 'Not detected' ? roofType.value : '')

const filteredRoofTypes = computed(() => {
  if (!searchQuery.value.trim()) return ALL_ROOF_TYPES
  const query = searchQuery.value.toLowerCase()
  return ALL_ROOF_TYPES.filter(type => type.toLowerCase().includes(query))
})

function handleConfirm() {
  if (selectedOption.value) {
    applyManualClassification(selectedOption.value as RoofTypeOption)
  }
}
</script>

<template>
  <div
    v-if="isClassificationModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    @click.self="closeClassificationModal"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 class="text-base font-bold text-slate-900">Roof Geometry Classification</h3>
          <p class="text-xs text-slate-500">Select structural archetype for future geometric simulation</p>
        </div>
        <button
          @click="closeClassificationModal"
          class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Engineering Notice Banner -->
      <div class="px-5 pt-4">
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2.5">
          <svg class="w-4 h-4 text-blue-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p class="text-[11px] leading-relaxed">
            <strong>Installer Classification Only:</strong> Select the architectural taxonomy to guide manual survey verification and 3D rooftop plane modeling.
          </p>
        </div>
      </div>

      <!-- Search Input -->
      <div class="px-5 pt-3">
        <div class="relative">
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search roof type (e.g., Gable, Hip, Shed)..."
            class="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      <!-- List of Roof Types (Grid) -->
      <div class="p-5 flex-1 overflow-y-auto max-h-[360px] scrollbar-thin">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            v-for="roof in filteredRoofTypes"
            :key="roof"
            type="button"
            @click="selectedOption = roof"
            :class="[
              'p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between h-20',
              selectedOption === roof
                ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/30'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
            ]"
          >
            <div class="flex items-start justify-between">
              <span class="font-semibold text-xs leading-tight">{{ roof }}</span>
              <span
                v-if="selectedOption === roof"
                class="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 ml-1"
              >
                <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">Type #{{ ALL_ROOF_TYPES.indexOf(roof) + 1 }}</span>
          </button>
        </div>

        <div v-if="filteredRoofTypes.length === 0" class="py-8 text-center text-xs text-slate-400">
          No matching roof classification found.
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <span class="text-xs text-slate-500">
          Selected: <strong class="text-slate-800">{{ selectedOption || 'None' }}</strong>
        </span>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="closeClassificationModal"
            class="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            @click="handleConfirm"
            :disabled="!selectedOption"
            :class="[
              'px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-all',
              selectedOption
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            ]"
          >
            Confirm Classification
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

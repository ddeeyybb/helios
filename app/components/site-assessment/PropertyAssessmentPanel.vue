<script setup lang="ts">
import { ref } from 'vue'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import { useInstallerData } from '~/composables/useInstallerData'
import ObstructionModal from '~/components/site-assessment/ObstructionModal.vue'
import type { RoofObstacle } from '~/types/roof'

const {
  selectedProperty,
  hasSelectedProperty,
  roofStructureType,
  roofBoundaryDrawn,
  roofAreaSqM,
  usableRoofPercent,
  usableRoofAreaSqM,
  boundaryValidationMessage,
  // Roof Structure Inputs
  roofPitchDegrees,
  roofAzimuthDegrees,
  roofThicknessM,
  eaveHeightM,
  // Obstructions
  obstructions,
  addObstruction,
  updateObstruction,
  removeObstruction,
  // Solar Panel Placement
  panelWattageW,
  panelWidthM,
  panelLengthM,
  setbackM,
  physicalPanelCount,
  estimatedPanelCount,
  estimatedSystemCapacityKwp,
  estimatedAnnualEnergyKwh,
  energyFormulaString,
  dynamicShadingFactor,
  peakSunHours,
  performanceRatio,
  // Shading Simulation
  shadingDate,
  shadingTime,
  shadingPreset,
  shadingAssessment,
  currentSolarPosition,
  calculateShadow,
  // 3D Geometry & Area Verification
  activeRoofModel,
  babylonFootprintAreaM2,
  areaDiscrepancy,
  areaDifferencePercent,
  isGeometryAreaValid,
  // Actions
  recalculateAll
} = useSiteAssessment()

const { activeProject } = useInstallerData()

// UI modal & edit states
const isObstructionModalOpen = ref(false)
const editingObstacle = ref<Partial<RoofObstacle> | null>(null)
const isCustomPitch = ref(false)
const isCustomAzimuth = ref(false)

function handleOpenAddTree() {
  editingObstacle.value = {
    type: 'Tree'
  }
  isObstructionModalOpen.value = true
}

function handleOpenAddObstruction() {
  editingObstacle.value = null
  isObstructionModalOpen.value = true
}

function handleOpenEditObstruction(obs: RoofObstacle) {
  editingObstacle.value = { ...obs }
  isObstructionModalOpen.value = true
}

function handleSaveObstruction(data: Partial<RoofObstacle>) {
  if (data.id) {
    updateObstruction(data.id, data)
  } else {
    addObstruction(data)
  }
}

function handleOpenSolarDesignEditor() {
  navigateTo('/rooftop')
}
</script>

<template>
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
    <!-- Header: Solar Engineering Parameters -->
    <div class="flex items-center justify-between border-b border-slate-100 pb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold border border-blue-200">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v18M3 12h18M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7" />
          </svg>
        </div>
        <div>
          <h2 class="text-sm font-bold text-slate-900 leading-tight">Solar System Sizing</h2>
          <p class="text-[11px] text-slate-500">Engineering & Layout Parameters</p>
        </div>
      </div>

      <span
        :class="[
          'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
          roofBoundaryDrawn
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : hasSelectedProperty
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
        ]"
      >
        {{ roofBoundaryDrawn ? `${roofAreaSqM.toFixed(1)} m² Active` : hasSelectedProperty ? 'Site Active' : 'Awaiting Pin' }}
      </span>
    </div>

    <!-- Validation Error Banner -->
    <div v-if="boundaryValidationMessage" class="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2">
      <span class="text-base">⚠️</span>
      <span>{{ boundaryValidationMessage }}</span>
    </div>

    <!-- 1. Roof Structure & Pitch -->
    <div class="border border-slate-200 rounded-xl p-4 bg-white space-y-3 text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-blue-600"></span>
          <span class="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Roof Structure & Pitch</span>
        </div>
        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
          SURFACE GEOMETRY
        </span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <!-- Roof Type -->
        <div>
          <label class="text-[10px] font-semibold text-slate-600 block mb-1">Roof Type</label>
          <select
            v-model="roofStructureType"
            @change="recalculateAll"
            class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="Flat">Flat</option>
            <option value="Single Slope">Single Slope</option>
            <option value="Gable">Gable</option>
            <option value="Hip">Hip</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        <!-- Pitch -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[10px] font-semibold text-slate-600">Pitch (°)</label>
            <button
              type="button"
              @click="isCustomPitch = !isCustomPitch"
              class="text-[9px] text-blue-600 font-bold hover:underline"
            >
              {{ isCustomPitch ? 'Presets' : 'Custom' }}
            </button>
          </div>

          <input
            v-if="isCustomPitch"
            v-model.number="roofPitchDegrees"
            @change="recalculateAll"
            type="number"
            min="0"
            max="60"
            step="1"
            class="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
          />
          <select
            v-else
            v-model.number="roofPitchDegrees"
            @change="recalculateAll"
            class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
          >
            <option :value="0">0° (Flat)</option>
            <option :value="5">5° (Low slope)</option>
            <option :value="10">10° (Typical commercial)</option>
            <option :value="15">15° (Standard residential)</option>
            <option :value="20">20°</option>
            <option :value="25">25°</option>
            <option :value="30">30° (Steep residential)</option>
          </select>
        </div>
      </div>

      <!-- Slope Direction (Azimuth) -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-[10px] font-semibold text-slate-600">Slope Direction (Azimuth)</label>
          <button
            type="button"
            @click="isCustomAzimuth = !isCustomAzimuth"
            class="text-[9px] text-blue-600 font-bold hover:underline"
          >
            {{ isCustomAzimuth ? 'Cardinal' : 'Custom Angle' }}
          </button>
        </div>

        <div v-if="isCustomAzimuth" class="relative">
          <input
            v-model.number="roofAzimuthDegrees"
            @change="recalculateAll"
            type="number"
            min="0"
            max="359"
            class="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
          />
          <span class="absolute right-3 top-1.5 text-[10px] text-slate-400 font-mono">degrees</span>
        </div>
        <select
          v-else
          v-model.number="roofAzimuthDegrees"
          @change="recalculateAll"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
        >
          <option :value="180">South (180°) - Ideal for PH</option>
          <option :value="135">Southeast (135°)</option>
          <option :value="225">Southwest (225°)</option>
          <option :value="90">East (90°)</option>
          <option :value="270">West (270°)</option>
          <option :value="0">North (0°)</option>
        </select>
      </div>

      <!-- Roof Thickness & Eave Height -->
      <div class="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 text-[11px]">
        <div>
          <span class="text-slate-500 block text-[10px]">Roof Thickness:</span>
          <span class="font-mono font-bold text-slate-800">{{ roofThicknessM }} m</span>
        </div>
        <div>
          <span class="text-slate-500 block text-[10px]">Eave Height:</span>
          <span class="font-mono font-bold text-slate-800">{{ eaveHeightM }} m</span>
        </div>
      </div>
    </div>



    <!-- 4. Solar Layout & Physical Sizing -->
    <div class="border border-slate-200 rounded-xl p-4 bg-white space-y-3 text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-blue-600"></span>
          <span class="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Solar PV Module Sizing</span>
        </div>
        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
          PHYSICALLY FITTED
        </span>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div class="p-2 bg-slate-50 rounded-lg border border-slate-200">
          <span class="text-[9px] text-slate-400 uppercase font-bold block">Module</span>
          <span class="font-bold text-slate-900">{{ panelWattageW }} W</span>
        </div>
        <div class="p-2 bg-slate-50 rounded-lg border border-slate-200">
          <span class="text-[9px] text-slate-400 uppercase font-bold block">Dimensions</span>
          <span class="font-mono text-[10px] text-slate-800">1.13 × 2.28m</span>
        </div>
        <div class="p-2 bg-slate-50 rounded-lg border border-slate-200">
          <span class="text-[9px] text-slate-400 uppercase font-bold block">Setback</span>
          <span class="font-mono font-bold text-blue-600">{{ setbackM }} m</span>
        </div>
      </div>

      <!-- Fitted Panels Count & Capacity -->
      <div class="grid grid-cols-2 gap-2 text-center">
        <div class="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
          <span class="text-[9px] text-slate-500 uppercase font-bold block">FITTED PANELS</span>
          <span class="text-xl font-bold font-mono text-slate-900">
            {{ physicalPanelCount }}
          </span>
          <span class="text-[9px] text-slate-500 block">Inside boundary</span>
        </div>
        <div class="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
          <span class="text-[9px] text-emerald-800 uppercase font-bold block">SYSTEM CAPACITY</span>
          <span class="text-xl font-bold font-mono text-emerald-700">
            {{ estimatedSystemCapacityKwp }} kWp
          </span>
          <span class="text-[9px] text-emerald-600 block">DC Peak Power</span>
        </div>
      </div>

      <!-- Energy Yield & Visible Formula -->
      <div class="p-3 bg-slate-900 text-white rounded-xl space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase font-bold tracking-wider text-slate-400">Estimated Annual Energy</span>
          <span class="text-sm font-bold font-mono text-amber-400">
            {{ estimatedAnnualEnergyKwh.toLocaleString() }} kWh/yr
          </span>
        </div>
        <div class="text-[10px] text-slate-400 font-mono leading-relaxed pt-1 border-t border-slate-800">
          Formula: <span class="text-slate-300">{{ energyFormulaString }}</span>
        </div>
      </div>
    </div>

    <!-- 5. Shading Simulation -->
    <div class="border border-slate-200 rounded-xl p-4 bg-white space-y-3 text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-purple-600"></span>
          <span class="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Shading Simulation</span>
        </div>
        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
          SOLAR POSITION
        </span>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-slate-600 uppercase">Simulation Time Preset</span>
          <span class="text-[10px] text-slate-500 font-mono">Digos City Solar Arc</span>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="p in (['Morning', 'Noon', 'Afternoon', 'Today'] as const)"
            :key="p"
            type="button"
            @click="calculateShadow(p)"
            :class="[
              'py-1 rounded text-[11px] font-bold transition-all border text-center cursor-pointer',
              shadingPreset === p
                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            ]"
          >
            {{ p }}
          </button>
        </div>

        <button
          type="button"
          @click="calculateShadow()"
          class="w-full py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </svg>
          <span>CALCULATE SHADOW</span>
        </button>
      </div>

      <!-- Shading Assessment Results Card -->
      <div v-if="shadingAssessment" class="bg-purple-50/60 p-3 rounded-xl border border-purple-200 space-y-2">
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-white p-2 rounded-lg border border-purple-100">
            <span class="text-[9px] text-slate-400 font-bold block uppercase">Sun Alt / Az</span>
            <span class="font-mono font-bold text-slate-800 text-[10px]">
              {{ shadingAssessment.solarAltitudeDeg }}° / {{ shadingAssessment.solarAzimuthDeg }}°
            </span>
          </div>

          <div class="bg-white p-2 rounded-lg border border-purple-100">
            <span class="text-[9px] text-slate-400 font-bold block uppercase">Shaded Area</span>
            <span class="font-mono font-bold text-purple-700 text-[10px]">
              {{ shadingAssessment.shadedAreaM2 }} m²
            </span>
          </div>

          <div class="bg-white p-2 rounded-lg border border-purple-100">
            <span class="text-[9px] text-slate-400 font-bold block uppercase">Est. Shading</span>
            <span class="font-mono font-bold text-slate-900 text-xs">
              {{ shadingAssessment.shadingPercentage }}%
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[10px] text-slate-500">Shading Risk Category:</span>
          <span
            :class="[
              'text-[10px] font-bold px-2 py-0.5 rounded font-mono',
              shadingAssessment.riskLevel === 'LOW'
                ? 'bg-emerald-100 text-emerald-800'
                : shadingAssessment.riskLevel === 'MODERATE'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
            ]"
          >
            {{ shadingAssessment.riskLevel }} RISK
          </span>
        </div>
      </div>
    </div>

    <!-- 6. 3D Model Verification & CAD Sizing Editor Trigger -->
    <div class="border border-slate-200 rounded-xl p-4 bg-slate-900 text-white space-y-3 text-xs">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span class="font-bold uppercase tracking-wider text-white text-[11px]">3D Roof Model</span>
        </div>
      </div>

      <div class="space-y-1.5 text-[11px] font-mono text-slate-300">
        <div class="flex items-center justify-between">
          <span class="text-slate-400">Google Maps Area:</span>
          <span class="text-white font-bold">{{ roofAreaSqM.toFixed(1) }} m²</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-400">3D Footprint:</span>
          <span class="text-white font-bold">{{ babylonFootprintAreaM2 }} m²</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-400">Area Discrepancy:</span>
          <span :class="isGeometryAreaValid ? 'text-emerald-400' : 'text-rose-400 font-bold'">
            {{ areaDifferencePercent }}% {{ isGeometryAreaValid ? '(Within Tolerance)' : '(Exceeds Limit!)' }}
          </span>
        </div>
      </div>

      <div v-if="!isGeometryAreaValid" class="p-2 bg-rose-900/40 border border-rose-700 rounded text-[10px] text-rose-300">
        ⚠️ 3D geometry does not match roof footprint.
      </div>

      <button
        type="button"
        @click="handleOpenSolarDesignEditor"
        class="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <svg class="w-4 h-4 text-cyan-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        </svg>
        <span>OPEN SOLAR DESIGN EDITOR</span>
      </button>
    </div>

    <!-- Obstruction Edit / Create Modal -->
    <ObstructionModal
      :is-open="isObstructionModalOpen"
      :initial-obstacle="editingObstacle"
      @close="isObstructionModalOpen = false"
      @save="handleSaveObstruction"
    />
  </div>
</template>

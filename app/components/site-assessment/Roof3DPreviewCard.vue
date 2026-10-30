<script setup lang="ts">
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import BabylonRoofViewer from '~/components/rooftop/BabylonRoofViewer.vue'

const {
  roofType,
  hasSelectedProperty,
  activeRoofModel,
  roofAssessmentStatus,
  roofBoundaryDrawn,
  estimatedPanelCount,
  physicalPanelCount,
  panelWattageW,
  estimatedSystemCapacityKwp,
  estimatedAnnualEnergyKwh
} = useSiteAssessment()
</script>

<template>
  <div id="roof-3d-preview-card" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-100 pb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold border border-blue-200">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-sm text-slate-900 leading-tight">3D Rooftop Reconstruction</h3>
          <p class="text-[11px] text-slate-500">3D Roof Model Preview</p>
        </div>
      </div>

      <span
        :class="[
          'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
          activeRoofModel
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-600 border-slate-200'
        ]"
      >
        {{ activeRoofModel ? '3D Model Active' : 'Awaiting Roof Boundary' }}
      </span>
    </div>

    <!-- Active Babylon.js Viewport or Blueprint Placeholder -->
    <div class="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 min-h-[260px] flex items-center justify-center">
      <!-- Live 3D Babylon Viewport if activeRoofModel exists -->
      <div v-if="activeRoofModel" class="w-full h-[260px]">
        <ClientOnly>
          <BabylonRoofViewer
            :roof-model="activeRoofModel"
            :building-found="Boolean(activeRoofModel && (activeRoofModel.segments?.length || activeRoofModel.roofSegments?.length))"
            :panel-count="physicalPanelCount || estimatedPanelCount"
            :panel-wattage-w="panelWattageW"
            :system-capacity-kwp="estimatedSystemCapacityKwp"
            :estimated-annual-energy-kwh="estimatedAnnualEnergyKwh"
            :show-panels="true"
          />
        </ClientOnly>
      </div>

      <!-- Isometric CAD Blueprint Fallback -->
      <div v-else class="relative w-full h-full p-6 flex flex-col items-center justify-center text-center">
        <!-- Background Blueprint Grid Pattern -->
        <div
          class="absolute inset-0 opacity-20 pointer-events-none"
          style="background-image: radial-gradient(#38bdf8 1px, transparent 1px), linear-gradient(to right, rgba(56, 189, 248, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.08) 1px, transparent 1px); background-size: 24px 24px, 24px 24px, 24px 24px;"
        ></div>

        <div class="relative z-10 w-28 h-20 mb-2 text-cyan-400">
          <svg viewBox="0 0 140 100" fill="none" stroke="currentColor" class="w-full h-full drop-shadow-[0_0_12px_rgba(56,189,248,0.3)]">
            <line x1="70" y1="20" x2="105" y2="40" stroke-width="2" stroke-dasharray="2 2" class="text-cyan-200" />
            <line x1="35" y1="40" x2="70" y2="20" stroke-width="2" class="text-blue-400" />
            <polygon points="35,40 70,20 85,55 50,75" stroke="#38bdf8" stroke-width="1.5" fill="rgba(56,189,248,0.12)" />
            <polygon points="70,20 105,40 120,75 85,55" stroke="#0ea5e9" stroke-width="1.5" fill="rgba(14,165,233,0.18)" />
            <circle cx="35" cy="40" r="2.5" fill="#38bdf8" />
            <circle cx="70" cy="20" r="2.5" fill="#67e8f9" />
            <circle cx="105" cy="40" r="2.5" fill="#38bdf8" />
            <circle cx="50" cy="75" r="2.5" fill="#38bdf8" />
            <circle cx="85" cy="55" r="2.5" fill="#38bdf8" />
            <circle cx="120" cy="75" r="2.5" fill="#38bdf8" />
          </svg>
        </div>

        <div class="relative z-10 space-y-1">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 text-[10px] font-mono border border-slate-700">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
            <span>Awaiting Roof Boundary</span>
          </div>
          <p class="text-[11px] text-slate-400 max-w-xs mx-auto pt-1">
            Draw the roof perimeter on the satellite map or use geometric presets to generate the 3D roof model and solar panel layout.
          </p>
        </div>
      </div>
    </div>

    <!-- Telemetry Details & Launch Action -->
    <div class="grid grid-cols-2 gap-2 text-xs">
      <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
        <span class="text-[10px] uppercase font-bold text-slate-400 block">Mesh Status</span>
        <span class="font-semibold text-slate-700">
          {{ activeRoofModel ? `${activeRoofModel.roofSegments.length} Segments Generated` : 'Pending Boundary' }}
        </span>
      </div>

      <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
        <span class="text-[10px] uppercase font-bold text-slate-400 block">Current Classification</span>
        <span class="font-semibold text-slate-700">{{ roofType }}</span>
      </div>
    </div>

    <!-- Action Button to Open Babylon.js Full Workspace -->
    <NuxtLink
      to="/rooftop"
      class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-black shadow-sm transition-colors"
    >
      <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      </svg>
      Open Solar Design Editor →
    </NuxtLink>
  </div>
</template>

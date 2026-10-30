<script setup lang="ts">
import { useSiteAssessment } from '~/composables/useSiteAssessment'

const {
  hasSelectedProperty,
  roofBoundaryDrawn,
  roofAreaSqM,
  roofStructureType,
  roofPitchDegrees,
  obstructions,
  physicalPanelCount,
  estimatedSystemCapacityKwp,
  shadingAssessment,
  activeRoofModel,
  openClassificationModal
} = useSiteAssessment()

const steps = [
  { id: 1, name: 'Property Selection', label: 'MAP-DERIVED' },
  { id: 2, name: 'Roof Boundary', label: 'MAP-DERIVED' },
  { id: 3, name: 'Roof Structure', label: 'INSTALLER PROVIDED' },
  { id: 4, name: 'Area & Usable Ratio', label: 'MAP-CALCULATED' },
  { id: 5, name: 'Obstructions & Trees', label: 'INSTALLER PROVIDED' },
  { id: 6, name: 'Physical Solar Layout', label: 'PHYSICAL FIT' },
  { id: 7, name: 'Shading Simulation', label: 'ESTIMATED SHADING' },
  { id: 8, name: '3D Roof Model', label: 'CANONICAL MODEL' }
]
</script>

<template>
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 text-xs">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-100 pb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold border border-blue-200">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-sm text-slate-900 leading-tight">Assessment Progression</h3>
          <p class="text-[11px] text-slate-500">8-Stage Installer Verification Cycle</p>
        </div>
      </div>

      <span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded uppercase">
        Stage 2 of 10
      </span>
    </div>

    <!-- 8 Workflow Checkpoints -->
    <div class="space-y-1.5 font-sans">
      <!-- 1. Property -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="hasSelectedProperty ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="hasSelectedProperty ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ hasSelectedProperty ? '✓' : '1' }}
          </span>
          <span class="font-semibold text-slate-800">1. Property Geolocation</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600 font-mono">
          {{ hasSelectedProperty ? 'Verified' : 'Pending' }}
        </span>
      </div>

      <!-- 2. Boundary -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="roofBoundaryDrawn ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="roofBoundaryDrawn ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ roofBoundaryDrawn ? '✓' : '2' }}
          </span>
          <span class="font-semibold text-slate-800">2. Roof Boundary (Polygon)</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600 font-mono">
          {{ roofBoundaryDrawn ? 'Drawn' : 'Pending' }}
        </span>
      </div>

      <!-- 3. Structure -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="roofBoundaryDrawn ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="roofBoundaryDrawn ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ roofBoundaryDrawn ? '✓' : '3' }}
          </span>
          <span class="font-semibold text-slate-800">3. Structure: {{ roofStructureType }} ({{ roofPitchDegrees }}°)</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono">
          Installer Input
        </span>
      </div>

      <!-- 4. Area -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="roofAreaSqM > 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="roofAreaSqM > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ roofAreaSqM > 0 ? '✓' : '4' }}
          </span>
          <span class="font-semibold text-slate-800">4. Area: {{ roofAreaSqM > 0 ? `${roofAreaSqM} m²` : '--' }}</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
          Calculated
        </span>
      </div>

      <!-- 5. Obstructions -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="obstructions.length > 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="obstructions.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ obstructions.length > 0 ? '✓' : '5' }}
          </span>
          <span class="font-semibold text-slate-800">5. Obstructions: {{ obstructions.length }} logged</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600 font-mono">
          {{ obstructions.length > 0 ? 'Assessed' : 'None' }}
        </span>
      </div>

      <!-- 6. Solar Layout -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="physicalPanelCount > 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="physicalPanelCount > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ physicalPanelCount > 0 ? '✓' : '6' }}
          </span>
          <span class="font-semibold text-slate-800">6. Physical Sizing: {{ physicalPanelCount }} panels ({{ estimatedSystemCapacityKwp }} kWp)</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 font-mono">
          {{ physicalPanelCount > 0 ? 'Fitted' : 'Waiting' }}
        </span>
      </div>

      <!-- 7. Shading -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="shadingAssessment ? 'bg-purple-50/70 border-purple-200 text-purple-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="shadingAssessment ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ shadingAssessment ? '✓' : '7' }}
          </span>
          <span class="font-semibold text-slate-800">7. Shading: {{ shadingAssessment ? `${shadingAssessment.shadingPercentage}% (${shadingAssessment.riskLevel})` : 'Pending' }}</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 font-mono">
          {{ shadingAssessment ? 'Simulated' : 'Waiting' }}
        </span>
      </div>

      <!-- 8. 3D Model -->
      <div class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
        :class="activeRoofModel ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'">
        <div class="flex items-center gap-2.5">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="activeRoofModel ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ activeRoofModel ? '✓' : '8' }}
          </span>
          <span class="font-semibold text-slate-800">8. Babylon 3D Model Ready</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
          {{ activeRoofModel ? 'Active' : 'Waiting' }}
        </span>
      </div>
    </div>

    <!-- Methodology Assurance -->
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 text-[11px] space-y-1">
      <div class="font-semibold text-slate-800 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-blue-500"></span>
        <span>Independent Field Engineering</span>
      </div>
      <p class="leading-relaxed text-[10px] text-slate-500">
        All rooftop geometry is computed directly from installer-drawn Google Maps vectors and physical placement algorithms. No Google Solar API dependency.
      </p>
    </div>
  </div>
</template>

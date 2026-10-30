<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const WORKFLOW_GUIDES = [
  {
    step: '1. Site Assessment & Map Selection',
    color: 'bg-blue-600',
    desc: 'Search addresses with Google Places, enter WGS-84 coordinates, or click anywhere on the Google Maps satellite view to establish project coordinates.'
  },
  {
    step: '2. Google Solar Building Insights',
    color: 'bg-amber-500',
    desc: 'Click "Start Roof Assessment" to query Google Solar API. The system retrieves building dimensions, whole roof area, sunshine hours, and roof segment statistics where available.'
  },
  {
    step: '3. Roof Verification & Obstacles',
    color: 'bg-purple-600',
    desc: 'Verify the detected roof slope, pitch, azimuth, and classification. Mark rooftop obstacles (HVAC, chimneys, vents) to deduct non-viable areas from the usable surface.'
  },
  {
    step: '4. 3D Rooftop Reconstruction (Babylon.js)',
    color: 'bg-indigo-600',
    desc: 'Interact with the roof-only 3D model. Adjust pitch, azimuth, dimensions, and place solar panels to simulate array layout and count.'
  },
  {
    step: '5. Solar Potential Analysis',
    color: 'bg-amber-600',
    desc: 'Review modeled monthly solar yields and roof segment insolation curves powered by Apache ECharts and Google Solar data.'
  },
  {
    step: '6. Intelligent Load Analysis',
    color: 'bg-indigo-500',
    desc: 'Enter 12-month historical electricity kWh or utility bills. The system models the diurnal 24-hour demand curve, solar coverage, and self-consumption ratio.'
  },
  {
    step: '7. Equipment Catalog & Inverter Matching',
    color: 'bg-slate-700',
    desc: 'Select PV modules and inverters from the certified equipment catalog. The sizing engine calculates system DC capacity and validates the DC/AC ratio and MPPT range.'
  },
  {
    step: '8. Feasibility Review & Project Report',
    color: 'bg-emerald-600',
    desc: 'The engineering rule engine checks geometric, solar, electrical, and equipment constraints. Apply technical sign-off and print or export the PDF submittal pack.'
  }
]
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">HELIOS-LOAD Installer Engineering Guide</h3>
            <p class="text-xs text-slate-500">Comprehensive Solar Workflow Manual</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-6 space-y-4 overflow-y-auto text-xs text-slate-600">
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-blue-900">
          <h4 class="font-bold flex items-center gap-2 text-xs uppercase tracking-wider text-blue-700 mb-1">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Professional Installer Workflow
          </h4>
          <p class="text-[11px] leading-relaxed text-blue-800">
            HELIOS-LOAD unites Google Maps Satellite & Hybrid cartography, Google Solar Building Insights, Digos City geographic boundaries, Babylon.js 3D rooftop simulation, and Apache ECharts demand modeling into a unified installer engineering pipeline.
          </p>
        </div>

        <div class="space-y-2.5">
          <div
            v-for="guide in WORKFLOW_GUIDES"
            :key="guide.step"
            class="border border-slate-200 rounded-xl p-3 bg-white hover:bg-slate-50/50 transition-colors"
          >
            <h5 class="font-semibold text-slate-900 text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
              <span :class="['w-2 h-2 rounded-full', guide.color]"></span>
              {{ guide.step }}
            </h5>
            <p class="text-[11px] text-slate-600 leading-relaxed">
              {{ guide.desc }}
            </p>
          </div>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <div>
            <span class="font-semibold text-slate-800">Field Engineering Desk</span>
            <p class="text-slate-500 text-[11px]">Digos City Operations &bull; Google Maps &amp; Solar Engine</p>
          </div>
          <span class="font-mono text-blue-600 font-bold bg-white px-2.5 py-1 rounded border border-slate-200 text-[11px]">
            WGS-84 / Google Maps API
          </span>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-black"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
</template>

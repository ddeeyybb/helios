<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInstallerData } from '~/composables/useInstallerData'
import { useSiteAssessment } from '~/composables/useSiteAssessment'

const route = useRoute()
const router = useRouter()
const { activeProject } = useInstallerData()
const { hasSelectedProperty } = useSiteAssessment()

const STEPS = [
  { id: 1, name: 'Property', route: '/site-assessment', match: ['/site-assessment'] },
  { id: 2, name: 'Roof Assessment', route: '/site-assessment', match: ['/site-assessment'] },
  { id: 3, name: '3D Rooftop', route: '/rooftop', match: ['/rooftop'] },
  { id: 4, name: 'Solar Analysis', route: '/solar-analysis', match: ['/solar-analysis'] },
  { id: 5, name: 'Load Analysis', route: '/load-analysis', match: ['/load-analysis'] },
  { id: 6, name: 'Equipment Sizing', route: '/equipment', match: ['/equipment'] },
  { id: 7, name: 'Feasibility & Report', route: '/reports', match: ['/reports'] }
]

const currentStepId = computed(() => {
  const path = route.path
  if (path.startsWith('/site-assessment')) return 1
  if (path.startsWith('/rooftop')) return 3
  if (path.startsWith('/solar-analysis')) return 4
  if (path.startsWith('/load-analysis')) return 5
  if (path.startsWith('/equipment')) return 6
  if (path.startsWith('/reports')) return 7
  return 1
})

function navigateToStep(stepRoute: string) {
  router.push(stepRoute)
}
</script>

<template>
  <div class="bg-white border-b border-slate-200 px-6 py-2">
    <!-- Stepper horizontal scroll track -->
    <div class="overflow-x-auto pb-1 scrollbar-thin">
      <div class="flex items-center gap-1.5 min-w-[780px]">
        <div
          v-for="(step, idx) in STEPS"
          :key="step.id"
          class="flex items-center"
        >
          <!-- Step card button -->
          <button
            type="button"
            @click="navigateToStep(step.route)"
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all select-none cursor-pointer',
              step.id === currentStepId
                ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-sm'
                : step.id < currentStepId
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium hover:bg-emerald-100'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            ]"
          >
            <!-- Number / Check icon -->
            <span
              :class="[
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                step.id === currentStepId
                  ? 'bg-white text-blue-700'
                  : step.id < currentStepId
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
              ]"
            >
              <svg v-if="step.id < currentStepId" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span v-else>{{ idx + 1 }}</span>
            </span>

            <span class="whitespace-nowrap">{{ step.name }}</span>
          </button>

          <!-- Connector line -->
          <div
            v-if="idx < STEPS.length - 1"
            :class="[
              'w-3 h-0.5 mx-0.5',
              step.id < currentStepId ? 'bg-emerald-400' : 'bg-slate-200'
            ]"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

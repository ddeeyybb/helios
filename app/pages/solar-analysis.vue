<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInstallerData } from '~/composables/useInstallerData'
import EChartContainer from '~/components/charts/EChartContainer.vue'
import type { EChartsOption } from 'echarts'
import type { RoofSegment } from '~/types/roof'

useHead({
  title: 'Solar Potential Analysis | HELIOS-LOAD Installer Platform'
})

const { activeProject, updateProject } = useInstallerData()

const manualPsh = ref<number>(4.8) // Peak sun hours per day
const manualDerate = ref<number>(0.82) // System performance ratio

const hasSolarData = computed(() => {
  return !!(
    activeProject.value?.solarAnalysis?.estimatedAnnualProductionKwh ||
    (activeProject.value?.solarAnalysis?.status === 'Completed' &&
      activeProject.value?.solarAnalysis?.maxSunshineHoursPerYear) ||
    (activeProject.value?.systemSizing?.systemDcCapacityKwp && activeProject.value.systemSizing.systemDcCapacityKwp > 0) ||
    activeProject.value?.roofModel
  )
})

const solarData = computed(() => {
  return activeProject.value?.solarAnalysis || null
})

const roofSegments = computed<RoofSegment[]>(() => {
  return activeProject.value?.roofModel?.roofSegments || activeProject.value?.roofModel?.segments || []
})

// Calculate annual production: project analysis or formula
const annualYieldKwh = computed(() => {
  if (solarData.value?.estimatedAnnualProductionKwh) {
    return solarData.value.estimatedAnnualProductionKwh
  }
  // If DC capacity exists, estimate from PSH and PR
  const dcKwp = activeProject.value?.systemSizing?.systemDcCapacityKwp || 0
  if (dcKwp > 0) {
    return Math.round(dcKwp * manualPsh.value * 365 * manualDerate.value)
  }
  return null
})

// ECharts Options: Roof Segment Solar Potential
const segmentChartOptions = computed<EChartsOption>(() => {
  const segments = roofSegments.value
  if (!segments || segments.length === 0) {
    return {
      title: { text: 'Roof Segments (No segments detected)', textStyle: { fontSize: 12, color: '#94a3b8' } },
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: []
    }
  }

  const names = segments.map((_, i) => `Segment ${i + 1}`)
  const areas = segments.map((s) => Math.round(s.areaMeters2 || s.areaM2 || 0))
  const pitches = segments.map((s) => Math.round(s.pitchDegrees || 0))

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Segment Area (m²)', 'Pitch (°)'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'Area (m²)', min: 0 },
      { type: 'value', name: 'Pitch (°)', min: 0 }
    ],
    series: [
      {
        name: 'Segment Area (m²)',
        type: 'bar',
        data: areas,
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: 'Pitch (°)',
        type: 'line',
        yAxisIndex: 1,
        data: pitches,
        itemStyle: { color: '#f59e0b' }
      }
    ]
  }
})

// ECharts Options: Monthly Solar Production Curve
const monthlyProductionChartOptions = computed<EChartsOption>(() => {
  const annual = annualYieldKwh.value || 0
  if (annual <= 0) {
    return {
      title: { text: 'Monthly Solar Yield Curve', textStyle: { fontSize: 12, color: '#94a3b8' } },
      xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
      yAxis: { type: 'value' },
      series: []
    }
  }

  // Monthly insolation distribution weights (regional Digos City tropical distribution)
  const weights = [0.082, 0.084, 0.095, 0.098, 0.092, 0.085, 0.082, 0.084, 0.080, 0.076, 0.070, 0.072]
  const monthlyKwh = weights.map(w => Math.round(annual * w))

  return {
    tooltip: { trigger: 'axis', formatter: '{b}: <strong>{c} kWh</strong>' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      axisLabel: { fontSize: 10 }
    },
    yAxis: { type: 'value', name: 'kWh', axisLabel: { fontSize: 10 } },
    series: [
      {
        name: 'Monthly Solar Production',
        type: 'bar',
        data: monthlyKwh,
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
})

function saveManualSolarEstimate() {
  if (!activeProject.value || !annualYieldKwh.value) return

  updateProject(activeProject.value.id, {
    status: 'Load Analysis',
    currentStep: Math.max(activeProject.value.currentStep, 5),
    solarAnalysis: {
      ...activeProject.value.solarAnalysis,
      status: 'Completed',
      estimatedAnnualProductionKwh: annualYieldKwh.value,
      installerOverrideProductionKwh: annualYieldKwh.value,
      notes: `Installer calculated using ${manualPsh.value} PSH/day and ${Math.round(manualDerate.value * 100)}% PR.`
    }
  })
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Solar Potential & Irradiance Analysis</h1>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            Regional Solar Model + ECharts
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">
          Rooftop solar insolation metrics, annual energy yield estimates, and orientation telemetry.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <NuxtLink
          to="/site-assessment"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          ← Back to GIS Map
        </NuxtLink>

        <NuxtLink
          to="/load-analysis"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
        >
          Next: Load Analysis →
        </NuxtLink>
      </div>
    </div>

    <!-- Active Project Banner -->
    <div v-if="activeProject" class="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-blue-900">Active Project:</span>
        <span class="font-bold text-slate-900">{{ activeProject.name }}</span>
        <span class="text-blue-300">|</span>
        <span class="text-slate-600">{{ activeProject.clientName }}</span>
        <span class="text-blue-300">|</span>
        <span class="font-mono text-slate-500">
          {{ activeProject.latitude ? `${activeProject.latitude.toFixed(4)}°, ${activeProject.longitude?.toFixed(4)}°` : 'Coordinates pending' }}
        </span>
      </div>
      <NuxtLink to="/projects" class="font-semibold text-blue-700 hover:underline">Change</NuxtLink>
    </div>

    <!-- Real Solar Data View -->
    <div v-if="hasSolarData" class="space-y-6">
      <!-- Accuracy Disclaimer -->
      <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            <strong>Estimated Solar Potential:</strong> Solar potential calculated from drawn rooftop geometry, regional solar insolation, and installer verified parameters.
          </span>
        </div>
        <span class="text-[11px] font-mono text-blue-800 shrink-0 font-bold">Model: Verified Sizing</span>
      </div>

      <!-- Key Solar Telemetry Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Est. Annual DC Production</span>
          <div class="text-2xl font-bold font-mono text-blue-600 mt-1">
            {{ annualYieldKwh ? `${annualYieldKwh.toLocaleString()} kWh` : '--' }}
          </div>
          <span class="text-[10px] text-slate-500">Calculated Annual Yield</span>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Max Sunshine Hours / Year</span>
          <div class="text-2xl font-bold font-mono text-amber-600 mt-1">
            {{ solarData?.maxSunshineHoursPerYear ? `${solarData.maxSunshineHoursPerYear.toLocaleString()} hrs` : '1,643 hrs' }}
          </div>
          <span class="text-[10px] text-slate-500">Direct & diffuse solar window</span>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Max Panel Capacity</span>
          <div class="text-2xl font-bold font-mono text-slate-900 mt-1">
            {{ (activeProject?.systemSizing?.moduleCount || solarData?.maxArrayPanelsCount) ? `${activeProject?.systemSizing?.moduleCount || solarData?.maxArrayPanelsCount} modules` : '--' }}
          </div>
          <span class="text-[10px] text-slate-500">Based on usable roof boundary</span>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated System Size</span>
          <div class="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {{ activeProject?.systemSizing?.systemDcCapacityKwp ? `${activeProject.systemSizing.systemDcCapacityKwp} kWp` : '--' }}
          </div>
          <span class="text-[10px] text-slate-500">DC Array Rating</span>
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Monthly Production Bar Chart -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 class="font-bold text-sm text-slate-900">Monthly Generation Distribution</h3>
              <p class="text-xs text-slate-400">Modeled monthly kWh output based on Digos insolation</p>
            </div>
            <span class="text-xs font-mono font-bold text-blue-600">kWh / Month</span>
          </div>
          <div class="h-64">
            <EChartContainer :options="monthlyProductionChartOptions" />
          </div>
        </div>

        <!-- Roof Segments Comparison Chart -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 class="font-bold text-sm text-slate-900">Roof Segment Profile</h3>
              <p class="text-xs text-slate-400">Segment area and pitch comparison</p>
            </div>
            <span class="text-xs font-mono font-bold text-amber-600">Segments</span>
          </div>
          <div class="h-64">
            <EChartContainer :options="segmentChartOptions" />
          </div>
        </div>
      </div>

      <!-- Segments Table -->
      <div v-if="roofSegments.length > 0" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-sm text-slate-900">Rooftop Plane Orientation Telemetry</h3>
          <span class="text-slate-400">{{ roofSegments.length }} Segment(s)</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th class="px-5 py-3">Segment</th>
                <th class="px-4 py-3">Pitch</th>
                <th class="px-4 py-3">Azimuth</th>
                <th class="px-4 py-3">Gross Area</th>
                <th class="px-5 py-3">Orientation</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(seg, idx) in roofSegments" :key="idx" class="hover:bg-slate-50/80">
                <td class="px-5 py-3 font-bold text-slate-900">Segment {{ idx + 1 }}</td>
                <td class="px-4 py-3 font-mono">{{ Math.round(seg.pitchDegrees || 0) }}°</td>
                <td class="px-4 py-3 font-mono">{{ Math.round(seg.azimuthDegrees || 0) }}°</td>
                <td class="px-4 py-3 font-mono">{{ Math.round(seg.areaMeters2 || seg.areaM2 || 0) }} m²</td>
                <td class="px-5 py-3">
                  <span
                    :class="[
                      'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                      (seg.azimuthDegrees >= 120 && seg.azimuthDegrees <= 240)
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    ]"
                  >
                    {{ (seg.azimuthDegrees >= 120 && seg.azimuthDegrees <= 240) ? 'Optimal South' : 'Secondary' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Unavailable State / Manual Prompt -->
    <div v-else class="space-y-6">
      <div class="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto shadow-sm space-y-4">
        <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        </div>

        <div>
          <h3 class="text-base font-bold text-slate-900">Rooftop boundary drawing is pending</h3>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Please draw the roof perimeter on the GIS satellite map to calculate usable area and system sizing.
          </p>
        </div>

        <div class="pt-2 flex items-center justify-center gap-3">
          <NuxtLink
            to="/site-assessment"
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
          >
            Draw Roof on Map →
          </NuxtLink>
        </div>
      </div>

      <!-- Manual Engineering Insolation Input Mode -->
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-2xl mx-auto space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Regional Solar Insolation Parameters</h3>
            <p class="text-slate-500">Provide local meteorological peak sun hours to model production</p>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
            Manual Mode
          </span>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Peak Sun Hours (PSH / day)</label>
            <input
              v-model.number="manualPsh"
              type="number"
              step="0.1"
              min="2"
              max="7.5"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
            />
            <span class="text-[10px] text-slate-400">Typical range: 4.0 - 5.5 kWh/m²/day</span>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">System Performance Ratio (PR)</label>
            <input
              v-model.number="manualDerate"
              type="number"
              step="0.01"
              min="0.65"
              max="0.90"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
            />
            <span class="text-[10px] text-slate-400">Inverter, wiring, soiling & thermal losses (~80%)</span>
          </div>
        </div>

        <div v-if="annualYieldKwh" class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
          <div>
            <span class="text-[10px] font-bold uppercase text-slate-400">Calculated Annual Yield</span>
            <div class="text-lg font-bold font-mono text-blue-600">{{ annualYieldKwh.toLocaleString() }} kWh/yr</div>
          </div>
          <button
            type="button"
            @click="saveManualSolarEstimate"
            class="px-3.5 py-2 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
          >
            Save to Project
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

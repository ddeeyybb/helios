<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useInstallerData } from '~/composables/useInstallerData'
import EChartContainer from '~/components/charts/EChartContainer.vue'
import type { EChartsOption } from 'echarts'

useHead({
  title: 'Intelligent Load Analysis | HELIOS-LOAD Installer Platform'
})

const { activeProject, updateProject, settings } = useInstallerData()

// Input Mode: monthly_kwh | monthly_bills | quick_preset
const inputMode = ref<'monthly_kwh' | 'monthly_bills' | 'quick_preset'>('monthly_kwh')
const tariffRate = ref<number>(settings.value.defaultTariffPerKwh || 0.16)
const currency = ref<string>(settings.value.currency || 'USD')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 12-month kWh inputs
const monthlyKwh = ref<number[]>([450, 420, 480, 520, 610, 680, 720, 690, 590, 510, 440, 460])
// 12-month Bill inputs
const monthlyBills = ref<number[]>([72, 67, 76, 83, 97, 108, 115, 110, 94, 81, 70, 73])

const peakDemandKw = ref<number>(4.2)
const baseLoadKw = ref<number>(0.8)
const hasHourlyProfile = ref<boolean>(false)
const saveFeedback = ref('')

// Initialize from activeProject if available
onMounted(() => {
  if (activeProject.value?.loadAnalysis) {
    const la = activeProject.value.loadAnalysis
    if (la.monthlyKwh && la.monthlyKwh.some(k => k > 0)) {
      monthlyKwh.value = [...la.monthlyKwh]
    }
    if (la.monthlyBills && la.monthlyBills.some(b => b > 0)) {
      monthlyBills.value = [...la.monthlyBills]
    }
    if (la.tariffRatePerKwh) tariffRate.value = la.tariffRatePerKwh
    if (la.currency) currency.value = la.currency
    if (la.peakDemandKw) peakDemandKw.value = la.peakDemandKw
    if (la.baseLoadKw) baseLoadKw.value = la.baseLoadKw
    hasHourlyProfile.value = la.hasHourlyProfile
  }
})

// Calculations
const effectiveMonthlyKwh = computed(() => {
  if (inputMode.value === 'monthly_bills') {
    const rate = Math.max(0.01, tariffRate.value)
    return monthlyBills.value.map(b => Math.round(b / rate))
  }
  return monthlyKwh.value
})

const totalAnnualKwh = computed(() => {
  return effectiveMonthlyKwh.value.reduce((sum, val) => sum + (val || 0), 0)
})

const avgMonthlyKwh = computed(() => {
  return Math.round(totalAnnualKwh.value / 12)
})

const avgDailyKwh = computed(() => {
  return Math.round((totalAnnualKwh.value / 365) * 10) / 10
})

const annualSolarYieldKwh = computed(() => {
  return activeProject.value?.solarAnalysis?.estimatedAnnualProductionKwh ||
    (activeProject.value?.systemSizing?.systemDcCapacityKwp || 0) * 1450 || 0
})

// Solar Coverage %
const solarCoveragePercent = computed(() => {
  if (totalAnnualKwh.value <= 0) return 0
  const cov = (annualSolarYieldKwh.value / totalAnnualKwh.value) * 100
  return Math.min(100, Math.round(cov * 10) / 10)
})

// Self-Consumption Ratio %
const selfConsumptionPercent = computed(() => {
  if (annualSolarYieldKwh.value <= 0) return 0
  const ratio = Math.min(1, totalAnnualKwh.value * 0.75 / annualSolarYieldKwh.value)
  return Math.round(ratio * 100)
})

// Grid Dependency %
const gridDependencyPercent = computed(() => {
  return Math.max(0, Math.round(100 - solarCoveragePercent.value))
})

// Presets
function applyPreset(type: 'residential' | 'commercial_small' | 'industrial') {
  if (type === 'residential') {
    monthlyKwh.value = [450, 420, 480, 520, 610, 680, 720, 690, 590, 510, 440, 460]
    peakDemandKw.value = 4.2
    baseLoadKw.value = 0.8
  } else if (type === 'commercial_small') {
    monthlyKwh.value = [2200, 2100, 2400, 2600, 2900, 3100, 3200, 3100, 2800, 2500, 2300, 2200]
    peakDemandKw.value = 18.5
    baseLoadKw.value = 4.5
  } else {
    monthlyKwh.value = [12000, 11500, 13000, 13800, 15000, 15500, 15800, 15200, 14200, 13500, 12800, 12200]
    peakDemandKw.value = 65.0
    baseLoadKw.value = 18.0
  }
}

// ECharts Options: Monthly Consumption vs Solar Yield
const monthlyChartOptions = computed<EChartsOption>(() => {
  const load = effectiveMonthlyKwh.value
  const solarAnnual = annualSolarYieldKwh.value
  const weights = [0.082, 0.084, 0.095, 0.098, 0.092, 0.085, 0.082, 0.084, 0.080, 0.076, 0.070, 0.072]
  const solar = weights.map(w => Math.round(solarAnnual * w))

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Customer Load (kWh)', 'Est. Solar Generation (kWh)'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: MONTHS, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' as const, name: 'kWh', axisLabel: { fontSize: 10 } },
    series: [
      {
        name: 'Customer Load (kWh)',
        type: 'bar',
        data: load,
        itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: 'Est. Solar Generation (kWh)',
        type: 'line',
        data: solar,
        smooth: true,
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 3 }
      }
    ]
  }
})

// ECharts Options: 24-Hour Daily Profile & Solar Bell Curve
const dailyLoadChartOptions = computed<EChartsOption>(() => {
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)

  // Modeled typical 24-hr load normalized to peakDemandKw
  const peak = peakDemandKw.value || 4.2
  const base = baseLoadKw.value || 0.8
  const loadProfile = [
    base * 1.1, base * 1.0, base * 0.9, base * 0.9, base * 1.0, base * 1.3,
    peak * 0.6, peak * 0.75, peak * 0.65, peak * 0.55, peak * 0.5, peak * 0.55,
    peak * 0.6, peak * 0.65, peak * 0.6, peak * 0.7, peak * 0.8, peak * 0.95,
    peak * 1.0, peak * 0.9, peak * 0.75, peak * 0.55, peak * 0.4, base * 1.2
  ].map(v => Math.round(v * 10) / 10)

  // Solar generation bell curve (peaks around 12:00 - 13:00)
  const systemDc = activeProject.value?.systemSizing?.systemDcCapacityKwp || 8.0
  const solarProfile = hours.map((_, i) => {
    if (i < 6 || i > 18) return 0
    const x = (i - 12) / 3.2
    const bell = Math.exp(-0.5 * x * x)
    return Math.round(systemDc * bell * 0.85 * 10) / 10
  })

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Load Demand (kW)', 'PV Generation (kW)'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: hours, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value' as const, name: 'kW', axisLabel: { fontSize: 10 } },
    series: [
      {
        name: 'Load Demand (kW)',
        type: 'line',
        data: loadProfile,
        smooth: true,
        itemStyle: { color: '#4f46e5' },
        areaStyle: { opacity: 0.1, color: '#4f46e5' }
      },
      {
        name: 'PV Generation (kW)',
        type: 'line',
        data: solarProfile,
        smooth: true,
        itemStyle: { color: '#f59e0b' },
        areaStyle: { opacity: 0.2, color: '#f59e0b' }
      }
    ]
  }
})

function saveLoadAnalysis() {
  if (!activeProject.value) return

  updateProject(activeProject.value.id, {
    status: 'System Design',
    currentStep: Math.max(activeProject.value.currentStep, 6),
    loadAnalysis: {
      ...activeProject.value.loadAnalysis,
      billingMethod: inputMode.value === 'monthly_bills' ? 'monthly_bills' : 'monthly_kwh',
      monthlyKwh: [...effectiveMonthlyKwh.value],
      monthlyBills: [...monthlyBills.value],
      annualKwh: totalAnnualKwh.value,
      avgMonthlyKwh: avgMonthlyKwh.value,
      avgDailyKwh: avgDailyKwh.value,
      peakDemandKw: peakDemandKw.value,
      baseLoadKw: baseLoadKw.value,
      tariffRatePerKwh: tariffRate.value,
      currency: currency.value,
      hasHourlyProfile: hasHourlyProfile.value,
      solarCoveragePercent: solarCoveragePercent.value,
      selfConsumptionPercent: selfConsumptionPercent.value,
      gridDependencyPercent: gridDependencyPercent.value,
      notes: `Entered by installer via ${inputMode.value}.`
    }
  })

  saveFeedback.value = 'Load analysis saved to project.'
  setTimeout(() => { saveFeedback.value = '' }, 3000)
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Intelligent Load Analysis</h1>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
            Demand Analytics
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">
          Historical energy billing analysis, daily load curve modeling, and solar self-consumption profiling.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="saveFeedback" class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
          {{ saveFeedback }}
        </span>

        <button
          type="button"
          @click="saveLoadAnalysis"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
        >
          Save to Project
        </button>

        <NuxtLink
          to="/equipment"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          Equipment Sizing →
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
          {{ activeProject.address || 'Address pending' }}
        </span>
      </div>
      <NuxtLink to="/projects" class="font-semibold text-blue-700 hover:underline">Change</NuxtLink>
    </div>

    <!-- Key Energy Calculations Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Annual Consumption</span>
        <div class="text-xl font-bold font-mono text-slate-900 mt-1">
          {{ totalAnnualKwh > 0 ? `${totalAnnualKwh.toLocaleString()} kWh` : '--' }}
        </div>
        <span class="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded">User Entered</span>
      </div>

      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Average Monthly</span>
        <div class="text-xl font-bold font-mono text-slate-900 mt-1">
          {{ avgMonthlyKwh > 0 ? `${avgMonthlyKwh.toLocaleString()} kWh` : '--' }}
        </div>
        <span class="text-[10px] text-slate-500">Calculated</span>
      </div>

      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Peak Demand</span>
        <div class="text-xl font-bold font-mono text-rose-600 mt-1">
          {{ peakDemandKw > 0 ? `${peakDemandKw} kW` : '--' }}
        </div>
        <span class="text-[10px] text-slate-500">Max instantaneous</span>
      </div>

      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Solar Coverage</span>
        <div class="text-xl font-bold font-mono text-emerald-600 mt-1">
          {{ solarCoveragePercent }}%
        </div>
        <span class="text-[10px] text-slate-500">Annual offset</span>
      </div>

      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Self-Consumption</span>
        <div class="text-xl font-bold font-mono text-blue-600 mt-1">
          {{ selfConsumptionPercent }}%
        </div>
        <span class="text-[10px] text-slate-500">Consumed on-site</span>
      </div>

      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grid Dependency</span>
        <div class="text-xl font-bold font-mono text-slate-700 mt-1">
          {{ gridDependencyPercent }}%
        </div>
        <span class="text-[10px] text-slate-500">Net grid import</span>
      </div>
    </div>

    <!-- Data Entry Toolbar & Presets -->
    <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-900">Input Mode:</span>
          <button
            type="button"
            @click="inputMode = 'monthly_kwh'"
            :class="['px-3 py-1.5 rounded-lg font-semibold', inputMode === 'monthly_kwh' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
          >
            Monthly kWh
          </button>
          <button
            type="button"
            @click="inputMode = 'monthly_bills'"
            :class="['px-3 py-1.5 rounded-lg font-semibold', inputMode === 'monthly_bills' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
          >
            Monthly Bills ({{ currency }})
          </button>
        </div>

        <!-- Quick Presets -->
        <div class="flex items-center gap-1.5">
          <span class="text-slate-400">Load Templates:</span>
          <button
            type="button"
            @click="applyPreset('residential')"
            class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-medium text-slate-700"
          >
            Residential (~500kWh)
          </button>
          <button
            type="button"
            @click="applyPreset('commercial_small')"
            class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-medium text-slate-700"
          >
            Commercial (~2.5MWh)
          </button>
          <button
            type="button"
            @click="applyPreset('industrial')"
            class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-medium text-slate-700"
          >
            Industrial (~14MWh)
          </button>
        </div>
      </div>

      <!-- Tariff rate input if in bills mode -->
      <div v-if="inputMode === 'monthly_bills'" class="flex items-center gap-4 bg-blue-50/50 p-3 rounded-lg border border-blue-200">
        <div>
          <label class="block font-semibold text-slate-700 mb-0.5">Utility Tariff Rate ({{ currency }} / kWh)</label>
          <input
            v-model.number="tariffRate"
            type="number"
            step="0.01"
            class="px-2 py-1 rounded border border-slate-300 font-mono"
          />
        </div>
        <p class="text-[11px] text-slate-600 max-w-md">
          Monthly kWh will be calculated automatically by dividing each bill by this tariff rate.
        </p>
      </div>

      <!-- 12-Month Table Inputs -->
      <div class="overflow-x-auto">
        <table class="w-full text-center text-xs">
          <thead class="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
            <tr>
              <th v-for="m in MONTHS" :key="m" class="px-2 py-2">{{ m }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="inputMode === 'monthly_kwh'">
              <td v-for="(_, i) in MONTHS" :key="i" class="p-1">
                <input
                  v-model.number="monthlyKwh[i]"
                  type="number"
                  min="0"
                  class="w-full text-center px-1.5 py-1.5 rounded border border-slate-200 font-mono text-slate-900 font-semibold focus:ring-1 focus:ring-blue-500"
                />
              </td>
            </tr>
            <tr v-else>
              <td v-for="(_, i) in MONTHS" :key="i" class="p-1">
                <input
                  v-model.number="monthlyBills[i]"
                  type="number"
                  min="0"
                  class="w-full text-center px-1.5 py-1.5 rounded border border-slate-200 font-mono text-slate-900 font-semibold focus:ring-1 focus:ring-blue-500"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Demand Parameters -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Peak Demand (kW)</label>
          <input
            v-model.number="peakDemandKw"
            type="number"
            step="0.1"
            class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono"
          />
        </div>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Base Load (kW)</label>
          <input
            v-model.number="baseLoadKw"
            type="number"
            step="0.1"
            class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono"
          />
        </div>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Hourly Profile Data</label>
          <div class="pt-1.5 text-slate-500 italic text-[11px]">
            Modeled from peak & base load curve
          </div>
        </div>
        <div class="flex items-end">
          <button
            type="button"
            @click="saveLoadAnalysis"
            class="w-full py-1.5 px-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-sm"
          >
            Apply & Save
          </button>
        </div>
      </div>
    </div>

    <!-- Charts Grid (Apache ECharts) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Monthly Consumption vs Solar -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Monthly Load vs. Solar Generation</h2>
            <p class="text-[11px] text-slate-500">Comparison of seasonal grid energy demand against modeled PV array output</p>
          </div>
          <span class="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Apache ECharts</span>
        </div>
        <div class="h-64">
          <ClientOnly>
            <EChartContainer :options="monthlyChartOptions" />
          </ClientOnly>
        </div>
      </div>

      <!-- 24-Hour Diurnal Load Profile -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Diurnal 24-Hour Load Curve vs. PV Bell Curve</h2>
            <p class="text-[11px] text-slate-500">Daily concurrency between facility consumption and solar irradiance</p>
          </div>
          <span class="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Hourly Profile</span>
        </div>
        <div class="h-64">
          <ClientOnly>
            <EChartContainer :options="dailyLoadChartOptions" />
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>

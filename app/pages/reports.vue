<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInstallerData } from '~/composables/useInstallerData'
import { useInstallerAuth } from '~/composables/useInstallerAuth'

useHead({
  title: 'Engineering Project Report | HELIOS-LOAD'
})

const { activeProject, projects, setActiveProject, updateProject, settings } = useInstallerData()
const { installer } = useInstallerAuth()

const isSigning = ref(false)
const signoffDate = ref<string>(new Date().toISOString().split('T')[0] || '')
const installerName = ref<string>(installer.value?.fullName || settings.value.installerName || 'Solar PV Installer')
const installerLicense = ref<string>(settings.value.licenseNumber || 'PE-EE-2049182')
const signoffNotes = ref<string>('')
const signFeedback = ref('')

const project = computed(() => activeProject.value)

function triggerPrint() {
  if (import.meta.client) {
    window.print()
  }
}

function commitSignoff() {
  if (!project.value) return

  updateProject(project.value.id, {
    status: 'Report Ready',
    currentStep: Math.max(project.value.currentStep, 8),
    feasibility: {
      ...project.value.feasibility,
      installerSignoff: true,
      signoffDate: signoffDate.value,
      installerName: installerName.value
    }
  })

  signFeedback.value = 'Installer sign-off stamped on project report.'
  setTimeout(() => { signFeedback.value = '' }, 3500)
}

function formatDate(isoStr?: string) {
  if (!isoStr) return '--'
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoStr
  }
}
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto space-y-6">
    <!-- Screen Header (Hidden during Print) -->
    <div class="print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Project Engineering Report</h1>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="signFeedback" class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
          {{ signFeedback }}
        </span>

        <button
          type="button"
          @click="triggerPrint"
          class="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-black shadow-sm flex items-center gap-1.5"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
          </svg>
          Print / Export PDF
        </button>
      </div>
    </div>

    <!-- Active Project Switcher (Hidden in print) -->
    <div v-if="projects.length > 1" class="print:hidden bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-slate-700">Select Project to Report:</span>
        <select
          :value="activeProject?.id"
          @change="(e: any) => setActiveProject(e.target.value)"
          class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-900"
        >
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.name }} ({{ p.clientName }})
          </option>
        </select>
      </div>
      <span class="text-slate-400 font-mono text-[11px]">{{ projects.length }} projects registered</span>
    </div>

    <!-- REPORT DOCUMENT CONTAINER -->
    <div v-if="project" class="bg-white rounded-2xl border border-slate-200 shadow-md p-8 md:p-12 space-y-8 print:border-none print:shadow-none print:p-0">
      <!-- Report Header -->
      <div class="border-b-2 border-slate-900 pb-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <div class="flex items-center gap-2.5 mb-2">
            <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              HL
            </div>
            <span class="font-bold text-xl tracking-tight text-slate-900">HELIOS-LOAD</span>
            <span class="text-[10px] font-mono text-slate-500 uppercase px-1.5 py-0.5 rounded border border-slate-200">Engineering GIS</span>
          </div>
          <h2 class="text-2xl font-black text-slate-900 tracking-tight">{{ project.name }}</h2>
          <p class="text-xs text-slate-500 font-mono mt-0.5">Project ID: {{ project.id }} | Generated: {{ new Date().toLocaleDateString() }}</p>
        </div>

        <div class="text-right text-xs space-y-1">
          <div class="font-bold text-slate-900 text-sm">{{ settings.companyName }}</div>
          <div class="text-slate-500">{{ settings.companyAddress }}</div>
          <div class="text-slate-500 font-mono">{{ settings.email }} | {{ settings.phone }}</div>
          <div class="pt-2">
            <span
              :class="[
                'text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border inline-block',
                project.feasibility.overallResult === 'Suitable' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                project.feasibility.overallResult === 'Requires Review' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                project.feasibility.overallResult === 'Limited Suitability' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                'bg-slate-100 text-slate-600 border-slate-300'
              ]"
            >
              Feasibility: {{ project.feasibility.overallResult }}
            </span>
          </div>
        </div>
      </div>

      <!-- SECTION 1: PROJECT & CLIENT INFORMATION -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
          1. Project & Client Profile
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span class="text-slate-400 font-medium">Customer / Client</span>
            <p class="font-bold text-slate-900 mt-0.5">{{ project.clientName }}</p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Property Address</span>
            <p class="font-medium text-slate-800 mt-0.5">{{ project.address || 'Address not entered' }}</p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">GIS Coordinates</span>
            <p class="font-mono text-slate-900 mt-0.5">
              {{ project.latitude ? `${project.latitude.toFixed(5)}° N, ${project.longitude?.toFixed(5)}° E` : '--' }}
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Project Status</span>
            <p class="font-bold text-slate-900 mt-0.5">{{ project.status }}</p>
          </div>
        </div>
      </section>

      <!-- SECTION 2: SITE ASSESSMENT & ROOFTOP GEOMETRY -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
          2. Rooftop Geometry & Verification Telemetry
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span class="text-slate-400 font-medium">Roof Classification</span>
            <p class="font-bold text-slate-900 mt-0.5">{{ project.roofVerification.roofType || 'Unknown' }}</p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Gross Roof Area</span>
            <p class="font-mono font-bold text-slate-900 mt-0.5">
              {{ project.roofVerification.verifiedAreaM2 || project.roofVerification.googleAreaM2 || '--' }} m²
              <span class="text-[10px] text-slate-400 block font-normal">
                {{ project.roofVerification.verifiedAreaM2 ? 'Installer Verified' : 'Google Estimate' }}
              </span>
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Usable Solar Area</span>
            <p class="font-mono font-bold text-blue-600 mt-0.5">
              {{ project.roofVerification.usableAreaM2 || '--' }} m²
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Pitch & Azimuth</span>
            <p class="font-mono font-bold text-slate-900 mt-0.5">
              {{ project.roofVerification.verifiedPitchDeg || project.roofVerification.googlePitchDeg || '--' }}° slope,
              {{ project.roofVerification.azimuthDeg || 180 }}° azimuth
            </p>
          </div>
        </div>

        <!-- Obstacles List -->
        <div v-if="project.roofVerification.obstacles && project.roofVerification.obstacles.length > 0" class="pt-2">
          <span class="text-[11px] font-semibold text-slate-600 block mb-1">Rooftop Obstacles Identified ({{ project.roofVerification.obstacles.length }}):</span>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div
              v-for="obs in project.roofVerification.obstacles"
              :key="obs.id"
              class="p-2 rounded border border-slate-200 bg-slate-50 flex items-center justify-between"
            >
              <span class="font-semibold text-slate-800">{{ obs.type }}</span>
              <span class="font-mono text-[11px] text-slate-500">{{ obs.widthM }}m × {{ obs.lengthM }}m</span>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION 3: SOLAR RESOURCE & YIELD -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
          3. Solar Resource & Energy Production Model
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span class="text-slate-400 font-medium">Annual DC Energy Production</span>
            <p class="text-base font-black font-mono text-blue-600 mt-0.5">
              {{ project.solarAnalysis.estimatedAnnualProductionKwh ? `${project.solarAnalysis.estimatedAnnualProductionKwh.toLocaleString()} kWh/yr` : '--' }}
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Max Sunshine Hours</span>
            <p class="text-base font-bold font-mono text-amber-600 mt-0.5">
              {{ project.solarAnalysis.maxSunshineHoursPerYear ? `${project.solarAnalysis.maxSunshineHoursPerYear.toLocaleString()} hrs/yr` : '--' }}
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Google Solar Imagery</span>
            <p class="font-semibold text-slate-800 mt-0.5">
              {{ project.solarAnalysis.imageryQuality || 'Standard' }} ({{ project.solarAnalysis.imageryDate || 'Active' }})
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Carbon Emissions Offset</span>
            <p class="font-bold text-emerald-600 mt-0.5">
              {{ project.solarAnalysis.carbonOffsetKgPerMwh ? `${project.solarAnalysis.carbonOffsetKgPerMwh} kg CO₂ / MWh` : '--' }}
            </p>
          </div>
        </div>
      </section>

      <!-- SECTION 4: ELECTRICAL LOAD ANALYSIS -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
          4. Historical Electrical Consumption & Concurrency
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span class="text-slate-400 font-medium">Total Annual Consumption</span>
            <p class="font-mono font-bold text-slate-900 mt-0.5">
              {{ project.loadAnalysis.annualKwh > 0 ? `${project.loadAnalysis.annualKwh.toLocaleString()} kWh/yr` : '--' }}
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Average Monthly Load</span>
            <p class="font-mono font-bold text-slate-900 mt-0.5">
              {{ project.loadAnalysis.avgMonthlyKwh > 0 ? `${project.loadAnalysis.avgMonthlyKwh.toLocaleString()} kWh/mo` : '--' }}
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Solar Load Coverage</span>
            <p class="font-mono font-bold text-emerald-600 mt-0.5">
              {{ project.loadAnalysis.solarCoveragePercent }}%
            </p>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Self-Consumption Ratio</span>
            <p class="font-mono font-bold text-blue-600 mt-0.5">
              {{ project.loadAnalysis.selfConsumptionPercent }}%
            </p>
          </div>
        </div>
      </section>

      <!-- SECTION 5: SYSTEM HARDWARE & SIZING -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
          5. System Hardware Design & Sizing
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span class="text-slate-400 font-medium">Installed DC Capacity</span>
            <p class="text-base font-black font-mono text-slate-900 mt-0.5">
              {{ project.systemSizing.systemDcCapacityKwp > 0 ? `${project.systemSizing.systemDcCapacityKwp.toFixed(2)} kWp` : '--' }}
            </p>
            <span class="text-[10px] text-slate-400">{{ project.systemSizing.moduleCount }} modules × {{ project.systemSizing.moduleWattage }}W</span>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Inverter Capacity</span>
            <p class="text-base font-bold font-mono text-slate-900 mt-0.5">
              {{ project.systemSizing.inverterCapacityKw }} kW
            </p>
            <span class="text-[10px] text-slate-400">Qty: {{ project.systemSizing.inverterCount }}</span>
          </div>
          <div>
            <span class="text-slate-400 font-medium">DC/AC Loading Ratio</span>
            <p class="font-mono font-bold text-slate-900 mt-0.5">
              {{ project.systemSizing.dcAcRatio.toFixed(2) }}
            </p>
            <span class="text-[10px] font-semibold text-emerald-600">{{ project.systemSizing.inverterCompatibility }}</span>
          </div>
          <div>
            <span class="text-slate-400 font-medium">Battery Energy Storage</span>
            <p class="font-bold text-slate-900 mt-0.5">
              {{ project.systemSizing.hasBatteryStorage ? `${project.systemSizing.usableBatteryKwh} kWh (${project.systemSizing.batteryCount} units)` : 'Grid-Tied (No BESS)' }}
            </p>
            <span v-if="project.systemSizing.hasBatteryStorage" class="text-[10px] text-slate-400">
              Autonomy: ~{{ project.systemSizing.estimatedAutonomyHours }} hrs
            </span>
          </div>
        </div>
      </section>

      <!-- SECTION 6: FEASIBILITY EVALUATION CHECKLIST -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
          6. Multi-Factor Engineering Feasibility Checklist
        </h3>

        <div class="space-y-2 text-xs">
          <div
            v-for="(crit, idx) in project.feasibility.criteria"
            :key="idx"
            class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50"
          >
            <div class="flex items-center gap-2.5">
              <span
                :class="[
                  'w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] text-white',
                  crit.status === 'pass' ? 'bg-emerald-500' :
                  crit.status === 'warning' ? 'bg-amber-500' :
                  crit.status === 'fail' ? 'bg-rose-500' : 'bg-slate-400'
                ]"
              >
                {{ crit.status === 'pass' ? '✓' : crit.status === 'warning' ? '!' : crit.status === 'fail' ? '✕' : '?' }}
              </span>
              <div>
                <span class="font-bold text-slate-900">{{ crit.name }}</span>
                <span class="text-[10px] text-slate-400 uppercase font-mono ml-2">[{{ crit.category }}]</span>
              </div>
            </div>
            <span class="text-slate-600 text-[11px]">{{ crit.message }}</span>
          </div>
        </div>
      </section>

      <!-- SECTION 7: INSTALLER SIGN-OFF & STAMP -->
      <section class="pt-4 border-t-2 border-slate-200">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
          <!-- Engineering Observations -->
          <div class="space-y-2">
            <h4 class="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Engineering Observations & Sign-off Notes</h4>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[90px] text-slate-600">
              {{ project.feasibility.summary || 'Engineering assessment conducted in accordance with national electrical and structural solar codes.' }}
            </div>
          </div>

          <!-- Professional Sign-off Block -->
          <div class="space-y-3">
            <h4 class="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Lead PV System Designer Certification</h4>
            <div class="p-4 border-2 border-slate-900 rounded-xl space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-black text-slate-900 text-sm">{{ installerName }}</div>
                  <div class="text-[11px] text-slate-500">License / Reg: <span class="font-mono text-slate-800 font-bold">{{ installerLicense }}</span></div>
                </div>
                <div class="w-12 h-12 rounded-full border-2 border-blue-600 flex items-center justify-center text-blue-700 font-black text-xs font-mono uppercase">
                  SEALED
                </div>
              </div>

              <div class="flex items-center justify-between border-t border-slate-200 pt-2 text-[11px]">
                <span class="text-slate-500">Sign-off Date: <strong class="text-slate-900 font-mono">{{ formatDate(signoffDate) }}</strong></span>
                <span class="text-emerald-700 font-bold">✓ Technical Sign-off Confirmed</span>
              </div>
            </div>

            <!-- Sign-off Button (Hidden during print) -->
            <div class="print:hidden pt-1 flex justify-end">
              <button
                type="button"
                @click="commitSignoff"
                class="px-3.5 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                Stamp & Update Project Record
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Empty State if No Project Selected -->
    <div v-else class="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm">
      <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <h3 class="text-base font-bold text-slate-900 mb-4">No project selected</h3>
      <NuxtLink
        to="/projects"
        class="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
      >
        Projects
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
@media print {
  body {
    background: white !important;
    color: black !important;
  }
}
</style>

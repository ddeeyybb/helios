<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInstallerData } from '~/composables/useInstallerData'
import { useInstallerAuth } from '~/composables/useInstallerAuth'
import type { Project } from '~/types/installer'

useHead({
  title: 'Dashboard | HELIOS-LOAD'
})

const router = useRouter()
const { installer } = useInstallerAuth()
const { projects, clients, dashboardStats, setActiveProject } = useInstallerData()

function openProject(project: Project) {
  setActiveProject(project.id)
  // Route to the current workflow step
  const step = project.currentStep
  if (step === 1) router.push('/site-assessment')
  else if (step === 2 || step === 3) router.push('/rooftop')
  else if (step === 4) router.push('/solar-analysis')
  else if (step === 5) router.push('/load-analysis')
  else if (step === 6) router.push('/equipment')
  else if (step >= 7) router.push('/reports')
  else router.push('/site-assessment')
}

function formatDate(isoStr: string) {
  if (!isoStr) return '--'
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoStr
  }
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Report Ready':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'Feasibility Review':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'Roof Verification':
    case 'Solar Analysis':
    case 'Load Analysis':
      return 'bg-purple-50 text-purple-700 border-purple-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Top Installer Header & Summary -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight">
          Welcome, {{ installer?.fullName || 'Installer' }}
        </h1>
        <p class="text-sm text-slate-500 mt-1">Your installer workspace is ready.</p>
      </div>

      <!-- Quick Actions -->
      <div class="flex items-center flex-wrap gap-2">
        <NuxtLink
          to="/clients"
          class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
        >
          <svg class="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" x2="19" y1="8" y2="14" />
            <line x1="22" x2="16" y1="11" y2="11" />
          </svg>
          New Client
        </NuxtLink>

        <NuxtLink
          to="/projects"
          class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-colors"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" x2="12" y1="5" y2="19" />
            <line x1="5" x2="19" y1="12" y2="12" />
          </svg>
          New Project
        </NuxtLink>

        <NuxtLink
          to="/site-assessment"
          class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
        >
          <svg class="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Site Assessment
        </NuxtLink>

        <NuxtLink
          to="/projects"
          class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
        >
          <svg class="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          Open Projects
        </NuxtLink>
      </div>
    </div>

    <!-- Summary KPI Cards Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <!-- Active Projects -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Active Projects</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.activeProjects }}</span>
          <span class="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">Pipeline</span>
        </div>
      </div>

      <!-- Pending Site Assessments -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Pending Surveys</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.pendingAssessments }}</span>
          <span class="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">Site</span>
        </div>
      </div>

      <!-- Roofs Awaiting Verification -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Roof Verification</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.roofsAwaitingVerification }}</span>
          <span class="text-[10px] text-purple-600 font-semibold bg-purple-50 px-1.5 py-0.5 rounded">Pending</span>
        </div>
      </div>

      <!-- Solar Analysis Completed -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Solar Analysis</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.solarCompleted }}</span>
          <span class="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">Google Solar</span>
        </div>
      </div>

      <!-- Load Analysis Completed -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Load Analyzed</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.loadCompleted }}</span>
          <span class="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">Demand</span>
        </div>
      </div>

      <!-- Projects Requiring Review -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Requires Review</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.requiringReview }}</span>
          <span class="text-[10px] text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">Review</span>
        </div>
      </div>

      <!-- Completed Reports -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-slate-500">Reports Ready</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold font-mono text-slate-900">{{ dashboardStats.reportsReady }}</span>
          <span class="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">Complete</span>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Recent Projects (2 Cols) -->
      <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-slate-900">Recent Projects</h2>
            <p class="text-xs text-slate-500">Active engineering installations and ongoing surveys</p>
          </div>
          <NuxtLink to="/projects" class="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View All
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </NuxtLink>
        </div>

        <!-- Table or Empty State -->
        <div v-if="projects.length > 0" class="overflow-x-auto flex-1">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th class="px-5 py-3">Project Name</th>
                <th class="px-4 py-3">Client</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">DC Capacity</th>
                <th class="px-4 py-3">Last Updated</th>
                <th class="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="proj in projects.slice(0, 6)" :key="proj.id" class="hover:bg-slate-50/80 transition-colors">
                <td class="px-5 py-3.5">
                  <div class="font-semibold text-slate-900 truncate max-w-[200px]">{{ proj.name }}</div>
                  <div class="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">{{ proj.address || 'No address specified' }}</div>
                </td>
                <td class="px-4 py-3.5 text-slate-700 font-medium truncate max-w-[140px]">
                  {{ proj.clientName }}
                </td>
                <td class="px-4 py-3.5">
                  <span :class="['px-2 py-0.5 rounded-full text-[11px] font-semibold border', getStatusBadgeClass(proj.status)]">
                    {{ proj.status }}
                  </span>
                </td>
                <td class="px-4 py-3.5 font-mono text-slate-800 font-medium">
                  {{ proj.systemSizing.systemDcCapacityKwp > 0 ? `${proj.systemSizing.systemDcCapacityKwp.toFixed(1)} kWp` : '--' }}
                </td>
                <td class="px-4 py-3.5 text-slate-500">
                  {{ formatDate(proj.updatedAt) }}
                </td>
                <td class="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    @click="openProject(proj)"
                    class="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    Open
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Clean Empty State (Zero Data Rule - Requirement 13 & 14) -->
        <div v-else class="p-12 text-center flex-1 flex flex-col items-center justify-center">
          <div class="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h3 class="text-base font-bold text-slate-900">No Sites Yet</h3>
          <p class="text-xs text-slate-500 max-w-sm mt-1 mb-4">
            Create or select a site to begin a rooftop assessment.
          </p>
          <div class="flex items-center gap-2">
            <NuxtLink
              to="/site-assessment"
              class="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-colors"
            >
              Begin Site Assessment
            </NuxtLink>
            <NuxtLink
              to="/projects"
              class="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              + Create Project
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Right Column: Workflow Quick Navigation & GIS Telemetry -->
      <div class="space-y-6">
        <!-- 10-Stage Installer Workflow Overview -->
        <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-slate-900">Main Installer Workflow</h2>
            <span class="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Sequential</span>
          </div>

          <div class="space-y-2 text-xs">
            <NuxtLink
              to="/site-assessment"
              class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">1</span>
                <div>
                  <div class="font-semibold text-slate-800 group-hover:text-blue-600">Site Assessment GIS</div>
                  <div class="text-[11px] text-slate-400">Google Maps, Places & Geocoding</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-slate-400 group-hover:text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NuxtLink>

            <NuxtLink
              to="/rooftop"
              class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px]">2</span>
                <div>
                  <div class="font-semibold text-slate-800 group-hover:text-purple-600">3D Rooftop & Verification</div>
                  <div class="text-[11px] text-slate-400">3D roof planes & obstructions</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-slate-400 group-hover:text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NuxtLink>

            <NuxtLink
              to="/solar-analysis"
              class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-[10px]">3</span>
                <div>
                  <div class="font-semibold text-slate-800 group-hover:text-amber-600">Solar Potential Analysis</div>
                  <div class="text-[11px] text-slate-400">Google Solar Building Insights & ECharts</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-slate-400 group-hover:text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NuxtLink>

            <NuxtLink
              to="/load-analysis"
              class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">4</span>
                <div>
                  <div class="font-semibold text-slate-800 group-hover:text-indigo-600">Intelligent Load Analysis</div>
                  <div class="text-[11px] text-slate-400">Demand profile & solar coverage</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-slate-400 group-hover:text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NuxtLink>

            <NuxtLink
              to="/equipment"
              class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">5</span>
                <div>
                  <div class="font-semibold text-slate-800 group-hover:text-slate-900">Equipment & System Sizing</div>
                  <div class="text-[11px] text-slate-400">DC/AC ratio & battery autonomy</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-slate-400 group-hover:text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NuxtLink>

            <NuxtLink
              to="/reports"
              class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[10px]">6</span>
                <div>
                  <div class="font-semibold text-slate-800 group-hover:text-emerald-600">Feasibility & Engineering Report</div>
                  <div class="text-[11px] text-slate-400">Multi-criteria verification & print pack</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-slate-400 group-hover:text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

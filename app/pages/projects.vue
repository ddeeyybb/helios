<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useInstallerData } from '~/composables/useInstallerData'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import type { Project, ProjectStatus } from '~/types/installer'

useHead({
  title: 'Project Pipeline | HELIOS-LOAD Installer Platform'
})

const router = useRouter()
const route = useRoute()
const { projects, clients, activeProjectId, setActiveProject, addProject, updateProject, deleteProject } = useInstallerData()
const { selectCoordinates } = useSiteAssessment()

const searchQuery = ref('')
const selectedStatus = ref<string>('All')

// Modal State
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingProjectId = ref<string | null>(null)

// Form fields
const formName = ref('')
const formClientId = ref('')
const formAddress = ref('')
const formLat = ref<number | null>(null)
const formLng = ref<number | null>(null)
const formStatus = ref<ProjectStatus>('Draft')
const formError = ref('')

const STATUS_LIST: ProjectStatus[] = [
  'Draft',
  'Site Assessment',
  'Roof Verification',
  'Solar Analysis',
  'Load Analysis',
  'System Design',
  'Feasibility Review',
  'Report Ready',
  'Completed'
]

onMounted(() => {
  // If query params specify new project for a client:
  if (route.query.new === '1' && route.query.clientId) {
    openCreateModal(String(route.query.clientId))
  }
})

const filteredProjects = computed(() => {
  return projects.value.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.address.toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchesStatus = selectedStatus.value === 'All' || p.status === selectedStatus.value

    return matchesSearch && matchesStatus
  })
})

function openCreateModal(preselectedClientId?: string) {
  modalMode.value = 'create'
  editingProjectId.value = null
  formName.value = ''
  formClientId.value = preselectedClientId || (clients.value[0]?.id ?? '')
  formAddress.value = ''
  formLat.value = null
  formLng.value = null
  formStatus.value = 'Draft'
  formError.value = ''
  isModalOpen.value = true
}

function openEditModal(project: Project) {
  modalMode.value = 'edit'
  editingProjectId.value = project.id
  formName.value = project.name
  formClientId.value = project.clientId
  formAddress.value = project.address
  formLat.value = project.latitude
  formLng.value = project.longitude
  formStatus.value = project.status
  formError.value = ''
  isModalOpen.value = true
}

function submitForm() {
  if (!formName.value.trim()) {
    formError.value = 'Project Name is required.'
    return
  }
  if (!formClientId.value) {
    formError.value = 'Please select a Client for this project.'
    return
  }

  if (modalMode.value === 'create') {
    const newProj = addProject({
      name: formName.value.trim(),
      clientId: formClientId.value,
      address: formAddress.value.trim(),
      latitude: formLat.value ?? undefined,
      longitude: formLng.value ?? undefined
    })
    isModalOpen.value = false
    openProject(newProj)
  } else if (editingProjectId.value) {
    const client = clients.value.find(c => c.id === formClientId.value)
    updateProject(editingProjectId.value, {
      name: formName.value.trim(),
      clientId: formClientId.value,
      clientName: client ? client.name : 'Unknown Client',
      address: formAddress.value.trim(),
      latitude: formLat.value,
      longitude: formLng.value,
      status: formStatus.value
    })
    isModalOpen.value = false
  }
}

function confirmDeleteProject(project: Project) {
  if (confirm(`Are you sure you want to delete project "${project.name}"? All analysis data will be removed.`)) {
    deleteProject(project.id)
  }
}

function openProject(project: Project) {
  setActiveProject(project.id)

  // Sync coordinates to site assessment if present
  if (project.latitude && project.longitude) {
    selectCoordinates(
      project.latitude,
      project.longitude,
      project.name,
      project.address,
      'Installer Input'
    )
  }

  // Navigate to current workflow step
  const step = project.currentStep
  if (step === 1) router.push('/site-assessment')
  else if (step === 2 || step === 3) router.push('/rooftop')
  else if (step === 4) router.push('/solar-analysis')
  else if (step === 5) router.push('/load-analysis')
  else if (step === 6) router.push('/equipment')
  else if (step >= 7) router.push('/reports')
  else router.push('/site-assessment')
}

function getWorkflowStepLabel(step: number): string {
  switch (step) {
    case 1: return '1. Site Assessment GIS'
    case 2: return '2. Roof Verification'
    case 3: return '3. 3D Rooftop'
    case 4: return '4. Solar Analysis'
    case 5: return '5. Load Analysis'
    case 6: return '6. Equipment Sizing'
    case 7: return '7. Feasibility Review'
    case 8: return '8. Project Report'
    default: return `${step}. In Progress`
  }
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'Completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Report Ready': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'Feasibility Review': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'System Design': return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    case 'Solar Analysis':
    case 'Roof Verification':
    case 'Load Analysis': return 'bg-purple-50 text-purple-700 border-purple-200'
    default: return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function formatDate(isoStr: string) {
  if (!isoStr) return '--'
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoStr
  }
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Projects Pipeline</h1>
        <p class="text-sm text-slate-500 mt-1">Manage active solar installations across GIS assessment, rooftop 3D, and load design.</p>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="openCreateModal()"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-colors"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </button>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
      <!-- Search Input -->
      <div class="relative flex-1">
        <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search projects by title, client name, or address..."
          class="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <!-- Status Filter -->
      <div class="flex items-center gap-2 shrink-0">
        <label class="text-xs text-slate-500 font-medium whitespace-nowrap">Status:</label>
        <select
          v-model="selectedStatus"
          class="text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Statuses ({{ projects.length }})</option>
          <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>

    <!-- Projects Table / Grid -->
    <div v-if="filteredProjects.length > 0" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
            <tr>
              <th class="px-5 py-3">Project & Location</th>
              <th class="px-4 py-3">Client</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Workflow Stage</th>
              <th class="px-4 py-3">Capacity</th>
              <th class="px-4 py-3">Feasibility</th>
              <th class="px-4 py-3">Updated</th>
              <th class="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="proj in filteredProjects"
              :key="proj.id"
              :class="[
                'hover:bg-slate-50/80 transition-colors',
                activeProjectId === proj.id ? 'bg-blue-50/30' : ''
              ]"
            >
              <td class="px-5 py-4">
                <div class="flex items-center gap-2">
                  <span v-if="activeProjectId === proj.id" class="w-2 h-2 rounded-full bg-blue-600" title="Active Project"></span>
                  <div class="font-bold text-slate-900 text-sm truncate max-w-[220px]">{{ proj.name }}</div>
                </div>
                <div class="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[240px]">
                  {{ proj.address || (proj.latitude ? `${proj.latitude.toFixed(4)}°, ${proj.longitude?.toFixed(4)}°` : 'No coordinates') }}
                </div>
              </td>
              <td class="px-4 py-4 text-slate-700 font-medium">
                {{ proj.clientName }}
              </td>
              <td class="px-4 py-4">
                <span :class="['px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap', getStatusBadgeClass(proj.status)]">
                  {{ proj.status }}
                </span>
              </td>
              <td class="px-4 py-4">
                <span class="text-slate-700 font-medium text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 whitespace-nowrap">
                  {{ getWorkflowStepLabel(proj.currentStep) }}
                </span>
              </td>
              <td class="px-4 py-4 font-mono text-slate-900 font-semibold whitespace-nowrap">
                {{ proj.systemSizing.systemDcCapacityKwp > 0 ? `${proj.systemSizing.systemDcCapacityKwp.toFixed(1)} kWp` : '--' }}
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <span
                  :class="[
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded',
                    proj.feasibility.overallResult === 'Suitable' ? 'bg-emerald-50 text-emerald-700' :
                    proj.feasibility.overallResult === 'Requires Review' ? 'bg-amber-50 text-amber-700' :
                    proj.feasibility.overallResult === 'Limited Suitability' ? 'bg-rose-50 text-rose-700' :
                    'bg-slate-100 text-slate-500'
                  ]"
                >
                  {{ proj.feasibility.overallResult }}
                </span>
              </td>
              <td class="px-4 py-4 text-slate-500 whitespace-nowrap">
                {{ formatDate(proj.updatedAt) }}
              </td>
              <td class="px-5 py-4 text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    @click="openProject(proj)"
                    class="px-2.5 py-1 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  >
                    Open Workflow
                  </button>
                  <button
                    type="button"
                    @click="openEditModal(proj)"
                    class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title="Edit Details"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    @click="confirmDeleteProject(proj)"
                    class="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="Delete Project"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State (Zero projects) -->
    <div v-else-if="projects.length === 0" class="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm">
      <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      </div>
      <h3 class="text-base font-bold text-slate-900">No projects in pipeline</h3>
      <p class="text-xs text-slate-500 mt-1 mb-5">
        Create your first project to initiate the 10-stage engineering workflow: Site Assessment, Google Solar Analysis, 3D Rooftop, and Load Sizing.
      </p>
      <button
        type="button"
        @click="openCreateModal()"
        class="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        + Create Project
      </button>
    </div>

    <!-- Empty Search Results -->
    <div v-else class="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
      No projects match your search or filter.
    </div>

    <!-- Create / Edit Project Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      @click.self="isModalOpen = false"
    >
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-900">
            {{ modalMode === 'create' ? 'Create New Solar Project' : 'Edit Project Details' }}
          </h3>
          <button
            type="button"
            @click="isModalOpen = false"
            class="text-slate-400 hover:text-slate-600"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="submitForm" class="p-6 space-y-4 text-xs">
          <div v-if="formError" class="p-2.5 rounded bg-red-50 border border-red-200 text-red-700">
            {{ formError }}
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Project Name *</label>
            <input
              v-model="formName"
              type="text"
              required
              placeholder="e.g. Apex Industrial 100kWp Roof Project"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Client Account *</label>
            <div v-if="clients.length > 0">
              <select
                v-model="formClientId"
                required
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option v-for="c in clients" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.clientType }})
                </option>
              </select>
            </div>
            <div v-else class="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between">
              <span>No clients created yet. Please create a client first.</span>
              <NuxtLink to="/clients" class="font-bold underline text-amber-900 ml-2">Add Client</NuxtLink>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Property Site Address</label>
            <input
              v-model="formAddress"
              type="text"
              placeholder="e.g. 102 Metro Tech Road, Subic Bay"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Latitude (optional)</label>
              <input
                v-model.number="formLat"
                type="number"
                step="any"
                placeholder="14.5995"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Longitude (optional)</label>
              <input
                v-model.number="formLng"
                type="number"
                step="any"
                placeholder="120.9842"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          <div v-if="modalMode === 'edit'">
            <label class="block font-semibold text-slate-700 mb-1">Project Status</label>
            <select
              v-model="formStatus"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <div class="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              @click="isModalOpen = false"
              class="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="clients.length === 0"
              class="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {{ modalMode === 'create' ? 'Create & Start Assessment' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

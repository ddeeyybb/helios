<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useInstallerData } from '~/composables/useInstallerData'
import { useSiteAssessment } from '~/composables/useSiteAssessment'

const route = useRoute()
const { activeProject, projects, setActiveProject } = useInstallerData()
const { selectedProperty } = useSiteAssessment()

const pageTitle = computed(() => {
  const path = route.path
  if (path === '/' || path === '/dashboard') return 'Dashboard'
  if (path.startsWith('/clients')) return 'Client Management'
  if (path.startsWith('/projects')) return 'Projects Pipeline'
  if (path.startsWith('/site-assessment')) return 'Site Assessment GIS'
  if (path.startsWith('/rooftop')) return '3D Rooftop Reconstruction'
  if (path.startsWith('/solar-analysis')) return 'Solar Potential Analysis'
  if (path.startsWith('/load-analysis')) return 'Intelligent Load Analysis'
  if (path.startsWith('/equipment')) return 'Equipment Catalog & Sizing'
  if (path.startsWith('/reports')) return 'Engineering Project Report'
  if (path.startsWith('/settings')) return 'Installer Settings'
  return 'Installer Workspace'
})
</script>

<template>
  <header v-if="!route.path.startsWith('/site-assessment')" class="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20 shrink-0">
    <!-- Breadcrumbs / Active View -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 text-sm">
        <span class="text-slate-400 font-medium">HELIOS-LOAD</span>
        <span class="text-slate-300">/</span>
        <span class="font-semibold text-slate-900">{{ pageTitle }}</span>
      </div>
    </div>

    <!-- Right System Metrics & Context -->
    <div class="flex items-center gap-4">
      <!-- Active Project Selector / Summary -->
      <div v-if="activeProject" class="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs">
        <svg class="w-3.5 h-3.5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
        <span class="text-slate-500 font-medium">Project:</span>
        <NuxtLink to="/projects" class="font-semibold text-blue-900 max-w-[160px] truncate hover:underline" :title="activeProject.name">
          {{ activeProject.name }}
        </NuxtLink>
        <span class="text-blue-300">|</span>
        <span class="text-[11px] font-mono text-slate-600 max-w-[120px] truncate">{{ activeProject.clientName }}</span>
      </div>

      <NuxtLink
        v-else-if="projects.length > 0"
        to="/projects"
        class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200"
      >
        <span>Select Active Project ({{ projects.length }})</span>
      </NuxtLink>

      <!-- Active site summary if selected -->
      <div v-if="selectedProperty" class="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
        <div class="flex items-center gap-1.5 text-slate-600 font-medium">
          <svg class="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span class="truncate max-w-[160px] text-slate-800 font-semibold">{{ selectedProperty.name }}</span>
        </div>
        <span class="text-slate-300">|</span>
        <span class="font-mono text-slate-500 text-[11px]">{{ selectedProperty.latitude.toFixed(4) }}°, {{ selectedProperty.longitude.toFixed(4) }}°</span>
      </div>

    </div>
  </header>
</template>


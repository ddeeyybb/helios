<script setup lang="ts">
defineProps<{
  title: string
  subtitle: string
  badge: string
  workflowStage?: string
  description: string
  plannedFeatures: string[]
}>()
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between pb-6 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">{{ title }}</h1>
          <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {{ badge }}
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">{{ subtitle }}</p>
      </div>

      <NuxtLink
        to="/site-assessment"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Return to Site Assessment
      </NuxtLink>
    </div>

    <!-- Installer Context Notice -->
    <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
      <div class="flex items-start gap-4">
        <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M7 7h10" />
            <path d="M7 12h10" />
            <path d="M7 17h10" />
          </svg>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-base text-slate-900">Installer Module Status</h3>
            <span v-if="workflowStage" class="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {{ workflowStage }}
            </span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed max-w-2xl">
            {{ description }}
          </p>
        </div>
      </div>

      <!-- Feature Roadmap -->
      <div class="pt-4 border-t border-slate-100">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Planned Engineering Capabilities</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="(feature, idx) in plannedFeatures"
            :key="idx"
            class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700"
          >
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0">
              {{ idx + 1 }}
            </span>
            <span>{{ feature }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

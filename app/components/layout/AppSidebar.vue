<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useInstallerAuth } from '~/composables/useInstallerAuth'
import InstallerProfileCard from '~/components/auth/InstallerProfileCard.vue'

const route = useRoute()
const { logout, isAuthenticated } = useInstallerAuth()

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', badge: '' },
  { name: 'Clients', path: '/clients', icon: 'users', badge: '' },
  { name: 'Projects', path: '/projects', icon: 'folder', badge: '' },
  { name: 'Site Assessment', path: '/site-assessment', icon: 'map-pin', badge: '' },
  { name: '3D Rooftop', path: '/rooftop', icon: 'box', badge: '' },
  { name: 'Solar Analysis', path: '/solar-analysis', icon: 'sun', badge: '' },
  { name: 'Load Analysis', path: '/load-analysis', icon: 'zap', badge: '' },
  { name: 'Equipment', path: '/equipment', icon: 'cpu', badge: '' },
  { name: 'Reports', path: '/reports', icon: 'file-text', badge: '' },
  { name: 'Settings', path: '/settings', icon: 'settings', badge: '' }
]

const emit = defineEmits<{
  (e: 'open-help'): void
}>()

function isCurrent(path: string) {
  if (path === '/site-assessment' && (route.path === '/' || route.path === '/site-assessment')) {
    return true
  }
  return route.path === path
}
</script>

<template>
  <aside class="w-72 bg-white border-r border-slate-200 flex flex-col h-screen select-none shrink-0 sticky top-0 z-30">
    <!-- Brand Header -->
    <div class="p-5 border-b border-slate-100 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <span class="font-bold text-lg tracking-tight text-slate-900">HELIOS-LOAD</span>
        </div>
      </div>
    </div>

    <!-- Installer Role Badge -->
    <div class="px-5 pt-3 pb-2">
      <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-200/80 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-slate-700 font-semibold">Installer Portal</span>
        </div>
      </div>
    </div>

    <!-- Navigation List -->
    <nav class="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin">
      <div class="px-3 pb-1 pt-1">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Main Workflow</span>
      </div>

      <NuxtLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors group',
          isCurrent(item.path)
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
        ]"
      >
        <div class="flex items-center gap-3">
          <!-- Icon variants -->
          <svg v-if="item.icon === 'dashboard'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
          <svg v-else-if="item.icon === 'users'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <svg v-else-if="item.icon === 'folder'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          <svg v-else-if="item.icon === 'map-pin'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <svg v-else-if="item.icon === 'box'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
          <svg v-else-if="item.icon === 'sun'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <svg v-else-if="item.icon === 'zap'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <svg v-else-if="item.icon === 'cpu'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="16" height="16" x="4" y="4" rx="2" />
            <rect width="6" height="6" x="9" y="9" rx="1" />
            <path d="M15 2v2" />
            <path d="M15 20v2" />
            <path d="M2 15h2" />
            <path d="M2 9h2" />
            <path d="M20 15h2" />
            <path d="M20 9h2" />
            <path d="M9 2v2" />
            <path d="M9 20v2" />
          </svg>
          <svg v-else-if="item.icon === 'file-text'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M10 9H8" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
          </svg>
          <svg v-else class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>

          <span>{{ item.name }}</span>
        </div>

        <span
          v-if="item.badge"
          :class="[
            'text-[10px] font-semibold px-2 py-0.5 rounded-full',
            isCurrent(item.path)
              ? 'bg-blue-500 text-white'
              : 'bg-slate-200 text-slate-700'
          ]"
        >
          {{ item.badge }}
        </span>
      </NuxtLink>
    </nav>

    <!-- Bottom Installer Profile & Actions -->
    <div class="p-3 border-t border-slate-200 bg-slate-50/50 space-y-2">
      <!-- Help & Logout actions -->
      <div class="grid grid-cols-2 gap-2 text-xs">
        <NuxtLink
          to="/help"
          @click="emit('open-help')"
          class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors"
        >
          <svg class="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
          Help Guide
        </NuxtLink>

        <button
          type="button"
          @click="logout"
          class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-700 font-medium transition-colors cursor-pointer"
          title="Logout"
        >
          <svg class="w-3.5 h-3.5 text-slate-500 group-hover:text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
          Logout
        </button>
      </div>

      <!-- Dynamic Installer Profile Card (Based on Reference Design) -->
      <InstallerProfileCard v-if="isAuthenticated" />

      <!-- Signed Out Fallback -->
      <NuxtLink
        v-else
        to="/login"
        class="flex items-center justify-center gap-2 p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
      >
        <span>Sign In</span>
      </NuxtLink>
    </div>
  </aside>
</template>

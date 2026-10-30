<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useInstallerAuth } from '~/composables/useInstallerAuth'

const router = useRouter()
const { installer, isAuthenticated, logout } = useInstallerAuth()

const isDropdownOpen = ref(false)
const isProfileModalOpen = ref(false)
const dropdownRef = ref<HTMLDivElement | null>(null)

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}

function closeDropdown() {
  isDropdownOpen.value = false
}

function handleOpenProfile() {
  closeDropdown()
  isProfileModalOpen.value = true
}

function handleOpenSettings() {
  closeDropdown()
  router.push('/settings')
}

function handleLogout() {
  closeDropdown()
  logout()
}

// Click outside handler for dropdown
function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div v-if="isAuthenticated && installer" ref="dropdownRef" class="relative select-none">
    <!-- Clean White Profile Card (Based on Reference Design) -->
    <div
      role="button"
      tabindex="0"
      @click.stop="toggleDropdown"
      @keydown.enter="toggleDropdown"
      @keydown.space.prevent="toggleDropdown"
      class="flex items-center gap-3 p-2.5 bg-white hover:bg-slate-50/80 rounded-xl border border-slate-200/90 shadow-sm transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      :class="{ 'ring-2 ring-blue-500/30 border-blue-400': isDropdownOpen }"
      title="Click to view installer profile & options"
    >
      <!-- Circular Avatar with Initials -->
      <div class="relative shrink-0">
        <div class="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-inner ring-2 ring-slate-100 group-hover:ring-blue-100 transition-all">
          {{ installer.initials }}
        </div>
      </div>

      <!-- Installer Information -->
      <div class="flex-1 min-w-0 pr-1 text-left">
        <div class="flex items-center gap-1.5">
          <p class="text-xs font-bold text-slate-900 truncate leading-tight">
            {{ installer.fullName }}
          </p>
        </div>
        <p class="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
          {{ installer.role || 'Installer' }}
        </p>
      </div>

      <!-- Green Online Status Indicator (Reference Design) -->
      <div class="flex items-center gap-1 shrink-0" title="Online">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white"></span>
        </span>
      </div>
    </div>

    <!-- Dropdown Menu (Requirement 12) -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="transform scale-95 opacity-0 -translate-y-2"
      enter-to-class="transform scale-100 opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="transform scale-100 opacity-100 translate-y-0"
      leave-to-class="transform scale-95 opacity-0 -translate-y-2"
    >
      <div
        v-if="isDropdownOpen"
        class="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
          <div class="font-bold text-slate-900 truncate">{{ installer.fullName }}</div>
          <div class="text-[10px] text-slate-500 truncate font-mono">{{ installer.email }}</div>
        </div>

        <button
          type="button"
          @click="handleOpenProfile"
          class="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 font-medium transition-colors cursor-pointer"
        >
          <svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>My Profile</span>
        </button>

        <button
          type="button"
          @click="handleOpenSettings"
          class="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 font-medium transition-colors cursor-pointer"
        >
          <svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>

        <div class="my-1 border-t border-slate-100"></div>

        <button
          type="button"
          @click="handleLogout"
          class="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium transition-colors cursor-pointer"
        >
          <svg class="w-3.5 h-3.5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
          <span>Logout</span>
        </button>
      </div>
    </transition>

    <!-- My Profile Modal Dialog -->
    <div
      v-if="isProfileModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-fadeIn">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-bold text-sm text-slate-900 flex items-center gap-2">
            <span>👤</span>
            <span>Installer Profile</span>
          </h3>
          <button
            type="button"
            @click="isProfileModalOpen = false"
            class="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <div class="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-sm">
            {{ installer.initials }}
          </div>
          <div class="min-w-0">
            <div class="font-bold text-slate-900 text-sm truncate">{{ installer.fullName }}</div>
            <div class="text-xs text-blue-600 font-medium truncate">{{ installer.role || 'Installer' }}</div>
            <div class="text-[11px] text-slate-500 font-mono truncate mt-0.5">{{ installer.email }}</div>
          </div>
        </div>

        <div class="space-y-2 text-xs">
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span class="text-slate-500">Status</span>
            <span class="font-semibold text-emerald-600 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              Online
            </span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span class="text-slate-500">Role</span>
            <span class="font-semibold text-slate-800">{{ installer.role || 'Installer' }}</span>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-slate-500">Email</span>
            <span class="text-slate-700 font-mono text-[11px]">{{ installer.email }}</span>
          </div>
        </div>

        <div class="pt-2 flex items-center gap-2">
          <button
            type="button"
            @click="handleOpenSettings"
            class="flex-1 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            Edit Settings
          </button>
          <button
            type="button"
            @click="isProfileModalOpen = false"
            class="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

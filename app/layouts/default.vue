<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from '~/components/layout/AppSidebar.vue'
import AppHeader from '~/components/layout/AppHeader.vue'
import InstallerHelpModal from '~/components/layout/InstallerHelpModal.vue'

const isHelpModalOpen = ref(false)
</script>

<template>
  <div class="flex h-screen bg-slate-50 text-slate-800 font-sans antialiased overflow-hidden">
    <!-- Left Navigation Sidebar -->
    <AppSidebar @open-help="isHelpModalOpen = true" />

    <!-- Main Workspace Area -->
    <div class="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
      <AppHeader />

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <!-- Help Modal Dialog -->
    <InstallerHelpModal
      :is-open="isHelpModalOpen"
      @close="isHelpModalOpen = false"
    />
  </div>
</template>

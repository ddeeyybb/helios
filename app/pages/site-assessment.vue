<script setup lang="ts">
import SiteAssessmentTopBar from '~/components/site-assessment/SiteAssessmentTopBar.vue'
import SiteAssessmentMap from '~/components/map/SiteAssessmentMap.vue'
import PropertyAssessmentPanel from '~/components/site-assessment/PropertyAssessmentPanel.vue'
import Roof3DPreviewCard from '~/components/site-assessment/Roof3DPreviewCard.vue'
import RoofClassificationModal from '~/components/site-assessment/RoofClassificationModal.vue'

useHead({
  title: 'Site Assessment | HELIOS-LOAD Installer Platform'
})
</script>

<template>
  <div class="flex flex-col min-h-full">
    <!-- Main Workspace Container -->
    <div class="flex-1 px-6 py-4 space-y-4">
      <!-- Header & Top Action Area -->
      <SiteAssessmentTopBar />

      <!-- Map + Telemetry Grid Layout (Desktop First) -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <!-- Main Map Area (8 Cols on XL) -->
        <div class="xl:col-span-8 flex flex-col gap-6">
          <div class="h-[720px] w-full">
            <SiteAssessmentMap />
          </div>

          <!-- 3D Rooftop Reconstruction Preview (Below Map on wide screens) -->
          <Roof3DPreviewCard />
        </div>

        <!-- Telemetry & Workflow Panels (4 Cols on XL) -->
        <div class="xl:col-span-4 flex flex-col gap-6">
          <PropertyAssessmentPanel />
        </div>
      </div>
    </div>

    <!-- Roof Classification Modal (Interactive UI for future taxonomy) -->
    <RoofClassificationModal />
  </div>
</template>

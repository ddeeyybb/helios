<script setup lang="ts">
// HELIOS-LOAD Installer Platform Entry
useHead({
  titleTemplate: (titleChunk) => {
    return titleChunk ? `${titleChunk} | HELIOS-LOAD` : 'HELIOS-LOAD'
  },
  meta: [
    { name: 'description', content: 'A Spatiotemporal Energy Potential Mapper and Intelligent Load Management System for Solar Installers.' }
  ]
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
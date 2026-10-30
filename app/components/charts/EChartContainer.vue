<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  options: echarts.EChartsOption
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value || !import.meta.client) return

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(props.options)

  window.addEventListener('resize', handleResize)
}

function handleResize() {
  if (chartInstance) {
    chartInstance.resize()
  }
}

watch(
  () => props.options,
  (newOpt) => {
    if (chartInstance && newOpt) {
      chartInstance.setOption(newOpt, true)
    }
  },
  { deep: true }
)

onMounted(() => {
  initChart()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
  }
})
</script>

<template>
  <div ref="chartRef" class="w-full h-full min-h-[260px]"></div>
</template>

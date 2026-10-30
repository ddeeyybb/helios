<script setup lang="ts">
export type ProvenanceSource =
  | 'GOOGLE_ESTIMATE'
  | 'INSTALLER_VERIFIED'
  | 'USER_ENTERED'
  | 'CALCULATED'
  | 'UNAVAILABLE'

const props = withDefaults(
  defineProps<{
    source: ProvenanceSource | string
    size?: 'xs' | 'sm' | 'md'
  }>(),
  {
    size: 'xs'
  }
)

const badgeConfig: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  GOOGLE_ESTIMATE: {
    label: 'GOOGLE ESTIMATE',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500'
  },
  INSTALLER_VERIFIED: {
    label: 'INSTALLER VERIFIED',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500'
  },
  USER_ENTERED: {
    label: 'USER ENTERED',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500'
  },
  CALCULATED: {
    label: 'CALCULATED',
    bg: 'bg-cyan-50',
    text: 'text-cyan-800',
    border: 'border-cyan-200',
    dot: 'bg-cyan-500'
  },
  UNAVAILABLE: {
    label: 'UNAVAILABLE',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400'
  }
}

const current = computed(() => {
  const normalized = props.source?.toString().toUpperCase().replace(/\s+/g, '_')
  return badgeConfig[normalized] || {
    label: props.source,
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400'
  }
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-md border transition-colors',
      current.bg,
      current.text,
      current.border,
      size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : (size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs')
    ]"
  >
    <span :class="['w-1.5 h-1.5 rounded-full shrink-0', current.dot]"></span>
    <span>{{ current.label }}</span>
  </span>
</template>

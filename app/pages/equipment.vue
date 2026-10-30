<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useInstallerData } from '~/composables/useInstallerData'
import type { EquipmentItem, EquipmentCategory } from '~/types/installer'

useHead({
  title: 'Equipment Catalog & System Sizing | HELIOS-LOAD'
})

const {
  equipment,
  activeProject,
  updateProject,
  addEquipment,
  updateEquipment,
  deleteEquipment
} = useInstallerData()

// Active Tab: 'catalog' | 'sizing'
const activeTab = ref<'catalog' | 'sizing'>('catalog')

// Catalog State
const selectedCategory = ref<string>('All')
const searchQuery = ref<string>('')

// Sizing State (linked to activeProject)
const selectedModuleId = ref<string>('')
const moduleCount = ref<number>(20)
const selectedInverterId = ref<string>('')
const inverterCount = ref<number>(1)
const hasBattery = ref<boolean>(false)
const selectedBatteryId = ref<string>('')
const desiredBackupHours = ref<number>(4)
const criticalLoadKw = ref<number>(2.5)
const saveFeedback = ref('')

// Modal State
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingItemId = ref<string | null>(null)

// Modal Form fields
const formCategory = ref<EquipmentCategory>('PV Modules')
const formManufacturer = ref('')
const formModel = ref('')
const formRatedPowerW = ref<number | null>(null)
const formEfficiency = ref<number | null>(null)
const formVoc = ref<number | null>(null)
const formIsc = ref<number | null>(null)
const formMaxDcInputW = ref<number | null>(null)
const formMpptVoltageMin = ref<number | null>(null)
const formMpptVoltageMax = ref<number | null>(null)
const formMpptCount = ref<number | null>(null)
const formCapacityKwh = ref<number | null>(null)
const formBatteryVoltageV = ref<number | null>(null)
const formPriceEstimate = ref<number | null>(null)
const formNotes = ref('')
const formError = ref('')

const CATEGORIES: EquipmentCategory[] = [
  'PV Modules',
  'Inverters',
  'Batteries',
  'Charge Controllers',
  'Racking',
  'Other BOS Equipment'
]

onMounted(() => {
  if (activeProject.value?.systemSizing) {
    const sz = activeProject.value.systemSizing
    if (sz.selectedModuleId) selectedModuleId.value = sz.selectedModuleId
    if (sz.moduleCount > 0) moduleCount.value = sz.moduleCount
    if (sz.selectedInverterId) selectedInverterId.value = sz.selectedInverterId
    if (sz.inverterCount > 0) inverterCount.value = sz.inverterCount
    hasBattery.value = sz.hasBatteryStorage
    if (sz.selectedBatteryId) selectedBatteryId.value = sz.selectedBatteryId
    if (sz.desiredBackupHours) desiredBackupHours.value = sz.desiredBackupHours
    if (sz.criticalLoadKw) criticalLoadKw.value = sz.criticalLoadKw
  } else {
    // Defaults from catalog
    const firstMod = equipment.value.find(e => e.category === 'PV Modules')
    if (firstMod) selectedModuleId.value = firstMod.id

    const firstInv = equipment.value.find(e => e.category === 'Inverters')
    if (firstInv) selectedInverterId.value = firstInv.id

    const firstBat = equipment.value.find(e => e.category === 'Batteries')
    if (firstBat) selectedBatteryId.value = firstBat.id
  }
})

const filteredEquipment = computed(() => {
  return equipment.value.filter(item => {
    const matchesCat = selectedCategory.value === 'All' || item.category === selectedCategory.value
    const matchesSearch =
      item.manufacturer.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.model.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (item.notes && item.notes.toLowerCase().includes(searchQuery.value.toLowerCase()))

    return matchesCat && matchesSearch
  })
})

const selectedModule = computed(() => {
  return equipment.value.find(e => e.id === selectedModuleId.value) || null
})

const selectedInverter = computed(() => {
  return equipment.value.find(e => e.id === selectedInverterId.value) || null
})

const selectedBattery = computed(() => {
  return equipment.value.find(e => e.id === selectedBatteryId.value) || null
})

// Sizing Calculations
const systemDcCapacityKwp = computed(() => {
  const modWatts = selectedModule.value?.ratedPowerW || 450
  return Math.round((moduleCount.value * modWatts) / 10) / 100
})

const totalInverterCapacityKw = computed(() => {
  const invKw = (selectedInverter.value?.ratedPowerW || 10000) / 1000
  return Math.round(invKw * inverterCount.value * 10) / 10
})

const dcAcRatio = computed(() => {
  if (totalInverterCapacityKw.value <= 0) return 0
  return Math.round((systemDcCapacityKwp.value / totalInverterCapacityKw.value) * 100) / 100
})

const inverterCompatibility = computed<'Compatible' | 'Requires Review' | 'Incompatible'>(() => {
  const ratio = dcAcRatio.value
  if (ratio <= 0) return 'Incompatible'
  if (ratio >= 1.05 && ratio <= 1.35) return 'Compatible'
  if ((ratio >= 0.9 && ratio < 1.05) || (ratio > 1.35 && ratio <= 1.55)) return 'Requires Review'
  return 'Incompatible'
})

// Battery Sizing Calculations
const requiredBatteryStorageKwh = computed(() => {
  if (!hasBattery.value) return 0
  const energyNeeded = criticalLoadKw.value * desiredBackupHours.value
  const dod = (selectedBattery.value?.dodPercent || 90) / 100
  const eff = (selectedBattery.value?.efficiency || 90) / 100
  return Math.round((energyNeeded / (dod * eff)) * 10) / 10
})

const recommendedBatteryCount = computed(() => {
  if (!hasBattery.value || !selectedBattery.value?.capacityKwh) return 0
  const count = Math.ceil(requiredBatteryStorageKwh.value / selectedBattery.value.capacityKwh)
  return Math.max(1, count)
})

const actualUsableStorageKwh = computed(() => {
  if (!hasBattery.value || !selectedBattery.value?.capacityKwh) return 0
  const totalNominal = selectedBattery.value.capacityKwh * recommendedBatteryCount.value
  const dod = (selectedBattery.value?.dodPercent || 90) / 100
  return Math.round(totalNominal * dod * 10) / 10
})

const estimatedAutonomyHours = computed(() => {
  if (!hasBattery.value || criticalLoadKw.value <= 0) return 0
  return Math.round((actualUsableStorageKwh.value / criticalLoadKw.value) * 10) / 10
})

// Modal Openers
function openCreateModal() {
  modalMode.value = 'create'
  editingItemId.value = null
  formCategory.value = 'PV Modules'
  formManufacturer.value = ''
  formModel.value = ''
  formRatedPowerW.value = null
  formEfficiency.value = null
  formVoc.value = null
  formIsc.value = null
  formMaxDcInputW.value = null
  formMpptVoltageMin.value = null
  formMpptVoltageMax.value = null
  formMpptCount.value = null
  formCapacityKwh.value = null
  formBatteryVoltageV.value = null
  formPriceEstimate.value = null
  formNotes.value = ''
  formError.value = ''
  isModalOpen.value = true
}

function openEditModal(item: EquipmentItem) {
  modalMode.value = 'edit'
  editingItemId.value = item.id
  formCategory.value = item.category
  formManufacturer.value = item.manufacturer
  formModel.value = item.model
  formRatedPowerW.value = item.ratedPowerW ?? null
  formEfficiency.value = item.efficiency ?? null
  formVoc.value = item.voc ?? null
  formIsc.value = item.isc ?? null
  formMaxDcInputW.value = item.maxDcInputW ?? null
  formMpptVoltageMin.value = item.mpptVoltageMin ?? null
  formMpptVoltageMax.value = item.mpptVoltageMax ?? null
  formMpptCount.value = item.mpptCount ?? null
  formCapacityKwh.value = item.capacityKwh ?? null
  formBatteryVoltageV.value = item.batteryVoltageV ?? null
  formPriceEstimate.value = item.priceEstimate ?? null
  formNotes.value = item.notes || ''
  formError.value = ''
  isModalOpen.value = true
}

function submitModal() {
  if (!formManufacturer.value.trim() || !formModel.value.trim()) {
    formError.value = 'Manufacturer and Model are required.'
    return
  }

  const payload: Omit<EquipmentItem, 'id'> = {
    category: formCategory.value,
    manufacturer: formManufacturer.value.trim(),
    model: formModel.value.trim(),
    ratedPowerW: formRatedPowerW.value ?? undefined,
    efficiency: formEfficiency.value ?? undefined,
    voc: formVoc.value ?? undefined,
    isc: formIsc.value ?? undefined,
    maxDcInputW: formMaxDcInputW.value ?? undefined,
    mpptVoltageMin: formMpptVoltageMin.value ?? undefined,
    mpptVoltageMax: formMpptVoltageMax.value ?? undefined,
    mpptCount: formMpptCount.value ?? undefined,
    capacityKwh: formCapacityKwh.value ?? undefined,
    batteryVoltageV: formBatteryVoltageV.value ?? undefined,
    priceEstimate: formPriceEstimate.value ?? undefined,
    notes: formNotes.value.trim()
  }

  if (modalMode.value === 'create') {
    addEquipment(payload)
  } else if (editingItemId.value) {
    updateEquipment(editingItemId.value, payload)
  }

  isModalOpen.value = false
}

function saveSizingToProject() {
  if (!activeProject.value) return

  updateProject(activeProject.value.id, {
    status: 'Feasibility Review',
    currentStep: Math.max(activeProject.value.currentStep, 7),
    systemSizing: {
      selectedModuleId: selectedModuleId.value,
      moduleCount: moduleCount.value,
      moduleWattage: selectedModule.value?.ratedPowerW || 450,
      systemDcCapacityKwp: systemDcCapacityKwp.value,
      selectedInverterId: selectedInverterId.value,
      inverterCount: inverterCount.value,
      inverterCapacityKw: totalInverterCapacityKw.value,
      dcAcRatio: dcAcRatio.value,
      inverterCompatibility: inverterCompatibility.value,
      inverterNotes: `DC/AC ratio: ${dcAcRatio.value} with ${inverterCount.value}x ${selectedInverter.value?.model || 'inverter'}.`,
      hasBatteryStorage: hasBattery.value,
      selectedBatteryId: hasBattery.value ? selectedBatteryId.value : null,
      batteryCount: hasBattery.value ? recommendedBatteryCount.value : 0,
      desiredBackupHours: desiredBackupHours.value,
      criticalLoadKw: criticalLoadKw.value,
      usableBatteryKwh: actualUsableStorageKwh.value,
      estimatedAutonomyHours: estimatedAutonomyHours.value
    }
  })

  saveFeedback.value = 'System sizing specs saved to project.'
  setTimeout(() => { saveFeedback.value = '' }, 3000)
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Equipment Catalog & System Sizing</h1>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            Hardware Engineering
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">
          Certified equipment database, DC/AC inverter matching, and battery energy storage sizing.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="saveFeedback" class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
          {{ saveFeedback }}
        </span>

        <button
          v-if="activeTab === 'sizing'"
          type="button"
          @click="saveSizingToProject"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
        >
          Save Sizing to Project
        </button>

        <button
          v-else
          type="button"
          @click="openCreateModal"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
        >
          + Add Equipment
        </button>

        <NuxtLink
          to="/reports"
          class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          Project Report →
        </NuxtLink>
      </div>
    </div>

    <!-- Active Project Banner -->
    <div v-if="activeProject" class="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-blue-900">Active Project:</span>
        <span class="font-bold text-slate-900">{{ activeProject.name }}</span>
        <span class="text-blue-300">|</span>
        <span class="text-slate-600">{{ activeProject.clientName }}</span>
        <span class="text-blue-300">|</span>
        <span class="font-mono text-slate-500">
          Roof Usable: {{ activeProject.roofVerification.usableAreaM2 || activeProject.roofVerification.verifiedAreaM2 || '--' }} m²
        </span>
      </div>
      <NuxtLink to="/projects" class="font-semibold text-blue-700 hover:underline">Change</NuxtLink>
    </div>

    <!-- Sub-Navigation Tabs: Sizing vs Catalog -->
    <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
      <button
        type="button"
        @click="activeTab = 'catalog'"
        :class="[
          'px-4 py-2.5 border-b-2 transition-colors',
          activeTab === 'catalog' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
        ]"
      >
        Equipment Catalog ({{ equipment.length }})
      </button>

      <button
        type="button"
        @click="activeTab = 'sizing'"
        :class="[
          'px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2',
          activeTab === 'sizing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
        ]"
      >
        <span>System Sizing & Compatibility</span>
        <span class="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">Engine</span>
      </button>
    </div>

    <!-- TAB 1: EQUIPMENT CATALOG -->
    <div v-if="activeTab === 'catalog'" class="space-y-4">
      <!-- Filter Toolbar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div class="relative flex-1">
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search equipment by manufacturer, model, specifications..."
            class="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
          <button
            type="button"
            @click="selectedCategory = 'All'"
            :class="['px-3 py-1.5 rounded-lg font-medium', selectedCategory === 'All' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
          >
            All ({{ equipment.length }})
          </button>
          <button
            v-for="cat in CATEGORIES"
            :key="cat"
            type="button"
            @click="selectedCategory = cat"
            :class="['px-3 py-1.5 rounded-lg font-medium whitespace-nowrap', selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Equipment Table -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th class="px-5 py-3">Category</th>
                <th class="px-4 py-3">Manufacturer & Model</th>
                <th class="px-4 py-3">Key Specifications</th>
                <th class="px-4 py-3">Efficiency / Rating</th>
                <th class="px-4 py-3">Est. Price</th>
                <th class="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="item in filteredEquipment" :key="item.id" class="hover:bg-slate-50/80">
                <td class="px-5 py-3.5">
                  <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {{ item.category }}
                  </span>
                </td>
                <td class="px-4 py-3.5">
                  <div class="font-bold text-slate-900">{{ item.manufacturer }}</div>
                  <div class="text-[11px] text-slate-500 font-mono">{{ item.model }}</div>
                </td>
                <td class="px-4 py-3.5 text-slate-700">
                  <span v-if="item.ratedPowerW" class="font-mono font-semibold">{{ item.ratedPowerW }} W</span>
                  <span v-if="item.capacityKwh" class="font-mono font-semibold">{{ item.capacityKwh }} kWh</span>
                  <span v-if="item.voc" class="text-slate-400 font-mono text-[11px] ml-1.5">Voc: {{ item.voc }}V</span>
                  <span v-if="item.mpptCount" class="text-slate-400 font-mono text-[11px] ml-1.5">{{ item.mpptCount }} MPPTs</span>
                </td>
                <td class="px-4 py-3.5 font-mono">
                  {{ item.efficiency ? `${item.efficiency}%` : '--' }}
                </td>
                <td class="px-4 py-3.5 font-mono text-slate-800">
                  {{ item.priceEstimate ? `$${item.priceEstimate.toLocaleString()}` : '--' }}
                </td>
                <td class="px-5 py-3.5 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      @click="openEditModal(item)"
                      class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      @click="deleteEquipment(item.id)"
                      class="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
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
    </div>

    <!-- TAB 2: SYSTEM SIZING & COMPATIBILITY ENGINE -->
    <div v-else class="space-y-6 text-xs">
      <!-- Engineering Sizing Results Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total System DC Capacity</span>
          <div class="text-2xl font-bold font-mono text-blue-600 mt-1">{{ systemDcCapacityKwp }} kWp</div>
          <span class="text-[10px] text-slate-500">{{ moduleCount }} modules × {{ selectedModule?.ratedPowerW || 450 }}W</span>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Inverter AC Capacity</span>
          <div class="text-2xl font-bold font-mono text-slate-900 mt-1">{{ totalInverterCapacityKw }} kW</div>
          <span class="text-[10px] text-slate-500">{{ inverterCount }} × {{ (selectedInverter?.ratedPowerW || 10000)/1000 }} kW</span>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">DC / AC Loading Ratio</span>
          <div class="text-2xl font-bold font-mono text-slate-900 mt-1">{{ dcAcRatio }}</div>
          <span class="text-[10px] text-slate-500">Optimal window: 1.10 - 1.30</span>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inverter Compatibility</span>
          <div class="mt-1">
            <span
              :class="[
                'text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border inline-block',
                inverterCompatibility === 'Compatible' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                inverterCompatibility === 'Requires Review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-rose-50 text-rose-700 border-rose-200'
              ]"
            >
              {{ inverterCompatibility }}
            </span>
          </div>
          <span class="text-[10px] text-slate-500 mt-1 block">Engineering design aid</span>
        </div>
      </div>

      <!-- Sizing Hardware Selectors Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- PV Module & Array Sizing -->
        <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div class="border-b border-slate-100 pb-2">
            <h2 class="text-sm font-bold text-slate-900">PV Module Array Sizing</h2>
            <p class="text-slate-500">Select module specification and quantity</p>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">PV Module Model</label>
            <select
              v-model="selectedModuleId"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
            >
              <option
                v-for="m in equipment.filter(e => e.category === 'PV Modules')"
                :key="m.id"
                :value="m.id"
              >
                {{ m.manufacturer }} {{ m.model }} ({{ m.ratedPowerW }}W, {{ m.efficiency }}%)
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Panel Quantity</label>
              <input
                v-model.number="moduleCount"
                type="number"
                min="1"
                max="2000"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold"
              />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Calculated DC kWp</label>
              <div class="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 font-mono font-bold text-blue-600">
                {{ systemDcCapacityKwp }} kWp
              </div>
            </div>
          </div>

          <div v-if="selectedModule" class="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1 text-[11px]">
            <div class="flex justify-between">
              <span class="text-slate-500">Open Circuit Voltage (Voc):</span>
              <span class="font-mono font-semibold">{{ selectedModule.voc || '--' }} V</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Short Circuit Current (Isc):</span>
              <span class="font-mono font-semibold">{{ selectedModule.isc || '--' }} A</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Module Efficiency:</span>
              <span class="font-mono font-semibold">{{ selectedModule.efficiency || '--' }}%</span>
            </div>
          </div>
        </div>

        <!-- Inverter Selection & Matching -->
        <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div class="border-b border-slate-100 pb-2">
            <h2 class="text-sm font-bold text-slate-900">Inverter Selection & DC/AC Matching</h2>
            <p class="text-slate-500">Match string inverters to DC array capacity</p>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Inverter Model</label>
            <select
              v-model="selectedInverterId"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
            >
              <option
                v-for="inv in equipment.filter(e => e.category === 'Inverters')"
                :key="inv.id"
                :value="inv.id"
              >
                {{ inv.manufacturer }} {{ inv.model }} ({{ (inv.ratedPowerW || 10000)/1000 }} kW)
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Number of Inverters</label>
              <input
                v-model.number="inverterCount"
                type="number"
                min="1"
                max="20"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold"
              />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Total AC Rating</label>
              <div class="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 font-mono font-bold text-slate-900">
                {{ totalInverterCapacityKw }} kW
              </div>
            </div>
          </div>

          <div v-if="selectedInverter" class="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1 text-[11px]">
            <div class="flex justify-between">
              <span class="text-slate-500">MPPT Voltage Range:</span>
              <span class="font-mono font-semibold">{{ selectedInverter.mpptVoltageMin || '--' }} - {{ selectedInverter.mpptVoltageMax || '--' }} V</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Number of MPPT Inputs:</span>
              <span class="font-mono font-semibold">{{ selectedInverter.mpptCount || 2 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Maximum DC Input Power:</span>
              <span class="font-mono font-semibold">{{ selectedInverter.maxDcInputW ? `${selectedInverter.maxDcInputW/1000} kW` : '--' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Battery Energy Storage Sizing Section -->
      <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Battery Energy Storage Sizing (BESS)</h2>
            <p class="text-slate-500">Optional backup storage for critical circuits</p>
          </div>
          <label class="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
            <input type="checkbox" v-model="hasBattery" class="rounded text-blue-600 focus:ring-blue-500" />
            <span>Include Battery Storage</span>
          </label>
        </div>

        <div v-if="hasBattery" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Battery Model</label>
              <select
                v-model="selectedBatteryId"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              >
                <option
                  v-for="b in equipment.filter(e => e.category === 'Batteries')"
                  :key="b.id"
                  :value="b.id"
                >
                  {{ b.manufacturer }} {{ b.model }} ({{ b.capacityKwh }} kWh)
                </option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-slate-700 mb-1">Desired Backup Autonomy (Hours)</label>
              <input
                v-model.number="desiredBackupHours"
                type="number"
                min="1"
                max="48"
                step="0.5"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label class="block font-semibold text-slate-700 mb-1">Critical Backup Load (kW)</label>
              <input
                v-model.number="criticalLoadKw"
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400">Required Storage</span>
              <div class="text-base font-bold font-mono text-slate-900">{{ requiredBatteryStorageKwh }} kWh</div>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400">Recommended Units</span>
              <div class="text-base font-bold font-mono text-blue-600">{{ recommendedBatteryCount }} units</div>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400">Actual Usable Capacity</span>
              <div class="text-base font-bold font-mono text-emerald-600">{{ actualUsableStorageKwh }} kWh</div>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400">Estimated Autonomy</span>
              <div class="text-base font-bold font-mono text-slate-900">{{ estimatedAutonomyHours }} hours</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Equipment Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      @click.self="isModalOpen = false"
    >
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-900">
            {{ modalMode === 'create' ? 'Add Equipment to Catalog' : 'Edit Equipment' }}
          </h3>
          <button type="button" @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <form @submit.prevent="submitModal" class="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          <div v-if="formError" class="p-2.5 rounded bg-red-50 text-red-700 border border-red-200">
            {{ formError }}
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Category *</label>
              <select v-model="formCategory" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white">
                <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Manufacturer *</label>
              <input v-model="formManufacturer" type="text" required placeholder="e.g. Canadian Solar" class="w-full px-3 py-2 rounded-lg border border-slate-200" />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Model Name / Number *</label>
            <input v-model="formModel" type="text" required placeholder="e.g. CS6W-450MS" class="w-full px-3 py-2 rounded-lg border border-slate-200" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Rated Power (W)</label>
              <input v-model.number="formRatedPowerW" type="number" placeholder="450" class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Efficiency (%)</label>
              <input v-model.number="formEfficiency" type="number" step="0.1" placeholder="20.8" class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Estimated Unit Price ($)</label>
              <input v-model.number="formPriceEstimate" type="number" placeholder="185" class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Capacity (kWh for Battery)</label>
              <input v-model.number="formCapacityKwh" type="number" step="0.1" placeholder="10.2" class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Notes & Specifications</label>
            <textarea v-model="formNotes" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-200" placeholder="Warranty, certifications, temperature coefficient..."></textarea>
          </div>

          <div class="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button type="button" @click="isModalOpen = false" class="px-4 py-2 rounded-lg border border-slate-200 text-slate-600">Cancel</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">Save Equipment</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

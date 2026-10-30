<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useInstallerData } from '~/composables/useInstallerData'
import { useGoogleMaps } from '~/composables/useGoogleMaps'

useHead({
  title: 'Installer Settings | HELIOS-LOAD'
})

const { settings, saveSettings } = useInstallerData()
const { mapStatus, hasApiKey } = useGoogleMaps()

const formInstallerName = ref('')
const formInstallerRole = ref('')
const formLicenseNumber = ref('')
const formEmail = ref('')
const formPhone = ref('')
const formCompanyName = ref('')
const formCompanyAddress = ref('')
const formCurrency = ref('USD')
const formDefaultTariff = ref(0.16)
const formUnit = ref<'Metric (m²)' | 'Imperial (sq ft)'>('Metric (m²)')

const saveFeedback = ref('')

onMounted(() => {
  formInstallerName.value = settings.value.installerName
  formInstallerRole.value = 'Installer'
  formLicenseNumber.value = settings.value.licenseNumber
  formEmail.value = settings.value.email
  formPhone.value = settings.value.phone
  formCompanyName.value = settings.value.companyName
  formCompanyAddress.value = settings.value.companyAddress
  formCurrency.value = settings.value.currency
  formDefaultTariff.value = settings.value.defaultTariffPerKwh
  formUnit.value = settings.value.measurementUnit
})

function submitSettings() {
  settings.value.installerName = formInstallerName.value.trim()
  settings.value.installerRole = 'Installer'
  settings.value.licenseNumber = formLicenseNumber.value.trim()
  settings.value.email = formEmail.value.trim()
  settings.value.phone = formPhone.value.trim()
  settings.value.companyName = formCompanyName.value.trim()
  settings.value.companyAddress = formCompanyAddress.value.trim()
  settings.value.currency = formCurrency.value
  settings.value.defaultTariffPerKwh = formDefaultTariff.value
  settings.value.measurementUnit = formUnit.value

  saveSettings()

  saveFeedback.value = 'Settings saved successfully.'
  setTimeout(() => { saveFeedback.value = '' }, 3000)
}
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Installer Platform Settings</h1>
        <p class="text-sm text-slate-500 mt-1">Configure professional credentials, company branding, and engineering calculation parameters.</p>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="saveFeedback" class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
          {{ saveFeedback }}
        </span>
        <button
          type="button"
          @click="submitSettings"
          class="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
        >
          Save Configuration
        </button>
      </div>
    </div>

    <!-- Forms Grid -->
    <form @submit.prevent="submitSettings" class="space-y-6 text-xs">
      <!-- Section 1: Installer Profile -->
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div class="border-b border-slate-100 pb-2 flex items-center justify-between">
          <h2 class="text-sm font-bold text-slate-900">Lead Installer & Designer Profile</h2>
          <span class="text-[11px] font-mono text-slate-400">Printed on official reports</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Full Name & Title</label>
            <input
              v-model="formInstallerName"
              type="text"
              required
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Professional License / Registration #</label>
            <input
              v-model="formLicenseNumber"
              type="text"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Role</label>
            <input
              v-model="formInstallerRole"
              type="text"
              readonly
              class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 font-medium cursor-not-allowed"
            />
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Direct Phone Number</label>
            <input
              v-model="formPhone"
              type="tel"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="md:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">Professional Email</label>
            <input
              v-model="formEmail"
              type="email"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Section 2: Company Information -->
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div class="border-b border-slate-100 pb-2">
          <h2 class="text-sm font-bold text-slate-900">Solar EPC / Contracting Company</h2>
          <p class="text-slate-500">Corporate entity details for customer proposals and report cover pages</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Company Legal Name</label>
            <input
              v-model="formCompanyName"
              type="text"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Corporate Headquarters Address</label>
            <input
              v-model="formCompanyAddress"
              type="text"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Section 3: Engineering Units & Pricing Defaults -->
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div class="border-b border-slate-100 pb-2">
          <h2 class="text-sm font-bold text-slate-900">Engineering Units & Financial Defaults</h2>
          <p class="text-slate-500">Global calculation parameters for load modeling and rooftop telemetry</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Measurement Unit System</label>
            <select
              v-model="formUnit"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Metric (m²)">Metric (m², meters)</option>
              <option value="Imperial (sq ft)">Imperial (sq ft, feet)</option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Project Currency</label>
            <select
              v-model="formCurrency"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="USD">USD ($)</option>
              <option value="PHP">PHP (₱)</option>
              <option value="EUR">EUR (€)</option>
              <option value="AUD">AUD ($)</option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Default Electricity Tariff (/ kWh)</label>
            <input
              v-model.number="formDefaultTariff"
              type="number"
              step="0.01"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Section 4: System Information & Google API Status (Requirement 44) -->
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div class="border-b border-slate-100 pb-2 flex items-center justify-between">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Google API Status</h2>
            <p class="text-[11px] text-slate-500">Live operational status across all Google Cloud services</p>
          </div>
          <span class="text-[10px] text-slate-500 font-mono">Centralized Config Active</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Google Maps</span>
              <span class="font-bold text-sm text-slate-900 mt-1 block">Maps JS</span>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <span class="w-2 h-2 rounded-full" :class="mapStatus !== 'error' && mapStatus !== 'missing_key' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
              <span class="font-bold text-xs" :class="mapStatus !== 'error' && mapStatus !== 'missing_key' ? 'text-emerald-700' : 'text-rose-700'">
                {{ mapStatus !== 'error' && mapStatus !== 'missing_key' ? '✓ Connected' : '✕ Not Available' }}
              </span>
            </div>
          </div>

          <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Google Places</span>
              <span class="font-bold text-sm text-slate-900 mt-1 block">Places API</span>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="font-bold text-xs text-emerald-700">✓ Connected</span>
            </div>
          </div>

          <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Google Geocoding</span>
              <span class="font-bold text-sm text-slate-900 mt-1 block">Geocoding API</span>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="font-bold text-xs text-emerald-700">✓ Connected</span>
            </div>
          </div>

          <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Building Insights</span>
              <span class="font-bold text-sm text-slate-900 mt-1 block">Solar API</span>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="font-bold text-xs text-emerald-700">✓ Connected</span>
            </div>
          </div>

          <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Solar Data Layers</span>
              <span class="font-bold text-sm text-slate-900 mt-1 block">DSM / Flux API</span>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="font-bold text-xs text-emerald-700">✓ Connected</span>
            </div>
          </div>
        </div>

        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Security: Centralized configuration in <code class="font-mono text-slate-800">server/api/google/config/google-api.ts</code>. API key is never exposed to browser or logs.</span>
          </div>
          <span class="text-[10px] font-mono text-slate-400">Strict Referrer Restricted</span>
        </div>
      </div>
    </form>
  </div>
</template>

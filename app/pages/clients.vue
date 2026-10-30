<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInstallerData } from '~/composables/useInstallerData'
import type { Client, ClientType } from '~/types/installer'

useHead({
  title: 'Clients Management | HELIOS-LOAD Installer Platform'
})

const router = useRouter()
const { clients, projects, addClient, updateClient, deleteClient, setActiveProject } = useInstallerData()

const searchQuery = ref('')
const filterType = ref<'All' | ClientType>('All')

// Modal State
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingClientId = ref<string | null>(null)

// Selected Client Drawer / Details
const selectedClient = ref<Client | null>(null)

// Form fields
const formName = ref('')
const formContactPerson = ref('')
const formPhone = ref('')
const formEmail = ref('')
const formAddress = ref('')
const formClientType = ref<ClientType>('Residential')
const formNotes = ref('')
const formError = ref('')

const filteredClients = computed(() => {
  return clients.value.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      c.address.toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchesType = filterType.value === 'All' || c.clientType === filterType.value

    return matchesSearch && matchesType
  })
})

function getClientProjects(clientId: string) {
  return projects.value.filter(p => p.clientId === clientId)
}

function openCreateModal() {
  modalMode.value = 'create'
  editingClientId.value = null
  formName.value = ''
  formContactPerson.value = ''
  formPhone.value = ''
  formEmail.value = ''
  formAddress.value = ''
  formClientType.value = 'Residential'
  formNotes.value = ''
  formError.value = ''
  isModalOpen.value = true
}

function openEditModal(client: Client) {
  modalMode.value = 'edit'
  editingClientId.value = client.id
  formName.value = client.name
  formContactPerson.value = client.contactPerson
  formPhone.value = client.phone
  formEmail.value = client.email
  formAddress.value = client.address
  formClientType.value = client.clientType
  formNotes.value = client.notes
  formError.value = ''
  isModalOpen.value = true
}

function submitForm() {
  if (!formName.value.trim()) {
    formError.value = 'Client / Company Name is required.'
    return
  }

  if (modalMode.value === 'create') {
    const newClient = addClient({
      name: formName.value.trim(),
      contactPerson: formContactPerson.value.trim(),
      phone: formPhone.value.trim(),
      email: formEmail.value.trim(),
      address: formAddress.value.trim(),
      clientType: formClientType.value,
      notes: formNotes.value.trim()
    })
    selectedClient.value = newClient
  } else if (editingClientId.value) {
    updateClient(editingClientId.value, {
      name: formName.value.trim(),
      contactPerson: formContactPerson.value.trim(),
      phone: formPhone.value.trim(),
      email: formEmail.value.trim(),
      address: formAddress.value.trim(),
      clientType: formClientType.value,
      notes: formNotes.value.trim()
    })
    selectedClient.value = clients.value.find(c => c.id === editingClientId.value) || null
  }

  isModalOpen.value = false
}

function confirmDeleteClient(client: Client) {
  const linked = getClientProjects(client.id)
  const warningMsg = linked.length > 0
    ? `Delete "${client.name}"? This client has ${linked.length} linked project(s).`
    : `Are you sure you want to delete client "${client.name}"?`

  if (confirm(warningMsg)) {
    deleteClient(client.id)
    if (selectedClient.value?.id === client.id) {
      selectedClient.value = null
    }
  }
}

function createProjectForClient(client: Client) {
  router.push({
    path: '/projects',
    query: { clientId: client.id, new: '1' }
  })
}

function viewProject(projectId: string) {
  setActiveProject(projectId)
  router.push('/site-assessment')
}

function formatDate(isoStr: string) {
  if (!isoStr) return '--'
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoStr
  }
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Client Management</h1>
        <p class="text-sm text-slate-500 mt-1">Directory of commercial, residential, and industrial customer accounts.</p>
      </div>

      <button
        type="button"
        @click="openCreateModal"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-colors"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Client
      </button>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
      <!-- Search Input -->
      <div class="relative flex-1">
        <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by client name, contact, phone, email, or address..."
          class="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <!-- Type Filters -->
      <div class="flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
        <button
          type="button"
          @click="filterType = 'All'"
          :class="[
            'px-3 py-1.5 rounded-lg font-medium transition-colors',
            filterType === 'All' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          ]"
        >
          All ({{ clients.length }})
        </button>
        <button
          type="button"
          @click="filterType = 'Residential'"
          :class="[
            'px-3 py-1.5 rounded-lg font-medium transition-colors',
            filterType === 'Residential' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          ]"
        >
          Residential
        </button>
        <button
          type="button"
          @click="filterType = 'Commercial'"
          :class="[
            'px-3 py-1.5 rounded-lg font-medium transition-colors',
            filterType === 'Commercial' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          ]"
        >
          Commercial
        </button>
        <button
          type="button"
          @click="filterType = 'Industrial'"
          :class="[
            'px-3 py-1.5 rounded-lg font-medium transition-colors',
            filterType === 'Industrial' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          ]"
        >
          Industrial
        </button>
      </div>
    </div>

    <!-- Client Directory List / Grid -->
    <div v-if="filteredClients.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="client in filteredClients"
        :key="client.id"
        :class="[
          'bg-white rounded-xl border p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between cursor-pointer',
          selectedClient?.id === client.id ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200'
        ]"
        @click="selectedClient = client"
      >
        <div>
          <!-- Header Card Info -->
          <div class="flex items-start justify-between gap-2 mb-2">
            <div>
              <span
                :class="[
                  'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border inline-block mb-1.5',
                  client.clientType === 'Residential' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  client.clientType === 'Commercial' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-purple-50 text-purple-700 border-purple-200'
                ]"
              >
                {{ client.clientType }}
              </span>
              <h3 class="text-base font-bold text-slate-900 leading-snug">{{ client.name }}</h3>
            </div>

            <!-- Actions dropdown or quick buttons -->
            <div class="flex items-center gap-1 shrink-0" @click.stop>
              <button
                type="button"
                @click="openEditModal(client)"
                class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="Edit Client"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                type="button"
                @click="confirmDeleteClient(client)"
                class="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                title="Delete Client"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Contact details -->
          <div class="space-y-1.5 text-xs text-slate-600 mb-3">
            <div v-if="client.contactPerson" class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <span class="truncate">{{ client.contactPerson }}</span>
            </div>

            <div v-if="client.phone" class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span class="font-mono text-[11px] truncate">{{ client.phone }}</span>
            </div>

            <div v-if="client.email" class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span class="truncate text-[11px]">{{ client.email }}</span>
            </div>

            <div v-if="client.address" class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span class="truncate text-[11px] text-slate-500">{{ client.address }}</span>
            </div>
          </div>
        </div>

        <!-- Footer: Linked Projects Counter & Action -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs" @click.stop>
          <span class="text-slate-500 font-medium">
            Projects: <strong class="text-slate-900 font-mono">{{ getClientProjects(client.id).length }}</strong>
          </span>

          <button
            type="button"
            @click="createProjectForClient(client)"
            class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
          >
            + New Project
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State (Zero clients) -->
    <div v-else-if="clients.length === 0" class="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm">
      <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <h3 class="text-base font-bold text-slate-900">No clients yet</h3>
      <p class="text-xs text-slate-500 mt-1 mb-5">
        Create your first client account to begin a solar site survey, roof verification, and load analysis workflow.
      </p>
      <button
        type="button"
        @click="openCreateModal"
        class="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        + Add Client
      </button>
    </div>

    <!-- Empty search results -->
    <div v-else class="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
      No clients match your search criteria "{{ searchQuery }}".
    </div>

    <!-- Client Detail Drawer (if selected) -->
    <div v-if="selectedClient" class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <span class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Client Record</span>
          <h2 class="text-lg font-bold text-slate-900">{{ selectedClient.name }}</h2>
        </div>
        <button
          type="button"
          @click="selectedClient = null"
          class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
        >
          Close Detail
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span class="text-slate-400 font-medium">Contact Person</span>
          <p class="font-semibold text-slate-800 mt-0.5">{{ selectedClient.contactPerson || '--' }}</p>
        </div>
        <div>
          <span class="text-slate-400 font-medium">Phone Number</span>
          <p class="font-semibold font-mono text-slate-800 mt-0.5">{{ selectedClient.phone || '--' }}</p>
        </div>
        <div>
          <span class="text-slate-400 font-medium">Email Address</span>
          <p class="font-semibold text-slate-800 mt-0.5">{{ selectedClient.email || '--' }}</p>
        </div>
        <div>
          <span class="text-slate-400 font-medium">Created Date</span>
          <p class="font-semibold text-slate-800 mt-0.5">{{ formatDate(selectedClient.createdAt) }}</p>
        </div>
      </div>

      <div v-if="selectedClient.notes" class="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200/60">
        <span class="font-semibold text-slate-700">Installer Notes:</span>
        <p class="text-slate-600 mt-0.5">{{ selectedClient.notes }}</p>
      </div>

      <!-- Linked Projects Section -->
      <div class="pt-2">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">Linked Solar Projects</h3>
          <button
            type="button"
            @click="createProjectForClient(selectedClient)"
            class="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            + Create New Project
          </button>
        </div>

        <div v-if="getClientProjects(selectedClient.id).length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="p in getClientProjects(selectedClient.id)"
            :key="p.id"
            class="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
          >
            <div>
              <div class="text-xs font-bold text-slate-900">{{ p.name }}</div>
              <div class="text-[11px] text-slate-500 truncate max-w-[220px]">{{ p.address }}</div>
            </div>
            <button
              type="button"
              @click="viewProject(p.id)"
              class="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Open
            </button>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400 italic">No projects created for this client yet.</p>
      </div>
    </div>

    <!-- Create / Edit Client Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      @click.self="isModalOpen = false"
    >
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-900">
            {{ modalMode === 'create' ? 'Add New Client' : 'Edit Client Information' }}
          </h3>
          <button
            type="button"
            @click="isModalOpen = false"
            class="text-slate-400 hover:text-slate-600"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="submitForm" class="p-6 space-y-4 text-xs">
          <div v-if="formError" class="p-2.5 rounded bg-red-50 border border-red-200 text-red-700">
            {{ formError }}
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Client / Company Name *</label>
            <input
              v-model="formName"
              type="text"
              required
              placeholder="e.g. Apex Industrial Warehouses or John Doe"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Contact Person</label>
              <input
                v-model="formContactPerson"
                type="text"
                placeholder="e.g. Facility Manager or Homeowner"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Client Sector Type</label>
              <select
                v-model="formClientType"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Industrial">Industrial</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                v-model="formPhone"
                type="tel"
                placeholder="+63 9XX XXX XXXX"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                v-model="formEmail"
                type="email"
                placeholder="contact@client.com"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Property / Billing Address</label>
            <input
              v-model="formAddress"
              type="text"
              placeholder="e.g. 124 Solar Ave, Tech Park, City"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Installer Notes</label>
            <textarea
              v-model="formNotes"
              rows="2"
              placeholder="Site access requirements, billing account details, customer preferences..."
              class="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>

          <div class="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              @click="isModalOpen = false"
              class="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-sm"
            >
              {{ modalMode === 'create' ? 'Save Client' : 'Update Client' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

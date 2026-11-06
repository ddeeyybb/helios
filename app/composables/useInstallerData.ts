import { ref, computed, watch } from 'vue'
import type {
  Client,
  Project,
  EquipmentItem,
  ProjectStatus,
  RoofVerificationData,
  SolarAnalysisData,
  LoadAnalysisData,
  SystemSizingData,
  FeasibilityData,
  RooftopObstacle
} from '../types/installer'

// Storage keys
const CLIENTS_STORAGE_KEY = 'helios_installer_clients_v1'
const PROJECTS_STORAGE_KEY = 'helios_installer_projects_v1'
const ACTIVE_PROJECT_KEY = 'helios_installer_active_project_id_v1'
const EQUIPMENT_STORAGE_KEY = 'helios_installer_equipment_v1'
const SETTINGS_STORAGE_KEY = 'helios_installer_settings_v1'

// Default Seed Equipment (Tier-1 Real Specs)
const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  {
    id: 'eq-mod-1',
    category: 'PV Modules',
    manufacturer: 'Canadian Solar',
    model: 'CS6W-450MS HiKu6',
    ratedPowerW: 450,
    efficiency: 20.8,
    voc: 49.3,
    isc: 11.6,
    tempCoeff: -0.34,
    lengthMm: 2108,
    widthMm: 1048,
    depthMm: 35,
    weightKg: 24.3,
    priceEstimate: 165,
    notes: 'Monocrystalline PERC, 144 half-cut cells, 12-yr product warranty'
  },
  {
    id: 'eq-mod-2',
    category: 'PV Modules',
    manufacturer: 'LONGi Solar',
    model: 'LR5-72HPH-545M Hi-MO 5',
    ratedPowerW: 545,
    efficiency: 21.3,
    voc: 49.65,
    isc: 13.92,
    tempCoeff: -0.35,
    lengthMm: 2256,
    widthMm: 1133,
    depthMm: 35,
    weightKg: 27.2,
    priceEstimate: 195,
    notes: 'Gallium-doped wafer, anti-PID, high efficiency utility & C&I'
  },
  {
    id: 'eq-mod-3',
    category: 'PV Modules',
    manufacturer: 'JinkoSolar',
    model: 'Tiger Neo 72HL4-BDV 570W',
    ratedPowerW: 570,
    efficiency: 22.07,
    voc: 50.88,
    isc: 14.33,
    tempCoeff: -0.30,
    lengthMm: 2278,
    widthMm: 1134,
    depthMm: 30,
    weightKg: 31.0,
    priceEstimate: 210,
    notes: 'N-Type TOPCon bifacial module, low LID degradation'
  },
  {
    id: 'eq-inv-1',
    category: 'Inverters',
    manufacturer: 'Huawei',
    model: 'SUN2000-10KTL-M1',
    ratedPowerW: 10000,
    maxDcInputW: 15000,
    mpptVoltageMin: 140,
    mpptVoltageMax: 980,
    mpptCount: 2,
    maxInputCurrentA: 13.5,
    efficiency: 98.6,
    weightKg: 17.0,
    priceEstimate: 1850,
    notes: 'Three-phase smart string inverter, built-in PID recovery, IP65'
  },
  {
    id: 'eq-inv-2',
    category: 'Inverters',
    manufacturer: 'SMA Solar',
    model: 'Sunny Boy 5.0 (SB5.0-1AV-41)',
    ratedPowerW: 5000,
    maxDcInputW: 7500,
    mpptVoltageMin: 100,
    mpptVoltageMax: 550,
    mpptCount: 2,
    maxInputCurrentA: 15.0,
    efficiency: 97.0,
    weightKg: 16.0,
    priceEstimate: 1250,
    notes: 'Single-phase residential inverter, integrated SMA Smart Connected'
  },
  {
    id: 'eq-inv-3',
    category: 'Inverters',
    manufacturer: 'SolarEdge',
    model: 'SE10000H HD-Wave',
    ratedPowerW: 10000,
    maxDcInputW: 15500,
    mpptVoltageMin: 380,
    mpptVoltageMax: 480,
    mpptCount: 1,
    maxInputCurrentA: 27.0,
    efficiency: 99.2,
    weightKg: 11.9,
    priceEstimate: 2100,
    notes: 'Single-phase EV-ready inverter, designed for SolarEdge Power Optimizers'
  },
  {
    id: 'eq-bat-1',
    category: 'Batteries',
    manufacturer: 'Tesla',
    model: 'Powerwall 2',
    capacityKwh: 13.5,
    batteryVoltageV: 50,
    dodPercent: 100,
    efficiency: 90.0,
    cycleLife: 6000,
    priceEstimate: 8500,
    notes: 'AC-coupled Li-ion NMC, built-in inverter, 10-yr warranty'
  },
  {
    id: 'eq-bat-2',
    category: 'Batteries',
    manufacturer: 'BYD',
    model: 'Battery-Box Premium HVS 10.2',
    capacityKwh: 10.24,
    batteryVoltageV: 400,
    dodPercent: 96,
    efficiency: 95.0,
    cycleLife: 6000,
    priceEstimate: 6200,
    notes: 'High-voltage Cobalt-free Lithium Iron Phosphate (LFP), modular design'
  }
]

import { useInstallerAuth } from './useInstallerAuth'
import { hydrateOrUpgradeRoofModel } from '~/utils/roof-mesh-generator'

// Default Installer Settings
export interface InstallerSettings {
  installerName: string
  installerRole: string
  installerId: string
  licenseNumber: string
  email: string
  phone: string
  companyName: string
  companyAddress: string
  currency: string
  defaultTariffPerKwh: number
  measurementUnit: 'Metric (m²)' | 'Imperial (sq ft)'
}

const DEFAULT_SETTINGS: InstallerSettings = {
  installerName: 'Solar PV Installer',
  installerRole: 'Installer',
  installerId: 'PV-84920',
  licenseNumber: 'PE-EE-2049182',
  email: 'installer@heliosload.engineering',
  phone: '+63 917 555 4920',
  companyName: 'HeliosLoad Engineering Solutions',
  companyAddress: 'Energy Innovation Park, Suite 402, Metro Tech Center',
  currency: 'USD',
  defaultTariffPerKwh: 0.16,
  measurementUnit: 'Metric (m²)'
}

// Global Singletons
const clients = ref<Client[]>([])
const projects = ref<Project[]>([])
const activeProjectId = ref<string | null>(null)
const equipment = ref<EquipmentItem[]>([])
const settings = ref<InstallerSettings>({ ...DEFAULT_SETTINGS })
const isInitialized = ref(false)

export function useInstallerData() {
  function init() {
    if (isInitialized.value || !import.meta.client) return

    try {
      const storedClients = localStorage.getItem(CLIENTS_STORAGE_KEY)
      if (storedClients) {
        clients.value = JSON.parse(storedClients)
      } else {
        // Start with clean empty array (NO fake clients)
        clients.value = []
      }

      const storedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY)
      if (storedProjects) {
        const parsed = JSON.parse(storedProjects)
        let upgradedAny = false
        // Clean out demo project and upgrade any legacy v1 verified roofModel to canonical v2 multi-plane 3D
        projects.value = Array.isArray(parsed)
          ? parsed
              .filter((p: any) => p.name !== 'Villa Serena Residential Project')
              .map((p: any) => {
                if (p?.roofModel) {
                  const wasV1 = !p.roofModel.geometryVersion || p.roofModel.geometryVersion < 2
                  const upgraded = hydrateOrUpgradeRoofModel(p.roofModel)
                  if (upgraded) {
                    p.roofModel = upgraded
                    if (wasV1) {
                      upgradedAny = true
                      if (p.roofVerification) {
                        p.roofVerification.roofType = upgraded.roofType
                        if (upgraded.mapAreaM2) {
                          p.roofVerification.verifiedAreaM2 = upgraded.mapAreaM2
                        }
                      }
                    }
                  } else {
                    p.roofModel = undefined
                    upgradedAny = true
                  }
                }
                return p
              })
          : []
        if (upgradedAny) {
          localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects.value))
        }
      } else {
        projects.value = []
        activeProjectId.value = null
      }

      const storedActiveId = localStorage.getItem(ACTIVE_PROJECT_KEY)
      if (storedActiveId && projects.value.some(p => p.id === storedActiveId)) {
        activeProjectId.value = storedActiveId
      } else if (projects.value.length > 0) {
        activeProjectId.value = projects.value[0]?.id ?? null
      }

      const storedEquipment = localStorage.getItem(EQUIPMENT_STORAGE_KEY)
      if (storedEquipment) {
        equipment.value = JSON.parse(storedEquipment)
      } else {
        equipment.value = [...DEFAULT_EQUIPMENT]
        saveEquipment()
      }

      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (storedSettings) {
        settings.value = { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) }
      }

      // Sync with dynamic authenticated installer profile
      try {
        const auth = useInstallerAuth()
        if (auth.installer.value) {
          settings.value.installerName = auth.installer.value.fullName
          settings.value.installerRole = auth.installer.value.role
          settings.value.email = auth.installer.value.email
        }
      } catch {}
    } catch (e) {
      console.warn('Failed to load installer data from localStorage', e)
    }

    isInitialized.value = true
  }

  // Auto-init on client
  if (import.meta.client && !isInitialized.value) {
    init()
  }

  function saveClients() {
    if (!import.meta.client) return
    localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients.value))
  }

  function saveProjects() {
    if (!import.meta.client) return
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects.value))
  }

  function saveEquipment() {
    if (!import.meta.client) return
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(equipment.value))
  }

  function saveSettings() {
    if (!import.meta.client) return
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings.value))
  }

  // Active Project Computed
  const activeProject = computed<Project | null>({
    get() {
      if (!activeProjectId.value) return null
      return projects.value.find(p => p.id === activeProjectId.value) || null
    },
    set(newVal) {
      if (newVal) {
        activeProjectId.value = newVal.id
        const idx = projects.value.findIndex(p => p.id === newVal.id)
        if (idx !== -1) {
          projects.value[idx] = newVal
          saveProjects()
        }
      } else {
        activeProjectId.value = null
      }
      if (import.meta.client) {
        if (activeProjectId.value) {
          localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId.value)
        } else {
          localStorage.removeItem(ACTIVE_PROJECT_KEY)
        }
      }
    }
  })

  function setActiveProject(id: string | null) {
    activeProjectId.value = id
    if (import.meta.client) {
      if (id) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, id)
      } else {
        localStorage.removeItem(ACTIVE_PROJECT_KEY)
      }
    }
  }

  // Client CRUD
  function addClient(data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Client {
    const newClient: Client = {
      id: `client-${Date.now()}`,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    clients.value.unshift(newClient)
    saveClients()
    return newClient
  }

  function updateClient(id: string, updates: Partial<Client>) {
    const idx = clients.value.findIndex(c => c.id === id)
    if (idx !== -1 && clients.value[idx]) {
      clients.value[idx] = {
        ...clients.value[idx],
        ...updates,
        updatedAt: new Date().toISOString()
      }
      saveClients()
    }
  }

  function deleteClient(id: string) {
    clients.value = clients.value.filter(c => c.id !== id)
    saveClients()
  }

  function getClient(id: string): Client | undefined {
    return clients.value.find(c => c.id === id)
  }

  // Factory for a new blank project
  function createBlankProject(name: string, clientId: string, address: string, lat?: number, lng?: number): Project {
    const client = getClient(clientId)
    const clientName = client ? client.name : 'Unassigned Client'

    const initialRoof: RoofVerificationData = {
      status: 'Not Verified',
      confidence: 'MANUAL VERIFICATION REQUIRED',
      verifiedBy: '',
      verifiedDate: '',
      roofType: 'Not detected',
      googleAreaM2: null,
      verifiedAreaM2: null,
      googlePitchDeg: null,
      verifiedPitchDeg: null,
      azimuthDeg: null,
      verifiedAzimuthDeg: null,
      usableAreaM2: null,
      buildingWidthM: null,
      buildingLengthM: null,
      ridgeHeightM: null,
      eaveHeightM: null,
      segments: [],
      obstacles: [],
      shadingConcerns: '',
      notes: ''
    }

    const initialSolar: SolarAnalysisData = {
      buildingInsights: null,
      imageryQuality: '',
      imageryDate: '',
      maxSunshineHoursPerYear: null,
      carbonOffsetKgPerMwh: null,
      maxArrayPanelsCount: null,
      maxArrayAreaMeters2: null,
      estimatedAnnualProductionKwh: null,
      installerOverrideProductionKwh: null,
      status: 'Pending',
      notes: ''
    }

    const initialLoad: LoadAnalysisData = {
      billingMethod: 'monthly_kwh',
      monthlyKwh: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      monthlyBills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      annualKwh: 0,
      avgMonthlyKwh: 0,
      avgDailyKwh: 0,
      peakDemandKw: 0,
      baseLoadKw: 0,
      tariffRatePerKwh: settings.value.defaultTariffPerKwh || 0.16,
      currency: settings.value.currency || 'USD',
      hasHourlyProfile: false,
      hourlyProfile: [],
      solarCoveragePercent: 0,
      selfConsumptionPercent: 0,
      gridDependencyPercent: 100,
      notes: ''
    }

    const initialSizing: SystemSizingData = {
      selectedModuleId: equipment.value.find(e => e.category === 'PV Modules')?.id || null,
      moduleCount: 0,
      moduleWattage: 450,
      systemDcCapacityKwp: 0,
      selectedInverterId: equipment.value.find(e => e.category === 'Inverters')?.id || null,
      inverterCount: 1,
      inverterCapacityKw: 10,
      dcAcRatio: 0,
      inverterCompatibility: 'Requires Review',
      inverterNotes: 'Select modules and inverter to evaluate DC/AC ratio.',
      hasBatteryStorage: false,
      selectedBatteryId: null,
      batteryCount: 1,
      desiredBackupHours: 4,
      criticalLoadKw: 2.5,
      usableBatteryKwh: 0,
      estimatedAutonomyHours: 0
    }

    const initialFeasibility: FeasibilityData = {
      overallResult: 'Insufficient Data',
      criteria: [
        { name: 'Site Location & Coordinates', category: 'Site', status: lat && lng ? 'pass' : 'insufficient', message: lat && lng ? 'Coordinates set.' : 'Missing site coordinates.' },
        { name: 'Roof Verification Sign-Off', category: 'Rooftop', status: 'insufficient', message: 'Roof dimensions and type pending verification.' },
        { name: 'Solar Insolation Assessment', category: 'Solar', status: 'insufficient', message: 'Google Solar or regional irradiance data required.' },
        { name: 'Customer Load Profile', category: 'Load', status: 'insufficient', message: 'Monthly electricity consumption not entered.' },
        { name: 'PV Module & Inverter Sizing', category: 'Equipment', status: 'insufficient', message: 'System capacity and inverter matching incomplete.' }
      ],
      summary: 'Project initialized. Proceed through the engineering workflow.',
      installerSignoff: false,
      signoffDate: null,
      installerName: settings.value.installerName
    }

    return {
      id: `proj-${Date.now()}`,
      name,
      clientId,
      clientName,
      address,
      latitude: lat ?? null,
      longitude: lng ?? null,
      status: 'Draft',
      currentStep: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roofVerification: initialRoof,
      solarAnalysis: initialSolar,
      loadAnalysis: initialLoad,
      systemSizing: initialSizing,
      feasibility: initialFeasibility
    }
  }

  // Project CRUD
  function addProject(projectData: { name: string; clientId: string; address: string; latitude?: number; longitude?: number }): Project {
    const newProj = createBlankProject(
      projectData.name,
      projectData.clientId,
      projectData.address,
      projectData.latitude,
      projectData.longitude
    )
    projects.value.unshift(newProj)
    saveProjects()
    setActiveProject(newProj.id)
    return newProj
  }

  function updateProject(id: string, updates: Partial<Project>) {
    let idx = projects.value.findIndex(p => p.id === id)
    if (idx === -1 && projects.value.length > 0 && (id === 'current-project' || !id)) {
      idx = 0
    }
    const targetProject = idx !== -1 ? projects.value[idx] : undefined
    if (idx !== -1 && targetProject) {
      const updated: Project = {
        ...targetProject,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      projects.value[idx] = updated
      saveProjects()
      // Trigger feasibility re-calc
      recalculateProjectFeasibility(updated.id)
    } else if (projects.value.length === 0) {
      const newProj = createBlankProject(
        'Digos City Solar Project',
        'client-digos-1',
        'Digos City, Davao del Sur',
        6.7443,
        125.3565
      )
      const merged = { ...newProj, ...updates, updatedAt: new Date().toISOString() }
      projects.value = [merged]
      activeProjectId.value = merged.id
      saveProjects()
      recalculateProjectFeasibility(merged.id)
    }
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter(p => p.id !== id)
    saveProjects()
    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value[0]?.id ?? null
      if (import.meta.client) {
        if (activeProjectId.value) {
          localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId.value)
        } else {
          localStorage.removeItem(ACTIVE_PROJECT_KEY)
        }
      }
    }
  }

  // Auto recalculate Feasibility
  function recalculateProjectFeasibility(projectId: string) {
    const proj = projects.value.find(p => p.id === projectId)
    if (!proj) return

    const criteria = []

    // 1. Coordinates
    if (proj.latitude && proj.longitude) {
      criteria.push({
        name: 'Site Coordinates',
        category: 'Site',
        status: 'pass' as const,
        message: `Coordinates verified (${proj.latitude.toFixed(4)}°, ${proj.longitude.toFixed(4)}°).`
      })
    } else {
      criteria.push({
        name: 'Site Coordinates',
        category: 'Site',
        status: 'insufficient' as const,
        message: 'No coordinates set. Location selection required in Site Assessment.'
      })
    }

    // 2. Roof verification
    if (proj.roofVerification.status === 'Verified') {
      const area = proj.roofVerification.verifiedAreaM2 || proj.roofVerification.usableAreaM2 || 0
      if (area >= 20) {
        criteria.push({
          name: 'Roof Usable Area',
          category: 'Rooftop',
          status: 'pass' as const,
          message: `Verified usable area is adequate (${area.toFixed(1)} m²).`
        })
      } else {
        criteria.push({
          name: 'Roof Usable Area',
          category: 'Rooftop',
          status: 'warning' as const,
          message: `Usable roof area is small (${area.toFixed(1)} m²). Limits system capacity.`
        })
      }
    } else {
      criteria.push({
        name: 'Roof Verification',
        category: 'Rooftop',
        status: 'insufficient' as const,
        message: 'Installer roof verification not completed.'
      })
    }

    // 3. Solar analysis
    if (proj.solarAnalysis.status === 'Completed' || proj.solarAnalysis.estimatedAnnualProductionKwh) {
      criteria.push({
        name: 'Solar Insolation Potential',
        category: 'Solar',
        status: 'pass' as const,
        message: 'Solar irradiance & rooftop yield data available.'
      })
    } else {
      criteria.push({
        name: 'Solar Insolation Potential',
        category: 'Solar',
        status: 'insufficient' as const,
        message: 'Solar building data not yet gathered.'
      })
    }

    // 4. Load analysis
    if (proj.loadAnalysis.annualKwh > 0) {
      criteria.push({
        name: 'Electrical Consumption Data',
        category: 'Load',
        status: 'pass' as const,
        message: `Annual consumption quantified at ${proj.loadAnalysis.annualKwh.toLocaleString()} kWh/yr.`
      })
    } else {
      criteria.push({
        name: 'Electrical Consumption Data',
        category: 'Load',
        status: 'insufficient' as const,
        message: 'Consumption profile incomplete. Enter monthly bills or kWh in Load Analysis.'
      })
    }

    // 5. System sizing & Inverter
    if (proj.systemSizing.systemDcCapacityKwp > 0) {
      if (proj.systemSizing.inverterCompatibility === 'Compatible') {
        criteria.push({
          name: 'Inverter Compatibility (DC/AC)',
          category: 'Equipment',
          status: 'pass' as const,
          message: `DC/AC ratio (${proj.systemSizing.dcAcRatio.toFixed(2)}) is within manufacturer specifications.`
        })
      } else if (proj.systemSizing.inverterCompatibility === 'Requires Review') {
        criteria.push({
          name: 'Inverter Compatibility (DC/AC)',
          category: 'Equipment',
          status: 'warning' as const,
          message: `Inverter DC/AC ratio (${proj.systemSizing.dcAcRatio.toFixed(2)}) requires engineering review.`
        })
      } else {
        criteria.push({
          name: 'Inverter Compatibility',
          category: 'Equipment',
          status: 'fail' as const,
          message: 'Selected inverter is incompatible with the planned DC capacity.'
        })
      }
    } else {
      criteria.push({
        name: 'PV System Sizing',
        category: 'Equipment',
        status: 'insufficient' as const,
        message: 'No solar panel count or module selected.'
      })
    }

    // Compute overall score
    const hasFail = criteria.some(c => c.status === 'fail')
    const insufficientCount = criteria.filter(c => c.status === 'insufficient').length
    const warningCount = criteria.filter(c => c.status === 'warning').length
    const passCount = criteria.filter(c => c.status === 'pass').length

    let overallResult: FeasibilityData['overallResult'] = 'Insufficient Data'
    let summary = ''

    if (hasFail) {
      overallResult = 'Limited Suitability'
      summary = 'System design has critical equipment incompatibility or geometric constraints.'
    } else if (insufficientCount > 2) {
      overallResult = 'Insufficient Data'
      summary = 'Multiple engineering workflow stages are incomplete. Complete Site Assessment, Roof Verification, and Load Analysis.'
    } else if (insufficientCount > 0 || warningCount > 0) {
      overallResult = 'Requires Review'
      summary = 'Preliminary design is viable but requires installer field verification of highlighted parameters.'
    } else if (passCount >= 4) {
      overallResult = 'Suitable'
      summary = 'Site, roof geometry, solar potential, and equipment sizing meet technical engineering feasibility criteria.'
    }

    proj.feasibility = {
      ...proj.feasibility,
      overallResult,
      criteria,
      summary
    }

    saveProjects()
  }

  // Equipment CRUD
  function addEquipment(item: Omit<EquipmentItem, 'id'>): EquipmentItem {
    const newItem: EquipmentItem = {
      id: `eq-custom-${Date.now()}`,
      ...item
    }
    equipment.value.unshift(newItem)
    saveEquipment()
    return newItem
  }

  function updateEquipment(id: string, updates: Partial<EquipmentItem>) {
    const idx = equipment.value.findIndex(e => e.id === id)
    if (idx !== -1 && equipment.value[idx]) {
      equipment.value[idx] = { ...equipment.value[idx], ...updates }
      saveEquipment()
    }
  }

  function deleteEquipment(id: string) {
    equipment.value = equipment.value.filter(e => e.id !== id)
    saveEquipment()
  }

  // Dashboard Stats Computed
  const dashboardStats = computed(() => {
    const totalProjects = projects.value.length
    const activeProjects = projects.value.filter(p => p.status !== 'Completed').length
    const pendingAssessments = projects.value.filter(
      p => p.status === 'Draft' || p.status === 'Site Assessment' || !p.latitude
    ).length
    const roofsAwaitingVerification = projects.value.filter(
      p => p.roofVerification.status !== 'Verified'
    ).length
    const solarCompleted = projects.value.filter(
      p => p.solarAnalysis.status === 'Completed' || (p.solarAnalysis.estimatedAnnualProductionKwh && p.solarAnalysis.estimatedAnnualProductionKwh > 0)
    ).length
    const loadCompleted = projects.value.filter(
      p => p.loadAnalysis.annualKwh > 0
    ).length
    const requiringReview = projects.value.filter(
      p => p.feasibility.overallResult === 'Requires Review' || p.status === 'Feasibility Review'
    ).length
    const reportsReady = projects.value.filter(
      p => p.status === 'Report Ready' || p.status === 'Completed' || p.feasibility.installerSignoff
    ).length

    return {
      totalProjects,
      activeProjects,
      pendingAssessments,
      roofsAwaitingVerification,
      solarCompleted,
      loadCompleted,
      requiringReview,
      reportsReady,
      totalClients: clients.value.length
    }
  })

  return {
    clients,
    projects,
    activeProjectId,
    activeProject,
    equipment,
    settings,
    dashboardStats,
    setActiveProject,
    addClient,
    updateClient,
    deleteClient,
    getClient,
    addProject,
    updateProject,
    deleteProject,
    recalculateProjectFeasibility,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    saveSettings
  }
}

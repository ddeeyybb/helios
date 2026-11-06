import {
  SOLAR_PANEL_BRANDS,
  getSolarPanelBrands,
  getPanelModelsByBrand,
  findPanelModel,
  type SolarPanelSpecification
} from '../app/data/solar-panels'
import type { PlacedSolarPanel } from '../types/roof'

console.log('--- TEST 1: Available Brands ---')
const brands = getSolarPanelBrands().map(b => b.name)
console.log('Brands found:', brands)
if (!brands.includes('Trina Solar') || !brands.includes('Canadian Solar') || !brands.includes('Jinko Solar')) {
  throw new Error('Required brands missing from catalog!')
}
console.log('✓ All 3 required manufacturers present: Trina Solar, Canadian Solar, Jinko Solar')

console.log('\n--- TEST 2: Brand Models & Datasheet Specs ---')
for (const brand of brands) {
  const models = getPanelModelsByBrand(brand)
  console.log(`[${brand}] has ${models.length} configured models:`)
  for (const m of models) {
    console.log(`  - ${m.modelName}: ${m.ratedPowerW}W, ${m.widthM}m x ${m.heightM}m x ${m.thicknessM}m, Eff: ${m.efficiencyPercent}%`)
    if (!m.ratedPowerW || !m.widthM || !m.heightM || !m.thicknessM) {
      throw new Error(`Incomplete specifications for ${m.modelName}`)
    }
  }
}
console.log('✓ All models have non-zero authentic physical specifications')

console.log('\n--- TEST 3: Dynamic 3D Dimensions Check ---')
const trinaModel = findPanelModel('Trina Solar', 'Vertex S+ TSM-NEG9R.28 440W')
if (!trinaModel) throw new Error('Trina Solar 440W model missing!')
console.log('Trina 440W Dimensions:', {
  width: trinaModel.widthM,
  height: trinaModel.heightM,
  thickness: trinaModel.thicknessM
})
if (trinaModel.widthM !== 1.134 || trinaModel.heightM !== 1.762 || trinaModel.thicknessM !== 0.030) {
  throw new Error('Trina 440W physical dimensions mismatch!')
}

const jinkoModel = findPanelModel('Jinko Solar', 'Tiger Neo 72HL4-BDV 575W')
if (!jinkoModel) throw new Error('Jinko Solar 575W model missing!')
console.log('Jinko 575W Dimensions:', {
  width: jinkoModel.widthM,
  height: jinkoModel.heightM,
  thickness: jinkoModel.thicknessM
})
if (jinkoModel.widthM !== 1.134 || jinkoModel.heightM !== 2.278 || jinkoModel.thicknessM !== 0.030) {
  throw new Error('Jinko 575W physical dimensions mismatch!')
}
console.log('✓ Different brands use actual distinct physical dimensions (not a generic size)')

console.log('\n--- TEST 4: Multiple Panel Brands & DC Capacity Calculation ---')
// Simulate placing 8 Trina Solar (440W) and 4 Jinko Solar (575W)
const placedPanels: PlacedSolarPanel[] = []

for (let i = 1; i <= 8; i++) {
  placedPanels.push({
    id: `PV-${String(i).padStart(3, '0')}`,
    x: i * 1.2,
    y: 3.5,
    z: 2.0,
    widthM: trinaModel.widthM,
    lengthM: trinaModel.heightM,
    thicknessM: trinaModel.thicknessM,
    rotationY: 0,
    wattageW: trinaModel.ratedPowerW,
    manufacturer: trinaModel.manufacturer,
    modelName: trinaModel.modelName,
    efficiencyPercent: trinaModel.efficiencyPercent,
    status: 'VALID'
  })
}

for (let i = 9; i <= 12; i++) {
  placedPanels.push({
    id: `PV-${String(i).padStart(3, '0')}`,
    x: i * 1.2,
    y: 3.5,
    z: 5.0,
    widthM: jinkoModel.widthM,
    lengthM: jinkoModel.heightM,
    thicknessM: jinkoModel.thicknessM,
    rotationY: 0,
    wattageW: jinkoModel.ratedPowerW,
    manufacturer: jinkoModel.manufacturer,
    modelName: jinkoModel.modelName,
    efficiencyPercent: jinkoModel.efficiencyPercent,
    status: 'VALID'
  })
}

// Brand breakdown logic
const brandBreakdown: Record<string, number> = {}
for (const p of placedPanels) {
  const brand = p.manufacturer || 'Generic / Unspecified'
  brandBreakdown[brand] = (brandBreakdown[brand] || 0) + 1
}

console.log('Brand breakdown:', brandBreakdown)
if (brandBreakdown['Trina Solar'] !== 8 || brandBreakdown['Jinko Solar'] !== 4) {
  throw new Error(`Breakdown mismatch: expected 8 Trina Solar and 4 Jinko Solar, got ${JSON.stringify(brandBreakdown)}`)
}

// Dynamic DC capacity summation
const totalWatts = placedPanels.reduce((sum, p) => sum + (p.wattageW || 550), 0)
const totalKwp = Number((totalWatts / 1000).toFixed(2))
console.log(`Total DC Watts: ${totalWatts} W = ${totalKwp} kWp`)

// Expected: (8 * 440) + (4 * 575) = 3520 + 2300 = 5820 W = 5.82 kWp
if (totalKwp !== 5.82) {
  throw new Error(`Capacity calculation mismatch: expected 5.82 kWp, got ${totalKwp} kWp`)
}
console.log('✓ Total DC Capacity matches exact formula: (8 × 440 W) + (4 × 575 W) = 5.82 kWp')

console.log('\n--- TEST 5: Fallback Handling for Unconfigured / Missing Info ---')
const nonExistent = findPanelModel('Unknown Brand', 'Unknown Model')
console.log('Unknown model lookup:', nonExistent)
if (nonExistent !== undefined) {
  throw new Error('Lookup of unknown model should return undefined')
}
console.log('✓ Returns undefined cleanly so UI falls back to "Not configured" instead of fake values')

console.log('\n========================================')
console.log('ALL SOLAR PANEL SELECTION TESTS PASSED!')
console.log('========================================')

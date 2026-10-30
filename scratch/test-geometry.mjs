import { buildExactRoofGeometry } from '../app/utils/roof-mesh-generator.ts'
import { placeSolarPanelsInsideRoof, validateIndividualPanel } from '../app/utils/panel-placement.ts'

console.log('=== HELIOS-LOAD Geometry & Solar Layout Validation ===')

const centerLat = 6.7497
const centerLng = 125.3572

// TEST 1: Rectangular Roof
console.log('\n--- Test 1: Rectangular Roof ---')
const rectCoords = [
  { lat: 6.7496, lng: 125.3571 },
  { lat: 6.7496, lng: 125.3573 },
  { lat: 6.7498, lng: 125.3573 },
  { lat: 6.7498, lng: 125.3571 }
]
const rectGeo = buildExactRoofGeometry(rectCoords, centerLat, centerLng, {
  pitchDegrees: 15,
  azimuthDegrees: 180,
  eaveHeightM: 3.5,
  roofThicknessM: 0.15,
  roofType: 'Gable'
})
console.log('Rect Footprint Area:', rectGeo.footprintAreaM2, 'm²')
console.log('Rect Triangulated Vertices:', rectGeo.vertices.length, 'Indices:', rectGeo.indices.length)

const rectPanels = placeSolarPanelsInsideRoof(
  rectGeo.topSurfaceVertices.map(v => ({ x: v.x, z: v.z })),
  [],
  {
    panelWidthM: 1.134,
    panelLengthM: 2.278,
    panelWattageW: 550,
    setbackM: 0.5,
    panelSpacingM: 0.05,
    orientation: 'portrait',
    pitchDegrees: 15,
    azimuthDegrees: 180,
    eaveHeightM: 3.5
  }
)
console.log('Rect Fitted Panels:', rectPanels.totalFittedPanels, 'modules | DC Capacity:', rectPanels.systemCapacityKwp, 'kWp')

// TEST 2: L-Shaped Concave Roof
console.log('\n--- Test 2: L-Shaped Concave Roof ---')
const lCoords = [
  { lat: 6.7496, lng: 125.3571 },
  { lat: 6.7496, lng: 125.3574 },
  { lat: 6.74975, lng: 125.3574 },
  { lat: 6.74975, lng: 125.35725 },
  { lat: 6.7499, lng: 125.35725 },
  { lat: 6.7499, lng: 125.3571 }
]
const lGeo = buildExactRoofGeometry(lCoords, centerLat, centerLng, {
  pitchDegrees: 15,
  azimuthDegrees: 180,
  eaveHeightM: 3.5,
  roofThicknessM: 0.15,
  roofType: 'Custom'
})
console.log('L-Shape Footprint Area:', lGeo.footprintAreaM2, 'm²')
console.log('L-Shape Vertices:', lGeo.vertices.length, 'Indices:', lGeo.indices.length)

const lPanels = placeSolarPanelsInsideRoof(
  lGeo.topSurfaceVertices.map(v => ({ x: v.x, z: v.z })),
  [],
  {
    panelWidthM: 1.134,
    panelLengthM: 2.278,
    panelWattageW: 550,
    setbackM: 0.5,
    panelSpacingM: 0.05,
    orientation: 'portrait',
    pitchDegrees: 15,
    azimuthDegrees: 180,
    eaveHeightM: 3.5
  }
)
console.log('L-Shape Fitted Panels:', lPanels.totalFittedPanels, 'modules | DC Capacity:', lPanels.systemCapacityKwp, 'kWp')

// TEST 3: Triangular Roof
console.log('\n--- Test 3: Triangular Roof ---')
const triCoords = [
  { lat: 6.7496, lng: 125.3571 },
  { lat: 6.7496, lng: 125.3574 },
  { lat: 6.74985, lng: 125.35725 }
]
const triGeo = buildExactRoofGeometry(triCoords, centerLat, centerLng, {
  pitchDegrees: 15,
  azimuthDegrees: 180,
  eaveHeightM: 3.5,
  roofThicknessM: 0.15,
  roofType: 'Single Slope'
})
console.log('Triangle Footprint Area:', triGeo.footprintAreaM2, 'm²')

const triPanels = placeSolarPanelsInsideRoof(
  triGeo.topSurfaceVertices.map(v => ({ x: v.x, z: v.z })),
  [],
  {
    panelWidthM: 1.134,
    panelLengthM: 2.278,
    panelWattageW: 550,
    setbackM: 0.5,
    panelSpacingM: 0.05,
    orientation: 'portrait',
    pitchDegrees: 15,
    azimuthDegrees: 180,
    eaveHeightM: 3.5
  }
)
console.log('Triangle Fitted Panels:', triPanels.totalFittedPanels, 'modules | DC Capacity:', triPanels.systemCapacityKwp, 'kWp')

// TEST 4: Panel with Obstruction and Shadow Exclusion
console.log('\n--- Test 4: Obstruction & Shadow Exclusion ---')
const obsList = [
  {
    id: 'TREE-1',
    type: 'Tree',
    position: { x: 0, y: 0, z: 0 },
    heightM: 5,
    canopyRadiusM: 2.5,
    widthM: 5,
    lengthM: 5
  }
]
const shadowExclusion = [
  {
    points: [
      { x: -1, z: -1 },
      { x: 3, z: -1 },
      { x: 3, z: 3 },
      { x: -1, z: 3 }
    ]
  }
]
const panelsWithExclusion = placeSolarPanelsInsideRoof(
  rectGeo.topSurfaceVertices.map(v => ({ x: v.x, z: v.z })),
  obsList,
  {
    panelWidthM: 1.134,
    panelLengthM: 2.278,
    panelWattageW: 550,
    setbackM: 0.5,
    panelSpacingM: 0.05,
    orientation: 'portrait',
    pitchDegrees: 15,
    azimuthDegrees: 180,
    eaveHeightM: 3.5
  },
  shadowExclusion,
  true
)
console.log('Panels with Obstruction & Shadow Exclusion:', panelsWithExclusion.totalFittedPanels, 'modules (reduced from', rectPanels.totalFittedPanels, ')')

if (panelsWithExclusion.totalFittedPanels < rectPanels.totalFittedPanels) {
  console.log('✓ PASS: Shadow & obstruction exclusion accurately reduced panels')
} else {
  console.error('FAIL: Exclusion did not reduce panel count')
}

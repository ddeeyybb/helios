// Test Solar Design Editor Save and Load via Nuxt dev server API
const BASE_URL = 'http://localhost:3000'

async function runTest() {
  console.log('--- Testing HELIOS-LOAD Solar Design Editor API ---')

  const testProjectId = `test-editor-${Date.now()}`
  
  // 1. Initial State: 0 trees, 0 obstructions, 0 panels
  const initialRoofModel = {
    id: `roof-${Date.now()}`,
    projectId: testProjectId,
    buildingId: `bld-${Date.now()}`,
    source: 'Installer Verified',
    status: 'INSTALLER_VERIFIED',
    origin: {
      latitude: 6.7497,
      longitude: 125.3572,
      elevation: 3.5
    },
    roofSegments: [
      {
        id: 'seg-1',
        segmentIndex: 0,
        pitchDegrees: 15,
        azimuthDegrees: 180,
        areaM2: 240.5,
        areaMeters2: 240.5,
        vertices: [
          { x: -10, y: 3.5, z: -6 },
          { x: 10, y: 3.5, z: -6 },
          { x: 10, y: 3.5, z: 6 },
          { x: -10, y: 3.5, z: 6 }
        ],
        indices: [0, 1, 2, 0, 2, 3],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        source: 'Installer Verified',
        verificationStatus: 'Verified',
        center: { x: 0, y: 3.5, z: 0, latitude: 6.7497, longitude: 125.3572 }
      }
    ],
    segments: [],
    obstacles: [], // 0 TREES, 0 OBSTRUCTIONS
    panels: [],    // 0 PANELS
    geometry: {
      vertices: [],
      faces: [],
      segments: [],
      ridges: [],
      valleys: [],
      eaves: [],
      bounds: { minX: -10, maxX: 10, minY: 0, maxY: 3.5, minZ: -6, maxZ: 6 }
    },
    verification: {
      status: 'Verified',
      confidence: 'INSTALLER VERIFIED',
      verifiedBy: 'Lead PV System Designer',
      verifiedDate: '2026-10-15',
      notes: 'Initial clean assessment with 0 default objects.'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  // Save Initial Model
  console.log('1. Saving initial empty model with 0 trees, 0 obstructions...')
  const postRes = await fetch(`${BASE_URL}/api/roofs/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_verified',
      model: initialRoofModel,
      verificationNotes: 'Verified clean roof'
    })
  })
  const postJson = await postRes.json()
  console.log('Save response status:', postRes.status, 'success:', postJson.success)

  // Load Model
  console.log('2. Loading model from server...')
  const getRes = await fetch(`${BASE_URL}/api/roofs/model?projectId=${testProjectId}`)
  const getJson = await getRes.json()
  console.log('Get response status:', getRes.status, 'data found:', !!getJson.data)
  
  const loadedModel = getJson.data
  console.log('Loaded Obstacles Count:', loadedModel.obstacles?.length ?? 0)
  console.log('Loaded Panels Count:', loadedModel.panels?.length ?? 0)
  if (loadedModel.obstacles?.length === 0 && loadedModel.panels?.length === 0) {
    console.log('✓ TEST CASE 1 & 12 PASS: Exact 0 trees, 0 obstructions, 0 panels on clean project!')
  } else {
    console.error('FAIL: Unexpected objects loaded!', loadedModel.obstacles)
  }

  // 3. Add 2 Trees, 1 Chimney, and 24 Panels (Simulating Editor Actions)
  console.log('3. Simulating Editor adding 2 trees, 1 chimney, and 24 panels...')
  loadedModel.obstacles = [
    {
      id: 'TREE-001',
      type: 'Tree',
      heightM: 6.0,
      canopyRadiusM: 2.5,
      trunkRadiusM: 0.2,
      widthM: 5.0,
      lengthM: 5.0,
      position: { x: -5, y: 0, z: -8 }
    },
    {
      id: 'TREE-002',
      type: 'Tree',
      heightM: 4.5,
      canopyRadiusM: 1.8,
      trunkRadiusM: 0.15,
      widthM: 3.6,
      lengthM: 3.6,
      position: { x: 7, y: 0, z: -7 }
    },
    {
      id: 'OBS-001',
      type: 'Chimney',
      heightM: 1.2,
      widthM: 0.8,
      lengthM: 0.8,
      position: { x: 2, y: 3.5, z: 1 }
    }
  ]
  loadedModel.panels = Array.from({ length: 24 }).map((_, i) => ({
    id: `PV-${String(i + 1).padStart(3, '0')}`,
    x: -8 + (i % 6) * 2.5,
    y: 3.6,
    z: -3 + Math.floor(i / 6) * 1.5,
    widthM: 1.134,
    lengthM: 2.278,
    rotationY: 0,
    tiltPitchDeg: 15,
    wattageW: 550,
    status: 'VALID'
  }))

  const updateRes = await fetch(`${BASE_URL}/api/roofs/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_verified',
      model: loadedModel,
      verificationNotes: 'Updated with 2 trees, 1 chimney, 24 panels'
    })
  })
  const updateJson = await updateRes.json()
  console.log('Update status:', updateRes.status, 'success:', updateJson.success)

  // 4. Reload to verify exact persistence
  console.log('4. Reloading design to verify exact persistence...')
  const reloadRes = await fetch(`${BASE_URL}/api/roofs/model?projectId=${testProjectId}`)
  const reloadJson = await reloadRes.json()
  const reloaded = reloadJson.data

  console.log('Reloaded Trees:', reloaded.obstacles.filter(o => o.type === 'Tree').length)
  console.log('Reloaded Obstacles:', reloaded.obstacles.filter(o => o.type !== 'Tree').length)
  console.log('Reloaded Panels:', reloaded.panels.length)

  if (
    reloaded.obstacles.filter(o => o.type === 'Tree').length === 2 &&
    reloaded.obstacles.filter(o => o.type !== 'Tree').length === 1 &&
    reloaded.panels.length === 24
  ) {
    console.log('✓ TEST CASE 11 PASS: Exactly 2 trees, 1 chimney, 24 panels persisted!')
  } else {
    console.error('FAIL: Objects mismatch on reload!')
  }
}

runTest().catch(console.error)

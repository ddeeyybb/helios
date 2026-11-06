<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useSiteAssessment } from '~/composables/useSiteAssessment'
import { useGoogleMaps } from '~/composables/useGoogleMaps'
import { DIGOS_BOUNDS, DIGOS_CITY_CENTER, isInsideDigos } from '~/data/sampleProperties'
import {
  orderRoofPolygonVertices,
  SELF_INTERSECTION_ERROR_MESSAGE,
  type PolygonCrossingInfo
} from '~/utils/roof-polygon-order'

const {
  selectedProperty,
  selectCoordinates,
  isDrawingRoof,
  drawnRoofPoints,
  roofBoundaryDrawn,
  roofAreaSqM,
  activeRoofModel,
  boundaryValidationMessage,
  boundaryCrossings,
  isBoundarySelfIntersecting,
  recordDragStartSnapshot,
  addRoofPoint,
  updateRoofPoint,
  undoLastRoofPoint,
  finishRoof,
  clearRoof,
  recalculateAll,
  placedPanels,
  setbackPolygonPoints,
  obstructions,
  rooftopFeatures,
  shadingAssessment,
  setbackM,
  centerOnDigosTrigger,
  // Manual Roof Boundary & Editing Workflow
  roofAssessmentState,
  roofDrawingMode,
  pointHistory,
  pointRedoHistory,
  selectedVertexIndex,
  startManualDrawRoof,
  enterEditPointsMode,
  toggleAddPointMode,
  undoRoofPointEdit,
  redoRoofPointEdit,
  insertRoofPointAt,
  deleteRoofPointAt,
  confirmRoofAssessment,
  recalculateAreaFromPoints
} = useSiteAssessment()

const {
  mapStatus,
  errorMessage,
  hasApiKey,
  initGoogleMaps,
  retry,
  reverseGeocode,
  geocodeAddress
} = useGoogleMaps()

const mapContainer = ref<HTMLDivElement | null>(null)
const mapWrapper = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)
const activeMapType = ref<'satellite' | 'hybrid' | 'roadmap' | 'terrain'>('satellite')
const currentZoom = ref(19)
const availableMaxZoom = ref(20)
const isDetectingMaxZoom = ref(false)
const maxZoomDetectionStatus = ref<'DETECTED' | 'DETECTING' | 'UNAVAILABLE'>('DETECTING')
const cursorCoordinates = ref<{ lat: number; lng: number } | null>(null)
const mousePixelPos = ref<{ x: number; y: number } | null>(null)

const displayCoordinates = computed(() => {
  if (cursorCoordinates.value) {
    return `${cursorCoordinates.value.lat.toFixed(6)}°, ${cursorCoordinates.value.lng.toFixed(6)}°`
  }
  if (googleMap) {
    const c = googleMap.getCenter()
    if (c) return `${c.lat().toFixed(6)}°, ${c.lng().toFixed(6)}°`
  }
  if (selectedProperty.value) {
    return `${selectedProperty.value.latitude.toFixed(6)}°, ${selectedProperty.value.longitude.toFixed(6)}°`
  }
  return `${DIGOS_CITY_CENTER.latitude.toFixed(6)}°, ${DIGOS_CITY_CENTER.longitude.toFixed(6)}°`
})
const outsideDigosAlert = ref(false)
const drawingFeedback = ref('')
const showRedrawConfirmModal = ref(false)

// Fallback manual inputs
const manualLatInput = ref(selectedProperty.value?.latitude.toString() || '6.7497')
const manualLngInput = ref(selectedProperty.value?.longitude.toString() || '125.3572')
const manualAddressInput = ref(selectedProperty.value?.address || '')
const manualInputFeedback = ref('')

// Non-reactive references to Google Maps objects
let googleMap: google.maps.Map | null = null
let edgeGuidePolyline: google.maps.Polyline | null = null

// Custom Manual Roof Drawing Objects
let activePolygon: google.maps.Polygon | null = null
let activePolyline: google.maps.Polyline | null = null
let vertexMarkers: google.maps.Marker[] = []
let polygonPathListeners: google.maps.MapsEventListener[] = []
let crossingWarningPolylines: google.maps.Polyline[] = []
let crossingWarningMarkers: google.maps.Marker[] = []
let activeDraggingMarkerIdx: number | null = null

// Visual Layer Overlays on Map
let setbackPolygonOverlay: google.maps.Polygon | null = null
let placedPanelOverlays: google.maps.Polygon[] = []
let obstructionMarkers: google.maps.Marker[] = []
let obstructionCircles: google.maps.Circle[] = []
let rooftopFeatureMarkers: google.maps.Marker[] = []
let shadowPolygonOverlays: google.maps.Polygon[] = []

const DEFAULT_CENTER = {
  lat: 6.7497,
  lng: 125.3572
}
const DEFAULT_ZOOM = 14



// ==========================================
// ROOF DRAWING ENGINE (ANY POLYGON SHAPE - CAD/GIS PRECISION)
// ==========================================

export interface MaximumSatelliteZoomResult {
  status: 'OK' | 'ERROR'
  zoom: number
  source: 'google-service' | 'fallback'
}

let maxZoomServiceInstance: google.maps.MaxZoomService | null = null
let lastQueriedLocation: { lat: number; lng: number } | null = null
let idleDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Requirement 1 & 5: Dynamic Maximum Satellite Zoom Helper using Google's MaxZoomService
async function getMaximumSatelliteZoom(
  latLng: google.maps.LatLng | { lat: number; lng: number }
): Promise<MaximumSatelliteZoomResult> {
  const currentFallback = (googleMap && typeof googleMap.getZoom === 'function' ? googleMap.getZoom() : 20) || 20
  const safeFallback = Math.max(14, Math.min(22, Math.round(currentFallback)))

  if (!window.google?.maps) {
    return { status: 'ERROR', zoom: safeFallback, source: 'fallback' }
  }

  return new Promise((resolve) => {
    try {
      if (!maxZoomServiceInstance) {
        if (window.google.maps.MaxZoomService) {
          maxZoomServiceInstance = new window.google.maps.MaxZoomService()
        }
      }

      if (!maxZoomServiceInstance) {
        resolve({ status: 'ERROR', zoom: safeFallback, source: 'fallback' })
        return
      }

      const pos = latLng instanceof google.maps.LatLng
        ? latLng
        : new google.maps.LatLng(latLng.lat, latLng.lng)

      maxZoomServiceInstance.getMaxZoomAtLatLng(pos, (result: google.maps.MaxZoomResult | null) => {
        if (
          result &&
          (result.status === google.maps.MaxZoomStatus?.OK || (result.status as string) === 'OK') &&
          typeof result.zoom === 'number' &&
          Number.isFinite(result.zoom) &&
          !Number.isNaN(result.zoom)
        ) {
          // Dynamic maximum supported satellite zoom for this specific LatLng directly reported by Google
          const validZoom = Math.max(14, Math.min(24, Math.round(result.zoom)))
          resolve({ status: 'OK', zoom: validZoom, source: 'google-service' })
        } else {
          resolve({ status: 'ERROR', zoom: safeFallback, source: 'fallback' })
        }
      })
    } catch {
      resolve({ status: 'ERROR', zoom: safeFallback, source: 'fallback' })
    }
  })
}

// Unified query and update max zoom function
async function queryAndUpdateMaxZoom(
  targetPos: google.maps.LatLng | { lat: number; lng: number }
): Promise<MaximumSatelliteZoomResult> {
  isDetectingMaxZoom.value = true
  maxZoomDetectionStatus.value = 'DETECTING'

  const result = await getMaximumSatelliteZoom(targetPos)

  isDetectingMaxZoom.value = false
  if (result.status === 'OK') {
    availableMaxZoom.value = result.zoom
    maxZoomDetectionStatus.value = 'DETECTED'
    if (googleMap) {
      googleMap.setOptions({ maxZoom: result.zoom })
    }
  } else {
    availableMaxZoom.value = result.zoom
    maxZoomDetectionStatus.value = 'UNAVAILABLE'
    if (googleMap) {
      googleMap.setOptions({ maxZoom: result.zoom })
    }
  }
  return result
}

// Location-aware map idle handler (Requirement 9: debounced & throttled)
function handleMapIdle() {
  if (!googleMap) return
  if (idleDebounceTimer) {
    clearTimeout(idleDebounceTimer)
  }

  idleDebounceTimer = setTimeout(async () => {
    if (!googleMap) return
    const center = googleMap.getCenter()
    if (!center) return

    const lat = center.lat()
    const lng = center.lng()

    // Avoid redundant queries if moved less than ~150 meters unless not yet successfully detected
    if (lastQueriedLocation && maxZoomDetectionStatus.value === 'DETECTED') {
      const dLat = Math.abs(lat - lastQueriedLocation.lat)
      const dLng = Math.abs(lng - lastQueriedLocation.lng)
      if (dLat < 0.0015 && dLng < 0.0015) {
        return
      }
    }

    lastQueriedLocation = { lat, lng }
    await queryAndUpdateMaxZoom({ lat, lng })
  }, 600)
}

// Backward-compatible alias
async function getAvailableSatelliteMaxZoom(latLng: google.maps.LatLng | { lat: number; lng: number }): Promise<number> {
  const res = await queryAndUpdateMaxZoom(latLng)
  return res.zoom
}

// Helper to get centroid of current roof polygon, property location, or map center
function getRoofOrCurrentCenter(): google.maps.LatLng | { lat: number; lng: number } {
  if (drawnRoofPoints.value.length > 0) {
    const sumLat = drawnRoofPoints.value.reduce((acc, p) => acc + p.lat, 0)
    const sumLng = drawnRoofPoints.value.reduce((acc, p) => acc + p.lng, 0)
    return {
      lat: sumLat / drawnRoofPoints.value.length,
      lng: sumLng / drawnRoofPoints.value.length
    }
  }
  if (googleMap) {
    const c = googleMap.getCenter()
    if (c) return { lat: c.lat(), lng: c.lng() }
  }
  if (selectedProperty.value && isInsideDigos(selectedProperty.value.latitude, selectedProperty.value.longitude)) {
    return {
      lat: selectedProperty.value.latitude,
      lng: selectedProperty.value.longitude
    }
  }
  return DEFAULT_CENTER
}

// Requirement 2: MAX ZOOM button
async function handleTriggerMaxZoom() {
  if (!googleMap) return
  // 1. Get current map center
  const center = googleMap.getCenter()
  if (!center) return

  // 2, 3, 4. Query MaxZoomService, get actual available satellite maximum, set map maxZoom, update UI
  const result = await queryAndUpdateMaxZoom(center)

  // 5, 6, 7. Zoom directly to returned maximum while keeping center
  googleMap.panTo(center)
  googleMap.setZoom(result.zoom)
}

// Requirement 3: ROOF CLOSE-UP button
async function handleRoofCloseUp() {
  if (!googleMap || !window.google?.maps) return

  if (drawnRoofPoints.value.length >= 2) {
    // 1. Calculate roof bounds and centroid
    const bounds = new google.maps.LatLngBounds()
    drawnRoofPoints.value.forEach(pt => bounds.extend(new google.maps.LatLng(pt.lat, pt.lng)))
    const roofCenter = bounds.getCenter()

    // 2. Query real satellite maximum zoom
    const maxZ = await queryAndUpdateMaxZoom(roofCenter)

    // 3. Keep roof centered and zoom directly to maximum available satellite zoom
    googleMap.panTo(roofCenter)
    googleMap.setZoom(maxZ.zoom)
  } else {
    // If no roof polygon exists, use current map center as inspection point
    const center = googleMap.getCenter()
    if (!center) return

    const result = await queryAndUpdateMaxZoom(center)
    googleMap.panTo(center)
    googleMap.setZoom(result.zoom)
  }
}

function handleZoomToRoof() {
  handleRoofCloseUp()
}

async function zoomToSelectedProperty() {
  if (!googleMap) return
  if (selectedProperty.value && isInsideDigos(selectedProperty.value.latitude, selectedProperty.value.longitude)) {
    const pos = { lat: selectedProperty.value.latitude, lng: selectedProperty.value.longitude }
    const res = await queryAndUpdateMaxZoom(pos)
    googleMap.panTo(pos)
    googleMap.setZoom(res.zoom)
  } else {
    googleMap.panTo(DEFAULT_CENTER)
    googleMap.setZoom(DEFAULT_ZOOM)
  }
}

function handleCenterOnProperty() {
  zoomToSelectedProperty()
}

let vertexInfoWindow: google.maps.InfoWindow | null = null

function distanceToSegment(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const x = p.lng, y = p.lat
  const x1 = a.lng, y1 = a.lat
  const x2 = b.lng, y2 = b.lat
  const dx = x2 - x1, dy = y2 - y1
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1)
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(x - projX, y - projY)
}

function projectPointOnSegment(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): { lat: number; lng: number } {
  const x = p.lng, y = p.lat
  const x1 = a.lng, y1 = a.lat
  const x2 = b.lng, y2 = b.lat
  const dx = x2 - x1, dy = y2 - y1
  if (dx === 0 && dy === 0) return { lat: a.lat, lng: a.lng }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return {
    lat: y1 + t * dy,
    lng: x1 + t * dx
  }
}

function updateEdgeGuidePreview(latLng: google.maps.LatLng) {
  if (!googleMap || !window.google?.maps?.geometry?.spherical || drawnRoofPoints.value.length < 2) {
    if (edgeGuidePolyline) edgeGuidePolyline.setMap(null)
    return
  }

  const p = { lat: latLng.lat(), lng: latLng.lng() }
  let closestProj: { lat: number; lng: number } | null = null
  let minDistanceM = Infinity

  const pts = drawnRoofPoints.value.length >= 3
    ? orderRoofPolygonVertices(drawnRoofPoints.value).points
    : drawnRoofPoints.value
  const numEdges = pts.length >= 3 ? pts.length : pts.length - 1
  for (let i = 0; i < numEdges; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (!a || !b) continue
    const proj = projectPointOnSegment(p, a, b)
    const distM = google.maps.geometry.spherical.computeDistanceBetween(latLng, new google.maps.LatLng(proj.lat, proj.lng))
    if (distM < minDistanceM) {
      minDistanceM = distM
      closestProj = proj
    }
  }

  // Subtle guideline appears if within ~3.0 meters of an edge (visual assistance only, no forced snapping)
  if (minDistanceM <= 3.0 && closestProj) {
    if (!edgeGuidePolyline) {
      edgeGuidePolyline = new google.maps.Polyline({
        map: googleMap,
        strokeColor: '#38bdf8',
        strokeOpacity: 0.85,
        strokeWeight: 1.5,
        clickable: false,
        zIndex: 10
      })
    } else {
      edgeGuidePolyline.setMap(googleMap)
    }
    edgeGuidePolyline.setPath([
      latLng,
      new google.maps.LatLng(closestProj.lat, closestProj.lng)
    ])
  } else if (edgeGuidePolyline) {
    edgeGuidePolyline.setMap(null)
  }
}

function findBestEdgeInsertIndex(latLng: { lat: number; lng: number }, points: Array<{ lat: number; lng: number }>): number {
  if (points.length < 2) return points.length
  let bestIdx = points.length
  let minDistance = Infinity
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (!a || !b) continue
    const d = distanceToSegment(latLng, a, b)
    if (d < minDistance) {
      minDistance = d
      bestIdx = i + 1
    }
  }
  return bestIdx
}

function clearCrossingHighlights() {
  crossingWarningPolylines.forEach(p => p.setMap(null))
  crossingWarningPolylines = []
  crossingWarningMarkers.forEach(m => m.setMap(null))
  crossingWarningMarkers = []
}

function renderCrossingHighlights(
  points: Array<{ lat: number; lng: number }>,
  crossings: PolygonCrossingInfo[]
) {
  clearCrossingHighlights()
  if (!googleMap || !window.google?.maps || crossings.length === 0) return

  const highlightedEdges = new Set<string>()
  for (const crossing of crossings) {
    const edges: Array<[number, number]> = [crossing.edgeA, crossing.edgeB]
    for (const [iA, iB] of edges) {
      const key = iA < iB ? `${iA}-${iB}` : `${iB}-${iA}`
      if (highlightedEdges.has(key)) continue
      highlightedEdges.add(key)

      const ptA = points[iA]
      const ptB = points[iB]
      if (!ptA || !ptB) continue

      const line = new google.maps.Polyline({
        path: [
          new google.maps.LatLng(ptA.lat, ptA.lng),
          new google.maps.LatLng(ptB.lat, ptB.lng)
        ],
        map: googleMap,
        strokeColor: '#ef4444',
        strokeOpacity: 1,
        strokeWeight: 4,
        clickable: false,
        zIndex: 25
      })
      crossingWarningPolylines.push(line)
    }

    const marker = new google.maps.Marker({
      position: new google.maps.LatLng(crossing.intersection.lat, crossing.intersection.lng),
      map: googleMap,
      clickable: false,
      title: SELF_INTERSECTION_ERROR_MESSAGE,
      zIndex: 30,
      label: {
        text: '!',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: 'bold'
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: '#dc2626',
        fillOpacity: 1,
        strokeColor: '#fef08a',
        strokeWeight: 2.5,
        labelOrigin: new google.maps.Point(0, 0),
        anchor: new google.maps.Point(0, 0)
      }
    })
    crossingWarningMarkers.push(marker)
  }
}

function openVertexInfoWindow(idx: number, marker: google.maps.Marker) {
  if (!googleMap || !window.google?.maps) return
  const pt = drawnRoofPoints.value[idx]
  if (!pt) return

  selectedVertexIndex.value = idx
  const sourceLabel = 'Installer Added'
  const sourceBadgeColor = '#2563eb'

  const content = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 11px; padding: 4px; min-width: 175px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-weight: 800; color: #0f172a; font-size: 12px;">Roof Point #${idx + 1}</span>
        <span style="font-size: 9px; font-weight: 700; color: ${sourceBadgeColor}; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px;">
          ${sourceLabel}
        </span>
      </div>
      <div style="font-family: monospace; font-size: 10px; color: #334155; background: #f8fafc; padding: 4px 6px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
        Lat: ${pt.lat.toFixed(6)}° N<br/>
        Lng: ${pt.lng.toFixed(6)}° E
      </div>
      <button
        id="btn-del-pt-${idx}"
        style="width: 100%; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; font-size: 10px; font-weight: 700; padding: 5px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;"
      >
        🗑 Delete Vertex
      </button>
    </div>
  `

  if (!vertexInfoWindow) {
    vertexInfoWindow = new google.maps.InfoWindow({ content })
  } else {
    vertexInfoWindow.setContent(content)
  }
  vertexInfoWindow.open(googleMap, marker)

  google.maps.event.addListenerOnce(vertexInfoWindow, 'domready', () => {
    const btn = document.getElementById(`btn-del-pt-${idx}`)
    if (btn) {
      btn.onclick = () => {
        if (drawnRoofPoints.value.length <= 3) {
          alert('At least 3 roof points are required.')
          return
        }
        deleteRoofPointAt(idx)
        if (vertexInfoWindow) vertexInfoWindow.close()
        syncVertexMarkers()
        refreshPolygonFromPoints()
      }
    }
  })
}

function syncVertexMarkers() {
  if (!googleMap || !window.google?.maps) return
  if (activeDraggingMarkerIdx !== null) return

  // In CONFIRMED state, we hide interactive vertex markers unless editing
  if (roofAssessmentState.value === 'CONFIRMED' && !isDrawingRoof.value) {
    vertexMarkers.forEach(m => m.setMap(null))
    vertexMarkers = []
    return
  }

  const shouldBeVisible = isDrawingRoof.value ||
    roofAssessmentState.value === 'EDITING' ||
    roofDrawingMode.value === 'add-point'

  if (!shouldBeVisible || drawnRoofPoints.value.length === 0) {
    vertexMarkers.forEach(m => m.setMap(null))
    vertexMarkers = []
    return
  }

  // Clear any excess markers
  while (vertexMarkers.length > drawnRoofPoints.value.length) {
    const m = vertexMarkers.pop()
    if (m) m.setMap(null)
  }

  drawnRoofPoints.value.forEach((pt, idx) => {
    const pos = new google.maps.LatLng(pt.lat, pt.lng)
    let marker = vertexMarkers[idx]

    if (!marker) {
      const newMarker = new google.maps.Marker({
        position: pos,
        map: googleMap,
        draggable: true,
        cursor: 'grab'
      })
      ;(newMarker as any).__vertexIdx = idx

      const onDragStart = () => {
        const currentIdx = typeof (newMarker as any).__vertexIdx === 'number'
          ? (newMarker as any).__vertexIdx
          : idx
        activeDraggingMarkerIdx = currentIdx
        if (vertexInfoWindow) vertexInfoWindow.close()
        recordDragStartSnapshot()
      }

      const onDrag = () => {
        const p = newMarker.getPosition()
        if (!p) return
        const currentIdx = typeof (newMarker as any).__vertexIdx === 'number'
          ? (newMarker as any).__vertexIdx
          : idx
        updateRoofPoint(currentIdx, p.lat(), p.lng(), false)
        refreshPolygonFromPoints()
      }

      const onDragEnd = () => {
        const p = newMarker.getPosition()
        const currentIdx = typeof (newMarker as any).__vertexIdx === 'number'
          ? (newMarker as any).__vertexIdx
          : idx
        activeDraggingMarkerIdx = null
        if (!p) {
          syncVertexMarkers()
          return
        }
        updateRoofPoint(currentIdx, p.lat(), p.lng(), true)
        syncVertexMarkers()
        refreshPolygonFromPoints()
      }

      newMarker.addListener('dragstart', onDragStart)
      newMarker.addListener('drag', onDrag)
      newMarker.addListener('dragend', onDragEnd)

      newMarker.addListener('click', () => {
        const currentIdx = typeof (newMarker as any).__vertexIdx === 'number'
          ? (newMarker as any).__vertexIdx
          : idx
        selectedVertexIndex.value = currentIdx
        syncVertexMarkers()
        openVertexInfoWindow(currentIdx, newMarker)
      })

      vertexMarkers.push(newMarker)
      marker = newMarker
    } else {
      ;(marker as any).__vertexIdx = idx
      marker.setPosition(pos)
      marker.setMap(googleMap)
      marker.setDraggable(true)
    }

    const isLatest = idx === drawnRoofPoints.value.length - 1
    const isSelected = selectedVertexIndex.value === idx
    const ptColor = isBoundarySelfIntersecting.value
      ? '#dc2626'
      : isSelected
        ? '#f59e0b'
        : (isLatest && isDrawingRoof.value ? '#10b981' : '#2563eb')

    marker.setLabel({
      text: `${idx + 1}`,
      color: isSelected && !isBoundarySelfIntersecting.value ? '#000000' : '#ffffff',
      fontSize: isSelected ? '12px' : '11px',
      fontWeight: 'bold'
    })
    marker.setIcon({
      path: google.maps.SymbolPath.CIRCLE,
      scale: isSelected ? 15 : 12,
      fillColor: ptColor,
      fillOpacity: 0.95,
      strokeColor: isSelected ? '#fbbf24' : '#ffffff',
      strokeWeight: isSelected ? 3.5 : 2.5,
      labelOrigin: new google.maps.Point(0, 0),
      anchor: new google.maps.Point(0, 0)
    })
    marker.setTitle(`Vertex ${idx + 1} (${isSelected ? 'Selected' : 'Drag to move or click to inspect'})`)
  })
}

function handleDeleteSelectedVertex() {
  if (selectedVertexIndex.value === null) return
  if (drawnRoofPoints.value.length <= 3) {
    alert('At least 3 roof points are required.')
    return
  }
  const idx = selectedVertexIndex.value
  deleteRoofPointAt(idx)
  selectedVertexIndex.value = null
  if (vertexInfoWindow) vertexInfoWindow.close()
  syncVertexMarkers()
  refreshPolygonFromPoints()
}

function updateVertexMarkersAppearance() {
  syncVertexMarkers()
}

function clearMapDrawingObjects() {
  polygonPathListeners.forEach(l => l.remove())
  polygonPathListeners = []
  activeDraggingMarkerIdx = null

  if (activePolygon) {
    activePolygon.setMap(null)
    activePolygon = null
  }
  if (activePolyline) {
    activePolyline.setMap(null)
    activePolyline = null
  }
  vertexMarkers.forEach(m => m.setMap(null))
  vertexMarkers = []

  if (vertexInfoWindow) {
    vertexInfoWindow.close()
    vertexInfoWindow = null
  }

  if (edgeGuidePolyline) {
    edgeGuidePolyline.setMap(null)
    edgeGuidePolyline = null
  }

  clearCrossingHighlights()
  clearVisualOverlays()
}

function clearVisualOverlays() {
  if (setbackPolygonOverlay) {
    setbackPolygonOverlay.setMap(null)
    setbackPolygonOverlay = null
  }
  placedPanelOverlays.forEach(p => p.setMap(null))
  placedPanelOverlays = []

  obstructionMarkers.forEach(m => m.setMap(null))
  obstructionMarkers = []

  obstructionCircles.forEach(c => c.setMap(null))
  obstructionCircles = []

  rooftopFeatureMarkers.forEach(m => m.setMap(null))
  rooftopFeatureMarkers = []

  shadowPolygonOverlays.forEach(s => s.setMap(null))
  shadowPolygonOverlays = []
}

// Requirement 2 & 3: Extreme Roof Inspection Mode When Drawing Starts
async function handleStartRoofDrawing() {
  clearMapDrawingObjects()
  startManualDrawRoof()
  drawingFeedback.value = 'Extreme Roof Zoom: Tracing perimeter corners. Click to pin points, drag to pan. Use wheel or + / − to zoom.'

  if (googleMap) {
    googleMap.setOptions({
      draggableCursor: 'crosshair',
      disableDoubleClickZoom: true
    })

    // Automatically center on roof/property and zoom as close as real satellite imagery allows
    const targetCenter = getRoofOrCurrentCenter()
    const result = await queryAndUpdateMaxZoom(targetCenter)
    googleMap.panTo(targetCenter)
    googleMap.setZoom(result.zoom)
  }
}

// Requirement 2: Extreme Roof Inspection Mode When Editing Starts
async function handleStartRoofEditing() {
  recalculateAreaFromPoints()
  enterEditPointsMode()
  if (googleMap && drawnRoofPoints.value.length > 0) {
    if (edgeGuidePolyline) {
      edgeGuidePolyline.setMap(null)
    }
    googleMap.setOptions({
      draggableCursor: null,
      disableDoubleClickZoom: false
    })
    const targetCenter = getRoofOrCurrentCenter()
    const result = await queryAndUpdateMaxZoom(targetCenter)
    googleMap.panTo(targetCenter)
    googleMap.setZoom(result.zoom)
    syncVertexMarkers()
    refreshPolygonFromPoints()
  }
}

// Unsaved roof changes tracking for roof editing panel
const savedRoofSnapshot = ref<Array<{ lat: number; lng: number }>>([])
const showDiscardConfirm = ref(false)

function snapshotCurrentRoof() {
  savedRoofSnapshot.value = drawnRoofPoints.value.map(pt => ({ lat: pt.lat, lng: pt.lng }))
}

function hasUnsavedChanges(): boolean {
  if (savedRoofSnapshot.value.length === 0) return false
  if (savedRoofSnapshot.value.length !== drawnRoofPoints.value.length) return true
  for (let i = 0; i < drawnRoofPoints.value.length; i++) {
    const p1 = drawnRoofPoints.value[i]
    const p2 = savedRoofSnapshot.value[i]
    if (!p1 || !p2) return true
    if (Math.abs(p1.lat - p2.lat) > 1e-7 || Math.abs(p1.lng - p2.lng) > 1e-7) {
      return true
    }
  }
  return false
}

function handleCloseRoofEditor() {
  if (hasUnsavedChanges()) {
    showDiscardConfirm.value = true
  } else {
    closeRoofEditorDirectly()
  }
}

function cancelDiscardChanges() {
  showDiscardConfirm.value = false
}

function confirmDiscardChanges() {
  if (savedRoofSnapshot.value.length >= 3) {
    drawnRoofPoints.value = savedRoofSnapshot.value.map(pt => ({ lat: pt.lat, lng: pt.lng }))
    recalculateAreaFromPoints()
    refreshPolygonFromPoints()
    syncVertexMarkers()
  }
  showDiscardConfirm.value = false
  closeRoofEditorDirectly()
}

function closeRoofEditorDirectly() {
  showDiscardConfirm.value = false
  if (drawnRoofPoints.value.length >= 3) {
    const ordered = orderRoofPolygonVertices(drawnRoofPoints.value)
    if (!ordered.validation.isValid) {
      boundaryValidationMessage.value = ordered.validation.message || SELF_INTERSECTION_ERROR_MESSAGE
      boundaryCrossings.value = ordered.validation.crossings
      syncVertexMarkers()
      refreshPolygonFromPoints()
      return
    }
  }

  roofDrawingMode.value = 'none'
  isDrawingRoof.value = false
  selectedVertexIndex.value = null
  if (vertexInfoWindow) {
    vertexInfoWindow.close()
  }
  if (drawnRoofPoints.value.length >= 3 && roofBoundaryDrawn.value) {
    roofAssessmentState.value = 'CONFIRMED'
  } else if (drawnRoofPoints.value.length >= 3) {
    isDrawingRoof.value = true
    roofDrawingMode.value = 'manual-draw'
    roofAssessmentState.value = 'IDLE'
  } else {
    roofAssessmentState.value = 'IDLE'
  }
  syncVertexMarkers()
  refreshPolygonFromPoints()
}

function fitRoofBounds(padding: number = 50) {
  if (!googleMap || !window.google?.maps || drawnRoofPoints.value.length < 2) return
  const bounds = new google.maps.LatLngBounds()
  drawnRoofPoints.value.forEach(pt => bounds.extend(new google.maps.LatLng(pt.lat, pt.lng)))
  googleMap.fitBounds(bounds, padding)
}

function computeDrawnRoofArea(): number {
  if (drawnRoofPoints.value.length < 3) return 0
  const ordered = orderRoofPolygonVertices(drawnRoofPoints.value)
  if (!ordered.validation.isValid || ordered.points.length < 3) return 0

  const points = ordered.points
  if (window.google?.maps?.geometry?.spherical) {
    const path = points.map(pt => new google.maps.LatLng(pt.lat, pt.lng))
    const area = google.maps.geometry.spherical.computeArea(path)
    return Number(area.toFixed(1))
  }
  // Fallback planar Shoelace formula if Google geometry library is not yet loaded
  const latCenter = points.reduce((acc, p) => acc + p.lat, 0) / points.length
  const latRad = (latCenter * Math.PI) / 180
  const metersPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad)
  const metersPerDegLng = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad)
  let areaSum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const ptI = points[i]
    const ptJ = points[j]
    if (!ptI || !ptJ) continue
    const xi = ptI.lng * metersPerDegLng
    const yi = ptI.lat * metersPerDegLat
    const xj = ptJ.lng * metersPerDegLng
    const yj = ptJ.lat * metersPerDegLat
    areaSum += xi * yj - xj * yi
  }
  return Number(Math.abs(areaSum / 2).toFixed(1))
}

// Requirement 4 & 5: Precision Vertex Placement with Exact LatLng
function addDrawingVertex(latLng: google.maps.LatLng) {
  if (!googleMap || !window.google?.maps) return

  // Store raw full-precision coordinates directly
  const lat = latLng.lat()
  const lng = latLng.lng()
  addRoofPoint(lat, lng)

  if (edgeGuidePolyline) {
    edgeGuidePolyline.setMap(null)
  }

  syncVertexMarkers()
  refreshPolygonFromPoints()

  if (boundaryValidationMessage.value) {
    drawingFeedback.value = boundaryValidationMessage.value
  } else if (drawnRoofPoints.value.length >= 3) {
    const area = computeDrawnRoofArea()
    drawingFeedback.value = `${drawnRoofPoints.value.length} corners placed. Google Maps Area: ${area} m². Double-click map or click CONFIRM ROOF when done.`
  } else {
    drawingFeedback.value = `${drawnRoofPoints.value.length} of 3 minimum corners placed. Click map to add next corner.`
  }
}

// Requirement 8: Undo Last Point
function handleUndoLastPoint() {
  if (drawnRoofPoints.value.length === 0) return
  undoLastRoofPoint()
  syncVertexMarkers()
  refreshPolygonFromPoints()

  if (boundaryValidationMessage.value) {
    drawingFeedback.value = boundaryValidationMessage.value
  } else if (drawnRoofPoints.value.length >= 3) {
    const area = computeDrawnRoofArea()
    drawingFeedback.value = `${drawnRoofPoints.value.length} corners placed. Google Maps Area: ${area} m². Click CONFIRM ROOF when done.`
  } else if (drawnRoofPoints.value.length > 0) {
    drawingFeedback.value = `${drawnRoofPoints.value.length} of 3 minimum corners placed. Click map to add next corner.`
  } else {
    drawingFeedback.value = 'Click on the map to place roof perimeter corners.'
  }
}

function refreshPolygonFromPoints() {
  if (!googleMap || !window.google?.maps) return

  if (drawnRoofPoints.value.length >= 3) {
    const ordered = orderRoofPolygonVertices(drawnRoofPoints.value)
    const displayPoints = ordered.points
    const path = displayPoints.map(pt => new google.maps.LatLng(pt.lat, pt.lng))
    const isValid = ordered.validation.isValid

    // Visual appearance styles based on validation & UI State
    let strokeColor = '#2563eb'
    let fillColor = '#3b82f6'
    let fillOpacity = 0.22
    let strokeWeight = 2.5

    if (!isValid) {
      strokeColor = '#ef4444'
      fillColor = '#ef4444'
      fillOpacity = 0.20
      strokeWeight = 3.0
      renderCrossingHighlights(displayPoints, ordered.validation.crossings)
    } else {
      clearCrossingHighlights()
      if (roofAssessmentState.value === 'CONFIRMED') {
        strokeColor = '#10b981' // Solid Emerald for installer-verified roof
        fillColor = '#10b981'
        fillOpacity = 0.20
        strokeWeight = 2.5
      } else if (roofAssessmentState.value === 'EDITING' || roofDrawingMode.value === 'add-point') {
        strokeColor = '#2563eb' // Precision Blueprint Blue
        fillColor = '#3b82f6'
        fillOpacity = 0.22
        strokeWeight = 2.5
      }
    }

    if (!activePolygon) {
      activePolygon = new google.maps.Polygon({
        paths: path,
        map: googleMap,
        strokeColor,
        strokeOpacity: 0.95,
        strokeWeight,
        fillColor,
        fillOpacity,
        clickable: true,
        editable: false
      })

      // Clicking edge/polygon in add-point mode inserts a vertex
      activePolygon.addListener('click', (e: google.maps.PolyMouseEvent) => {
        if (roofDrawingMode.value === 'add-point' && e.latLng) {
          const lat = e.latLng.lat()
          const lng = e.latLng.lng()
          const insertIdx = findBestEdgeInsertIndex({ lat, lng }, drawnRoofPoints.value)
          insertRoofPointAt(insertIdx, lat, lng)
          syncVertexMarkers()
          refreshPolygonFromPoints()
        }
      })
    } else {
      activePolygon.setEditable(false)
      activePolygon.setPaths(path)
      activePolygon.setOptions({
        strokeColor,
        strokeWeight,
        fillColor,
        fillOpacity,
        editable: false
      })
    }

    if (activePolyline) {
      activePolyline.setMap(null)
      activePolyline = null
    }
  } else if (drawnRoofPoints.value.length === 2) {
    clearCrossingHighlights()
    const path = drawnRoofPoints.value.map(pt => new google.maps.LatLng(pt.lat, pt.lng))
    if (activePolygon) {
      activePolygon.setMap(null)
      activePolygon = null
    }
    if (!activePolyline) {
      activePolyline = new google.maps.Polyline({
        path,
        map: googleMap,
        strokeColor: '#2563eb',
        strokeOpacity: 0.9,
        strokeWeight: 2.5
      })
    } else {
      activePolyline.setPath(path)
    }
  } else {
    clearCrossingHighlights()
    if (activePolyline) {
      activePolyline.setMap(null)
      activePolyline = null
    }
    if (activePolygon) {
      activePolygon.setMap(null)
      activePolygon = null
    }
  }
}

async function handleConfirmEditedRoof() {
  const ok = await confirmRoofAssessment()
  if (!ok) {
    syncVertexMarkers()
    refreshPolygonFromPoints()
    return
  }
  snapshotCurrentRoof()
  syncVertexMarkers()
  refreshPolygonFromPoints()
  renderVisualOverlays()
  fitRoofBounds(60)
}

// Requirement 9 & 10: Finish Roof & Fit Completed Roof
async function handleFinishRoofDrawing() {
  if (drawnRoofPoints.value.length < 3) {
    drawingFeedback.value = 'Please click at least 3 points around the roof boundary.'
    return
  }

  const finalArea = computeDrawnRoofArea()
  const ok = await finishRoof(finalArea)
  if (!ok) {
    drawingFeedback.value = boundaryValidationMessage.value || SELF_INTERSECTION_ERROR_MESSAGE
    syncVertexMarkers()
    refreshPolygonFromPoints()
    return
  }

  if (edgeGuidePolyline) {
    edgeGuidePolyline.setMap(null)
  }
  if (googleMap) {
    googleMap.setOptions({
      draggableCursor: null,
      disableDoubleClickZoom: false
    })
  }

  snapshotCurrentRoof()
  syncVertexMarkers()
  refreshPolygonFromPoints()
  renderVisualOverlays()
  fitRoofBounds(60) // Requirement 10: Auto-fit completed roof with comfortable padding
  drawingFeedback.value = `Roof boundary active (${drawnRoofPoints.value.length} vertices, ${roofAreaSqM.value} m²). Click EDIT POINTS anytime to adjust.`
}

function handleClearRoofDrawing() {
  if (edgeGuidePolyline) {
    edgeGuidePolyline.setMap(null)
  }
  clearMapDrawingObjects()
  clearRoof()
  drawingFeedback.value = ''
  if (googleMap) {
    googleMap.setOptions({
      draggableCursor: null,
      disableDoubleClickZoom: false
    })
  }
}

// Requirement 11: Re-draw Roof with Confirmation
function confirmRedrawRoof() {
  showRedrawConfirmModal.value = false
  handleStartRoofDrawing()
}

function handlePromptRedrawRoof() {
  if (roofBoundaryDrawn.value || drawnRoofPoints.value.length > 0) {
    showRedrawConfirmModal.value = true
  } else {
    handleStartRoofDrawing()
  }
}

// ==========================================
// VISUAL OVERLAYS (SETBACK, PANELS, SHADOWS)
// ==========================================

function localMetersToLatLng(x: number, z: number, centerLat: number, centerLng: number): { lat: number; lng: number } {
  const earthRadiusM = 6378137
  const dLat = (z / earthRadiusM) * (180 / Math.PI)
  const dLng = (x / (earthRadiusM * Math.cos(centerLat * Math.PI / 180))) * (180 / Math.PI)
  return {
    lat: centerLat + dLat,
    lng: centerLng + dLng
  }
}

function renderVisualOverlays() {
  if (!googleMap || !window.google?.maps) return

  let centerLat: number | undefined = activeRoofModel.value?.origin?.latitude
  let centerLng: number | undefined = activeRoofModel.value?.origin?.longitude
  if ((centerLat === undefined || centerLng === undefined) && drawnRoofPoints.value.length >= 3) {
    centerLat = drawnRoofPoints.value.reduce((s, p) => s + p.lat, 0) / drawnRoofPoints.value.length
    centerLng = drawnRoofPoints.value.reduce((s, p) => s + p.lng, 0) / drawnRoofPoints.value.length
  } else if ((centerLat === undefined || centerLng === undefined) && selectedProperty.value) {
    centerLat = selectedProperty.value.latitude
    centerLng = selectedProperty.value.longitude
  }
  if (centerLat === undefined || centerLng === undefined) return

  clearVisualOverlays()

  // 1. Usable Setback Inner Boundary (Cyan dashed polygon)
  if (setbackPolygonPoints.value && setbackPolygonPoints.value.length >= 3) {
    const setbackCoords = setbackPolygonPoints.value.map(pt => {
      const geo = localMetersToLatLng(pt.x, pt.z, centerLat, centerLng)
      return new google.maps.LatLng(geo.lat, geo.lng)
    })

    setbackPolygonOverlay = new google.maps.Polygon({
      paths: setbackCoords,
      map: googleMap,
      strokeColor: '#06b6d4', // Cyan
      strokeOpacity: 0.95,
      strokeWeight: 1.8,
      fillColor: '#06b6d4',
      fillOpacity: 0.08,
      clickable: false
    })
  }

  // 2. Physical Solar Panels Overlaid on Satellite Roof
  if (placedPanels.value && placedPanels.value.length > 0) {
    placedPanels.value.forEach(panel => {
      const halfW = panel.widthM / 2
      const halfL = panel.lengthM / 2

      // Panel corner offsets in local coordinates
      const pCorners = [
        { x: panel.x - halfW, z: panel.z - halfL },
        { x: panel.x + halfW, z: panel.z - halfL },
        { x: panel.x + halfW, z: panel.z + halfL },
        { x: panel.x - halfW, z: panel.z + halfL }
      ]

      const polyPath = pCorners.map(c => {
        const geo = localMetersToLatLng(c.x, c.z, centerLat, centerLng)
        return new google.maps.LatLng(geo.lat, geo.lng)
      })

      const panelPoly = new google.maps.Polygon({
        paths: polyPath,
        map: googleMap,
        strokeColor: '#38bdf8',
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: '#0f172a', // Monocrystalline Navy
        fillOpacity: 0.9,
        clickable: false
      })

      placedPanelOverlays.push(panelPoly)
    })
  }

  // 3. Obstruction Markers & Canopy / Buffer Circles
  if (obstructions.value && obstructions.value.length > 0) {
    obstructions.value.forEach(obs => {
      let pos: google.maps.LatLng
      if (obs.latitude && obs.longitude) {
        pos = new google.maps.LatLng(obs.latitude, obs.longitude)
      } else if (obs.position) {
        const geo = localMetersToLatLng(obs.position.x, obs.position.z, centerLat, centerLng)
        pos = new google.maps.LatLng(geo.lat, geo.lng)
      } else {
        return
      }

      const marker = new google.maps.Marker({
        position: pos,
        map: googleMap,
        title: `${obs.name || obs.type}: Height ${obs.heightM}m`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: obs.type === 'Tree' ? '#16a34a' : '#d97706',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      })
      obstructionMarkers.push(marker)

      // Canopy circle for Trees or Radius circle for Water Tanks
      const radius = obs.type === 'Tree'
        ? (obs.canopyRadiusM || 3.0)
        : obs.type === 'Water Tank'
          ? (obs.radiusM || 1.2)
          : null

      if (radius && radius > 0) {
        const circle = new google.maps.Circle({
          map: googleMap,
          center: pos,
          radius,
          fillColor: obs.type === 'Tree' ? '#22c55e' : '#f59e0b',
          fillOpacity: 0.22,
          strokeColor: obs.type === 'Tree' ? '#16a34a' : '#d97706',
          strokeWeight: 1.5,
          clickable: false
        })
        obstructionCircles.push(circle)
      }
    })
  }

  // 3b. Rooftop Feature Markers (Requirement 18: Map <-> 3D connection)
  if (rooftopFeatures.value && rooftopFeatures.value.length > 0) {
    rooftopFeatures.value.forEach(feat => {
      let pos: google.maps.LatLng
      if (feat.latitude && feat.longitude) {
        pos = new google.maps.LatLng(feat.latitude, feat.longitude)
      } else if (feat.position) {
        const geo = localMetersToLatLng(feat.position.x, feat.position.z, centerLat, centerLng)
        pos = new google.maps.LatLng(geo.lat, geo.lng)
      } else {
        return
      }

      const marker = new google.maps.Marker({
        position: pos,
        map: googleMap,
        title: `${feat.id} (${feat.type}): ${feat.widthM}m x ${feat.lengthM}m x ${feat.heightM}m`,
        label: {
          text: feat.id,
          color: '#ffffff',
          fontSize: '9px',
          fontWeight: 'bold'
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#d97706',
          fillOpacity: 0.95,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      })
      rooftopFeatureMarkers.push(marker)
    })
  }

  // 4. Dynamic Estimated Shadow Projections
  if (shadingAssessment.value?.shadowPolygons && shadingAssessment.value.shadowPolygons.length > 0) {
    shadingAssessment.value.shadowPolygons.forEach(shadow => {
      const shadowPath = shadow.points.map(pt => {
        const geo = localMetersToLatLng(pt.x, pt.z, centerLat, centerLng)
        return new google.maps.LatLng(geo.lat, geo.lng)
      })

      const shadowPoly = new google.maps.Polygon({
        paths: shadowPath,
        map: googleMap,
        fillColor: '#0f172a',
        fillOpacity: 0.45,
        strokeColor: '#475569',
        strokeOpacity: 0.7,
        strokeWeight: 1,
        clickable: false
      })
      shadowPolygonOverlays.push(shadowPoly)
    })
  }
}

// Watchers to trigger map overlay updates when layout or shading changes
watch(
  () => [placedPanels.value.length, obstructions.value.length, rooftopFeatures.value.length, shadingAssessment.value],
  () => {
    renderVisualOverlays()
  },
  { deep: true }
)

// Watcher to react to Google Places search selection or property change
watch(
  () => selectedProperty.value,
  async (prop) => {
    if (!googleMap) return
    if (prop) {
      const pos = { lat: prop.latitude, lng: prop.longitude }
      const res = await queryAndUpdateMaxZoom(pos)
      if (prop.suggestedZoom) {
        googleMap.setCenter(pos)
        googleMap.setZoom(Math.min(prop.suggestedZoom, res.zoom))
      } else if (prop.viewport) {
        googleMap.fitBounds(prop.viewport)
      } else {
        const isCity = prop.types?.includes('locality') || prop.types?.includes('administrative_area_level_2')
        googleMap.setCenter(pos)
        googleMap.setZoom(isCity ? 14 : res.zoom)
      }
    }
  },
  { deep: true }
)

// Watcher for CENTER ON DIGOS trigger (Requirement 7)
watch(
  () => centerOnDigosTrigger.value,
  () => {
    if (googleMap) {
      googleMap.setCenter(DEFAULT_CENTER)
      googleMap.setZoom(14)
    }
  }
)

// ==========================================
// MAP INITIALIZATION
// ==========================================

function handleMapContainerMouseMove(e: MouseEvent) {
  if (!mapWrapper.value) return
  const rect = mapWrapper.value.getBoundingClientRect()
  mousePixelPos.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

function handleMapContainerMouseLeave() {
  mousePixelPos.value = null
}

async function mountGoogleMap() {
  if (!mapContainer.value) return

  const googleObj = await initGoogleMaps()
  if (!googleObj || !window.google?.maps) return

  const mapCenter = selectedProperty.value && isInsideDigos(selectedProperty.value.latitude, selectedProperty.value.longitude)
    ? { lat: selectedProperty.value.latitude, lng: selectedProperty.value.longitude }
    : DEFAULT_CENTER

  googleMap = new google.maps.Map(mapContainer.value, {
    center: mapCenter,
    zoom: selectedProperty.value ? (selectedProperty.value.suggestedZoom ?? 19) : 19,
    minZoom: 12,
    maxZoom: availableMaxZoom.value,
    mapTypeId: google.maps.MapTypeId.SATELLITE,
    restriction: {
      latLngBounds: {
        north: DIGOS_BOUNDS.north,
        south: DIGOS_BOUNDS.south,
        east: DIGOS_BOUNDS.east,
        west: DIGOS_BOUNDS.west
      },
      strictBounds: false
    },
    tilt: 0,
    scrollwheel: true,
    gestureHandling: 'greedy',
    keyboardShortcuts: true,
    disableDoubleClickZoom: false,
    mapTypeControl: false,
    zoomControl: true,
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: false
  })

  currentZoom.value = googleMap.getZoom() || 19

  // Dynamically query actual Google Satellite resolution for initial map center
  queryAndUpdateMaxZoom(mapCenter)

  googleMap.addListener('zoom_changed', () => {
    if (googleMap) {
      currentZoom.value = googleMap.getZoom() || 19
    }
  })

  // Location-aware real zoom detection when map pans/moves (Requirement 9)
  googleMap.addListener('idle', handleMapIdle)

  googleMap.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      cursorCoordinates.value = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      }

      // Snap-Assisted Edge Placement (Requirement 7)
      if ((isDrawingRoof.value || roofDrawingMode.value === 'add-point') && drawnRoofPoints.value.length >= 2) {
        updateEdgeGuidePreview(e.latLng)
      } else if (edgeGuidePolyline) {
        edgeGuidePolyline.setMap(null)
      }
    }
  })

  googleMap.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
    if (isDrawingRoof.value && drawnRoofPoints.value.length >= 3) {
      if (e.domEvent) {
        e.domEvent.stopPropagation()
        e.domEvent.preventDefault()
      }
      handleFinishRoofDrawing()
    }
  })

  // Watchers to trigger map overlay updates when layout or shading changes
watch(
  () => roofAssessmentState.value,
  (newState) => {
    if (newState === 'EDITING') {
      if (savedRoofSnapshot.value.length === 0 && drawnRoofPoints.value.length >= 3) {
        snapshotCurrentRoof()
      }
      refreshPolygonFromPoints()
      syncVertexMarkers()
    } else if (newState === 'CONFIRMED') {
      refreshPolygonFromPoints()
      syncVertexMarkers()
      fitRoofBounds(60)
    }
  }
)

watch(
  () => drawnRoofPoints.value,
  () => {
    refreshPolygonFromPoints()
    syncVertexMarkers()
  },
  { deep: true }
)

watch(
  () => roofDrawingMode.value,
  (mode) => {
    if (!googleMap) return
    if (mode === 'add-point') {
      googleMap.setOptions({ draggableCursor: 'crosshair' })
    } else if (mode === 'manual-draw') {
      googleMap.setOptions({ draggableCursor: 'crosshair' })
    } else {
      googleMap.setOptions({ draggableCursor: null })
    }
  }
)

// Map Click Handler: Roof Point / Survey Site Select
  googleMap.addListener('click', async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    const lat = e.latLng.lat()
    const lng = e.latLng.lng()

    // 0. In Add Point Mode: click on or near edge inserts a new vertex
    if (roofDrawingMode.value === 'add-point') {
      const insertIdx = findBestEdgeInsertIndex({ lat, lng }, drawnRoofPoints.value)
      insertRoofPointAt(insertIdx, lat, lng)
      syncVertexMarkers()
      refreshPolygonFromPoints()
      return
    }

    // 1. In Roof Draw Mode: clicks add perimeter vertices
    if (isDrawingRoof.value) {
      addDrawingVertex(e.latLng)
      return
    }

    // 2. Normal Mode: Select property
    if (!isInsideDigos(lat, lng)) {
      outsideDigosAlert.value = true
      return
    }
    outsideDigosAlert.value = false

    selectCoordinates(lat, lng, `Survey Site (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`, 'Fetching address from Google...', 'Google Geocoding API')

    const geoResult = await reverseGeocode(lat, lng)
    selectCoordinates(
      lat,
      lng,
      geoResult.name ? `Site: ${geoResult.name}` : `Survey Site (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`,
      geoResult.formattedAddress,
      'Google Geocoding API',
      geoResult.placeId
    )
  })
}

function returnToDigos() {
  outsideDigosAlert.value = false
  if (googleMap) {
    googleMap.panTo(DEFAULT_CENTER)
    googleMap.setZoom(DEFAULT_ZOOM)
  }
}

function setMapType(type: 'satellite' | 'hybrid' | 'roadmap' | 'terrain') {
  if (!googleMap) return
  activeMapType.value = type
  switch (type) {
    case 'satellite':
      googleMap.setMapTypeId(google.maps.MapTypeId.SATELLITE)
      break
    case 'hybrid':
      googleMap.setMapTypeId(google.maps.MapTypeId.HYBRID)
      break
    case 'roadmap':
      googleMap.setMapTypeId(google.maps.MapTypeId.ROADMAP)
      break
    case 'terrain':
      googleMap.setMapTypeId(google.maps.MapTypeId.TERRAIN)
      break
  }
}

function handleZoomIn() {
  if (googleMap) {
    const cur = googleMap.getZoom() || 18
    if (cur < availableMaxZoom.value) {
      googleMap.setZoom(cur + 1)
    }
  }
}

function handleZoomOut() {
  if (googleMap) {
    const cur = googleMap.getZoom() || 14
    if (cur > 12) {
      googleMap.setZoom(cur - 1)
    }
  }
}

function handleResetView() {
  if (googleMap) {
    googleMap.setCenter(DEFAULT_CENTER)
    googleMap.setZoom(DEFAULT_ZOOM)
  }
}

function toggleFullscreen() {
  if (!mapWrapper.value) return
  if (!isFullscreen.value) {
    if (mapWrapper.value.requestFullscreen) {
      mapWrapper.value.requestFullscreen().catch(() => {})
    }
    isFullscreen.value = true
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
    isFullscreen.value = false
  }
}

onMounted(() => {
  mountGoogleMap()
})

onBeforeUnmount(() => {
  if (idleDebounceTimer) {
    clearTimeout(idleDebounceTimer)
  }
  clearMapDrawingObjects()
  googleMap = null
})
</script>

<template>
  <div
    ref="mapWrapper"
    class="relative w-full h-full min-h-[580px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col"
    @mousemove="handleMapContainerMouseMove"
    @mouseleave="handleMapContainerMouseLeave"
  >
    <!-- Map Target Div for Google Maps -->
    <div
      ref="mapContainer"
      class="w-full h-full flex-1 z-0"
      :class="{ 'opacity-0': mapStatus === 'missing_key' || mapStatus === 'error' }"
    ></div>

    <!-- Precision Crosshair for Extreme Roof Pinning (Requirement 14) -->
    <div
      v-if="(isDrawingRoof || roofDrawingMode === 'add-point') && mousePixelPos && cursorCoordinates"
      class="pointer-events-none absolute z-30 transform -translate-x-1/2 -translate-y-1/2 select-none"
      :style="{ left: `${mousePixelPos.x}px`, top: `${mousePixelPos.y}px` }"
    >
      <div class="relative w-8 h-8 flex items-center justify-center">
        <div class="absolute w-8 h-[1px] bg-cyan-400 shadow-[0_0_2px_rgba(0,0,0,0.9)]"></div>
        <div class="absolute h-8 w-[1px] bg-cyan-400 shadow-[0_0_2px_rgba(0,0,0,0.9)]"></div>
        <div class="w-2.5 h-2.5 rounded-full border border-cyan-300 bg-cyan-400/20"></div>
      </div>
      <div class="absolute left-6 top-1 bg-slate-950/90 text-[9px] font-mono text-cyan-200 px-1.5 py-0.5 rounded border border-cyan-500/40 whitespace-nowrap shadow-md flex items-center gap-1">
        <span>LAT {{ cursorCoordinates.lat.toFixed(6) }}°</span>
        <span class="text-slate-500">|</span>
        <span>LNG {{ cursorCoordinates.lng.toFixed(6) }}°</span>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div
      v-if="mapStatus === 'loading'"
      class="absolute inset-0 z-30 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white space-y-4"
    >
      <div class="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <div class="text-center">
        <h3 class="font-bold text-sm">Initializing Google Maps JavaScript API</h3>
        <p class="text-xs text-slate-400 mt-1">Connecting to Google Satellite & Places telemetry...</p>
      </div>
    </div>

    <!-- Active Overlay HUDs -->
    <template v-if="mapStatus === 'ready'">
      <!-- 1. EDITING ROOF BOUNDARY (Installer Active Modification) -->
      <div
        v-if="roofAssessmentState === 'EDITING' && !isDrawingRoof && drawnRoofPoints.length >= 3"
        :class="[
          'absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border-2 flex flex-col gap-2.5 animate-fadeIn min-w-[380px] max-w-xl',
          isBoundarySelfIntersecting ? 'border-rose-500' : 'border-blue-500'
        ]"
      >
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <div class="flex items-center gap-2">
            <span :class="['w-2.5 h-2.5 rounded-full', isBoundarySelfIntersecting ? 'bg-rose-500 animate-ping' : 'bg-blue-400']"></span>
            <span class="font-bold text-sm text-white">Edit Roof</span>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2 text-[11px] font-mono">
              <span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 text-[10px]">
                Vertices: <strong class="text-white">{{ drawnRoofPoints.length }}</strong>
              </span>
              <span
                :class="[
                  'px-2 py-0.5 rounded border text-[10px]',
                  isBoundarySelfIntersecting
                    ? 'bg-rose-950 text-rose-200 border-rose-700'
                    : 'bg-blue-950 text-blue-200 border-blue-800'
                ]"
              >
                Area: <strong class="text-white">{{ isBoundarySelfIntersecting ? 'Invalid' : `${roofAreaSqM.toFixed(1)} m²` }}</strong>
              </span>
            </div>

            <button
              type="button"
              @click="handleCloseRoofEditor"
              class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-base font-bold border border-slate-700"
              title="Close roof editor"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Crossing / Self-Intersection Validation Banner -->
        <div
          v-if="boundaryValidationMessage"
          class="bg-rose-950/90 border border-rose-500 rounded-xl px-3 py-2 text-xs text-rose-200 font-semibold flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{{ boundaryValidationMessage }}</span>
        </div>

        <!-- Discard unsaved changes confirmation banner inside HUD -->
        <div v-if="showDiscardConfirm" class="bg-slate-800/95 border border-amber-500/50 rounded-xl p-3 text-xs space-y-2 mt-0.5 animate-fadeIn">
          <p class="font-semibold text-white">Discard unsaved changes?</p>
          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              @click="cancelDiscardChanges"
              class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md font-medium text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmDiscardChanges"
              class="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-bold text-xs transition-colors cursor-pointer shadow-sm"
            >
              Discard
            </button>
          </div>
        </div>

        <div class="text-[11px] text-slate-300 leading-snug">
          <span v-if="roofDrawingMode === 'add-point'" class="text-amber-400 font-semibold">
            ADD POINT MODE: Click anywhere along a roof edge to insert a new vertex.
          </span>
          <span v-else-if="selectedVertexIndex !== null" class="text-amber-300 font-medium">
            Vertex #{{ selectedVertexIndex + 1 }} selected. Drag handle to adjust corner, or click Delete to remove.
          </span>
          <span v-else>
            Drag handles to inspect & align with roof edges. Click any vertex to select/delete.
          </span>
        </div>

        <div class="flex items-center justify-between gap-1.5 pt-1 flex-wrap">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              @click="handleTriggerMaxZoom"
              class="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
              title="Zoom to maximum available Google satellite imagery"
            >
              <span>⌕</span>
              <span>MAX ZOOM</span>
            </button>

            <button
              type="button"
              @click="handleRoofCloseUp"
              class="px-2.5 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              title="Fit roof in view"
            >
              <span>🎯</span>
              <span>CLOSE-UP</span>
            </button>

            <button
              type="button"
              @click="toggleAddPointMode"
              :class="[
                'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1 cursor-pointer',
                roofDrawingMode === 'add-point'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              ]"
            >
              <span>{{ roofDrawingMode === 'add-point' ? '✓ DONE ADDING' : '+ ADD POINT' }}</span>
            </button>

            <button
              v-if="selectedVertexIndex !== null"
              type="button"
              @click="handleDeleteSelectedVertex"
              class="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
              title="Delete selected vertex"
            >
              <span>🗑 DEL PT #{{ selectedVertexIndex + 1 }}</span>
            </button>

            <button
              type="button"
              @click="undoRoofPointEdit"
              :disabled="pointHistory.length === 0"
              class="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              title="Undo vertex edit"
            >
              ↩ UNDO
            </button>

            <button
              type="button"
              @click="redoRoofPointEdit"
              :disabled="pointRedoHistory.length === 0"
              class="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              title="Redo vertex edit"
            >
              ↪ REDO
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              @click="handleStartRoofDrawing"
              class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              REDRAW MANUALLY
            </button>

            <button
              type="button"
              @click="handleConfirmEditedRoof"
              :disabled="drawnRoofPoints.length < 3 || isBoundarySelfIntersecting"
              class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>✓ CONFIRM ROOF</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. PRECISION ROOF DRAWING FLOATING CONTROL PANEL (Manual Draw Mode) -->
      <div
        v-else-if="isDrawingRoof"
        :class="[
          'absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border-2 flex flex-col gap-2.5 animate-fadeIn min-w-[320px] max-w-xl',
          isBoundarySelfIntersecting ? 'border-rose-500' : 'border-blue-500/90'
        ]"
      >
        <!-- Header row -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <div class="flex items-center gap-2">
            <span :class="['w-2.5 h-2.5 rounded-full animate-ping', isBoundarySelfIntersecting ? 'bg-rose-500' : 'bg-blue-500']"></span>
            <span :class="['font-bold text-xs uppercase tracking-wider', isBoundarySelfIntersecting ? 'text-rose-400' : 'text-blue-400']">PRECISION ROOF DRAWING</span>
          </div>
          <div class="flex items-center gap-1.5 text-[11px] font-mono">
            <span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              Zoom: <strong class="text-white">{{ currentZoom }}</strong> / <strong class="text-amber-400">{{ availableMaxZoom }}</strong>
            </span>
            <span class="bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
              Points: <strong class="text-white">{{ drawnRoofPoints.length }}</strong>
            </span>
          </div>
        </div>

        <!-- Crossing / Self-Intersection Validation Banner -->
        <div
          v-if="boundaryValidationMessage"
          class="bg-rose-950/90 border border-rose-500 rounded-xl px-3 py-2 text-xs text-rose-200 font-semibold flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{{ boundaryValidationMessage }}</span>
        </div>

        <!-- Feedback instruction -->
        <div v-else class="text-[11px] text-slate-300 leading-snug">
          {{ drawingFeedback }}
        </div>

        <!-- Controls row -->
        <div class="flex items-center justify-between gap-1.5 pt-1 flex-wrap">
          <!-- Extreme Precision Zoom Controls (Requirements 3, 4, 5, 6) -->
          <div class="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5 gap-1">
            <button
              type="button"
              @click="handleTriggerMaxZoom"
              class="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black rounded transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
              title="Maximum satellite resolution"
            >
              <span>⌕</span>
              <span>MAX ZOOM</span>
            </button>
            <button
              type="button"
              @click="handleRoofCloseUp"
              class="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-200 text-[10px] font-bold rounded border border-cyan-800 transition-colors flex items-center gap-1 cursor-pointer"
              title="Fit roof in view"
            >
              <span>🎯</span>
              <span>CLOSE-UP</span>
            </button>
            <button
              type="button"
              @click="handleZoomOut"
              :disabled="currentZoom <= 12"
              class="w-7 h-7 flex items-center justify-center font-bold text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Zoom Out (−)"
            >
              −
            </button>
            <button
              type="button"
              @click="handleZoomIn"
              :disabled="currentZoom >= availableMaxZoom"
              class="w-7 h-7 flex items-center justify-center font-bold text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Zoom In (+)"
            >
              +
            </button>
          </div>

          <!-- Center on Property -->
          <button
            type="button"
            @click="handleCenterOnProperty"
            class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition-colors border border-slate-700 flex items-center gap-1 cursor-pointer"
            title="Center camera on selected property at maximum satellite resolution"
          >
            <span>🎯</span>
            <span class="hidden sm:inline">CENTER</span>
          </button>

          <!-- Undo Last Point (Requirement 8) -->
          <button
            type="button"
            @click="handleUndoLastPoint"
            :disabled="drawnRoofPoints.length === 0"
            :class="[
              'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 border',
              drawnRoofPoints.length > 0
                ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-200 border-amber-800 cursor-pointer'
                : 'bg-slate-800/60 text-slate-500 border-slate-800 cursor-not-allowed'
            ]"
            title="Undo last placed corner point"
          >
            <span>↩</span>
            <span>UNDO</span>
          </button>

          <!-- Edit Points (transitions to full Roof Editor when >= 3 points) -->
          <button
            v-if="drawnRoofPoints.length >= 3"
            type="button"
            @click="handleStartRoofEditing"
            class="px-2.5 py-1.5 bg-blue-950 hover:bg-blue-900 text-blue-200 border border-blue-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            title="Edit roof points before confirming"
          >
            <span>✏️ EDIT</span>
          </button>

          <!-- Finish / Confirm Roof (Requirement 9) -->
          <button
            type="button"
            @click="handleFinishRoofDrawing"
            :disabled="drawnRoofPoints.length < 3 || isBoundarySelfIntersecting"
            :class="[
              'px-3.5 py-1.5 rounded-lg font-bold text-xs shadow-md transition-all flex items-center gap-1.5',
              drawnRoofPoints.length >= 3 && !isBoundarySelfIntersecting
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            ]"
            title="Confirm roof boundary and calculate roof area"
          >
            <span>✓ CONFIRM ROOF</span>
          </button>

          <!-- Cancel -->
          <button
            type="button"
            @click="handleClearRoofDrawing"
            class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors border border-slate-700 cursor-pointer"
            title="Cancel drawing and clear points"
          >
            CANCEL
          </button>
        </div>
      </div>

      <!-- 3. INSTALLER-VERIFIED ROOF HUD BANNER -->
      <div
        v-else-if="roofAssessmentState === 'CONFIRMED' || roofBoundaryDrawn"
        class="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto bg-slate-900/95 backdrop-blur-md text-white text-xs px-4 py-2.5 rounded-2xl shadow-xl border border-emerald-500/60 flex items-center gap-3 animate-fadeIn"
      >
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span class="font-bold text-emerald-400 uppercase text-[10px]">INSTALLER-VERIFIED ROOF</span>
          <span class="font-mono text-slate-200 font-semibold">{{ roofAreaSqM.toFixed(1) }} m²</span>
          <span class="text-slate-400">|</span>
          <span class="font-mono text-blue-300 font-semibold">{{ drawnRoofPoints.length }} Vertices</span>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="handleRoofCloseUp"
            class="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-200 text-[11px] font-semibold rounded-lg border border-cyan-800 transition-colors flex items-center gap-1 cursor-pointer"
            title="Center and fit camera to completed roof polygon"
          >
            <span>🎯</span>
            <span>ROOF CLOSE-UP</span>
          </button>
          <button
            type="button"
            @click="handleTriggerMaxZoom"
            class="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
            title="Maximum satellite resolution for edge inspection"
          >
            <span>⌕</span>
            <span>MAX</span>
          </button>
          <button
            type="button"
            @click="handleStartRoofEditing"
            class="px-2.5 py-1 bg-blue-950 hover:bg-blue-900 text-blue-200 text-[11px] font-semibold rounded-lg border border-blue-800 transition-colors cursor-pointer"
          >
            EDIT POINTS
          </button>
          <button
            type="button"
            @click="handleStartRoofDrawing"
            class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            REDRAW
          </button>
          <button
            type="button"
            @click="handleClearRoofDrawing"
            class="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-200 text-[11px] font-semibold rounded-lg border border-rose-800 transition-colors cursor-pointer"
          >
            CLEAR
          </button>
        </div>
      </div>

      <!-- Top Left: Live Cursor Tracker HUD -->
      <div class="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <!-- Live Cursor & Real Satellite Zoom HUD -->
        <div class="pointer-events-auto bg-slate-950/85 backdrop-blur-md text-slate-300 font-mono text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-800 shadow-md flex items-center gap-2 w-max">
          <span v-if="isDrawingRoof" class="text-cyan-400 font-bold text-[10px] flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            EXTREME ROOF PINNING:
          </span>
          <span v-else class="text-slate-400 text-[10px]">Cursor:</span>
          <span class="text-white">{{ displayCoordinates }}</span>
          <span class="text-slate-600">|</span>

          <!-- Real Zoom State -->
          <template v-if="isDetectingMaxZoom">
            <span class="text-amber-400 font-bold">Zoom: {{ currentZoom }}</span>
            <span class="text-slate-600">|</span>
            <span class="text-cyan-400 text-[10px] flex items-center gap-1 font-sans">
              <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              Detecting satellite zoom...
            </span>
          </template>
          <template v-else-if="maxZoomDetectionStatus === 'DETECTED'">
            <span class="text-amber-400 font-bold">Zoom: {{ currentZoom }} / {{ availableMaxZoom }}</span>
            <span
              v-if="currentZoom >= availableMaxZoom"
              class="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded font-bold uppercase tracking-wider font-sans"
            >
              MAX REAL ZOOM {{ availableMaxZoom }}
            </span>
          </template>
          <template v-else>
            <span class="text-amber-400 font-bold">Zoom: {{ currentZoom }}</span>
            <span class="text-slate-600">|</span>
            <span class="text-slate-400 text-[10px] font-sans">Satellite maximum unavailable</span>
          </template>
        </div>
      </div>

      <!-- Top Right: Action Buttons & Map Controls -->
      <div class="absolute top-4 right-4 z-10 flex items-center gap-2">
        <!-- MANUAL DRAW ROOF BUTTON -->
        <button
          v-if="!isDrawingRoof && roofAssessmentState !== 'EDITING'"
          type="button"
          @click="handleStartRoofDrawing"
          class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Manually draw roof perimeter corners"
        >
          <span>✏️ MANUAL DRAW ROOF</span>
        </button>

        <!-- Layer Selector Toggle -->
        <div class="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-lg flex items-center gap-1 text-xs font-medium text-slate-300">
          <button
            type="button"
            @click="setMapType('hybrid')"
            :class="[
              'px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
              activeMapType === 'hybrid'
                ? 'bg-blue-600 text-white shadow-xs font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            ]"
          >
            Hybrid
          </button>
          <button
            type="button"
            @click="setMapType('satellite')"
            :class="[
              'px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
              activeMapType === 'satellite'
                ? 'bg-blue-600 text-white shadow-xs font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            ]"
          >
            Satellite
          </button>
        </div>

        <!-- Fullscreen Button -->
        <button
          type="button"
          @click="toggleFullscreen"
          class="w-8 h-8 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center shadow-lg transition-colors"
          title="Toggle Fullscreen"
        >
          <svg v-if="!isFullscreen" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
          <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        </button>
      </div>

      <!-- Bottom Left: On-Screen Map Legend -->
      <div
        v-if="roofBoundaryDrawn"
        class="absolute bottom-5 left-5 z-10 pointer-events-auto bg-slate-950/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-xl text-white text-[10px] space-y-1.5"
      >
        <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400 block mb-1">MAP TELEMETRY LEGEND</span>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-xs border-2 border-blue-500 bg-blue-500/20"></span>
          <span class="text-slate-300 font-medium">Roof Perimeter (Google Polygon)</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-xs border border-dashed border-cyan-400 bg-cyan-400/10"></span>
          <span class="text-slate-300 font-medium">Usable Area ({{ setbackM }}m Setback)</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-xs bg-slate-900 border border-sky-400"></span>
          <span class="text-slate-300 font-medium">Fitted PV Modules ({{ placedPanels.length }})</span>
        </div>
        <div class="flex items-center gap-2">
          <span :class="['w-2.5 h-2.5 rounded-full border', obstructions.length > 0 ? 'bg-emerald-500 border-white' : 'bg-slate-600 border-slate-500']"></span>
          <span class="text-slate-300 font-medium">OBSTRUCTIONS / TREES ({{ obstructions.length }})</span>
        </div>
        <div v-if="obstructions.length > 0 && shadingAssessment && shadingAssessment.shadowPolygons?.length" class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-xs bg-slate-900/60 border border-slate-600"></span>
          <span class="text-slate-300 font-medium">Estimated Shadow Zone ({{ shadingAssessment.shadingPercentage }}%)</span>
        </div>
      </div>

      <!-- Bottom Right: Zoom Controls & Inspection Actions (Requirements 4, 5, 6) -->
      <div class="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2 pointer-events-auto">
        <!-- MAX ZOOM Button (Requirement 4) -->
        <button
          type="button"
          @click="handleTriggerMaxZoom"
          class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs shadow-xl border border-amber-300 transition-all flex items-center gap-1.5 cursor-pointer"
          title="Zoom to maximum real Google Satellite imagery resolution available at this location"
        >
          <span class="text-xs">⌕</span>
          <span>MAX ZOOM</span>
        </button>

        <!-- ROOF CLOSE-UP Button (Requirement 5) -->
        <button
          type="button"
          @click="handleRoofCloseUp"
          class="px-2.5 py-1.5 rounded-xl bg-cyan-950/95 hover:bg-cyan-900 active:scale-95 text-cyan-200 border border-cyan-800 font-bold text-[10px] shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
          title="Center on roof and zoom to highest practical view"
        >
          <span>🎯</span>
          <span>ROOF CLOSE-UP</span>
        </button>

        <!-- Zoom In / Out / Reset View controls -->
        <div class="flex flex-col items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg">
          <button
            type="button"
            @click="handleZoomIn"
            :disabled="currentZoom >= availableMaxZoom"
            class="w-8 h-8 rounded-lg hover:bg-slate-800 text-white flex items-center justify-center font-bold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Zoom In (+)"
          >
            +
          </button>
          <button
            type="button"
            @click="handleZoomOut"
            :disabled="currentZoom <= 12"
            class="w-8 h-8 rounded-lg hover:bg-slate-800 text-white flex items-center justify-center font-bold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Zoom Out (−)"
          >
            −
          </button>
          <button
            type="button"
            @click="handleResetView"
            class="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Reset to Center"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- REDRAW ROOF CONFIRMATION MODAL (Requirement 11) -->
    <div
      v-if="showRedrawConfirmModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-slate-100">
        <h3 class="font-bold text-sm text-amber-400 flex items-center gap-2">
          <span>📐</span>
          <span>Redraw Roof Boundary?</span>
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          The current roof boundary will be cleared so you can trace fresh corner points on Google Satellite imagery.
        </p>
        <div class="flex gap-2 pt-2">
          <button
            type="button"
            @click="showRedrawConfirmModal = false"
            class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            @click="confirmRedrawRoof"
            class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-colors shadow-md"
          >
            CONFIRM REDRAW
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

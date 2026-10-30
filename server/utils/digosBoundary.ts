import boundaryData from '../data/digos_boundary.json'

const rawData = (boundaryData as any).default || boundaryData
const poly = rawData?.geojson?.coordinates?.[0] || []
const [rawSouth, rawNorth, rawWest, rawEast] = (rawData?.boundingbox || []).map(Number)

export const DIGOS_BOUNDS = {
  south: rawSouth || 6.7232825,
  north: rawNorth || 6.9873416,
  west: rawWest || 125.2554354,
  east: rawEast || 125.5244491
}

export function isInsideDigosCity(lat: number, lng: number): boolean {
  let actualLat = Number(lat)
  let actualLng = Number(lng)

  // Auto-detect swapped [lng, lat] parameters (longitude is ~125, latitude is ~6)
  if (actualLat > 50 && actualLng < 50) {
    actualLat = Number(lng)
    actualLng = Number(lat)
  }

  if (typeof actualLat !== 'number' || typeof actualLng !== 'number' || isNaN(actualLat) || isNaN(actualLng)) {
    return false
  }

  // Fast Bounding box pre-check
  if (
    actualLat < DIGOS_BOUNDS.south ||
    actualLat > DIGOS_BOUNDS.north ||
    actualLng < DIGOS_BOUNDS.west ||
    actualLng > DIGOS_BOUNDS.east
  ) {
    return false
  }

  // Ray-casting against official Digos City boundary polygon
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ptI = poly[i]
    const ptJ = poly[j]
    if (!ptI || !ptJ) continue

    const xi = ptI[0]
    const yi = ptI[1]
    const xj = ptJ[0]
    const yj = ptJ[1]

    const intersect =
      yi > actualLat !== yj > actualLat &&
      actualLng < ((xj - xi) * (actualLat - yi)) / (yj - yi) + xi
    if (intersect) {
      inside = !inside
    }
  }

  return inside
}

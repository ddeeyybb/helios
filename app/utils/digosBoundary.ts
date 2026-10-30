/**
 * Digos City Geographic Boundary & Validation Engine
 *
 * Official administrative boundary of Digos City, Davao del Sur, Philippines.
 * Restricts all HELIOS-LOAD Site Assessment operations exclusively to Digos City.
 */

import { DIGOS_BOUNDARY_POLYGON, DIGOS_BOUNDING_BOX } from '../data/digosBoundaryData'

export const DIGOS_CITY_CENTER: [number, number] = [125.3572, 6.7497] // [lng, lat]
export const DIGOS_CITY_LAT = 6.7497
export const DIGOS_CITY_LNG = 125.3572
export const DIGOS_CITY_DEFAULT_ZOOM = 13.5

export const DIGOS_CITY_NAME = 'Digos City'
export const DIGOS_PROVINCE_NAME = 'Davao del Sur'
export const DIGOS_COUNTRY_NAME = 'Philippines'

export const DIGOS_RESTRICTION_TITLE = 'Location outside Digos City'
export const DIGOS_RESTRICTION_MESSAGE = 'HELIOS-LOAD Site Assessment is currently limited to Digos City.'
export const DIGOS_SEARCH_RESTRICTION_MESSAGE = 'Only properties within Digos City are supported.'

export { DIGOS_BOUNDING_BOX, DIGOS_BOUNDARY_POLYGON }


/**
 * Reusable validation function: isInsideDigosCity(latitude, longitude)
 *
 * Uses ray-casting point-in-polygon algorithm against the official administrative
 * boundary polygon of Digos City, Davao del Sur.
 * Includes an immediate bounding box pre-check for high-speed rejection.
 *
 * @param latitude WGS-84 latitude
 * @param longitude WGS-84 longitude
 * @returns boolean true if the coordinate is strictly inside Digos City
 */
export function isInsideDigosCity(latitude: number, longitude: number): boolean {
  let actualLat = Number(latitude)
  let actualLng = Number(longitude)

  // Auto-detect swapped [lng, lat] parameters (longitude is ~125, latitude is ~6)
  if (actualLat > 50 && actualLng < 50) {
    actualLat = Number(longitude)
    actualLng = Number(latitude)
  }

  if (
    typeof actualLat !== 'number' ||
    typeof actualLng !== 'number' ||
    isNaN(actualLat) ||
    isNaN(actualLng)
  ) {
    return false
  }

  // 1. Fast bounding box pre-check
  if (
    actualLat < DIGOS_BOUNDING_BOX.south ||
    actualLat > DIGOS_BOUNDING_BOX.north ||
    actualLng < DIGOS_BOUNDING_BOX.west ||
    actualLng > DIGOS_BOUNDING_BOX.east
  ) {
    return false
  }

  // 2. High-precision ray casting algorithm against official polygon
  const poly = DIGOS_BOUNDARY_POLYGON
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

/**
 * Returns the boundary GeoJSON for Digos City boundary rendering if needed
 */
export function getDigosBoundaryGeoJson() {
  return {
    type: 'Feature' as const,
    properties: {
      name: DIGOS_CITY_NAME,
      province: DIGOS_PROVINCE_NAME
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [DIGOS_BOUNDARY_POLYGON]
    }
  }
}

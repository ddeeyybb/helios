/**
 * HELIOS-LOAD Local Coordinate Projection Engine
 * 
 * Converts geographic coordinates (latitude, longitude, elevation)
 * into a local Cartesian coordinate system (x, y, z) in meters, centered at the building center:
 * - x: East (+) / West (-) distance in meters
 * - y: Elevation in meters (normalized relative to building ground level)
 * - z: North (+) / South (-) distance in meters
 * 
 * Building Center is strictly projected to (0, 0, 0).
 */

import type { RoofVertex } from '../../../types/roof'

const EARTH_RADIUS_METERS = 6378137.0 // WGS84 Earth Equatorial Radius

export class CoordinateProjectionService {
  /**
   * Converts a latitude/longitude offset to local East/North distance in meters
   */
  static latLngToLocal(
    lat: number,
    lng: number,
    centerLat: number,
    centerLng: number,
    elevationMeters = 0,
    baseElevationMeters = 0
  ): RoofVertex {
    const latRad = (lat * Math.PI) / 180
    const centerLatRad = (centerLat * Math.PI) / 180
    const dLatRad = ((lat - centerLat) * Math.PI) / 180
    const dLngRad = ((lng - centerLng) * Math.PI) / 180

    // North/South distance (z): + is North, - is South
    const z = dLatRad * EARTH_RADIUS_METERS

    // East/West distance (x): + is East, - is West
    // Adjusted by cosine of latitude to account for meridian convergence
    const meanLatRad = (latRad + centerLatRad) / 2
    const x = dLngRad * EARTH_RADIUS_METERS * Math.cos(meanLatRad)

    // Elevation (y): relative height above building datum
    const y = elevationMeters - baseElevationMeters

    return {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      z: Number(z.toFixed(3))
    }
  }

  /**
   * Converts local Cartesian coordinates (x, z) back to geographic coordinates
   */
  static localToLatLng(
    x: number,
    z: number,
    centerLat: number,
    centerLng: number
  ): { latitude: number; longitude: number } {
    const dLatRad = z / EARTH_RADIUS_METERS
    const lat = centerLat + (dLatRad * 180) / Math.PI

    const latRad = (lat * Math.PI) / 180
    const centerLatRad = (centerLat * Math.PI) / 180
    const meanLatRad = (latRad + centerLatRad) / 2

    const dLngRad = x / (EARTH_RADIUS_METERS * Math.cos(meanLatRad))
    const lng = centerLng + (dLngRad * 180) / Math.PI

    return {
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lng.toFixed(7))
    }
  }

  /**
   * Calculates geodesic distance between two lat/lng coordinates in meters
   */
  static distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Number((EARTH_RADIUS_METERS * c).toFixed(2))
  }
}

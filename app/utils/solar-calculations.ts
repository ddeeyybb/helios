/**
 * HELIOS-LOAD Solar Position & Shading Physics Engine
 * 
 * Provides rigorous, real-time solar geometry:
 * - Solar Altitude and Solar Azimuth calculation from Latitude, Longitude, Date, and Time (NOAA solar model)
 * - Obstruction shadow projection (shadowLength = height / tan(solarAltitude))
 * - Roof intersection area estimation and risk classification
 * - Annual solar energy yield calculations with full formula visibility
 */

import type { RoofObstacle, ShadingAssessmentRecord } from '~/types/roof'

export interface SolarPositionResult {
  solarAltitudeDeg: number // Angle above horizon (-90° to +90°)
  solarAzimuthDeg: number // Degrees clockwise from North (0° = N, 90° = E, 180° = S, 270° = W)
  sunAboveHorizon: boolean
  formattedTime: string
  solarNoon: string
}

export interface ShadowGeometry {
  obstacleId: string
  obstacleType: string
  obstacleName: string
  heightM: number
  shadowLengthM: number
  shadowDirectionDeg: number // Opposite of sun azimuth
  startPoint: { x: number; y: number; z: number }
  endPoint: { x: number; y: number; z: number }
  polygon: Array<{ x: number; y: number; z: number }>
}

/**
 * Calculates solar altitude and azimuth using standard astronomical equations (NOAA solar geometry algorithm).
 */
export function calculateSolarPosition(
  lat: number,
  lng: number,
  targetDate: Date = new Date()
): SolarPositionResult {
  const rad = Math.PI / 180
  const deg = 180 / Math.PI

  // Day of year and fractional year
  const startOfYear = new Date(targetDate.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((targetDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const hours = targetDate.getHours() + targetDate.getMinutes() / 60 + targetDate.getSeconds() / 3600

  // Fractional year (gamma in radians)
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hours - 12) / 24)

  // Equation of time in minutes
  const eqtime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  )

  // Solar declination in radians
  const decl = 0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  // Time zone offset in hours (Philippine Standard Time is UTC+8)
  const timezoneOffsetHours = -targetDate.getTimezoneOffset() / 60

  // True Solar Time in minutes
  const timeOffset = eqtime + 4 * lng - 60 * timezoneOffsetHours
  const trueSolarTime = hours * 60 + timeOffset

  // Solar Hour Angle in degrees
  let ha = (trueSolarTime / 4) - 180
  if (ha < -180) ha += 360
  if (ha > 180) ha -= 360
  const haRad = ha * rad

  const latRad = lat * rad

  // Solar Zenith Angle
  const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad)
  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)))
  const zenithDeg = zenithRad * deg

  // Solar Altitude (elevation above horizon)
  const altitudeDeg = Number((90 - zenithDeg).toFixed(2))

  // Solar Azimuth (degrees clockwise from North)
  let azimuthDeg = 0
  if (zenithDeg > 0.001) {
    const cosAzimuth = (Math.sin(decl) - Math.sin(latRad) * Math.cos(zenithRad)) / (Math.cos(latRad) * Math.sin(zenithRad))
    const clampedCosAz = Math.max(-1, Math.min(1, cosAzimuth))
    azimuthDeg = Math.acos(clampedCosAz) * deg
    if (ha > 0) {
      azimuthDeg = 360 - azimuthDeg
    }
    azimuthDeg = Number(azimuthDeg.toFixed(2))
  }

  const sunAboveHorizon = altitudeDeg > 0

  return {
    solarAltitudeDeg: altitudeDeg,
    solarAzimuthDeg: azimuthDeg,
    sunAboveHorizon,
    formattedTime: targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    solarNoon: '12:00 PM'
  }
}

/**
 * Calculates the projected shadow for a single rooftop or nearby obstruction.
 * Physics:
 *   shadowLength = obstructionHeight / tan(solarAltitude)
 * Shadow vector direction = (solarAzimuth + 180°) mod 360°
 */
export function calculateObstructionShadow(
  obs: RoofObstacle,
  solarAltitudeDeg: number,
  solarAzimuthDeg: number,
  roofEaveHeightM = 3.5
): ShadowGeometry | null {
  if (solarAltitudeDeg <= 0) {
    return null
  }

  const rad = Math.PI / 180
  const heightAboveRoof = Math.max(0.5, obs.heightM)

  // Clamp minimum altitude to 1.5° to avoid infinite shadows at the horizon line
  const effectiveAltitude = Math.max(1.5, solarAltitudeDeg)
  const shadowLengthM = Number((heightAboveRoof / Math.tan(effectiveAltitude * rad)).toFixed(2))

  // Shadow projects in the direction opposite to the sun's rays
  const shadowDirectionDeg = (solarAzimuthDeg + 180) % 360
  const dirRad = shadowDirectionDeg * rad

  const dx = shadowLengthM * Math.sin(dirRad)
  const dz = shadowLengthM * Math.cos(dirRad)

  const startX = obs.position?.x ?? 0
  const startY = (obs.position?.y ?? roofEaveHeightM)
  const startZ = obs.position?.z ?? 0

  const endX = startX + dx
  const endZ = startZ + dz
  const endY = startY // Projected onto roof elevation plane

  // Determine shadow width / spread based on obstruction type
  let spreadM = 1.0
  if (obs.type === 'Tree') {
    spreadM = (obs.canopyRadiusM || 3.0) * 2
  } else if (obs.type === 'Water Tank') {
    spreadM = (obs.radiusM || 1.2) * 2
  } else if (obs.widthM) {
    spreadM = obs.widthM
  }

  // Orthogonal vector for shadow width
  const perpRad = dirRad + Math.PI / 2
  const halfSpread = spreadM / 2
  const px = halfSpread * Math.sin(perpRad)
  const pz = halfSpread * Math.cos(perpRad)

  // 4-corner trapezoid / polygon representing the shadow cast on the surface
  const polygon = [
    { x: Number((startX - px).toFixed(3)), y: startY, z: Number((startZ - pz).toFixed(3)) },
    { x: Number((startX + px).toFixed(3)), y: startY, z: Number((startZ + pz).toFixed(3)) },
    { x: Number((endX + px * 1.3).toFixed(3)), y: endY, z: Number((endZ + pz * 1.3).toFixed(3)) },
    { x: Number((endX - px * 1.3).toFixed(3)), y: endY, z: Number((endZ - pz * 1.3).toFixed(3)) }
  ]

  return {
    obstacleId: obs.id,
    obstacleType: obs.type,
    obstacleName: obs.name || obs.type,
    heightM: obs.heightM,
    shadowLengthM,
    shadowDirectionDeg: Number(shadowDirectionDeg.toFixed(1)),
    startPoint: { x: startX, y: startY, z: startZ },
    endPoint: { x: endX, y: endY, z: endZ },
    polygon
  }
}

/**
 * Evaluates shading over the entire usable roof boundary.
 * Computes direct sun area, estimated shaded area, and shading risk level.
 */
export function evaluateShadingAssessment(
  roofPolygon2D: Array<{ x: number; z: number }>,
  usableRoofAreaSqM: number,
  obstructions: RoofObstacle[],
  solarAltitudeDeg: number,
  solarAzimuthDeg: number,
  dateStr: string,
  timeStr: string,
  preset: 'Today' | 'Morning' | 'Noon' | 'Afternoon' | 'Custom' = 'Today',
  roofEaveHeightM = 3.5
): ShadingAssessmentRecord {
  if (solarAltitudeDeg <= 0 || usableRoofAreaSqM <= 0 || obstructions.length === 0) {
    const isNight = solarAltitudeDeg <= 0
    return {
      date: dateStr,
      time: timeStr,
      preset,
      solarAltitudeDeg,
      solarAzimuthDeg,
      sunAboveHorizon: !isNight,
      directSunAreaM2: isNight ? 0 : usableRoofAreaSqM,
      shadedAreaM2: isNight ? usableRoofAreaSqM : 0,
      shadingPercentage: isNight ? 100 : 0,
      riskLevel: isNight ? 'VERY HIGH' : 'LOW',
      shadowLengthM: 0,
      shadowPolygons: []
    }
  }

  const shadowGeometries: ShadowGeometry[] = []
  let totalShadowLength = 0

  obstructions.forEach(obs => {
    const shadow = calculateObstructionShadow(obs, solarAltitudeDeg, solarAzimuthDeg, roofEaveHeightM)
    if (shadow) {
      shadowGeometries.push(shadow)
      totalShadowLength += shadow.shadowLengthM
    }
  })

  const avgShadowLength = shadowGeometries.length > 0
    ? Number((totalShadowLength / shadowGeometries.length).toFixed(1))
    : 0

  // Approximate overlapping area between shadow trapezoids and usable roof
  let totalEstimatedShadedArea = 0

  shadowGeometries.forEach(shadow => {
    let approxShadowArea = 0
    if (shadow.polygon.length >= 4) {
      const p0 = shadow.polygon[0]!
      const p1 = shadow.polygon[1]!
      const p2 = shadow.polygon[2]!
      const p3 = shadow.polygon[3]!
      const widthBase = Math.hypot(p1.x - p0.x, p1.z - p0.z)
      const widthEnd = Math.hypot(p2.x - p3.x, p2.z - p3.z)
      const avgWidth = (widthBase + widthEnd) / 2
      approxShadowArea = avgWidth * shadow.shadowLengthM
    }

    // Fraction that intersects the rooftop
    // If obstruction is directly on the roof (distance 0), substantial fraction falls on roof
    const dist = (obsDistancesMap.get(shadow.obstacleId) ?? 2.0)
    let overlapFactor = 0.5
    if (dist <= 0) overlapFactor = 0.85
    else if (dist <= 3) overlapFactor = 0.55
    else if (dist <= 8) overlapFactor = 0.25
    else overlapFactor = 0.1

    totalEstimatedShadedArea += approxShadowArea * overlapFactor
  })

  // Constrain shaded area to usable roof area
  const boundedShadedArea = Math.min(usableRoofAreaSqM, Number(totalEstimatedShadedArea.toFixed(1)))
  const directSunArea = Math.max(0, Number((usableRoofAreaSqM - boundedShadedArea).toFixed(1)))
  const shadingPercent = Number(((boundedShadedArea / usableRoofAreaSqM) * 100).toFixed(1))

  // Risk Classification:
  // 0–10%: LOW
  // 10–25%: MODERATE
  // 25–50%: HIGH
  // 50%+: VERY HIGH
  let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH' = 'LOW'
  if (shadingPercent > 50) riskLevel = 'VERY HIGH'
  else if (shadingPercent > 25) riskLevel = 'HIGH'
  else if (shadingPercent > 10) riskLevel = 'MODERATE'

  const shadowPolygons = shadowGeometries.map(s => ({
    obstacleId: s.obstacleId,
    obstacleType: s.obstacleType,
    points: s.polygon
  }))

  return {
    date: dateStr,
    time: timeStr,
    preset,
    solarAltitudeDeg,
    solarAzimuthDeg,
    sunAboveHorizon: true,
    directSunAreaM2: directSunArea,
    shadedAreaM2: boundedShadedArea,
    shadingPercentage: shadingPercent,
    riskLevel,
    shadowLengthM: avgShadowLength,
    shadowPolygons
  }
}

// Distance map cache helper
const obsDistancesMap = new Map<string, number>()
export function registerObstacleDistance(id: string, distanceM: number) {
  obsDistancesMap.set(id, distanceM)
}

/**
 * Calculates Estimated Annual Solar Energy Generation with explicit formula visibility.
 * Formula: Capacity (kWp) × Peak Sun Hours (h/day) × 365 days × Performance Ratio × Shading Factor
 */
export function calculateAnnualSolarEnergy(
  capacityKwp: number,
  peakSunHours = 4.5,
  performanceRatio = 0.80,
  shadingFactor = 0.90
): {
  estimatedAnnualEnergyKwh: number
  formulaString: string
  dailyAverageKwh: number
} {
  if (capacityKwp <= 0) {
    return {
      estimatedAnnualEnergyKwh: 0,
      formulaString: '0 kWp × 4.5 PSH × 365 × 80% × 90% = 0 kWh/yr',
      dailyAverageKwh: 0
    }
  }

  const annualKwh = Math.round(
    capacityKwp * peakSunHours * 365 * performanceRatio * shadingFactor
  )

  const dailyAvg = Number((annualKwh / 365).toFixed(1))
  const formulaString = `${capacityKwp.toFixed(1)} kWp × ${peakSunHours} PSH × 365 days × ${(performanceRatio * 100).toFixed(0)}% PR × ${(shadingFactor * 100).toFixed(0)}% SF = ${annualKwh.toLocaleString()} kWh/yr`

  return {
    estimatedAnnualEnergyKwh: annualKwh,
    formulaString,
    dailyAverageKwh: dailyAvg
  }
}

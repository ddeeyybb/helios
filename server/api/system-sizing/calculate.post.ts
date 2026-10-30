import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const moduleCount = Number(body?.moduleCount || 0)
  const moduleWattage = Number(body?.moduleWattage || 450)
  const inverterCount = Number(body?.inverterCount || 1)
  const inverterCapacityKw = Number(body?.inverterCapacityKw || 10)

  const systemDcCapacityKwp = Number(((moduleCount * moduleWattage) / 1000).toFixed(2))
  const totalInverterKw = inverterCount * inverterCapacityKw
  const dcAcRatio = totalInverterKw > 0 ? Number((systemDcCapacityKwp / totalInverterKw).toFixed(2)) : 0

  let inverterCompatibility: 'Compatible' | 'Requires Review' | 'Incompatible' = 'Requires Review'
  let message = ''

  if (dcAcRatio >= 1.05 && dcAcRatio <= 1.35) {
    inverterCompatibility = 'Compatible'
    message = 'Optimal DC/AC ratio within standard manufacturer inverter limits.'
  } else if (dcAcRatio > 1.35) {
    inverterCompatibility = 'Requires Review'
    message = 'DC/AC ratio exceeds 1.35; potential inverter clipping during peak midday solar irradiance.'
  } else if (dcAcRatio > 0 && dcAcRatio < 1.0) {
    inverterCompatibility = 'Requires Review'
    message = 'Inverter is oversized relative to DC PV capacity.'
  } else {
    inverterCompatibility = 'Incompatible'
    message = 'Zero or invalid inverter / module configuration.'
  }

  return {
    success: true,
    systemDcCapacityKwp,
    totalInverterKw,
    dcAcRatio,
    inverterCompatibility,
    message,
    source: 'CALCULATED'
  }
})

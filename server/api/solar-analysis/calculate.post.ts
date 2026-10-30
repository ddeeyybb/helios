import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const dcKwp = Number(body?.dcKwp || 0)
  const peakSunHours = Number(body?.peakSunHours || 4.8)
  const performanceRatio = Number(body?.performanceRatio || 0.82)

  if (dcKwp <= 0) {
    return {
      success: false,
      message: 'System DC capacity in kWp is required for solar calculation.',
      estimatedAnnualKwh: 0,
      monthlyKwh: []
    }
  }

  const annualKwh = Math.round(dcKwp * peakSunHours * 365 * performanceRatio)
  const weights = [0.082, 0.084, 0.095, 0.098, 0.092, 0.085, 0.082, 0.084, 0.080, 0.076, 0.070, 0.072]
  const monthlyKwh = weights.map(w => Math.round(annualKwh * w))

  return {
    success: true,
    estimatedAnnualKwh: annualKwh,
    monthlyKwh,
    peakSunHours,
    performanceRatio,
    source: 'CALCULATED'
  }
})

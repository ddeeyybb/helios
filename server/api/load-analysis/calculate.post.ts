import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const monthlyKwh = Array.isArray(body?.monthlyKwh) ? body.monthlyKwh : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const solarAnnualKwh = Number(body?.solarAnnualKwh || 0)

  const annualKwh = monthlyKwh.reduce((acc: number, val: number) => acc + (Number(val) || 0), 0)
  const avgMonthlyKwh = Math.round(annualKwh / 12)
  const avgDailyKwh = Number((annualKwh / 365).toFixed(1))
  const peakDemandKw = Number(((annualKwh / 8760) * 2.2).toFixed(2))

  const solarCoveragePercent = annualKwh > 0 ? Math.min(100, Math.round((solarAnnualKwh / annualKwh) * 100)) : 0
  const selfConsumptionPercent = solarAnnualKwh > 0 ? Math.min(100, Math.round((Math.min(annualKwh * 0.75, solarAnnualKwh) / solarAnnualKwh) * 100)) : 0

  return {
    success: true,
    annualKwh,
    avgMonthlyKwh,
    avgDailyKwh,
    peakDemandKw,
    solarCoveragePercent,
    selfConsumptionPercent,
    source: 'CALCULATED'
  }
})

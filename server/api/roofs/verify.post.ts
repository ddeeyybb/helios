import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body) {
    return {
      success: false,
      message: 'No roof verification payload provided.'
    }
  }

  const { googlePitchDeg, verifiedPitchDeg, googleAreaM2, verifiedAreaM2, roofType, verifiedBy } = body

  // Validation
  if (verifiedPitchDeg !== undefined && (verifiedPitchDeg < 0 || verifiedPitchDeg > 90)) {
    return {
      success: false,
      message: 'Roof pitch must be between 0° and 90°.'
    }
  }

  if (verifiedAreaM2 !== undefined && verifiedAreaM2 < 0) {
    return {
      success: false,
      message: 'Roof area must be greater than 0.'
    }
  }

  return {
    success: true,
    message: 'Roof verification recorded successfully.',
    data: {
      status: 'Verified',
      roofType: roofType || 'Unknown',
      googlePitchDeg: googlePitchDeg ?? null,
      verifiedPitchDeg: verifiedPitchDeg ?? googlePitchDeg ?? null,
      googleAreaM2: googleAreaM2 ?? null,
      verifiedAreaM2: verifiedAreaM2 ?? googleAreaM2 ?? null,
      source: 'INSTALLER_VERIFIED',
      verifiedBy: verifiedBy || 'Installer',
      verifiedAt: new Date().toISOString()
    }
  }
})

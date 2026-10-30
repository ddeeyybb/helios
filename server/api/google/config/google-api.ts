/**
 * Centralized Google API Configuration
 *
 * Exposes the Google API key to server-side services (Solar, Geocoding, Places)
 * and authorized client-side loaders.
 */

export const GOOGLE_API_KEY = 'AIzaSyCYehwonmZHdlT2d6aTTPcbJmRRCnDlrNs'

export default defineEventHandler((event) => {
  return {
    apiKey: GOOGLE_API_KEY
  }
})

import type { PropertyLocation, RoofTypeOption } from '~/types/assessment'
import { isInsideDigosCity, DIGOS_CITY_CENTER as DIGOS_CENTER_COORDS, DIGOS_BOUNDING_BOX } from '~/utils/digosBoundary'

export const DIGOS_CITY_CENTER = {
  latitude: DIGOS_CENTER_COORDS[1],
  longitude: DIGOS_CENTER_COORDS[0]
}

export const DIGOS_BOUNDS = DIGOS_BOUNDING_BOX

export { isInsideDigosCity }

// Backward compatibility alias
export const isInsideDigos = isInsideDigosCity

export const SAMPLE_PROPERTIES: PropertyLocation[] = [
  {
    id: 'sample-digos-01',
    name: '[SAMPLE] Digos City Hall Landmark',
    address: 'Provincial Capitol Compound, Brgy. Matti, Digos City, Davao del Sur',
    latitude: 6.7329,
    longitude: 125.3415,
    city: 'Digos City',
    province: 'Davao del Sur',
    status: 'Ready for Site Assessment',
    notes: 'Official municipal reference landmark in Brgy. Matti, Digos City.',
    source: 'DEMO / SAMPLE REFERENCE'
  },
  {
    id: 'sample-digos-02',
    name: '[SAMPLE] Digos Central Public Terminal Area',
    address: 'Rizal Avenue, Zone 1, Digos City, Davao del Sur',
    latitude: 6.7497,
    longitude: 125.3572,
    city: 'Digos City',
    province: 'Davao del Sur',
    status: 'Ready for Site Assessment',
    notes: 'Central business district landmark in downtown Digos City.',
    source: 'DEMO / SAMPLE REFERENCE'
  },
  {
    id: 'sample-digos-03',
    name: '[SAMPLE] Aplaya Coastal Survey Point',
    address: 'National Highway, Brgy. Aplaya, Digos City, Davao del Sur',
    latitude: 6.7554,
    longitude: 125.3648,
    city: 'Digos City',
    province: 'Davao del Sur',
    status: 'Ready for Site Assessment',
    notes: 'Coastal zone geographic reference in Brgy. Aplaya, Digos City.',
    source: 'DEMO / SAMPLE REFERENCE'
  },
  {
    id: 'sample-digos-04',
    name: '[SAMPLE] San Jose Community Center',
    address: 'Quezon Boulevard, Brgy. San Jose, Digos City, Davao del Sur',
    latitude: 6.7443,
    longitude: 125.3565,
    city: 'Digos City',
    province: 'Davao del Sur',
    status: 'Ready for Site Assessment',
    notes: 'High-density residential/mixed area in Brgy. San Jose, Digos City.',
    source: 'DEMO / SAMPLE REFERENCE'
  }
]

export const ALL_ROOF_TYPES: RoofTypeOption[] = [
  'Gable',
  'Hip',
  'Dutch Gable',
  'Hip & Valley',
  'Cross Gable',
  'Gambrel',
  'Pyramid',
  'Saltbox',
  'Clerestory',
  'Jerkinhead',
  'Butterfly',
  'Bonnet',
  'M',
  'Shed',
  'Flat',
  'Arched',
  'L-Shaped / Complex',
  'Irregular / Other',
  'Unknown'
]

export const SOLAR_WORKFLOW_STEPS = [
  { id: 1, name: 'Property', shortDesc: 'Site Geolocation', status: 'completed' },
  { id: 2, name: 'Roof Assessment', shortDesc: 'Boundary & Surfaces', status: 'active' },
  { id: 3, name: 'Roof Verification', shortDesc: 'Installer Validation', status: 'pending' },
  { id: 4, name: '3D Rooftop', shortDesc: 'Roof Wireframe (Babylon.js)', status: 'locked' },
  { id: 5, name: 'Solar Layout', shortDesc: 'PV Array Placement', status: 'locked' },
  { id: 6, name: 'Solar Analysis', shortDesc: 'Irradiance & Shading', status: 'locked' },
  { id: 7, name: 'Load Analysis', shortDesc: 'Facility Demand Curves', status: 'locked' },
  { id: 8, name: 'System Sizing', shortDesc: 'Inverter & Battery Math', status: 'locked' },
  { id: 9, name: 'Feasibility', shortDesc: 'LCOE & Yield Metrics', status: 'locked' },
  { id: 10, name: 'Report', shortDesc: 'Engineering Submittal', status: 'locked' }
] as const

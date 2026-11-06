/**
 * HELIOS-LOAD Local Solar Panel Catalog
 * Typed specifications for verified Tier-1 solar panel manufacturers:
 * - Trina Solar
 * - Canadian Solar
 * - Jinko Solar
 * 
 * Readily extensible for additional brands and models.
 */

export interface SolarPanelSpecification {
  id: string
  manufacturer: string // e.g. 'Trina Solar' | 'Canadian Solar' | 'Jinko Solar'
  model: string // e.g. 'Vertex S+ TSM-NEG9R.28 440W'
  modelName: string // e.g. 'Vertex S+ TSM-NEG9R.28 440W' (alias for model)
  series?: string
  ratedPowerW?: number // e.g. 440
  widthM?: number // e.g. 1.134
  heightM?: number // physical module length / height in meters, e.g. 1.762
  thicknessM?: number // physical frame thickness in meters, e.g. 0.030
  efficiencyPercent?: number // e.g. 22.0
  cellType?: string
  bifacial?: boolean
}

export interface SolarPanelBrand {
  id: string
  name: string
  models: SolarPanelSpecification[]
}

export const SOLAR_PANEL_BRANDS: SolarPanelBrand[] = [
  {
    id: 'trina-solar',
    name: 'Trina Solar',
    models: [
      {
        id: 'trina-neg9r28-440',
        manufacturer: 'Trina Solar',
        model: 'Vertex S+ TSM-NEG9R.28 440W',
        modelName: 'Vertex S+ TSM-NEG9R.28 440W',
        series: 'Vertex S+',
        ratedPowerW: 440,
        widthM: 1.134,
        heightM: 1.762,
        thicknessM: 0.030,
        efficiencyPercent: 22.0,
        cellType: 'N-type TOPCon Monocrystalline',
        bifacial: true
      },
      {
        id: 'trina-de19r-580',
        manufacturer: 'Trina Solar',
        model: 'Vertex TSM-DE19R 580W',
        modelName: 'Vertex TSM-DE19R 580W',
        series: 'Vertex',
        ratedPowerW: 580,
        widthM: 1.134,
        heightM: 2.384,
        thicknessM: 0.030,
        efficiencyPercent: 21.5,
        cellType: 'Monocrystalline',
        bifacial: false
      },
      {
        id: 'trina-de21-660',
        manufacturer: 'Trina Solar',
        model: 'Vertex TSM-DE21 660W',
        modelName: 'Vertex TSM-DE21 660W',
        series: 'Vertex',
        ratedPowerW: 660,
        widthM: 1.303,
        heightM: 2.384,
        thicknessM: 0.035,
        efficiencyPercent: 21.2,
        cellType: 'Monocrystalline',
        bifacial: false
      }
    ]
  },
  {
    id: 'canadian-solar',
    name: 'Canadian Solar',
    models: [
      {
        id: 'cs-cs6r-410ms',
        manufacturer: 'Canadian Solar',
        model: 'HiKu6 CS6R-410MS 410W',
        modelName: 'HiKu6 CS6R-410MS 410W',
        series: 'HiKu6',
        ratedPowerW: 410,
        widthM: 1.134,
        heightM: 1.722,
        thicknessM: 0.030,
        efficiencyPercent: 21.0,
        cellType: 'PERC Monocrystalline',
        bifacial: false
      },
      {
        id: 'cs-cs7l-590ms',
        manufacturer: 'Canadian Solar',
        model: 'HiKu7 CS7L-590MS 590W',
        modelName: 'HiKu7 CS7L-590MS 590W',
        series: 'HiKu7',
        ratedPowerW: 590,
        widthM: 1.134,
        heightM: 2.172,
        thicknessM: 0.035,
        efficiencyPercent: 20.8,
        cellType: 'Monocrystalline',
        bifacial: false
      },
      {
        id: 'cs-cs7n-660mb',
        manufacturer: 'Canadian Solar',
        model: 'BiHiKu7 CS7N-660MB-AG 660W',
        modelName: 'BiHiKu7 CS7N-660MB-AG 660W',
        series: 'BiHiKu7',
        ratedPowerW: 660,
        widthM: 1.303,
        heightM: 2.384,
        thicknessM: 0.035,
        efficiencyPercent: 21.2,
        cellType: 'Bifacial Monocrystalline',
        bifacial: true
      }
    ]
  },
  {
    id: 'jinko-solar',
    name: 'Jinko Solar',
    models: [
      {
        id: 'jinko-tiger-neo-420',
        manufacturer: 'Jinko Solar',
        model: 'Tiger Neo 54HL4-B 420W',
        modelName: 'Tiger Neo 54HL4-B 420W',
        series: 'Tiger Neo',
        ratedPowerW: 420,
        widthM: 1.134,
        heightM: 1.722,
        thicknessM: 0.030,
        efficiencyPercent: 21.51,
        cellType: 'N-type TOPCon Monocrystalline',
        bifacial: false
      },
      {
        id: 'jinko-tiger-neo-575',
        manufacturer: 'Jinko Solar',
        model: 'Tiger Neo 72HL4-BDV 575W',
        modelName: 'Tiger Neo 72HL4-BDV 575W',
        series: 'Tiger Neo',
        ratedPowerW: 575,
        widthM: 1.134,
        heightM: 2.278,
        thicknessM: 0.030,
        efficiencyPercent: 22.26,
        cellType: 'N-type TOPCon Bifacial',
        bifacial: true
      },
      {
        id: 'jinko-tiger-pro-545',
        manufacturer: 'Jinko Solar',
        model: 'Tiger Pro 72HC 545W',
        modelName: 'Tiger Pro 72HC 545W',
        series: 'Tiger Pro',
        ratedPowerW: 545,
        widthM: 1.134,
        heightM: 2.274,
        thicknessM: 0.035,
        efficiencyPercent: 21.13,
        cellType: 'Monocrystalline',
        bifacial: false
      }
    ]
  }
]

export function getSolarPanelBrands(): SolarPanelBrand[] {
  return SOLAR_PANEL_BRANDS
}

export function getPanelModelsByBrand(brandName: string): SolarPanelSpecification[] {
  const brand = SOLAR_PANEL_BRANDS.find(b => b.name.toLowerCase() === brandName.toLowerCase())
  return brand ? brand.models : []
}

export function findPanelModel(brandName: string, modelName: string): SolarPanelSpecification | undefined {
  const brand = SOLAR_PANEL_BRANDS.find(b => b.name.toLowerCase() === brandName.toLowerCase())
  if (!brand) return undefined
  return brand.models.find(m => (m.modelName || m.model).toLowerCase() === modelName.toLowerCase())
}

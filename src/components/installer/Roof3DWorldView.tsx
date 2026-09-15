import React, { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds } from '@react-three/drei';
import {
  Sun,
  CloudSun,
  Layers,
  MapPin,
  Search,
  UserPlus,
  Compass,
  Cpu,
  Zap,
  Percent,
  Info,
  Building2,
  CheckCircle2,
  Trash2,
  MousePointerClick,
  Sparkles,
  Grid,
  Loader2,
} from 'lucide-react';

import { SkyEnvironment3D } from './SkyEnvironment3D';
import { House3DEngine, ManualPanel, RoofStyle } from './House3DEngine';
import { DigosGroundPlane, PerimeterPoint } from './DigosGroundPlane';
import { MapEngineView, RoofFootprint } from './MapEngineView';
import { AddHomeownerModal, HomeownerData, DIGOS_BARANGAYS } from './AddHomeownerModal';
import { useSolarContext } from '../../SolarContext';
import { fetchRoofSegmentation, getCroppedSatelliteSnippet } from '../../services/roofAiService';

export interface SolarModulePreset {
  id: string;
  brand: string;
  model: string;
  name: string;
  wattage: number; // in Watts
  length: number;  // in meters
  width: number;   // in meters
}

export const SOLAR_MODULE_PRESETS: SolarModulePreset[] = [
  {
    id: 'rec_430',
    brand: 'REC Group',
    model: 'Alpha Pure-R',
    name: 'REC Group Alpha Pure-R (430W)',
    wattage: 430,
    length: 1.73,
    width: 1.12,
  },
  {
    id: 'maxeon_440',
    brand: 'Maxeon',
    model: 'Maxeon 6 AC',
    name: 'Maxeon 6 AC (440W)',
    wattage: 440,
    length: 1.87,
    width: 1.03,
  },
  {
    id: 'qcells_400',
    brand: 'Qcells',
    model: 'Q.PEAK DUO',
    name: 'Qcells Q.PEAK DUO (400W)',
    wattage: 400,
    length: 1.88,
    width: 1.05,
  },
  {
    id: 'canadian_450',
    brand: 'Canadian Solar',
    model: 'HiKu6',
    name: 'Canadian Solar HiKu6 (450W)',
    wattage: 450,
    length: 1.90,
    width: 1.13,
  },
  {
    id: 'jinko_470',
    brand: 'JinkoSolar',
    model: 'Tiger Neo',
    name: 'JinkoSolar Tiger Neo (470W)',
    wattage: 470,
    length: 1.90,
    width: 1.13,
  },
];

export const Roof3DWorldView: React.FC = () => {
  const { addToast, activeClient, appState, setActiveView } = useSolarContext();

  // Active Customer State synced with SolarContext activeClient
  const [activeCustomer, setActiveCustomer] = useState<HomeownerData>({
    id: activeClient?.accessId || activeClient?.id || 'HL-492012',
    name: activeClient?.name || 'Engr. Antonio Alcantara',
    barangay: activeClient?.barangay || 'Brgy. Zone 1 (Poblacion)',
    city: activeClient?.city || 'Digos City',
    province: activeClient?.province || 'Davao del Sur',
    address: activeClient?.address || 'Brgy. Zone 1 (Poblacion), Digos City, Davao del Sur',
    phone: activeClient?.phone || '+63 917 882 1948',
    dailyNeedKwh: activeClient?.dailyNeedKwh || 28,
  });

  // UI Modes ('3d' vs 'map')
  const [activeViewMode, setActiveViewMode] = useState<'3d' | 'map'>('3d');
  const [sunlightLevel, setSunlightLevel] = useState<'HIGH' | 'LOW'>('HIGH');
  const [isPerimeterMode, setIsPerimeterMode] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // ---------------- AI ROOF SEGMENTATION STATE ----------------
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [aiDetectedType, setAiDetectedType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ---------------- 1. EMPTY START STATE & DIMENSIONS ----------------
  const [hasRoof, setHasRoof] = useState<boolean>(false);
  const [roofStyle, setRoofStyle] = useState<RoofStyle>('gable');
  const [pitchDeg, setPitchDeg] = useState<number>(15);
  const [baseWidth, setBaseWidth] = useState<number>(8.0);
  const [baseLength, setBaseLength] = useState<number>(10.0);
  const [dailyNeedKwh, setDailyNeedKwh] = useState<number>(activeCustomer.dailyNeedKwh);

  // ---------------- 2. SOLAR MODULE SPECIFICATION STATE ----------------
  const [selectedModuleId, setSelectedModuleId] = useState<string>('rec_430');

  // ---------------- 3. PANEL PLACEMENT MODES ----------------
  const [panelLayoutMode, setPanelLayoutMode] = useState<'auto' | 'manual'>('auto');
  const [autoEnabled, setAutoEnabled] = useState<boolean>(false);
  const [rows, setRows] = useState<number>(2);
  const [cols, setCols] = useState<number>(4);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [manualPanels, setManualPanels] = useState<ManualPanel[]>([]);
  const [perimeterPoints, setPerimeterPoints] = useState<PerimeterPoint[]>([]);

  // Selected Module Object
  const selectedModule = useMemo(() => {
    return (
      SOLAR_MODULE_PRESETS.find((m) => m.id === selectedModuleId) ||
      SOLAR_MODULE_PRESETS[0]
    );
  }, [selectedModuleId]);

  // Sync active customer whenever activeClient changes
  useEffect(() => {
    if (activeClient) {
      const updatedData: HomeownerData = {
        id: activeClient.accessId || activeClient.id,
        name: activeClient.name,
        barangay: activeClient.barangay || 'Brgy. Zone 1 (Poblacion)',
        city: activeClient.city || 'Digos City',
        province: activeClient.province || 'Davao del Sur',
        address: activeClient.address,
        phone: activeClient.phone,
        dailyNeedKwh: activeClient.dailyNeedKwh || 28,
      };
      setActiveCustomer(updatedData);
      setDailyNeedKwh(updatedData.dailyNeedKwh);
      setPerimeterPoints([]);
    }
  }, [activeClient, appState?.freshCanvasTimestamp]);

  // ---------------- 4. 3D ROOF & SOLAR MATHEMATICS (ZERO-DIVIDE GUARDED) ----------------
  const isMono = roofStyle === 'mono';
  const isFlat = roofStyle === 'flat';
  const effectivePitch = isFlat ? 0 : Math.max(0, Math.min(45, pitchDeg || 0));
  const pitchRad = (effectivePitch * Math.PI) / 180;
  const cosPitch = Math.cos(pitchRad);
  const safeCos = cosPitch > 0.0001 ? cosPitch : 1.0;

  const safeW = Math.max(1.0, Math.min(100.0, baseWidth || 1.0));  // X-axis (building length)
  const safeL = Math.max(1.0, Math.min(100.0, baseLength || 1.0)); // Z-axis (eaves span)
  const halfDepth = safeL / 2;

  const slantLength3D = hasRoof && safeL > 0
    ? (isMono ? safeL / safeCos : halfDepth / safeCos)
    : 0;

  const trueSlopedArea = hasRoof && safeW > 0 && safeL > 0
    ? (isMono || isFlat ? slantLength3D * safeW : 2 * (slantLength3D * safeW))
    : 0;

  const flatBaseArea = hasRoof ? safeW * safeL : 0;

  // Active Panel Count with strict 0-bounds safety
  const panelCount = useMemo(() => {
    if (!hasRoof) return 0;
    if (panelLayoutMode === 'auto') {
      if (!autoEnabled || rows <= 0 || cols <= 0) return 0;
      return isMono ? rows * cols : rows * cols * 2;
    }
    return manualPanels.length;
  }, [hasRoof, panelLayoutMode, autoEnabled, rows, cols, isMono, manualPanels]);

  // Dynamic System Power Size (kW) = (Selected Watts * Panel Count) / 1000
  const systemSizeKW = (panelCount * selectedModule.wattage) / 1000;

  // Southern Mindanao Solar Irradiance (4.5 PSH standard base)
  const peakSunHours = sunlightLevel === 'HIGH' ? 4.5 : 3.6;

  // Power Generated Per Day (kWh/day) = System kW * Peak Sun Hours (4.5 PSH base)
  const dailyYieldKwh = hasRoof ? systemSizeKW * peakSunHours : 0;

  // Power Offset Percentage
  const powerOffsetPct = hasRoof && dailyNeedKwh > 0 ? Math.min(100, (dailyYieldKwh / dailyNeedKwh) * 100) : 0;

  // Autocomplete Filter
  const filteredBarangays = useMemo(() => {
    if (!searchQuery.trim()) return DIGOS_BARANGAYS;
    return DIGOS_BARANGAYS.filter((b) =>
      b.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Handle roof captured from MapLibre satellite tracing
  const handleRoofCaptured = (footprint: RoofFootprint) => {
    const clampedW = Math.max(1.0, Math.min(50.0, Number(footprint.widthMeters.toFixed(1))));
    const clampedL = Math.max(1.0, Math.min(50.0, Number(footprint.lengthMeters.toFixed(1))));
    setBaseWidth(clampedW);
    setBaseLength(clampedL);
    setHasRoof(true);
    setAutoEnabled(false);
    setManualPanels([]);
    setActiveViewMode('3d');

    if (addToast) {
      addToast(
        `Captured roof outline (${clampedW.toFixed(1)}m × ${clampedL.toFixed(1)}m). Extruded 3D Roof!`,
        'success'
      );
    }
  };

  const handleManualRoofInit = () => {
    setBaseWidth(8.0);
    setBaseLength(10.0);
    setHasRoof(true);
    setAutoEnabled(false);
    setManualPanels([]);
    if (addToast) {
      addToast('Created 3D roof plane (8.0m × 10.0m). Configure settings or place panels.', 'info');
    }
  };

  // ---------------- AI AUTO-DETECT ROOF HANDLER (YOLOv8-seg FastAPI) ----------------
  const handleAiAutoDetect = async (mapInstance?: any, points?: Array<[number, number]>) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    if (addToast) {
      addToast('Cropping satellite image snippet & analyzing via YOLOv8-seg...', 'info');
    }

    try {
      let cropBlob: Blob | null = null;
      if (mapInstance) {
        cropBlob = await getCroppedSatelliteSnippet(
          mapInstance,
          points?.[0],
          points?.[1],
          points?.[2],
          points?.[3]
        );
      } else {
        const mapCanvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null;
        if (mapCanvas) {
          const offscreen = document.createElement('canvas');
          const size = Math.min(512, mapCanvas.width, mapCanvas.height);
          offscreen.width = size;
          offscreen.height = size;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(
              mapCanvas,
              (mapCanvas.width - size) / 2,
              (mapCanvas.height - size) / 2,
              size,
              size,
              0,
              0,
              size,
              size
            );
            cropBlob = await new Promise<Blob | null>((res) => offscreen.toBlob(res, 'image/jpeg', 0.95));
          }
        }
      }

      // Send clean cropped image snippet to FastAPI YOLOv8-seg backend
      const result = await fetchRoofSegmentation(cropBlob, 47.6, 6.2);

      const targetWidth = result.dimensions?.width || 47.6;
      const targetLength = result.dimensions?.length || 6.2;

      setRoofStyle(result.roof_type);
      setAiConfidence(result.confidence);
      setAiDetectedType(result.roof_type);
      setBaseWidth(targetWidth);
      setBaseLength(targetLength);
      setHasRoof(true);
      setAutoEnabled(true);

      if (addToast) {
        addToast(
          result.message ||
            `⚡ AI YOLOv8-seg Extruded ${result.roof_type.toUpperCase()} Roof (${targetWidth}m × ${targetLength}m, ${(result.confidence * 100).toFixed(0)}% confidence)!`,
          'success'
        );
      }

      // Automatically switch from Map View to 3D View upon receiving response
      setActiveViewMode('3d');
    } catch (err: any) {
      const msg = err?.message || 'Failed to detect roof geometry via AI.';
      setErrorMessage(msg);
      if (addToast) {
        addToast(msg, 'error');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClearAllPanels = () => {
    setAutoEnabled(false);
    setManualPanels([]);
    if (addToast) {
      addToast('Cleared all solar panels.', 'info');
    }
  };

  const handleAddManualPanel = (panel: ManualPanel) => {
    setManualPanels((prev) => [...prev, panel]);
  };

  const handleRemoveManualPanel = (panelId: string) => {
    setManualPanels((prev) => prev.filter((p) => p.id !== panelId));
  };

  const handleSaveHomeowner = (newHomeowner: HomeownerData) => {
    setActiveCustomer(newHomeowner);
    setDailyNeedKwh(newHomeowner.dailyNeedKwh);
    setPerimeterPoints([]);
    if (addToast) {
      addToast(`Active client set to ${newHomeowner.name} (${newHomeowner.barangay})`, 'success');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F4F5F7] text-slate-900 overflow-hidden font-sans select-none">
      {/* ---------------- 1. DYNAMIC TOP NAVIGATION HEADER ---------------- */}
      <header className="shrink-0 w-full flex flex-wrap items-center justify-between gap-4 p-3.5 px-6 bg-white border-b border-slate-100 z-20 shadow-xs">
        {/* Left Branding & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs shrink-0">
              <Zap className="w-5 h-5 fill-emerald-600 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-wide text-slate-900">HELIOS</span>
                <span className="bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full text-[10px] border border-emerald-100">
                  DIGOS
                </span>
              </div>
              <p className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                <MapPin className="w-3 h-3 text-emerald-600" /> Digos City, Davao del Sur
              </p>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-slate-200 hidden sm:block" />

          {/* Mode Toggles: "3D Roof View" vs "Map View" */}
          <div className="flex bg-[#F4F5F7] p-1 rounded-full border border-slate-200/80 text-xs font-medium shadow-xs">
            <button
              onClick={() => setActiveViewMode('3d')}
              className={`px-4 py-1.5 rounded-full flex items-center gap-1.5 transition cursor-pointer ${
                activeViewMode === '3d'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              3D Roof View
            </button>
            <button
              onClick={() => setActiveViewMode('map')}
              className={`px-4 py-1.5 rounded-full flex items-center gap-1.5 transition cursor-pointer ${
                activeViewMode === 'map'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-slate-600" />
              Map View
            </button>
          </div>
        </div>

        {/* 
          CONDITIONAL TOP RIGHT CONTROLS:
          SHOW ONLY when activeViewMode === '3d'.
          HIDE when activeViewMode === 'map' to keep map header clean!
        */}
        {activeViewMode === '3d' && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Location Input Bar */}
            <div className="relative hidden md:block">
              <div className="flex items-center bg-white border border-slate-200 rounded-full px-4 py-2 w-56 focus-within:border-emerald-500 transition shadow-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search Location..."
                  value={searchQuery}
                  onFocus={() => setIsSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  className="bg-transparent text-xs text-slate-900 focus:outline-none w-full placeholder:text-slate-400 font-medium"
                />
              </div>

              {/* Autocomplete Dropdown */}
              {isSearchOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto z-50">
                  {filteredBarangays.map((brgy) => (
                    <button
                      key={brgy}
                      onClick={() => {
                        setActiveCustomer((prev) => ({
                          ...prev,
                          barangay: brgy,
                          address: `${brgy}, Digos City, Davao del Sur`,
                        }));
                        setSearchQuery('');
                        setIsSearchOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition border-b border-slate-100 last:border-0 cursor-pointer"
                    >
                      {brgy}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sunlight: High / Low Badge Switcher */}
            <div className="flex items-center bg-[#F4F5F7] p-1 rounded-full border border-slate-200/80 shadow-xs">
              <button
                onClick={() => setSunlightLevel('HIGH')}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  sunlightLevel === 'HIGH'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Sunlight: High
              </button>
              <button
                onClick={() => setSunlightLevel('LOW')}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  sunlightLevel === 'LOW'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <CloudSun className="w-3.5 h-3.5" />
                Sunlight: Low
              </button>
            </div>

            {/* Active Client Badge */}
            <div className="hidden lg:flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-full border border-slate-200 shadow-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-[11px] leading-tight">
                <span className="text-slate-400 block text-[9px]">Client:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[130px] block">
                  {activeCustomer.name}
                </span>
              </div>
            </div>

            {/* ⚡ AI Auto-Detect Roof Button */}
            <button
              onClick={handleAiAutoDetect}
              disabled={isAnalyzing}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-semibold px-4 py-2 rounded-full text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Analyzing (YOLOv8)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ AI Auto-Detect Roof</span>
                </>
              )}
            </button>

            {/* + Add Homeowner Button */}
            <button
              onClick={() => setActiveView('add-homeowner')}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              + Add Homeowner
            </button>
          </div>
        )}

        {/* AI Button in Map View Header */}
        {activeViewMode === 'map' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleAiAutoDetect}
              disabled={isAnalyzing}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-semibold px-4 py-2 rounded-full text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Analyzing Satellite View...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ AI Auto-Detect Roof</span>
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {/* ---------------- 2. MAIN WORKSPACE CONTAINER ---------------- */}
      <div className="flex-1 min-h-0 w-full flex flex-row overflow-hidden relative">
        {/* VIEW 1: 3D ROOF VIEW */}
        {activeViewMode === '3d' ? (
          <div className="flex-1 min-h-0 w-full h-full relative bg-[#F4F5F7]">
            <Canvas
              shadows
              camera={{ position: [14, 12, 16], fov: 45 }}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            >
              {/* Sky Dome */}
              <SkyEnvironment3D season={sunlightLevel === 'HIGH' ? 'DRY' : 'WET'} />

              {/* Digos Ground Coordinate Plane */}
              <DigosGroundPlane
                isPerimeterMode={isPerimeterMode}
                perimeterPoints={perimeterPoints}
                onAddPoint={(pt) => setPerimeterPoints((prev) => [...prev, pt])}
                onClearPoints={() => setPerimeterPoints([])}
              />

              {/* Floating 3D Roof Mesh (Renders ONLY when hasRoof === true) */}
              {hasRoof && (
                <Bounds fit clip observe margin={1.2}>
                  <House3DEngine
                    hasRoof={hasRoof}
                    roofStyle={roofStyle}
                    width={baseWidth}
                    depth={baseLength}
                    elevation={3.8}
                    pitchDeg={pitchDeg}
                    layoutMode={panelLayoutMode}
                    autoEnabled={autoEnabled}
                    rows={rows}
                    cols={cols}
                    manualPanels={manualPanels}
                    onAddManualPanel={handleAddManualPanel}
                    onRemoveManualPanel={handleRemoveManualPanel}
                    isLandscape={isLandscape}
                    moduleLength={selectedModule.length}
                    moduleWidth={selectedModule.width}
                    moduleWattage={selectedModule.wattage}
                    moduleLabel={`${selectedModule.brand} ${selectedModule.model}`}
                  />
                </Bounds>
              )}

              <OrbitControls
                makeDefault
                maxPolarAngle={Math.PI / 2 - 0.05}
                minDistance={3}
                maxDistance={120}
              />
            </Canvas>

            {/* Empty Start State Guidance Overlay (when no roof drawn) */}
            {!hasRoof && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
                <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-100 p-8 shadow-xl max-w-md text-center pointer-events-auto space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-xs">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      No Roof Outline Drawn Yet
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Switch to Map View and tap 4 corners on a satellite roof image to extrude an accurate 3D model.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      onClick={() => setActiveViewMode('map')}
                      className="flex-1 py-2.5 px-4 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Draw Roof Outline on Map</span>
                    </button>
                    <button
                      onClick={handleManualRoofInit}
                      className="py-2.5 px-4 rounded-full bg-[#F4F5F7] hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
                    >
                      Use Default 8×10m
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- FLOATING LIGHT NEUMORPHIC TELEMETRY CARD ---------------- */}
            <div className="absolute top-6 left-6 z-20 pointer-events-none flex flex-col gap-3">
              <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-3xl border border-slate-100 p-5 shadow-sm max-w-sm space-y-3.5 text-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${hasRoof ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                      SOLAR SYSTEM DETAILS
                    </span>
                  </div>
                  <span className="bg-emerald-50 text-emerald-600 font-semibold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-100 truncate max-w-[140px]">
                    {selectedModule.wattage}W • {selectedModule.model}
                  </span>
                </div>

                {/* AI Detection Telemetry Badge */}
                {aiConfidence !== null && (
                  <div className="bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-[10px] font-bold px-3 py-1.5 rounded-xl flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>AI Model: YOLOv8-seg</span>
                    </span>
                    <span className="uppercase font-mono text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs">
                      {roofStyle} ({(aiConfidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                )}

                {/* 2x2 Metric Grid (STRICTLY 0 WHEN NO ROOF DRAWN) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Metric 1: TOTAL ROOF SIZE */}
                  <div className="bg-[#F4F5F7] p-3 rounded-2xl border border-slate-200/60">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      TOTAL ROOF SIZE
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold font-mono text-slate-900">
                        {hasRoof ? trueSlopedArea.toFixed(1) : '0.0'}
                      </span>
                      <span className="text-xs font-mono text-slate-500">m²</span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                      {hasRoof ? `Flat: ${flatBaseArea.toFixed(0)}m² (${pitchDeg}°)` : 'No roof drawn'}
                    </span>
                  </div>

                  {/* Metric 2: NUMBER OF PANELS */}
                  <div className="bg-[#F4F5F7] p-3 rounded-2xl border border-slate-200/60">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      NUMBER OF PANELS
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold font-mono text-emerald-600">
                        {panelCount}
                      </span>
                      <span className="text-xs font-mono text-slate-500">panels</span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                      {panelLayoutMode === 'auto' && autoEnabled ? `${rows}×${cols} auto` : `${panelCount} placed`}
                    </span>
                  </div>

                  {/* Metric 3: SYSTEM POWER SIZE */}
                  <div className="bg-[#F4F5F7] p-3 rounded-2xl border border-slate-200/60">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      SYSTEM POWER SIZE
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold font-mono text-slate-900">
                        {systemSizeKW.toFixed(2)}
                      </span>
                      <span className="text-xs font-mono text-slate-500">kW</span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400 truncate block">
                      {panelCount} × {selectedModule.wattage}W ({selectedModule.brand})
                    </span>
                  </div>

                  {/* Metric 4: POWER GENERATED PER DAY */}
                  <div className="bg-[#F4F5F7] p-3 rounded-2xl border border-slate-200/60">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      POWER GENERATED PER DAY
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold font-mono text-emerald-600">
                        {dailyYieldKwh.toFixed(1)}
                      </span>
                      <span className="text-xs font-mono text-slate-500">kWh/day</span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                      {peakSunHours} Sun Hours/day (4.5 PSH)
                    </span>
                  </div>
                </div>

                {/* Daily Power Offset Bar */}
                <div className="p-3 bg-emerald-50/80 border border-emerald-100 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 block">
                        Power Offset
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        Daily Power Used: {dailyNeedKwh} kWh/day
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-bold font-mono text-emerald-700">
                    {powerOffsetPct.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: MAPLIBRE SATELLITE (FULL SCREEN - 100% WIDTH) */
          <div className="flex-1 min-h-0 w-full h-full relative">
            <MapEngineView
              onRoofCaptured={handleRoofCaptured}
              activeBarangay={activeCustomer.barangay}
              onAiAutoDetectFromMap={(mapInst, pts) => handleAiAutoDetect(mapInst, pts)}
              isAnalyzing={isAnalyzing}
            />
          </div>
        )}

        {/* 
          ---------------- 3. ROOF & PANEL SETTINGS SIDEBAR ----------------
          CONDITIONAL RENDERING:
          SHOW when activeViewMode === '3d'
          COMPLETELY HIDE when activeViewMode === 'map' so the satellite map expands to 100% full width!
        */}
        {activeViewMode === '3d' && (
          <aside className="w-80 shrink-0 h-full overflow-hidden flex flex-col bg-white border-l border-slate-100 shadow-sm">
            {/* Sidebar Header */}
            <div className="shrink-0 p-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  ROOF & PANEL SETTINGS
                </h2>
              </div>
              <span className="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-100">
                DIGOS CITY
              </span>
            </div>

            {/* Interactive Sliders & Geometries */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {/* Quick Switch to Map View */}
              <button
                onClick={() => setActiveViewMode('map')}
                className="w-full py-2.5 px-4 rounded-full bg-[#F4F5F7] hover:bg-slate-200/80 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-emerald-600" />
                <span>Open Map View</span>
              </button>

              {/* ---------------- 1. ROOF STYLE DROPDOWN (WITH AI / MANUAL OVERRIDE) ---------------- */}
              <div className="p-3.5 bg-[#F4F5F7] border border-slate-200/60 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-900">
                    Roof Style
                  </label>
                  {aiConfidence !== null && (
                    <span className="text-[9px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      AI: {aiDetectedType?.toUpperCase()}
                    </span>
                  )}
                </div>
                <select
                  value={roofStyle}
                  onChange={(e) => setRoofStyle(e.target.value as RoofStyle)}
                  className="w-full rounded-full bg-white border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 shadow-xs cursor-pointer"
                >
                  <option value="gable">Gable Roof (Default)</option>
                  <option value="flat">Flat Roof</option>
                  <option value="hip">Hip Roof (4-Slope)</option>
                  <option value="mono">Mono-Slope (Shed)</option>
                </select>
              </div>

              {/* ---------------- 2. SOLAR MODULE BRAND DROPDOWN ---------------- */}
              <div className="p-3.5 bg-[#F4F5F7] border border-slate-200/60 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-900">
                    Solar Module Brand
                  </label>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {selectedModule.wattage}W
                  </span>
                </div>
                <select
                  value={selectedModuleId}
                  onChange={(e) => {
                    setSelectedModuleId(e.target.value);
                    const mod = SOLAR_MODULE_PRESETS.find((m) => m.id === e.target.value);
                    if (mod && addToast) {
                      addToast(`Selected ${mod.brand} ${mod.model} (${mod.wattage}W)`, 'info');
                    }
                  }}
                  className="w-full rounded-full bg-white border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 shadow-xs cursor-pointer"
                >
                  {SOLAR_MODULE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>

                {/* Module Physical Footprint Dimensions Pill */}
                <div className="bg-white/90 border border-slate-200/80 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-slate-800">{selectedModule.brand}</span>
                  </div>
                  <div className="font-mono text-emerald-700 font-bold">
                    {selectedModule.length}m × {selectedModule.width}m (1:1 scale)
                  </div>
                </div>
              </div>

              {/* ---------------- 3. PANEL LAYOUT MODE DROPDOWN ---------------- */}
              <div className="p-3.5 bg-[#F4F5F7] border border-slate-200/60 rounded-2xl space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-900">
                  Panel Layout Mode
                </label>
                <select
                  value={panelLayoutMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'auto' | 'manual';
                    setPanelLayoutMode(mode);
                    if (mode === 'auto') {
                      setAutoEnabled(true);
                    }
                  }}
                  className="w-full rounded-full bg-white border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 shadow-xs cursor-pointer"
                >
                  <option value="auto">Auto-Grid Fill</option>
                  <option value="manual">Manual Click Placement</option>
                </select>

                {panelLayoutMode === 'manual' ? (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                    💡 Click directly on the 3D roof plane to place a panel. Click a placed panel to remove it.
                  </p>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setAutoEnabled(true)}
                      className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                        autoEnabled
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      Fill Roof Grid
                    </button>
                    <button
                      onClick={handleClearAllPanels}
                      className="py-1.5 px-3 rounded-full bg-white text-slate-600 hover:text-rose-600 border border-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* ---------------- SLIDERS CONTAINER ---------------- */}
              <div className="space-y-4 pt-1">
                {/* Roof Pitch Angle */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label>Roof Pitch Angle</label>
                    <span className="font-mono text-emerald-600 font-bold">
                      {isFlat ? '0° (Flat)' : `${effectivePitch}°`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    step={1}
                    value={effectivePitch}
                    disabled={isFlat}
                    onChange={(e) => setPitchDeg(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Flat (0°)</span>
                    <span className="text-emerald-700 font-semibold">15° Standard GI</span>
                    <span>Steep (45°)</span>
                  </div>
                </div>

                {/* Roof Width */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label>Roof Width</label>
                    <span className="font-mono text-slate-900 font-bold">{baseWidth.toFixed(1)} m</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="100.0"
                    step="0.1"
                    value={baseWidth}
                    onChange={(e) => {
                      const val = Math.max(1.0, Math.min(100.0, Number(e.target.value)));
                      setBaseWidth(val);
                      if (val > 0 && baseLength > 0) setHasRoof(true);
                    }}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Roof Length */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label>Roof Length</label>
                    <span className="font-mono text-slate-900 font-bold">{baseLength.toFixed(1)} m</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="100.0"
                    step="0.1"
                    value={baseLength}
                    onChange={(e) => {
                      const val = Math.max(1.0, Math.min(100.0, Number(e.target.value)));
                      setBaseLength(val);
                      if (val > 0 && baseWidth > 0) setHasRoof(true);
                    }}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Panel Rows */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label>Panel Rows</label>
                    <span className="font-mono text-emerald-600 font-bold">{rows} Rows</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={rows}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(20, Number(e.target.value)));
                      setRows(val);
                      if (panelLayoutMode === 'auto' && val > 0 && cols > 0) setAutoEnabled(true);
                    }}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Panel Columns */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label>Panel Columns</label>
                    <span className="font-mono text-emerald-600 font-bold">{cols} Columns</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={cols}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(20, Number(e.target.value)));
                      setCols(val);
                      if (panelLayoutMode === 'auto' && val > 0 && rows > 0) setAutoEnabled(true);
                    }}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Panel Position */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-700 font-medium">Panel Position</span>
                  <button
                    onClick={() => setIsLandscape(!isLandscape)}
                    className="px-3 py-1.5 rounded-full bg-[#F4F5F7] border border-slate-200 text-xs font-mono text-slate-800 hover:border-emerald-500 transition cursor-pointer shadow-xs"
                  >
                    {isLandscape
                      ? `Landscape (${selectedModule.width}m × ${selectedModule.length}m)`
                      : `Portrait (${selectedModule.length}m × ${selectedModule.width}m)`}
                  </button>
                </div>

                {/* Daily Power Used */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label>Daily Power Used</label>
                    <span className="font-mono text-emerald-600 font-bold">
                      {dailyNeedKwh} kWh/day
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={dailyNeedKwh}
                    onChange={(e) => setDailyNeedKwh(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Clear All Panels Button */}
                <div className="pt-2">
                  <button
                    onClick={handleClearAllPanels}
                    className="w-full py-2 px-4 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All Panels</span>
                  </button>
                </div>
              </div>

              {/* Technical Context Info */}
              <div className="p-3.5 bg-[#F4F5F7] border border-slate-200/60 rounded-2xl space-y-1 text-[11px] text-slate-600 font-medium">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs mb-1">
                  <Info className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Solar Info</span>
                </div>
                <p>• Standard GI corrugated roofs use a 15° pitch.</p>
                <p>• Digos City solar power: 4.5 – 5.1 kWh/day per kW.</p>
                <p>
                  • Active Module: {selectedModule.brand} {selectedModule.model} ({selectedModule.wattage}W, {selectedModule.length}m × {selectedModule.width}m).
                </p>
              </div>
            </div>

            {/* Sidebar Footer */}
            <div className="shrink-0 p-3 border-t border-slate-100 bg-white text-center">
              <p className="text-[10px] font-mono text-slate-400">
                Helios Solar Platform • Digos City, Davao del Sur
              </p>
            </div>
          </aside>
        )}
      </div>

      {/* ---------------- 4. ADD HOMEOWNER MODAL POPUP ---------------- */}
      <AddHomeownerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaveHomeowner={handleSaveHomeowner}
      />
    </div>
  );
};

export default Roof3DWorldView;

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Compass,
  Search,
  Maximize2,
  MousePointerClick,
  Building2,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { BlueprintOverlayTool, OverlaySettings } from './BlueprintOverlayTool';
import { calculateGeographicDimensions, calculateHaversine } from '../../services/roofAiService';

export interface RoofFootprint {
  corners: Array<[number, number]>; // [lng, lat]
  widthMeters: number;              // Flat base width (m) -> Three.js X-axis
  lengthMeters: number;             // Flat base length (m) -> Three.js Z-axis
  flatAreaSqm: number;              // Flat area (m²)
}

interface MapEngineViewProps {
  onRoofCaptured: (footprint: RoofFootprint) => void;
  activeBarangay?: string;
  onAiAutoDetectFromMap?: (mapInstance: maplibregl.Map | null, points: Array<[number, number]>) => void;
  isAnalyzing?: boolean;
}

// Digos City, Davao del Sur geographic constants (Lat: 6.7495, Lng: 125.3572)
const DIGOS_COORDINATES: [number, number] = [125.3572, 6.7495]; // [lng, lat]

export const MapEngineView: React.FC<MapEngineViewProps> = ({
  onRoofCaptured,
  activeBarangay = 'Brgy. Zone 1 (Poblacion)',
  onAiAutoDetectFromMap,
  isAnalyzing = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const cornerMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>(DIGOS_COORDINATES);
  const [tileProvider] = useState<'google' | 'esri'>('google');
  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTracingActive, setIsTracingActive] = useState<boolean>(false);
  const [tracedPoints, setTracedPoints] = useState<Array<[number, number]>>([]);

  // Site Photo Overlay State
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    imageUrl: null,
    imageName: null,
    scale: 1.0,
    rotation: 0,
    opacity: 0.85,
    offsetX: 0,
    offsetY: 0,
    isVisible: true,
  });

  const [isOverlayPanelOpen, setIsOverlayPanelOpen] = useState<boolean>(false);

  // References for map event access
  const isTracingRef = useRef<boolean>(false);
  const tracedPointsRef = useRef<Array<[number, number]>>([]);

  useEffect(() => {
    isTracingRef.current = isTracingActive;
    tracedPointsRef.current = tracedPoints;
  }, [isTracingActive, tracedPoints]);

  // ---------------- HAVERSINE DISTANCE MATH BRIDGE ----------------
  // - Map Geographic Length (distance P1 to P3 along Longitude) -> Three.js X-axis (Mesh Width)
  // - Map Geographic Width (distance P1 to P2 along Latitude) -> Three.js Z-axis (Mesh Depth)
  const calculatedMetrics = useMemo(() => {
    if (tracedPoints.length < 4) {
      return { width: 0, length: 0, area: 0 };
    }
    const [p1, p2, p3, p4] = tracedPoints;

    const dims = calculateGeographicDimensions(p1, p2, p3, p4);
    const width = dims.width;
    const length = dims.length;
    const area = parseFloat((width * length).toFixed(2));

    return { width, length, area };
  }, [tracedPoints]);

  // Initialize MapLibre GL JS
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    // Crisp, raw satellite raster tiles with ZERO text/labels/road lines
    const tileUrl =
      tileProvider === 'google'
        ? 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      preserveDrawingBuffer: true, // Allows clean canvas cropping and image export
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            maxzoom: 20,
          },
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            paint: { 'raster-resampling': 'linear' },
          },
        ],
      },
      center: mapCenter,
      zoom: 19.5,
      maxZoom: 20,
      pitch: 0,
    });

    mapRef.current = map;

    // Navigation Controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // HIDE ALL MAP TEXT, LABELS, POIS, STREET NAMES
      const style = map.getStyle();
      if (style && style.layers) {
        style.layers.forEach((layer) => {
          if (
            layer.type === 'symbol' ||
            layer.id.includes('label') ||
            layer.id.includes('poi') ||
            layer.id.includes('street') ||
            layer.id.includes('road')
          ) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        });
      }

      // GeoJSON source for drawing 2D roof polygon
      map.addSource('roof-polygon', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Fill Layer
      map.addLayer({
        id: 'roof-polygon-fill',
        type: 'fill',
        source: 'roof-polygon',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.35,
        },
      });

      // Outline Stroke Layer
      map.addLayer({
        id: 'roof-polygon-stroke',
        type: 'line',
        source: 'roof-polygon',
        paint: {
          'line-color': '#059669',
          'line-width': 3,
        },
      });

      // Click handler for 4-corner roof tracing
      map.on('click', (e) => {
        if (isTracingRef.current) {
          const newPt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const currentPts = [...tracedPointsRef.current];

          if (currentPts.length >= 4) {
            return;
          }

          const nextPts = [...currentPts, newPt];
          setTracedPoints(nextPts);

          // Update MapLibre GeoJSON Source
          const source = map.getSource('roof-polygon') as maplibregl.GeoJSONSource;
          if (source) {
            const coords = [...nextPts];
            if (coords.length >= 3) {
              coords.push(coords[0]); // close loop
              source.setData({
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [coords] },
              });
            }
          }

          if (nextPts.length === 4) {
            setIsTracingActive(false);
          }
        }
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Polygon and Markers whenever tracedPoints change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing corner HTML markers
    cornerMarkersRef.current.forEach((m) => m.remove());
    cornerMarkersRef.current = [];

    // Add visual corner pins
    tracedPoints.forEach((pt, index) => {
      const el = document.createElement('div');
      el.className =
        'w-6 h-6 rounded-full bg-emerald-600 text-white font-mono text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-md select-none';
      el.innerText = `P${index + 1}`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(pt)
        .addTo(mapRef.current!);
      cornerMarkersRef.current.push(marker);
    });

    // Update GeoJSON polygon
    const source = mapRef.current.getSource('roof-polygon') as maplibregl.GeoJSONSource;
    if (source) {
      if (tracedPoints.length >= 3) {
        const coords = [...tracedPoints, tracedPoints[0]];
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [coords] },
        });
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [tracedPoints]);

  // Geocoding search handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const query = searchQuery.includes(',')
      ? searchQuery
      : `${searchQuery}, Digos City, Davao del Sur, Philippines`;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const coord: [number, number] = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
        setMapCenter(coord);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: coord, zoom: 19.5, duration: 1800 });
          if (!markerRef.current) {
            markerRef.current = new maplibregl.Marker({ color: '#10b981' })
              .setLngLat(coord)
              .addTo(mapRef.current);
          } else {
            markerRef.current.setLngLat(coord);
          }
        }
      }
    } catch (err) {
      console.warn('Geocoding search failed:', err);
    }
  };

  const handleStartTracing = () => {
    setTracedPoints([]);
    setIsTracingActive(true);
  };

  const handleClearTracing = () => {
    setTracedPoints([]);
    setIsTracingActive(false);
    if (mapRef.current) {
      const source = mapRef.current.getSource('roof-polygon') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  };

  const handleSyncTo3D = () => {
    if (tracedPoints.length === 4 && calculatedMetrics.area > 0) {
      onRoofCaptured({
        corners: tracedPoints,
        widthMeters: Math.max(3, calculatedMetrics.width),
        lengthMeters: Math.max(3, calculatedMetrics.length),
        flatAreaSqm: calculatedMetrics.area,
      });
    }
  };

  return (
    <div className="relative w-full h-full bg-[#F4F5F7] overflow-hidden flex flex-col select-none">
      {/* ---------------- 1. MAP TOOLBAR ---------------- */}
      <div className="absolute top-4 left-4 right-4 z-30 pointer-events-none">
        <div className="pointer-events-auto max-w-[1600px] mx-auto bg-white/95 backdrop-blur-md rounded-3xl border border-slate-100 p-3 px-5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-900">
          {/* Map Location Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">Map Location</span>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border border-emerald-100">
                  6.7495° N, 125.3572° E
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">{activeBarangay}</p>
            </div>
          </div>

          {/* Search Street Bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Street..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full bg-white border border-slate-200 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all font-medium shadow-xs"
              />
            </div>
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-4 py-1.5 rounded-full text-xs shadow-sm transition-all cursor-pointer shrink-0"
            >
              Locate
            </button>
          </form>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Photo Overlay Toggle */}
            <button
              onClick={() => setIsOverlayPanelOpen(!isOverlayPanelOpen)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isOverlayPanelOpen || overlaySettings.imageUrl
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              {overlaySettings.imageUrl ? 'Photo Loaded' : '+ Add Site Photo'}
            </button>

            {/* 3D Tilt View */}
            <button
              onClick={() => {
                const nextPitch = !is3DMode;
                setIs3DMode(nextPitch);
                mapRef.current?.easeTo({ pitch: nextPitch ? 60 : 0, duration: 800 });
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                is3DMode
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" /> 3D Tilt
            </button>

            {/* Draw Roof Outline Button */}
            <button
              onClick={isTracingActive ? handleClearTracing : handleStartTracing}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isTracingActive
                  ? 'bg-amber-500 text-white shadow-sm animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              {isTracingActive
                ? `Tapping Corner (${tracedPoints.length}/4)...`
                : 'Draw Roof Outline'}
            </button>

            {tracedPoints.length > 0 && (
              <button
                onClick={handleClearTracing}
                className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-semibold transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- 2. MAP CONTAINER ---------------- */}
      <div className="relative w-full h-full flex-1">
        <div
          ref={mapContainerRef}
          style={{ cursor: isTracingActive ? 'crosshair' : 'grab' }}
          className="w-full h-full z-0"
        />

        {/* ---------------- 3. SITE PHOTO OVERLAY PLANE ---------------- */}
        {overlaySettings.imageUrl && overlaySettings.isVisible && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-10"
            style={{ opacity: overlaySettings.opacity }}
          >
            <div
              style={{
                transform: `translate(${overlaySettings.offsetX}px, ${overlaySettings.offsetY}px) scale(${overlaySettings.scale}) rotate(${overlaySettings.rotation}deg)`,
                transition: 'transform 0.05s ease-out',
              }}
              className="max-w-[700px] max-h-[700px] pointer-events-none"
            >
              <img
                src={overlaySettings.imageUrl}
                alt="Site Photo Overlay"
                className="w-full h-full object-contain rounded-2xl border-2 border-emerald-400/80 shadow-2xl"
              />
            </div>
          </div>
        )}

        {/* ---------------- 4. FLOATING OVERLAY PANEL ---------------- */}
        {isOverlayPanelOpen && (
          <div className="absolute top-24 left-6 z-40 pointer-events-auto">
            <BlueprintOverlayTool
              settings={overlaySettings}
              onChange={setOverlaySettings}
              onReset={() =>
                setOverlaySettings((prev) => ({
                  ...prev,
                  scale: 1.0,
                  rotation: 0,
                  opacity: 0.85,
                  offsetX: 0,
                  offsetY: 0,
                }))
              }
            />
          </div>
        )}

        {/* ---------------- 5. TRACING INSTRUCTION BADGE ---------------- */}
        {isTracingActive && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div className="bg-slate-900/95 text-white px-5 py-2.5 rounded-full shadow-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-bounce">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Tap 4 corners on the roof to measure dimensions</span>
              <span className="bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-mono text-[10px]">
                {tracedPoints.length} / 4 Set
              </span>
            </div>
          </div>
        )}

        {/* ---------------- 6. BOTTOM METRICS BAR & VIEW IN 3D ---------------- */}
        {tracedPoints.length === 4 && calculatedMetrics.area > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-100 p-4 px-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                {/* Roof Width */}
                <div className="flex flex-col border-r border-slate-100 pr-6">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Roof Width</span>
                  <span className="text-sm font-mono font-bold text-slate-900">
                    {calculatedMetrics.width.toFixed(1)} m
                  </span>
                </div>

                {/* Roof Length */}
                <div className="flex flex-col border-r border-slate-100 pr-6">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Roof Length</span>
                  <span className="text-sm font-mono font-bold text-slate-900">
                    {calculatedMetrics.length.toFixed(1)} m
                  </span>
                </div>

                {/* Flat Roof Area */}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Flat Roof Area</span>
                  <span className="text-sm font-mono font-bold text-emerald-600">
                    {calculatedMetrics.area.toFixed(1)} m²
                  </span>
                </div>
              </div>

              {/* Action Buttons: AI Detect & Standard 3D Sync */}
              <div className="flex items-center gap-2">
                {onAiAutoDetectFromMap && (
                  <button
                    onClick={() => onAiAutoDetectFromMap(mapRef.current, tracedPoints)}
                    disabled={isAnalyzing}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-semibold px-5 py-2.5 rounded-full text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>⚡ AI Auto-Detect & Extrude</span>
                  </button>
                )}

                {/* View in 3D Button */}
                <button
                  onClick={handleSyncTo3D}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <span>View in 3D</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapEngineView;

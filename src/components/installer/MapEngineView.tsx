import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  CheckCircle2,
  Layers,
  Sparkles,
  Box,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { BlueprintOverlayTool, OverlaySettings } from './BlueprintOverlayTool';
import {
  calculatePolygonMetrics,
  calculateHaversine,
  fetchRoofSegmentation,
  getCroppedSatelliteSnippet,
  RoofSlopeCategory,
} from '../../services/roofAiService';
import { snapPinToNearestBoundary, sanitizePolygonCoordinates } from '../../utils/spatialUtils';

export interface RoofFootprint {
  corners: Array<[number, number]>; // [lng, lat]
  polygonPoints?: Array<[number, number]>; // [lng, lat] for arbitrary N-polygon
  widthMeters: number;              // Flat base width (m) -> Three.js X-axis
  lengthMeters: number;             // Flat base length (m) -> Three.js Z-axis
  flatAreaSqm: number;              // Flat area (m²)
  roofType?: string;
  slopeCategory?: RoofSlopeCategory;
  confidence?: number;
  pitchDeg?: number;
}

interface MapEngineViewProps {
  onRoofCaptured: (footprint: RoofFootprint) => void;
  activeBarangay?: string;
  onAiAutoDetectFromMap?: (mapInstance: maplibregl.Map | null, points: Array<[number, number]>) => void;
  isAnalyzing?: boolean;
}

// Digos City, Davao del Sur geographic constants (Lat: 6.7495, Lng: 125.3572)
const DIGOS_COORDINATES: [number, number] = [125.3572, 6.7495]; // [lng, lat]

// High-confidence AI detected roof polygons in Digos City (5 Slope Categories)
const AI_PRESET_ROOFS = [
  {
    id: 'roof-1',
    roofType: 'Trapezoid',
    slopeCategory: 'Trapezoid' as RoofSlopeCategory,
    confidence: 0.96,
    pitchDeg: 18,
    coords: [
      [125.35712, 6.74958],
      [125.35724, 6.74958],
      [125.35724, 6.74944],
      [125.35712, 6.74944],
    ] as Array<[number, number]>,
  },
  {
    id: 'roof-2',
    roofType: 'Triangle',
    slopeCategory: 'Triangle' as RoofSlopeCategory,
    confidence: 0.92,
    pitchDeg: 15,
    coords: [
      [125.35732, 6.74956],
      [125.35742, 6.74956],
      [125.35742, 6.74942],
      [125.35732, 6.74942],
    ] as Array<[number, number]>,
  },
  {
    id: 'roof-3',
    roofType: 'Polygon',
    slopeCategory: 'Polygon' as RoofSlopeCategory,
    confidence: 0.94,
    pitchDeg: 20,
    coords: [
      [125.35695, 6.74965],
      [125.35706, 6.74965],
      [125.35706, 6.74955],
      [125.35702, 6.74955],
      [125.35702, 6.74946],
      [125.35695, 6.74946],
    ] as Array<[number, number]>,
  },
];

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
  const [isClassifying, setIsClassifying] = useState<boolean>(false);

  // Edge Snapping & Selected AI Roof State
  const [selectedAiRoofId, setSelectedAiRoofId] = useState<string | null>(null);
  const [selectedRoofInfo, setSelectedRoofInfo] = useState<{
    slopeCategory: RoofSlopeCategory;
    roofType: string;
    confidence: number;
    widthM: number;
    lengthM: number;
    areaSqm: number;
    coords: Array<[number, number]>;
  } | null>(null);
  const [isReadyToEditOpen, setIsReadyToEditOpen] = useState<boolean>(false);
  const [isSnappingActive, setIsSnappingActive] = useState<boolean>(true);
  const [snapFeedback, setSnapFeedback] = useState<string | null>(null);

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
  const selectedRoofCoordsRef = useRef<Array<[number, number]> | null>(null);

  useEffect(() => {
    isTracingRef.current = isTracingActive;
    tracedPointsRef.current = tracedPoints;
  }, [isTracingActive, tracedPoints]);

  // Dynamic Polygon Metrics
  const calculatedMetrics = useMemo(() => {
    if (tracedPoints.length < 3) {
      return { width: 0, length: 0, area: 0, localPoints: [] };
    }
    return calculatePolygonMetrics(tracedPoints);
  }, [tracedPoints]);

  // Initialize MapLibre GL JS
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const tileUrl =
      tileProvider === 'google'
        ? 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      canvasContextAttributes: { preserveDrawingBuffer: true },
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
      maxZoom: 20.5,
      pitch: 0,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // Hide symbol layers
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

      // 1. AI-Detected Roof Highlight Source & Layers
      const aiFeatures = AI_PRESET_ROOFS.map((roof) => ({
        type: 'Feature' as const,
        id: roof.id,
        properties: {
          id: roof.id,
          roofType: roof.roofType,
          slopeCategory: roof.slopeCategory,
          confidence: roof.confidence,
          pitchDeg: roof.pitchDeg,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...roof.coords, roof.coords[0]]],
        },
      }));

      map.addSource('ai-detected-roofs', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: aiFeatures,
        },
      });

      // AI Roofs Fill: Glowing Green (#00ff88)
      map.addLayer({
        id: 'ai-roofs-fill',
        type: 'fill',
        source: 'ai-detected-roofs',
        paint: {
          'fill-color': '#00ff88',
          'fill-opacity': 0.45,
        },
      });

      // AI Roofs Outline Stroke
      map.addLayer({
        id: 'ai-roofs-stroke',
        type: 'line',
        source: 'ai-detected-roofs',
        paint: {
          'line-color': '#00ff88',
          'line-width': 4,
        },
      });

      // 2. User Traced / Clicked Roof Polygon Source & Glowing Green Layers
      map.addSource('roof-polygon', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'roof-polygon-fill',
        type: 'fill',
        source: 'roof-polygon',
        paint: {
          'fill-color': '#00ff88',
          'fill-opacity': 0.4,
        },
      });

      map.addLayer({
        id: 'roof-polygon-stroke',
        type: 'line',
        source: 'roof-polygon',
        paint: {
          'line-color': '#00ff88',
          'line-width': 3.5,
        },
      });

      // 2B. Dedicated roof-highlight-source for YOLOv8 classification pipeline
      map.addSource('roof-highlight-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'roof-highlight-fill',
        type: 'fill',
        source: 'roof-highlight-source',
        paint: {
          'fill-color': '#00ff88',
          'fill-opacity': 0.4,
        },
      });

      map.addLayer({
        id: 'roof-highlight-outline',
        type: 'line',
        source: 'roof-highlight-source',
        paint: {
          'line-color': '#00ff88',
          'line-width': 3.5,
        },
      });

      // Hover feedback
      map.on('mouseenter', 'ai-roofs-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'ai-roofs-fill', () => {
        map.getCanvas().style.cursor = isTracingRef.current ? 'crosshair' : '';
      });

      // Click on AI-Preset Roof Polygon -> Extract geometry & trigger transition
      map.on('click', 'ai-roofs-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const clickedFeat = e.features[0];
        const roofId = clickedFeat.properties?.id;
        const targetRoof = AI_PRESET_ROOFS.find((r) => r.id === roofId);

        if (targetRoof) {
          setSelectedAiRoofId(targetRoof.id);
          selectedRoofCoordsRef.current = targetRoof.coords;
          setTracedPoints([...targetRoof.coords]);

          // Centroid
          let sumLng = 0;
          let sumLat = 0;
          targetRoof.coords.forEach(([lng, lat]) => {
            sumLng += lng;
            sumLat += lat;
          });
          const centroid: [number, number] = [
            sumLng / targetRoof.coords.length,
            sumLat / targetRoof.coords.length,
          ];

          map.flyTo({
            center: centroid,
            zoom: 20,
            pitch: 60,
            bearing: 15,
            duration: 900,
          });

          const sanitized = sanitizePolygonCoordinates(targetRoof.coords);
          const metrics = calculatePolygonMetrics(sanitized);

          setSelectedRoofInfo({
            slopeCategory: targetRoof.slopeCategory,
            roofType: targetRoof.roofType,
            confidence: targetRoof.confidence,
            widthM: Math.max(2.0, metrics.width),
            lengthM: Math.max(2.0, metrics.length),
            areaSqm: metrics.area,
            coords: sanitized,
          });
          setIsReadyToEditOpen(true);
        }
      });

      // Unified Map Click Handler (Click-to-Highlight YOLOv8 Inference & Manual Tracing)
      map.on('click', async (e) => {
        if (isTracingRef.current) {
          const newPt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const currentPts = [...tracedPointsRef.current];

          // Auto-close polygon check
          if (currentPts.length >= 3) {
            const p1 = currentPts[0];
            const p1Pixel = map.project(p1);
            const clickPixel = map.project(newPt);
            const pixelDist = Math.hypot(p1Pixel.x - clickPixel.x, p1Pixel.y - clickPixel.y);
            const distMeters = calculateHaversine(p1[1], p1[0], newPt[1], newPt[0]);

            if (pixelDist < 26 || distMeters < 2.5) {
              setIsTracingActive(false);
              return;
            }
          }

          const nextPts = [...currentPts, newPt];
          setTracedPoints(nextPts);

          const source = map.getSource('roof-polygon') as maplibregl.GeoJSONSource;
          if (source) {
            const coords = [...nextPts];
            if (coords.length >= 3) {
              coords.push(coords[0]);
              source.setData({
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [coords] },
              });
            }
          }
        } else {
          // ---------------- CLICK-TO-HIGHLIGHT YOLOv8 PIPELINE ----------------
          const clickedCoord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          setIsClassifying(true);

          try {
            // Crop 512x512 satellite snippet
            const cropBlob = await getCroppedSatelliteSnippet(map, [clickedCoord]);

            // Call FastAPI YOLOv8-seg backend at 512x512 with augment=True
            const response = await fetchRoofSegmentation(cropBlob, 12.0, 10.0, undefined, clickedCoord);

            const widthM = response.dimensions.width;
            const lengthM = response.dimensions.length;
            const areaSqm = response.area_sqm || parseFloat((widthM * lengthM).toFixed(1));
            const slopeCat = response.slope_category || 'Trapezoid';
            const conf = response.confidence;

            // Generate or extract polygon coordinates
            let roofCoords: Array<[number, number]> = [];
            if (response.geojson && response.geojson.geometry?.coordinates?.[0]) {
              roofCoords = response.geojson.geometry.coordinates[0].slice(0, -1);
            } else if (response.mask_points && response.mask_points.length >= 3) {
              roofCoords = response.mask_points;
            } else {
              const halfW = 0.000055;
              const halfL = 0.000045;
              roofCoords = [
                [clickedCoord[0] - halfW, clickedCoord[1] + halfL],
                [clickedCoord[0] + halfW, clickedCoord[1] + halfL],
                [clickedCoord[0] + halfW, clickedCoord[1] - halfL],
                [clickedCoord[0] - halfW, clickedCoord[1] - halfL],
              ];
            }

            const sanitized = sanitizePolygonCoordinates(roofCoords);
            setTracedPoints(sanitized);

            const closedCoords = [...sanitized, sanitized[0]];
            const geojsonData = response.geojson && response.geojson.features?.length > 0
              ? response.geojson
              : {
                  type: 'FeatureCollection' as const,
                  features: [
                    {
                      type: 'Feature' as const,
                      properties: {
                        slopeCategory: slopeCat,
                        roofType: slopeCat,
                        confidence: conf,
                        widthMeters: widthM,
                        lengthMeters: lengthM,
                        areaSqm: areaSqm,
                      },
                      geometry: {
                        type: 'Polygon' as const,
                        coordinates: [closedCoords],
                      },
                    },
                  ],
                };

            // Update MapLibre roof-highlight-source with GeoJSON FeatureCollection
            const highlightSource = map.getSource('roof-highlight-source') as maplibregl.GeoJSONSource;
            if (highlightSource) {
              highlightSource.setData(geojsonData);
            }

            const polygonSource = map.getSource('roof-polygon') as maplibregl.GeoJSONSource;
            if (polygonSource) {
              polygonSource.setData({
                type: 'Feature',
                properties: {
                  slopeCategory: slopeCat,
                  roofType: slopeCat,
                  confidence: conf,
                  widthMeters: widthM,
                  lengthMeters: lengthM,
                  areaSqm: areaSqm,
                },
                geometry: {
                  type: 'Polygon',
                  coordinates: [closedCoords],
                },
              });
            }

            // Fly camera smoothly to targeted roof
            map.flyTo({
              center: clickedCoord,
              zoom: 20,
              pitch: 45,
              duration: 800,
            });

            setSelectedRoofInfo({
              slopeCategory: slopeCat,
              roofType: slopeCat,
              confidence: conf,
              widthM,
              lengthM,
              areaSqm,
              coords: sanitized,
            });
            setIsReadyToEditOpen(true);
          } catch (err) {
            console.error('Click-to-highlight YOLOv8 inference notice:', err);
          } finally {
            setIsClassifying(false);
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

  // ---------------- DRAGGABLE CORNER PIN MARKERS WITH 10px TURF EDGE SNAPPING ----------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    cornerMarkersRef.current.forEach((m) => m.remove());
    cornerMarkersRef.current = [];

    tracedPoints.forEach((pt, index) => {
      const el = document.createElement('div');
      const isStart = index === 0 && tracedPoints.length >= 3;
      el.className = `w-7 h-7 rounded-full ${
        isStart ? 'bg-amber-500 ring-4 ring-amber-300 animate-pulse' : 'bg-emerald-600 ring-2 ring-emerald-400/50'
      } text-white font-mono text-[11px] font-bold flex items-center justify-center border-2 border-white shadow-xl select-none cursor-move transition-transform hover:scale-125`;
      el.innerText = `P${index + 1}`;
      el.title = `Corner Pin P${index + 1} (Drag with 10px edge snapping)`;

      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(pt)
        .addTo(map);

      // Real-time edge snapping during pin drag
      marker.on('drag', () => {
        const rawLngLat = marker.getLngLat();
        const currentCoord: [number, number] = [rawLngLat.lng, rawLngLat.lat];
        const targetBoundary = selectedRoofCoordsRef.current || tracedPoints;

        if (isSnappingActive && targetBoundary.length >= 3) {
          const snapResult = snapPinToNearestBoundary(
            currentCoord,
            targetBoundary,
            map,
            10 // 10-pixel threshold
          );

          if (snapResult.isSnapped) {
            marker.setLngLat(snapResult.snappedCoords);
            el.classList.add('bg-emerald-500', 'ring-emerald-300');
            el.classList.remove('bg-emerald-600', 'ring-emerald-400/50');
            setSnapFeedback(`P${index + 1} Snapped to Boundary Edge`);
          } else {
            el.classList.remove('bg-emerald-500', 'ring-emerald-300');
            el.classList.add('bg-emerald-600', 'ring-emerald-400/50');
            setSnapFeedback(null);
          }
        }
      });

      marker.on('dragend', () => {
        const finalLngLat = marker.getLngLat();
        let targetCoord: [number, number] = [finalLngLat.lng, finalLngLat.lat];
        const targetBoundary = selectedRoofCoordsRef.current || tracedPoints;

        if (isSnappingActive && targetBoundary.length >= 3) {
          const snapResult = snapPinToNearestBoundary(targetCoord, targetBoundary, map, 10);
          if (snapResult.isSnapped) {
            targetCoord = snapResult.snappedCoords;
            marker.setLngLat(targetCoord);
          }
        }

        setTracedPoints((prev) => {
          const updated = [...prev];
          updated[index] = targetCoord;
          return updated;
        });
        setSnapFeedback(null);
      });

      cornerMarkersRef.current.push(marker);
    });

    // Update GeoJSON polygon
    const source = map.getSource('roof-polygon') as maplibregl.GeoJSONSource;
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
  }, [tracedPoints, isSnappingActive]);

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
    setSelectedAiRoofId(null);
    setSelectedRoofInfo(null);
    setIsTracingActive(true);
  };

  const handleFinishTracing = () => {
    setIsTracingActive(false);
  };

  const handleUndoPoint = () => {
    setTracedPoints((prev) => prev.slice(0, -1));
  };

  const handleClearTracing = () => {
    setTracedPoints([]);
    setSelectedAiRoofId(null);
    setSelectedRoofInfo(null);
    setIsReadyToEditOpen(false);
    setIsTracingActive(false);
    if (mapRef.current) {
      const source = mapRef.current.getSource('roof-polygon') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      AI_PRESET_ROOFS.forEach((r) => {
        mapRef.current?.setFeatureState(
          { source: 'ai-detected-roofs', id: r.id },
          { selected: false }
        );
      });
    }
  };

  // Sync / Transition to 3D Extrusion Mesh
  const handleSyncTo3D = () => {
    if (selectedRoofInfo) {
      onRoofCaptured({
        corners: selectedRoofInfo.coords,
        polygonPoints: selectedRoofInfo.coords,
        widthMeters: selectedRoofInfo.widthM,
        lengthMeters: selectedRoofInfo.lengthM,
        flatAreaSqm: selectedRoofInfo.areaSqm,
        roofType: selectedRoofInfo.slopeCategory,
        slopeCategory: selectedRoofInfo.slopeCategory,
        confidence: selectedRoofInfo.confidence,
        pitchDeg: selectedRoofInfo.slopeCategory === 'Flat' ? 0 : selectedRoofInfo.slopeCategory === 'Minimal' ? 8 : 15,
      });
    } else if (tracedPoints.length >= 3 && calculatedMetrics.area > 0) {
      const sanitized = sanitizePolygonCoordinates(tracedPoints);
      onRoofCaptured({
        corners: sanitized,
        polygonPoints: sanitized,
        widthMeters: Math.max(2, calculatedMetrics.width),
        lengthMeters: Math.max(2, calculatedMetrics.length),
        flatAreaSqm: calculatedMetrics.area,
        roofType: tracedPoints.length > 4 ? 'Polygon' : 'Trapezoid',
        slopeCategory: tracedPoints.length > 4 ? 'Polygon' : 'Trapezoid',
        confidence: 0.95,
        pitchDeg: 15,
      });
    }
  };

  return (
    <div className="relative w-full h-full bg-[#090d16] text-slate-100 overflow-hidden flex flex-col select-none">
      {/* ---------------- 1. MAP TOOLBAR ---------------- */}
      <div className="absolute top-4 left-4 right-4 z-30 pointer-events-none">
        <div className="pointer-events-auto max-w-[1600px] mx-auto bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-3 px-5 shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-white">
          {/* Map Location Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0 shadow-xs">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white">Helios Spatial AI Engine</span>
                <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border border-emerald-500/30">
                  YOLOv8 512x512 TTA (Digos City)
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">{activeBarangay} • Click any roof to highlight</p>
            </div>
          </div>

          {/* Search Street Bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Street or Coordinates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full bg-slate-800/80 border border-slate-700 pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all font-medium shadow-xs"
              />
            </div>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-1.5 rounded-full text-xs shadow-sm transition-all cursor-pointer shrink-0"
            >
              Locate
            </button>
          </form>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Edge Snapping Toggle */}
            <button
              onClick={() => setIsSnappingActive(!isSnappingActive)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isSnappingActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow-xs'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isSnappingActive ? '10px Snapping ON' : 'Snapping OFF'}</span>
            </button>

            {/* Photo Overlay Toggle */}
            <button
              onClick={() => setIsOverlayPanelOpen(!isOverlayPanelOpen)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isOverlayPanelOpen || overlaySettings.imageUrl
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow-xs'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
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
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow-xs'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" /> 3D Tilt
            </button>

            {/* Draw Roof Outline Button */}
            <button
              onClick={isTracingActive ? handleFinishTracing : handleStartTracing}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isTracingActive
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              {isTracingActive
                ? `Tracing Vertex P${tracedPoints.length + 1}... (Click to Finish)`
                : 'Draw Roof Outline'}
            </button>

            {/* Undo Last Point */}
            {isTracingActive && tracedPoints.length > 0 && (
              <button
                onClick={handleUndoPoint}
                className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Undo (P{tracedPoints.length})
              </button>
            )}

            {(tracedPoints.length > 0 || selectedRoofInfo) && (
              <button
                onClick={handleClearTracing}
                className="px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
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
          style={{ cursor: isTracingActive ? 'crosshair' : 'pointer' }}
          className="w-full h-full z-0"
        />

        {/* Loading Spinner */}
        {isClassifying && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white px-5 py-2.5 rounded-full shadow-2xl border border-emerald-500/40 flex items-center gap-2.5 text-xs font-semibold animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Running YOLOv8 (512x512 TTA) Inference on Rooftop...</span>
          </div>
        )}

        {/* Snap Notification Toast */}
        {snapFeedback && (
          <div className="absolute top-24 left-6 z-40 bg-emerald-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
            <Check className="w-3.5 h-3.5" />
            <span>{snapFeedback}</span>
          </div>
        )}

        {/* ---------------- 3. FLOATING "READY TO EDIT" / ROOFTOP EXTRACTED OVERLAY CARD ---------------- */}
        {isReadyToEditOpen && (selectedRoofInfo || (tracedPoints.length >= 3 && calculatedMetrics.area > 0)) && (
          <div className="absolute top-24 right-6 z-40 w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-emerald-500/40 p-4 shadow-2xl space-y-3 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88] animate-pulse shadow-[0_0_8px_#00ff88]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Rooftop Detected & Highlighted
                </span>
              </div>
              <button
                onClick={() => setIsReadyToEditOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Roof Telemetry Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">SLOPE CLASS</span>
                <span className="font-bold text-emerald-400 capitalize">
                  {selectedRoofInfo?.slopeCategory || (tracedPoints.length > 4 ? 'Polygon' : 'Trapezoid')} Roof
                </span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">YOLOv8 CONFIDENCE</span>
                <span className="font-bold font-mono text-white">
                  {selectedRoofInfo?.confidence ? `${(selectedRoofInfo.confidence * 100).toFixed(0)}%` : '95%'}
                </span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">DIMENSIONS</span>
                <span className="font-bold font-mono text-white">
                  {(selectedRoofInfo?.widthM || calculatedMetrics.width).toFixed(1)}m × {(selectedRoofInfo?.lengthM || calculatedMetrics.length).toFixed(1)}m
                </span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">FOOTPRINT AREA</span>
                <span className="font-bold font-mono text-emerald-400">
                  {(selectedRoofInfo?.areaSqm || calculatedMetrics.area).toFixed(1)} m²
                </span>
              </div>
            </div>

            {/* Glowing Green Status Tag */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00ff88] shadow-[0_0_6px_#00ff88]" />
                <span>Layer: Glowing Green (#00ff88)</span>
              </div>
              <span className="text-emerald-400 font-mono font-semibold">
                {selectedRoofInfo?.coords?.length || tracedPoints.length} Vertices
              </span>
            </div>

            {/* Action Button: Generate 3D Extrusion Mesh */}
            <button
              onClick={handleSyncTo3D}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Box className="w-4 h-4" />
              <span>Generate 3D Extrusion Mesh</span>
            </button>
          </div>
        )}

        {/* ---------------- 4. SITE PHOTO OVERLAY PLANE ---------------- */}
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

        {/* ---------------- 5. FLOATING OVERLAY PANEL ---------------- */}
        {isOverlayPanelOpen && (
          <div className="absolute top-20 right-6 z-30 pointer-events-auto">
            <BlueprintOverlayTool
              settings={overlaySettings}
              onChange={setOverlaySettings}
              onClose={() => setIsOverlayPanelOpen(false)}
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

        {/* ---------------- 6. TRACING INSTRUCTION BADGE ---------------- */}
        {isTracingActive && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div className="bg-slate-900/95 text-white px-5 py-2.5 rounded-full shadow-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-bounce">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>
                {tracedPoints.length < 3
                  ? 'Tap vertices along the roof edge (4, 6, 8+ points for complex roofs)'
                  : 'Tap P1 to close loop, or click "Finish Tracing"'}
              </span>
              <span className="bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-mono text-[10px]">
                {tracedPoints.length} Points
              </span>
            </div>
          </div>
        )}

        {/* Click Guidance Prompt when idle */}
        {!selectedRoofInfo && !isTracingActive && tracedPoints.length === 0 && !isClassifying && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="bg-slate-900/90 text-white px-5 py-2.5 rounded-full shadow-2xl border border-slate-800 text-xs font-semibold flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-emerald-400 animate-bounce" />
              <span>Click any satellite rooftop to run YOLOv8 (512x512 TTA) classification & highlight</span>
            </div>
          </div>
        )}

        {/* ---------------- 7. BOTTOM METRICS BAR & VIEW IN 3D ---------------- */}
        {tracedPoints.length >= 3 && calculatedMetrics.area > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-slate-900/95 backdrop-blur-md rounded-3xl border border-slate-800 p-4 px-6 shadow-2xl flex flex-wrap items-center justify-between gap-4 text-white">
              <div className="flex items-center gap-6 flex-wrap">
                {/* Structure / Vertex Typology Badge */}
                <div className="flex flex-col border-r border-slate-800 pr-6">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Slope Category</span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {selectedRoofInfo?.slopeCategory || (tracedPoints.length === 4 ? 'Trapezoid' : tracedPoints.length === 3 ? 'Triangle' : 'Polygon')}
                  </span>
                </div>

                {/* Bounding Dimensions */}
                <div className="flex flex-col border-r border-slate-800 pr-6">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Bounding Box</span>
                  <span className="text-sm font-mono font-bold text-white">
                    {(selectedRoofInfo?.widthM || calculatedMetrics.width).toFixed(1)}m × {(selectedRoofInfo?.lengthM || calculatedMetrics.length).toFixed(1)}m
                  </span>
                </div>

                {/* Flat Roof Area */}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">True Footprint Area</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {(selectedRoofInfo?.areaSqm || calculatedMetrics.area).toFixed(1)} m²
                  </span>
                </div>
              </div>

              {/* Action Buttons: AI Detect & Standard 3D Sync */}
              <div className="flex items-center gap-2">
                {isTracingActive && (
                  <button
                    onClick={handleFinishTracing}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2.5 rounded-full text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Finish Tracing</span>
                  </button>
                )}

                {onAiAutoDetectFromMap && (
                  <button
                    onClick={() => onAiAutoDetectFromMap(mapRef.current, tracedPoints)}
                    disabled={isAnalyzing}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-semibold px-4 py-2.5 rounded-full text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>⚡ AI Extrude</span>
                  </button>
                )}

                {/* View in 3D Button */}
                <button
                  onClick={handleSyncTo3D}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <span>Generate 3D Extrusion Mesh</span>
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

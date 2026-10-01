/**
 * ============================================================================
 * HELIOS - HeliosRoofEngine.tsx
 * Lead Spatial UI & WebGL Engineer Component
 * React + MapLibre GL JS + Turf.js + Three.js (@react-three/fiber)
 * ============================================================================
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Bounds } from '@react-three/drei';
import {
  Compass,
  Maximize2,
  Sparkles,
  Layers,
  CheckCircle2,
  Box,
  TreeDeciduous,
  Building,
  RotateCcw,
  Zap,
  ArrowRight,
  ShieldCheck,
  MousePointerClick,
  Sun,
  X,
  Ruler,
  Sliders,
  Check,
} from 'lucide-react';
import {
  snapPinToNearestBoundary,
  sanitizePolygonCoordinates,
  convertGeoJSONToThreeShape,
  generate3DExtrusionMesh,
  spawnProceduralTreeMesh,
  spawnNeighborhoodContextMesh,
  SpatialTreeData,
  NeighborBuildingData,
  LocalPoint2D,
  MetricBoundingBox,
} from '../utils/spatialUtils';

// ----------------------------------------------------------------------------
// DATA STRUCTURES
// ----------------------------------------------------------------------------

export interface AIDetectedRoof {
  id: string | number;
  roofType: 'gable' | 'hip' | 'flat' | 'mono' | 'complex';
  confidence: number;
  pitchDeg: number;
  polygonCoords: Array<[number, number]>; // [lng, lat]
  estimatedArea: number;
  trees?: SpatialTreeData[];
  neighborBuildings?: NeighborBuildingData[];
}

interface HeliosRoofEngineProps {
  initialCenter?: [number, number]; // [lng, lat]
  detectedRoofs?: AIDetectedRoof[];
  onRoofSelected?: (roof: AIDetectedRoof) => void;
  onMeshGenerated?: (meshResult: any) => void;
  className?: string;
}

// Digos City default coordinates: [lng: 125.3572, lat: 6.7495]
const DIGOS_COORDS: [number, number] = [125.3572, 6.7495];

// Pre-seeded high-accuracy AI detected roof footprints in Digos City Poblacion zone
const DEFAULT_AI_ROOFS: AIDetectedRoof[] = [
  {
    id: 'roof-alpha-target',
    roofType: 'hip',
    confidence: 0.96,
    pitchDeg: 18,
    polygonCoords: [
      [125.35712, 6.74958],
      [125.35724, 6.74958],
      [125.35724, 6.74944],
      [125.35712, 6.74944],
    ],
    estimatedArea: 135.2,
    trees: [
      {
        id: 'tree-sw-mango',
        x: -7.5,
        z: 4.8,
        heightMeters: 7.2,
        canopyRadius: 3.4,
        trunkRadius: 0.38,
        species: 'mango',
      },
      {
        id: 'tree-ne-rain',
        x: 8.2,
        z: -5.6,
        heightMeters: 6.8,
        canopyRadius: 3.0,
        trunkRadius: 0.32,
        species: 'rain_tree',
      },
    ],
    neighborBuildings: [
      {
        id: 'neighbor-north-hall',
        polygon: [
          { x: -9, z: -15 },
          { x: 10, z: -15 },
          { x: 10, z: -9 },
          { x: -9, z: -9 },
        ],
        heightMeters: 4.2,
      },
      {
        id: 'neighbor-east-commercial',
        polygon: [
          { x: 14, z: -5 },
          { x: 22, z: -5 },
          { x: 22, z: 8 },
          { x: 14, z: 8 },
        ],
        heightMeters: 3.6,
      },
    ],
  },
  {
    id: 'roof-bravo-adjacent',
    roofType: 'gable',
    confidence: 0.91,
    pitchDeg: 15,
    polygonCoords: [
      [125.35732, 6.74956],
      [125.35742, 6.74956],
      [125.35742, 6.74942],
      [125.35732, 6.74942],
    ],
    estimatedArea: 110.8,
  },
  {
    id: 'roof-charlie-complex',
    roofType: 'complex',
    confidence: 0.94,
    pitchDeg: 20,
    polygonCoords: [
      [125.35695, 6.74965],
      [125.35706, 6.74965],
      [125.35706, 6.74955],
      [125.35702, 6.74955],
      [125.35702, 6.74946],
      [125.35695, 6.74946],
    ],
    estimatedArea: 158.4,
  },
];

// ----------------------------------------------------------------------------
// THREE.JS 3D SCENE SUB-COMPONENT (EXTRUDED MESH + PROCEDURAL TREES + CONTEXT)
// ----------------------------------------------------------------------------

interface ThreeExtrusionSceneProps {
  activeRoof: AIDetectedRoof;
  cornerPins: Array<[number, number]>;
  wallHeight: number;
  pitchDeg: number;
  sunHour: number;
}

const ThreeExtrusionScene: React.FC<ThreeExtrusionSceneProps> = ({
  activeRoof,
  cornerPins,
  wallHeight,
  pitchDeg,
  sunHour,
}) => {
  const containerGroupRef = useRef<THREE.Group>(null);

  // Compute Sun Light direction vector
  const sunPosition = useMemo(() => {
    // Digos City Latitude 6.7495 N
    const hourAngleRad = ((sunHour - 12) * 15 * Math.PI) / 180;
    const elevationRad = Math.max(0.15, Math.sin((Math.PI * (sunHour - 6)) / 12) * 1.1);
    const radius = 60;
    const x = radius * Math.cos(elevationRad) * Math.sin(hourAngleRad);
    const y = radius * Math.sin(elevationRad);
    const z = -radius * Math.cos(elevationRad) * Math.cos(hourAngleRad);
    return new THREE.Vector3(x, Math.max(8, y), z);
  }, [sunHour]);

  // Generate Extruded 3D Building Mesh
  const extrusionData = useMemo(() => {
    const rawCoords = cornerPins.length >= 3 ? cornerPins : activeRoof.polygonCoords;
    const sanitized = sanitizePolygonCoordinates(rawCoords);
    return generate3DExtrusionMesh({
      geoPoints: sanitized,
      wallHeight,
      pitchDeg,
      roofType: activeRoof.roofType,
      roofColor: '#1e293b',
      wallColor: '#f1f5f9',
    });
  }, [cornerPins, activeRoof, wallHeight, pitchDeg]);

  // Generate Procedural 3D Trees with Dodecahedron Canopies (castShadow = true)
  const treeMeshes = useMemo(() => {
    const trees = activeRoof.trees || DEFAULT_AI_ROOFS[0].trees || [];
    return trees.map((tree) => spawnProceduralTreeMesh(tree));
  }, [activeRoof]);

  // Generate Translucent Grey Neighborhood Context Meshes (opacity = 0.2)
  const neighborMeshes = useMemo(() => {
    const neighbors = activeRoof.neighborBuildings || DEFAULT_AI_ROOFS[0].neighborBuildings || [];
    return neighbors.map((b) => spawnNeighborhoodContextMesh(b));
  }, [activeRoof]);

  // Attach Three.js Groups cleanly to scene graph
  useEffect(() => {
    const group = containerGroupRef.current;
    if (!group) return;

    // Clear previous dynamic meshes
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    // Add main extruded building
    if (extrusionData.group) {
      group.add(extrusionData.group);
    }

    // Add procedural trees
    treeMeshes.forEach((tree) => group.add(tree));

    // Add translucent neighbor context meshes
    neighborMeshes.forEach((neighbor) => group.add(neighbor));

    return () => {
      while (group.children.length > 0) {
        group.remove(group.children[0]);
      }
    };
  }, [extrusionData, treeMeshes, neighborMeshes]);

  return (
    <>
      {/* Lighting & Environment */}
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[sunPosition.x, sunPosition.y, sunPosition.z]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={150}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0001}
      />
      <hemisphereLight args={['#bfdbfe', '#475569', 0.45]} />

      {/* Ground Coordinate Shadow Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.1} />
      </mesh>
      <gridHelper args={[100, 50, '#334155', '#1e293b']} position={[0, 0.01, 0]} />

      {/* Dynamic Extruded Meshes & Context Group */}
      <group ref={containerGroupRef} />
    </>
  );
};

// ----------------------------------------------------------------------------
// MAIN EXPORTED COMPONENT: HeliosRoofEngine
// ----------------------------------------------------------------------------

export const HeliosRoofEngine: React.FC<HeliosRoofEngineProps> = ({
  initialCenter = DIGOS_COORDS,
  detectedRoofs = DEFAULT_AI_ROOFS,
  onRoofSelected,
  onMeshGenerated,
  className = '',
}) => {
  // View Modes
  const [viewLayout, setViewLayout] = useState<'split' | 'map' | '3d'>('split');
  const [activeRoofId, setActiveRoofId] = useState<string | number>(detectedRoofs[0]?.id || 'roof-alpha-target');
  const [selectedRoof, setSelectedRoof] = useState<AIDetectedRoof>(detectedRoofs[0]);
  const [isReadyToEditOpen, setIsReadyToEditOpen] = useState<boolean>(true);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState<boolean>(true);
  const [snappedInfo, setSnappedInfo] = useState<{ isSnapped: boolean; pinName: string } | null>(null);

  // Extrusion & 3D Parameters
  const [wallHeight, setWallHeight] = useState<number>(3.5);
  const [pitchDeg, setPitchDeg] = useState<number>(selectedRoof?.pitchDeg || 18);
  const [sunHour, setSunHour] = useState<number>(11.5); // 11:30 AM Peak

  // Interactive Editable Corner Pins for active roof [P1, P2, P3, P4...]
  const [cornerPins, setCornerPins] = useState<Array<[number, number]>>(
    detectedRoofs[0]?.polygonCoords || []
  );

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cornerMarkersRef = useRef<maplibregl.Marker[]>([]);
  const selectedRoofRef = useRef<AIDetectedRoof>(selectedRoof);

  useEffect(() => {
    selectedRoofRef.current = selectedRoof;
  }, [selectedRoof]);

  // Compute local metrics for HUD
  const shapeMetrics = useMemo(() => {
    if (cornerPins.length < 3) return { width: 0, length: 0, area: 0 };
    const res = convertGeoJSONToThreeShape(cornerPins);
    return res.metrics;
  }, [cornerPins]);

  // ---------------- 1. MAPLIBRE INITIALIZATION & GEOJSON HIGHLIGHT LAYER ----------------
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
            tileSize: 256,
            maxzoom: 20,
          },
        },
        layers: [
          {
            id: 'satellite-tiles',
            type: 'raster',
            source: 'satellite',
            paint: { 'raster-resampling': 'linear' },
          },
        ],
      },
      center: initialCenter,
      zoom: 19.4,
      maxZoom: 20.5,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');

    map.on('load', () => {
      // Build GeoJSON FeatureCollection for all AI-detected roofs
      const features = detectedRoofs.map((roof) => {
        const closed = [...roof.polygonCoords, roof.polygonCoords[0]];
        return {
          type: 'Feature' as const,
          id: roof.id,
          properties: {
            id: roof.id,
            roofType: roof.roofType,
            confidence: roof.confidence,
            pitchDeg: roof.pitchDeg,
            area: roof.estimatedArea,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [closed],
          },
        };
      });

      // 1. Add GeoJSON Source
      map.addSource('ai-detected-roofs', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      });

      // 2. Add Fill Layer with Dynamic Feature-State Styling
      // Default: Glowing Green (#00ff88, opacity: 0.35)
      // Selected: Active Blue (#3d5aff, opacity: 0.55)
      map.addLayer({
        id: 'ai-roofs-fill',
        type: 'fill',
        source: 'ai-detected-roofs',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#3d5aff', // Active Blue
            '#00ff88', // Glowing Green
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.55,
            0.35,
          ],
        },
      });

      // 3. Add Bold Outline Layer
      map.addLayer({
        id: 'ai-roofs-stroke',
        type: 'line',
        source: 'ai-detected-roofs',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#2563eb', // Darker Blue outline
            '#00ff88', // Neon Green outline
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            4,
            3,
          ],
        },
      });

      // Set initial selection feature-state
      if (detectedRoofs.length > 0) {
        map.setFeatureState(
          { source: 'ai-detected-roofs', id: detectedRoofs[0].id },
          { selected: true }
        );
      }

      // Cursor pointer on hover
      map.on('mouseenter', 'ai-roofs-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'ai-roofs-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      // Click handler to select roof polygon and transition feature-state
      map.on('click', 'ai-roofs-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const clickedFeat = e.features[0];
        const roofId = clickedFeat.properties?.id;
        const targetRoof = detectedRoofs.find((r) => r.id === roofId);

        if (targetRoof) {
          handleSelectRoof(targetRoof);
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

  // ---------------- 2. CLICK-TO-SELECT TRANSITION & CAMERA ANIMATION ----------------
  const handleSelectRoof = useCallback(
    (roof: AIDetectedRoof) => {
      setActiveRoofId(roof.id);
      setSelectedRoof(roof);
      setCornerPins([...roof.polygonCoords]);
      setPitchDeg(roof.pitchDeg);
      setIsReadyToEditOpen(true);

      if (onRoofSelected) {
        onRoofSelected(roof);
      }

      const map = mapRef.current;
      if (!map) return;

      // Update MapLibre feature-states
      detectedRoofs.forEach((r) => {
        map.setFeatureState(
          { source: 'ai-detected-roofs', id: r.id },
          { selected: r.id === roof.id }
        );
      });

      // Calculate centroid of selected roof
      let sumLng = 0;
      let sumLat = 0;
      roof.polygonCoords.forEach(([lng, lat]) => {
        sumLng += lng;
        sumLat += lat;
      });
      const centroid: [number, number] = [
        sumLng / roof.polygonCoords.length,
        sumLat / roof.polygonCoords.length,
      ];

      // Smoothly animate camera to focus on selected roof (pitch: 60, zoom: 20)
      map.flyTo({
        center: centroid,
        zoom: 20,
        pitch: 60,
        bearing: 15,
        duration: 1500,
        essential: true,
      });
    },
    [detectedRoofs, onRoofSelected]
  );

  // ---------------- 3. PIN EDGE-SNAPPING & DRAGGABLE CORNER PIN MARKERS ----------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    cornerMarkersRef.current.forEach((m) => m.remove());
    cornerMarkersRef.current = [];

    // Spawn interactive corner pins P1, P2, P3, P4...
    cornerPins.forEach((pt, index) => {
      const pinEl = document.createElement('div');
      pinEl.className =
        'w-7 h-7 rounded-full bg-blue-600 text-white font-mono text-[11px] font-bold flex items-center justify-center border-2 border-white shadow-xl select-none cursor-move transition-transform hover:scale-125 ring-2 ring-blue-400/50';
      pinEl.innerText = `P${index + 1}`;
      pinEl.title = `Drag Corner Pin P${index + 1} (Edge-snaps to boundary within 10px)`;

      const marker = new maplibregl.Marker({
        element: pinEl,
        draggable: true,
      })
        .setLngLat(pt)
        .addTo(map);

      // On Drag: Real-Time Turf Edge-Snapping within 10px threshold
      marker.on('drag', () => {
        const rawLngLat = marker.getLngLat();
        const currentCoord: [number, number] = [rawLngLat.lng, rawLngLat.lat];

        if (isSnappingEnabled && selectedRoofRef.current) {
          const snapResult = snapPinToNearestBoundary(
            currentCoord,
            selectedRoofRef.current.polygonCoords,
            map,
            10 // 10-pixel threshold
          );

          if (snapResult.isSnapped) {
            marker.setLngLat(snapResult.snappedCoords);
            pinEl.classList.add('bg-emerald-500', 'ring-emerald-300');
            pinEl.classList.remove('bg-blue-600', 'ring-blue-400/50');
            setSnappedInfo({ isSnapped: true, pinName: `P${index + 1}` });
          } else {
            pinEl.classList.remove('bg-emerald-500', 'ring-emerald-300');
            pinEl.classList.add('bg-blue-600', 'ring-blue-400/50');
            setSnappedInfo(null);
          }
        }
      });

      marker.on('dragend', () => {
        const finalLngLat = marker.getLngLat();
        let targetCoord: [number, number] = [finalLngLat.lng, finalLngLat.lat];

        if (isSnappingEnabled && selectedRoofRef.current) {
          const snapResult = snapPinToNearestBoundary(
            targetCoord,
            selectedRoofRef.current.polygonCoords,
            map,
            10
          );
          if (snapResult.isSnapped) {
            targetCoord = snapResult.snappedCoords;
            marker.setLngLat(targetCoord);
          }
        }

        setCornerPins((prev) => {
          const updated = [...prev];
          updated[index] = targetCoord;
          return updated;
        });
        setSnappedInfo(null);
      });

      cornerMarkersRef.current.push(marker);
    });
  }, [cornerPins.length, selectedRoof.id, isSnappingEnabled]);

  // ---------------- 4. GENERATE 3D EXTRUSION TRIGGER ----------------
  const handleGenerate3DMesh = () => {
    const meshResult = generate3DExtrusionMesh({
      geoPoints: cornerPins,
      wallHeight,
      pitchDeg,
      roofType: selectedRoof.roofType,
    });

    if (onMeshGenerated) {
      onMeshGenerated(meshResult);
    }

    // Switch to 3D View or Split View
    if (viewLayout === 'map') {
      setViewLayout('split');
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden ${className}`}>
      {/* ---------------- TOP HEADER BAR ---------------- */}
      <header className="h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Helios Spatial Roof Engine</span>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-semibold">
                Turf + WebGL 3D
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              AI Detection • 10px Edge Snapping • Extrusion Mesh Pipeline
            </span>
          </div>
        </div>

        {/* View Layout Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-full border border-slate-800">
          <button
            onClick={() => setViewLayout('map')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
              viewLayout === 'map' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Map View
          </button>
          <button
            onClick={() => setViewLayout('split')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
              viewLayout === 'split' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Split 3D & Map
          </button>
          <button
            onClick={() => setViewLayout('3d')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
              viewLayout === '3d' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            3D Studio
          </button>
        </div>
      </header>

      {/* ---------------- MAIN WORKSPACE CANVAS ---------------- */}
      <div className="flex-1 min-h-0 relative grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* VIEW A: MAPLIBRE MAP (Left or Full) */}
        {(viewLayout === 'map' || viewLayout === 'split') && (
          <div
            className={`relative w-full h-full border-r border-slate-800 ${
              viewLayout === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'
            }`}
          >
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Map Top-Left Overlay: Snapping Toggle & Status */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
              <button
                onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border shadow-lg flex items-center gap-1.5 cursor-pointer transition ${
                  isSnappingEnabled
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-900/80 text-slate-400 border-slate-700'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Edge Snap: {isSnappingEnabled ? '10px Active' : 'Off'}</span>
              </button>

              {snappedInfo && (
                <div className="bg-emerald-500/90 text-slate-950 text-[11px] font-bold px-3 py-1 rounded-full shadow-lg animate-bounce flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>{snappedInfo.pinName} Snapped to Boundary Edge</span>
                </div>
              )}
            </div>

            {/* ---------------- FLOATING "READY TO EDIT" ACTION OVERLAY CARD ---------------- */}
            {isReadyToEditOpen && selectedRoof && (
              <div className="absolute top-4 right-4 z-30 w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-blue-500/40 p-4 shadow-2xl space-y-3 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Ready to Edit Roof
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
                  <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-semibold">TYPOLOGY</span>
                    <span className="font-bold text-blue-400 capitalize">
                      {selectedRoof.roofType} Roof
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-semibold">AI CONFIDENCE</span>
                    <span className="font-bold text-emerald-400">
                      {(selectedRoof.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-semibold">DIMENSIONS</span>
                    <span className="font-bold font-mono text-white">
                      {shapeMetrics.width.toFixed(1)}m × {shapeMetrics.length.toFixed(1)}m
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-semibold">FOOTPRINT AREA</span>
                    <span className="font-bold font-mono text-emerald-400">
                      {shapeMetrics.area.toFixed(1)} m²
                    </span>
                  </div>
                </div>

                {/* Extrusion Controls */}
                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Pitch Angle:</span>
                    <span className="font-mono font-bold text-white">{pitchDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={pitchDeg}
                    onChange={(e) => setPitchDeg(parseInt(e.target.value))}
                    className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Primary Action Button: Generate 3D Extrusion Mesh */}
                <button
                  onClick={handleGenerate3DMesh}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Box className="w-4 h-4" />
                  <span>Generate 3D Extrusion Mesh</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW B: THREE.JS 3D WEBGL EXTENSION VIEWPORT (Right or Full) */}
        {(viewLayout === '3d' || viewLayout === 'split') && (
          <div
            className={`relative w-full h-full bg-[#070b14] ${
              viewLayout === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'
            }`}
          >
            <Canvas shadows camera={{ position: [16, 14, 18], fov: 45 }} className="w-full h-full">
              <Bounds fit clip observe margin={1.2}>
                <ThreeExtrusionScene
                  activeRoof={selectedRoof}
                  cornerPins={cornerPins}
                  wallHeight={wallHeight}
                  pitchDeg={pitchDeg}
                  sunHour={sunHour}
                />
              </Bounds>
              <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={4} maxDistance={100} />
            </Canvas>

            {/* 3D Scene Overlay Controls */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
              <div className="bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-800 shadow-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Sun className="w-3.5 h-3.5" />
                  <span>Solar Sun Path ({sunHour.toFixed(1)}h)</span>
                </div>
                <input
                  type="range"
                  min={7}
                  max={17}
                  step={0.5}
                  value={sunHour}
                  onChange={(e) => setSunHour(parseFloat(e.target.value))}
                  className="w-36 accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>07:00 AM</span>
                  <span>12:00 PM</span>
                  <span>05:00 PM</span>
                </div>
              </div>

              {/* Legend Badge */}
              <div className="bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 text-[10px] space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />
                  <span className="text-slate-300">Extruded Target Roof</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-300">Dodecahedron Trees (Shadows)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 opacity-30 border border-slate-400" />
                  <span className="text-slate-400">Translucent Context (0.2 Opacity)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeliosRoofEngine;

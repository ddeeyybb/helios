import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    Rotate3d, Maximize2, Sliders, Sun, Grid, Compass, LayoutGrid, Zap,
    Layers, Cpu, ChevronDown, Map as MapIcon, Search, MapPin, CheckCircle,
    MousePointer2, Goal, Clock4, ShieldCheck, Ruler, Plus, Minus, Move3D
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import * as SunCalc from 'suncalc';
import { useSolarContext } from '../../SolarContext';
import RoofSimulator3D from './RoofSimulator3D';

const SOLAR_PRESETS = [
    { id: 'module_350', name: 'Standard Monocrystalline', wattage: 350, width: 1.04, height: 1.75, area: 1.82 },
    { id: 'module_380', name: 'High-Efficiency Mono', wattage: 380, width: 1.04, height: 1.75, area: 1.82 },
    { id: 'module_400', name: 'Premium Module', wattage: 400, width: 1.09, height: 1.75, area: 1.91 },
    { id: 'module_450', name: 'Utility Scale', wattage: 450, width: 1.13, height: 2.09, area: 2.36 },
    { id: 'module_550', name: 'Bifacial High Power', wattage: 550, width: 1.13, height: 2.27, area: 2.56 },
    { id: 'custom', name: 'Custom Specification...', wattage: 400, width: 1.134, height: 1.754, area: 1.99 },
];

export default function SiteMapper() {
    const { appState, setAppState, addToast } = useSolarContext();
    const [viewMode, setViewMode] = useState('3d'); // '3d' or 'map'
    const [tileProvider, setTileProvider] = useState('google'); // 'google' or 'esri'
    const [is3DMode, setIs3DMode] = useState(false);

    // 1. Math State (3D Roof)
    const [baseA, setBaseA] = useState(8.0);
    const [baseLength, setBaseLength] = useState(10.0);
    const [pitchTheta, setPitchTheta] = useState(25);

    // 2. Solar Panel Specifications & Manual Input Control
    const [selectedPresetId, setSelectedPresetId] = useState('module_400');
    const [customSpecs, setCustomSpecs] = useState({ wattage: 400, width: 1.134, height: 1.754 });
    const [placedPanels, setPlacedPanels] = useState([]); // Array of manual precise footprint drops

    const activeSpecs = selectedPresetId === 'custom'
        ? { ...customSpecs, name: 'Custom Module', area: customSpecs.width * customSpecs.height }
        : SOLAR_PRESETS.find(p => p.id === selectedPresetId);

    // 3. Time Simulator (Sun Path)
    const [sunTime, setSunTime] = useState(12 * 60);

    // 4. Interaction Mode Simulator
    const [interactionMode, setInteractionMode] = useState('ORBIT_VIEW'); // 'ORBIT_VIEW' | 'SELECT_PLACE'

    // 5. Leaflet Geographic Search Engine & Draw State
    const defaultCenter = [125.3572, 6.7550]; // Digos City (lng, lat for MapLibre)
    const [mapCenter, setMapCenter] = useState(defaultCenter);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [isPolygonClosed, setIsPolygonClosed] = useState(false);
    const [polygonPoints, setPolygonPoints] = useState([]);

    // Derived Footprints
    const [validPanelsGeo, setValidPanelsGeo] = useState([]);
    const [measuredArea, setMeasuredArea] = useState(0);
    const [roofDims, setRoofDims] = useState({ width: 8.0, length: 10.0 });

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const isDrawingRef = useRef(false);
    const polygonPointsRef = useRef([]);

    useEffect(() => {
        isDrawingRef.current = isDrawingMode;
        polygonPointsRef.current = polygonPoints;
    }, [isDrawingMode, polygonPoints]);

    // Search query processor
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        const query = searchQuery.includes(',') ? searchQuery : `${searchQuery}, Digos City, Philippines`;
        addToast('Geocoding coordinates...', 'info');
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const coord = [parseFloat(data[0].lon), parseFloat(data[0].lat)]; // lng, lat
                setMapCenter(coord);
                if (mapRef.current) mapRef.current.flyTo({ center: coord, zoom: 18, duration: 2000 });
                addToast('Location found! Drop a pin or measure roof.', 'success');
            } else addToast('Location not found.', 'error');
        } catch { addToast('Network fail.', 'error'); }
    };

    const toggleDrawingMode = () => {
        if (!isDrawingMode) {
            setPolygonPoints([]);
            setIsPolygonClosed(false);
            setValidPanelsGeo([]);
            setMeasuredArea(0);
            setIsDrawingMode(true);

            if (mapRef.current && mapRef.current.getSource('roof-polygon')) {
                mapRef.current.getSource('roof-polygon').setData({ type: 'FeatureCollection', features: [] });
            }
            addToast('Draw outline by clicking corners.', 'info');
        } else {
            setIsDrawingMode(false);
            if (polygonPoints.length > 2) setIsPolygonClosed(true);
        }
    };

    useEffect(() => {
        if (viewMode !== 'map') return;
        if (mapRef.current) return;
        if (!mapContainerRef.current) return;

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: {
                version: 8,
                sources: {
                    'satellite': {
                        type: 'raster',
                        tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'],
                        tileSize: 256,
                        maxzoom: 20
                    },
                    'open-terrain': {
                        type: 'raster-dem',
                        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                        encoding: 'terrarium',
                        tileSize: 256,
                        maxzoom: 15
                    }
                },
                layers: [
                    {
                        id: 'satellite-layer',
                        type: 'raster',
                        source: 'satellite',
                        paint: {
                            'raster-resampling': 'linear',
                            'raster-fade-duration': 0
                        }
                    }
                ],
                terrain: { source: 'open-terrain', exaggeration: 1.5 }
            },
            center: mapCenter,
            zoom: 18,
            pitch: 0,
            maxZoom: 20,
            maxPitch: 75,
        });

        mapRef.current = map;

        map.on('load', () => {
            // OpenStreetMap 3D Building Extrusions
            map.addSource('openmaptiles', {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet'
            });

            map.addLayer({
                id: '3d-buildings',
                source: 'openmaptiles',
                'source-layer': 'building',
                type: 'fill-extrusion',
                minzoom: 15,
                paint: {
                    'fill-extrusion-color': '#334155',
                    'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
                    'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                    'fill-extrusion-opacity': 0.75
                }
            });

            map.addSource('roof-polygon', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.addLayer({
                id: 'roof-polygon-fill',
                type: 'fill',
                source: 'roof-polygon',
                paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.4 }
            });

            map.addLayer({
                id: 'roof-polygon-stroke',
                type: 'line',
                source: 'roof-polygon',
                paint: { 'line-color': '#38bdf8', 'line-width': 3 }
            });

            map.on('click', (e) => {
                if (isDrawingRef.current) {
                    const newPt = [e.lngLat.lng, e.lngLat.lat];
                    const updated = [...polygonPointsRef.current, newPt];
                    setPolygonPoints(updated);

                    const source = map.getSource('roof-polygon');
                    if (source) {
                        const coords = [...updated];
                        if (coords.length > 2) coords.push(coords[0]); // Visual close
                        source.setData({
                            type: 'Feature',
                            geometry: { type: 'Polygon', coordinates: [coords] }
                        });
                    }
                } else {
                    setSelectedLocation([e.lngLat.lng, e.lngLat.lat]);
                    if (!markerRef.current) {
                        markerRef.current = new maplibregl.Marker({ color: "#94a3b8" })
                            .setLngLat([e.lngLat.lng, e.lngLat.lat])
                            .addTo(map);
                    } else {
                        markerRef.current.setLngLat([e.lngLat.lng, e.lngLat.lat]);
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
    }, [viewMode]);

    // Update Valid Panels Geometry on Map
    useEffect(() => {
        if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

        if (!mapRef.current.getSource('valid-panels')) {
            mapRef.current.addSource('valid-panels', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
            mapRef.current.addLayer({
                id: 'valid-panels-fill',
                type: 'fill',
                source: 'valid-panels',
                paint: { 'fill-color': '#64748b', 'fill-opacity': 0.6 }
            });
            mapRef.current.addLayer({
                id: 'valid-panels-stroke',
                type: 'line',
                source: 'valid-panels',
                paint: { 'line-color': '#475569', 'line-width': 1 }
            });
        }

        const features = validPanelsGeo.map(coords => ({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[...coords, coords[0]]]
            }
        }));

        mapRef.current.getSource('valid-panels').setData({
            type: 'FeatureCollection',
            features
        });
    }, [validPanelsGeo]);

    // Update Tile Provider Source
    useEffect(() => {
        if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
        const sourceUrl = tileProvider === 'google'
            ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
            : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

        if (mapRef.current.getSource('satellite')) {
            const currentStyle = mapRef.current.getStyle();
            if (currentStyle && currentStyle.sources.satellite) {
                currentStyle.sources.satellite.tiles = [sourceUrl];
                currentStyle.sources.satellite.maxzoom = 20;
                mapRef.current.setStyle(currentStyle);
            }
        }
    }, [tileProvider]);

    // Effect recalculates Turf math dynamically
    useEffect(() => {
        if (isPolygonClosed && polygonPoints.length > 2) {
            try {
                let coordinates = [...polygonPoints, polygonPoints[0]].map(p => [p[1], p[0]]); // Turf [lon, lat]
                const roofPoly = turf.polygon([coordinates]);
                setMeasuredArea(turf.area(roofPoly));

                const bbox = turf.bbox(roofPoly);
                const metersPerLat = 111320;
                const minLat = bbox[1], maxLat = bbox[3], minLon = bbox[0], maxLon = bbox[2];
                const metersPerLon = 111320 * Math.cos(minLat * Math.PI / 180);

                const w = (maxLon - minLon) * metersPerLon;
                const l = (maxLat - minLat) * metersPerLat;
                setRoofDims({ width: w, length: l });

                const lonStep = (activeSpecs.width + 0.05) / metersPerLon;
                const latStep = (activeSpecs.height + 0.05) / metersPerLat;

                const fits = [];
                for (let lon = minLon; lon < maxLon; lon += lonStep) {
                    for (let lat = minLat; lat < maxLat; lat += latStep) {
                        const center = turf.point([lon + lonStep / 2, lat + latStep / 2]);
                        if (turf.booleanPointInPolygon(center, roofPoly)) {
                            fits.push([[lat, lon], [lat + latStep, lon], [lat + latStep, lon + lonStep], [lat, lon + lonStep]]);
                        }
                    }
                }
                setValidPanelsGeo(fits);
            } catch (err) {
                addToast('Polygon matrix error.', 'error');
            }
        }
    }, [isPolygonClosed, activeSpecs.width, activeSpecs.height]);

    const scale = 30; // 3D pixel factor 

    // Telemetry & Constraints
    const effectiveArea = measuredArea > 0 ? measuredArea : (pitchTheta === 90 ? baseA * baseLength : ((baseA * baseLength) / Math.cos(pitchTheta * (Math.PI / 180))));
    const computedCapacity = isPolygonClosed ? validPanelsGeo.length : Math.floor(effectiveArea / activeSpecs.area);

    // System capacity uses manual count directly!
    const resolvedKW = (placedPanels.length * activeSpecs.wattage) / 1000;

    // Load Coverage Engine Calculations
    const dailySolarOutputWh = activeSpecs.wattage * 5.0 * placedPanels.length * 0.85;
    const dailySolarYieldKwh = dailySolarOutputWh / 1000;
    const loadCoveragePercent = appState.targetDailyLoadKwh > 0 ? (dailySolarYieldKwh / appState.targetDailyLoadKwh) * 100 : 0;

    // Sun Simulator Formula Logic
    const simulatedDate = useMemo(() => {
        const d = new Date();
        if (appState.season === 'summer') {
            d.setMonth(5); // June
            d.setDate(21);
        } else {
            d.setMonth(11); // December
            d.setDate(21);
        }
        d.setHours(Math.floor(sunTime / 60), sunTime % 60, 0);
        return d;
    }, [sunTime, appState.season]);

    const workingCoords = selectedLocation || defaultCenter;
    const sunPos = SunCalc.getPosition(simulatedDate, workingCoords[0], workingCoords[1]);

    const altitudeDeg = sunPos.altitude * (180 / Math.PI);
    const shadowIntensity = Math.max(0.1, Math.min(1, Math.tan(sunPos.altitude)));
    const shadowDistance = sunPos.altitude > 0 ? Math.max(5, (90 - altitudeDeg) * 0.8) : 500;

    const shadowX = Math.sin(sunPos.azimuth) * shadowDistance;
    const shadowY = Math.cos(sunPos.azimuth) * shadowDistance;
    const isNight = sunPos.altitude < 0.05;

    const formattedTime = simulatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="flex h-full w-full bg-slate-950 outline-none select-none overflow-hidden">

            {/* FULL CANVAS: Workspace Engine Canvas */}
            <div className="w-full h-full relative overflow-hidden flex flex-col bg-slate-950">

                {/* Unified Top Central Toggle Controls */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-auto">

                    {/* View Switcher Tabs */}
                    <div className="flex bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg backdrop-blur-md shadow-sm">
                        <button onClick={() => setViewMode('3d')} className={`flex items-center px-6 py-2.5 rounded font-semibold text-xs uppercase tracking-wider transition-all ${viewMode === '3d' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                            <Rotate3d className="w-4 h-4 mr-2" /> 3D Roof Simulator
                        </button>
                        <button onClick={() => setViewMode('map')} className={`flex items-center px-6 py-2.5 rounded font-semibold text-xs uppercase tracking-wider transition-all ${viewMode === 'map' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                            <MapIcon className="w-4 h-4 mr-2" /> Geo GIS Layer
                        </button>
                    </div>

                    {/* Sub-Mode Toggle & Instruction Banner (Only for 3D View) */}
                    {viewMode === '3d' && (
                        <>
                            {/* Instruction Context Bar */}
                            <div className="mt-2 pointer-events-none">
                                {interactionMode === 'SELECT_PLACE' && (
                                    <div className="bg-slate-900/90 backdrop-blur border border-cyan-500/30 text-cyan-400 text-xs px-4 py-1.5 rounded-full shadow-lg flex items-center font-bold uppercase tracking-widest">
                                        <MousePointer2 className="w-3.5 h-3.5 mr-2" /> Left-Click to Deploy Module • Click Deployed to Remove
                                    </div>
                                )}
                                {interactionMode === 'ORBIT_VIEW' && (
                                    <div className="bg-slate-900/90 backdrop-blur border border-slate-500/30 text-slate-300 text-xs px-4 py-1.5 rounded-full shadow-lg flex items-center font-bold uppercase tracking-widest">
                                        <Move3D className="w-3.5 h-3.5 mr-2" /> Left/Right Click to Move • Scroll to Zoom
                                    </div>
                                )}
                            </div>

                            {/* Sleek Floating Mode Toggle */}
                            <div className="flex bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl backdrop-blur-md shadow-lg pointer-events-auto">
                                <button
                                    onClick={() => setInteractionMode('ORBIT_VIEW')}
                                    className={`flex items-center px-5 py-2.5 rounded-lg font-semibold text-[11px] uppercase tracking-widest transition-all ${interactionMode === 'ORBIT_VIEW' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                                >
                                    <Move3D className="w-4 h-4 mr-2" /> Pan & Orbit
                                </button>
                                <button
                                    onClick={() => setInteractionMode('SELECT_PLACE')}
                                    className={`flex items-center px-5 py-2.5 rounded-lg font-semibold text-[11px] uppercase tracking-widest transition-all ${interactionMode === 'SELECT_PLACE' ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-800/50 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                                >
                                    <MousePointer2 className="w-4 h-4 mr-2" /> Place Panels
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {viewMode === '3d' ? (
                    /** 
                     * 3D TRIGONOMETRY ENGINE VIEW 
                     */
                    <div className="w-full h-full relative pointer-events-auto">

                        <div className="absolute top-8 left-8 z-10 pointer-events-none flex flex-col gap-1">
                            <h2 className="text-xl tracking-wider font-semibold text-slate-200 flex items-center">
                                <Rotate3d className="w-5 h-5 mr-3 text-slate-400" /> STRUCTURAL SIMULATOR
                            </h2>
                            <p className="tracking-wider text-xs font-semibold text-slate-500">INTERACTIVE 3D COMPUTE ENGINE</p>
                        </div>

                        <div className="absolute top-8 right-8 z-10 pointer-events-auto w-64 bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="tracking-wider text-xs font-semibold text-slate-300 uppercase flex items-center">
                                    <Clock4 className="w-3.5 h-3.5 mr-2" /> Heliocentric Time
                                </h3>
                                <div className="flex bg-slate-800 rounded">
                                    <button onClick={() => setAppState(prev => ({...prev, season: 'summer'}))} className={`px-2 py-1 text-[9px] uppercase font-bold rounded-l ${appState.season === 'summer' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>Sum</button>
                                    <button onClick={() => setAppState(prev => ({...prev, season: 'winter'}))} className={`px-2 py-1 text-[9px] uppercase font-bold rounded-r ${appState.season === 'winter' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>Win</button>
                                </div>
                            </div>
                            <div className="text-xs text-slate-400 mb-2 font-mono">{formattedTime}</div>
                            <input type="range" min="360" max="1080" step="15" value={sunTime} onChange={(e) => setSunTime(parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer outline-none mb-2 accent-slate-400" />
                            <div className="flex justify-between tracking-wider text-[10px] font-semibold text-slate-500 uppercase">
                                <span>6:00 AM (East)</span>
                                <span>6:00 PM (West)</span>
                            </div>
                        </div>

                        {/* Streamlined Controls & Telemetry */}
                        <div className="absolute bottom-8 left-8 z-10 flex flex-col gap-4 pointer-events-auto w-80">

                            {/* Streamlined Telemetry Display (small stat bar) */}
                            <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-lg px-4 py-3 flex flex-col gap-2 shadow-sm">
                                <div className="tracking-widest text-xs font-bold text-white uppercase drop-shadow-md flex justify-between">
                                    <span>SYSTEM CAP: {resolvedKW.toFixed(2)} kWp</span>
                                    <span className="text-cyan-400">{placedPanels.length} MODULES</span>
                                </div>
                                <div className="flex justify-between items-end border-t border-slate-800 pt-2">
                                    <div className="flex flex-col">
                                        <span className="tracking-wider text-[9px] uppercase font-bold text-slate-500">Daily Solar Yield</span>
                                        <span className="text-emerald-400 font-mono font-bold text-sm">{dailySolarYieldKwh.toFixed(1)} kWh</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="tracking-wider text-[9px] uppercase font-bold text-slate-500">Load Offset</span>
                                        <span className={`font-mono font-bold text-sm ${loadCoveragePercent >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {loadCoveragePercent.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Main Control Panel */}
                            <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-lg p-5 flex flex-col gap-5 shadow-sm">
                                <h3 className="tracking-wider text-xs font-semibold text-slate-300 uppercase flex items-center border-b border-slate-800 pb-3">
                                    <Sliders className="w-4 h-4 mr-2" /> Configuration
                                </h3>

                                {/* Structural Geometry */}
                                <div className="flex flex-col gap-4 pb-4 border-b border-slate-800">
                                    <div>
                                        <div className="flex justify-between tracking-wider text-[10px] uppercase font-semibold text-slate-400 mb-1">
                                            <span>Base Width (A)</span><span className="text-slate-200">{baseA.toFixed(1)}m</span>
                                        </div>
                                        <input type="range" min="4" max="15" step="0.5" value={baseA} onChange={(e) => setBaseA(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none outline-none accent-slate-400" />
                                    </div>
                                    <div>
                                        <div className="flex justify-between tracking-wider text-[10px] uppercase font-semibold text-slate-400 mb-1">
                                            <span>Roof Tilt (θ)</span><span className="text-slate-200">{pitchTheta.toFixed(1)}°</span>
                                        </div>
                                        <input type="range" min="0" max="45" step="0.5" value={pitchTheta} onChange={(e) => setPitchTheta(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none outline-none accent-slate-400" />
                                    </div>
                                </div>

                                {/* Deployment Controls */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-4 pb-4 border-b border-slate-800">
                                        <div className="flex flex-col">
                                            <div className="tracking-wider text-[10px] font-semibold uppercase text-slate-400 mb-1.5 flex justify-between">
                                                <span>Target Daily Load (kWh)</span>
                                                <span className="text-slate-200">{appState.targetDailyLoadKwh}</span>
                                            </div>
                                            <input type="range" min="5" max="100" step="1" 
                                                value={appState.targetDailyLoadKwh} 
                                                onChange={(e) => setAppState(prev => ({ ...prev, targetDailyLoadKwh: Number(e.target.value) }))} 
                                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none outline-none accent-slate-400" 
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col">
                                        <div className="tracking-wider text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Panel Model</div>
                                        <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}
                                            className="bg-slate-800 text-slate-200 border border-slate-700 text-sm rounded px-3 py-2 w-full focus:outline-none focus:border-slate-500 transition-colors">
                                            {SOLAR_PRESETS.map(preset => {
                                                let tag = "";
                                                if (preset.id !== 'custom') {
                                                    if (effectiveArea < 30 && preset.wattage >= 450) {
                                                        tag = " - Rec. (High Density / Small Footprint)";
                                                    } else if (effectiveArea >= 30 && (preset.wattage === 380 || preset.wattage === 400)) {
                                                        tag = " - Rec. (Standard Density)";
                                                    }
                                                }
                                                return <option key={preset.id} value={preset.id}>{preset.name} ({preset.wattage}W){tag}</option>
                                            })}
                                        </select>
                                    </div>

                                    {selectedPresetId === 'custom' && (
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="flex flex-col">
                                                <span className="tracking-wider text-[10px] font-semibold uppercase text-slate-500 mb-1 text-center">Watts</span>
                                                <input type="number" step="5" value={customSpecs.wattage} onChange={(e) => setCustomSpecs(prev => ({ ...prev, wattage: Number(e.target.value) }))} className="bg-slate-800 border border-slate-700 text-slate-200 text-xs text-center rounded px-2 py-1.5 outline-none focus:border-slate-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="tracking-wider text-[10px] font-semibold uppercase text-slate-500 mb-1 text-center">W (m)</span>
                                                <input type="number" step="0.01" value={customSpecs.width} onChange={(e) => setCustomSpecs(prev => ({ ...prev, width: Number(e.target.value) }))} className="bg-slate-800 border border-slate-700 text-slate-200 text-xs text-center rounded px-2 py-1.5 outline-none focus:border-slate-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="tracking-wider text-[10px] font-semibold uppercase text-slate-500 mb-1 text-center">H (m)</span>
                                                <input type="number" step="0.01" value={customSpecs.height} onChange={(e) => setCustomSpecs(prev => ({ ...prev, height: Number(e.target.value) }))} className="bg-slate-800 border border-slate-700 text-slate-200 text-xs text-center rounded px-2 py-1.5 outline-none focus:border-slate-500" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col">
                                        <div className="tracking-wider text-[10px] font-semibold uppercase text-slate-400 mb-1.5 flex justify-between">
                                            <span>Actions</span>
                                        </div>
                                        <button
                                            onClick={() => setPlacedPanels([])}
                                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs tracking-wider uppercase rounded border border-slate-700 transition-colors"
                                        >
                                            Clear All Modules
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* 3D SCENE GRAPH */}
                        <div className="absolute inset-0 z-0">
                            <RoofSimulator3D
                                baseA={baseA}
                                baseLength={baseLength}
                                pitchTheta={pitchTheta}
                                activeSpecs={activeSpecs}
                                placedPanels={placedPanels}
                                setPlacedPanels={setPlacedPanels}
                                isNight={isNight}
                                resolvedKW={resolvedKW}
                                interactionMode={interactionMode}
                                sunAzimuth={sunPos.azimuth}
                                sunAltitude={sunPos.altitude}
                            />
                        </div>
                    </div>
                ) : (
                    /** 
                     * GIS SATELLITE MODELER & MEASUREMENT VIEW 
                     */
                    <div className="w-full h-full relative pointer-events-auto">
                        <form onSubmit={handleSearch} className="absolute top-8 left-8 z-[400] flex gap-2">
                            <div className="flex items-center bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-lg overflow-hidden shadow-sm focus-within:border-slate-500">
                                <div className="pl-3 py-2"><Search className="w-5 h-5 text-slate-400" /></div>
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search location..." className="bg-transparent text-sm font-medium text-slate-200 p-3 w-64 outline-none font-mono" />
                            </div>
                            <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-white tracking-wider text-xs uppercase font-semibold px-5 rounded-lg border border-slate-700 shadow-sm transition-colors">Locate</button>
                            <button type="button" onClick={() => {
                                const next3D = !is3DMode;
                                setIs3DMode(next3D);
                                mapRef.current?.easeTo({ pitch: next3D ? 60 : 0, bearing: 0, duration: 1000 });
                            }} className={`tracking-wider text-xs flex items-center uppercase font-semibold px-5 rounded-lg border shadow-sm transition-colors ${is3DMode ? 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500' : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'}`}>
                                <Layers className="w-4 h-4 mr-2" /> {is3DMode ? '2D View' : '3D View'}
                            </button>
                        </form>

                        {/* Floating Toolbox */}
                        <div className="absolute top-24 left-8 z-[400] flex flex-col gap-2">
                            <select value={tileProvider} onChange={(e) => setTileProvider(e.target.value)} className="bg-slate-900/90 text-slate-400 border border-slate-800 rounded-lg backdrop-blur-md px-4 py-3 tracking-wider uppercase text-xs font-semibold focus:outline-none focus:border-slate-600 transition-colors cursor-pointer w-full shadow-sm">
                                <option value="google">Google Satellite</option>
                                <option value="esri">Esri Clarity Map</option>
                            </select>
                            <button onClick={toggleDrawingMode} className={`flex items-center px-4 py-3 rounded-lg border shadow-sm tracking-wider text-xs uppercase font-semibold transition-colors ${isDrawingMode ? 'bg-slate-200 text-slate-900 border-slate-300' : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200 backdrop-blur-md'}`}>
                                {isDrawingMode ? <><ShieldCheck className="w-4 h-4 mr-2" /> Finish Polygon</> : <><Ruler className="w-4 h-4 mr-2" /> Measure Roof Boundary</>}
                            </button>
                            {isPolygonClosed && !isDrawingMode && (
                                <button onClick={() => { setPolygonPoints([]); setIsPolygonClosed(false); setValidPanelsGeo([]); }} className="flex items-center px-4 py-3 bg-slate-900/90 backdrop-blur text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg tracking-wider uppercase text-xs font-semibold transition-colors">
                                    Clear Measurement
                                </button>
                            )}
                        </div>

                        <div
                            ref={mapContainerRef}
                            style={{ cursor: isDrawingMode ? 'crosshair' : 'grab' }}
                            className="w-full h-full relative z-[1]"
                        />

                        {/* Bottom Status Card */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg p-4 flex items-center justify-between shadow-lg w-[650px] pointer-events-auto">
                            <div className="flex gap-6 items-center">
                                <div className="flex flex-col border-r border-slate-800 pr-6">
                                    <span className="tracking-wider text-[10px] font-semibold uppercase text-slate-500 mb-0.5">Target Coordinates</span>
                                    <span className="text-sm font-mono text-slate-300">{workingCoords[0].toFixed(5)}, {workingCoords[1].toFixed(5)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="tracking-wider text-[10px] font-semibold uppercase text-slate-400 mb-0.5 flex items-center"><Goal className="w-3 h-3 mr-1" /> Spatial Fit</span>
                                    <span className="text-sm font-mono text-white font-medium">{isPolygonClosed ? validPanelsGeo.length : Math.floor(effectiveArea / activeSpecs.area)} <span className="tracking-wider text-[10px] font-semibold text-slate-500 uppercase ml-1">Max Limit</span></span>
                                </div>
                            </div>
                            <button onClick={() => {
                                addToast('Committed Spatial Footprint to System.', 'success');
                                if (isPolygonClosed && measuredArea > 0) {
                                    setBaseA(roofDims.width);
                                    setBaseLength(roofDims.length);
                                }
                                setViewMode('3d');
                            }} className="flex items-center px-5 py-2.5 bg-slate-800 text-white font-semibold text-xs tracking-wider uppercase border border-slate-700 rounded-lg hover:bg-slate-700 transition-all shadow-sm">
                                <CheckCircle className="w-4 h-4 mr-2" /> Sync 3D
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}

import React, { useState } from 'react';
import { Zap, Sun, CheckCircle2, MapPin, Activity, Percent } from 'lucide-react';
import RoofSimulator3D from '../installer/RoofSimulator3D';
import { useSolarContext } from '../../SolarContext';

export default function HomeownerDashboard() {
    const { activeClient } = useSolarContext();

    // Default read-only solar array specs for homeowner
    const [placedPanels, setPlacedPanels] = useState([
        { x: -1.2, y: 1 }, { x: 0, y: 1 }, { x: 1.2, y: 1 },
        { x: -1.2, y: -1 }, { x: 0, y: -1 }, { x: 1.2, y: -1 }
    ]);
    const activeSpecs = { width: 1.0, height: 1.7, wattage: 400 };

    const clientName = activeClient?.name || 'Engr. Antonio Alcantara';
    const clientAddress = activeClient?.address || 'Brgy. Zone 1 (Poblacion), Digos City, Davao del Sur';
    const dailyUsed = activeClient?.dailyNeedKwh || 28;

    return (
        <div className="h-full w-full p-6 md:p-8 overflow-y-auto bg-[#F4F5F7] text-slate-900 flex flex-col select-none">
            <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col space-y-6">

                {/* Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-100">
                                HOMEOWNER PORTAL
                            </span>
                            <span className="text-xs font-mono text-slate-500">Read-Only Architectural View</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                            {clientName}
                        </h1>
                        <p className="text-xs md:text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {clientAddress}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-xs text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-slate-600 font-medium">Design Approved & Active</span>
                    </div>
                </div>

                {/* 2-Column Technical Telemetry Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* System Estimate Summary (STRICTLY PHYSICAL DATA ONLY) */}
                    <section className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
                                    <Zap className="w-4 h-4" />
                                </div>
                                <h2 className="text-xs font-bold tracking-wider uppercase text-slate-900">
                                    SOLAR SYSTEM DETAILS
                                </h2>
                            </div>
                            <span className="bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100">
                                400W MODULES
                            </span>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 text-xs">
                                <span className="text-slate-500">Total Roof Size</span>
                                <span className="font-mono font-bold text-slate-900 text-sm">80.0 m²</span>
                            </div>
                            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 text-xs">
                                <span className="text-slate-500">Number of Panels</span>
                                <span className="font-mono font-bold text-emerald-600 text-sm">16 panels</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">System Power Size</span>
                                <span className="font-mono font-bold text-slate-900 text-sm">6.40 kW</span>
                            </div>
                        </div>
                    </section>

                    {/* Energy Yield Preview (STRICTLY PHYSICAL DATA ONLY) */}
                    <section className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-xs">
                                    <Sun className="w-4 h-4" />
                                </div>
                                <h2 className="text-xs font-bold tracking-wider uppercase text-slate-900">
                                    ENERGY GENERATION & USAGE
                                </h2>
                            </div>
                            <span className="bg-amber-50 text-amber-700 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-amber-100">
                                MINDANAO SOLAR
                            </span>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 text-xs">
                                <span className="text-slate-500">Power Generated Per Day</span>
                                <span className="font-mono font-bold text-emerald-600 text-sm">23.6 kWh/day</span>
                            </div>
                            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 text-xs">
                                <span className="text-slate-500">Daily Power Used</span>
                                <span className="font-mono font-bold text-slate-900 text-sm">{dailyUsed} kWh/day</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Power Offset Percentage</span>
                                <span className="font-mono font-bold text-emerald-700 text-sm">
                                    {((23.6 / dailyUsed) * 100).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 3D Roof Viewer - Homeowner Mode (Read-Only) */}
                <div className="flex-1 bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm relative min-h-[400px]">
                    <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur px-3.5 py-1.5 rounded-full border border-slate-200 shadow-xs text-xs font-semibold text-slate-700 pointer-events-none">
                        3D Roof View (Interactive Pan & Orbit)
                    </div>
                    <RoofSimulator3D
                        baseA={8.0}
                        baseLength={6.0}
                        pitchTheta={15}
                        activeSpecs={activeSpecs}
                        placedPanels={placedPanels}
                        setPlacedPanels={setPlacedPanels}
                        isNight={false}
                        isHomeownerView={true}
                    />
                </div>

            </div>
        </div>
    );
}

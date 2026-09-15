import React from 'react';
import { Settings2, Sliders, Database, Shield, Monitor, MapPin } from 'lucide-react';

export default function Settings() {
    return (
        <div className="h-full w-full p-6 md:p-10 overflow-y-auto bg-[#F4F5F7] text-slate-900 select-none">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="pb-4 border-b border-slate-200/80">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        <Settings2 className="w-7 h-7 text-emerald-600" /> Platform Settings
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                        Regional solar parameters and platform preferences for Digos City, Davao del Sur
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Geographic Regional Node */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:border-emerald-200 transition-all space-y-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                Regional GIS Center
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500">
                            Pre-configured for Digos City, Davao del Sur, Region XI, Philippines (6.7495° N, 125.3572° E).
                        </p>
                        <div className="p-3 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">Solar Standard (PSH)</span>
                            <span className="font-mono font-bold text-emerald-700">4.5 - 5.1 kWh/day</span>
                        </div>
                    </div>

                    {/* Solar Engine Tuning */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:border-emerald-200 transition-all space-y-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                <Sliders className="w-4 h-4" />
                            </div>
                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                3D Roof Engine
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500">
                            Standard Philippine corrugated GI roof pitch preset (15°) and standard 400W solar modules (1.7m × 1.0m).
                        </p>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center text-slate-600">
                                <span>Default GI Sheet Pitch</span>
                                <span className="font-mono font-bold text-slate-900">15° Standard</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-600">
                                <span>Standard Panel Rating</span>
                                <span className="font-mono font-bold text-emerald-700">400 Watts (Mono)</span>
                            </div>
                        </div>
                    </div>

                    {/* Interface Styling */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:border-emerald-200 transition-all space-y-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                <Monitor className="w-4 h-4" />
                            </div>
                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                Visual Theme
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500">
                            Light-mode neumorphic design with floating white cards and soft emerald green telemetry pills.
                        </p>
                        <div className="p-3 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">Theme Mode</span>
                            <span className="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-100">
                                Soft Neumorphism Active
                            </span>
                        </div>
                    </div>

                    {/* Access & Role Model */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:border-emerald-200 transition-all space-y-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                <Shield className="w-4 h-4" />
                            </div>
                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                2-Role Access Model
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500">
                            Installers retain full design, geometry & client editing access; Homeowners access read-only solar view.
                        </p>
                        <div className="p-3 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 text-[11px] font-mono text-slate-600 flex items-center justify-between">
                            <span>Role Status</span>
                            <span className="text-emerald-700 font-bold">Installer Verified</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

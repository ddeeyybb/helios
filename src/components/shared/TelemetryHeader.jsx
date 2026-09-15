import React, { useState } from 'react';
import { Zap, Sun, ArrowLeftRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useSolarContext } from '../../SolarContext';

export default function TelemetryHeader() {
  const { appState } = useSolarContext();

  // Simulated grid toggle for live telemetry demonstration
  const [simulationMode, setSimulationMode] = useState('auto'); // 'auto' | 'surplus' | 'deficit'

  const peakSizeKW = appState.peakSizeKW || 6.4;
  const simulatedVoltage = 400; // Operating Voltage DC
  const simulatedPanelsCount = appState.moduleCount || 16;

  // Active appliances demand
  const activeAppliances = appState.appliances || [];
  const liveDemandW = activeAppliances
    .filter(a => a.status === 'Running' || a.enabled)
    .reduce((sum, a) => sum + (a.demandW || 0), 0);

  const liveGenKW = 4.2;
  const liveDemandKW = liveDemandW / 1000 || 2.3;

  let isSelfSufficient = true;
  let netFlowKW = 0;

  if (simulationMode === 'auto') {
    netFlowKW = parseFloat((liveGenKW - liveDemandKW).toFixed(2));
    isSelfSufficient = netFlowKW >= 0;
  } else if (simulationMode === 'surplus') {
    netFlowKW = 1.9;
    isSelfSufficient = true;
  } else {
    netFlowKW = -1.2;
    isSelfSufficient = false;
  }

  return (
    <div className="w-full flex flex-col gap-4 select-none">
      {/* Simulation Controls for testing */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
            Live Telemetry • Digos Grid Node
          </span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-xs text-xs">
          <span className="text-slate-500 font-medium">Telemetry State:</span>
          <div className="flex gap-1 bg-[#F4F5F7] p-0.5 rounded-full">
            <button
              onClick={() => setSimulationMode('auto')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                simulationMode === 'auto'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setSimulationMode('surplus')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                simulationMode === 'surplus'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Surplus
            </button>
            <button
              onClick={() => setSimulationMode('deficit')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                simulationMode === 'deficit'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Deficit
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Metric Cards (ZERO CURRENCY / FINANCIAL DATA) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CARD 1: SYSTEM POWER SIZE */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                System Power Size
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ONLINE
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-3xl font-bold font-mono tracking-tight text-slate-900">
              {peakSizeKW.toFixed(2)} <span className="text-sm font-normal text-slate-500 uppercase">kW</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
              <span>Operating Voltage: <span className="font-mono font-semibold text-slate-700">{simulatedVoltage}V DC</span></span>
              <span className="font-mono font-semibold text-slate-700">{simulatedPanelsCount} Panels</span>
            </div>
          </div>
        </div>

        {/* CARD 2: DAILY POWER GENERATED */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-xs">
                <Sun className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Power Generated Per Day
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              YIELD
            </div>
          </div>

          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <div className="text-3xl font-bold font-mono tracking-tight text-slate-900">
                23.60 <span className="text-sm font-normal text-slate-500 uppercase">kWh/day</span>
              </div>
              <div className="text-xs text-slate-500 mt-3 flex items-center gap-1">
                Real-time output: <span className="font-mono font-bold text-emerald-600">{liveGenKW.toFixed(1)} kW</span>
              </div>
            </div>

            {/* Sparkline Curve */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-slate-400 font-medium uppercase">Day Curve</span>
              <svg className="w-24 h-8 overflow-visible" viewBox="0 0 120 40">
                <path
                  d="M 0,35 C 30,35 45,5 60,5 C 75,5 90,35 120,35"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="72" cy="11" r="3" fill="#059669" />
              </svg>
            </div>
          </div>
        </div>

        {/* CARD 3: POWER BALANCE */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-2xl flex items-center justify-center border shadow-xs ${
                isSelfSufficient
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  : 'bg-rose-50 text-rose-600 border-rose-100'
              }`}>
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Power Balance
              </span>
            </div>
            
            {isSelfSufficient ? (
              <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-emerald-100">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Self-Sufficient
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-rose-50 text-rose-700 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-rose-100">
                <ShieldAlert className="w-3.5 h-3.5" />
                Grid Deficit
              </span>
            )}
          </div>

          <div className="flex flex-col">
            <div className={`text-3xl font-bold font-mono tracking-tight ${
              isSelfSufficient ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {netFlowKW >= 0 ? '+' : ''}{netFlowKW.toFixed(2)} <span className="text-sm font-normal text-slate-500 uppercase">kW</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
              <span>Home Load: <span className="font-mono font-semibold text-slate-700">{liveDemandKW.toFixed(2)} kW</span></span>
              <span className={isSelfSufficient ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}>
                {isSelfSufficient ? 'Exporting Excess' : 'Importing Grid'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

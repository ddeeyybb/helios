import React, { useState, useMemo } from 'react';
import { Sun, Zap, Activity, Cpu, Percent, Table, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSolarContext } from '../../SolarContext';

export default function Dispatcher() {
    const { appState, setAppState, addToast } = useSolarContext();

    // Parameter Controls (Standard Digos Mindanao PSH: 4.5)
    const [psh, setPsh] = useState(4.5);
    const [lossFactor, setLossFactor] = useState(0.82);

    // Local appliances for Load Analysis
    const [appliances, setAppliances] = useState([
        { id: 1, name: 'Inverter Air Conditioner', demandW: 1500, quantity: 1, hoursUsed: 8, priorityTier: 'Flexible', enabled: true },
        { id: 2, name: 'Water Pump', demandW: 800, quantity: 1, hoursUsed: 4, priorityTier: 'Shiftable', enabled: true },
        { id: 3, name: 'Refrigerator', demandW: 350, quantity: 1, hoursUsed: 24, priorityTier: 'Critical', enabled: true }
    ]);

    const handleWeatherChange = (e) => {
        const profile = e.target.value;
        setAppState(prev => ({ ...prev, weatherProfile: profile }));
        addToast('Weather profile simulated.', 'info');
    };

    const systemSizeKW = appState.peakSizeKW || 6.4;

    const calculateDailyConsumption = (watts, quantity, hours) => {
        return (watts * quantity * hours) / 1000;
    };

    const totalDailyDemand = useMemo(() => {
        return appliances
            .filter(a => a.enabled)
            .reduce((sum, app) => sum + calculateDailyConsumption(app.demandW, app.quantity, app.hoursUsed), 0);
    }, [appliances]);

    const dailySolarYield = useMemo(() => {
        let weatherMultiplier = 1;
        if (appState.weatherProfile === 'cloudy') weatherMultiplier = 0.55;
        if (appState.weatherProfile === 'evening') weatherMultiplier = 0;
        return systemSizeKW * psh * lossFactor * weatherMultiplier;
    }, [systemSizeKW, psh, lossFactor, appState.weatherProfile]);

    const netBalance = dailySolarYield - totalDailyDemand;
    const solarCoverageRatio = totalDailyDemand > 0 ? (dailySolarYield / totalDailyDemand) * 100 : 100;
    const isCoverageOptimal = solarCoverageRatio >= 100;

    const toggleAppliance = (id) => {
        setAppliances(prev => prev.map(app => app.id === id ? { ...app, enabled: !app.enabled } : app));
    };

    const deleteAppliance = (id) => {
        setAppliances(prev => prev.filter(app => app.id !== id));
        addToast('Appliance removed from profile', 'info');
    };

    const addAppliance = () => {
        const newApp = {
            id: Date.now(),
            name: 'New Appliance',
            demandW: 800,
            quantity: 1,
            hoursUsed: 4,
            priorityTier: 'Flexible',
            enabled: true
        };
        setAppliances(prev => [...prev, newApp]);
        addToast('New load added', 'success');
    };

    return (
        <div className="flex flex-col h-full w-full p-6 md:p-8 overflow-y-auto bg-[#F4F5F7] text-slate-900 space-y-6 select-none">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                        <Activity className="w-6 h-6 text-emerald-600" /> Power Dispatcher
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                        Simulate daily appliance energy usage and solar production balance
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full text-xs font-semibold text-emerald-700 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Calculations Active</span>
                </div>
            </div>

            {/* Environmental Parameters Bar */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap gap-6 items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-xs">
                        <Sun className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                            Solar Parameters
                        </h2>
                        <p className="text-[10px] text-slate-500">Digos City, Davao del Sur</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                    {/* Peak Sun Hours Slider */}
                    <div className="flex flex-col">
                        <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                            <span>Sun Hours</span>
                            <span className="font-mono text-emerald-600 font-bold">{psh.toFixed(1)} h/day</span>
                        </div>
                        <input
                            type="range"
                            min="3.0"
                            max="6.0"
                            step="0.1"
                            value={psh}
                            onChange={(e) => setPsh(parseFloat(e.target.value))}
                            className="w-36 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                    </div>

                    {/* Efficiency Loss Factor */}
                    <div className="flex flex-col">
                        <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                            <span>Efficiency Factor</span>
                            <span className="font-mono text-slate-900 font-bold">{(lossFactor * 100).toFixed(0)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.70"
                            max="0.95"
                            step="0.01"
                            value={lossFactor}
                            onChange={(e) => setLossFactor(parseFloat(e.target.value))}
                            className="w-36 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                    </div>

                    {/* Weather Profile */}
                    <div className="flex items-center gap-2 bg-[#F4F5F7] px-3 py-1.5 rounded-full border border-slate-200">
                        <span className="text-xs font-semibold text-slate-600">Weather:</span>
                        <select
                            value={appState.weatherProfile || 'optimal'}
                            onChange={handleWeatherChange}
                            className="bg-white border border-slate-200 text-xs font-semibold text-slate-900 rounded-full px-2.5 py-1 outline-none cursor-pointer"
                        >
                            <option value="optimal">Optimal Sun</option>
                            <option value="cloudy">Cloud Cover</option>
                            <option value="evening">Evening Hours</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Daily Energy Balance Summary Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex flex-col w-full md:w-auto">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Daily Energy Balance
                    </span>
                    <div className="flex items-baseline gap-3">
                        <span className={`text-4xl md:text-5xl font-mono font-bold tracking-tight ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {netBalance > 0 ? '+' : ''}{netBalance.toFixed(1)} <span className="text-lg text-slate-400 font-normal">kWh/day</span>
                        </span>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center ${isCoverageOptimal ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                            {isCoverageOptimal ? <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />}
                            {isCoverageOptimal ? 'Full Solar Coverage' : 'Grid Support Needed'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 w-full md:w-auto flex-1 md:max-w-xl">
                    <div className="p-3.5 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center">
                            <Zap className="w-3 h-3 mr-1 text-emerald-600" /> Generation
                        </span>
                        <span className="text-lg font-mono font-bold text-slate-900">
                            {dailySolarYield.toFixed(1)} <span className="text-xs text-slate-500">kWh</span>
                        </span>
                    </div>

                    <div className="p-3.5 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center">
                            <Cpu className="w-3 h-3 mr-1 text-slate-600" /> Usage
                        </span>
                        <span className="text-lg font-mono font-bold text-slate-900">
                            {totalDailyDemand.toFixed(1)} <span className="text-xs text-slate-500">kWh</span>
                        </span>
                    </div>

                    <div className="p-3.5 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center">
                            <Percent className="w-3 h-3 mr-1 text-emerald-600" /> Covered
                        </span>
                        <span className={`text-lg font-mono font-bold ${isCoverageOptimal ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {solarCoverageRatio.toFixed(0)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Active Load Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 px-6 border-b border-slate-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2">
                        <Table className="w-4 h-4 text-emerald-600" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                            Daily Appliances Load Breakdown
                        </h2>
                    </div>
                    <button
                        onClick={addAppliance}
                        className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-full transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Appliance
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="text-[10px] uppercase bg-[#F4F5F7]/80 text-slate-400 border-b border-slate-100 font-mono">
                            <tr>
                                <th className="px-6 py-3.5 font-semibold">Appliance</th>
                                <th className="px-3 py-3.5 text-center font-semibold">Power (W)</th>
                                <th className="px-3 py-3.5 text-center font-semibold">Quantity</th>
                                <th className="px-3 py-3.5 text-center font-semibold">Hours / Day</th>
                                <th className="px-3 py-3.5 text-center font-semibold">Energy (kWh/day)</th>
                                <th className="px-3 py-3.5 text-center font-semibold">Priority</th>
                                <th className="px-6 py-3.5 text-right font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence mode="wait">
                                {appliances.map((app) => (
                                    <motion.tr
                                        key={app.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className={`border-b border-slate-100 transition-colors ${
                                            !app.enabled ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <td className="px-6 py-3.5 font-semibold text-slate-900">
                                            <input
                                                value={app.name}
                                                onChange={(e) =>
                                                    setAppliances((prev) =>
                                                        prev.map((a) => (a.id === app.id ? { ...a, name: e.target.value } : a))
                                                    )
                                                }
                                                className="bg-transparent border-b border-transparent focus:border-emerald-500 outline-none w-full py-0.5 text-slate-900 font-semibold"
                                            />
                                        </td>
                                        <td className="px-3 py-3.5 text-center">
                                            <input
                                                type="number"
                                                value={app.demandW}
                                                onChange={(e) =>
                                                    setAppliances((prev) =>
                                                        prev.map((a) =>
                                                            a.id === app.id ? { ...a, demandW: Number(e.target.value) } : a
                                                        )
                                                    )
                                                }
                                                className="w-20 rounded-full bg-[#F4F5F7] border border-slate-200 px-2 py-1 text-center font-mono text-slate-900 font-semibold text-xs focus:border-emerald-500 outline-none"
                                            />
                                        </td>
                                        <td className="px-3 py-3.5 text-center">
                                            <input
                                                type="number"
                                                min="1"
                                                value={app.quantity}
                                                onChange={(e) =>
                                                    setAppliances((prev) =>
                                                        prev.map((a) =>
                                                            a.id === app.id ? { ...a, quantity: Number(e.target.value) } : a
                                                        )
                                                    )
                                                }
                                                className="w-14 rounded-full bg-[#F4F5F7] border border-slate-200 px-2 py-1 text-center font-mono text-slate-900 text-xs focus:border-emerald-500 outline-none"
                                            />
                                        </td>
                                        <td className="px-3 py-3.5 text-center">
                                            <input
                                                type="number"
                                                min="0.5"
                                                max="24"
                                                step="0.5"
                                                value={app.hoursUsed}
                                                onChange={(e) =>
                                                    setAppliances((prev) =>
                                                        prev.map((a) =>
                                                            a.id === app.id ? { ...a, hoursUsed: Number(e.target.value) } : a
                                                        )
                                                    )
                                                }
                                                className="w-16 rounded-full bg-[#F4F5F7] border border-slate-200 px-2 py-1 text-center font-mono text-slate-900 text-xs focus:border-emerald-500 outline-none"
                                            />
                                        </td>
                                        <td className="px-3 py-3.5 text-center font-mono font-bold text-emerald-600 text-sm">
                                            {calculateDailyConsumption(app.demandW, app.quantity, app.hoursUsed).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-3.5 text-center">
                                            <select
                                                value={app.priorityTier}
                                                onChange={(e) =>
                                                    setAppliances((prev) =>
                                                        prev.map((a) =>
                                                            a.id === app.id ? { ...a, priorityTier: e.target.value } : a
                                                        )
                                                    )
                                                }
                                                className="bg-[#F4F5F7] border border-slate-200 rounded-full px-3 py-1 text-[11px] font-semibold text-slate-700 outline-none cursor-pointer"
                                            >
                                                <option value="Critical">Critical</option>
                                                <option value="Flexible">Flexible</option>
                                                <option value="Shiftable">Shiftable</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-3.5">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => toggleAppliance(app.id)}
                                                    className={`px-3 py-1 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                                                        app.enabled
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                                                    }`}
                                                >
                                                    {app.enabled ? 'ACTIVE' : 'OFF'}
                                                </button>
                                                <button
                                                    onClick={() => deleteAppliance(app.id)}
                                                    className="p-1 rounded-full text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

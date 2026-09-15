import React, { useState } from 'react';
import { List, Plus, Trash2, Zap, Clock, ShieldCheck } from 'lucide-react';
import { useSolarContext } from '../../SolarContext';

export default function Configurator() {
    const { appState, setAppState, addToast } = useSolarContext();
    const [formData, setFormData] = useState({
        name: '',
        demandW: '',
        runWindowStart: '08:00',
        runWindowEnd: '14:00',
        priority: 'Medium'
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.demandW) {
            addToast('Please fill all required fields', 'warning');
            return;
        }

        const newAppliance = {
            id: Date.now(),
            name: formData.name,
            demandW: parseInt(formData.demandW),
            runWindow: `${formData.runWindowStart}-${formData.runWindowEnd}`,
            priority: formData.priority,
            source: 'PV Array',
            status: 'Running'
        };

        setAppState(prev => ({
            ...prev,
            appliances: [...prev.appliances, newAppliance]
        }));

        setFormData({
            name: '',
            demandW: '',
            runWindowStart: '08:00',
            runWindowEnd: '14:00',
            priority: 'Medium'
        });

        addToast(`${newAppliance.name} added to solar appliance profile`, 'success');
    };

    const removeAppliance = (id, name) => {
        setAppState(prev => ({
            ...prev,
            appliances: prev.appliances.filter(a => a.id !== id)
        }));
        addToast(`${name} removed`, 'info');
    };

    const totalDemandW = appState.appliances.reduce((a, c) => a + (c.demandW || 0), 0);

    return (
        <div className="flex h-full w-full p-6 md:p-8 gap-6 overflow-hidden bg-[#F4F5F7] text-slate-900 select-none">
            {/* Form Pane */}
            <div className="w-1/3 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col p-6 overflow-y-auto">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                    <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
                        <Plus className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                            Add Appliance
                        </h2>
                        <p className="text-[10px] text-slate-500">Configure power profile</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 flex-1">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                            Appliance Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. 1.5HP Inverter AC"
                            className="w-full rounded-full bg-white border border-slate-200 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                            Power Demand (Watts)
                        </label>
                        <div className="relative">
                            <Zap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="number"
                                value={formData.demandW}
                                onChange={(e) => setFormData({ ...formData, demandW: e.target.value })}
                                placeholder="1200"
                                className="w-full rounded-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 font-mono font-bold transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                                Start Time
                            </label>
                            <input
                                type="time"
                                value={formData.runWindowStart}
                                onChange={(e) => setFormData({ ...formData, runWindowStart: e.target.value })}
                                className="w-full rounded-full bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 font-mono focus:border-emerald-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                                End Time
                            </label>
                            <input
                                type="time"
                                value={formData.runWindowEnd}
                                onChange={(e) => setFormData({ ...formData, runWindowEnd: e.target.value })}
                                className="w-full rounded-full bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 font-mono focus:border-emerald-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                            Priority Tier
                        </label>
                        <div className="flex bg-[#F4F5F7] p-1 rounded-full border border-slate-200 text-xs">
                            {['High', 'Medium', 'Low'].map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, priority: p })}
                                    className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                                        formData.priority === p
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-full text-xs shadow-sm transition-all flex justify-center items-center gap-2 cursor-pointer"
                        >
                            <Plus className="w-4 h-4 text-emerald-400" /> Save to Inventory
                        </button>
                    </div>
                </form>
            </div>

            {/* List Pane */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2">
                        <List className="w-4 h-4 text-emerald-600" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                            Active Appliance Inventory
                        </h2>
                    </div>
                    <div className="text-xs text-slate-600 font-semibold flex items-center bg-[#F4F5F7] px-3.5 py-1.5 rounded-full border border-slate-200">
                        Total Power: <span className="text-emerald-700 ml-1.5 font-mono font-bold">{totalDemandW} W</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {appState.appliances.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <ShieldCheck className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-xs">No appliances currently added</p>
                        </div>
                    ) : (
                        appState.appliances.map(app => (
                            <div
                                key={app.id}
                                className="bg-[#F4F5F7] border border-slate-200/70 rounded-2xl p-4 flex items-center justify-between hover:bg-slate-100/60 transition-all group"
                            >
                                <div className="flex items-center">
                                    <div
                                        className={`w-2 h-10 rounded-full mr-3.5 ${
                                            app.priority === 'High'
                                                ? 'bg-rose-500'
                                                : app.priority === 'Medium'
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                                        }`}
                                    />
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">{app.name}</h3>
                                        <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-slate-500 font-mono">
                                            <span className="flex items-center text-slate-700 font-bold">
                                                <Zap className="w-3 h-3 mr-1 text-amber-500" /> {app.demandW}W
                                            </span>
                                            <span className="flex items-center">
                                                <Clock className="w-3 h-3 mr-1 text-slate-400" /> {app.runWindow}
                                            </span>
                                            <span className="text-[10px] bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-700 font-sans font-semibold">
                                                {app.priority} Priority
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => removeAppliance(app.id, app.name)}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                                    title="Remove appliance"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

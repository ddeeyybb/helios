import React, { useState } from 'react';
import { Users, FileText, ChevronRight, Zap, ArrowRight, CheckCircle2, Clock, MapPin } from 'lucide-react';
import { useSolarContext } from '../../SolarContext';

export default function InstallerDashboard() {
    const { setActiveView, setActiveClient } = useSolarContext();

    // Mock Leads with Digos City, Davao del Sur Philippine addresses & technical data
    const [leads] = useState([
        {
            id: 'HL-492012',
            accessId: 'HL-492012',
            name: 'Engr. Antonio Alcantara',
            address: 'Brgy. Zone 1 (Poblacion), Digos City, Davao del Sur',
            barangay: 'Brgy. Zone 1 (Poblacion)',
            city: 'Digos City',
            province: 'Davao del Sur',
            phone: '+63 917 882 1948',
            roofArea: '80.0 m²',
            panels: 16,
            systemKW: '6.40 kW',
            dailyYield: '23.6 kWh/day',
            targetLoad: '28',
            status: 'Ready for 3D View'
        },
        {
            id: 'HL-773104',
            accessId: 'HL-773104',
            name: 'Maria Elena Santos',
            address: 'Brgy. Tres de Mayo, Digos City, Davao del Sur',
            barangay: 'Brgy. Tres de Mayo',
            city: 'Digos City',
            province: 'Davao del Sur',
            phone: '+63 928 554 9912',
            roofArea: '110.0 m²',
            panels: 24,
            systemKW: '9.60 kW',
            dailyYield: '35.4 kWh/day',
            targetLoad: '22',
            status: 'Draft Outline'
        },
        {
            id: 'HL-882910',
            accessId: 'HL-882910',
            name: 'Dr. Roberto Mendoza',
            address: 'Brgy. Aplaya, Digos City, Davao del Sur',
            barangay: 'Brgy. Aplaya',
            city: 'Digos City',
            province: 'Davao del Sur',
            phone: '+63 918 331 4402',
            roofArea: '95.0 m²',
            panels: 20,
            systemKW: '8.00 kW',
            dailyYield: '29.5 kWh/day',
            targetLoad: '25',
            status: 'Completed'
        }
    ]);

    const [selectedLead, setSelectedLead] = useState(leads[0]);

    const handleOpenIn3D = (lead) => {
        if (setActiveClient) {
            setActiveClient(lead);
        }
        setActiveView('sitemapper');
    };

    return (
        <div className="h-full w-full p-6 md:p-8 overflow-y-auto bg-[#F4F5F7] text-slate-900 select-none">
            <div className="max-w-6xl mx-auto flex flex-col h-full space-y-6">

                {/* Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                            Proposals & Solar Leads
                        </h1>
                        <p className="text-xs md:text-sm text-slate-500 mt-1">
                            Review homeowner telemetry and open proposals directly in the 3D Roof View
                        </p>
                    </div>

                    <button
                        onClick={() => setActiveView('add-homeowner')}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-sm transition-all cursor-pointer"
                    >
                        + Add Homeowner
                    </button>
                </div>

                {/* Main Content Split Pane */}
                <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">

                    {/* LEADS QUEUE TABLE */}
                    <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 px-6 border-b border-slate-100 bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-emerald-600" />
                                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                                    Queue ({leads.length} Accounts)
                                </h2>
                            </div>
                            <span className="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-100">
                                DIGOS CITY
                            </span>
                        </div>

                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="text-[10px] uppercase text-slate-400 bg-[#F4F5F7]/60 border-b border-slate-100 font-mono">
                                    <tr>
                                        <th className="px-5 py-3 font-semibold">Account ID</th>
                                        <th className="px-5 py-3 font-semibold">Homeowner</th>
                                        <th className="px-5 py-3 font-semibold">Status</th>
                                        <th className="px-5 py-3 font-semibold text-right"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map((lead) => (
                                        <tr
                                            key={lead.id}
                                            onClick={() => setSelectedLead(lead)}
                                            className={`border-b border-slate-100 cursor-pointer transition-colors ${
                                                selectedLead?.id === lead.id
                                                    ? 'bg-emerald-50/50'
                                                    : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <td className="px-5 py-3.5 font-mono text-xs text-slate-500 font-semibold">
                                                {lead.id}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="font-semibold text-slate-900 text-xs">
                                                    {lead.name}
                                                </div>
                                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                                    <span className="truncate max-w-[200px]">{lead.barangay}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span
                                                    className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${
                                                        lead.status === 'Completed'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                            : lead.status === 'Ready for 3D View'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                            : 'bg-slate-100 text-slate-700 border-slate-200'
                                                    }`}
                                                >
                                                    {lead.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* LEAD DETAILS PANEL */}
                    <div className="md:w-[420px] flex-shrink-0 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm overflow-y-auto space-y-6">
                        {selectedLead ? (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900">
                                            {selectedLead.name}
                                        </h2>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {selectedLead.address}
                                        </p>
                                        <p className="text-xs font-mono text-emerald-700 mt-1">
                                            {selectedLead.phone}
                                        </p>
                                    </div>
                                    <span className="px-2.5 py-1 bg-[#F4F5F7] text-slate-600 text-[10px] rounded-full border border-slate-200 font-mono font-bold">
                                        {selectedLead.id}
                                    </span>
                                </div>

                                {/* 2x2 Technical Metrics Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-[#F4F5F7] p-3.5 rounded-2xl border border-slate-200/60">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">
                                            Total Roof Size
                                        </div>
                                        <div className="text-base font-bold font-mono text-slate-900">
                                            {selectedLead.roofArea}
                                        </div>
                                    </div>
                                    <div className="bg-[#F4F5F7] p-3.5 rounded-2xl border border-slate-200/60">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">
                                            Number of Panels
                                        </div>
                                        <div className="text-base font-bold font-mono text-emerald-600">
                                            {selectedLead.panels} panels
                                        </div>
                                    </div>
                                    <div className="bg-[#F4F5F7] p-3.5 rounded-2xl border border-slate-200/60">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">
                                            System Power Size
                                        </div>
                                        <div className="text-base font-bold font-mono text-slate-900">
                                            {selectedLead.systemKW}
                                        </div>
                                    </div>
                                    <div className="bg-[#F4F5F7] p-3.5 rounded-2xl border border-slate-200/60">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">
                                            Power Yield
                                        </div>
                                        <div className="text-base font-bold font-mono text-emerald-600">
                                            {selectedLead.dailyYield}
                                        </div>
                                    </div>
                                </div>

                                {/* Daily Energy Assessment */}
                                <div className="bg-[#F4F5F7] p-4 rounded-2xl border border-slate-200/60 space-y-3">
                                    <div className="flex items-center text-xs font-bold uppercase tracking-wider text-slate-900">
                                        <FileText className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Technical Energy Target
                                    </div>
                                    <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-200">
                                        <span className="text-slate-500">Daily Power Used</span>
                                        <span className="font-mono font-bold text-slate-900">{selectedLead.targetLoad} kWh/day</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-200">
                                        <span className="text-slate-500">Power Generated Per Day</span>
                                        <span className="font-mono font-bold text-emerald-600">{selectedLead.dailyYield}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs pt-1">
                                        <span className="text-slate-600 font-semibold">Load Coverage</span>
                                        <span className="text-emerald-700 font-bold font-mono text-sm">
                                            {((parseFloat(selectedLead.dailyYield) / parseFloat(selectedLead.targetLoad)) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>

                                {/* Launch into 3D View Button */}
                                <button
                                    onClick={() => handleOpenIn3D(selectedLead)}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-full text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <span>Open Proposal in 3D Roof View</span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-500">
                                Select a lead to view details
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

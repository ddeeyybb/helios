import React, { useState } from 'react';
import { Zap, Mail, Lock, ArrowRight, ShieldCheck, MapPin } from 'lucide-react';
import { useSolarContext } from '../../SolarContext';

export default function AuthGate() {
    const { login } = useSolarContext();
    const [selectedRole, setSelectedRole] = useState('installer'); // 'installer' | 'homeowner'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        login(selectedRole, email || `${selectedRole}@helios.ph`);
    };

    return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-[#F4F5F7] p-6 selection:bg-emerald-100 selection:text-emerald-900 select-none">
            <div className="w-full max-w-md flex flex-col gap-6">

                {/* Branding Header */}
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xs border border-slate-100">
                        <Zap className="w-6 h-6 fill-emerald-600 text-emerald-600" />
                    </div>
                    <div>
                        <div className="flex items-center justify-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">HELIOS</h1>
                            <span className="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-emerald-100">
                                SOLAR
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-600" /> Digos City, Davao del Sur, Philippines
                        </p>
                    </div>
                </div>

                {/* Main Card Surface */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">

                    {/* Role Selector Pill */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                            Select Access Role
                        </label>
                        <div className="flex bg-[#F4F5F7] rounded-full p-1 border border-slate-200/80">
                            <button
                                type="button"
                                onClick={() => { setSelectedRole('installer'); setEmail(''); setPassword(''); }}
                                className={`flex-1 py-2 rounded-full font-semibold text-xs transition-all cursor-pointer ${
                                    selectedRole === 'installer'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                Solar Installer
                            </button>
                            <button
                                type="button"
                                onClick={() => { setSelectedRole('homeowner'); setEmail(''); setPassword(''); }}
                                className={`flex-1 py-2 rounded-full font-semibold text-xs transition-all cursor-pointer ${
                                    selectedRole === 'homeowner'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                Homeowner
                            </button>
                        </div>
                    </div>

                    <form className="space-y-4" onSubmit={handleLogin}>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                                {selectedRole === 'installer' ? 'Installer Email / ID' : 'Homeowner Access ID'}
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={selectedRole === 'installer' ? 'installer@helios.ph' : 'HL-492012'}
                                    className="w-full rounded-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
                                Password / Passcode
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-full text-xs shadow-sm transition-all flex items-center justify-center gap-2 group cursor-pointer"
                            >
                                <span>Sign In as {selectedRole === 'installer' ? 'Installer' : 'Homeowner'}</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </form>

                    {/* Role Description Context */}
                    <div className="p-3 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 text-[11px] text-slate-600 flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>
                            {selectedRole === 'installer'
                                ? 'Full design and editing mode: Adjust roof pitch, draw outline, customize panel layout.'
                                : 'Homeowner mode: View proposal telemetry, 3D roof simulator, and appliance dispatcher.'}
                        </span>
                    </div>
                </div>

                {/* Footer Tag */}
                <div className="text-center text-[10px] text-slate-400 font-mono">
                    Helios Solar Platform • Digos City, Davao del Sur
                </div>
            </div>
        </div>
    );
}

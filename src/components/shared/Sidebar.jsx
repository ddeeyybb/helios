import React from 'react';
import {
    Map as MapIcon,
    Activity,
    Settings as SettingsIcon,
    LogOut,
    Zap,
    List,
    LayoutDashboard,
    UserPlus,
    Compass
} from 'lucide-react';
import { useSolarContext } from '../../SolarContext';

export default function Sidebar() {
    const { role, activeView, setActiveView, handleLogout, activeClient } = useSolarContext();

    const getNavItems = () => {
        if (!role) return [];
        if (role === 'installer') {
            return [
                { id: 'sitemapper', label: 'Solar Designer', icon: Compass },
                { id: 'dashboard', label: 'Proposals & Leads', icon: LayoutDashboard },
                { id: 'add-homeowner', label: 'Add Homeowner', icon: UserPlus },
                { id: 'inventory', label: 'Appliance Inventory', icon: List },
                { id: 'settings', label: 'Settings', icon: SettingsIcon }
            ];
        }
        if (role === 'homeowner') {
            return [
                { id: 'dashboard', label: 'Solar Overview', icon: LayoutDashboard },
                { id: 'dispatcher', label: 'Power Dispatcher', icon: Activity },
                { id: 'inventory', label: 'Home Appliances', icon: List },
                { id: 'settings', label: 'Settings', icon: SettingsIcon }
            ];
        }
        return [];
    };

    const NAV_ITEMS = getNavItems();

    return (
        <aside
            className={`transition-all duration-300 flex flex-col bg-white border-r border-slate-100 shadow-xs z-50 select-none ${
                role ? 'w-64' : 'w-0 overflow-hidden opacity-0 pointer-events-none'
            }`}
        >
            {/* Header Branding */}
            <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs shrink-0">
                    <Zap className="w-5 h-5 fill-emerald-600 text-emerald-600" />
                </div>
                <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-base font-bold tracking-tight text-slate-900">HELIOS</h1>
                        <span className="bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                            SOLAR
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                        Digos City, Davao del Sur
                    </p>
                </div>
            </div>

            {/* Active User / Role Badge */}
            {role && (
                <div className="px-4 pt-4">
                    <div className="p-3 bg-[#F4F5F7] rounded-2xl border border-slate-200/60 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {role === 'installer' ? 'Installer Mode' : 'Homeowner View'}
                            </span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <span className="text-xs font-semibold text-slate-900 truncate">
                            {role === 'installer' ? 'Digos City Solar Installer' : (activeClient?.name || 'Homeowner Portal')}
                        </span>
                    </div>
                </div>
            )}

            {/* Navigation Links */}
            <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveView(item.id)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                        >
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* Footer Sign Out */}
            {role && (
                <div className="p-4 border-t border-slate-100 bg-white">
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 w-full rounded-full text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                    </button>
                </div>
            )}
        </aside>
    );
}

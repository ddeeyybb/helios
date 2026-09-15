import React from 'react';
import { useSolarContext } from '../../SolarContext';
import HomeownerDashboard from './HomeownerDashboard';
import Dispatcher from './Dispatcher';
import Configurator from '../shared/Configurator';
import Settings from '../shared/Settings';

export default function HomeownerLayout() {
    const { activeView } = useSolarContext();

    return (
        <div className="flex-1 relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
            {activeView === 'dashboard' && <HomeownerDashboard />}
            {activeView === 'dispatcher' && <Dispatcher />}
            {activeView === 'inventory' && <Configurator />}
            {activeView === 'settings' && <Settings />}
        </div>
    );
}

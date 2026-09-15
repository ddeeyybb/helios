import React from 'react';
import { useSolarContext } from '../../SolarContext';
import InstallerDashboard from './InstallerDashboard';
import Roof3DWorldView from './Roof3DWorldView';
import AddHomeownerView from './AddHomeownerView';
import Configurator from '../shared/Configurator';
import Settings from '../shared/Settings';

export default function InstallerLayout() {
    const { activeView } = useSolarContext();

    return (
        <div className="flex-1 relative overflow-hidden bg-[#F4F5F7]">
            {activeView === 'sitemapper' && <Roof3DWorldView />}
            {activeView === 'dashboard' && <InstallerDashboard />}
            {activeView === 'add-homeowner' && <AddHomeownerView />}
            {activeView === 'inventory' && <Configurator />}
            {activeView === 'settings' && <Settings />}
        </div>
    );
}

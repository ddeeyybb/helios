import React, { createContext, useContext, useState } from 'react';

const SolarContext = createContext();

export function useSolarContext() {
    const context = useContext(SolarContext);
    if (!context) {
        return {
            role: null,
            user: null,
            activeView: 'auth',
            toasts: [],
            activeClient: null,
            clients: [],
            appState: { appliances: [] },
            setAppState: () => { },
            setActiveClient: () => { },
            createHomeowner: () => { },
            login: () => { },
            handleLogout: () => { },
            addToast: () => { },
            setActiveView: () => { }
        };
    }
    return context;
}

const DEFAULT_CLIENTS = [
    {
        id: 'HL-492012',
        accessId: 'HL-492012',
        passcode: '882194',
        name: 'Engr. Antonio Alcantara',
        barangay: 'Brgy. Zone 1 (Poblacion)',
        city: 'Digos City',
        province: 'Davao del Sur',
        address: 'Brgy. Zone 1 (Poblacion), Digos City, Davao del Sur',
        phone: '+63 917 882 1948',
        dailyNeedKwh: 28,
        createdAt: new Date().toISOString()
    },
    {
        id: 'HL-773104',
        accessId: 'HL-773104',
        passcode: '331049',
        name: 'Maria Elena Santos',
        barangay: 'Brgy. Tres de Mayo',
        city: 'Digos City',
        province: 'Davao del Sur',
        address: 'Brgy. Tres de Mayo, Digos City, Davao del Sur',
        phone: '+63 928 554 9912',
        dailyNeedKwh: 22,
        createdAt: new Date().toISOString()
    }
];

export function SolarProvider({ children }) {
    const [role, setRole] = useState(null); // 'homeowner' | 'installer'
    const [user, setUser] = useState(null);
    const [activeView, setActiveView] = useState('auth');
    const [toasts, setToasts] = useState([]);
    const [clients, setClients] = useState(DEFAULT_CLIENTS);
    const [activeClient, setActiveClient] = useState(DEFAULT_CLIENTS[0]);

    // Technical Telemetry & App state (Strictly physical, zero monetary metrics)
    const [appState, setAppState] = useState({
        targetDailyLoadKwh: 28,
        season: 'DRY', // 'DRY' (High Sunlight: 5.1 PSH), 'WET' (Low Sunlight: 4.1 PSH)
        weatherProfile: 'optimal', // 'optimal', 'cloudy', 'evening'
        totalArea: 80.0,
        moduleCount: 16,
        peakSizeKW: 6.4,
        azimuth: 180,
        freshCanvasTimestamp: Date.now(),
        appliances: [
            { id: 1, name: 'Air Conditioner', demandW: 1500, priority: 'High', runWindow: '12:00-16:00', source: 'PV Array', status: 'Running' },
            { id: 2, name: 'Water Pump', demandW: 800, priority: 'Medium', runWindow: '10:00-14:00', source: 'PV Array', status: 'Pending' },
            { id: 3, name: 'Refrigerator', demandW: 350, priority: 'Critical', runWindow: '00:00-24:00', source: 'PV Array', status: 'Running' }
        ]
    });

    const createHomeowner = (data) => {
        const id = `HL-${Math.floor(100000 + Math.random() * 900000)}`;
        const passcode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const newClient = {
            id,
            accessId: id,
            passcode,
            name: data.name,
            barangay: data.barangay || 'Brgy. Zone 1 (Poblacion)',
            city: data.city || 'Digos City',
            province: data.province || 'Davao del Sur',
            address: `${data.barangay || 'Brgy. Zone 1 (Poblacion)'}, ${data.city || 'Digos City'}, ${data.province || 'Davao del Sur'}`,
            phone: data.phone,
            dailyNeedKwh: Number(data.dailyNeedKwh) || 20,
            createdAt: new Date().toISOString()
        };

        setClients(prev => [newClient, ...prev]);
        setActiveClient(newClient);
        
        // Reset 3D canvas
        setAppState(prev => ({
            ...prev,
            targetDailyLoadKwh: newClient.dailyNeedKwh,
            freshCanvasTimestamp: Date.now()
        }));

        addToast(`Registered client: ${newClient.name} (${newClient.barangay})`, 'success');
        return newClient;
    };

    const login = (selectedRole, email) => {
        setRole(selectedRole);
        setUser({ role: selectedRole, email });
        setActiveView(selectedRole === 'installer' ? 'sitemapper' : 'dashboard');
        addToast(`Signed in as ${selectedRole === 'installer' ? 'Solar Installer' : 'Homeowner'}`, 'success');
    };

    const handleLogout = () => {
        setRole(null);
        setUser(null);
        setActiveView('auth');
        addToast('Signed out successfully', 'info');
    };

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    };

    const value = {
        role,
        user,
        activeView,
        setActiveView,
        toasts,
        clients,
        setClients,
        activeClient,
        setActiveClient,
        createHomeowner,
        appState,
        setAppState,
        login,
        handleLogout,
        addToast
    };

    return (
        <SolarContext.Provider value={value}>
            {children}
        </SolarContext.Provider>
    );
}

export default SolarProvider;

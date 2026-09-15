import React from 'react';
import { useSolarContext } from './SolarContext';
import AuthGate from './components/auth/AuthGate';
import Sidebar from './components/shared/Sidebar';
import InstallerLayout from './components/installer/InstallerLayout';
import HomeownerLayout from './components/homeowner/HomeownerLayout';
import Toast from './components/shared/Toast';

export default function App() {
  const { role, toasts } = useSolarContext();

  return (
    <div className="flex h-screen w-full bg-[#F4F5F7] text-slate-900 overflow-hidden font-sans select-none">
      {/* Dynamic Role Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      {(!role || role === 'guest') && <AuthGate />}
      {role === 'installer' && <InstallerLayout />}
      {role === 'homeowner' && <HomeownerLayout />}

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-[300] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <Toast key={toast.id} message={toast.message} type={toast.type} />
        ))}
      </div>
    </div>
  );
}

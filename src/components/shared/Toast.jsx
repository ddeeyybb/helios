import React from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export default function Toast({ message, type }) {
    const getStyles = () => {
        switch (type) {
            case 'success':
                return {
                    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
                    bg: 'bg-emerald-50 text-emerald-900 border-emerald-200'
                };
            case 'warning':
                return {
                    icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
                    bg: 'bg-amber-50 text-amber-900 border-amber-200'
                };
            case 'error':
                return {
                    icon: <XCircle className="w-4 h-4 text-rose-600 shrink-0" />,
                    bg: 'bg-rose-50 text-rose-900 border-rose-200'
                };
            case 'info':
            default:
                return {
                    icon: <Info className="w-4 h-4 text-slate-700 shrink-0" />,
                    bg: 'bg-white text-slate-900 border-slate-200'
                };
        }
    };

    const { icon, bg } = getStyles();

    return (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border ${bg} shadow-lg backdrop-blur-md pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-md text-xs font-medium`}>
            {icon}
            <p className="leading-snug">{message}</p>
        </div>
    );
}

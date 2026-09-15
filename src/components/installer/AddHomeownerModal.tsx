import React, { useState } from 'react';
import { X, UserPlus, MapPin, Phone, Zap, Building, CheckCircle2 } from 'lucide-react';

export interface HomeownerData {
  id: string;
  name: string;
  barangay: string;
  city: string;
  province: string;
  address: string;
  phone: string;
  dailyNeedKwh: number;
}

interface AddHomeownerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveHomeowner: (homeowner: HomeownerData) => void;
}

export const DIGOS_BARANGAYS = [
  'Brgy. Zone 1 (Poblacion)',
  'Brgy. Zone 2 (Poblacion)',
  'Brgy. Zone 3 (Poblacion)',
  'Brgy. Central (Poblacion)',
  'Brgy. Tres de Mayo',
  'Brgy. Aplaya',
  'Brgy. Colorado',
  'Brgy. Kapatagan',
  'Brgy. Matti',
  'Brgy. Sinawilan',
  'Brgy. Duluth',
  'Brgy. Dawis',
  'Brgy. Igpit',
  'Brgy. Mahyahay',
  'Brgy. Rufo Cruz',
];

export const AddHomeownerModal: React.FC<AddHomeownerModalProps> = ({
  isOpen,
  onClose,
  onSaveHomeowner,
}) => {
  const [name, setName] = useState('');
  const [barangay, setBarangay] = useState(DIGOS_BARANGAYS[0]);
  const [phone, setPhone] = useState('+63 917 555 1234');
  const [dailyNeed, setDailyNeed] = useState(25);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  const validatePhone = (val: string) => {
    const phRegex = /^(\+63\s?9\d{2}\s?\d{3}\s?\d{4}|09\d{2}-?\d{3}-?\d{4})$/;
    return phRegex.test(val.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Homeowner name is required';
    }

    if (!validatePhone(phone)) {
      newErrors.phone = 'Valid PH Phone (+63 9XX XXX XXXX or 09XX-XXX-XXXX) is required';
    }

    if (dailyNeed <= 0) {
      newErrors.dailyNeed = 'Daily energy need must be greater than 0';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const newHomeowner: HomeownerData = {
      id: `DIG-${Date.now().toString().slice(-4)}`,
      name: name.trim(),
      barangay,
      city: 'Digos City',
      province: 'Davao del Sur',
      address: `${barangay}, Digos City, Davao del Sur`,
      phone: phone.trim(),
      dailyNeedKwh: Number(dailyNeed),
    };

    onSaveHomeowner(newHomeowner);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden flex flex-col text-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Add Homeowner
                <span className="bg-emerald-50 text-emerald-600 font-semibold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-100">
                  DIGOS CITY
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Register new customer profile & reset 3D roof canvas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Homeowner Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 ml-2">
              Homeowner Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Engr. Maria Santos"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              className={`w-full rounded-full bg-white border ${
                errors.name ? 'border-rose-400' : 'border-slate-200 focus:border-emerald-500'
              } px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all`}
            />
            {errors.name && <p className="text-xs text-rose-500 mt-1 ml-2">{errors.name}</p>}
          </div>

          {/* Barangay Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 ml-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              Barangay (Digos City) <span className="text-rose-500">*</span>
            </label>
            <select
              value={barangay}
              onChange={(e) => setBarangay(e.target.value)}
              className="w-full rounded-full bg-white border border-slate-200 focus:border-emerald-500 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all cursor-pointer"
            >
              {DIGOS_BARANGAYS.map((brgy) => (
                <option key={brgy} value={brgy}>
                  {brgy}
                </option>
              ))}
            </select>
          </div>

          {/* City & Province (Read-only Defaults) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 ml-2 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                City / Municipality
              </label>
              <input
                type="text"
                value="Digos City"
                disabled
                className="w-full rounded-full bg-slate-50 border border-slate-200 px-4 py-2 text-xs font-mono text-slate-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 ml-2 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                Province
              </label>
              <input
                type="text"
                value="Davao del Sur"
                disabled
                className="w-full rounded-full bg-slate-50 border border-slate-200 px-4 py-2 text-xs font-mono text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* PH Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 ml-2 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              PH Phone Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="+63 917 123 4567 or 0917-123-4567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
              }}
              className={`w-full rounded-full bg-white border ${
                errors.phone ? 'border-rose-400' : 'border-slate-200 focus:border-emerald-500'
              } px-4 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all`}
            />
            {errors.phone ? (
              <p className="text-xs text-rose-500 mt-1 ml-2">{errors.phone}</p>
            ) : (
              <p className="text-xs text-slate-500 mt-1 ml-2 font-mono">Format: +63 9XX XXX XXXX or 09XX-XXX-XXXX</p>
            )}
          </div>

          {/* Daily Energy Need (kWh/day) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Target Daily Energy Need
              </label>
              <span className="bg-emerald-50 text-emerald-600 font-semibold px-2.5 py-0.5 rounded-full text-xs font-mono border border-emerald-100">
                {dailyNeed} kWh/day
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={dailyNeed}
              onChange={(e) => setDailyNeed(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>5 kWh (Residential)</span>
              <span>100 kWh (Commercial)</span>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Save & Start 3D Engine
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddHomeownerModal;

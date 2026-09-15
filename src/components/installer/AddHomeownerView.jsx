import React, { useState } from 'react';
import { UserPlus, MapPin, Phone, Zap, Building, CheckCircle2, Copy, ArrowRight, ShieldCheck, Key, Lock, Sparkles } from 'lucide-react';
import { useSolarContext } from '../../SolarContext';

export const DIGOS_BARANGAYS = [
  'Brgy. Central (Poblacion)',
  'Brgy. Zone 1 (Poblacion)',
  'Brgy. Zone 2 (Poblacion)',
  'Brgy. Zone 3 (Poblacion)',
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
  'Brgy. Rufo Cruz'
];

export default function AddHomeownerView() {
  const { createHomeowner, setActiveView, addToast } = useSolarContext();

  const [name, setName] = useState('');
  const [barangay, setBarangay] = useState(DIGOS_BARANGAYS[0]);
  const [city, setCity] = useState('Digos City');
  const [province, setProvince] = useState('Davao del Sur');
  const [phone, setPhone] = useState('+63 917 555 1234');
  const [dailyNeed, setDailyNeed] = useState(24);
  const [errors, setErrors] = useState({});

  // Credentials confirmation modal state
  const [createdAccount, setCreatedAccount] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const validatePhone = (val) => {
    const phRegex = /^(\+63\s?9\d{2}\s?\d{3}\s?\d{4}|09\d{2}-?\d{3}-?\d{4})$/;
    return phRegex.test(val.trim());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Full Name is required';
    }

    if (!validatePhone(phone)) {
      newErrors.phone = 'Valid PH Phone (+63 9XX XXX XXXX or 09XX-XXX-XXXX) is required';
    }

    if (!dailyNeed || dailyNeed <= 0) {
      newErrors.dailyNeed = 'Daily power baseline must be greater than 0 kWh/day';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const homeowner = createHomeowner({
      name,
      barangay,
      city,
      province,
      phone,
      dailyNeedKwh: dailyNeed
    });

    setCreatedAccount(homeowner);
  };

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    addToast(`Copied ${fieldName} to clipboard`, 'info');
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleProceedTo3DMap = () => {
    setActiveView('sitemapper');
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[#F4F5F7] text-slate-900 p-6 md:p-10 font-sans selection:bg-emerald-100 selection:text-emerald-900 scrollbar-thin">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Banner with flex wrap */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-100">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex flex-wrap items-center gap-3">
                  Generate Homeowner Account
                  <span className="bg-emerald-50 text-emerald-600 font-semibold px-3 py-1 rounded-full text-xs border border-emerald-100">
                    Installer Module
                  </span>
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Create credentials & initialize active 3D Roof Map with a fresh grid canvas
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full text-xs text-slate-600 font-medium shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Strict Installer-Only Provisioning</span>
          </div>
        </div>

        {/* Form Container Card */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm relative overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            
            {/* Section 1: Personal Profile */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                1. Homeowner Personal Details
              </h2>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2">
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
                  } px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all`}
                />
                {errors.name && <p className="text-xs text-rose-500 mt-1 ml-2">{errors.name}</p>}
              </div>
            </div>

            {/* Section 2: Address Specification */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                2. Installation Site Address
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Barangay */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    Barangay <span className="text-rose-500">*</span>
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

                {/* City */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    City / Municipality
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-full bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm font-mono text-slate-600 cursor-default"
                  />
                </div>

                {/* Province */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    Province
                  </label>
                  <input
                    type="text"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded-full bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm font-mono text-slate-600 cursor-default"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Contact & Load Metrics */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                3. Contact Information & Power Baseline
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PH Phone Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ml-2 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    PH Phone Number (+63) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="+63 917 123 4567"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    className={`w-full rounded-full bg-white border ${
                      errors.phone ? 'border-rose-400' : 'border-slate-200 focus:border-emerald-500'
                    } px-4 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all`}
                  />
                  {errors.phone ? (
                    <p className="text-xs text-rose-500 mt-1 ml-2">{errors.phone}</p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1 ml-2 font-mono">Format: +63 9XX XXX XXXX or 09XX-XXX-XXXX</p>
                  )}
                </div>

                {/* Daily Power Baseline */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Daily Power Baseline
                    </label>
                    <span className="bg-emerald-50 text-emerald-600 font-semibold px-3 py-1 rounded-full text-xs font-mono border border-emerald-100">
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
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 my-2"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-500">
                    <span>5 kWh (Residential)</span>
                    <span>50 kWh (Medium)</span>
                    <span>100 kWh (Commercial)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-3 rounded-full text-sm shadow-sm transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform" />
                <span>Generate Account & Reset 3D Canvas</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Account Credentials Confirmation Modal */}
      {createdAccount && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden flex flex-col relative text-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Homeowner Account Created</h3>
                  <p className="text-xs text-slate-500">Credentials generated & ready for portal access</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              <div className="bg-[#F4F5F7] border border-slate-200/60 rounded-2xl p-4 space-y-2.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Homeowner Profile Summary
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Full Name:</span>
                  <span className="font-semibold text-slate-900">{createdAccount.name}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Address:</span>
                  <span className="font-mono text-xs text-slate-700 text-right">{createdAccount.address}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-mono text-slate-700">{createdAccount.phone}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Daily Baseline:</span>
                  <span className="font-mono font-bold text-emerald-600">{createdAccount.dailyNeedKwh} kWh/day</span>
                </div>
              </div>

              {/* System Credentials Display */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-emerald-600" /> Homeowner Login Credentials
                </div>

                {/* Access ID */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
                  <div>
                    <span className="block text-[10px] font-mono text-slate-500 uppercase">Homeowner Access ID</span>
                    <span className="font-mono font-bold text-lg text-emerald-600 tracking-wider">
                      {createdAccount.accessId}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy(createdAccount.accessId, 'Access ID')}
                    className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 text-xs font-mono font-semibold cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedField === 'Access ID' ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Temporary Passcode */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
                  <div>
                    <span className="block text-[10px] font-mono text-slate-500 uppercase">Temporary Passcode</span>
                    <span className="font-mono font-bold text-lg text-slate-900 tracking-wider">
                      {createdAccount.passcode}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy(createdAccount.passcode, 'Passcode')}
                    className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 text-xs font-mono font-semibold cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedField === 'Passcode' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-800 flex items-start gap-2">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Active client updated automatically. Homeowners use these credentials on the login screen for read-only portal access.</span>
              </div>
            </div>

            {/* Modal Footer Action */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleProceedTo3DMap}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-full text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Proceed to 3D Roof Map (Fresh Grid Canvas)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

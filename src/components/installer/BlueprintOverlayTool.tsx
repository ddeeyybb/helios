import React, { useRef } from 'react';
import { Upload, RotateCw, ZoomIn, Eye, Move, Trash2, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

export interface OverlaySettings {
  imageUrl: string | null;
  imageName: string | null;
  scale: number;       // 0.2 to 4.0 (multiplier)
  rotation: number;    // 0 to 360 (degrees)
  opacity: number;     // 0.1 to 1.0
  offsetX: number;     // -300 to +300 (pixels)
  offsetY: number;     // -300 to +300 (pixels)
  isVisible: boolean;
}

interface BlueprintOverlayToolProps {
  settings: OverlaySettings;
  onChange: (settings: OverlaySettings) => void;
  onReset: () => void;
}

export const BlueprintOverlayTool: React.FC<BlueprintOverlayToolProps> = ({
  settings,
  onChange,
  onReset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      onChange({
        ...settings,
        imageUrl: result,
        imageName: file.name,
        isVisible: true,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    onChange({
      ...settings,
      imageUrl: null,
      imageName: null,
      isVisible: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4 text-slate-900 w-full max-w-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Site Photo Overlay
            </h3>
            <p className="text-[10px] text-slate-500">Align drone photo or blueprint</p>
          </div>
        </div>
        {settings.imageUrl && (
          <span className="bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-100">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        )}
      </div>

      {/* File Upload Trigger */}
      {!settings.imageUrl ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-5 text-center cursor-pointer transition-all bg-[#F4F5F7]/50 hover:bg-emerald-50/40 group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Upload className="w-6 h-6 text-slate-400 group-hover:text-emerald-600 mx-auto mb-2 transition-colors" />
          <p className="text-xs font-semibold text-slate-700 group-hover:text-slate-900">
            + Add Site Photo
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-mono">
            JPG, PNG, WebP (Drone / Smartphone)
          </p>
        </div>
      ) : (
        /* Image Alignment Controls */
        <div className="space-y-3.5 text-xs">
          {/* File Name & Remove */}
          <div className="flex items-center justify-between bg-[#F4F5F7] p-2.5 px-3 rounded-2xl border border-slate-200/60">
            <div className="truncate max-w-[180px]">
              <span className="font-semibold text-slate-800 text-[11px] block truncate">
                {settings.imageName || 'Site Photo'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Overlay Loaded</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onChange({ ...settings, isVisible: !settings.isVisible })}
                className={`p-1.5 rounded-full text-xs transition cursor-pointer ${
                  settings.isVisible
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-500'
                }`}
                title={settings.isVisible ? 'Hide Overlay' : 'Show Overlay'}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRemove}
                className="p-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                title="Remove Photo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Scale Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <ZoomIn className="w-3 h-3 text-emerald-600" /> Photo Scale
              </span>
              <span className="font-mono text-slate-900 font-bold">{settings.scale.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={3.5}
              step={0.05}
              value={settings.scale}
              onChange={(e) => onChange({ ...settings, scale: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
          </div>

          {/* Rotation Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <RotateCw className="w-3 h-3 text-emerald-600" /> Photo Rotation (0° - 360°)
              </span>
              <span className="font-mono text-slate-900 font-bold">{Math.round(settings.rotation)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={settings.rotation}
              onChange={(e) => onChange({ ...settings, rotation: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
          </div>

          {/* Opacity Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3 text-emerald-600" /> Blend Opacity
              </span>
              <span className="font-mono text-slate-900 font-bold">
                {Math.round(settings.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={settings.opacity}
              onChange={(e) => onChange({ ...settings, opacity: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
          </div>

          {/* Alignment Position Offset (X, Y) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <Move className="w-3 h-3 text-emerald-600" /> Position Offset (X, Y)
              </span>
              <span className="font-mono text-slate-900 text-[10px]">
                {settings.offsetX}px, {settings.offsetY}px
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="range"
                min={-250}
                max={250}
                step={2}
                value={settings.offsetX}
                onChange={(e) => onChange({ ...settings, offsetX: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-700"
                title="Offset X"
              />
              <input
                type="range"
                min={-250}
                max={250}
                step={2}
                value={settings.offsetY}
                onChange={(e) => onChange({ ...settings, offsetY: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-700"
                title="Offset Y"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex gap-2">
            <button
              onClick={onReset}
              className="flex-1 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Reset Sliders
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-sm cursor-pointer"
            >
              Replace Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlueprintOverlayTool;

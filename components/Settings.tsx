import React, { useState, useEffect } from 'react';
import { AppSettings, OperationMode } from '../types';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  currentSettings: AppSettings;
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, onSave, currentSettings }) => {
  const [name, setName] = useState(currentSettings.contact.name);
  const [phone, setPhone] = useState(currentSettings.contact.phone);
  const [mode, setMode] = useState<OperationMode>(currentSettings.operationMode);
  const [screenCurtain, setScreenCurtain] = useState(currentSettings.isScreenCurtainOn);

  useEffect(() => {
    if (isOpen) {
        setName(currentSettings.contact.name);
        setPhone(currentSettings.contact.phone);
        setMode(currentSettings.operationMode);
        setScreenCurtain(currentSettings.isScreenCurtainOn);
    }
  }, [isOpen, currentSettings]);

  const handleSave = () => {
    const newSettings: AppSettings = {
        ...currentSettings,
        contact: { name, phone },
        operationMode: mode,
        isScreenCurtainOn: screenCurtain
    };
    onSave(newSettings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-fade-in text-left">
      <div className="bg-gray-900 border border-gray-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-2"
            aria-label="Close Settings"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h2 className="text-2xl font-bold text-yellow-400 mb-6 high-contrast-text">Configuration</h2>
        
        <div className="space-y-6">
          
          {/* AI Mode Selection */}
          <div className="bg-gray-800/50 p-4 rounded-xl">
             <label className="block text-gray-300 text-sm font-bold mb-3">Assistant Mode</label>
             <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                <button 
                    onClick={() => setMode('explorer')}
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${mode === 'explorer' ? 'bg-yellow-400 text-black' : 'text-gray-400'}`}
                >
                    Explorer
                </button>
                <button 
                    onClick={() => setMode('safety')}
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${mode === 'safety' ? 'bg-red-500 text-white' : 'text-gray-400'}`}
                >
                    Safety Only
                </button>
             </div>
             <p className="text-xs text-gray-500 mt-2">
                {mode === 'explorer' 
                    ? "Detailed descriptions of landmarks, history, and scenery." 
                    : "Minimal output. Only immediate hazards and navigation cues."}
             </p>
          </div>

          {/* Screen Curtain */}
          <div className="flex items-center justify-between bg-gray-800/50 p-4 rounded-xl">
            <div>
                <div className="text-white font-bold">Screen Curtain</div>
                <div className="text-xs text-gray-400">Black out screen for privacy & battery</div>
            </div>
            <button 
                onClick={() => setScreenCurtain(!screenCurtain)}
                className={`w-14 h-8 rounded-full relative transition-colors ${screenCurtain ? 'bg-green-500' : 'bg-gray-600'}`}
            >
                <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${screenCurtain ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          {/* Emergency Contact */}
          <div className="pt-4 border-t border-gray-800">
            <h3 className="text-gray-300 text-sm font-bold mb-3">SOS Contact</h3>
            <div className="space-y-3">
                <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                className="w-full bg-black/50 border border-gray-600 rounded-xl p-3 text-white text-base focus:border-yellow-400 outline-none"
                placeholder="Contact Name"
                />
                <input 
                type="tel" 
                value={phone} 
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-black/50 border border-gray-600 rounded-xl p-3 text-white text-base focus:border-yellow-400 outline-none"
                placeholder="Phone Number"
                />
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button 
            onClick={handleSave} 
            className="w-full py-4 bg-yellow-400 text-black rounded-xl font-bold text-xl hover:bg-yellow-300 active:scale-95 transition-all shadow-lg"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};
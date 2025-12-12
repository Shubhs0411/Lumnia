import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useGeolocation } from './hooks/useGeolocation';
import { ConnectionStatus, AppSettings } from './types';
import Visualizer from './components/Visualizer';
import { triggerHapticFeedback } from './utils/haptics';
import { Settings } from './components/Settings';

const DEFAULT_SETTINGS: AppSettings = {
    contact: { name: '', phone: '' },
    isFlashlightOn: false,
    isScreenCurtainOn: false,
    operationMode: 'explorer'
};

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const location = useGeolocation();
  
  // Settings State
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('lumina_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const { 
    connect, 
    disconnect, 
    status, 
    volume, 
    errorMsg, 
    isSOSMode, 
    performDeepAnalysis, 
    triggerSOS,
    resumeAudio,
    isThinking
  } = useGeminiLive(videoRef, location, settings.operationMode);
  
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  // Gesture State
  const pointerDownTimeRef = useRef<number>(0);
  const pointerDownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  // Wake Lock Ref
  const wakeLockRef = useRef<any>(null);

  // Initialize data
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } catch (e) { setHasApiKey(false); }
      } else { setHasApiKey(true); }
    };
    checkKey();
  }, []);

  // Wake Lock Implementation
  useEffect(() => {
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator && status === ConnectionStatus.CONNECTED) {
            try {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                console.log("Wake Lock active");
            } catch (err) {
                console.error("Wake Lock failed:", err);
            }
        }
    };

    if (status === ConnectionStatus.CONNECTED) {
        requestWakeLock();
    } else {
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }
    }

    return () => {
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
        }
    };
  }, [status]);

  // Save Settings
  const updateSettings = (newSettings: AppSettings) => {
      setSettings(newSettings);
      localStorage.setItem('lumina_settings', JSON.stringify(newSettings));
  };

  // Auto-Start Logic
  useEffect(() => {
    if (hasApiKey && status === ConnectionStatus.DISCONNECTED) {
      connect();
    }
  }, [hasApiKey, status, connect]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        const keySelected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(keySelected);
      } catch (e) { setHasApiKey(false); }
    }
  };

  // Camera & Torch Logic
  useEffect(() => {
    if (!hasApiKey) return;

    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
              facingMode: 'environment', 
              width: { ideal: 1280 }, 
              height: { ideal: 720 },
              advanced: [{ torch: settings.isFlashlightOn } as any] 
          }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        const track = mediaStream.getVideoTracks()[0];
        if (track && settings.isFlashlightOn) {
            track.applyConstraints({
                advanced: [{ torch: true }]
            } as any).catch(e => console.warn("Torch failed", e));
        }

      } catch (err) {
          console.error("Camera start failed", err);
      }
    };

    if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) {
            track.applyConstraints({
                advanced: [{ torch: settings.isFlashlightOn }]
            } as any).catch(e => console.log("Torch toggle failed", e));
        }
    } else {
        startCamera();
    }
    
  }, [hasApiKey, settings.isFlashlightOn]);

  // Clean up stream on unmount
  useEffect(() => {
      return () => {
          if (stream) stream.getTracks().forEach(t => t.stop());
      };
  }, []);


  // --- GESTURE LOGIC ---
  const handlePointerDown = () => {
    resumeAudio();
    pointerDownTimeRef.current = Date.now();
    pointerDownTimerRef.current = setTimeout(() => {
        triggerSOS();
    }, 1500);
  };

  const handlePointerUp = () => {
    if (pointerDownTimerRef.current) {
        clearTimeout(pointerDownTimerRef.current);
        pointerDownTimerRef.current = null;
    }

    const now = Date.now();
    const duration = now - pointerDownTimeRef.current;

    if (duration < 300) {
        if (now - lastTapTimeRef.current < 300) {
            // Double Tap -> Deep Analysis (Thinking)
            if (status === ConnectionStatus.CONNECTED) {
                performDeepAnalysis();
            }
            lastTapTimeRef.current = 0; 
        } else {
            lastTapTimeRef.current = now;
        }
    }
  };

  return (
    <div 
      className="relative h-screen w-screen bg-black overflow-hidden flex flex-col font-sans select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      role="application"
      aria-label="Lumina Accessibility App"
    >
      {/* Background Camera */}
      {hasApiKey && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            isSOSMode ? 'opacity-30 grayscale' : 'opacity-60'
          }`}
          aria-hidden="true"
        />
      )}
      
      {/* Screen Curtain Layer */}
      {settings.isScreenCurtainOn && !isSOSMode && (
          <div className="absolute inset-0 z-40 bg-black cursor-pointer" aria-label="Screen Curtain Active">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-800 text-sm font-bold opacity-20 pointer-events-none select-none">
                  CURTAIN MODE
              </div>
          </div>
      )}
      
      {/* SOS Alert Overlay */}
      {isSOSMode && (
        <div className="absolute inset-0 z-0 bg-red-900/60 animate-urgent pointer-events-none" />
      )}
      
      {!settings.isScreenCurtainOn && (
         <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none" />
      )}

      {/* Header */}
      <header className={`relative z-50 p-6 flex justify-between items-start pointer-events-none safe-area-top ${settings.isScreenCurtainOn && !isSOSMode ? 'opacity-0' : 'opacity-100'}`}>
        <div>
          <h1 className="text-5xl font-extrabold text-yellow-400 tracking-tighter high-contrast-text drop-shadow-lg">
            Lumina
          </h1>
          <p className="text-white text-xs font-bold tracking-wide uppercase opacity-80 high-contrast-text mt-1 flex items-center gap-2">
             <span>Powered by Gemini 3</span>
          </p>
          <p className="text-white text-sm font-bold tracking-wide uppercase opacity-90 high-contrast-text mt-2 flex items-center gap-2">
            {isSOSMode ? "⚠️ EMERGENCY ACTIVE" : settings.operationMode === 'safety' ? "🛡️ Safety Mode" : "🌍 Explorer Mode"}
          </p>
        </div>
        
        {/* Controls Container */}
        <div className="flex flex-col gap-3 items-end pointer-events-auto">
            {/* Settings Button */}
             <button 
                onClick={() => setIsSettingsOpen(true)}
                className="bg-gray-800/80 p-3 rounded-full text-white backdrop-blur-md border border-gray-600 active:scale-95 transition-transform"
                aria-label="Open Settings"
             >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </button>

            {/* Flashlight Toggle */}
            <button
                onClick={() => updateSettings({...settings, isFlashlightOn: !settings.isFlashlightOn})}
                className={`p-3 rounded-full text-white backdrop-blur-md border active:scale-95 transition-transform ${settings.isFlashlightOn ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-gray-800/80 border-gray-600'}`}
                aria-label="Toggle Flashlight"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </button>

            {/* GPS Status */}
             {location && !location.error ? (
                <div className="text-xs font-mono text-yellow-400 bg-black/60 p-2 rounded-lg border border-yellow-400/30 backdrop-blur-md shadow-lg">
                    <div className="font-bold flex items-center justify-end gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> 
                        GPS
                    </div>
                    <div className="text-white/90 text-[10px] mt-1 tracking-wider text-right">
                        {location.heading ? `${Math.round(location.heading)}°` : '--'} | {location.speed ? `${location.speed.toFixed(1)}m/s` : '0'}
                    </div>
                </div>
            ) : null}
        </div>
      </header>

      {/* Main Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center p-6 text-center pointer-events-none">
        {isSOSMode ? (
            <div className="pointer-events-auto flex flex-col items-center animate-fade-in w-full max-w-sm z-50">
                <div className="text-white font-black text-3xl mb-4 bg-red-600 px-6 py-2 rounded-lg shadow-xl uppercase tracking-widest border-2 border-white">
                    HELP
                </div>
                {/* DYNAMIC CONTACT */}
                <a 
                    href={`tel:${settings.contact.phone || '911'}`}
                    className="w-full bg-white text-red-700 font-extrabold text-2xl py-6 rounded-2xl shadow-2xl mb-4 flex items-center justify-center gap-3 active:scale-95 transition-transform"
                >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    CALL {settings.contact.name || '911'}
                </a>
                
                <button 
                    onClick={() => window.location.reload()}
                    className="text-white underline text-sm opacity-80 pointer-events-auto"
                >
                    Cancel SOS
                </button>
            </div>
        ) : (
            <>
                {!hasApiKey ? (
                    <div className="bg-gray-900/90 p-8 rounded-2xl border border-gray-700 max-w-sm backdrop-blur-md shadow-2xl pointer-events-auto z-50">
                        <h2 className="text-2xl font-bold text-white mb-2 high-contrast-text">Setup Required</h2>
                        <button onClick={handleSelectKey} className="w-full py-6 bg-yellow-400 text-black rounded-xl font-bold text-2xl shadow-xl">Select API Key</button>
                    </div>
                ) : (
                    <div className={`space-y-4 transition-opacity duration-300 ${settings.isScreenCurtainOn ? 'opacity-0' : 'opacity-100'}`}>
                         {/* Status Indicator */}
                         {isThinking && (
                             <div className="animate-pulse bg-blue-600/90 text-white font-bold px-6 py-3 rounded-full text-lg shadow-xl backdrop-blur-sm border border-blue-400">
                                 🧠 Deep Analysis in Progress...
                             </div>
                         )}

                        {status === ConnectionStatus.CONNECTED && !isThinking && (
                             <div className="text-white/80 text-sm font-medium bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">
                                Double-tap for Deep Analysis • Hold for SOS
                             </div>
                        )}
                        {status === ConnectionStatus.ERROR && (
                             <div className="bg-red-900/90 p-6 rounded-xl border border-red-500 text-white pointer-events-auto z-50">
                                <p className="font-bold text-lg mb-4">{errorMsg || "Connection Error"}</p>
                                <button onClick={() => window.location.reload()} className="w-full bg-red-700 hover:bg-red-600 px-6 py-4 rounded-xl font-bold text-lg shadow-lg">Tap to Retry</button>
                             </div>
                        )}
                         {status === ConnectionStatus.CONNECTING && (
                             <div className="flex flex-col items-center gap-2">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-yellow-400"></div>
                                <div className="text-yellow-400 font-bold text-xl animate-pulse">
                                    Connecting...
                                </div>
                             </div>
                         )}
                    </div>
                )}
            </>
        )}
      </main>

      {/* Footer Controls */}
      <footer className={`relative z-10 p-6 pb-10 safe-area-bottom w-full max-w-md mx-auto pointer-events-auto transition-opacity duration-300 ${settings.isScreenCurtainOn && !isSOSMode ? 'opacity-0' : 'opacity-100'}`}>
        <div className="mb-6 h-16 flex items-center justify-center">
             {hasApiKey && status === ConnectionStatus.CONNECTED && (
                 <Visualizer volume={volume} isActive={true} />
             )}
        </div>
      </footer>

      {/* Settings Modal */}
      <Settings 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        currentSettings={settings}
        onSave={updateSettings}
      />

    </div>
  );
};

export default App;
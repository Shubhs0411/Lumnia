import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Tool } from '@google/genai';
import { ConnectionStatus, OperationMode } from '../types';
import { float32ToPCM16Blob, base64ToFloat32Array, PCM_SAMPLE_RATE_INPUT, PCM_SAMPLE_RATE_OUTPUT, blobToBase64 } from '../utils/audioUtils';
import { LocationData } from './useGeolocation';
import { triggerHapticFeedback, HapticType } from '../utils/haptics';
import { playSound } from '../utils/soundEffects';

// Optimization for real-time feel
// 5fps is a good balance for real-time understanding without overwhelming bandwidth
const VIDEO_FRAME_RATE = 5; 
const MAX_VIDEO_WIDTH = 360; 
const JPEG_QUALITY = 0.4;

const hapticToolDeclaration: FunctionDeclaration = {
  name: 'triggerHaptic',
  description: 'Trigger a haptic vibration pattern on the users device to reinforce spoken alerts.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: {
        type: Type.STRING,
        description: 'The type of alert to trigger.',
        enum: ['navigation', 'danger']
      }
    },
    required: ['type']
  }
};

const sosToolDeclaration: FunctionDeclaration = {
  name: 'triggerSOS',
  description: 'Trigger the emergency SOS mode on the device. Call this immediately if the user says HELP multiple times or indicates an emergency.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  }
};

export const useGeminiLive = (
    videoRef: React.RefObject<HTMLVideoElement>, 
    location: LocationData | null,
    mode: OperationMode
) => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [volume, setVolume] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSOSMode, setIsSOSMode] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  
  // Stream References
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Video Interval
  const videoIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Gemini Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const activeSessionRef = useRef<boolean>(false);
  const currentModeRef = useRef<OperationMode>(mode);
  
  // Audio Playback
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    canvasRef.current = document.createElement('canvas');
  }, []);

  // Update mode ref and notify model if connected
  useEffect(() => {
    if (activeSessionRef.current && sessionPromiseRef.current && mode !== currentModeRef.current) {
        currentModeRef.current = mode;
        sessionPromiseRef.current.then(session => {
             session.sendRealtimeInput({
                content: {
                    role: "user",
                    parts: [{ text: `SYSTEM_UPDATE: Mode changed to: ${mode.toUpperCase()}. Adjust output accordingly.` }]
                }
            });
        }).catch(() => {});
    }
    currentModeRef.current = mode;
  }, [mode]);

  // Send Location Update to Model when it changes
  useEffect(() => {
    if (activeSessionRef.current && sessionPromiseRef.current && location) {
      sessionPromiseRef.current.then(session => {
        const headingStr = location.heading !== null ? `${Math.round(location.heading)}°` : "Unknown";
        const speedStr = location.speed !== null ? `${location.speed.toFixed(1)}m/s` : "0m/s";
        
        // Pass location context for Maps Grounding
        session.sendRealtimeInput({
            content: {
                role: "user",
                parts: [{ text: `GPS UPDATE: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}. Heading: ${headingStr}. Speed: ${speedStr}.` }]
            }
        });
      }).catch(() => {});
    }
  }, [location?.latitude, location?.longitude, location?.heading]);

  const cleanup = useCallback(() => {
    activeSessionRef.current = false;
    
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();

    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
            try { session.close(); } catch (e) { console.error(e); }
        }).catch(() => {});
        sessionPromiseRef.current = null;
    }
  }, []);

  const resumeAudio = useCallback(() => {
    if (inputAudioContextRef.current && inputAudioContextRef.current.state === 'suspended') {
      inputAudioContextRef.current.resume();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'suspended') {
      outputAudioContextRef.current.resume();
    }
  }, []);

  const triggerSOS = useCallback(() => {
    setIsSOSMode(true);
    triggerHapticFeedback('sos');
    playSound('error'); // Alarm sound
    if (activeSessionRef.current && sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({
                content: {
                    role: "user",
                    parts: [{ text: "EMERGENCY: User has triggered SOS. Describe location and hazards immediately to emergency services." }]
                }
            });
        }).catch(e => console.error("SOS send error", e));
    }
  }, []);

  // New function: Use Gemini 3 Pro for deep video understanding with Thinking
  const performDeepAnalysis = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    playSound('alert'); // Acknowledge request
    setIsThinking(true);

    try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Capture higher resolution for Deep Analysis
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
        if (!blob) throw new Error("Failed to capture image");
        
        const base64 = await blobToBase64(blob);

        // Separate client for REST call to keep Live session clear
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Use gemini-3-pro-preview with high thinking budget for complex analysis
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64 } },
                    { text: "Analyze this image in extreme detail. Identify landmarks, read text, assess safety hazards, and describe the scene structure. Be comprehensive." }
                ]
            },
            config: {
                thinkingConfig: { thinkingBudget: 32768 } // Max thinking budget
            }
        });

        const analysisText = response.text;

        // Feed result back to Live Session so the Voice Assistant can speak it
        if (activeSessionRef.current && sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => {
                session.sendRealtimeInput({
                    content: {
                        role: "user",
                        parts: [{ text: `SYSTEM_INJECTED_ANALYSIS (from Gemini 3 Pro): ${analysisText}. \n\n Summarize this detailed analysis for the blind user now.` }]
                    }
                });
            });
        }
    } catch (e) {
        console.error("Deep analysis failed", e);
        playSound('error');
    } finally {
        setIsThinking(false);
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) return;
      
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMsg(null);
      activeSessionRef.current = true;
      setIsSOSMode(false);

      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE_INPUT });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE_OUTPUT });
      nextStartTimeRef.current = outputAudioContextRef.current.currentTime;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const locationContext = location 
        ? `GPS: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` 
        : "GPS: Unknown";

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          tools: [
            { functionDeclarations: [hapticToolDeclaration, sosToolDeclaration] },
            { googleSearch: {} },
            { googleMaps: {} } // Enable Maps Grounding
          ],
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are Lumina, an advanced mobile app for blind users.
          GPS: ${locationContext}
          MODE: ${mode.toUpperCase()}

          MISSION:
          Your goal is to be an all-in-one visual assistant, travel guide, and safety tool.

          CORE CAPABILITIES:
          1. **Real-time Vision**: Constantly scan video. In 'Safety' mode, focus on hazards. In 'Explorer' mode, describe the world vividly.
          2. **Context-Aware Guidance**: Use the user's heading and GPS. E.g., "The crosswalk is at your 11 o'clock."
          3. **Travel Guide**: If you recognize a landmark (like the Washington Monument) or the user asks, use **Google Search** or **Google Maps** to provide detailed historical facts and enrichment.
          4. **Instant Search**: If the user has a question you cannot answer from vision alone, search online immediately.
          5. **SOS Protocol**: If you hear the user say "Help" multiple times or scream, **trigger the SOS tool immediately**.

          OUTPUT STYLE:
          - Concise, clear, and warm. 
          - Speak in fragments during movement to keep up with the user.
          - Provide Haptic feedback for turns (Navigation) or hazards (Danger).`
        },
      };

      sessionPromiseRef.current = ai.live.connect({
        ...config,
        callbacks: {
          onopen: async () => {
            console.log('Gemini Live Connection Opened');
            setStatus(ConnectionStatus.CONNECTED);
            playSound('connect');
            
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaStreamRef.current = stream;
              const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
              sourceNodeRef.current = source;
              
              const processor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = processor;
              
              processor.onaudioprocess = (e) => {
                if (!activeSessionRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                setVolume(Math.sqrt(sum / inputData.length));

                const pcmBlob = float32ToPCM16Blob(inputData);
                
                sessionPromiseRef.current?.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              
              source.connect(processor);
              processor.connect(inputAudioContextRef.current!.destination);

              startVideoStreaming();

            } catch (err) {
              console.error('Error accessing microphone:', err);
              setErrorMsg("Microphone access denied.");
              playSound('error');
              cleanup();
              setStatus(ConnectionStatus.ERROR);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!activeSessionRef.current) return;

            if (message.toolCall) {
                const responses = message.toolCall.functionCalls.map(fc => {
                    if (fc.name === 'triggerHaptic') {
                        const type = (fc.args as any).type as HapticType;
                        triggerHapticFeedback(type);
                        return {
                            id: fc.id,
                            name: fc.name,
                            response: { result: 'success' }
                        };
                    } else if (fc.name === 'triggerSOS') {
                        triggerSOS();
                        return {
                            id: fc.id,
                            name: fc.name,
                            response: { result: 'SOS_TRIGGERED' }
                        };
                    }
                    return { id: fc.id, name: fc.name, response: { result: 'unknown' } };
                });
                sessionPromiseRef.current?.then(session => {
                    session.sendToolResponse({ functionResponses: responses });
                });
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              try {
                const float32Data = base64ToFloat32Array(audioData);
                const buffer = outputAudioContextRef.current.createBuffer(1, float32Data.length, PCM_SAMPLE_RATE_OUTPUT);
                buffer.getChannelData(0).set(float32Data);
                
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(outputAudioContextRef.current.destination);
                
                const currentTime = outputAudioContextRef.current.currentTime;
                if (nextStartTimeRef.current < currentTime) {
                  nextStartTimeRef.current = currentTime;
                }
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                
                audioSourcesRef.current.add(source);
                source.onended = () => {
                  audioSourcesRef.current.delete(source);
                };

              } catch (decodeErr) {
                console.error("Audio decoding error", decodeErr);
              }
            }

            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(src => src.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            if (activeSessionRef.current) {
                setStatus(ConnectionStatus.DISCONNECTED);
                playSound('disconnect');
                cleanup();
            }
          },
          onerror: (err) => {
            setErrorMsg("Connection error.");
            setStatus(ConnectionStatus.ERROR);
            playSound('error');
            cleanup();
          }
        }
      });

    } catch (e) {
      setStatus(ConnectionStatus.ERROR);
      setErrorMsg("Failed to initialize.");
      playSound('error');
      cleanup();
    }
  }, [status, cleanup, location, mode, triggerSOS]);

  const startVideoStreaming = () => {
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    
    videoIntervalRef.current = window.setInterval(() => {
        if (!activeSessionRef.current || !videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
            // Optimize Resolution: Max width 360px for speed
            const scale = Math.min(1, MAX_VIDEO_WIDTH / video.videoWidth);
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(async (blob) => {
                if (blob) {
                    const base64 = await blobToBase64(blob);
                    // Double check session is still active before sending
                    if (activeSessionRef.current) {
                        sessionPromiseRef.current?.then(session => {
                            session.sendRealtimeInput({
                                media: { mimeType: 'image/jpeg', data: base64 }
                            });
                        }).catch(e => console.error("Video send error", e));
                    }
                }
            }, 'image/jpeg', JPEG_QUALITY);
        }

    }, 1000 / VIDEO_FRAME_RATE);
  };

  const disconnect = useCallback(() => {
    cleanup();
    setStatus(ConnectionStatus.DISCONNECTED);
  }, [cleanup]);

  return { connect, disconnect, status, volume, errorMsg, isSOSMode, performDeepAnalysis, triggerSOS, resumeAudio, isThinking };
};
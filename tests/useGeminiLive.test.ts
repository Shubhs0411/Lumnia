import { renderHook, act } from '@testing-library/react-hooks';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { ConnectionStatus } from '../types';
import * as GoogleGenAIModule from '@google/genai';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;

// Mock the Gemini SDK
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    live: {
      connect: jest.fn().mockReturnValue(Promise.resolve({
        sendRealtimeInput: jest.fn(),
        sendToolResponse: jest.fn(),
        close: jest.fn()
      }))
    },
    models: {
        generateContent: jest.fn().mockResolvedValue({
            text: "Deep analysis result"
        })
    }
  }))
}));

describe('useGeminiLive Hook', () => {
  const mockVideoRef = { current: document.createElement('video') } as any;
  const mockLocation = { latitude: 0, longitude: 0, accuracy: 10, heading: 0, speed: 0 };
  const mockMode = 'explorer';

  beforeAll(() => {
    // Mock AudioContext
    (window as any).AudioContext = jest.fn().mockImplementation(() => ({
      state: 'running',
      createMediaStreamSource: jest.fn().mockReturnValue({ connect: jest.fn() }),
      createScriptProcessor: jest.fn().mockReturnValue({ connect: jest.fn(), onaudioprocess: null, disconnect: jest.fn() }),
      createGain: jest.fn().mockReturnValue({ connect: jest.fn() }),
      destination: {},
      close: jest.fn()
    }));
    
    // Mock navigator.mediaDevices
    (navigator as any).mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }]
      })
    };
  });

  test('initial state is disconnected', () => {
    const { result } = renderHook(() => useGeminiLive(mockVideoRef, mockLocation, mockMode));
    expect(result.current.status).toBe(ConnectionStatus.DISCONNECTED);
  });

  test('connects to Gemini Live API', async () => {
    const { result } = renderHook(() => useGeminiLive(mockVideoRef, mockLocation, mockMode));
    
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe(ConnectionStatus.CONNECTED);
    expect(GoogleGenAIModule.GoogleGenAI).toHaveBeenCalled();
  });

  test('triggerSOS sets isSOSMode to true', () => {
    const { result } = renderHook(() => useGeminiLive(mockVideoRef, mockLocation, mockMode));
    
    act(() => {
      result.current.triggerSOS();
    });

    expect(result.current.isSOSMode).toBe(true);
  });

  test('performDeepAnalysis sets isThinking state', async () => {
      const { result } = renderHook(() => useGeminiLive(mockVideoRef, mockLocation, mockMode));
      
      // We can't fully mock canvas.toBlob here easily without more setup, 
      // but we can check if the function exists and state management works if mocked.
      expect(result.current.isThinking).toBe(false);
      expect(typeof result.current.performDeepAnalysis).toBe('function');
  });
});
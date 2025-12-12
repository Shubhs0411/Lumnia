import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';
import * as useGeminiLive from '../hooks/useGeminiLive';
import { ConnectionStatus } from '../types';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

// Mock dependencies
jest.mock('../hooks/useGeminiLive');
jest.mock('../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    latitude: 37.7749,
    longitude: -122.4194,
    heading: 90,
    speed: 1.5,
    error: null
  })
}));
jest.mock('../utils/haptics', () => ({
  triggerHapticFeedback: jest.fn()
}));

describe('Lumina App', () => {
  const mockConnect = jest.fn();
  const mockTriggerSOS = jest.fn();
  const mockPerformDeepAnalysis = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Fix: cast to any as jest is not a namespace
    (useGeminiLive.useGeminiLive as any).mockReturnValue({
      connect: mockConnect,
      disconnect: jest.fn(),
      status: ConnectionStatus.CONNECTED,
      volume: 0.5,
      isSOSMode: false,
      performDeepAnalysis: mockPerformDeepAnalysis,
      triggerSOS: mockTriggerSOS,
      resumeAudio: jest.fn(),
      isThinking: false,
      errorMsg: null
    });

    // Mock window.aistudio
    (window as any).aistudio = {
      hasSelectedApiKey: jest.fn().mockResolvedValue(true),
      openSelectKey: jest.fn()
    };
  });

  test('renders Lumina header and branding', async () => {
    await act(async () => { render(<App />); });
    expect(screen.getByText('Lumina')).toBeInTheDocument();
    expect(screen.getByText(/Powered by Gemini 3/i)).toBeInTheDocument();
  });

  test('enters SOS mode when SOS state triggers', async () => {
    // Fix: cast to any as jest is not a namespace
    (useGeminiLive.useGeminiLive as any).mockReturnValue({
      status: ConnectionStatus.CONNECTED,
      isSOSMode: true,
      triggerSOS: mockTriggerSOS,
      performDeepAnalysis: mockPerformDeepAnalysis,
      connect: mockConnect,
      disconnect: jest.fn(),
      volume: 0,
      resumeAudio: jest.fn(),
      isThinking: false,
      errorMsg: null
    });
    
    await act(async () => { render(<App />); });
    expect(screen.getByText('HELP')).toBeInTheDocument();
    expect(screen.getByText(/CALL 911/i)).toBeInTheDocument();
  });

  test('triggers deep analysis on double tap', async () => {
    await act(async () => { render(<App />); });
    
    const appContainer = screen.getByRole('application');
    
    // Simulate double tap
    fireEvent.pointerDown(appContainer);
    fireEvent.pointerUp(appContainer);
    fireEvent.pointerDown(appContainer);
    fireEvent.pointerUp(appContainer);

    expect(mockPerformDeepAnalysis).toHaveBeenCalled();
  });

  test('triggers SOS on long press', async () => {
    jest.useFakeTimers();
    await act(async () => { render(<App />); });
    
    const appContainer = screen.getByRole('application');
    
    fireEvent.pointerDown(appContainer);
    act(() => {
      jest.advanceTimersByTime(2000); // Wait > 1500ms
    });
    
    expect(mockTriggerSOS).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
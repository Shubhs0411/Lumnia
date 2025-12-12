import React from 'react';
import { ConnectionStatus } from '../types';

interface ControlsProps {
  status: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

const Controls: React.FC<ControlsProps> = ({ status, onConnect, onDisconnect }) => {
  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;

  if (isConnected) {
    return (
      <button
        onClick={onDisconnect}
        className="w-full py-8 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-3xl rounded-3xl shadow-lg border-4 border-red-400 transition-transform transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-yellow-400"
        aria-label="Stop SightScribe Assistant"
      >
        STOP
      </button>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={isConnecting}
      className={`w-full py-8 text-black font-bold text-3xl rounded-3xl shadow-lg border-4 transition-transform transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-white ${
        isConnecting
          ? 'bg-gray-500 border-gray-400 cursor-not-allowed text-gray-300'
          : 'bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 border-yellow-200'
      }`}
      aria-label={isConnecting ? "Connecting..." : "Start SightScribe Assistant"}
    >
      {isConnecting ? "CONNECTING..." : "START ASSISTANT"}
    </button>
  );
};

export default Controls;
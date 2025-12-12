import React from 'react';

interface VisualizerProps {
  volume: number;
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive }) => {
  // Volume is roughly 0.0 to 1.0 (sometimes higher)
  // We want to map it to a visual scale
  const bars = 5;
  
  return (
    <div className="flex items-center justify-center space-x-2 h-16 w-full" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        // Calculate height based on volume and index
        // Center bars are taller
        const baseHeight = 20;
        const scale = isActive ? Math.min(volume * 10 * (1 + i % 2), 3) : 0.2;
        const height = Math.max(10, Math.min(60, baseHeight * scale + (Math.random() * 10 * scale)));
        
        return (
          <div
            key={i}
            className={`w-4 rounded-full transition-all duration-75 ${
              isActive ? 'bg-yellow-400' : 'bg-gray-700'
            }`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
};

export default Visualizer;
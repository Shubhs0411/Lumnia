import { useState, useEffect } from 'react';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  error?: string;
}

export const useGeolocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ 
        latitude: 0, 
        longitude: 0, 
        accuracy: 0, 
        heading: null, 
        speed: null, 
        error: "Geolocation not supported" 
      });
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading, // Direction in degrees (0 = North, 90 = East)
        speed: position.coords.speed,     // Speed in m/s
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      setLocation(prev => ({ 
        ...(prev || { latitude: 0, longitude: 0, accuracy: 0, heading: null, speed: null }), 
        error: error.message 
      }));
    };

    const watcher = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  return location;
};
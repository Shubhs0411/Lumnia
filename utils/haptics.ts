export const HapticPatterns = {
  // Distinct double tap for navigation cues (e.g., turn left)
  NAVIGATION: [80, 50, 80], 
  // Urgent, long pulses for safety warnings
  DANGER: [400, 100, 400, 100, 400], 
  // Standard SOS Morse code rhythm (... --- ...)
  SOS: [
    200, 100, 200, 100, 200, 300, // S
    600, 200, 600, 200, 600, 300, // O
    200, 100, 200, 100, 200       // S
  ],
  // Short tick for confirmation
  SUCCESS: [50],
};

export type HapticType = 'navigation' | 'danger' | 'success' | 'sos';

export const triggerHapticFeedback = (type: HapticType) => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  switch (type) {
    case 'navigation':
      navigator.vibrate(HapticPatterns.NAVIGATION);
      break;
    case 'danger':
      navigator.vibrate(HapticPatterns.DANGER);
      break;
    case 'sos':
      navigator.vibrate(HapticPatterns.SOS);
      break;
    case 'success':
      navigator.vibrate(HapticPatterns.SUCCESS);
      break;
  }
};
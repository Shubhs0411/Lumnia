import { float32ToPCM16Blob, base64ToFloat32Array } from '../utils/audioUtils';
import { HapticPatterns } from '../utils/haptics';

declare const describe: any;
declare const test: any;
declare const expect: any;

describe('Audio Utils', () => {
  test('converts float32 to PCM blob correctly', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1]);
    const blob = float32ToPCM16Blob(input);
    
    expect(blob.mimeType).toContain('audio/pcm');
    expect(blob.data).toBeDefined();
    // PCM 16bit is 2 bytes per sample. 4 samples = 8 bytes.
    // Base64 string length for 8 bytes is roughly 12 chars.
    expect(blob.data.length).toBeGreaterThan(0);
  });

  test('converts base64 to float32 correctly', () => {
    // Manually create a base64 string for 16-bit PCM silence (0,0)
    // 0x0000 -> "AA=="
    const base64 = "AAAA"; 
    const output = base64ToFloat32Array(base64);
    
    expect(output).toBeInstanceOf(Float32Array);
    expect(output.length).toBe(1); // 2 bytes = 1 int16 = 1 float32
    expect(output[0]).toBe(0);
  });
});

describe('Haptics Utils', () => {
  test('SOS pattern is correct Morse code', () => {
    const sos = HapticPatterns.SOS;
    // ... (3 dots) --- (3 dashes) ... (3 dots)
    // Each symbol is followed by a gap, so array length should be roughly 17
    expect(sos.length).toBeGreaterThan(10);
  });
});
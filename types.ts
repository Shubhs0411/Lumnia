
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export interface AudioVisualizerData {
  volume: number;
}

export interface EmergencyContact {
  name: string;
  phone: string;
}

export type OperationMode = 'explorer' | 'safety';

export interface AppSettings {
  contact: EmergencyContact;
  isFlashlightOn: boolean;
  isScreenCurtainOn: boolean;
  operationMode: OperationMode;
}

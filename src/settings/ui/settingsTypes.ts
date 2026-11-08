export type Density = 'compact' | 'comfortable';
export type PerformanceMode = 'efficiency' | 'standard' | 'performance';
export type SamplingQuality = 'low' | 'standard' | 'high';

export interface UISettings {
  theme: 'dark';
  accentColor: string;
  palette: string[];
  density: Density;
  fontScale: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
}

export interface PerformanceSettings {
  mode: PerformanceMode;
}

export interface ConstantsSettings {
  showBuiltIns: boolean;
}

export interface UnitsSettings {
  system: 'si';
}

export interface EquationsSettings {
  reserved: boolean;
}

export interface GraphingSettings {
  showGrid: boolean;
  showAxes: boolean;
  resetViewportOnOpen: boolean;
  lineThickness: number;
  samplingQuality: SamplingQuality;
  preserveExpressionOrder: boolean;
  fullscreenOnOpen: boolean;
  expressionOutlineColor: string;
}

export interface AppSettings {
  version: 1;
  ui: UISettings;
  performance: PerformanceSettings;
  constants: ConstantsSettings;
  units: UnitsSettings;
  equations: EquationsSettings;
  graphing: GraphingSettings;
}

export type SettingsCategory = Exclude<keyof AppSettings, 'version'>;
export type SettingsListener = (settings: AppSettings) => void;

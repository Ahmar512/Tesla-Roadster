export type QualityMode = 'auto' | 'high' | 'low';

export interface SettingsData {
  /** 0..1; stored now, used once audio arrives in Phase 5. */
  music: number;
  sfx: number;
  vibration: boolean;
  quality: QualityMode;
  /** Play the swipe tutorial at the start of the next run. Switches itself off once finished. */
  tutorial: boolean;
}

const KEY = 'roadster-rush.settings';

const DEFAULTS: SettingsData = { music: 0.8, sfx: 1, vibration: true, quality: 'auto', tutorial: true };

/** Player preferences, saved on the device. */
export class Settings {
  readonly data: SettingsData;
  /** Fires after any change, with the key that changed. */
  onChange?: (key: keyof SettingsData) => void;

  constructor() {
    let saved: Partial<SettingsData> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      // Missing or corrupt: fall back to defaults.
    }
    this.data = { ...DEFAULTS, ...saved };
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    if (this.data[key] === value) return;
    this.data[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage unavailable (private mode); settings just won't persist.
    }
    this.onChange?.(key);
  }

  vibrate(ms: number) {
    if (this.data.vibration) navigator.vibrate?.(ms);
  }
}

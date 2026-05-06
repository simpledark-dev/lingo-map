export const SETTINGS_STORAGE_KEY = "lingo-settings:v1";

export interface GameSettings {
  musicEnabled: boolean;
  virtualDPadEnabled: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  musicEnabled: true,
  virtualDPadEnabled: false,
};

function normalizeSettings(value: unknown): GameSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const parsed = value as Partial<GameSettings>;
  return {
    musicEnabled:
      typeof parsed.musicEnabled === "boolean"
        ? parsed.musicEnabled
        : DEFAULT_SETTINGS.musicEnabled,
    virtualDPadEnabled:
      typeof parsed.virtualDPadEnabled === "boolean"
        ? parsed.virtualDPadEnabled
        : DEFAULT_SETTINGS.virtualDPadEnabled,
  };
}

export function loadGameSettings(): GameSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveGameSettings(next: Partial<GameSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadGameSettings();
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...current,
        ...next,
      }),
    );
  } catch {
    // Private mode / quota failures should not interrupt gameplay.
  }
}

export function getMusicEnabled(): boolean {
  return loadGameSettings().musicEnabled;
}

export function setMusicEnabled(enabled: boolean): void {
  saveGameSettings({ musicEnabled: enabled });
}

export function getVirtualDPadEnabled(): boolean {
  return loadGameSettings().virtualDPadEnabled;
}

export function setVirtualDPadEnabled(enabled: boolean): void {
  saveGameSettings({ virtualDPadEnabled: enabled });
}

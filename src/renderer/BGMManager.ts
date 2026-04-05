/**
 * Simple background music manager.
 * Renderer-only — plays/pauses based on map ID.
 */
export class BGMManager {
  private audio: HTMLAudioElement | null = null;
  private shouldPlay = false;
  private enabled = true;
  private unlocked = false;
  private readonly unlockAudio = () => {
    this.unlocked = true;
    this.syncPlayback();
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
  };

  constructor(enabled = true) {
    this.enabled = enabled;
    if (typeof Audio === 'undefined') return;
    this.audio = new Audio('/assets/audio/background-track.mp3');
    this.audio.loop = true;
    this.audio.volume = 0.25;
    this.audio.preload = 'auto';

    // Unlock audio on first user interaction
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);
  }

  /** Call on scene change. Only plays on outdoor map. */
  onSceneChange(mapId: string): void {
    this.shouldPlay = mapId === 'outdoor';
    this.syncPlayback();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.syncPlayback();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private syncPlayback(): void {
    if (this.enabled && this.shouldPlay && this.unlocked) {
      this.play();
      return;
    }

    this.pause();
  }

  private play(): void {
    if (!this.audio || !this.audio.paused) return;
    this.audio.play().catch(() => {});
  }

  private pause(): void {
    if (!this.audio || this.audio.paused) return;
    this.audio.pause();
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlockAudio);
      window.removeEventListener('keydown', this.unlockAudio);
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}

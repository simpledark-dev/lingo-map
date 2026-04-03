/**
 * Simple background music manager.
 * Renderer-only — plays/pauses based on map ID.
 */
export class BGMManager {
  private audio: HTMLAudioElement | null = null;
  private shouldPlay = false;
  private unlocked = false;

  constructor() {
    if (typeof Audio === 'undefined') return;
    this.audio = new Audio('/assets/audio/background-track.mp3');
    this.audio.loop = true;
    this.audio.volume = 0.25;
    this.audio.preload = 'auto';

    // Unlock audio on first user interaction
    const unlock = () => {
      this.unlocked = true;
      if (this.shouldPlay) this.play();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  /** Call on scene change. Only plays on outdoor map. */
  onSceneChange(mapId: string): void {
    if (mapId === 'outdoor') {
      this.shouldPlay = true;
      if (this.unlocked) this.play();
    } else {
      this.shouldPlay = false;
      this.pause();
    }
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
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}

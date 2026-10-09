let audio: AudioContext | undefined;

/**
 * A short square-wave blip, falling a fifth: a beep in the spirit of the old
 * system alert, synthesised so there is no sound file to ship. Browsers keep
 * audio muted until the page has been clicked or typed in at least once.
 */
export function beep(): void {
  audio ??= new AudioContext();
  void audio.resume();
  const start = audio.currentTime;
  const tone = audio.createOscillator();
  const volume = audio.createGain();

  tone.type = 'square';
  tone.frequency.setValueAtTime(880, start);
  tone.frequency.setValueAtTime(587, start + 0.07);
  volume.gain.setValueAtTime(0.05, start);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

  tone.connect(volume).connect(audio.destination);
  tone.start(start);
  tone.stop(start + 0.2);
}

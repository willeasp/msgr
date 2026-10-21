import {
  createAudio,
  type AudioDevices,
  type Input,
  type Output,
} from '../lib/audio';

/*
 * The browser's side of the page's audio (`lib/audio.ts` holds the rules):
 * Web Audio for the speaker and the beep, MediaRecorder for the microphone, and
 * `navigator.audioSession` for what an iPhone is told. Each method does one
 * thing, and lets go of whatever it opened if it fails partway.
 */

/** Safari 16.4 on. */
type WithSession = Navigator & { audioSession?: { type: string } };

function browserDevices(): AudioDevices {
  let context: AudioContext | null = null;
  const buffers = new WeakMap<Float32Array<ArrayBuffer>, AudioBuffer>();

  /**
   * The speaker, made afresh when the last is closed or stuck: iOS leaves a
   * context "interrupted" once the app has been away, and resuming rarely
   * brings it back. Made in a click, which a new context needs.
   */
  const speaker = () => {
    const state = context?.state as string | undefined;
    if (context && (state === 'closed' || state === 'interrupted')) {
      void context.close().catch(() => undefined);
      context = null;
    }
    context ??= new AudioContext();
    // Phones start a context suspended until something is pressed.
    void context.resume();
    return context;
  };

  const bufferOf = (
    audio: AudioContext,
    samples: Float32Array<ArrayBuffer>,
    rate: number
  ) => {
    let buffer = buffers.get(samples);
    if (buffer) return buffer;
    try {
      buffer = audio.createBuffer(1, Math.max(1, samples.length), rate);
      buffer.copyToChannel(samples, 0);
    } catch {
      // A browser that won't hold so few samples a second gets 6 times as
      // many, each step drawn as a line to the next.
      const times = 6;
      buffer = audio.createBuffer(
        1,
        Math.max(1, samples.length * times),
        rate * times
      );
      const out = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const next = samples[i + 1] ?? 0;
        for (let t = 0; t < times; t++) {
          out[i * times + t] = samples[i] + ((next - samples[i]) * t) / times;
        }
      }
    }
    buffers.set(samples, buffer);
    return buffer;
  };

  return {
    session(type) {
      const { audioSession } = navigator as WithSession;
      if (audioSession) audioSession.type = type;
    },

    play(samples, rate, from, ended): Output {
      const audio = speaker();
      const source = audio.createBufferSource();
      source.buffer = bufferOf(audio, samples, rate);
      source.connect(audio.destination);
      source.onended = ended;
      source.start(0, from);
      const startedAt = audio.currentTime;
      return {
        elapsed: () => audio.currentTime - startedAt,
        stop() {
          source.onended = null;
          try {
            source.stop();
          } catch {
            // Already stopped, with its context.
          }
        },
      };
    },

    // A short square-wave blip, falling a fifth: a beep in the spirit of
    // the old system alert, made here, so there is no sound file to ship.
    // Browsers keep audio muted until the page has been clicked or typed in.
    beep() {
      const audio = speaker();
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
    },

    release() {
      void context?.close().catch(() => undefined);
      context = null;
    },

    async openMicrophone(failed): Promise<Input> {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const letGo = () => stream.getTracks().forEach((track) => track.stop());
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
        recorder.start();
      } catch (error) {
        letGo();
        throw error;
      }
      const chunks: Blob[] = [];
      const recorded = () => new Blob(chunks, { type: recorder.mimeType });
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onerror = (e) => {
        recorder.onstop = null;
        letGo();
        failed((e as Event & { error?: unknown }).error ?? e);
      };
      return {
        finish: () =>
          new Promise<Blob>((resolve) => {
            // Stopped already (iOS stops it when the app goes away): what
            // it heard is all there.
            if (recorder.state === 'inactive') {
              letGo();
              resolve(recorded());
              return;
            }
            recorder.onstop = () => {
              letGo();
              resolve(recorded());
            };
            recorder.stop();
          }),
        discard() {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          recorder.onerror = null;
          if (recorder.state !== 'inactive') recorder.stop();
          letGo();
        },
      };
    },
  };
}

/** The page's one audio: every sound, beep and recording goes through it. */
export const audio = createAudio(browserDevices());

// Out of sight, the sound stops and the speaker is let go.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.away();
  });
}

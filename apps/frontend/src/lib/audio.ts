import { SOUND_RATE, synthesizeSound, type SoundCodes } from '@msgr/bitmap';

/*
 * The page's audio, all in one place: the speaker, the microphone, the
 * alert beep, and what an iPhone is told about them. It is always exactly one of four things,
 * and only play, stop, record and away change it:
 *
 *   idle ─play→ playing ─(it ends, stop, away)→ idle
 *   idle, playing ─record→ asking ─(granted)→ recording ─(finish, cancel, fails)→ idle
 *                            └─(refused, cancel)→ idle
 *
 * So a sound never plays while the microphone is asked for or recording,
 * and what iOS is told follows from the state alone (`sessionFor`), never
 * from whoever touched it last. Whatever a state holds (the sound playing,
 * the open microphone) is let go by the transition out of it, on every
 * path. The browser's side is behind `AudioDevices`; `app/devices/audio.ts` is the
 * real one, and the tests use their own.
 */

/** What iOS is told the page does with sound (`navigator.audioSession`). */
export type Session = 'auto' | 'playback' | 'play-and-record';

/** What the browser does for the page's audio. */
export interface AudioDevices {
  /** Tells the device what the page is about to do with sound. */
  session(type: Session): void;
  /**
   * Starts `samples`, at `rate` a second, from `from` seconds; `ended` once
   * they've played out. Throws if it can't play.
   */
  play(
    samples: Float32Array<ArrayBuffer>,
    rate: number,
    from: number,
    ended: () => void
  ): Output;
  /** A short alert beep, over whatever is playing. */
  beep(): void;
  /** Lets the speaker go: the next play starts afresh. */
  release(): void;
  /**
   * Opens the microphone and starts recording; rejects with why it couldn't.
   * `failed` once recording breaks off by itself.
   */
  openMicrophone(failed: (error: unknown) => void): Promise<Input>;
}

/** A sound the device is playing. */
export interface Output {
  /** Seconds since it started. */
  elapsed(): number;
  stop(): void;
}

/** The open microphone, recording. Either way out lets it go. */
export interface Input {
  /** Stops, and gives what was recorded. */
  finish(): Promise<Blob>;
  /** Stops, keeping nothing. */
  discard(): void;
}

/** What the page's audio is doing, as the screen shows it. */
export type AudioState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'playing';
      /** The player that started it: a message's, or a dialog's. */
      readonly owner: string;
      /** Where in the sound it started, and how long the sound is, in seconds. */
      readonly from: number;
      readonly duration: number;
    }
  | { readonly kind: 'asking' }
  | { readonly kind: 'recording' };

/**
 * What iOS must be told for each state: music while playing, so the silent
 * switch doesn't mute it; recording while asking for and using the
 * microphone, which iOS refuses to a page that says it only plays.
 */
export const sessionFor = (state: AudioState): Session =>
  state.kind === 'playing'
    ? 'playback'
    : state.kind === 'asking' || state.kind === 'recording'
    ? 'play-and-record'
    : 'auto';

/** A recording under way, from the moment it's asked for. */
export interface Recording {
  /**
   * True once the microphone is open and recording; false if it was
   * cancelled first. Rejects with why the microphone was refused.
   */
  readonly started: Promise<boolean>;
  /**
   * Stops and gives what was recorded: null if it never started, was
   * cancelled or broke off. The microphone goes back. The same promise
   * every time.
   */
  finish(): Promise<Blob | null>;
  /** Stops and keeps nothing; the microphone goes back. Once it's over, nothing. */
  cancel(): void;
}

export type Audio = ReturnType<typeof createAudio>;

// What each state holds, beside what it shows. A token tells this playing
// or recording from any before or after it, so a late callback from one
// that's over changes nothing.
type Now =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'playing';
      readonly shown: AudioState & { kind: 'playing' };
      readonly token: object;
      readonly output: Output;
    }
  | { readonly kind: 'asking'; readonly token: object }
  | {
      readonly kind: 'recording';
      readonly token: object;
      readonly input: Input;
    };

const IDLE: AudioState = { kind: 'idle' };
const ASKING: AudioState = { kind: 'asking' };
const RECORDING: AudioState = { kind: 'recording' };

export function createAudio(
  devices: AudioDevices,
  synthesize: (codes: SoundCodes) => Float32Array<ArrayBuffer> = synthesizeSound
) {
  let now: Now = { kind: 'idle' };
  let shown: AudioState = IDLE;
  let told: Session = 'auto';
  const listeners = new Set<() => void>();
  // Each sound is made into samples on its first play, and kept with it.
  const made = new WeakMap<SoundCodes, Float32Array<ArrayBuffer>>();

  /** Tells the device what a state needs, before entering it, and only when it changes. */
  const tell = (state: AudioState) => {
    const session = sessionFor(state);
    if (session === told) return;
    told = session;
    devices.session(session);
  };

  const become = (next: Now) => {
    now = next;
    shown =
      next.kind === 'playing'
        ? next.shown
        : next.kind === 'asking'
        ? ASKING
        : next.kind === 'recording'
        ? RECORDING
        : IDLE;
    tell(shown);
    for (const listener of listeners) listener();
  };

  const holds = (token: object) => now.kind !== 'idle' && now.token === token;

  /** Stops the sound playing, if one is, leaving the state to the caller. */
  const silence = () => {
    if (now.kind === 'playing') now.output.stop();
  };

  const stopPlaying = () => {
    if (now.kind !== 'playing') return;
    silence();
    become({ kind: 'idle' });
  };

  const samplesOf = (codes: SoundCodes) => {
    let samples = made.get(codes);
    if (!samples) {
      samples = synthesize(codes);
      made.set(codes, samples);
    }
    return samples;
  };

  return {
    state: () => shown,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Seconds into the sound playing, or 0. */
    position() {
      if (now.kind !== 'playing') return 0;
      const { from, duration } = now.shown;
      return Math.min(duration, from + Math.max(0, now.output.elapsed()));
    },

    /**
     * Plays the sound for `owner` from `from` seconds, stopping any other.
     * Nothing plays while the microphone is asked for or recording. Call it
     * from a click: phones only start sound for one.
     */
    play(owner: string, codes: SoundCodes, from = 0) {
      if (now.kind === 'asking' || now.kind === 'recording') return;
      // Straight from one sound to the next, without idling between.
      silence();
      const samples = samplesOf(codes);
      const duration = samples.length / SOUND_RATE;
      const next = {
        kind: 'playing',
        owner,
        from: Math.min(Math.max(0, from), duration),
        duration,
      } as const;
      const token = {};
      tell(next);
      let output: Output;
      try {
        output = devices.play(samples, SOUND_RATE, next.from, () => {
          if (holds(token)) become({ kind: 'idle' });
        });
      } catch {
        // The device couldn't play it; the next press tries again.
        become({ kind: 'idle' });
        return;
      }
      become({ kind: 'playing', shown: next, token, output });
    },

    /** Stops the sound playing, or only `owner`'s if it's given. */
    stop(owner?: string) {
      if (now.kind !== 'playing') return;
      if (owner === undefined || now.shown.owner === owner) stopPlaying();
    },

    /**
     * Asks for the microphone and records, stopping any sound playing; one
     * recording at a time. `failed` if it breaks off by itself.
     */
    record(failed: (error: unknown) => void): Recording {
      if (now.kind === 'asking' || now.kind === 'recording') {
        const busy = Promise.reject(new Error('Already recording'));
        return {
          started: busy,
          finish: () => Promise.resolve(null),
          cancel: () => undefined,
        };
      }
      silence();
      const token = {};
      become({ kind: 'asking', token });
      const started = devices
        .openMicrophone((error) => {
          if (now.kind !== 'recording' || now.token !== token) return;
          const { input } = now;
          become({ kind: 'idle' });
          input.discard();
          failed(error);
        })
        .then(
          (input) => {
            // Cancelled while asking: the microphone goes straight back.
            if (!holds(token)) {
              input.discard();
              return false;
            }
            become({ kind: 'recording', token, input });
            return true;
          },
          (error: unknown) => {
            if (holds(token)) become({ kind: 'idle' });
            throw error;
          }
        );
      let finished: Promise<Blob | null> | null = null;
      return {
        started,
        finish() {
          if (finished) return finished;
          if (now.kind === 'recording' && now.token === token) {
            const { input } = now;
            become({ kind: 'idle' });
            finished = input.finish();
          } else {
            if (holds(token)) become({ kind: 'idle' });
            finished = Promise.resolve(null);
          }
          return finished;
        },
        cancel() {
          if (!holds(token)) return;
          const was = now;
          become({ kind: 'idle' });
          if (was.kind === 'recording') was.input.discard();
        },
      };
    },

    /**
     * The alert beep, over any sound playing; never while the microphone is
     * asked for or recording, where it would be recorded. It changes
     * nothing, so it keeps to the silent switch, as an alert should.
     */
    beep() {
      if (now.kind === 'asking' || now.kind === 'recording') return;
      devices.beep();
    },

    /**
     * The page has gone out of sight: the sound stops and the speaker is let
     * go, since iOS leaves it stuck once the app has been away. A recording
     * carries on.
     */
    away() {
      stopPlaying();
      devices.release();
    },
  };
}

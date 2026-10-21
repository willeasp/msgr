import { analyseSound, SOUND_RATE, type SoundCodes } from '@msgr/bitmap';
import { describe, expect, it, vi } from 'vitest';
import {
  createAudio,
  sessionFor,
  type AudioDevices,
  type Input,
} from './audio';

/** `seconds` of a tone, as codes. */
const sound = (seconds: number): SoundCodes =>
  analyseSound(
    Float32Array.from(
      { length: Math.round(seconds * SOUND_RATE) },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SOUND_RATE)
    )
  );

/**
 * Devices that only remember what was asked of them, in order, and let the
 * test decide what the browser does: when a sound ends, how far it has got,
 * whether the microphone is granted, and when recording breaks.
 */
function fakeDevices() {
  const log: string[] = [];
  const playing: { ended: () => void; elapsed: number; from: number }[] = [];
  let grant: { open: (input: Input) => void; refuse: (e: unknown) => void } = {
    open: () => undefined,
    refuse: () => undefined,
  };
  let breakOff: (error: unknown) => void = () => undefined;
  let refusePlaying = false;
  const devices: AudioDevices = {
    session: (type) => log.push(`session ${type}`),
    play(_samples, rate, from, ended) {
      if (refusePlaying) throw new Error('No sound');
      log.push(`play from ${from} at ${rate}`);
      const output = { ended, elapsed: 0, from };
      playing.push(output);
      return {
        elapsed: () => output.elapsed,
        stop: () => log.push(`stop from ${from}`),
      };
    },
    beep: () => log.push('beep'),
    release: () => log.push('release'),
    openMicrophone(failed) {
      log.push('open microphone');
      breakOff = failed;
      return new Promise<Input>((open, refuse) => {
        grant = { open, refuse };
      });
    },
  };
  const microphone = () => {
    const input = {
      finish: vi.fn(() => {
        log.push('microphone finished');
        return Promise.resolve(new Blob(['said']));
      }),
      discard: vi.fn(() => log.push('microphone discarded')),
    };
    return input;
  };
  return {
    devices,
    log,
    playing,
    microphone,
    grant: (input: Input) => grant.open(input),
    refuse: (error: unknown) => grant.refuse(error),
    breakOff: (error: unknown) => breakOff(error),
    refusePlaying: () => {
      refusePlaying = true;
    },
  };
}

const setup = () => {
  const fake = fakeDevices();
  const synthesize = vi.fn(
    (codes: SoundCodes) => new Float32Array((codes.frames - 1) * 160)
  );
  return { ...fake, synthesize, audio: createAudio(fake.devices, synthesize) };
};

describe('what iOS is told', () => {
  it('follows from the state alone', () => {
    expect(sessionFor({ kind: 'idle' })).toBe('auto');
    expect(
      sessionFor({ kind: 'playing', owner: 'a', from: 0, duration: 1 })
    ).toBe('playback');
    expect(sessionFor({ kind: 'asking' })).toBe('play-and-record');
    expect(sessionFor({ kind: 'recording' })).toBe('play-and-record');
  });

  it('is nothing until something happens', () => {
    const { audio, log } = setup();
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(log).toEqual([]);
  });
});

describe('playing', () => {
  it('says so before the sound starts, and is idle again once it ends', () => {
    const { audio, log, playing } = setup();
    audio.play('ada', sound(2));

    expect(log).toEqual(['session playback', 'play from 0 at 8000']);
    expect(audio.state()).toMatchObject({ kind: 'playing', owner: 'ada' });

    playing[0]?.ended();
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(log.at(-1)).toBe('session auto');
  });

  it('knows how far in it is, from where it started, up to its end', () => {
    const { audio, playing } = setup();
    audio.play('ada', sound(2), 0.5);
    const output = playing[0];
    if (!output) throw new Error('Nothing played');

    output.elapsed = 1;
    expect(audio.position()).toBeCloseTo(1.5);
    output.elapsed = 9;
    expect(audio.position()).toBeCloseTo(2);
    audio.stop();
    expect(audio.position()).toBe(0);
  });

  it('plays one sound at a time, going straight from one to the next', () => {
    const { audio, log, playing } = setup();
    audio.play('ada', sound(2));
    audio.play('bob', sound(2), 1);

    expect(log).toEqual([
      'session playback',
      'play from 0 at 8000',
      'stop from 0',
      'play from 1 at 8000',
    ]);
    expect(audio.state()).toMatchObject({ owner: 'bob' });
    // The first sound's late end changes nothing.
    playing[0]?.ended();
    expect(audio.state()).toMatchObject({ kind: 'playing', owner: 'bob' });
  });

  it("stops only its owner's sound, or any when no owner is given", () => {
    const { audio } = setup();
    audio.play('ada', sound(1));
    audio.stop('bob');
    expect(audio.state()).toMatchObject({ owner: 'ada' });
    audio.stop('ada');
    expect(audio.state()).toEqual({ kind: 'idle' });
    audio.play('ada', sound(1));
    audio.stop();
    expect(audio.state()).toEqual({ kind: 'idle' });
  });

  it('makes a sound into samples once, however often it plays', () => {
    const { audio, synthesize } = setup();
    const codes = sound(1);
    audio.play('ada', codes);
    audio.play('ada', codes);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('is idle again when the device cannot play', () => {
    const { audio, log, refusePlaying } = setup();
    refusePlaying();
    audio.play('ada', sound(1));
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(log).toEqual(['session playback', 'session auto']);
  });

  it('tells its watchers each time it changes, and not otherwise', () => {
    const { audio, playing } = setup();
    const watcher = vi.fn();
    const unwatch = audio.subscribe(watcher);
    const before = audio.state();
    audio.stop();
    expect(watcher).not.toHaveBeenCalled();
    expect(audio.state()).toBe(before);

    audio.play('ada', sound(1));
    playing[0]?.ended();
    expect(watcher).toHaveBeenCalledTimes(2);
    unwatch();
    audio.play('ada', sound(1));
    expect(watcher).toHaveBeenCalledTimes(2);
  });
});

describe('recording', () => {
  it('stops any sound and says so before asking for the microphone', async () => {
    const { audio, log, grant, microphone } = setup();
    audio.play('ada', sound(2));
    const recording = audio.record(() => undefined);

    expect(audio.state()).toEqual({ kind: 'asking' });
    expect(log.slice(2)).toEqual([
      'stop from 0',
      'session play-and-record',
      'open microphone',
    ]);

    grant(microphone());
    expect(await recording.started).toBe(true);
    expect(audio.state()).toEqual({ kind: 'recording' });
  });

  it('gives what was recorded, and the microphone back, when finished', async () => {
    const { audio, log, grant, microphone } = setup();
    const recording = audio.record(() => undefined);
    const input = microphone();
    grant(input);
    await recording.started;

    const said = await recording.finish();
    expect(await said?.text()).toBe('said');
    expect(input.finish).toHaveBeenCalledTimes(1);
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(log.at(-1)).toBe('microphone finished');
    expect(log).toContain('session auto');

    // Over: finishing again gives the same, and cancelling does nothing.
    expect(recording.finish()).toBe(recording.finish());
    recording.cancel();
    expect(input.discard).not.toHaveBeenCalled();
  });

  it('keeps nothing, and gives the microphone back, when cancelled', async () => {
    const { audio, grant, microphone } = setup();
    const recording = audio.record(() => undefined);
    const input = microphone();
    grant(input);
    await recording.started;

    recording.cancel();
    expect(input.discard).toHaveBeenCalledTimes(1);
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(await recording.finish()).toBeNull();
  });

  it('gives the microphone straight back if cancelled while asking', async () => {
    const { audio, grant, microphone } = setup();
    const recording = audio.record(() => undefined);
    recording.cancel();
    expect(audio.state()).toEqual({ kind: 'idle' });

    const input = microphone();
    grant(input);
    expect(await recording.started).toBe(false);
    expect(input.discard).toHaveBeenCalledTimes(1);
    expect(audio.state()).toEqual({ kind: 'idle' });
  });

  it('is idle again, with nothing to give back, when the microphone is refused', async () => {
    const { audio, log, refuse } = setup();
    const recording = audio.record(() => undefined);
    const no = new Error('NotAllowedError');
    refuse(no);

    await expect(recording.started).rejects.toBe(no);
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(log.at(-1)).toBe('session auto');
    expect(await recording.finish()).toBeNull();
  });

  it('gives the microphone back and says why when recording breaks off', async () => {
    const { audio, grant, microphone, breakOff } = setup();
    const failed = vi.fn();
    const recording = audio.record(failed);
    const input = microphone();
    grant(input);
    await recording.started;

    const broke = new Error('NotReadableError');
    breakOff(broke);
    expect(failed).toHaveBeenCalledWith(broke);
    expect(input.discard).toHaveBeenCalledTimes(1);
    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(await recording.finish()).toBeNull();
  });

  it('plays nothing while asking for the microphone or recording', async () => {
    const { audio, log, grant, microphone } = setup();
    const recording = audio.record(() => undefined);
    audio.play('ada', sound(1));
    grant(microphone());
    await recording.started;
    audio.play('ada', sound(1));

    expect(log.some((line) => line.startsWith('play'))).toBe(false);
    expect(audio.state()).toEqual({ kind: 'recording' });
  });

  it('records one thing at a time', async () => {
    const { audio, grant, microphone } = setup();
    const first = audio.record(() => undefined);
    const second = audio.record(() => undefined);

    await expect(second.started).rejects.toThrow('Already recording');
    second.cancel();
    expect(audio.state()).toEqual({ kind: 'asking' });
    grant(microphone());
    expect(await first.started).toBe(true);
  });
});

describe('the alert beep', () => {
  it('sounds when idle or over a sound, and changes nothing', () => {
    const { audio, log } = setup();
    audio.beep();
    expect(log).toEqual(['beep']);
    audio.play('ada', sound(1));
    audio.beep();
    expect(log.at(-1)).toBe('beep');
    expect(audio.state()).toMatchObject({ kind: 'playing', owner: 'ada' });
  });

  it('never sounds while asking for the microphone or recording', async () => {
    const { audio, log, grant, microphone } = setup();
    const recording = audio.record(() => undefined);
    audio.beep();
    grant(microphone());
    await recording.started;
    audio.beep();
    expect(log).not.toContain('beep');
  });
});

describe('going away', () => {
  it('stops the sound and lets the speaker go, to start afresh', () => {
    const { audio, log } = setup();
    audio.play('ada', sound(1));
    audio.away();

    expect(audio.state()).toEqual({ kind: 'idle' });
    expect(log.slice(-3)).toEqual(['stop from 0', 'session auto', 'release']);
    audio.play('ada', sound(1));
    expect(log.at(-1)).toBe('play from 0 at 8000');
  });

  it('lets a recording carry on', async () => {
    const { audio, grant, microphone } = setup();
    const recording = audio.record(() => undefined);
    grant(microphone());
    await recording.started;

    audio.away();
    expect(audio.state()).toEqual({ kind: 'recording' });
  });
});

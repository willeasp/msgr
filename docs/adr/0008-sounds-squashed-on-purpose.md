# 8. Sounds squashed on purpose

Date: 2026-10-21 · Status: accepted

## Context

People wanted to send voice and music, up to a minute, made as small as
pictures and movies are, and sounding the part: crunchy, like an old Mac.
The server has to be able to check what it stores, as it does pictures and
movies (ADR 0007), on a free plan's single instance and 1 GB database.

A spike squashed six openly licensed recordings (two LibriSpeech readings, a
song with vocals, jazz, drum and bass, ragtime piano) every way below, and
measured them:

| Way                                        | KB a minute |
| ------------------------------------------ | ----------- |
| ADPCM, 2 bits a sample, 4 kHz              | 54–55       |
| CVSD, 1 bit a sample, 16 kHz               | 110–128     |
| Opus at 6 kbps, the lowest it goes         | 47–49       |
| Ours at 8 kHz, a step three times the band | 27–35       |

- ADPCM and CVSD are how old machines made sound small, the nearest thing to
  a 1-bit picture. Their output is nearly random, so the movies' range coder
  takes almost nothing off: they stay bigger than Opus.
- Opus is what browsers record to and would be small enough, but the server
  couldn't check an Ogg stream the way it checks a movie, and sending one
  means trusting the browser's encoder and every reader's decoder with it.
- A transform coder of our own, the shape of Opus or MP3 but crude, came out
  smallest and sounded right; the crunchiest setting was picked by ear.

## Decision

- A sound is 8,000 samples a second in frames of 20 ms that overlap by half
  (an MDCT with a sine window), 2 to 3,001 frames: up to a minute, cut from a
  recording or a file of up to 15 minutes.
- Each frame keeps its 13 bands' loudness in 3 dB steps (0 to 40), and each
  of its 160 frequencies as -1, 0 or 1 of a step three times its band's
  loudness. No frequency can be more than a step from nothing, so those are
  the only levels; most are 0. Played back, a 0 is noise at a fraction of the
  band's loudness. That's the crunch.
- `encodeSound` in `@msgr/bitmap` codes the loudness as differences from the
  band before and the frame before, and each level in a context of its band
  and its neighbours' sizes, with the movies' range coder (now
  `range-coder.ts`). Everything coded is a whole number.
- The server decodes exactly the frames a sound's length says, codes them
  again and takes only bytes identical to that, as for movies, and refuses a
  silent one. Turning codes into samples (`synthesizeSound`) is for browsers
  only, in floating point.
- The sender's device evens the sound out first: rumble below 90 Hz cut, a
  6:1 compressor above -28 dB that looks 3 ms ahead, then as loud as fits.

## Consequences

- About 33,000 minute-long sounds fit in 1 GB; quiet stretches cost next to
  nothing.
- Decoding and coding a minute again takes the server about a tenth of a
  second, under a third of the largest movie's.
- The format is ours to keep: changing the bands, steps or contexts changes
  every stored byte's meaning, so a new coder would need a new column or a
  version.
- Music and voice alike come out lo-fi on purpose. Anyone wanting a faithful
  recording should send a link instead.

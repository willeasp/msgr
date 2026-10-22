# 9. One audio

Date: 2026-10-21 · Status: accepted; the adapter now lives in `app/browser/audio.ts` ([ADR 0010](0010-frontend-layers.md))

## Context

Sounds (ADR 0008) shipped with their audio spread over the page: the player
set what iOS was told and kept a Web Audio context in a module of its own,
the sound dialog opened and closed the microphone itself, and the alert beep
had a context of its own. On an iPhone this broke three ways:

- After a sound played, the player had told iOS the page only plays
  (`audioSession.type = 'playback'`), and nothing told it otherwise, so iOS
  refused the microphone.
- A recording that failed partway never stopped the microphone's tracks, so
  every later Record failed until the app was quit.
- iOS leaves a context "interrupted" once the app has been away, and the
  page kept using one that would never play again.

Each was a state nobody owned: a setting two places wrote, a resource whose
release was a line to remember, a lifetime the code didn't model. Patching
each where it showed would have left the shape that caused them.

## Decision

- All of the page's audio goes through one object, `audio`, made in
  `app/devices/audio.ts` by `createAudio` from `lib/audio.ts`. It is always exactly
  idle, playing, asking (for the microphone) or recording, and `play`,
  `stop`, `record`, `beep` and `away` are the only ways to change it.
- Illegal states can't be written down: a sound can't play while the
  microphone is asked for or recording, and two recordings can't overlap,
  because no state holds both.
- What iOS is told is a function of the state (`sessionFor`), told before
  entering it, never set by hand.
- Each state holds its resources (the sound playing, the open microphone),
  and every transition out of it lets them go. `record` returns a
  `Recording` at once, so whoever holds it can cancel it even while the
  browser is still asking; a microphone granted after that goes straight
  back.
- The browser is behind a port, `AudioDevices`, as the API's adapters are.
  `app/devices/audio.ts` is the real one; `lib/audio.test.ts` drives the rules with
  a fake that records every call in order, since Chromium, and so the e2e,
  can reproduce none of iOS's rules.

## Consequences

- New audio (a ringtone, a recorded avatar sound) is a transition and a
  device method, with a test, not a new `AudioContext`.
- iOS's rules are tested as rules. Whether iOS still behaves as they assume
  is checked by hand (`docs/manual-testing.md`).
- Decoding a picked file stays outside: it reads a file, and neither plays
  nor records.

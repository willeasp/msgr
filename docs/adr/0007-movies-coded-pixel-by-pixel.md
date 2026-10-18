# 7. Movies coded pixel by pixel

Date: 2026-10-18 · Status: accepted

## Context

People wanted to send video, in the same black-and-white style as pictures,
with the database on a free plan of 1 GB. A message's picture is 1-bit, made
on the sender's device and raw-DEFLATEd, a few KB. Phone video is tens of MB
a minute.

A spike tried six ways of dithering four test clips, at 160 and 320 pixels,
and measured their size against grey H.264 and AV1:

- Atkinson's dithering frame by frame shimmers: up to a third of the pixels
  change between frames that hardly differ, so even frame-to-frame XOR plus
  DEFLATE barely compresses. Keeping a pixel unless its light moves past a
  threshold (pixel skipping) stops that, and looks the same.
- DEFLATE knows nothing of pictures. An adaptive model of each pixel's
  neighbours in its own frame and the one before, coded with a range coder,
  takes 45 to 50 % off: 6 seconds at 320 pixels averaged 44 KB, against 83 KB
  with DEFLATE.
- Grey H.264 or AV1, dithered when shown, would be about as small, but the
  server couldn't check an mp4 the way it checks a picture, and sending one
  means trusting the browser's encoder and decoder with it.

## Decision

- A movie is 1 to 320 pixels a side and 1 to 48 frames, at 8 frames a second,
  looping: up to 6 seconds, cut from a video of up to 10 minutes.
- The sender's device makes it: levels stretched, local contrast and edges
  lifted, then Atkinson's dithering at 60 % strength with pixel skipping
  (`steadyAtkinson`).
- Its frames are coded by `encodeMovie` in `@msgr/bitmap`: a binary range
  coder (LZMA's) over a context of 11 pixels of the frame and 5 of the one
  before, each context counting its zeros and ones. Pure code, run by both
  browser and server.
- The server decodes exactly the frames a movie's size says, codes them again
  and takes only bytes identical to that coding, so a few bytes can't decode
  to a big busy movie that it would store and send to everyone. It refuses a
  blank one. A mutation selects one field and the socket takes only
  subscriptions, so one request can't ask for many movies' worth of work.
- Anything drawn over a movie is drawn into every frame before it's sent.
  The server sees only a movie.

## Consequences

- About 23,000 six-second movies fit in 1 GB, more where the camera stands
  still: a still background costs next to nothing, a shaking camera most.
- The format is ours to keep: changing the model or the context changes every
  stored byte's meaning, so a new coder would need a new column or a version.
- Coding is about as fast as DEFLATE in the browser (a few hundred ms for the
  largest movie) but runs on the server's one thread; a few movies a second
  would be felt.
- Movies have no sound.

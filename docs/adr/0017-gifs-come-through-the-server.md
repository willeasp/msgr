# 17. GIFs come through the server and become movies

Date: 2026-10-27 · Status: accepted

## Context

People wanted GIFs from GIPHY as an attachment, in Msgr's black and white
like everything else. GIPHY's API needs a key, gives each GIF as many
renditions (GIF, MP4, WebP, stills) on its media hosts, and asks apps to say
"Powered by GIPHY" where it's searched. A free key allows 100 calls an hour.

A browser could ask GIPHY itself, but then GIPHY would see every person's
address and searches, the key would be in the page, and the CSP would have to
let the page reach GIPHY's hosts. The page talks to this server alone
([ADR 2](0002-one-origin-one-session-cookie.md)), as link previews do.

## Decision

- **The server asks GIPHY**, with `GIPHY_API_KEY`, for whoever is signed in:
  `Query.gifs(search, after)`, 24 at a time, trending without words, rated
  PG-13 and under. Without a key GIFs are off: `Query.gifsOn` is false, Attach
  doesn't offer GIF…, and `gifs` is null. GIPHY busy (its hourly allowance
  spent) or down is an expected failure (`Unavailable`), said as
  `SERVICE_UNAVAILABLE`.
- **And fetches GIPHY's files** at `/giphy/media?url=…`, for whoever is signed
  in: only from GIPHY's own media hosts, over https, redirects included
  (`GiphyMedia.parse`), only stills and MP4s, up to 8 MB, asked for
  uncompressed and streamed through as they come (GIPHY has 5 s to start and
  may go quiet for 10, however slowly the browser reads), and kept by the
  browser a day for that session. Only GET: a HEAD would fetch a file to send
  none of it. Nothing else is fetched, and nothing is kept on the server.
- **A GIF becomes a movie on the device**, exactly as a video file does
  (`movieFrom`): the MP4 GIPHY makes of it, 200 pixels on its short side, is
  fetched whole, played from the device, read at 8 frames a second from its
  start for up to six seconds, and dithered. It's attached like any movie, can
  be drawn on, and is sent and stored as one. A message doesn't know it came
  from GIPHY.
- **Its still is dithered on the device too**: the GIF dialog shows each
  result's still, its middle square, in black and white, 64 pixels at 2× (84
  at 1× on a phone).
- **Searches are few**: one after typing pauses half a second, each kept for
  the visit with its pages (`cache-first`, and catching up after a reconnect
  leaves it be), More only when asked, joining only the search it was asked
  for. What's trending pages to 499, a search to 4,999, as far as GIPHY does.

## Consequences

- GIPHY never learns who searched, nor the key; the CSP is unchanged.
- The free instance carries every still and MP4 (tens of kB a still, a few
  hundred a movie). It never decodes them.
- Nothing limits one person's searches but the dialog's manners: someone
  scripting the API could spend the key's hour for everyone. Among invited
  friends that's left to them.
- A GIF longer than six seconds is cut at six, and one that loops faster than
  8 frames a second steps more coarsely, as any movie does.
- GIPHY's own movie is what's dithered, so a GIF GIPHY can't make an MP4 of
  isn't offered. A browser that can't play MP4 (none of today's) can't use
  GIFs.
- The e2e never reaches GIPHY: it answers the app's searches and serves its
  files itself (`fakeGiphy`), against a server whose key is fake.

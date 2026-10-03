# Mixer interaction design

Mixer is a landscape-first, installable musical toy for an Android tablet. The
entire child-facing experience lives on one screen: six large pads plus Stop and
Settings.

## Pads

- An empty pad is faded. Audio capture starts the instant it is pressed so the
  beginning is never clipped. Releasing before the hold threshold discards the
  capture; a valid hold saves it and trims quiet audio from both ends.
- A quick tap on a filled pad plays its sound immediately. Each tap creates a
  separate voice, so the same sound can overlap itself at different phases.
- Pressing and holding a filled pad adds it to, or removes it from, the loop.
  Loops begin together on a shared musical boundary while one-shot taps remain
  immediate and independent.
- A circular progress ring follows every one-shot playback. Overlapping plays
  are shown as concentric rings on the pad.
- Holding a pad while shaking the tablet clears its recording. This destructive
  action has a deliberate gesture and is confirmed by visible feedback.

## Global controls

- **Stop** immediately stops every voice and clears every selected loop.
- **Settings** opens a fresh, random two-digit addition challenge whose answer
  never exceeds 99. A correct answer opens the parent panel; no previous answer
  or repeated state is stored.

The parent panel contains only useful device controls for now: master volume,
microphone permission guidance, and an install shortcut when the browser makes
one available.

## Device constraints

- The web app requests landscape orientation in its manifest. In portrait it
  rotates a dimension-swapped landscape canvas, preserving the exact layout
  instead of squeezing it into the narrow viewport.
- It is a PWA with an app manifest, icons, and an offline service worker.
- The implementation avoids frameworks and expensive continuous animation so
  it remains responsive on an Android tablet from roughly 2021.
- Audio remains on-device. Recordings are held in memory and are never uploaded.

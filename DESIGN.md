# Mixer interaction design

Mixer is a landscape-first, installable musical toy for an Android tablet. The
entire child-facing experience lives on one screen: six large pads plus Stop and
Settings.

## Pads

- An empty pad is gray with fully visible SVG artwork. Audio capture starts when it is pressed so the
  beginning is never clipped. Releasing before the hold threshold discards the
  capture; a valid hold saves it and trims quiet audio from both ends.
- A quick tap on a filled pad plays its sound immediately. Each tap creates a
  separate voice, so the same sound can overlap itself at different phases.
- Recordings use the Android/Chrome microphone's automatic gain with no
  additional software amplification. A lower trimming threshold preserves
  quieter starts and endings.
- Pressing and holding a filled pad adds it to, or removes it from, the loop.
  Loops begin together on a shared musical boundary while one-shot taps remain
  immediate and independent.
- A circular progress ring follows every one-shot playback. Overlapping plays
  are shown as concentric rings on the pad.
- All six pads are exact squares with a flat, bezel-free surface.
- Dragging a recorded pad reveals a trash can over the Stop control. Dropping
  onto it clears the recording and stops its voices; dropping elsewhere or
  cancelling keeps it. A stationary hold toggles the loop on release.
- The background is solid, and all six pads use coordinated vector illustrations.
- A saved parent setting can hide the illustrations, leaving plain colored pads.

## Global controls

- **Stop** is a circular transport control that immediately stops every voice
  and clears every selected loop.
- Stop has a larger touch target, with an even larger drag-to-trash target in
  the same reserved column. A wider gutter separates both from the pads.
- **Settings** is a quiet, flat control at the top of Stop's reserved column,
  so it never overlaps a sound pad. It opens a fresh, random
  two-digit addition challenge. Answers are sampled uniformly from 20 through
  99, then randomly split into two two-digit operands. A correct answer opens
  the parent panel; no previous answer or repeated state is stored. The answer
  field receives focus as soon as the challenge opens.

The compact parent panel contains master volume, a saved show/hide-pad-icons
choice, microphone permission guidance, and an install shortcut when the
browser makes one available. Both parent dialogs are constrained to the fixed
canvas and scroll internally if an unusually small screen requires it.

## Device constraints

- The web app requests landscape orientation in its manifest. It measures one
  landscape canvas at launch and keeps its grid dimensions fixed. Orientation
  and viewport changes rotate or uniformly scale that canvas (including dialogs)
  without recalculating individual pad sizes or moving controls within it.
- It is a PWA with an app manifest, icons, and an offline service worker.
- The app UI, accessibility labels, and manifest metadata are Hebrew and RTL.
- The implementation avoids frameworks and expensive continuous animation so
  it remains responsive on an Android tablet from roughly 2021.
- Audio remains on-device. Recordings are held in memory and are never uploaded.

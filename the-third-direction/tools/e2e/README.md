# Browser test scripts

Run with the test build (`npm run build:standalone`) and the runner:

```
QS='?debug' node tools/e2e.mjs dist-standalone tools/e2e/gestures-3d.json /tmp/out
```

* `gestures-2d.json`, `gestures-3d.json`: the one-button gestures (tap, hold and let go, long hold with a full meter, double-tap),
  tested by stepping the game by hand with a fixed 1/60 s so the result does not depend on how fast the machine draws frames.
  Expected: tap = pulse/strike, hold = one lance, long hold = a nova that empties the meter, double-tap = a dash.
* `full-3d.json` (+ `full-3d-run.js`): the bot plays all three 3D bosses back to back (X, The Collector, The Mash) at 3x speed and prints
  when each one began, the hearts lost, the deaths and whether the ending was reached. Change `nth-child(2)` to `1` / `3` for Gentle / Nightmare.
  Takes 4-8 minutes on a computer without a GPU. Normal: no deaths, about 270 s wall time; Nightmare: a few deaths, still finishes.

On a computer without a GPU the game runs slowly and the frame time is capped, so real-time button presses do not measure what a
phone would do; stepping by hand (as above) does.

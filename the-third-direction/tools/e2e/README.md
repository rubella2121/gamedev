# Browser test scripts

Run with the test build (`npm run build:standalone`) and the runner:

```
QS='?debug' node tools/e2e.mjs dist-standalone tools/e2e/gestures-3d.json /tmp/out
```

* `gestures-2d.json`, `gestures-3d.json`: the one-button gestures (tap, hold and let go, long hold with a full meter, double-tap),
  tested by stepping the game by hand with a fixed 1/60 s so the result does not depend on how fast the machine draws frames.
  Expected: tap = pulse/strike, hold = one lance, long hold = a nova that empties the meter, double-tap = a dash.

On a computer without a GPU the game runs slowly and the frame time is capped, so real-time button presses do not measure what a
phone would do; stepping by hand (as above) does.

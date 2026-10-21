# Working on The Third Direction

- **After every change to the game, rebuild and republish the playable Artifact.** Run `npm run build:artifact` in this folder, then publish
  `dist-artifact/artifact.html` with the Artifact tool, using the same file path so the link stays the same
  (https://claude.ai/artifact/NszTf1JWGM8dpBex6KhKXJ). The artifact is private. Do this for code, art and text changes that reach the game,
  not for changes that only touch docs, concept art or test tools.
- Nothing goes public without the owner's say-so (`rundot set-public` / `rundot deploy --public`).
- Test builds: `npm run build:standalone` (with bots, for `tools/e2e.mjs`), `npm run gallery` (model lab and concept cards).

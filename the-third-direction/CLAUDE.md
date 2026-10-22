# Working on The Third Direction

- **After every change to the game, rebuild and republish the playable Artifact.** Run `npm run build:artifact` in this folder, then publish
  `dist-artifact/artifact.html` with the Artifact tool, using the same file path so the link stays the same
  (https://claude.ai/artifact/NszTf1JWGM8dpBex6KhKXJ). The artifact is private. Do this for code, art and text changes that reach the game,
  not for changes that only touch docs, concept art or test tools.
- **After every change we make, merge it into `main`.** The owner asked for this as a standing rule. Work and push on the session's branch, open a
  pull request into `main` and merge it with a merge commit (not squash, not rebase, so every commit stays in the history), then start the
  branch again from the new `main` (`git fetch origin main && git checkout -B <branch> origin/main`; that is a plain fast-forward push).
  Docs, concept art and test tools are merged too. Merging publishes nothing: there is no CI or deploy on `main`.
- Nothing goes public without the owner's say-so (`rundot set-public` / `rundot deploy --public`).
- Test builds: `npm run build:standalone` (with bots, for `tools/e2e.mjs`), `npm run gallery` (model lab and concept cards).

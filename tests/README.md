# Pocket Circuit — dev tests

Dev-only Playwright checks for the game. Never required to play the game
itself; `index.html` works standalone.

## Run

```bash
bash tests/fetch-three.sh && node tests/slice1.mjs
```

`fetch-three.sh` downloads a local copy of three@0.160.0's module build into
`tests/.vendor/` (gitignored) via `npm pack`, since the CDN used by the game
is not reachable from this test environment. The test script serves
`index.html` from a tiny local static server and intercepts the jsdelivr
request, fulfilling it from that local copy.

Screenshots are written to `tests/.out/` (gitignored).

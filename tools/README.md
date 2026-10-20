# Security checks

- `node tools/scan-code.js` scans the app's code (`js/`, `tools/`) and `index.html` for anything that
  could turn data from a project file into running code or reach the network: `eval`,
  `new Function`, HTML built from variables, `fetch` and similar, or URLs set from variables. It also
  checks that the Content-Security-Policy is in place, with no inline scripts or `on…=` handlers. It
  exits with an error listing what it found. A line that has been checked by hand can be marked
  `// scan-ok: <reason>`.
- `tools/safety-test.html` runs the safety check (`js/safety.js`) against hostile project files
  (enormous numbers and counts, prototype-pollution keys, script-like text, bad colours and ids) and
  simulates the results to make sure nothing hangs. Start `python serve.py` and open
  `http://localhost/tools/safety-test.html`. All checks should say PASS.

See [SECURITY.md](../SECURITY.md) for the limits and the Content-Security-Policy.

# Challenge check

- `node tools/build-challenges.js` builds the built-in challenge file `challenges/builtin.json` and the
  copy the app loads, `js/challenges-data.js` (130 challenges, deterministic, with solutions).
- `tools/challenge-test.html` (through `python serve.py`, at `http://localhost/tools/challenge-test.html`)
  runs every challenge in a challenge file twice: as it comes, where it must **not** be solved, and
  with its stored solution added, where its 🏁 goal must go off. Multi-level challenges are followed
  through their gateways. It starts with the built-in set; choose another file on the page to check
  it. All should say PASS. Run it after changing an object's physics or the challenge builder.

# Image tools

Rebuild the alien character images from the photo (needs Python + Pillow: `pip install pillow`):

```
python tools/alien_cutout.py alien.jpeg tools/alien_cut.png
python tools/alien_frames.py tools/alien_cut.png img
```

- `alien_cutout.py` removes the background (green plastic + red eyes kept, fabric and shadow dropped).
- `alien_frames.py` splits the cut-out into body, arms and legs and renders `img/alien-sheet.png`
  (frame 0 standing, 1-8 walk cycle, 9 jump), `img/alien.png` (still) and `img/alien-icon.png`.
  If you change the frame size, update the `alien` sprite numbers in `js/objects-more.js`.

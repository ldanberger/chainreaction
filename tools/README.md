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

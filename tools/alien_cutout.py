"""Step 1: cut the alien out of the photo -> transparent PNG (processing scale 1/4)."""
import sys
from PIL import Image, ImageFilter, ImageChops, ImageOps

src, out = sys.argv[1], sys.argv[2]
im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
im = im.reduce(4)  # 3024x4032 -> 756x1008
hsv = im.convert('HSV')
H, S, V = hsv.split()

def band(ch, lo, hi):
    return ch.point(lambda v: 255 if lo <= v <= hi else 0)

# yellow-green plastic is strongly saturated; fabric and its shadow are grey / weakly tinted
green = ImageChops.multiply(ImageChops.multiply(band(H, 40, 110), band(S, 105, 255)), band(V, 90, 255))
green = green.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))  # drop specks
# painted red eyes: red pixels close to the green body
red = ImageChops.multiply(ImageChops.lighter(band(H, 0, 22), band(H, 230, 255)), band(S, 70, 255))
near = green.filter(ImageFilter.MaxFilter(31))
mask = ImageChops.lighter(green, ImageChops.multiply(red, near))
# close pinholes (highlights, eye rims) without bridging the gaps between limbs
mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))

# fill enclosed holes smaller than ~1500 px (highlight pinholes) but keep big gaps (between legs/arms)
from collections import deque
W, Hh = mask.size
px = bytearray(mask.tobytes())
seen = bytearray(W * Hh)
def bfs(start):
    q, comp, edge = deque([start]), [start], False
    seen[start] = 1
    while q:
        i = q.popleft()
        x, y = i % W, i // W
        if x in (0, W - 1) or y in (0, Hh - 1):
            edge = True
        for j in (i - 1, i + 1, i - W, i + W):
            if 0 <= j < W * Hh and not seen[j] and px[j] < 128 and abs((j % W) - x) <= 1:
                seen[j] = 1
                q.append(j)
                comp.append(j)
    return comp, edge
for i in range(W * Hh):
    if px[i] < 128 and not seen[i]:
        comp, edge = bfs(i)
        if not edge and len(comp) < 400:
            for j in comp:
                px[j] = 255
mask = Image.frombytes('L', (W, Hh), bytes(px))
mask = mask.filter(ImageFilter.GaussianBlur(1.0))

rgba = im.copy()
rgba.putalpha(mask)
print('bbox', mask.point(lambda v: 255 if v > 128 else 0).getbbox())
rgba.save(out)

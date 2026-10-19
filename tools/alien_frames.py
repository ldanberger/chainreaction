"""Step 2: split the cut-out alien into parts and render movement frames.

Output (into the app's img/ folder):
  alien.png         the clean cut-out, cropped (standing pose)
  alien-sheet.png   one row of frames: 0 stand, 1-8 walk cycle, 9 jump
  alien-icon.png    64x64 toolkit/preview icon
and prints the frame size for the JS sprite definition.
"""
import math, sys, os
from PIL import Image, ImageDraw, ImageChops

src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
cut = Image.open(src).convert('RGBA')
OX, OY = 170, 130  # part coordinates below were measured on a crop offset by this much

def P(pts):
    return [(x + OX, y + OY) for x, y in pts]

parts_poly = {
    'armL': P([(165, 280), (110, 300), (60, 370), (5, 420), (5, 505), (130, 505), (140, 420), (150, 340)]),
    'armR': P([(290, 280), (340, 300), (390, 370), (445, 420), (445, 505), (330, 505), (318, 430), (305, 340)]),
    'legL': P([(120, 470), (226, 470), (226, 790), (120, 790)]),
    'legR': P([(226, 470), (340, 470), (340, 790), (226, 790)]),
}
pivot = {'armL': P([(155, 310)])[0], 'armR': P([(298, 310)])[0], 'legL': P([(185, 485)])[0], 'legR': P([(268, 485)])[0]}

def poly_mask(pts):
    m = Image.new('L', cut.size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m

alpha = cut.getchannel('A')
parts = {}
for k, pts in parts_poly.items():
    a = ImageChops.multiply(alpha, poly_mask(pts))
    im = cut.copy(); im.putalpha(a); parts[k] = im
# torso = everything minus arms, minus legs below the hip overlap band
cutaway = Image.new('L', cut.size, 0)
d = ImageDraw.Draw(cutaway)
d.polygon(parts_poly['armL'], fill=255)
d.polygon(parts_poly['armR'], fill=255)
d.rectangle([OX + 100, OY + 505, OX + 360, OY + 800], fill=255)
torso = cut.copy(); torso.putalpha(ImageChops.multiply(alpha, ImageChops.invert(cutaway)))

# frame canvas (processing scale), generous room for swinging limbs
CX0, CY0, CX1, CY1 = 110, 80, 680, 930
FH = 220  # output frame height
SCALE = FH / (CY1 - CY0)
FW = round((CX1 - CX0) * SCALE)

def frame(armL=0, armR=0, legL=0, legR=0, liftL=0, liftR=0, bob=0, tilt=0):
    f = Image.new('RGBA', cut.size, (0, 0, 0, 0))
    def put(name, ang, lift=0):
        px, py = pivot[name]
        f.alpha_composite(parts[name].rotate(ang, resample=Image.BICUBIC, center=(px, py), translate=(0, -lift)))
    put('legL', legL, liftL)
    put('legR', legR, liftR)
    put('armL', armL)
    put('armR', armR)
    f.alpha_composite(torso)
    if bob or tilt:
        f = f.rotate(tilt, resample=Image.BICUBIC, center=(OX + 226, OY + 780), translate=(0, -bob))
    return f.crop((CX0, CY0, CX1, CY1)).resize((FW, FH), Image.LANCZOS)

frames = [frame()]
for i in range(8):  # walk cycle
    t = 2 * math.pi * i / 8
    s = math.sin(t)
    frames.append(frame(armL=-20 * s, armR=-20 * s, legL=13 * s, legR=13 * s,
                        liftL=32 * max(0, s), liftR=32 * max(0, -s), bob=10 * abs(s), tilt=4 * s))
frames.append(frame(armL=-125, armR=125, legL=-14, legR=14, liftL=12, liftR=12, bob=40))  # jump: arms up

sheet = Image.new('RGBA', (FW * len(frames), FH), (0, 0, 0, 0))
for i, fr in enumerate(frames):
    sheet.alpha_composite(fr, (i * FW, 0))
sheet.save(os.path.join(outdir, 'alien-sheet.png'), optimize=True)

bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
still = cut.crop(bbox)
still.thumbnail((400, 400), Image.LANCZOS)
still.save(os.path.join(outdir, 'alien.png'), optimize=True)

icon = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
small = cut.crop(bbox); small.thumbnail((60, 60), Image.LANCZOS)
icon.alpha_composite(small, ((64 - small.width) // 2, (64 - small.height) // 2))
icon.save(os.path.join(outdir, 'alien-icon.png'), optimize=True)

# preview strip on a light background for checking
prev = Image.new('RGBA', sheet.size, (225, 235, 245, 255)); prev.alpha_composite(sheet)
prev.convert('RGB').save(os.path.join(os.path.dirname(src), 'alien_sheet_preview.png'))
print('frame', FW, FH, 'frames', len(frames), 'feet_y_in_frame', round((OY + 780 - CY0) * SCALE))

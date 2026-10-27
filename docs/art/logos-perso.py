#!/usr/bin/env python3
"""White logos for the personal version (1.0.9-perso.N): CANAL+ without its black box, and Smart IPTV.

    python3 logos-perso.py <canalplus.svg> <siptv-icon.png> [folder for the pictures]

canalplus.svg is Wikimedia Commons' "File:Logo Canal+ 1995.svg" (public domain, simple text and shapes, as in
logos-commons.tsv). It is a black box with the lettering drawn in white: the box is taken away, the lettering stays.
siptv-icon.png is the 192 px icon of the Smart IPTV app as the TV has it (extraLargeIcon in listApps, the app's own
icon, for personal use only): a black square, the TV's frame, the antenna and the lettering in white or grey, and
the screen in red and blue. What is light becomes white and the rest nothing, so the silhouette is the TV's frame,
the antenna and the words. Python 3 with Pillow; Chrome draws the SVG. Both are written 240 px tall, as the others.
"""
import os, re, subprocess, sys, tempfile
from PIL import Image
C = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
svg, icon = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
dest = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app', 'logos')
tmp = tempfile.mkdtemp()

# CANAL+: the first path is the black box; the white lettering is drawn after it.
text = re.sub(r'<path\s+d="M 49\.313659,391\.59193[^>]*?id="path25"[^>]*?/>', '', open(svg).read(), flags=re.S)
assert 'path25' not in text
nobox = os.path.join(tmp, 'canalplus-text.svg')
open(nobox, 'w').write(text)
html = os.path.join(tmp, 'c.html')
# The lettering is 160/240 of the box: drawn 360 px tall it is 240.
open(html, 'w').write('<html><body style="margin:20px;background:transparent"><img src="file://%s" style="height:360px"></body></html>' % nobox)
raw = os.path.join(tmp, 'c.png')
subprocess.run([C, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=2400,420',
                '--allow-file-access-from-files', '--user-data-dir=' + tempfile.mkdtemp(), '--screenshot=' + raw, 'file://' + html], stderr=subprocess.DEVNULL)
a = Image.open(raw).convert('RGBA').split()[3]
out = Image.new('RGBA', a.size, (255, 255, 255, 0))
out.putalpha(a)
out = out.crop(out.getbbox())
out = out.resize((round(out.width * 240 / out.height), 240), Image.LANCZOS)
out.save(os.path.join(dest, 'canalplus.png'), optimize=True)
print('canalplus', out.size)

# Smart IPTV: enlarged first, so that the edge of the lettering is smooth, then what is light (the frame, the
# antenna, the words, grey to white) is made white, the red, the blue and the black nothing.
g = Image.open(icon).convert('RGB').resize((768, 768), Image.LANCZOS).convert('L')
lo, hi = 150, 195
out = Image.new('RGBA', g.size, (255, 255, 255, 0))
out.putalpha(g.point(lambda l: int(min(max((l - lo) / float(hi - lo), 0), 1) * 255)))
out = out.crop(out.getbbox())
out = out.resize((round(out.width * 240 / out.height), 240), Image.LANCZOS)
out.save(os.path.join(dest, 'siptv.png'), optimize=True)
print('siptv', out.size)

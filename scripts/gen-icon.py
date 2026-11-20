"""Renders the app icon / adaptive icon / splash as PNGs with no dependencies (pure-python raster).

Run: python3 scripts/gen-icon.py
Composition matches the title poster: gold sun, vermilion/cobalt signal band at -15°, ringed planet.
"""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "mobile", "assets")
INK = (0x12, 0x18, 0x29)
GOLD = (0xF4, 0xB6, 0x3F)
GOLD_D = (0xA8, 0x74, 0x1A)
VERM = (0xE8, 0x55, 0x2D)
COBALT = (0x3D, 0x8F, 0xD9)
DARK = (0x15, 0x1B, 0x2E)
PLANET = (0xDD, 0xBE, 0x86)
PLANET_SH = (0x7E, 0x63, 0x37)
BAND1 = (0xEA, 0xD2, 0xA0)
BAND2 = (0xC4, 0x9F, 0x5F)
RING = (0xEB, 0xD7, 0xA8)

def png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(data)

def scene(u, v, transparent_bg=False):
    """Colour at normalised coords (0..1). Returns RGBA."""
    col = None if transparent_bg else INK
    # sun disc with halftone
    dx, dy = u - 0.62, v - 0.40
    if dx * dx + dy * dy < 0.30 ** 2:
        col = GOLD
        gx, gy = (u * 40) % 1 - 0.5, (v * 40) % 1 - 0.5
        if (gx * gx + gy * gy) < 0.08 and (dx + dy) > 0.05:
            col = GOLD_D
    # band rotated -15deg around centre
    a = math.radians(15)
    y_rot = (v - 0.5) * math.cos(a) + (u - 0.5) * math.sin(a)
    if 0.06 < y_rot < 0.14:
        col = VERM
    elif 0.14 <= y_rot < 0.165:
        col = DARK
    elif 0.165 <= y_rot < 0.225:
        col = COBALT
    # ringed planet
    cx, cy, r = 0.36, 0.50, 0.20
    px, py = u - cx, v - cy
    # rotate into ring frame
    rx = px * math.cos(a) - py * math.sin(a)
    ry = px * math.sin(a) + py * math.cos(a)
    ring_d = (rx / (r * 1.85)) ** 2 + (ry / (r * 0.5)) ** 2
    in_ring = 0.78 < ring_d < 1.0
    in_planet = px * px + py * py < r * r
    if in_ring and ry < 0 and not in_planet:
        col = RING  # back half visible outside planet
    if in_planet:
        band = math.floor((ry / r + 1) * 3)  # stripes
        col = PLANET if band % 2 == 0 else (BAND1 if band in (1, 5) else BAND2)
        sx, sy = px - r * 0.75, py - r * 0.75
        if sx * sx + sy * sy < (r * 1.0) ** 2:
            col = PLANET_SH
    if in_ring and ry >= 0:
        col = RING
    if col is None:
        return (0, 0, 0, 0)
    return (*col, 255)

def render(path, size, pad=0.0, transparent_bg=False, ss=2):
    rows = []
    for j in range(size):
        row = []
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(ss):
                for si in range(ss):
                    u = ((i + (si + 0.5) / ss) / size - pad) / (1 - 2 * pad)
                    v = ((j + (sj + 0.5) / ss) / size - pad) / (1 - 2 * pad)
                    c = scene(u, v, transparent_bg) if 0 <= u <= 1 and 0 <= v <= 1 else ((0, 0, 0, 0) if transparent_bg else (*INK, 255))
                    for k in range(4):
                        acc[k] += c[k]
            n = ss * ss
            row.extend(int(x / n) for x in acc)
        rows.append(row)
    png(path, size, size, rows)

os.makedirs(OUT, exist_ok=True)
render(os.path.join(OUT, "icon.png"), 1024, ss=1)
render(os.path.join(OUT, "adaptive-icon.png"), 1024, pad=0.17, transparent_bg=True, ss=1)
render(os.path.join(OUT, "splash-icon.png"), 512, pad=0.05, transparent_bg=True, ss=2)
render(os.path.join(OUT, "favicon.png"), 64, ss=3)
print("ok")

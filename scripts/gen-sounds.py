"""Synthesises the game's small sound set (soft mallet/synth family) into apps/mobile/assets/sounds.

Run: python3 scripts/gen-sounds.py  — no dependencies, deterministic output.
"""
import math, os, random, struct, wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "mobile", "assets", "sounds")

def mallet(freq, dur, amp=0.5, decay=8.0, bright=0.25):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        env = math.exp(-decay * t) * min(1.0, t * 400)
        v = math.sin(2 * math.pi * freq * t) + bright * math.sin(2 * math.pi * freq * 2.76 * t) * math.exp(-decay * 3 * t)
        out.append(amp * env * v)
    return out

def noise(dur, amp=0.3, decay=30.0, seed=1):
    rnd = random.Random(seed)
    n = int(RATE * dur)
    out, prev = [], 0.0
    for i in range(n):
        t = i / RATE
        prev = 0.6 * prev + 0.4 * (rnd.random() * 2 - 1)
        out.append(amp * prev * math.exp(-decay * t))
    return out

def mix(*parts):
    """parts: (offset_seconds, samples)"""
    length = max(int(o * RATE) + len(s) for o, s in parts)
    buf = [0.0] * length
    for o, s in parts:
        k = int(o * RATE)
        for i, v in enumerate(s):
            buf[k + i] += v
    return buf

def save(name, samples):
    peak = max(1e-9, max(abs(x) for x in samples))
    scale = min(1.0, 0.9 / peak)
    with wave.open(os.path.join(OUT, name + ".wav"), "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x * scale)) * 32767)) for x in samples))

C5, E5, G5, C6, A4, F4, D4 = 523.25, 659.25, 783.99, 1046.5, 440.0, 349.23, 293.66

save("tap", mix((0, mallet(880, 0.08, 0.35, 45, 0.1))))
save("tick", mix((0, mallet(1320, 0.05, 0.25, 70, 0.0))))
save("correct", mix((0, mallet(E5, 0.35, 0.5, 9)), (0.09, mallet(C6, 0.5, 0.5, 7))))
save("wrong", mix((0, mallet(D4, 0.4, 0.55, 10, 0.05)), (0.07, mallet(F4 * 0.94, 0.35, 0.35, 12, 0.05)), (0, noise(0.12, 0.15, 40))))
# capture: a rising three-note "flag planted" figure with a soft whoosh, ~1 s long
save("capture", mix((0, noise(0.45, 0.22, 7, 3)), (0.02, mallet(C5, 0.6, 0.35, 5)), (0.12, mallet(E5, 0.6, 0.35, 5)), (0.24, mallet(G5, 0.9, 0.4, 3.5)), (0.24, mallet(C6, 0.9, 0.2, 3.5, 0.1))))
save("shield", mix((0, noise(0.4, 0.5, 9, 5)), (0, mallet(110, 0.5, 0.6, 6, 0.4))))
save("win", mix((0, mallet(C5, 0.5, 0.45, 5)), (0.14, mallet(E5, 0.5, 0.45, 5)), (0.28, mallet(G5, 0.6, 0.45, 4)), (0.46, mallet(C6, 0.9, 0.5, 3))))
save("lose", mix((0, mallet(G5 / 2, 0.5, 0.45, 5)), (0.18, mallet(E5 / 2, 0.5, 0.45, 5)), (0.36, mallet(C5 / 2 * 0.94, 0.9, 0.5, 3))))
save("reveal", mix((0, noise(0.25, 0.25, 14, 7)), (0.02, mallet(A4 * 2, 0.15, 0.2, 25, 0.0))))
print("ok")

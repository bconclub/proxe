#!/usr/bin/env python3
"""
Generate the dashboard notification sounds (the GOOD set).

Proper notification-sound synthesis (as Slack/iOS use), not bare sine beeps:
  - mallet/marimba & glass voices: inharmonic partials of a struck bar/bell
  - a short filtered-noise strike transient (the "tap") at onset
  - a subtle downward pitch glide on attack
  - one-pole lowpass to kill digital harshness
  - a small Schroeder reverb tail for air
  - gentle tanh soft-clip + normalize

Chosen mapping (audition the full set with gen_sound_candidates.py):
  update.wav       <- "D" soft pop       (tap + warm note, subtler sibling)

Only the "update" cue is synthesized here. New-lead and page-ready both use
custom team-supplied mp3s (public/sounds/new-lead.mp3, public/sounds/page-load.mp3;
see SOUND_FILES in sound-prefs.ts).

Re-run after tweaking; pure stdlib, deterministic, no external deps.
"""
import math, struct, wave, os

RATE = 44100

class LCG:
    """Tiny deterministic PRNG so noise transients are reproducible."""
    def __init__(self, seed=12345): self.s = seed & 0x7fffffff
    def rand(self):
        self.s = (1103515245 * self.s + 12345) & 0x7fffffff
        return self.s / 0x3fffffff - 1.0

def one_pole_lp(buf, cutoff):
    a = math.exp(-2 * math.pi * cutoff / RATE)
    y = 0.0; out = []
    for x in buf:
        y = (1 - a) * x + a * y
        out.append(y)
    return out

def reverb(buf, wet=0.22):
    """Schroeder reverb: 4 parallel combs + 2 series allpass. O(n)."""
    n = len(buf)
    combs = [(1557, 0.82), (1617, 0.81), (1491, 0.83), (1422, 0.80)]
    acc = [0.0] * n
    for d, fb in combs:
        dl = [0.0] * d; idx = 0
        for i in range(n):
            y = dl[idx]
            dl[idx] = buf[i] + y * fb
            idx = idx + 1 if idx + 1 < d else 0
            acc[i] += y
    acc = [v * 0.25 for v in acc]
    for d in (225, 556):
        dl = [0.0] * d; idx = 0; g = 0.5; tmp = [0.0] * n
        for i in range(n):
            bo = dl[idx]
            y = -acc[i] + bo
            dl[idx] = acc[i] + bo * g
            idx = idx + 1 if idx + 1 < d else 0
            tmp[i] = y
        acc = tmp
    return [(1 - wet) * d + wet * w for d, w in zip(buf, acc)]

def voice(freq, dur, partials, amp=0.6, glide=0.0, attack=0.003,
          noise_amp=0.0, noise_dur=0.010, seed=1):
    """One struck-bar/bell note."""
    n = int(RATE * dur); lcg = LCG(seed); out = []
    for i in range(n):
        t = i / RATE
        f = freq * (1 + glide * math.exp(-t * 45))
        s = 0.0
        for ratio, gain, dk in partials:
            s += gain * math.sin(2 * math.pi * f * ratio * t) * math.exp(-dk * t)
        env = min(1.0, t / attack) if attack > 0 else 1.0
        nz = 0.0
        if noise_amp and t < noise_dur:
            nz = lcg.rand() * noise_amp * math.exp(-t / (noise_dur / 3))
        out.append((s * amp + nz) * env)
    return out

def mix(layers):
    length = max(off + len(b) for off, b in layers)
    acc = [0.0] * length
    for off, b in layers:
        for i, v in enumerate(b):
            acc[off + i] += v
    return acc

def finalize(buf, cutoff=8500, wet=0.22, peak=0.85, fade_ms=14):
    buf = one_pole_lp(buf, cutoff)
    buf = reverb(buf, wet=wet)
    buf = [math.tanh(v * 1.3) for v in buf]
    m = max(1e-9, max(abs(v) for v in buf))
    buf = [v / m * peak for v in buf]
    k = int(RATE * fade_ms / 1000)
    for i in range(k):
        buf[-1 - i] *= i / k
    return buf

def write(path, buf):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32767)) for v in buf))
    print(f"wrote {os.path.basename(path):18s} {len(buf)/RATE:.2f}s")

MARIMBA = [(1.0, 1.0, 5.5), (3.93, 0.42, 10), (9.2, 0.14, 18), (2.0, 0.10, 8)]
GLASS   = [(1.0, 1.0, 3.2), (2.76, 0.45, 5), (5.40, 0.22, 7), (8.93, 0.08, 9)]

C6 = 1046.5

def build_update():     # "D" soft pop — tap + warm note, quieter sibling
    pop = voice(180, 0.18, [(1.0, 1.0, 22), (2.0, 0.3, 30)], amp=0.7, glide=0.5,
                noise_amp=0.25, noise_dur=0.018, seed=9)
    raw = mix([(0, pop), (int(RATE * 0.05), voice(C6, 0.5, GLASS, amp=0.4, seed=13))])
    return finalize(raw, cutoff=8000, wet=0.18, peak=0.7)

def main():
    out = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "sounds"))
    write(os.path.join(out, "update.wav"), build_update())
    # new-lead and ready/page-load are custom mp3s, not generated here.

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generate the dashboard notification sounds (soft glass-bell family).

Outputs 44.1kHz / 16-bit mono WAVs into ../public/sounds/:
  - new-lead.wav     : rising two-note glass bell (E5 -> A5), warm, premium, ~0.7s
  - update.wav       : single soft glass note (C5), gentler/quieter sibling, ~0.4s
  - ready.wav        : home-page "loaded" cue — one calm low-high shimmer, ~0.5s
  - notification.wav : alias of new-lead (kept so the orphan path still resolves)

Re-run after tweaking the constants below; no external deps (stdlib only).
"""
import math, struct, wave, os

RATE = 44100

def bell(freq, dur, amp=0.5, attack=0.004):
    """A struck-bell tone: a few slightly-inharmonic partials under an
    exponential decay, with a tiny attack ramp so the onset doesn't click."""
    # (partial ratio, relative gain, decay rate) — higher partials die faster.
    partials = [(1.00, 1.00, 5.0), (2.01, 0.45, 6.5), (3.00, 0.22, 8.0), (4.20, 0.12, 10.0)]
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        s = 0.0
        for ratio, gain, dk in partials:
            s += gain * math.sin(2 * math.pi * freq * ratio * t) * math.exp(-dk * t)
        env = min(1.0, t / attack) if attack > 0 else 1.0      # soft onset
        out.append(s * env * amp)
    return out

def mix(layers):
    """Overlay (frame_offset, samples) layers onto one buffer."""
    length = max(off + len(buf) for off, buf in layers)
    acc = [0.0] * length
    for off, buf in layers:
        for i, v in enumerate(buf):
            acc[off + i] += v
    return acc

def normalize(buf, peak=0.7):
    m = max(1e-9, max(abs(v) for v in buf))
    return [v / m * peak for v in buf]

def fade_tail(buf, ms=12):
    """Short linear fade-out so the decay tail can't end on a click."""
    k = int(RATE * ms / 1000)
    for i in range(k):
        buf[-1 - i] *= i / k
    return buf

def write_wav(path, buf):
    buf = fade_tail(normalize(buf))
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32767)) for v in buf))
    print(f"wrote {path}  ({len(buf)/RATE:.2f}s)")

E5, A5, C5, G4, C6 = 659.25, 880.0, 523.25, 392.0, 1046.5

def main():
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "sounds"))

    # new-lead: ding..dong, second note enters as the first is decaying.
    gap = int(RATE * 0.14)
    new_lead = mix([(0, bell(E5, 0.55, amp=0.5)),
                    (gap, bell(A5, 0.55, amp=0.55))])
    write_wav(os.path.join(out_dir, "new-lead.wav"), new_lead)
    write_wav(os.path.join(out_dir, "notification.wav"), list(new_lead))  # keep orphan path valid

    # update: one calm, lower, quieter note — clearly the softer sibling.
    update = bell(C5, 0.42, amp=0.4)
    write_wav(os.path.join(out_dir, "update.wav"), update)

    # ready: home-page loaded cue — gentle low->high shimmer, distinct from the alerts.
    ready = mix([(0, bell(G4, 0.45, amp=0.35)),
                 (int(RATE * 0.10), bell(C6, 0.45, amp=0.30))])
    write_wav(os.path.join(out_dir, "ready.wav"), ready)

if __name__ == "__main__":
    main()

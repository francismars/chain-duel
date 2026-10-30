"""Wall cues: one rising pluck while the edge is lit, then a hit as it steps."""
from array import array
from pathlib import Path
import math
import random

rate = 44100
root = Path(__file__).resolve().parents[2] / 'public' / 'sound'


def write(name: str, samples: array) -> None:
    path = root / name
    with wave_open(path) as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())
    peak = max(abs(sample) for sample in samples) / 32767
    print(f'{path.name} {len(samples) / rate:.2f}s peak {peak:.2f}')


def wave_open(path: Path):
    import wave

    return wave.open(str(path), 'wb')


def pcm(sample: float) -> int:
    return int(max(-1.0, min(1.0, sample)) * 32767)


def warning() -> array:
    """One pluck that holds for the lit edge and rises into the hit."""
    length = 1.0
    start = 73.42
    end = 196.00
    phase = 0.0
    harmonic = 0.0
    samples = array('h')
    for i in range(round(rate * length)):
        t = i / rate
        glide = t / length
        frequency = start * ((end / start) ** glide)
        phase = (phase + 2 * math.pi * frequency / rate) % (2 * math.pi)
        harmonic = (harmonic + 4 * math.pi * frequency / rate) % (2 * math.pi)
        tone = math.sin(phase) + 0.28 * math.sin(harmonic)
        attack = min(1.0, t / 0.03)
        swell = 0.75 + 0.25 * glide
        samples.append(pcm(math.tanh(tone) * attack * swell * 0.2))
    return samples


def close() -> array:
    """A heavy dry impact. The mass lands and stops, with no crack and no ring."""
    length = 0.24
    phase = 0.0
    mid = 0.0
    dull = 0.0
    rng = random.Random(3)
    samples = array('h')
    for i in range(round(rate * length)):
        t = i / rate
        # Drops as the weight settles, then is gone before it can boing.
        frequency = 64 + 36 * math.exp(-t * 18)
        phase = (phase + 2 * math.pi * frequency / rate) % (2 * math.pi)
        mid = (mid + 2 * math.pi * 150 / rate) % (2 * math.pi)
        weight = math.sin(phase) * math.exp(-t * 9)
        presence = math.sin(mid) * math.exp(-t * 28) * 0.35
        dull += 0.06 * (rng.uniform(-1, 1) - dull)
        body = dull * math.exp(-t * 10) * 0.3
        samples.append(pcm((weight + presence + body) * 0.64))
    return samples


write('chain_duel_warn.wav', warning())
write('chain_duel_shrink.wav', close())

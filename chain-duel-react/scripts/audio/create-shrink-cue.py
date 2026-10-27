"""Generate a short electronic contraction cue using Python 3 and ffmpeg."""
from array import array
from pathlib import Path
import math
import random
import subprocess
import tempfile
import wave

rate = 44100
length = 0.72
rng = random.Random(17)
samples = array('h')
phase = 0.0
filtered_noise = 0.0
for i in range(round(rate * length)):
    t = i / rate
    # Fast downward sweep folds into a low, percussive synth hit.
    frequency = 85 + 1450 * math.exp(-t * 14)
    phase += 2 * math.pi * frequency / rate
    envelope = min(1, t / 0.006) * math.exp(-t * 8)
    tone = (math.sin(phase) + 0.22 * math.sin(phase * 2)) * envelope
    noise = rng.uniform(-1, 1)
    filtered_noise += 0.22 * (noise - filtered_noise)
    air = filtered_noise * min(1, t / 0.012) * math.exp(-t * 12)
    fade = min(1, (length - t) / 0.08)
    value = (tone * 0.48 + air * 0.55) * fade
    samples.extend([int(value * 24000), int(value * 24000)])

output = Path(__file__).resolve().parents[2] / 'public/sound/chain_duel_shrink.m4a'
with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / 'shrink.wav'
    with wave.open(str(source), 'wb') as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(source),
                    '-af', 'aecho=0.8:0.8:61|109:0.22|0.1,afade=t=out:st=0.55:d=0.28',
                    '-c:a', 'aac', '-b:a', '192k', str(output)], check=True)
print(output)

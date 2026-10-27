"""Synth voices following the strongest bass note in each four-beat phrase."""
from array import array
import math
import subprocess
import wave


def phrase_notes(source, duration):
    rate = 4000
    signal = array('f', subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(source), '-ac', '1', '-ar', str(rate),
        '-f', 'f32le', '-']))
    notes = []
    for bar in range(32):
        energies = {}
        for midi in range(36, 61):
            frequency = 440 * 2 ** ((midi - 69) / 12)
            coefficient = 2 * math.cos(2 * math.pi * frequency / rate)
            energy = 0
            for beat in range(4):
                start = int((bar * 4 + beat + 0.25) * duration / 128 * rate)
                window = signal[start:start + 800]
                a = b = 0
                for i, value in enumerate(window):
                    current = value * (0.5 - 0.5 * math.cos(2 * math.pi * i / 799)) + coefficient * a - b
                    b, a = a, current
                energy += a * a + b * b - coefficient * a * b
            energies[midi] = energy
        notes.append(max(energies, key=energies.get))
    print('Synth phrase notes:', notes, flush=True)
    return notes


def render_voice(theme, notes, duration, output):
    rate = 22050
    count = round(duration * rate)
    samples = array('h')
    phase = 0.0
    detune_phase = 0.0
    beat_rate = 128 / duration
    for i in range(count):
        t = i / rate
        beat = t * beat_rate
        bar = min(31, int(beat / 4))
        root = 440 * 2 ** ((notes[bar] - 69) / 12)
        if theme == 'build':
            frequency = root / 2
            position = beat % 1
            envelope = min(1, position * 65) * math.exp(-position * 5)
        elif theme == 'pressure':
            frequency = root * [1, 2, 1, 4, 2, 1, 2, 4][int(beat * 2) % 8]
            position = (beat * 2) % 1
            envelope = min(1, position * 50) * math.exp(-position * 4)
        elif theme == 'tension':
            frequency = root * 2
            position = (beat % 4) / 4
            envelope = math.sin(math.pi * position) ** 0.6
        else:
            frequency = root * [2, 4, 2, 2, 4, 2, 8, 4][int(beat * 4) % 8]
            position = (beat * 4) % 1
            envelope = min(1, position * 35) * math.exp(-position * 2.7)
        phase = (phase + 2 * math.pi * frequency / rate) % (2 * math.pi)
        detune_phase = (detune_phase + 2 * math.pi * frequency * 1.004 / rate) % (2 * math.pi)
        if theme == 'build':
            left = right = math.sin(phase) + 0.23 * math.sin(2 * phase)
        elif theme == 'pressure':
            left = math.sin(phase + 1.8 * math.exp(-position * 6) * math.sin(2 * phase))
            right = left * 0.85 + math.sin(detune_phase) * 0.15
        elif theme == 'tension':
            left = sum(math.sin(phase * h) / h ** 1.5 for h in range(1, 6))
            right = sum(math.sin(detune_phase * h) / h ** 1.5 for h in range(1, 6))
        else:
            left = math.tanh(1.6 * (math.sin(phase) + 0.35 * math.sin(3 * phase)))
            right = math.tanh(1.6 * (math.sin(detune_phase) + 0.35 * math.sin(3 * detune_phase)))
        fade = min(1, t / 0.03, (duration - t) / 0.08)
        for value in (left, right):
            samples.append(int(value * envelope * fade * 11000))
    with wave.open(str(output), 'wb') as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())

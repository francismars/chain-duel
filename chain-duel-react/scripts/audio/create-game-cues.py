"""Rebuild the game cues with Python 3 and ffmpeg; no third-party Python packages."""
from pathlib import Path
from array import array
import math
import random
import tempfile
import wave
import subprocess
import sys
import runpy

sound = Path(__file__).resolve().parents[2] / 'public' / 'sound'


def rebuild_pressure_themes():
    source = sound / 'chain_duel_produced_game.m4a'
    duration = float(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=duration', '-of', 'csv=p=0', str(source)
    ], text=True).strip())
    # Octave shifts retain the source harmony; tempo compensation retains its timeline.
    # Integer pulse counts fit the full loop, so every theme wraps on the same beat.
    beat = 128 / duration
    pressure_themes = {
        'build': ('aresample=44100,asetrate=22050,aresample=44100,atempo=2,'
                  'highpass=f=45,lowpass=f=310,'
                  f"aeval='val(ch)*(0.12+0.88*exp(-9*mod(t*{beat},1)))':c=same"),
        'pressure': ('aresample=44100,asetrate=88200,aresample=44100,atempo=0.5,'
                     'highpass=f=280,lowpass=f=2600,'
                     f"aeval='val(ch)*(0.06+0.94*exp(-12*mod(t*{beat*2},1)))':c=same,"
                     'aecho=0.8:0.85:170|341:0.35|0.18'),
        'tension': ('aresample=44100,asetrate=88200,aresample=44100,atempo=0.5,'
                    'highpass=f=900,lowpass=f=7000,'
                    'aphaser=in_gain=0.7:out_gain=0.8:delay=3:decay=0.4:speed=0.5,'
                    'aecho=0.65:0.8:227|454|681:0.5|0.35|0.22,'
                    f'tremolo=f={beat/4}:d=0.8'),
        'critical': ('highpass=f=350,lowpass=f=4800,'
                     'acrusher=bits=7:mix=0.65,asoftclip=type=tanh:threshold=0.6,'
                     f"aeval='val(ch)*(0.04+0.96*exp(-16*mod(t*{beat*4},1)))':c=same,"
                     'aecho=0.8:0.8:57|114:0.3|0.15'),
    }
    # Add new synthesized voices, rather than relying on effects on the original alone.
    synth = runpy.run_path(str(Path(__file__).with_name('pressure-synths.py')))
    phrase = synth['phrase_notes'](source, duration)
    with tempfile.TemporaryDirectory() as directory:
        for theme, treatment in pressure_themes.items():
            voice = Path(directory) / f'{theme}.wav'
            synth['render_voice'](theme, phrase, duration, voice)
            space = {
                'build': 'lowpass=f=500',
                'pressure': 'aecho=0.8:0.8:170|341:0.35|0.18',
                'tension': 'aecho=0.7:0.8:227|454|681|909:0.5|0.4|0.3|0.2,lowpass=f=5500',
                'critical': 'aecho=0.8:0.8:114|227:0.3|0.2,lowpass=f=6500',
            }[theme]
            filters = (
                f'[0:a]{treatment},volume=0.35[texture];'
                f'[1:a]{space},volume=1.6[voice];'
                '[texture][voice]amix=inputs=2:normalize=0,'
                'loudnorm=I=-18:TP=-3:LRA=9,aresample=44100,apad,'
                f'atrim=duration={duration},afade=t=in:d=0.08,'
                f'afade=t=out:st={duration - 0.1}:d=0.1[out]'
            )
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(source),
                            '-i', str(voice), '-filter_complex', filters, '-map', '[out]',
                            '-c:a', 'aac', '-b:a', '192k',
                            str(sound / f'chain_duel_{theme}.m4a')], check=True)
            print(f'Rebuilt {theme} with synth voice', flush=True)


def reverb(signal, offset, rate):
    # Four damped feedback combs and two all-pass diffusers produce a dense
    # 2.6-second decay, rather than a handful of audible echo repeats.
    wet = array('f', [0]) * len(signal)
    for delay in (0.0297, 0.0371, 0.0411, 0.0437):
        size = round((delay + offset) * rate)
        buffer = [0.0] * size
        feedback = 10 ** (-3 * (delay + offset) / 2.6)
        damped = 0.0
        for i, value in enumerate(signal):
            slot = i % size
            reflected = buffer[slot]
            damped = reflected * 0.65 + damped * 0.35
            buffer[slot] = value + damped * feedback
            wet[i] += reflected * 0.25
    for delay in (0.005, 0.0017):
        size = round((delay + offset / 2) * rate)
        buffer = [0.0] * size
        for i, value in enumerate(wet):
            slot = i % size
            diffused = buffer[slot] - value * 0.5
            buffer[slot] = value + diffused * 0.5
            wet[i] = diffused
    return wet


def rebuild_ending():
    # Own resolving phrase. Block-found keeps MAINNET_BLOCK.aac.
    # A low pulse, a fifth, then a soft open chord. Neutral for both players.
    rate = 44100
    length = 4.6
    count = round(rate * length)
    rng = random.Random(3)
    notes = (
        # start, freq, attack, decay, gain, voice
        (0.00, 55.00, 0.004, 6.5, 0.62, 'pluck'),
        (0.05, 110.00, 0.010, 3.4, 0.40, 'pluck'),
        (0.34, 164.81, 0.012, 2.8, 0.36, 'pluck'),
        (0.66, 110.00, 0.20, 0.72, 0.30, 'pad'),
        (0.66, 164.81, 0.26, 0.64, 0.24, 'pad'),
        (0.70, 220.00, 0.32, 0.70, 0.16, 'pad'),
        (0.78, 329.63, 0.40, 0.85, 0.06, 'pad'),
    )
    phases = [[0.0, 0.0] for _ in notes]
    dry_left = array('f', [0.0]) * count
    dry_right = array('f', [0.0]) * count
    noise_state = 0.0
    for i in range(count):
        t = i / rate
        left = right = 0.0
        for index, (start, freq, attack, decay, gain, voice) in enumerate(notes):
            dt = t - start
            if dt < 0:
                continue
            env = min(1.0, dt / attack) * math.exp(-dt * decay)
            settled = freq * (1 + 0.012 * math.exp(-dt * 14))
            step = 2 * math.pi / rate
            phases[index][0] = (phases[index][0] + step * settled) % (2 * math.pi)
            phases[index][1] = (phases[index][1] + step * settled * 1.004) % (2 * math.pi)
            pair = []
            for phase in phases[index]:
                if voice == 'pluck':
                    sample = math.sin(phase) + 0.28 * math.sin(2 * phase) * math.exp(-dt * 9)
                else:
                    sample = sum(math.sin(phase * harmonic) / harmonic for harmonic in (1, 2, 3))
                pair.append(math.tanh(sample))
            left += pair[0] * env * gain
            right += pair[1] * env * gain
        noise_state += 0.16 * (rng.uniform(-1, 1) - noise_state)
        burst = noise_state * min(1.0, t / 0.003) * math.exp(-t * 18) * 0.28
        dry_left[i] = left + burst
        dry_right[i] = right + burst * 0.72

    wet_left = reverb(dry_left, 0, rate)
    wet_right = reverb(dry_right, 0.0011, rate)
    samples = array('h')
    for i in range(len(dry_left)):
        fade = min(1, (len(dry_left) - i) / (rate * 0.75))
        for dry, wet in ((dry_left[i], wet_left[i]), (dry_right[i], wet_right[i])):
            samples.append(int(math.tanh(dry + 0.38 * wet) * fade * 28000))
    output = sound / 'chain_duel_end.wav'
    with wave.open(str(output), 'wb') as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())
    legacy = sound / 'chain_duel_end.m4a'
    if legacy.exists():
        legacy.unlink()
    print(output, flush=True)


if __name__ == '__main__':
    if '--end-only' not in sys.argv:
        rebuild_pressure_themes()
    if '--themes-only' not in sys.argv:
        rebuild_ending()

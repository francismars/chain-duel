"""Rebuild the game cues with Python 3 and ffmpeg; no third-party Python packages."""
from pathlib import Path
from array import array
import math
import tempfile
import wave
import subprocess
import sys

sound = Path(__file__).resolve().parents[2] / 'public' / 'sound'
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
import runpy
synth = runpy.run_path(str(Path(__file__).with_name('pressure-synths.py')))
notes = synth['phrase_notes'](source, duration)
with tempfile.TemporaryDirectory() as directory:
    for theme, treatment in pressure_themes.items():
        voice = Path(directory) / f'{theme}.wav'
        synth['render_voice'](theme, notes, duration, voice)
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

if '--themes-only' in sys.argv:
    sys.exit(0)

# End cue: the MAINNET_BLOCK recording with a restrained octave-down body,
# slight time stretch, and a diffuse stereo tail. The game loop stays separate.
rate = 44100
length = 6.8
block = sound / 'MAINNET_BLOCK.aac'
variation = (
    '[0:a]aresample=44100,asplit=2[main][body];'
    '[main]atempo=0.96,volume=0.9[direct];'
    '[body]asetrate=22050,aresample=44100,atempo=2,atempo=0.96,'
    'lowpass=f=650,volume=0.18[low];'
    '[direct][low]amix=inputs=2:normalize=0,highpass=f=40,'
    f'apad,atrim=duration={length},afade=t=in:d=0.008[out]'
)
raw = subprocess.check_output([
    'ffmpeg', '-v', 'error', '-i', str(block), '-filter_complex', variation,
    '-map', '[out]', '-ac', '2', '-ar', str(rate), '-f', 'f32le', '-'
])
interleaved = array('f', raw)
dry_left = interleaved[0::2]
dry_right = interleaved[1::2]


def reverb(signal, offset):
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


wet_left = reverb(dry_left, 0)
wet_right = reverb(dry_right, 0.0011)
samples = array('h')
for i in range(len(dry_left)):
    fade = min(1, (len(dry_left) - i) / (rate * 0.75))
    for dry, wet in ((dry_left[i], wet_left[i]), (dry_right[i], wet_right[i])):
        samples.append(int(math.tanh(0.78 * dry + 0.90 * wet) * fade * 30000))
temp = tempfile.TemporaryDirectory()
melody = Path(temp.name) / 'melody.wav'
with wave.open(str(melody), 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(samples.tobytes())

subprocess.run([
    'ffmpeg', '-y', '-v', 'error', '-i', str(melody),
    '-af', 'loudnorm=I=-20:TP=-5:LRA=7,aresample=44100,afade=t=out:st=5.6:d=1.2',
    '-c:a', 'aac', '-b:a', '192k', str(sound / 'chain_duel_end.m4a')
], check=True)
temp.cleanup()

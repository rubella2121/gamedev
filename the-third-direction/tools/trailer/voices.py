"""The trailer's voices, from the raw text-to-speech lines (tts/lines/*.wav, made with Kokoro: see README.md).
   python3 tools/trailer/voices.py <ttsDir> <outDir>
Each character gets its own treatment (ffmpeg): the narrator close and warm; Mother and Father far away, as remembered; the
Blob small and high; the Fourth very low, doubled an octave under, torn, in a huge space, with its whisper ahead of it."""
import os, subprocess, sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def ff(inp, filt, dst):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', inp, '-af', filt, '-ar', '48000', '-ac', '2', dst], check=True)

NARR = 'apad=pad_dur=0.6,highpass=f=70,bass=g=4:f=110,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,aecho=0.85:0.4:35|62:0.16|0.1,volume=1.6'
FAR = 'apad=pad_dur=1.6,highpass=f=120,lowpass=f=8500,aecho=0.8:0.75:110|230|370:0.3|0.2|0.12,volume=1.4'
BLOB = 'apad=pad_dur=1,rubberband=pitch=1.3:formant=preserved,highpass=f=150,aecho=0.8:0.6:60|130:0.2|0.12,volume=1.5'
FOURTH = 'apad=pad_dur=2.5,rubberband=pitch=0.66,lowpass=f=5200,acompressor=threshold=-24dB:ratio=6,aecho=0.8:0.9:180|420|780:0.45|0.35|0.25,volume=2.2'
UNDER = 'apad=pad_dur=2,rubberband=pitch=0.42,lowpass=f=1800,aecho=0.8:0.9:200|500:0.4|0.3,volume=1.7'
WHISPER = 'apad=pad_dur=2.5,rubberband=pitch=1.12,highpass=f=1800,aecho=0.8:0.95:300|700|1100:0.5|0.4|0.3,volume=0.9'

for f in sorted(os.listdir(src)):
    n = f[:-4]
    p = os.path.join(src, f)
    if n.startswith('n'):
        ff(p, NARR, f'{out}/{n}.wav')
    elif n[0] in 'mf':
        ff(p, FAR, f'{out}/{n}.wav')
    elif n.startswith('b'):
        ff(p, BLOB, f'{out}/{n}.wav')
    elif n.startswith('x'):
        ff(p, FOURTH, f'{out}/{n}.wav')
        ff(p, UNDER, f'{out}/{n}u.wav')
    elif n.startswith('w'):
        ff(p, WHISPER, f'{out}/{n}.wav')
    print(n)

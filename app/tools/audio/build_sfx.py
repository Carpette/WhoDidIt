import numpy as np, os, glob, json, subprocess, sys
from scipy.io import wavfile
from scipy.signal import resample_poly, fftconvolve
import render as R

FS = R.FS
REV_GAIN = 0.15          # ancien : 0.26 — salle plus nette, direct/réverbéré plus marqué
PEXP     = 1.4           # ancien : 1.0 — la distance pèse davantage (sièges 1 vs 2)

SRC = "/mnt/user-data/uploads/WhoDidIt/Sounds_edit/pets"
OUT = "/home/claude/poc/sfx_v2"; os.makedirs(OUT, exist_ok=True)

def render2(sig, listener, source, n=6):
    Lp = R.seat_pos(listener, n, R.H_EARS)
    fwd = np.array([R.CENTER[0], R.CENTER[1], R.H_EARS]) - Lp; fwd[2] = 0
    fwd /= np.linalg.norm(fwd)
    Sp = R.seat_pos(source, n, R.H_SRC)
    total = int(len(sig) + 0.9*FS); out = np.zeros((total, 2))
    for ip, gain in R.images(Sp):
        az, el, d = R.local_dir(Lp, fwd, ip)
        ir = R.hrir(az, el); delay = int(d/343.0*FS)
        g = gain / max(d, 0.35)**PEXP
        wet = np.stack([fftconvolve(sig, ir[:,0])[:total-delay],
                        fftconvolve(sig, ir[:,1])[:total-delay]], axis=1)
        out[delay:delay+len(wet)] += g*wet
    rev = np.stack([fftconvolve(sig, R.TAIL[:,0]), fftconvolve(sig, R.TAIL[:,1])], axis=1)[:total]
    out[:len(rev)] += rev * REV_GAIN
    return out

def load(p):
    sr, d = wavfile.read(p); d = d.astype(np.float64)
    if d.ndim > 1: d = d.mean(axis=1)
    d /= max(np.abs(d).max(), 1)
    if sr != FS:
        from math import gcd
        g = gcd(int(sr), FS); d = resample_poly(d, FS//g, int(sr)//g)
    return d

def mp3(y, path):
    tmp = "/tmp/_x.wav"
    wavfile.write(tmp, FS, (np.clip(y, -1, 1)*32767).astype(np.int16))
    subprocess.run(["ffmpeg","-v","quiet","-y","-i",tmp,"-codec:a","libmp3lame",
                    "-b:a","128k","-ac","2",path], check=True)

ids = sys.argv[1:]
rep = {}
for i, name in enumerate(ids):
    f = f"{SRC}/{name}.wav"
    sig = load(f)
    seats = {s: render2(sig, 0, s) for s in range(1, 6)}
    peak = max(np.abs(v).max() for v in seats.values())
    for s, y in seats.items():
        mp3(y/peak*0.92, f"{OUT}/{name}_{s}.mp3")
    self_y = render2(sig, 0, 0)
    mp3(self_y/np.abs(self_y).max()*0.88, f"{OUT}/{name}_self.mp3")
    def db(a): return 20*np.log10(max(a,1e-12))
    def rms(a): return float(np.sqrt((a**2).mean()))
    y1, y2 = seats[1], seats[2]
    rep[name] = dict(
        ild60=round(db(rms(y1[:,0]))-db(rms(y1[:,1])),1),
        ild30=round(db(rms(y2[:,0]))-db(rms(y2[:,1])),1),
        lvl12=round(db(rms(y1))-db(rms(y2)),1))
    print(f"[{i+1}/{len(ids)}] {name:22s} ILD60={rep[name]['ild60']:+5.1f}  ILD30={rep[name]['ild30']:+5.1f}  niv.1-2={rep[name]['lvl12']:+4.1f} dB", flush=True)
json.dump(rep, open("/home/claude/poc/sfx_v2/report.json","w"), indent=1)

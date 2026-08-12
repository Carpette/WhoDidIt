import numpy as np, os, glob, json
from scipy.io import wavfile
from scipy.signal import resample_poly
from render import render, seat_pos, local_dir, CENTER, H_EARS, H_SRC, FS

SRC = "/mnt/user-data/uploads/WhoDidIt/Sounds_edit/pets"
OUT = "/home/claude/poc/spat"; os.makedirs(OUT, exist_ok=True)

def load(p):
    sr, d = wavfile.read(p)
    d = d.astype(np.float64)
    if d.ndim > 1: d = d.mean(axis=1)
    d /= max(np.abs(d).max(), 1)
    if sr != FS:
        from math import gcd
        g = gcd(int(sr), FS); d = resample_poly(d, FS//g, int(sr)//g)
    return d

ONLY = os.environ.get("ONLY","").split(",") if os.environ.get("ONLY") else None
files = sorted(glob.glob(f"{SRC}/*.wav"))
if ONLY: files=[f for f in files if os.path.splitext(os.path.basename(f))[0] in ONLY]
report = {}
for f in files:
    name = os.path.splitext(os.path.basename(f))[0]
    sig = load(f)
    seats = {s: render(sig, 0, s, 6) for s in range(1, 6)}
    peak = max(np.abs(v).max() for v in seats.values())
    for s, y in seats.items():
        wavfile.write(f"{OUT}/{name}__siege{s}.wav", FS, (y/peak*0.92*32767).astype(np.int16))
    # indice de localisation mesuré : ILD au siège 1 (60° à droite)
    y = seats[1]
    L, R = y[:,0], y[:,1]
    ild = 20*np.log10(np.sqrt((L**2).mean())/np.sqrt((R**2).mean()))
    hi = seats[2]; L2,R2 = hi[:,0], hi[:,1]
    ild30 = 20*np.log10(np.sqrt((L2**2).mean())/np.sqrt((R2**2).mean()))
    report[name] = dict(dur=round(len(sig)/FS,2), ild60=round(ild,1), ild30=round(ild30,1))
old = json.load(open("spat_report.json")) if os.path.exists("spat_report.json") else {}
old.update(report); json.dump(old, open("spat_report.json","w"), indent=1)
for k,v in sorted(report.items(), key=lambda x:-abs(x[1]['ild60'])):
    print(f"{k:24s} {v['dur']:5.2f}s  ILD@60°={v['ild60']:+5.1f} dB   ILD@30°={v['ild30']:+5.1f} dB")

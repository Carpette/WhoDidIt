import numpy as np, slab
from scipy.signal import fftconvolve, butter, lfilter, sosfilt
from scipy.io import wavfile

FS = 44100
H = slab.HRTF.kemar()
SRC = H.sources.vertical_polar.astype(float)

def hrir(az, el):
    az = az % 360
    d = np.abs(((SRC[:,0]-az+180)%360)-180) + 1.2*np.abs(SRC[:,1]-el)
    i = int(np.argmin(d))
    return np.array(H[i].data)   # (512,2)

# ---------- synthèse d'un pet ----------
def fart(seed=1, dur=0.85, kind="franc"):
    rng = np.random.default_rng(seed)
    n = int(dur*FS); t = np.arange(n)/FS
    if kind == "franc":   f_start, f_end, noise_mix, rough = 105, 58, 0.45, 0.35
    elif kind == "long":  f_start, f_end, noise_mix, rough = 78, 62, 0.35, 0.55
    else:                 f_start, f_end, noise_mix, rough = 150, 120, 0.85, 0.25
    # fondamentale qui descend + wobble
    wob = 1 + rough*0.25*np.sin(2*np.pi*11*t + rng.uniform(0,6)) + rough*0.15*np.sin(2*np.pi*27*t)
    f0 = (f_start + (f_end-f_start)*(t/dur)**0.7) * wob
    phase = 2*np.pi*np.cumsum(f0)/FS
    # train d'impulsions "flappy"
    buzz = np.zeros(n)
    for k in range(1, 26):
        buzz += (1.0/k**0.85) * np.sin(k*phase + rng.uniform(0,6))
    buzz /= np.abs(buzz).max()
    buzz = np.tanh(2.2*buzz)
    # souffle
    noise = rng.normal(0, 1, n)
    sos = butter(2, [180/(FS/2), 5200/(FS/2)], btype='band', output='sos')
    noise = sosfilt(sos, noise)
    gate = 0.5 + 0.5*np.sin(phase)          # le souffle suit le battement
    sig = (1-noise_mix)*buzz + noise_mix*noise*gate
    # corps résonant (cavité)
    sos2 = butter(2, [65/(FS/2), 3800/(FS/2)], btype='band', output='sos')
    sig = sosfilt(sos2, sig)
    # enveloppe : attaque nette, sputters, chute
    env = np.exp(-2.6*t/dur) * (0.75 + 0.25*np.sin(2*np.pi*13*t))
    env[:int(0.006*FS)] *= np.linspace(0,1,int(0.006*FS))
    env[-int(0.05*FS):] *= np.linspace(1,0,int(0.05*FS))
    crack = rng.normal(0,1,n)*(rng.random(n) < 0.0016)
    crack = sosfilt(butter(2,[900/(FS/2),7000/(FS/2)],btype='band',output='sos'), crack)
    sig = sig + 0.35*crack*np.exp(-2.0*t/dur)
    sig *= env
    return sig/np.abs(sig).max()*0.9

# ---------- géométrie ----------
ROOM = np.array([6.0, 5.0, 2.9])
CENTER = np.array([3.0, 2.5])
R_TABLE = 1.15
H_EARS, H_SRC = 1.15, 0.48
ABS = {'x':0.28, 'y':0.28, 'z0':0.45, 'z1':0.30}   # murs / sol / plafond

def seat_pos(i, n, h):
    a = 2*np.pi*i/n + np.pi/2
    return np.array([CENTER[0]+R_TABLE*np.cos(a), CENTER[1]+R_TABLE*np.sin(a), h])

def local_dir(listener, forward, p):
    v = p - listener
    d = np.linalg.norm(v)
    up = np.array([0,0,1.0])
    left = np.cross(up, forward); left /= np.linalg.norm(left)
    fx, lx, zx = np.dot(v, forward), np.dot(v, left), v[2]
    az = np.degrees(np.arctan2(lx, fx))
    el = np.degrees(np.arctan2(zx, np.hypot(fx, lx)))
    return az, el, d

def images(p):
    """sources images ordre 1 dans la boîte + source directe"""
    out = [(p, 1.0)]
    r = {k: np.sqrt(1-v) for k,v in ABS.items()}
    out.append((np.array([-p[0], p[1], p[2]]), r['x']))
    out.append((np.array([2*ROOM[0]-p[0], p[1], p[2]]), r['x']))
    out.append((np.array([p[0], -p[1], p[2]]), r['y']))
    out.append((np.array([p[0], 2*ROOM[1]-p[1], p[2]]), r['y']))
    out.append((np.array([p[0], p[1], -p[2]]), r['z0']))
    out.append((np.array([p[0], p[1], 2*ROOM[2]-p[2]]), r['z1']))
    return out

def late_tail(rt60=0.42, seed=7):
    rng = np.random.default_rng(seed)
    n = int(rt60*1.6*FS)
    t = np.arange(n)/FS
    dec = 10**(-3*t/rt60)
    tail = rng.normal(0,1,(n,2))*dec[:,None]
    sos = butter(2, [140/(FS/2), 5200/(FS/2)], btype='band', output='sos')
    tail = np.stack([sosfilt(sos, tail[:,0]), sosfilt(sos, tail[:,1])], axis=1)
    tail[:int(0.018*FS)] *= np.linspace(0,1,int(0.018*FS))[:,None]
    return tail / np.sqrt((tail**2).sum())

TAIL = late_tail()
REV_GAIN = 0.26

def render(sig, listener_seat, source_seat, n_seats):
    Lp = seat_pos(listener_seat, n_seats, H_EARS)
    forward = np.array([CENTER[0], CENTER[1], H_EARS]) - Lp
    forward[2] = 0; forward /= np.linalg.norm(forward)
    Sp = seat_pos(source_seat, n_seats, H_SRC)
    total = int(len(sig) + 0.9*FS)
    out = np.zeros((total, 2))
    for ip, gain in images(Sp):
        az, el, d = local_dir(Lp, forward, ip)
        ir = hrir(az, el)
        delay = int(d/343.0*FS)
        g = gain / max(d, 0.35)
        wet = np.stack([fftconvolve(sig, ir[:,0])[:total-delay],
                        fftconvolve(sig, ir[:,1])[:total-delay]], axis=1)
        out[delay:delay+len(wet)] += g*wet
    # réverbération tardive (champ diffus, quasi indépendant de la distance)
    rev = np.stack([fftconvolve(sig, TAIL[:,0]), fftconvolve(sig, TAIL[:,1])], axis=1)[:total]
    d0 = np.linalg.norm(Sp-Lp)
    out[:len(rev)] += rev * REV_GAIN
    return out

if __name__ == "__main__":
    import sys, json
    N = 6
    base = fart(seed=3, kind="franc")
    seats = {}
    peak = 0
    for s in range(N):
        y = render(base, 0, s, N)
        seats[s] = y
        peak = max(peak, np.abs(y).max())
    meta = {}
    for s, y in seats.items():
        y = y/peak*0.92
        wavfile.write(f"audio/seat{s}.wav", FS, (y*32767).astype(np.int16))
        Lp = seat_pos(0,N,H_EARS); Sp = seat_pos(s,N,H_SRC)
        fwd = np.array([CENTER[0],CENTER[1],H_EARS])-Lp; fwd[2]=0; fwd/=np.linalg.norm(fwd)
        az, el, d = local_dir(Lp, fwd, Sp)
        meta[s] = dict(az=round(az,1), el=round(el,1), dist=round(d,2))
    print(json.dumps(meta, indent=1))

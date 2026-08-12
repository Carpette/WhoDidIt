/* Qui a fait ça ?! — client palier 1
   Audio : pets pré-rendus en binaural (HRTF MIT KEMAR), voix spatialisée via PannerNode. */

const $ = (s) => document.querySelector(s);
const show = (id) => {
  ["home", "lobby", "game", "res"].forEach(s => $("#" + s).classList.toggle("hide", s !== id));
  // la séance passe en pleine largeur : trois colonnes au lieu d'une bande centrale
  const f = document.querySelector(".feuille");
  if (f) f.classList.toggle("large", id === "game");
};

// --- géométrie : siège relatif -> position dans le repère de l'auditeur -------
// rel 1 = 60° à droite, 2 = 30° à droite, 3 = en face, 4 = 30° à gauche, 5 = 60° à gauche
const REL = {
  1: { azR: 60, d: 1.33 }, 2: { azR: 30, d: 2.10 }, 3: { azR: 0, d: 2.40 },
  4: { azR: -30, d: 2.10 }, 5: { azR: -60, d: 1.33 }
};
const xyz = (r) => {
  const a = REL[r].azR * Math.PI / 180, d = REL[r].d;
  return { x: d * Math.sin(a), y: 0, z: -d * Math.cos(a) };
};

// --- état --------------------------------------------------------------------
let ws, ME = null, SEAT = 0, STATE = null, SOUNDS = [], HAND = [], MINSPEECH = 12;
// Version du banc de sons. À incrémenter à CHAQUE nouveau rendu : les fichiers
// sont servis en cache immuable pour une semaine, sans ce jeton les joueurs
// garderaient l'ancien banc.
const SFX_VER = "2";

let AC = null, micStream = null, micTrack = null, sidetone = null, analyser = null;
let voiceBus = null, voiceGain = null;      // bus commun à toutes les voix
let outStream = null, outTrack = null;      // micro APRÈS notre propre traitement
let porte = null, anPorte = null, anPost = null, porteOuverte = false, dernierSon = 0;
let tribune = null, niveauParole = 1;
let seuil = Number(localStorage.getItem("qafc_seuil") || 22);   // 0-100
const VOL_BASE = 2.6;                        // gain de référence (100 % côté UI)
let volPct = Number(localStorage.getItem("qafc_vol") || 100);
const peers = new Map();      // id -> {pc, seat, audioEl, panner, gain}
const buffers = new Map();    // url -> AudioBuffer
let speechAcc = 0, speechSent = 0, tickTimer = null;

let RTC = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }] };

// ?relay=1 force TOUTES les liaisons à passer par le TURN, même entre deux onglets
// de la même machine. C'est le seul moyen de prouver qu'un TURN fonctionne sans
// mobiliser des joueurs sur des réseaux différents : en local, WebRTC se connecte
// par candidat « host » et ne sollicite jamais les serveurs.
const RELAY_ONLY = new URLSearchParams(location.search).get("relay") === "1";

// --- audio -------------------------------------------------------------------
async function initAudio() {
  AC = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });

  // Un casque « surround » s'annonce parfois en 6 ou 8 canaux : on force deux canaux.
  try {
    AC.destination.channelCountMode = "explicit";
    AC.destination.channelInterpretation = "speakers";
    AC.destination.channelCount = 2;
  } catch (e) { console.warn("canaux de sortie non forçables", e); }

  // Source muette permanente : ouvre le flux de sortie avant toute capture micro.
  try {
    const keep = AC.createBufferSource();
    keep.buffer = AC.createBuffer(2, AC.sampleRate, AC.sampleRate);
    keep.loop = true;
    const kg = AC.createGain(); kg.gain.value = 0.0000001;
    keep.connect(kg).connect(AC.destination); keep.start();
  } catch {}

  // Bus des voix : limiteur souple pour pouvoir pousser le niveau sans saturer.
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6;
  comp.attack.value = 0.004; comp.release.value = 0.18;
  voiceGain = AC.createGain();
  voiceGain.gain.value = VOL_BASE * volPct / 100;
  comp.connect(voiceGain).connect(AC.destination);
  voiceBus = comp;
  applyVol(volPct);

  AC.listener.positionX && AC.listener.positionX.setValueAtTime(0, AC.currentTime);
  if (AC.listener.forwardZ) { AC.listener.forwardZ.value = -1; AC.listener.upY.value = 1; }
  else if (AC.listener.setOrientation) AC.listener.setOrientation(0, 0, -1, 0, 1, 0);

  await ouvrirMicro(localStorage.getItem("qafc_micro") || undefined);
  majMicro();
  startVAD();
  gardeEveil();
}

// Sur téléphone, l'écran s'éteint au bout de trente secondes sans toucher — et
// avec lui l'onglet passe en arrière-plan, ce qui suspend l'audio. Or ce jeu se
// joue précisément sans toucher à l'écran.
let veille = null;
async function gardeEveil() {
  if (!("wakeLock" in navigator)) return;
  const prendre = async () => {
    try { veille = await navigator.wakeLock.request("screen"); }
    catch {}
  };
  await prendre();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      prendre();
      // au retour d'arrière-plan, le contexte audio est souvent suspendu
      if (AC && AC.state === "suspended") AC.resume().catch(() => {});
    }
  });
}

// Ouvre (ou rouvre) le microphone. Extrait de initAudio pour pouvoir changer de
// périphérique en cours de session : sur certains navigateurs, capturer le micro DU
// CASQUE fait basculer la sortie du même casque en mode « communication »,
// monophonique. Capturer un autre micro rompt ce couplage.
async function ouvrirMicro(deviceId) {
  // Les traitements du NAVIGATEUR restent coupés : c'est l'un d'eux, quel qu'il soit,
  // qui fait basculer Firefox sur un flux duplex monophonique. On refait donc le
  // travail nous-mêmes dans le graphe WebAudio, qui n'a pas cet effet de bord.
  const trait = localStorage.getItem("qafc_aec") === "1";
  const contraintes = {
    echoCancellation: trait, noiseSuppression: trait, autoGainControl: trait,
    channelCount: 1
  };
  if (deviceId) contraintes.deviceId = { exact: deviceId };

  let flux;
  try { flux = await navigator.mediaDevices.getUserMedia({ audio: contraintes }); }
  catch (e) {
    if (!deviceId) throw e;
    delete contraintes.deviceId;                      // périphérique disparu
    flux = await navigator.mediaDevices.getUserMedia({ audio: contraintes });
  }

  const ancien = micTrack;
  const etaitOuvert = ancien ? ancien.enabled : false;
  micStream = flux;
  micTrack = flux.getAudioTracks()[0];
  micTrack.enabled = etaitOuvert;

  const src = AC.createMediaStreamSource(flux);

  // 1. coupe-bas : chocs de bureau, bruits de manipulation, ronflement secteur
  const hp = AC.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 95; hp.Q.value = 0.7;

  // 2. creux vers 4 kHz : c'est là que claquent les touches de clavier, et la voix
  //    n'y perd presque rien
  const clav = AC.createBiquadFilter();
  clav.type = "peaking"; clav.frequency.value = 4200; clav.Q.value = 1.1; clav.gain.value = -5;

  // 3. compression douce : remplace la correction de gain du navigateur, sans son
  //    effet de bord sur la sortie
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -30; comp.knee.value = 12; comp.ratio.value = 3;
  comp.attack.value = 0.006; comp.release.value = 0.25;

  // 4. porte de bruit : ferme le micro tant que personne ne parle. C'est elle qui
  //    supprime le souffle permanent et le clavier entre deux phrases.
  porte = AC.createGain();
  porte.gain.value = 0;

  anPorte = AC.createAnalyser(); anPorte.fftSize = 512;      // détection, avant la porte
  anPost  = AC.createAnalyser(); anPost.fftSize = 1024;      // affichage, après la porte

  src.connect(hp); hp.connect(clav); clav.connect(comp);
  comp.connect(anPorte);
  comp.connect(porte);
  porte.connect(anPost);

  // ce qui part vers les autres, et ce qu'on se réentend, sont le MÊME signal traité :
  // on entend donc exactement ce que la table entend
  const dest = AC.createMediaStreamDestination();
  // La tribune : atténuation de SA PROPRE voix quand on n'a pas la parole.
  // C'est le seul endroit où ça peut se faire sans fuite d'information — un client
  // qui atténuerait les voix reçues devrait savoir qui sont les intervenants.
  tribune = AC.createGain();
  tribune.gain.value = niveauParole;
  porte.connect(tribune);
  tribune.connect(dest);
  outStream = dest.stream;
  outTrack = outStream.getAudioTracks()[0];

  if (sidetone) { try { sidetone.disconnect(); } catch {} }
  sidetone = AC.createGain();
  sidetone.gain.value = 0.28;
  tribune.connect(sidetone).connect(AC.destination);   // on s'entend au niveau réellement émis

  analyser = anPost;

  peers.forEach(p => {
    try {
      const s = p.pc.getSenders().find(x => x.track && x.track.kind === "audio");
      if (s) s.replaceTrack(outTrack);
    } catch {}
  });
  if (ancien) { try { ancien.stop(); } catch {} }
  majMicro();
  demarrerPorte();
  detecterMainsLibres();
  await listerMicros();
}

// Seuil 0-100 → seuil RMS. Échelle exponentielle : le réglage utile est en bas.
const seuilRms = () => 0.004 * Math.pow(2.2, seuil / 20);

// Une seule autorité sur l'état du micro. Il est OUVERT hors partie (réglages,
// essai acoustique) et en salle d'attente — c'est là que le joueur règle son
// seuil, et la jauge ne peut rien montrer d'un micro coupé. Il n'est coupé que
// pendant l'annonce des rôles et la suspension, où la table doit être muette.
function majMicro() {
  if (!micTrack) return;
  const p = STATE && STATE.phase;
  micTrack.enabled = !p || ["lobby", "meeting", "vote", "results"].includes(p);
  // hors séance, tout le monde parle à plein niveau : l'atténuation de tribune
  // n'a de sens que pendant le débat contradictoire.
  if (p !== "meeting" && tribune && niveauParole < 1) {
    niveauParole = 1; aLaParole = true;
    tribune.gain.setTargetAtTime(1, AC.currentTime, 0.05);
  }
}

function demarrerPorte() {
  if (demarrerPorte.on) return;
  demarrerPorte.on = true;
  const buf = new Float32Array(512);
  setInterval(() => {
    if (!anPorte || !porte) return;
    anPorte.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    const t = AC.currentTime;
    if (rms > seuilRms()) { dernierSon = Date.now(); }
    const ouvrir = Date.now() - dernierSon < 280;      // maintien après la fin d'un mot
    if (ouvrir !== porteOuverte) {
      porteOuverte = ouvrir;
      porte.gain.cancelScheduledValues(t);
      porte.gain.setTargetAtTime(ouvrir ? 1 : 0, t, ouvrir ? 0.006 : 0.09);
    }
  }, 25);
}

function appliquerSeuil(v) {
  seuil = Math.max(0, Math.min(100, v));
  localStorage.setItem("qafc_seuil", String(seuil));
  // repère visuel sur la jauge, à la même échelle que le niveau affiché
  const marque = Math.min(100, seuilRms() * 700);
  document.querySelectorAll(".jauge").forEach(e => e.style.setProperty("--seuil", marque + "%"));
  document.querySelectorAll(".seuilval").forEach(e => e.textContent = seuil);
  document.querySelectorAll(".seuilsl").forEach(e => { if (+e.value !== seuil) e.value = seuil; });
}
window.appliquerSeuil = appliquerSeuil;

// Détection du profil « mains libres » d'un casque Bluetooth.
//
// Dès qu'on capture le micro d'un casque Bluetooth classique, la liaison quitte
// A2DP — qui est un profil de diffusion à sens unique, sans voie de retour — pour
// HFP, qui est bidirectionnel mais MONOPHONIQUE, à 8 ou 16 kHz. Toute la
// spatialisation disparaît, et aucune API web ne permet de choisir le profil.
//
// Le tell est la fréquence d'échantillonnage de la piste d'entrée : 8 000 ou
// 16 000 Hz au lieu de 44 100 / 48 000. On le signale explicitement plutôt que de
// laisser le joueur croire que le jeu est cassé.
let mainsLibres = false;
function detecterMainsLibres() {
  try {
    const s = micTrack.getSettings ? micTrack.getSettings() : {};
    const fe = s.sampleRate || 0;
    mainsLibres = (fe > 0 && fe <= 16000) || (AC && AC.destination.maxChannelCount < 2);
  } catch { mainsLibres = false; }
  // La fréquence d'entrée est affichée telle quelle : c'est une mesure, pas un
  // jugement à l'oreille. 44 100 ou 48 000 Hz = liaison stéréo intacte ;
  // 8 000 ou 16 000 Hz = profil de communication, spatialisation impossible.
  const f = $("#microfreq");
  if (f) {
    let hz = 0;
    try { hz = (micTrack.getSettings ? micTrack.getSettings().sampleRate : 0) || 0; } catch {}
    if (!hz) { f.textContent = ""; f.className = "freq"; }
    else if (mainsLibres) {
      f.className = "freq ko";
      f.textContent = `Entrée ${hz.toLocaleString("fr-FR")} Hz — profil mains libres, stéréo perdue`;
    } else {
      f.className = "freq";
      f.textContent = `Entrée ${hz.toLocaleString("fr-FR")} Hz — liaison stéréo intacte`;
    }
  }
  const el = $("#avis"); if (el && STATE && STATE.phase === "lobby") renderState();
  return mainsLibres;
}

async function listerMicros() {
  const sel = $("#micro"); if (!sel) return;
  try {
    const l = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
    const actuel = micTrack ? micTrack.getSettings().deviceId : "";
    sel.innerHTML = l.map((d, i) =>
      `<option value="${d.deviceId}"${d.deviceId === actuel ? " selected" : ""}>${esc(d.label || "Micro " + (i + 1))}</option>`).join("");
  } catch {}
}


// Nombre de canaux réellement offerts par la sortie. À 1, tout est ré-additionné
// en mono et aucun rendu binaural ne peut fonctionner.
function sortieMono() {
  try { return AC.destination.maxChannelCount < 2; } catch { return false; }
}

// Encode un buffer stéréo en WAV pour le faire jouer par un <audio>, qui n'emprunte
// pas le même chemin de sortie que le graphe WebAudio dans Firefox.
function wavBlob(chL, chR, sr) {
  const n = chL.length, oct = 44 + n * 4, b = new ArrayBuffer(oct), v = new DataView(b);
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, "RIFF"); v.setUint32(4, oct - 8, true); txt(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true);
  v.setUint16(34, 16, true); txt(36, "data"); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    v.setInt16(o, Math.max(-1, Math.min(1, chL[i])) * 32767, true); o += 2;
    v.setInt16(o, Math.max(-1, Math.min(1, chR[i])) * 32767, true); o += 2;
  }
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

function tonalite(canal, n, sr) {
  const L = new Float32Array(n), R = new Float32Array(n);
  const cible = canal === "G" ? L : R;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    cible[i] = Math.sin(2 * Math.PI * 660 * t) * 0.35 * Math.min(1, t / 0.01) * Math.exp(-3.2 * t);
  }
  return [L, R];
}

// Bip cantonné à un canal, par le graphe WebAudio (voie A).
function bip(canal) {
  const sr = AC.sampleRate, n = Math.floor(0.5 * sr);
  const [L, R] = tonalite(canal, n, sr);
  const b = AC.createBuffer(2, n, sr);
  b.getChannelData(0).set(L); b.getChannelData(1).set(R);
  const s = AC.createBufferSource(); s.buffer = b; s.connect(AC.destination); s.start();
}

// Le même bip, par le lecteur média classique (voie B).
function bipElement(canal) {
  const sr = 44100, n = Math.floor(0.5 * sr);
  const [L, R] = tonalite(canal, n, sr);
  const el = new Audio(wavBlob(L, R, sr));
  el.volume = 1; el.play().catch(() => {});
}

function startVAD() {
  let lvl = 0;
  setInterval(() => {
    // La jauge est alimentée AVANT la porte : sinon elle ne bouge jamais tant que
    // la porte est fermée, c'est-à-dire exactement au moment où l'on cherche à
    // régler le seuil. La couleur, elle, dit si la porte est ouverte.
    if (anPorte) {
      const b = new Float32Array(anPorte.fftSize);
      anPorte.getFloatTimeDomainData(b);
      let q = 0; for (let i = 0; i < b.length; i++) q += b[i] * b[i];
      lvl = Math.max(Math.sqrt(q / b.length), lvl * 0.82);
      const pct = Math.min(100, lvl * 700);
      document.querySelectorAll(".jauge i").forEach(e => {
        e.style.width = pct + "%";
        e.style.background = porteOuverte ? "var(--sauge)" : "var(--filet)";
      });
    }
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    if (micTrack && micTrack.enabled && rms > 0.012) speechAcc += 200;
    // niveau réellement reçu de chaque pair
    peers.forEach(p => {
      if (!p.an) return;
      p.an.getFloatTimeDomainData(p.anBuf);
      let q = 0; for (let i = 0; i < p.anBuf.length; i++) q += p.anBuf[i] * p.anBuf[i];
      if (Math.sqrt(q / p.anBuf.length) > 0.006) { p.lastHeard = Date.now(); p.dejaEntendu = true; }
    });
  }, 200);
  // la table se redessine régulièrement pour que les pastilles vivent
  setInterval(() => {
    if (!STATE || !["intro", "meeting", "vote"].includes(STATE.phase)) return;
    const votable = STATE.phase === "vote"
    || (STATE.phase === "meeting" && STATE.sousPhase === "vote-debat" && !(maTribune && STATE.debat && maTribune.i === STATE.debat.i));
    const sg = planSig(votable);
    if (sg !== sigPlan) { sigPlan = sg; const box = $("#tblbox"); if (box) box.innerHTML = drawTable(votable); }
    majAppelPlan(votable);
    if (STATE.phase === "meeting") renderHand();
  }, 700);
  setInterval(() => {
    const d = speechAcc - speechSent;
    if (d > 0 && ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: "speech", ms: d })); speechSent = speechAcc; }
    const inf = $("#speechinfo");
    if (inf && STATE && (STATE.phase === "meeting" || STATE.phase === "intro")) {
      const s = Math.round(speechAcc / 1000);
      inf.textContent = s >= MINSPEECH
        ? `Temps de parole ${s} s — quota de participation atteint.`
        : `Temps de parole ${s} s sur ${MINSPEECH} s requises. En deçà, votre siège sera signalé au scrutin.`;
      inf.className = "parole " + (s >= MINSPEECH ? "ok" : "bas");
    }
  }, 1000);
}

function applyVol(pct) {
  volPct = Math.max(0, Math.min(300, pct));
  localStorage.setItem("qafc_vol", String(volPct));
  if (voiceGain) voiceGain.gain.value = VOL_BASE * volPct / 100;
  document.querySelectorAll(".volval").forEach(e => e.textContent = volPct + " %");
  document.querySelectorAll(".volsl").forEach(e => { if (+e.value !== volPct) e.value = volPct; });
}
window.applyVol = applyVol;
// Diagnostic à taper dans la console pendant un playtest : __audio()
window.__audio = () => ({
  voix_connectees: [...peers.values()].filter(p => p.gain).length,
  pairs: peers.size,
  volume_pct: volPct,
  gain_bus: voiceGain ? +voiceGain.gain.value.toFixed(2) : null,
  canaux_max_peripherique: AC ? AC.destination.maxChannelCount : null,
  canaux_utilises: AC ? AC.destination.channelCount : null,
  mode_canaux: AC ? AC.destination.channelCountMode : null,
  frequence: AC ? AC.sampleRate : null,
  traitement_micro: localStorage.getItem("qafc_aec") === "1",
  micro: micTrack ? (micTrack.label || "?") : null,
  seuil_micro: seuil,
  seuil_rms: +seuilRms().toFixed(4),
  porte_ouverte: porteOuverte,
  mode_pets: voieB ? "B (lecteur classique)" : "A (moteur du jeu)",
  politique_ice: RTC.iceTransportPolicy || "all",
  serveurs_ice: (RTC.iceServers || []).map(s => [].concat(s.urls).join(" ")),
  liaisons: [...peers.entries()].map(([id, p]) => ({
    siege: (p.seat ?? "?") + 1, etat: p.st || "?", voie: p.voie || "?", rtt_ms: p.rtt ?? null
  })),
  sidetone: sidetone ? +sidetone.gain.value.toFixed(2) : null,
  contexte: AC ? AC.state : null,
  veille_ecran: !!veille,
  mains_libres: mainsLibres,
  micro_hz: (() => { try { return micTrack.getSettings().sampleRate || null; } catch { return null; } })()
});

async function loadBuf(url) {
  if (buffers.has(url)) return buffers.get(url);
  const r = await fetch(url); const ab = await r.arrayBuffer();
  const b = await AC.decodeAudioData(ab); buffers.set(url, b); return b;
}

// Les pets sont déjà binauraux : ils n'ont besoin d'aucun traitement, seulement
// d'être joués tels quels. On peut donc les sortir par le lecteur classique si le
// graphe WebAudio du navigateur écrase la stéréo (cas Firefox constaté).
// Mode A (graphe WebAudio) par défaut partout : c'est le chemin propre, avec gain
// et limiteur. Le mode B ne reste qu'en filet de sécurité manuel — il a servi à
// isoler le problème Firefox, dont la cause réelle était la chaîne de traitement
// du micro (voir ouvrirMicro), désormais coupée.
const FIREFOX = /firefox/i.test(navigator.userAgent);
let voieB = localStorage.getItem("qafc_voieB") === "1";
window.voieB = (on) => {
  voieB = on !== false;
  localStorage.setItem("qafc_voieB", voieB ? "1" : "0");
  return "Pets joués en mode " + (voieB ? "B (lecteur classique)" : "A (moteur du jeu)");
};

// Point de sortie UNIQUE pour tous les sons de pet — jeu comme essai acoustique.
// Tout ce qui teste la spatialisation doit emprunter exactement le chemin du jeu,
// sans quoi l'essai valide une configuration qui n'est pas celle qui sera jouée.
async function jouerSon(url, gain) {
  if (voieB) {
    try { const el = new Audio(url); el.volume = gain; await el.play(); return "B"; }
    catch (e) { console.warn("sortie B indisponible", url, e); }
  }
  const b = await loadBuf(url);
  const s = AC.createBufferSource(); s.buffer = b;
  const g = AC.createGain(); g.gain.value = gain;
  s.connect(g).connect(AC.destination); s.start();
  return "A";
}

async function playSfx(seat, sound, incident) {
  const rel = ((seat - SEAT) + 6) % 6;
  const url = `sfx/${sound}_${rel === 0 ? "self" : rel}.mp3?v=${SFX_VER}`;
  const g = rel === 0 ? (incident ? 0.8 : 0.55) : 1.0;
  try { await jouerSon(url, g); }
  catch (e) { console.warn("sfx", url, e); }
}

function attachPeerAudio(id, stream, seat) {
  const p = peers.get(id); if (!p) return;
  // Chrome ne "tire" pas un MediaStream dans WebAudio sans élément média rattaché.
  const el = new Audio(); el.srcObject = stream; el.muted = true; el.autoplay = true;
  el.play().catch(() => {});
  p.audioEl = el;
  const src = AC.createMediaStreamSource(stream);

  // 85 Hz : on enlève le grondement qui ne sert qu'à manger du niveau.
  const hp = AC.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 85;
  // +4 dB vers 2,6 kHz : c'est là que vit l'intelligibilité de la parole, et c'est
  // aussi la zone qui porte l'indice de localisation (ILD). On gagne en clarté
  // sans avoir à tout monter en volume brut.
  const pres = AC.createBiquadFilter();
  pres.type = "peaking"; pres.frequency.value = 2600; pres.Q.value = 0.9; pres.gain.value = 4;

  const pan = AC.createPanner();
  pan.panningModel = "HRTF"; pan.distanceModel = "inverse";
  // Atténuation de distance volontairement adoucie : l'écart voisin/vis-à-vis
  // passe de 5,7 dB à 2,6 dB. On garde l'indice, on ne noie plus celui d'en face.
  pan.refDistance = 1.6; pan.rolloffFactor = 0.7;
  const rel = ((seat - SEAT) + 6) % 6;
  const pos = xyz(rel === 0 ? 3 : rel);
  if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
  else pan.setPosition(pos.x, pos.y, pos.z);
  const g = AC.createGain(); g.gain.value = 1.0;
  src.connect(hp).connect(pres).connect(pan).connect(g).connect(voiceBus);

  // Analyseur sur la voix REÇUE : c'est le seul moyen de savoir si du son arrive
  // vraiment. Une connexion "connected" peut être parfaitement muette.
  const an = AC.createAnalyser(); an.fftSize = 512;
  hp.connect(an);
  p.an = an; p.anBuf = new Float32Array(an.fftSize);

  p.panner = pan; p.gain = g;
}

// --- WebRTC mesh -------------------------------------------------------------
function makePeer(id, seat, initiator) {
  if (peers.has(id)) return peers.get(id);
  const pc = new RTCPeerConnection(RTC);
  // poli = celui qui cède en cas de collision d'offres. L'initiateur est décidé
  // par comparaison d'identifiants, donc les deux côtés sont toujours d'accord.
  const p = { pc, seat, initiator, poli: !initiator, iceEnAttente: [], chaine: Promise.resolve(),
              recuLe: 0, cree: Date.now() };
  peers.set(id, p);
  (outStream || micStream).getTracks().forEach(t => pc.addTrack(t, outStream || micStream));
  pc.onicecandidate = (e) => e.candidate && ws.send(JSON.stringify({ type: "signal", to: id, data: { ice: e.candidate } }));
  pc.ontrack = (e) => { p.recuLe = Date.now(); attachPeerAudio(id, e.streams[0], seat); };
  // Toutes les 3 s, on demande à WebRTC quelle paire de candidats il a réellement
  // retenue. C'est la preuve directe, en partie réelle, du chemin emprunté :
  // host = réseau local, srflx = NAT traversé par STUN, relay = passé par le TURN.
  p.stats = setInterval(async () => {
    try {
      const st = await pc.getStats();
      let paire = null;
      st.forEach(r => {
        if (r.type === "candidate-pair" && (r.selected || r.state === "succeeded" && r.nominated)) paire = r;
      });
      if (!paire) return;
      const loc = st.get(paire.localCandidateId), dis = st.get(paire.remoteCandidateId);
      if (loc) p.voie = loc.candidateType === "relay" || (dis && dis.candidateType === "relay")
        ? "relay" : loc.candidateType;
      p.rtt = paire.currentRoundTripTime ? Math.round(paire.currentRoundTripTime * 1000) : null;
    } catch {}
  }, 3000);

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") { try { pc.restartIce(); } catch {} }
  };
  pc.onconnectionstatechange = () => {
    p.st = pc.connectionState;
    if (pc.connectionState === "failed") {
      // Dernière chance : on relance la négociation ICE, puis on refait une offre
      // complète si on est l'initiateur — restartIce() seul ne suffit pas toujours.
      try { pc.restartIce(); } catch {}
      if (initiator) setTimeout(() => negocier(id, p, true), 1200);
    }
  };
  if (initiator) pc.onnegotiationneeded = () => negocier(id, p, false);
  return p;
}

// Émission d'une offre, sérialisée sur la même chaîne que la réception : sans ça,
// une offre et une réponse peuvent se croiser et laisser la connexion à moitié
// négociée — c'est silencieux, et ça ne touche qu'un pair sur cinq.
function negocier(id, p, force) {
  p.chaine = p.chaine.then(async () => {
    try {
      if (p.pc.signalingState !== "stable" && !force) return;
      p.negocie = true;
      const o = await p.pc.createOffer(force ? { iceRestart: true } : undefined);
      if (p.pc.signalingState !== "stable" && !force) return;
      await p.pc.setLocalDescription(o);
      ws.send(JSON.stringify({ type: "signal", to: id, data: { sdp: p.pc.localDescription } }));
    } catch (e) { console.warn("négociation", id, e); }
    finally { p.negocie = false; }
  });
  return p.chaine;
}

// Réception d'un signal.
//
// Deux défauts corrigés ici, tous deux invisibles et intermittents :
//
// 1. Les candidats ICE qui arrivent AVANT la description distante étaient
//    silencieusement jetés (addIceCandidate lève une exception, le catch
//    l'avalait). Selon l'ordre d'arrivée des paquets, un pair pouvait perdre
//    tous ses candidats utiles et ne jamais se connecter — pendant que les
//    autres liaisons fonctionnaient parfaitement.
// 2. Les signaux étaient traités en parallèle : deux setRemoteDescription
//    concurrents laissent la machine à états dans un état incohérent. Tout est
//    désormais sérialisé par pair.
function onSignal(from, data) {
  let p = peers.get(from);
  if (!p) p = makePeer(from, (STATE?.seats.find(s => s && s.id === from) || {}).seat ?? 0, false);
  p.chaine = p.chaine.then(() => traiterSignal(p, from, data)).catch(e => console.warn("signal", from, e));
}

async function traiterSignal(p, from, data) {
  const pc = p.pc;

  if (data.sdp) {
    const offreEntrante = data.sdp.type === "offer";
    const collision = offreEntrante && (p.negocie || pc.signalingState !== "stable");
    // Négociation « parfaite » : en cas de collision, l'impoli ignore l'offre
    // reçue et garde la sienne. Sans cette règle les deux côtés reculent en même
    // temps et la connexion reste bloquée.
    if (collision && !p.poli) return;
    if (collision) await pc.setLocalDescription({ type: "rollback" }).catch(() => {});

    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    // la description distante existe : on peut enfin verser les candidats gardés
    for (const c of p.iceEnAttente.splice(0)) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn("ice différé", e); }
    }
    if (offreEntrante) {
      const a = await pc.createAnswer();
      await pc.setLocalDescription(a);
      ws.send(JSON.stringify({ type: "signal", to: from, data: { sdp: pc.localDescription } }));
    }
    return;
  }

  if (data.ice) {
    if (!pc.remoteDescription || !pc.remoteDescription.type) { p.iceEnAttente.push(data.ice); return; }
    try { await pc.addIceCandidate(new RTCIceCandidate(data.ice)); } catch (e) { console.warn("ice", e); }
  }
}

function refreshPositions() {
  if (!STATE) return;
  STATE.seats.forEach(s => {
    if (!s) return;
    const p = peers.get(s.id);
    if (!p) return;
    p.seat = s.seat;
    if (!p.panner) return;
    const rel = ((s.seat - SEAT) + 6) % 6;
    const pos = xyz(rel === 0 ? 3 : rel);
    const pan = p.panner;
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
    else pan.setPosition(pos.x, pos.y, pos.z);
  });
}

// état audio d'un pair : ok / muet / hs / attente
// État audio d'un pair. La distinction qui compte n'est pas « silencieux à cet
// instant » — tout le monde l'est la plupart du temps — mais « on n'a JAMAIS reçu
// un seul son de lui ». C'est ce cas-là qui trahit une liaison morte, et c'est
// exactement ce qui s'est produit en partie : un joueur parlait beaucoup, et
// personne ne recevait rien de lui.
//   ok      : on l'entend en ce moment
//   silence : liaison saine, il ne parle pas — état normal, pas une alerte
//   sourd   : connecté depuis longtemps, jamais un son reçu — liaison morte
//   hs      : la connexion a échoué ou n'aboutit pas
//   attente : négociation en cours
function peerHealth(id) {
  const p = peers.get(id);
  if (!p) return "attente";
  if (p.st === "failed" || p.st === "closed") return "hs";
  const age = Date.now() - (p.cree || Date.now());
  if (p.st !== "connected") return age > 20000 ? "hs" : "attente";
  if (!p.gain) return age > 20000 ? "sourd" : "attente";
  if (p.lastHeard && Date.now() - p.lastHeard < 4000) return "ok";
  if (!p.dejaEntendu && age > 25000) return "sourd";
  return "silence";
}

// --- rendu du plan de salle --------------------------------------------------
let myVote = null, cooldownUntil = 0, COOLDOWN = 15;
const HCOL = { ok: "#5f8a72", silence: "#c2b8a4", sourd: "#c8973f", hs: "#b8552f", attente: "#c2b8a4" };
const esc = (s) => (s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

function planSig(votable) {
  return (STATE.seats || []).map(s => s ? `${s.seat}:${s.nom}:${s.out ? 1 : 0}:${s.id === ME ? "m" : peerHealth(s.id)}` : "-")
    .join("|") + "|" + votable + "|" + myVote;
}
function drawTable(votable) {
  const cx = 190, cy = 178, R = 126;
  // table dessinée comme un plan d'architecte : hachures fines, cotation
  let h = `<svg viewBox="0 0 380 360" class="tbl">
    <defs><pattern id="hach" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#d9cfbb" stroke-width="1"/></pattern></defs>
    <circle cx="${cx}" cy="${cy}" r="86" fill="url(#hach)" stroke="#b9ae98" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="79" fill="#fdfbf3" stroke="#d9cfbb" stroke-width="1"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" style="fill:#b0a794;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.18em">TABLE</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" style="fill:#b0a794;font:400 9px 'IBM Plex Mono',monospace;letter-spacing:.14em">Ø 2,30 M</text>`;
  for (let i = 0; i < 6; i++) {
    const rel = ((i - SEAT) + 6) % 6;
    const a2 = (60 * rel + 90) * Math.PI / 180;
    const x = cx - R * Math.cos(a2), y = cy + R * Math.sin(a2);
    const s = STATE.seats[i];
    const isMe = s && s.id === ME;
    const out = s && s.out;
    const fill = isMe ? "#e7efe9" : (s ? (out ? "#f0e3e0" : "#ffffff") : "#f4ecdc");
    const stroke = isMe ? "#5f8a72" : (s ? "#b9ae98" : "#ddd3c0");
    const canVote = votable && s && !isMe && !out;
    const voted = s && s.id === myVote;
    const st = (s && !isMe) ? peerHealth(s.id) : null;
    h += `<g class="siege ${canVote ? "votable" : ""}" ${canVote ? `data-vote="${s.id}"` : ""}>
      <circle class="pl" cx="${x}" cy="${y}" r="25" fill="${fill}"
        stroke="${voted ? "#b8552f" : stroke}" stroke-width="${voted ? 4 : 1.6}"/>
      ${st ? `<circle cx="${x + 18}" cy="${y - 18}" r="5.5" fill="${HCOL[st]}" stroke="#fdfbf3" stroke-width="1.6"/>` : ""}
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="sn">${s ? (isMe ? "VOUS" : "P" + (i + 1)) : "—"}</text>
      <text x="${x}" y="${y + 41}" text-anchor="middle" class="sp ${isMe ? "moi" : ""}">${s ? esc(s.nom) : "siège vacant"}</text>
      ${voted ? `<text x="${x}" y="${y - 32}" text-anchor="middle" style="fill:#b8552f;font:700 8.5px 'IBM Plex Mono',monospace;letter-spacing:.14em">ACCUSÉ</text>` : ""}
    </g>`;
  }
  h += "</svg>";
  const autres = (STATE.seats || []).filter(s => s && s.id !== ME);
  const pb = autres.filter(s => ["sourd", "hs"].includes(peerHealth(s.id)));
  if (pb.length) {
    const relais = autres.some(s => { const p = peers.get(s.id); return p && p.voie === "relay"; });
    h += `<p class="diag"><b>Aucun son reçu de : ${pb.map(s => esc(s.nom)).join(", ")}</b><br>
      <span class="small">Sa voix ne vous parvient pas, même s'il parle. Son micro n'est pas en cause.
      ${relais ? "" : "Aucune liaison ne passe par un relais TURN : c'est la cause la plus probable."}</span></p>`;
  } else if (autres.length) {
    const voies = {};
    autres.forEach(s => { const p = peers.get(s.id); const v = (p && p.voie) || "?"; voies[v] = (voies[v] || 0) + 1; });
    const det = Object.entries(voies).map(([v, n]) => `${n} × ${VOIE_NOM[v] || v}`).join(", ");
    h += `<p class="diag ok">Toutes les liaisons sont établies.<br>
      <span class="small">Voie empruntée : ${det}.</span></p>`;
  }
  return h;
}


const VOIE_NOM = { host: "réseau local", srflx: "direct (NAT traversé)", prflx: "direct", relay: "relais TURN" };
const TRACE = { 3: "ÉLEVÉE", 2: "MOYENNE", 1: "FAIBLE" };
let sigHand = "", sigPlan = "";
function renderHand(force) {
  const box = $("#handbox");
  if (!STATE || STATE.phase !== "meeting") { if (sigHand !== "") { box.innerHTML = ""; sigHand = ""; } return; }
  const reste = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  // Un bouton recréé sous le curseur, c'est un clic perdu : on ne redessine
  // que lorsque le contenu change réellement.
  const sig = HAND.map(c => c.uid).join(",") + "|" + reste;
  if (!force && sig === sigHand) return;
  sigHand = sig;
  if (!HAND.length) {
    box.innerHTML = `<p class="dossier-tete"><span>Dossier personnel</span><span>épuisé</span></p>
      <div class="bloc"><div class="v" style="font-size:14px">Vous n'avez plus rien à votre disposition.
      Il ne vous reste que la parole — ce qui, dans une réunion, reste une arme.</div></div>`;
    return;
  }
  box.innerHTML = `<p class="dossier-tete"><span>Dossier personnel</span>
      <span>${HAND.length} pièce${HAND.length > 1 ? "s" : ""}${reste ? ` · délai ${reste} s` : ""}</span></p>` +
    HAND.map(c => {
      const s = SOUNDS.find(x => x.id === c.id) || { nom: c.id, dur: 0, loc: 2, fla: "" };
      return `<button class="carte t${s.loc} ${reste ? "attente" : ""}" data-uid="${c.uid}" ${reste ? "disabled" : ""}>
        <div class="bande"></div>
        <div class="in">
          <div class="cat">Pièce sonore · ${s.dur.toFixed(1).replace(".", ",")} s</div>
          <div class="nom">${esc(s.nom)}</div>
          <div class="trace">Traçabilité : <b>${TRACE[s.loc]}</b> ${"◆".repeat(s.loc)}${"◇".repeat(3 - s.loc)}</div>
          ${s.fla ? `<div class="fla">${esc(s.fla)}</div>` : ""}
        </div></button>`;
    }).join("");
}

// --- carnet de séance --------------------------------------------------------
// Un jeu de déduction sans support de note oblige à tout tenir de tête. Le carnet
// est aussi le seul endroit où l'écriture manuscrite entre dans la paperasse.
function carnetKey() { return `qafc_carnet_${STATE ? STATE.code : "x"}_${STATE ? STATE.round : 0}`; }
function initCarnet() {
  const t = $("#carnet"); if (!t || t.dataset.on) return;
  t.dataset.on = "1";
  t.addEventListener("input", () => { try { localStorage.setItem(carnetKey(), t.value); } catch {} });
}
function loadCarnet() {
  const t = $("#carnet"); if (!t) return;
  initCarnet();
  try { t.value = localStorage.getItem(carnetKey()) || ""; } catch { t.value = ""; }
}

// --- boucle d'affichage ------------------------------------------------------

// ---------------------------------------------------------------------------
// Briefing d'ouverture
//
// Le retour de partie est sans appel : les joueurs ne savent pas quoi faire. Le
// mandat était affiché dans un bandeau parmi six autres, en même temps que tout
// le reste. Ici on bloque l'écran pendant l'ouverture de séance, avec une seule
// chose à lire : votre rôle, votre objectif, et les trois gestes qui comptent.
// Le panneau se ferme tout seul à l'ouverture des débats — personne ne reste
// coincé derrière parce qu'il n'a pas cliqué.
// ---------------------------------------------------------------------------
let briefTimer = null, briefPhaseVue = false;

function fermerBrief() {
  const b = $("#brief");
  if (!b) return;
  b.classList.add("hide");
  if (briefTimer) { clearInterval(briefTimer); briefTimer = null; }
}

function ouvrirBrief(pet, nbFarters, nbPieces) {
  const b = $("#brief");
  if (!b) return;
  const etapes = pet ? [
    ["Lâchez vos pièces au bon moment", `Vous en avez <b>${nbPieces}</b>, espacées de <b>${COOLDOWN} s</b> minimum. Une pièce lâchée dans un silence vous désigne aussitôt : attendez que ça parle.`],
    ["Parlez comme tout le monde", "Se taire est le meilleur moyen de se faire élire. Un participant muet est signalé au vote."],
    ["Surveillez la pression", "Elle monte toute la séance. Au maximum, <b>l'Incident</b> part tout seul — douze secondes, à votre place, devant tout le monde."]
  ] : [
    ["Écoutez d'où vient le son", "Chaque pet arrive d'une <b>direction précise</b>. Repérez-la sur le plan de salle, à gauche. C'est la seule preuve dont vous disposez."],
    ["Brouillez les pistes", "Vous avez <b>une pièce</b> vous aussi. L'utiliser vous rend suspect — c'est le but : personne ne doit pouvoir déduire votre rôle de votre silence."],
    ["Notez, puis votez", `Le carnet à droite ne se partage pas. À la fin, vous désignez ${nbFarters > 1 ? "<b>un</b> des deux responsables" : "<b>le</b> responsable"} sur le plan.`]
  ];
  b.className = pet ? "pet" : "inn";
  b.innerHTML = `<div class="carte-brief">
    <span class="tampon">Mandat confidentiel</span>
    <h2 class="bf-role">${pet ? "Vous êtes à l'origine des faits" : "Vous êtes au-dessus de tout soupçon"}</h2>
    <p class="bf-sous">${pet
      ? `Tenez la séance entière <b>sans vous faire désigner</b>. ${nbFarters > 1 ? "Vous n'êtes pas seul, et vous ignorez qui est l'autre." : "Vous êtes seul."}`
      : `Identifiez ${nbFarters > 1 ? "les <b>deux</b> responsables" : "le <b>responsable</b>"} à l'oreille, et faites-${nbFarters > 1 ? "en" : "le"} désigner par la salle.`}</p>
    <ul class="bf-liste">${etapes.map(([t, d], i) => `
      <li><span class="bf-n">${i + 1}</span><span class="bf-t"><b>${t}.</b> ${d}</span></li>`).join("")}</ul>
    <div class="bf-pied">
      <span class="bf-casque">Casque obligatoire — sans lui, rien n'est localisable</span>
      <button class="btn p" id="bfok">J'ai compris</button>
    </div>
  </div>`;
  b.classList.remove("hide");
  briefPhaseVue = false;      // le rôle arrive AVANT le passage en phase intro
  $("#bfok").onclick = fermerBrief;

  // décompte : le panneau se referme de lui-même quand la séance s'ouvre
  if (briefTimer) clearInterval(briefTimer);
  const maj = () => {
    const reste = STATE && STATE.endsAt ? Math.ceil((STATE.endsAt - Date.now()) / 1000) : 0;
    const bt = $("#bfok");
    if (!bt) return;
    if (STATE && STATE.phase === "intro") briefPhaseVue = true;
    else if (briefPhaseVue) { fermerBrief(); return; }
    else return;              // le serveur n'a pas encore annoncé l'ouverture
    bt.textContent = reste > 0 ? `J'ai compris (${reste})` : "J'ai compris";
  };
  maj();
  briefTimer = setInterval(maj, 500);
}

// Aide-mémoire permanent, colonne de gauche : la même information que le
// briefing, en trois lignes, pour ceux qui l'ont fermé trop vite.
function majMemo() {
  const box = $("#memobox");
  if (!box || !STATE) return;
  if (!["meeting", "vote"].includes(STATE.phase) || !ROLE_CONNU) { box.innerHTML = ""; return; }
  const pet = estPeteur;
  const sig = `${pet}|${STATE.phase}`;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const lignes = STATE.phase === "vote"
    ? ["<b>Cliquez sur un siège</b> du plan pour voter.",
       "Une voix chacun, sans retour en arrière.",
       "Un siège resté muet est <b>signalé en orange</b>."]
    : (pet
      ? ["Lâchez vos pièces <b>quand ça parle</b>, jamais dans un silence.",
         "<b>Parlez</b> comme les autres : le silence vous désigne.",
         "La pression monte — au maximum, l'Incident part seul."]
      : ["Repérez <b>la direction</b> de chaque son sur le plan.",
         "Utilisez votre pièce pour <b>brouiller les pistes</b>.",
         "Notez ce que vous entendez, vous voterez à la fin."]);
  box.innerHTML = `<div class="memo ${pet ? "pet" : "inn"}">
    <div class="k">Aide-mémoire</div>
    <p class="obj">${STATE.phase === "vote" ? "Désignez un siège"
      : pet ? "Tenir la séance sans être désigné" : "Identifier le responsable"}</p>
    <ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul>
  </div>`;
}


// ---------------------------------------------------------------------------
// Annonces de phase
//
// Le jeu change d'état six fois par manche, sans jamais le dire autrement que par
// un intitulé discret en haut d'écran. Résultat : même l'auteur du jeu n'a pas
// trouvé où voter. Chaque bascule affiche donc une annonce en clair — le verbe
// d'abord, l'endroit ensuite — pendant deux secondes et demie, sans bloquer le
// clic.
// ---------------------------------------------------------------------------
let annonceTimer = null, sigAnnonce = "";

function annoncer(titre, sous, ton) {
  const el = $("#annonce");
  if (!el) return;
  el.className = "on" + (ton ? " " + ton : "");
  el.innerHTML = `<div class="an-carte"><p class="an-t">${titre}</p>${sous ? `<p class="an-s">${sous}</p>` : ""}</div>`;
  if (annonceTimer) clearTimeout(annonceTimer);
  annonceTimer = setTimeout(() => { el.className = ""; }, 2600);
}

// Ce que le joueur doit faire, à cet instant précis, selon son propre rôle dans
// la phase — un intervenant du débat ne reçoit pas la même consigne que la salle.
function annonceDePhase() {
  if (!STATE) return;
  const sp = STATE.sousPhase || "";
  const cle = `${STATE.phase}|${sp}|${STATE.debat ? STATE.debat.i : 0}`;
  if (cle === sigAnnonce) return;
  const premier = sigAnnonce === "";
  sigAnnonce = cle;
  if (premier) return;                       // pas d'annonce à l'arrivée sur la page
  const jeDebats = !!(maTribune && STATE.debat && maTribune.i === STATE.debat.i);

  if (STATE.phase === "meeting" && sp === "debat")
    return jeDebats
      ? annoncer("À VOUS", "Vous êtes au débat. Votre contradicteur est assis droit en face de vous.", "parole")
      : annoncer("ÉCOUTEZ", "Deux voix vont s'affronter. Vous ne savez pas lesquelles — repérez-les à l'oreille.");

  if (STATE.phase === "meeting" && sp === "vote-debat")
    return jeDebats
      ? annoncer("VOUS ÊTES JUGÉ", "La salle désigne lequel des deux n'a pas défendu sa position.", "act")
      : annoncer("VOTEZ", "Cliquez sur le siège de celui qui n'a pas défendu sa position, dans le plan de salle.", "act");

  if (STATE.phase === "meeting" && sp === "deliberation")
    return annoncer("DÉLIBÉREZ", "Tous les micros sont ouverts. Confrontez ce que vous avez entendu.", "parole");

  if (STATE.phase === "meeting" && !sp)
    return annoncer("SÉANCE OUVERTE", "Les micros sont ouverts. Parlez — et surveillez d'où viennent les sons.", "parole");

  if (STATE.phase === "vote")
    return annoncer("SCRUTIN", "Cliquez sur le siège du responsable, dans le plan de salle à gauche.", "act");

  if (STATE.phase === "results")
    return annoncer("PROCÈS-VERBAL", "Le Comité rend ses conclusions.");

  if (STATE.phase === "intro")
    return annoncer("OUVERTURE", "Prenez connaissance de votre mandat.");
}

// Bandeau planté SUR le plan de salle, là où le clic doit avoir lieu. La consigne
// était au centre de l'écran et la cible à gauche : le lien ne se faisait pas.
function majAppelPlan(votable) {
  const plan = document.querySelector(".plan");
  if (!plan) return;
  plan.classList.toggle("actif", !!votable && !myVote);
  let ap = $("#planappel");
  if (votable && !myVote) {
    if (!ap) {
      ap = document.createElement("p");
      ap.id = "planappel"; ap.className = "plan-appel";
      plan.insertBefore(ap, plan.firstChild);
    }
    ap.innerHTML = `<span class="fl">▼</span><span>${STATE.phase === "vote"
      ? "Cliquez sur un siège pour voter"
      : "Cliquez sur le siège de l'intervenant défaillant"}</span>`;
  } else if (ap) ap.remove();
}

const PHASES = {
  intro: "Ouverture de séance", meeting: "Séance en cours", blanc: "Suspension",
  vote: "Scrutin", results: "Procès-verbal", final: "Clôture"
};
function renderState() {
  if (!STATE) return;
  majMicro();
  const etat = $("#etat");
  if (etat) { etat.textContent = STATE.phase === "lobby" ? "en attente" : PHASES[STATE.phase] || STATE.phase; etat.className = "pastille on"; }
  const rc = $("#refcode"); if (rc && STATE.code) { rc.textContent = STATE.code; rc.classList.remove("hide"); }

  if (STATE.phase === "lobby") {
    show("lobby");
    // Le seul avertissement qui subsiste : celui que le joueur a lui-même provoqué
    // en réactivant le traitement micro. Aucun message sur le navigateur — le
    // problème est corrigé, et désigner un navigateur ne ferait qu'inquiéter
    // quelqu'un qui n'a plus rien à corriger.
    const av = $("#avis");
    if (av) {
      const trait = localStorage.getItem("qafc_aec") === "1";
      if (mainsLibres) {
        av.classList.remove("hide");
        av.innerHTML = `<b>Votre casque est passé en mode « mains libres ».</b> C'est ce qui arrive à un
          casque Bluetooth dès qu'on utilise son microphone : la liaison abandonne la stéréo pour un
          canal de communication monophonique. <b>La spatialisation ne peut pas fonctionner ainsi</b>,
          et aucun réglage du jeu n'y changera rien.<br>
          Deux solutions : choisissez ci-dessous <b>le microphone intégré</b> de l'appareil — le casque
          restera alors en stéréo — ou branchez un <b>casque filaire</b>.`;
      } else if (trait) {
        av.classList.remove("hide");
        av.innerHTML = `<b>Traitement micro activé.</b> Annulation d'écho, réduction de bruit
          et correction de gain sont en service. Cette chaîne dégrade fortement la spatialisation.
          Décochez-la sur l'écran d'accueil si vous portez un casque — c'est-à-dire toujours.`;
      } else av.classList.add("hide");
    }
    $("#lcode").textContent = STATE.code;
    const n = STATE.seats.filter(Boolean).length;
    $("#lcount").textContent = n + " / 6";
    $("#llist").innerHTML = STATE.seats.filter(Boolean).map(s =>
      `<li><span class="num">SIÈGE ${String(s.seat + 1).padStart(2, "0")}</span>
        <span class="sig">${esc(s.nom)}</span>
        <span class="role">${s.id === STATE.hostId ? "président" : "membre"}</span></li>`).join("");
    $("#lhint").textContent = n < 3
      ? "Trois participants au minimum pour ouvrir la séance."
      : (n < 5 ? "En dessous de cinq participants, l'identification est très difficile. Six est l'effectif nominal."
               : "Effectif suffisant. La séance peut être ouverte.");
    const host = ME === STATE.hostId;
    $("#hostbox").classList.toggle("hide", !host);
    $("#waithost").classList.toggle("hide", host);
    $("#start").disabled = n < 3;
    return;
  }
  if (STATE.phase === "final") {
    jeton.effacer();
    show("res");
    $("#pvstamp").textContent = "Clos";
    $("#resnext").innerHTML = ME === STATE.hostId
      ? `Séance levée. <button class="btn p" id="again" style="margin-left:10px">Convoquer à nouveau</button>`
      : "Séance levée. Le président peut convoquer une nouvelle réunion.";
    const a = $("#again"); if (a) a.onclick = () => ws.send(JSON.stringify({ type: "restart" }));
    majMicro();
    return;
  }
  if (STATE.phase === "results") return;

  show("game");
  if (STATE.phase !== "meeting") $("#pressionbox").classList.add("hide");
  else if (estPeteur) $("#pressionbox").classList.remove("hide");
  $("#blanc").classList.toggle("hide", STATE.phase !== "blanc");
  $("#gphase").textContent = PHASES[STATE.phase] || STATE.phase;
  $("#gtitre").textContent = `Séance ${STATE.round} sur ${STATE.rounds}`;
  const pc = $("#plancapt");
  if (pc) pc.textContent = STATE.phase === "meeting" && STATE.sousPhase === "debat"
    ? "places rebattues" : STATE.seats.filter(Boolean).length + " présents";
  const votable = STATE.phase === "vote"
    || (STATE.phase === "meeting" && STATE.sousPhase === "vote-debat" && !(maTribune && STATE.debat && maTribune.i === STATE.debat.i));
  sigPlan = planSig(votable);
  $("#tblbox").innerHTML = drawTable(votable);
  majAppelPlan(votable);
  annonceDePhase();
  $("#votebox").classList.toggle("hide", STATE.phase !== "vote");
  // le mandat ne sert que pendant l'ouverture : ensuite l'aide-mémoire de la
  // colonne de gauche prend le relais, en plus court et en permanence
  $("#rolebox").classList.toggle("hide", STATE.phase !== "intro");
  majTribune();
  majMemo();
  renderHand(true);
  if (STATE.phase === "intro") loadCarnet();
  if (STATE.phase !== "intro" && briefPhaseVue) fermerBrief();
  majMicro();
}

setInterval(() => {
  if (!STATE || !STATE.endsAt) return;
  const s = Math.max(0, Math.round((STATE.endsAt - Date.now()) / 1000));
  const el = $("#gtime"); if (!el) return;
  el.classList.toggle("calme", STATE.phase !== "vote" && s > 20);
  // la fin de séance est volontairement floue : pas de compte à rebours final
  if (STATE.phase === "meeting") el.textContent = s + " s";
  else el.textContent = s + " s";
}, 250);

// --- réseau ------------------------------------------------------------------
// Reprise de séance : le serveur délivre un jeton à l'inscription. Tant que la
// partie tourne, le siège est conservé — on peut donc recharger la page, perdre
// le réseau ou fermer l'onglet par erreur sans sortir du jeu.
const jeton = {
  lire: (c) => { try { const j = JSON.parse(localStorage.getItem("qafc_reprise") || "{}"); return j.code === c ? j.token : null; } catch { return null; } },
  ecrire: (c, t) => { try { localStorage.setItem("qafc_reprise", JSON.stringify({ code: c, token: t, at: Date.now() })); } catch {} },
  effacer: () => { try { localStorage.removeItem("qafc_reprise"); } catch {} }
};

let monNom = "", monCode = "", tentatives = 0, reconnexion = null, partieEnCours = false;

function bandeauReseau(txt, cls) {
  const el = $("#reseau"); if (!el) return;
  el.classList.toggle("hide", !txt);
  if (txt) { el.className = "reseau " + (cls || ""); el.innerHTML = txt; }
}

function connect(nom, code) {
  monNom = nom; monCode = code || monCode;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    const t = jeton.lire((monCode || "").toUpperCase());
    ws.send(JSON.stringify({ type: "join", nom: monNom, code: monCode, token: t || undefined }));
  };
  ws.onmessage = async (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case "err":
        $("#err").textContent = m.msg;
        jeton.effacer(); partieEnCours = false;
        $("#go").disabled = false;
        break;
      case "joined":
        if (m.motionDispo !== undefined) motionDispo = m.motionDispo;
        ME = m.id; SEAT = m.seat; SOUNDS = m.sounds; MINSPEECH = m.minSpeech;
        monCode = m.code; partieEnCours = true; tentatives = 0;
        if (m.token) jeton.ecrire(m.code, m.token);
        if (m.ice && m.ice.length) RTC = { iceServers: m.ice };
        if (RELAY_ONLY) {
          RTC.iceTransportPolicy = "relay";
          const el = $("#reseau");
          if (el) { el.classList.remove("hide"); el.className = "reseau";
            el.innerHTML = "<b>Mode relais forcé.</b> Toutes les liaisons doivent transiter par le serveur TURN. Si une seule voix passe, le TURN fonctionne."; }
        }
        history.replaceState(null, "", "?r=" + m.code);
        bandeauReseau(m.reprise
          ? "<b>Séance reprise.</b> Vous avez retrouvé votre siège, votre rôle et votre dossier."
          : "", m.reprise ? "ok" : "");
        if (m.reprise) setTimeout(() => bandeauReseau(""), 6000);
        break;
      case "state": {
        const avant = STATE ? `${STATE.sousPhase}|${STATE.debat ? STATE.debat.i : 0}` : "";
        STATE = m.state;
        // Les places sont rebattues à chaque manche : sans cette mise à jour, les
        // voix et les pets resteraient spatialisés depuis les anciennes positions.
        // Invisible à l'écran, catastrophique à l'oreille.
        const moi = (STATE.seats || []).find(s => s && s.id === ME);
        if (moi && moi.seat !== SEAT) { SEAT = moi.seat; sigPlan = ""; buffers.clear(); }
        if (`${STATE.sousPhase}|${STATE.debat ? STATE.debat.i : 0}` !== avant) { myVote = null; sigPlan = ""; }
        refreshPositions(); renderState();
        break;
      }
      case "peers":
        m.peers.forEach(p => { if (p.id !== ME) makePeer(p.id, p.seat, ME < p.id); });
        break;
      case "peerleft":
      case "peerreset": {
        const p = peers.get(m.id);
        if (p) { clearInterval(p.stats); try { p.pc.close(); } catch {} peers.delete(m.id); }
        sigPlan = "";
        break;
      }
      case "signal": onSignal(m.from, m.data); break;
      case "role": {
        HAND = m.hand; if (!m.reprise) { myVote = null; maTribune = null; }
        speechAcc = 0; speechSent = 0;
        if (!m.reprise) cooldownUntil = 0;
        sigHand = ""; sigPlan = "";
        if (m.cooldown) COOLDOWN = m.cooldown;
        const pet = m.role === "peteur";
        estPeteur = pet; ROLE_CONNU = true;
        if (!m.reprise) ouvrirBrief(pet, m.nbFarters, m.hand.length);
        $("#memobox").dataset.sig = "";
        $("#pressionbox").classList.toggle("hide", !pet);
        if (pet) majPression(0);
        $("#rolebox").innerHTML = `<div class="mandat ${pet ? "pet" : "inn"}">
          <div class="t">Mandat confidentiel — destruction après lecture</div>
          ${pet
            ? `Vous êtes <b>À L'ORIGINE DES FAITS</b>. Tenez la séance sans vous faire désigner.
               ${m.hand.length} pièce${m.hand.length > 1 ? "s" : ""} à votre disposition, à ${COOLDOWN} s d'intervalle minimum.`
            : `Vous êtes <b>AU-DESSUS DE TOUT SOUPÇON</b>. Identifiez ${m.nbFarters > 1 ? `les ${m.nbFarters} responsables` : "le responsable"}.
               Une pièce vous est allouée : le Comité vous encourage à brouiller les pistes.`}
          </div>`;
        break;
      }
      case "hand":
        HAND = m.hand;
        if (m.cooldownMs) cooldownUntil = Date.now() + m.cooldownMs;
        renderHand(true);
        break;
      case "sfx":
        playSfx(m.seat, m.sound, m.incident);
        flash(m.incident);
        break;
      case "voted": $("#votecount").textContent = `${m.count} / ${m.total} ont voté.`; break;
      case "pression": majPression(m.v, m.gel); break;
      case "parole":
        niveauParole = m.n;
        aLaParole = m.n >= 1;
        if (tribune) tribune.gain.setTargetAtTime(m.n, AC.currentTime, 0.05);
        majTribune();
        break;
      case "tribune": maTribune = m; majTribune(); break;
      case "place": SEAT = m.seat; sigPlan = ""; buffers.clear(); refreshPositions(); renderState(); break;
      case "maMotion": motionDispo = false; majTribune(); break;
      case "motionEtat": motionDispo = m.dispo; majTribune(); break;
      case "motionOuverte": case "motionClose": majTribune(); break;
      case "resultatDebat": montrerRevelation(m); break;
      case "votedDebat": $("#tr-etat").dataset.count = `${m.count} / ${m.total} se sont prononcés.`; majTribune(); break;
      case "incident": montrerIncident(); break;
      case "reveal": renderReveal(m); break;
      case "musique": playMusique(m.piste); break;
    }
  };
  ws.onclose = () => {
    if (!partieEnCours) { $("#err").textContent = "Connexion perdue. Rechargez la page."; return; }
    const attente = Math.min(8000, 800 * Math.pow(1.6, tentatives++));
    bandeauReseau(`<b>Liaison interrompue.</b> Reprise de la séance dans ${Math.round(attente / 1000)} s…
      (tentative ${tentatives}) — gardez cet onglet ouvert.`, "ko");
    clearTimeout(reconnexion);
    reconnexion = setTimeout(() => connect(monNom, monCode), attente);
  };
}

function flash(fort) {
  const f = $("#flash");
  f.style.background = fort ? "#b8552f" : "#fff";
  f.style.opacity = fort ? ".16" : ".05";
  setTimeout(() => f.style.opacity = 0, fort ? 240 : 90);
}

let musiqueEl = null;
function playMusique(piste) {
  try {
    if (musiqueEl) musiqueEl.pause();
    musiqueEl = new Audio(`music/${piste}.mp3`);
    musiqueEl.volume = 0.6;
    musiqueEl.play().catch(() => {});
  } catch {}
}

function renderReveal(m) {
  show("res");
  const out = m.reveal.find(r => r.id === m.outId);
  $("#pvstamp").textContent = out ? (out.role === "peteur" ? "Fondé" : "Non fondé") : "Sans suite";
  $("#pvstamp").className = "tampon-coin tampon " + (out && out.role === "peteur" ? "sauge" : "");
  $("#restitle").textContent = out
    ? `${out.nom} est exclu de la séance`
    : "Aucune exclusion prononcée";
  $("#ressub").textContent = out
    ? (out.role === "peteur"
        ? "L'intéressé était bien à l'origine des faits"
        : "L'intéressé n'y était pour rien — le Comité présente ses regrets")
    : "Les voix se sont dispersées, la séance suit son cours";
  $("#restable").innerHTML =
    `<div class="pv-wrap"><table class="pv"><thead><tr>
      <th>Participant</th><th>Qualité</th><th>Émissions</th><th>Voix reçues</th><th>Débats</th><th>Participation</th><th>Séance</th><th>Cumul</th>
    </tr></thead><tbody>` +
    m.reveal.map(r => `<tr class="${r.id === m.outId ? "exclu" : ""}">
      <td><span class="nom">${esc(r.nom)}</span> <span class="sig">siège ${r.seat + 1}</span></td>
      <td><span class="etiq ${r.role === "peteur" ? "pet" : "inn"}">${r.role === "peteur" ? "à l'origine" : "hors de cause"}</span></td>
      <td>${r.emissions || "—"}${r.incidents ? ` <span class="etiq inc">${r.incidents} incident${r.incidents > 1 ? "s" : ""}</span>` : ""}</td>
      <td>${r.votes || "—"}</td>
      <td class="pts ${r.debat > 0 ? "plus" : ""}">${r.debat > 0 ? "+" + r.debat : (r.debat || "—")}</td>
      <td>${r.speech} s ${r.muet ? '<span class="etiq muet">peu intervenu</span>' : ""}</td>
      <td class="pts ${r.pts > 0 ? "plus" : ""}">${r.pts > 0 ? "+" + r.pts : r.pts}</td>
      <td class="pts"><b>${r.total}</b></td></tr>`).join("") +
    `</tbody></table></div>`;
  $("#resnext").textContent = "Séance suivante dans quelques instants — le Secrétariat";
}

// --- interactions ------------------------------------------------------------
$("#go").onclick = async () => {
  const nom = $("#nom").value.trim() || "Anonyme";
  const code = $("#code").value.trim().toUpperCase();
  $("#go").disabled = true; $("#err").textContent = "";
  try { await initAudio(); } catch (e) {
    $("#err").textContent = "Micro refusé ou indisponible. Le jeu ne peut pas fonctionner sans."; $("#go").disabled = false; return;
  }
  connect(nom, code);
};
document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-r]"); if (r) {
    document.querySelectorAll("[data-r]").forEach(b => b.classList.toggle("actif", b === r));
    ws.send(JSON.stringify({ type: "config", rounds: +r.dataset.r })); return;
  }
  const c = e.target.closest(".carte"); if (c && !c.disabled) { ws.send(JSON.stringify({ type: "fart", uid: c.dataset.uid })); return; }
  const v = e.target.closest("[data-vote]"); if (v) {
    myVote = v.dataset.vote;
    const debat = STATE && STATE.sousPhase === "vote-debat";
    ws.send(JSON.stringify({ type: debat ? "voteDebat" : "vote", target: myVote }));
    sigPlan = planSig(true);
    $("#tblbox").innerHTML = drawTable(true);
    majAppelPlan(true);           // le bandeau d'appel disparaît dès le vote posé
    annoncer("VOTE ENREGISTRÉ", "Sans retour en arrière possible.", "act");
  }
});
$("#start").onclick = () => ws.send(JSON.stringify({ type: "start" }));

// Test casque : un pet à chaque position, dans l'ordre, avec le libellé affiché.
const POSNOM = {
  1: "position 1 — 60° à votre DROITE", 2: "position 2 — 30° à droite", 3: "position 3 — EN FACE",
  4: "position 4 — 30° à gauche", 5: "position 5 — 60° à votre GAUCHE"
};
$("#test").onclick = async () => {
  const out = $("#testout"), btn = $("#test");
  btn.disabled = true;
  const dire = (t, cls) => { out.className = "aide " + (cls || ""); out.innerHTML = t; };

  if (mainsLibres) {
    dire(`<b>Casque en mode « mains libres ».</b> La capture du micro de votre casque Bluetooth a fait
      tomber la liaison en monophonie. Choisissez le microphone intégré de l'appareil, ou passez au
      filaire — sans quoi aucune des cinq positions ne se distinguera.`, "ko");
    btn.disabled = false; return;
  }
  const mx = AC.destination.maxChannelCount;
  if (mx > 2) {
    dire(`<b>Périphérique multicanal détecté (${mx} canaux).</b> Votre casque s'annonce en surround.
      La sortie a été forcée en stéréo, mais si l'essai reste plat, désactivez le mode 7.1 dans le
      logiciel du casque (Logitech G HUB → Surround) et rechargez la page.`, "ko");
  }
  if (sortieMono()) {
    dire(`<b>Sortie audio monophonique détectée.</b> Le système ne propose qu'un seul canal :
      aucune spatialisation n'est possible. Vérifiez que votre casque n'est pas en mode
      « mains libres » (Bluetooth HFP) et qu'aucune option d'accessibilité « audio mono » n'est active.`, "ko");
    btn.disabled = false; return;
  }

  // 1er temps : la sortie WebAudio est-elle réellement stéréo ?
  dire("Voie A (moteur du jeu) — bip <b>à gauche</b>");  bip("G");
  await new Promise(r => setTimeout(r, 1100));
  dire("Voie A (moteur du jeu) — bip <b>à droite</b>");  bip("D");
  await new Promise(r => setTimeout(r, 1400));

  // 2e temps : le même bip par le lecteur audio classique, chemin différent
  dire("Voie B (lecteur classique) — bip <b>à gauche</b>");  bipElement("G");
  await new Promise(r => setTimeout(r, 1100));
  dire("Voie B (lecteur classique) — bip <b>à droite</b>");  bipElement("D");
  await new Promise(r => setTimeout(r, 1400));

  // 2e temps : le tour de table binaural
  const snd = (SOUNDS.find(s => s.loc === 3) || SOUNDS[0]).id;
  const voie = voieB ? "B (lecteur classique)" : "A (moteur du jeu)";
  for (let rel = 1; rel <= 5; rel++) {
    dire(`<span class="mono">Souffle joué en mode ${voie}</span><br>${POSNOM[rel]}`);
    try { await jouerSon(`sfx/${snd}_${rel}.mp3?v=${SFX_VER}`, 1.0); } catch {}
    await new Promise(r => setTimeout(r, 1600));
  }
  dire(`<b>Trois questions.</b><br>
    1. Les bips de la <b>voie A</b> étaient-ils bien séparés gauche / droite ?<br>
    2. Et ceux de la <b>voie B</b> ?<br>
    3. Le souffle s'est-il déplacé de votre droite vers votre gauche ?<br>
    Le souffle vient d'être joué en <b>mode ${voieB ? "B" : "A"}</b>, exactement comme il le sera en séance.
    Si les bips de la voie B étaient séparés mais pas le souffle, cochez « Utiliser le mode B »
    et relancez cet essai.`, "");
  btn.disabled = false;
};

// Test des canaux SANS microphone. Décisif : si la latéralisation est correcte ici
// et fausse une fois le micro ouvert, c'est l'acquisition du micro qui fait basculer
// la sortie en mono (profil « mains libres » d'un casque Bluetooth, chemin AEC…).
$("#testcx").onclick = async () => {
  const out = $("#testcxout"), btn = $("#testcx");
  btn.disabled = true;
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") { try { await AC.resume(); } catch {} }
  const dire = (t, cls) => { out.className = "aide " + (cls || ""); out.innerHTML = t; };
  if (sortieMono()) {
    dire(`<b>Sortie monophonique.</b> Le système ne propose qu'un seul canal — le problème est
      dans les réglages de l'ordinateur, pas dans le jeu.`, "ko");
    btn.disabled = false; return;
  }
  dire("Voie A — bip <b>à gauche</b>"); bip("G");
  await new Promise(r => setTimeout(r, 1100));
  dire("Voie A — bip <b>à droite</b>"); bip("D");
  await new Promise(r => setTimeout(r, 1400));
  dire("Voie B — bip <b>à gauche</b>"); bipElement("G");
  await new Promise(r => setTimeout(r, 1100));
  dire("Voie B — bip <b>à droite</b>"); bipElement("D");
  await new Promise(r => setTimeout(r, 1200));
  dire(`Si les deux bips étaient bien séparés, votre sortie est stéréo et le micro n'est pas encore ouvert.
    Refaites l'essai complet dans la salle d'attente : s'il devient mono à ce moment-là, c'est
    <b>l'ouverture du micro</b> qui écrase la stéréo — casque Bluetooth passé en mode mains libres,
    le plus souvent.`, "");
  btn.disabled = false;
};

appliquerSeuil(seuil);
// --- tribune / débat contradictoire -----------------------------------------
function majTribune() {
  const box = $("#tribunebox");
  if (!box || !STATE) return;
  const sp = STATE.sousPhase;
  if (STATE.phase !== "meeting" || !sp) { box.classList.add("hide"); return; }
  if (sp !== "deliberation" && !STATE.debat) { box.classList.add("hide"); return; }
  box.classList.remove("hide");

  if (sp === "deliberation") {
    box.classList.remove("moi", "motion");
    $("#tr-num").textContent = "";
    $("#tr-actions").innerHTML = "";
  }

  const d = STATE.debat || { i: 0, n: 1, motion: "" };
  const jeDebats = !!(maTribune && maTribune.i === d.i);
  const motionEnCours = STATE.motionEnCours;

  box.classList.toggle("moi", jeDebats && sp === "debat" && !motionEnCours);
  box.classList.toggle("motion", !!motionEnCours);

  if (sp !== "deliberation") {
    // l'intitulé est déjà dans l'eyebrow — on met ici la seule info qui manque
    $("#tr-num").textContent = sp === "debat" ? "motion soumise au débat" : "";
    $("#tr-motion").textContent = d.motion;
  }

  const etat = $("#tr-etat"), act = $("#tr-actions");
  etat.className = "tr-etat";
  act.innerHTML = "";

  if (motionEnCours) {
    $("#tr-eyebrow").textContent = "Motion d'ordre";
    if (aLaParole) {
      etat.className = "tr-etat parole";
      etat.innerHTML = "<b>Vous avez la parole.</b> Quinze secondes, et vous êtes la seule voix de la pièce — donc parfaitement repérable. Le débat reprendra où il s'est arrêté.";
    } else {
      etat.innerHTML = "Un participant a demandé la parole. Les débats sont suspendus. <b>Personne ne sait qui c'est.</b>";
    }
    return;
  }

  if (sp === "debat") {
    $("#tr-eyebrow").textContent = "Débat contradictoire";
    if (jeDebats) {
      etat.className = "tr-etat parole";
      etat.innerHTML = `<span class="tr-camp ${maTribune.camp}">${maTribune.camp === "pour" ? "vous êtes pour" : "vous êtes contre"}</span>
        <b>Vous avez la parole.</b> Votre contradicteur est assis <b>droit en face de vous</b>.
        Défendez cette position — le contenu importe peu, le silence beaucoup : la salle désignera
        celui des deux qui n'aura pas défendu la sienne.`;
    } else {
      etat.innerHTML = `Deux participants ont la parole, <b>et vous ne savez pas lesquels</b>.
        Ils sont assis <b>face à face</b> — leurs voix vous parviennent donc de deux directions
        nettement séparées. Écoutez : il faudra les identifier pour voter.`;
      if (motionDispo) {
        const b = document.createElement("button");
        b.className = "btn s"; b.id = "btnmotion"; b.textContent = "Motion d'ordre";
        b.onclick = () => { ws.send(JSON.stringify({ type: "motion" })); b.disabled = true; };
        act.appendChild(b);
        const p = document.createElement("p"); p.className = "aide";
        p.textContent = "Une seule par partie. Quinze secondes de parole pleine — mais vous couvrez toute la table pendant ce temps.";
        act.appendChild(p);
      }
    }
    return;
  }

  if (sp === "vote-debat") {
    $("#tr-eyebrow").textContent = "La salle se prononce";
    if (jeDebats) {
      etat.innerHTML = "<b>Vous êtes jugé.</b> La salle désigne lequel des deux intervenants n'a pas défendu sa position.";
    } else {
      etat.innerHTML = `Désignez sur le plan <b>celui des deux intervenants qui n'a pas défendu sa position</b>.
        Un vote porté sur un siège qui ne débattait pas sera nul.
        <br><span class="aide">${etat.dataset.count || ""}</span>`;
    }
    return;
  }

  if (sp === "revelation") {
    $("#tr-eyebrow").textContent = "Dépouillement";
    etat.innerHTML = "Résultat du débat ci-dessous.";
    return;
  }

  if (sp === "deliberation") {
    $("#tr-eyebrow").textContent = "Délibération";
    $("#tr-motion").textContent = "Les micros sont tous ouverts.";
    etat.className = "tr-etat parole";
    etat.innerHTML = `<b>La parole est à tous.</b> C'est le moment de dire ce que vous avez entendu,
      et d'où. Les pièces sonores restent jouables — et le brouhaha n'a jamais autant protégé.`;
  }
}

function montrerRevelation(m) {
  const box = $("#revelbox");
  box.classList.remove("hide");
  const tot = m.nuls + m.valides;
  const err = !tot ? "Personne ne s'est prononcé."
    : m.nuls === 0 ? `<span class="ok-id">Les ${tot} votes ont bien visé un intervenant.</span>`
    : m.nuls === 1 ? `<span class="err-id">Un vote sur ${tot} portait sur un siège qui ne débattait pas.</span>`
    : `<span class="err-id">${m.nuls} votes sur ${tot} portaient sur un siège qui ne débattait pas.</span>`;
  box.innerHTML = `<h4>Débat ${m.i} sur ${m.n} — dépouillement</h4>
    <p>Le débat opposait le <b>siège ${m.pour + 1} (${esc(m.nomPour || "")})</b>, pour,
       au <b>siège ${m.contre + 1} (${esc(m.nomContre || "")})</b>, contre.</p>
    <p>${err}</p>
    <p>${m.defaillant !== null
        ? `<b>${esc(m.nomDefaillant)}</b> est déclaré défaillant : −1 point, et +1 pour son contradicteur.`
        : "Les voix se sont dispersées : aucun défaillant, aucun point."}</p>`;
  clearTimeout(montrerRevelation.t);
  montrerRevelation.t = setTimeout(() => box.classList.add("hide"), 7000);
}

// --- pression intestinale ----------------------------------------------------
let ROLE_CONNU = false;
let estPeteur = false, maTribune = null, motionDispo = true, aLaParole = false;
function majPression(v, gel) {
  const box = $("#pressionbox"); if (!box) return;
  box.classList.remove("hide");
  box.classList.toggle("chaud", !gel && v >= 70 && v < 90);
  box.classList.toggle("critique", !gel && v >= 90);
  $("#pressionbar").style.width = v + "%";
  $("#pressionval").textContent = gel ? "—" : v + " %";
  const t = $("#pressiontxt");
  if (gel) t.textContent = "Récupération en cours. Rien à craindre pendant quelques secondes — profitez-en pour vous justifier.";
  else if (v >= 90) t.textContent = "Saturation imminente. Émettez maintenant, ou le corps le fera pour vous.";
  else if (v >= 70) t.textContent = "La situation se tend. Cherchez un moment bruyant.";
  else if (v >= 35) t.textContent = "Pression en hausse. Une pièce longue soulage davantage qu'une brève.";
  else t.textContent = "Situation maîtrisée.";
}

function montrerIncident() {
  const el = $("#incident");
  el.classList.remove("hide");
  clearTimeout(montrerIncident.t);
  montrerIncident.t = setTimeout(() => el.classList.add("hide"), 6000);
}

// --- règlement intérieur -----------------------------------------------------
const regl = $("#regl");
const basculeRegl = (on) => {
  const ouvert = on === undefined ? !regl.classList.contains("on") : on;
  regl.classList.toggle("on", ouvert);
  regl.setAttribute("aria-hidden", ouvert ? "false" : "true");
};
$("#reglouvre").onclick = () => basculeRegl(true);
$("#reglferme").onclick = () => basculeRegl(false);
$("#reglfond").onclick = () => basculeRegl(false);
document.addEventListener("keydown", (e) => {
  // Échap fonctionne partout ; le reste, jamais dans un champ de saisie et jamais
  // avec un modificateur — sinon on détourne Cmd+R, Ctrl+R et compagnie.
  if (e.key === "Escape") { basculeRegl(false); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "?") { e.preventDefault(); basculeRegl(); }
});

const selMic = $("#micro");
if (selMic) {
  selMic.onchange = async () => {
    const out = $("#testout");
    localStorage.setItem("qafc_micro", selMic.value);
    if (out) { out.className = "aide"; out.textContent = "Changement de microphone en cours…"; }
    try {
      await ouvrirMicro(selMic.value);
      if (out) out.innerHTML = "Microphone changé. <b>Relancez l'essai acoustique</b> pour vérifier si la stéréo est revenue.";
    } catch (e) {
      if (out) { out.className = "aide ko"; out.textContent = "Impossible d'ouvrir ce microphone."; }
    }
  };
}

const vbBox = $("#voieb");
if (vbBox) {
  vbBox.checked = voieB;
  vbBox.onchange = () => {
    window.voieB(vbBox.checked);
    const out = $("#testout");
    if (out) { out.className = "aide"; out.innerHTML = `Les pets sont maintenant joués en <b>mode ${vbBox.checked ? "B" : "A"}</b>. Relancez l'essai acoustique pour vérifier.`; }
  };
}

// Le traitement micro est coupé par défaut ; il n'a de sens que sans casque.
const aecBox = $("#aec");
if (aecBox) {
  aecBox.checked = localStorage.getItem("qafc_aec") === "1";
  aecBox.onchange = () => localStorage.setItem("qafc_aec", aecBox.checked ? "1" : "0");
}

const pre = new URLSearchParams(location.search).get("r");
if (pre) $("#code").value = pre.toUpperCase();
(() => {
  try {
    const j = JSON.parse(localStorage.getItem("qafc_reprise") || "{}");
    if (!j.token || Date.now() - (j.at || 0) > 2 * 3600 * 1000) return;
    const b = $("#reprise");
    b.classList.remove("hide");
    b.innerHTML = `Une séance en cours porte la référence <b>${j.code}</b>.
      <button class="btn p" id="reprendre" style="margin-left:12px">Reprendre ma place</button>`;
    $("#reprendre").onclick = async () => {
      $("#reprendre").disabled = true;
      try { await initAudio(); } catch { $("#err").textContent = "Micro indisponible."; $("#reprendre").disabled = false; return; }
      connect($("#nom").value.trim() || "", j.code);
    };
  } catch {}
})();

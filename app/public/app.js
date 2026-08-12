/* Qui a fait ça ?! — client palier 1
   Audio : pets pré-rendus en binaural (HRTF MIT KEMAR), voix spatialisée via PannerNode. */

const $ = (s) => document.querySelector(s);
let ecranCourant = "";
const show = (id) => {
  ["home", "lobby", "game", "res"].forEach(s => $("#" + s).classList.toggle("hide", s !== id));
  // la séance passe en pleine largeur : trois colonnes au lieu d'une bande centrale
  const f = document.querySelector(".feuille");
  if (f) f.classList.toggle("large", id === "game");
  document.body.classList.toggle("en-seance", id === "game");
  // marges renouvelées à chaque changement d'écran, pas à chaque redessin
  if (id !== ecranCourant) { ecranCourant = id; poserMarginalia(); }
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

  // Bus des voix : LIMITEUR de protection, et rien d'autre.
  //
  // Il y avait ici un compresseur à -14 dB et 6:1 sur la somme de toutes les voix.
  // Sur un bus partagé, c'est une porte de priorité déguisée : dès qu'une personne
  // parle fort, la réduction de gain s'applique à TOUT le bus, donc aussi aux
  // autres voix, jusqu'à une dizaine de décibels. En partie, ça s'entend comme
  // « le premier qui parle prend le canal et bloque les autres » — et c'était
  // exactement ça. La mise en forme de chaque voix se fait désormais dans sa
  // propre chaîne, avant le mélange.
  //
  // Ce qui reste ne sert qu'à empêcher la saturation quand cinq personnes parlent
  // en même temps : seuil haut, attaque courte, et une détente lente pour que le
  // gain ne « pompe » pas entre deux syllabes.
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -3; comp.knee.value = 2; comp.ratio.value = 12;
  comp.attack.value = 0.003; comp.release.value = 0.35;
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
  surveillerEmission();
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
      const rmsPre = Math.sqrt(q / b.length);
      if (rmsPre > Math.max(seuilRms(), 0.006)) micActifDepuis = Date.now();
      if (rmsPre > 0.012) captureDepuis = Date.now();   // le micro capte, seuil ou pas
      lvl = Math.max(rmsPre, lvl * 0.82);
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
    majJaugeEmission();
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

  // Compression PAR VOIX, pas sur le mélange. C'est ce qui égalise un interlocuteur
  // trop loin de son micro sans toucher au niveau de qui que ce soit d'autre.
  // Réglage doux : on rattrape les écarts, on n'écrase pas la dynamique — la
  // dynamique est justement ce qui permet de situer un son dans la pièce.
  const cvx = AC.createDynamicsCompressor();
  cvx.threshold.value = -20; cvx.knee.value = 14; cvx.ratio.value = 2;
  cvx.attack.value = 0.008; cvx.release.value = 0.26;

  const pan = AC.createPanner();
  pan.panningModel = "HRTF"; pan.distanceModel = "inverse";
  // Atténuation de distance volontairement adoucie : l'écart voisin/vis-à-vis
  // passe de 5,7 dB à 2,6 dB. On garde l'indice, on ne noie plus celui d'en face.
  pan.refDistance = 1.6; pan.rolloffFactor = 0.7;
  const rel = ((seat - SEAT) + 6) % 6;
  const pos = xyz(rel === 0 ? 3 : rel);
  if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
  else pan.setPosition(pos.x, pos.y, pos.z);
  // Rattrapage : le compresseur de voix n'a pas de gain de compensation intégré,
  // et l'ancien compresseur de bus, lui, remontait tout. Sans ces +5,6 dB, la
  // suppression du ducking se traduirait par « tout le monde est moins fort ».
  const g = AC.createGain(); g.gain.value = 1.9;
  src.connect(hp).connect(pres).connect(cvx).connect(pan).connect(g).connect(voiceBus);

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
      // Niveau réellement ÉMIS, mesuré par le moteur WebRTC lui-même sur la piste
      // qui part. C'est la seule mesure qui distingue « mon micro fonctionne » de
      // « ma voix quitte la machine » : les jauges locales lisent le graphe audio,
      // pas la piste envoyée, et peuvent donc bouger alors que rien ne sort.
      st.forEach(r => {
        if ((r.type === "media-source" || r.type === "outbound-rtp") && r.kind === "audio") {
          if (typeof r.audioLevel === "number") {
            niveauEmis = Math.max(niveauEmis, r.audioLevel); mesureEmission = Date.now();
          }
          if (typeof r.totalAudioEnergy === "number") {
            if (energieEmise != null && r.totalAudioEnergy > energieEmise + 1e-6) niveauEmis = Math.max(niveauEmis, 0.02);
            energieEmise = r.totalAudioEnergy; mesureEmission = Date.now();
          }
        }
      });
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
    // Distinction essentielle, et que le message précédent ratait complètement :
    // une liaison ICE porte les DEUX sens. Si elle est établie, le transport
    // fonctionne, et le TURN n'y est pour rien — le défaut est à l'émission, chez
    // celui qu'on n'entend pas. Le TURN n'est en cause que si rien ne s'établit.
    const etabli = (id) => { const p = peers.get(id); return p && p.st === "connected"; };
    const coupes = pb.filter(s => !etabli(s.id));
    const muets  = pb.filter(s => etabli(s.id));
    if (muets.length) {
      h += `<p class="diag"><b>Aucun son reçu de : ${muets.map(s => esc(s.nom)).join(", ")}</b><br>
        <span class="small">La liaison est pourtant établie, dans les deux sens. Ce n'est donc pas le
        réseau : c'est sa voix qui ne quitte pas sa machine. Qu'il regarde sa jauge
        « ce que la table reçoit » et, si elle reste grise pendant qu'il parle,
        qu'il force l'émission brute.</span></p>`;
    }
    if (coupes.length) {
      h += `<p class="diag"><b>Liaison impossible avec : ${coupes.map(s => esc(s.nom)).join(", ")}</b><br>
        <span class="small">Aucune connexion ne s'établit. C'est le cas que seul un relais TURN
        peut résoudre.</span></p>`;
    }
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


// ---------------------------------------------------------------------------
// Surveillance de l'émission — et secours automatique
//
// Cas observé en partie : A entend B, B n'entend jamais A, alors que les jauges
// de A bougent et que la liaison est établie « en direct (NAT traversé) ». Une
// liaison ICE porte les DEUX sens : si le son passe dans un sens, le transport
// fonctionne, et le TURN n'est pas en cause. Le défaut est donc à l'ÉMISSION.
//
// Ce que A envoie n'est pas son micro brut mais la sortie du graphe WebAudio
// (filtres, compresseur, porte de bruit). Sur certains navigateurs, cette piste
// synthétique part muette dans WebRTC alors que le graphe fonctionne — l'écoute
// de sa propre voix (sidetone) sort de la carte son, pas du réseau, et ne prouve
// donc rien.
//
// On mesure ici ce qui sort réellement, et si le micro est actif depuis plusieurs
// secondes sans que rien ne parte, on bascule sur la piste micro BRUTE. On perd
// la porte de bruit et le compresseur, on garde la voix. C'est le bon compromis.
// ---------------------------------------------------------------------------
let niveauEmis = 0, energieEmise = null, mesureEmission = 0;
let soucisEmission = 0;
let micActifDepuis = 0, captureDepuis = 0, emisVuLe = 0, secoursActif = false, secoursTimer = null;

function basculerSecours(manuel) {
  if (secoursActif || !micTrack) return;
  secoursActif = true;
  peers.forEach(p => {
    try {
      const e = p.pc.getSenders().find(x => x.track && x.track.kind === "audio");
      if (e) e.replaceTrack(micTrack);
    } catch {}
  });
  bandeauReseau(`<b>Émission de secours activée.</b> Votre voix ne quittait pas votre machine :
    le traitement du micro est contourné, elle part maintenant en direct. Le filtrage du bruit
    de fond n'est plus appliqué${manuel ? "" : " — bascule automatique"}.`, "");
  const b = $("#btnsecours"); if (b) { b.textContent = "Émission brute active"; b.disabled = true; }
}
window.basculerSecours = () => basculerSecours(true);

function surveillerEmission() {
  if (secoursTimer) return;
  secoursTimer = setInterval(() => {
    if (!peers.size || secoursActif) return;
    // au moins un pair réellement connecté : sinon le problème est ailleurs
    let connecte = false;
    peers.forEach(p => { if (p.st === "connected") connecte = true; });
    if (!connecte) { niveauEmis = 0; return; }

    if (niveauEmis > 0.002) { emisVuLe = Date.now(); }
    niveauEmis = 0;

    // le micro capte-t-il vraiment quelque chose en ce moment ?
    const micVivant = micActifDepuis && Date.now() - micActifDepuis < 3000;
    if (!micVivant) return;
    // Si le navigateur n'expose aucune mesure d'émission, on ne conclut RIEN :
    // basculer sur une supposition ferait plus de mal que de bien.
    if (!mesureEmission || Date.now() - mesureEmission > 8000) return;
    const silenceEmission = Date.now() - (emisVuLe || dateEcoute);
    if (silenceEmission > 9000) basculerSecours(false);
  }, 1500);
}
let dateEcoute = Date.now();

// Jauge « ce qui sort », affichée à côté de « votre micro ». C'est le seul
// indicateur qui dit à un joueur si la table peut l'entendre.
function majJaugeEmission() {
  const el = $("#lvlout"); if (!el) return;
  const actif = Date.now() - emisVuLe < 2500;
  el.style.width = (actif ? 100 : 0) + "%";
  el.style.background = actif ? "var(--sauge)" : "var(--filet)";
  const t = $("#emisinfo");
  if (t) {
    const capte = Date.now() - captureDepuis < 1500;
    if (!peers.size) t.textContent = "Aucun autre participant pour l'instant.";
    else if (secoursActif) t.textContent = "Émission brute (secours) — votre voix part sans traitement.";
    else if (actif) t.textContent = "Votre voix quitte bien votre machine.";
    else if (capte && !porteOuverte) {
      // Diagnostic le plus fréquent, et le plus facile à corriger soi-même — à
      // condition que le curseur soit atteignable. On déplie donc les réglages,
      // même dans les phases où ils sont normalement escamotés.
      t.innerHTML = "<b>Votre seuil est trop haut.</b> Le micro capte votre voix mais ne s'ouvre pas : baissez le curseur dans les réglages ci-dessous jusqu'à ce que la jauge passe au vert quand vous parlez.";
      soucisEmission = Date.now();
      const rg = $("#reglagesbox");
      if (rg) { rg.classList.remove("hide"); rg.open = true; }
    }
    else if (capte) t.textContent = "Le micro s'ouvre, mais rien ne part encore — patientez deux secondes.";
    else t.textContent = "Rien ne part pour l'instant — c'est normal si vous ne parlez pas.";
  }
}


// ---------------------------------------------------------------------------
// Visibilité — une seule autorité
//
// Principe : à chaque instant, l'écran ne montre que ce dont CE joueur a besoin
// pour CETTE phase, dans SON rôle. Tout le reste disparaît. Un élément affiché
// « au cas où » est un élément que le joueur doit écarter mentalement, et c'est
// ce coût-là qui rendait l'interface illisible.
//
// Toutes les décisions sont ici, en un seul endroit : c'est la seule façon de
// pouvoir répondre à « pourquoi je vois ça maintenant ? ».
// ---------------------------------------------------------------------------
function majVisibilite() {
  if (!STATE) return;
  const ph = STATE.phase, sp = STATE.sousPhase || "";
  const enSeance = ph === "meeting";
  const auScrutin = ph === "vote";
  const jeDebats = !!(maTribune && STATE.debat && maTribune.i === STATE.debat.i);

  const mq = (sel, montre) => { const e = $(sel); if (e) e.classList.toggle("hide", !montre); };

  // Plan de salle — l'outil de perception, et la cible du vote. Inutile à
  // l'ouverture, où il n'y a encore rien à situer.
  mq("#plancarte", enSeance || auScrutin);

  // Pression — au responsable seul, et seulement tant qu'il peut agir dessus.
  mq("#pressionbox", estPeteur && enSeance);

  // Mandat — remplacé par l'aide-mémoire dès que la séance s'ouvre.
  mq("#rolebox", ph === "intro");

  // Dossier de pièces — jouable en séance uniquement. Pendant qu'on est jugé au
  // débat, on garde ses pièces : c'est le seul moment où les lâcher est habile.
  mq("#handbox", enSeance);

  // Carnet — on y note ce qu'on entend, et on le relit pour voter. Nulle part
  // ailleurs.
  mq("#carnetbox", enSeance || auScrutin);

  // Jauges micro — visibles tant qu'on peut parler ; muettes à l'ouverture et
  // pendant la suspension, où elles n'informent de rien. Sauf en cas de souci
  // d'émission : c'est là que le diagnostic s'affiche, le cacher n'aurait aucun sens.
  const souci = Date.now() - soucisEmission < 15000;
  mq("#micbox", enSeance || auScrutin || souci);

  // Réglages — on les règle une fois, à l'accueil. En séance ils sont repliés,
  // accessibles en un clic si quelque chose cloche.
  // …sauf si l'émission pose problème : dans ce cas les curseurs sont la solution,
  // et les cacher reviendrait à décrire une panne sans donner l'outil pour la lever.
  const rg = $("#reglagesbox");
  if (rg) {
    rg.classList.toggle("hide", !(enSeance || auScrutin) && !souci);
    if ((enSeance || auScrutin) && !souci) rg.open = false;
  }

  // Aide-mémoire — masqué pendant le débat et son scrutin : la tribune dit déjà
  // quoi faire, et deux consignes concurrentes valent moins qu'une.
  mq("#memobox", (enSeance && !["debat", "vote-debat"].includes(sp)) || auScrutin);

  // Chronomètre — il n'a de sens que si une échéance existe.
  const ch = $("#gtime");
  if (ch) ch.classList.toggle("hide", !STATE.endsAt);

  // Pendant le débat, celui qui parle n'a rien d'autre à faire que parler : on
  // efface le reste de la colonne de droite pour qu'il ne cherche pas ailleurs.
  if (enSeance && sp === "debat" && jeDebats) {
    mq("#carnetbox", false);
    if (!souci) mq("#reglagesbox", false);
  }
}


// ---------------------------------------------------------------------------
// Retrait volontaire
//
// À distinguer d'une coupure : sur coupure on garde le siège, parce que le joueur
// revient et que supprimer sa place fausserait la manche. Ici il part exprès, et
// tout doit être défait — le siège côté serveur, les liaisons audio, et surtout
// le jeton de reprise, sans quoi le simple fait de recharger la page le
// ramènerait dans le salon qu'il vient de quitter.
// ---------------------------------------------------------------------------
let enSortie = false;

function demanderSortie() {
  const t = $("#sortietxt");
  if (t) t.textContent = STATE && STATE.phase !== "lobby" && STATE.phase !== "final"
    ? "Votre place sera libérée immédiatement. La manche continue sans vous, et vous ne pourrez pas la reprendre."
    : "Vous quitterez le salon et votre place sera rendue disponible.";
  $("#sortie").classList.remove("hide");
}

function quitterSeance() {
  enSortie = true;
  $("#sortie").classList.add("hide");
  jeton.effacer();
  partieEnCours = false;
  clearTimeout(reconnexion); reconnexion = null;
  try { ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: "quitter" })); } catch {}
  // On ne referme pas la socket ici : le serveur le fait après avoir libéré la
  // place et prévenu la table. Fermer trop tôt ferait passer le départ pour une
  // simple coupure, et le siège resterait occupé.
  setTimeout(() => { try { ws && ws.close(); } catch {} }, 400);
  rentrerAuCalme();
}

// Remise à zéro complète du client, sans rechargement : on garde le micro ouvert
// et les réglages, on jette tout le reste.
function rentrerAuCalme() {
  peers.forEach(p => { clearInterval(p.stats); try { p.pc.close(); } catch {} try { p.audioEl && (p.audioEl.srcObject = null); } catch {} });
  peers.clear();
  STATE = null; ME = null; SEAT = 0; HAND = []; myVote = null; maTribune = null;
  estPeteur = false; ROLE_CONNU = false; motionDispo = true;
  sigHand = ""; sigPlan = ""; sigAnnonce = ""; speechAcc = 0; speechSent = 0;
  emisVuLe = 0; secoursActif = false;
  fermerBrief();
  const an = $("#annonce"); if (an) an.className = "";
  $("#blanc").classList.add("hide");
  bandeauReseau("");
  const rc = $("#refcode"); if (rc) rc.classList.add("hide");
  const et = $("#etat"); if (et) { et.textContent = "hors séance"; et.className = "pastille off"; }
  history.replaceState(null, "", location.pathname);
  const cd = $("#code"); if (cd) cd.value = "";
  $("#go").disabled = false;
  $("#err").textContent = "";
  show("home");
  majBoutonQuitter();
  setTimeout(() => { enSortie = false; }, 800);
}

function majBoutonQuitter() {
  const b = $("#btnquitter");
  if (b) b.classList.toggle("hide", !(partieEnCours && STATE));
}


// ---------------------------------------------------------------------------
// Marginalia
//
// Notes de service, post-it et gribouillis dans les marges. Aucune conséquence
// sur le jeu : rien n'est cliquable, rien n'est annoncé aux lecteurs d'écran, et
// tout disparaît dès que la largeur manque. On tire au sort à chaque écran, sans
// répétition, pour que deux parties ne se ressemblent pas.
// ---------------------------------------------------------------------------
const MARGINALIA = [
  // --- notes de service : l'administration face au désastre -------------------
  { t: "note", o: "Note de service", h: "La salle 217 bis n'est <b>toujours pas ventilée</b>. Dossier transmis aux Moyens Généraux le 4 mars. Relancé le 12. Relancé le 30. Classé le 31." },
  { t: "note", o: "Objet", h: "Odeur persistante au 2<sup>e</sup> étage.<br><b>Statut : classé sans suite.</b>" },
  { t: "note", o: "Rappel RH", h: "« C'était la chaise » <b>n'est pas un motif recevable</b> devant la commission." },
  { t: "note", o: "Point 14", h: "Reporté.<br>Comme les treize précédents." },
  { t: "note", o: "Sécurité", h: "Extincteur : dans le couloir.<br>Désodorisant : <b>nulle part</b>." },
  { t: "note", o: "Consigne", h: "Merci de laisser la salle dans l'état où vous l'avez trouvée.<br><b>Il est déjà trop tard.</b>" },
  { t: "note", o: "Budget", h: "La climatisation a été coupée pour raisons budgétaires.<br>Bon courage à tous." },
  { t: "note", o: "Formulaire PV-6 bis", h: "Déclaration spontanée de responsabilité.<br><b>Jamais rempli depuis 1997.</b>" },
  { t: "note", o: "Article 12", h: "Le règlement intérieur interdit de rire en séance.<br>Jamais appliqué. On sait pourquoi." },
  { t: "note", o: "Avertissement", h: "Le Comité ne saurait être tenu responsable des <b>amitiés perdues</b> au cours de la présente séance." },
  { t: "note", o: "Confidentialité", h: "Le plan de salle est strictement confidentiel.<br>Il est également affiché à l'écran." },
  { t: "note", o: "Huis clos", h: "Pensez à fermer la porte.<br>Il n'y a pas de porte." },
  { t: "note", o: "Restauration", h: "Le café est pris en charge par le service.<br><b>Les conséquences ne le sont pas.</b>" },
  { t: "note", o: "Ordre du jour", h: "Durée prévue : 45 minutes.<br>Durée réelle : voir ci-contre." },
  { t: "note", o: "Terminologie", h: "Le Comité rappelle que le mot <b>« vent »</b> est proscrit des comptes rendus officiels." },
  { t: "note", o: "Effectifs", h: "Les stagiaires ne votent pas.<br>Les stagiaires n'existent pas." },
  { t: "note", o: "Maintenance", h: "Le fauteuil du siège 4 grince.<br><b>Ce n'est pas toujours le fauteuil.</b>" },
  { t: "note", o: "Mention légale", h: "Toute ressemblance avec une réunion réelle serait <b>profondément fâcheuse</b>." },
  { t: "note", o: "Procédure", h: "En cas d'incident : ouvrir la fenêtre.<br>En l'absence de fenêtre : <b>assumer</b>." },
  { t: "note", o: "Registre", h: "Dernier audit qualité de l'air : <b>mars 2019</b>.<br>L'auditeur n'a pas donné suite." },
  { t: "note", o: "Direction", h: "Il est rappelé que le silence est d'or.<br>Ici, il est surtout <b>compromettant</b>." },
  { t: "note", o: "Assurance", h: "Le sinistre du 12 juin a été refusé au motif que <b>« l'origine humaine n'est pas couverte »</b>." },
  { t: "note", o: "Inventaire", h: "Plantes vertes du 2<sup>e</sup> : 6 en janvier.<br>4 en mars.<br><b>1 aujourd'hui.</b>" },
  { t: "note", o: "Hygiène", h: "Le bocal du frigo est là depuis février.<br>Personne ne l'ouvre.<br><b>Personne ne l'ouvrira.</b>" },
  { t: "note", o: "Étude interne", h: "Corrélation établie entre la cantine du mardi et les séances du mercredi.<br><i>Rapport enterré.</i>" },
  { t: "note", o: "Communication", h: "Le service com. recommande le terme <b>« aléa atmosphérique interne »</b>." },
  { t: "note", o: "Convocation", h: "Séance ordinaire.<br>Rien, dans cette salle, n'a jamais été ordinaire." },
  { t: "note", o: "Formation", h: "Module « Communication non violente », 3 jours.<br>Annulé.<br><b>Motif : incident en salle.</b>" },
  { t: "note", o: "Rappel", h: "Toute personne quittant la séance sera <b>réputée avoir avoué</b>. Article 7, alinéa 3." },
  { t: "note", o: "Séminaire", h: "Le séminaire de cohésion est reporté <i>sine die</i>.<br>La cohésion aussi." },
  { t: "note", o: "Informatique", h: "Le micro capte tout.<br>Le serveur enregistre tout.<br><b>Le Comité oublie tout.</b> Ne vous inquiétez pas." },
  { t: "note", o: "Doléances", h: "Registre des réclamations : <b>0 entrée</b> depuis l'ouverture.<br>Le registre a disparu en avril." },
  { t: "note", o: "Ressources humaines", h: "L'entretien annuel de Bernard était prévu le 14.<br>Bernard aussi." },
  { t: "note", o: "Chronologie", h: "14h02 : silence.<br>14h03 : quelque chose.<br>14h04 : <b>plus personne ne regarde son voisin</b>." },
  { t: "note", o: "Ventilation", h: "Le devis a été validé.<br>Le bon de commande a été perdu.<br>Le prestataire a fermé.<br><b>Le dossier est exemplaire.</b>" },
  { t: "note", o: "Statistiques", h: "87 % des accusations portent sur le siège d'en face.<br>Le siège d'en face est <b>innocent 5 fois sur 6</b>." },
  { t: "note", o: "Note interne", h: "Le Comité a étudié l'installation d'une fenêtre.<br>Coût estimé : 4 200 €.<br><b>Coût du statu quo : indéterminé.</b>" },
  { t: "note", o: "Juridique", h: "Aucune jurisprudence n'existe sur ce point.<br>Le Comité en créera une aujourd'hui." },
  { t: "note", o: "Ordre intérieur", h: "Il est interdit de désigner quelqu'un du doigt.<br>Le vote électronique a été créé pour cela." },
  { t: "note", o: "Post-séance", h: "Les participants sont priés d'attendre <b>dix minutes</b> avant d'emprunter l'ascenseur.<br>Tous ensemble, c'est non." },
  { t: "note", o: "Sinistralité", h: "Trois départs volontaires cette année.<br>Aucun n'a donné de motif.<br><b>Aucun n'en avait besoin.</b>" },
  { t: "note", o: "Archives", h: "Le PV du 9 février est illisible.<br>La secrétaire écrivait vite.<br><b>Elle avait ses raisons.</b>" },
  { t: "note", o: "Qualité de l'air", h: "Capteur installé lundi.<br>Capteur retiré mardi.<br><i>« Les valeurs relevées n'étaient pas exploitables. »</i>" },
  { t: "note", o: "Immobilier", h: "Le bail de la salle 217 bis court jusqu'en 2031.<br><b>Le propriétaire n'a pas souhaité le renouveler.</b>" },

  // --- post-it : la voix intérieure d'un participant --------------------------
  { t: "post", h: "Ne pas accuser Bernard.<br>Bernard est parti<br>en 2019." },
  { t: "post", h: "Penser à respirer<br>par la bouche." },
  { t: "post", h: "Si tout le monde se tait<br>en même temps,<br>c'est qu'il s'est passé<br>quelque chose." },
  { t: "post", h: "Demander une fenêtre.<br>(11<sup>e</sup> demande)" },
  { t: "post", h: "Ne PAS reprendre<br>du chili le mardi.<br>On a essayé.<br>C'était non." },
  { t: "post", h: "Le silence n'est pas<br>une stratégie.<br>C'est un aveu lent." },
  { t: "post", h: "Vérifier le sens<br>du casque.<br>G à gauche.<br>D à droite.<br>Oui, vraiment." },
  { t: "post", h: "Apporter une bougie<br>la prochaine fois." },
  { t: "post", h: "Ne plus jamais<br>s'asseoir dos<br>à la porte.<br>Il n'y a pas de porte.<br>C'est pire." },
  { t: "post", h: "Rire au bon moment<br>= alibi.<br>Rire au mauvais<br>= aveu." },
  { t: "post", h: "Si Sophie propose<br>le restaurant indien,<br>DIRE NON." },
  { t: "post", h: "Note : ne pas<br>faire confiance<br>à ceux qui<br>ne notent rien." },
  { t: "post", h: "Compter les respirations.<br>Celui qui retient<br>la sienne, c'est lui." },
  { t: "post", h: "J'ai voté contre moi.<br>Par acquit<br>de conscience." },
  { t: "post", h: "Racheter du café.<br>Pas celui-là.<br>Vraiment pas<br>celui-là." },
  { t: "post", h: "Le stagiaire sait<br>quelque chose.<br>Le stagiaire<br>ne dira rien." },
  { t: "post", h: "Prévoir une excuse<br>pour partir à 15h.<br>Prévoir aussi<br>de ne pas pouvoir." },
  { t: "post", h: "Ce n'est pas<br>parce que je suis<br>innocent que<br>je vais m'en sortir." },

  // --- marginalia manuscrites : le carnet d'un joueur qui doute ----------------
  { t: "main", h: "j'ai entendu quelque chose à droite.<br>ou à gauche." },
  { t: "main", h: "P4 a toussé trois fois.<br>très suspect." },
  { t: "main", h: "note à moi-même :<br>ne plus jamais accepter<br>cette réunion" },
  { t: "main", h: "quelqu'un a bougé sa chaise<br>pile au bon moment.<br>trop pratique." },
  { t: "main", h: "il parle beaucoup.<br>beaucoup trop.<br>c'est lui." },
  { t: "main", h: "ce n'était pas lui.<br>rayer ce qui précède." },
  { t: "main", h: "14h07 — quelque chose.<br>14h08 — plus rien.<br>14h09 — tout le monde<br>regarde ailleurs." },
  { t: "main", h: "j'ai accusé Sophie.<br>Sophie était innocente.<br>Sophie le sait maintenant." },
  { t: "main", h: "trois fois de suite<br>à ma gauche.<br>soit c'est lui,<br>soit mon casque est à l'envers." },
  { t: "main", h: "c'était mon casque." },
  { t: "main", h: "on est vendredi.<br>on est TOUS suspects<br>le vendredi." },
  { t: "main", h: "j'ai gagné.<br>je n'ai plus d'amis,<br>mais j'ai gagné." },
  { t: "main", h: "personne n'a rien dit.<br>c'est ça le pire." },
  { t: "main", h: "il a ri.<br>on rit quand<br>on est soulagé." },
  { t: "main", h: "note : le silence de P2<br>dure depuis 40 secondes.<br>personne ne survit<br>à 40 secondes." },

  // --- tampons ----------------------------------------------------------------
  { t: "tampon", h: "Sans odeur<br>Service Qualité", c: "sauge" },
  { t: "tampon", h: "Ne pas aérer<br>avant lecture", c: "" },
  { t: "tampon", h: "Copie n° 4 / 6<br>Ne pas diffuser", c: "ardoise" },
  { t: "tampon", h: "Lu et approuvé<br>sous toutes réserves", c: "sauge" },
  { t: "tampon", h: "À classer<br>sans suite", c: "" },
  { t: "tampon", h: "Pièce non<br>communicable", c: "ardoise" },
  { t: "tampon", h: "Original<br>égaré", c: "" },
  { t: "tampon", h: "Vu.<br>Sans commentaire", c: "sauge" },
  { t: "tampon", h: "Dossier clos<br>faute de témoin", c: "" },
  { t: "tampon", h: "Reçu le 12<br>Traité jamais", c: "ardoise" },
  { t: "tampon", h: "Ne pas relancer<br>le service", c: "" },
  { t: "tampon", h: "Exemplaire du<br>Secrétariat", c: "sauge" },

  // --- chroniques : l'escalade administrative, en cinq lignes ------------------
  { t: "chrono", o: "Rapport d'incident 04-B", h: "<b>11h13</b> — porte fermée pour raisons acoustiques.<br><b>11h14</b> — ventilation coupée par mesure d'économie.<br><b>11h31</b> — première demande de suspension.<br><b>11h32</b> — demande rejetée.<br><b>12h05</b> — la salle comprend son erreur." },
  { t: "chrono", o: "Suivi du dossier 217", h: "<b>Jour 1</b> — on suspecte.<br><b>Jour 2</b> — on confirme.<br><b>Jour 3</b> — on déplace le service.<br><b>Jour 4</b> — on rebâtit le service ailleurs.<br><b>Jour 5</b> — on apprend que ça a suivi." },
  { t: "chrono", o: "Note de la Direction", h: "Le Comité a examiné la question.<br>Le Comité a mandaté un groupe de travail.<br>Le groupe de travail a rendu un rapport.<br>Le rapport recommande <b>d'examiner la question</b>." },
  { t: "chrono", o: "Compte rendu, extrait", h: "<i>« Une légère gêne diffuse a été constatée en séance plénière. »</i><br>Les six caméras montrent six personnes se levant <b>à la même seconde</b>." },
  { t: "chrono", o: "Procédure Alpha-7", h: "Portes : fermées.<br>Ventilation : coupée.<br>Participant responsable : <b>souriant</b>.<br>La salle comprend à 11h14.<br>Trop tard." },
  { t: "chrono", o: "Bilan trimestriel", h: "Réunions tenues : 34.<br>Décisions prises : 2.<br>Départs volontaires : 3.<br>Fenêtres installées : <b>0</b>." },
  { t: "chrono", o: "Mémo confidentiel", h: "Le lien de causalité entre la cantine du mardi et les événements du mercredi <b>reste débattu en commission</b>.<br>La commission se réunit le mercredi." },
  { t: "chrono", o: "Fiche de poste", h: "Intitulé : <b>Référent Qualité de l'Air</b>.<br>Créé en janvier.<br>Pourvu en février.<br>Vacant depuis mars.<br>Non republié." }
];

// Placement — volontairement irrégulier.
//
// Une grille de six emplacements fixes, trois de chaque côté, tous horizontaux :
// ça se voit immédiatement et ça trahit la génération automatique. Ici rien n'est
// aligné. Le nombre varie, la répartition gauche/droite est asymétrique, les
// hauteurs sont tirées au sort avec des écarts inégaux, les largeurs et les
// rotations aussi, et certains éléments mordent volontairement le bord de
// l'écran comme s'ils avaient été collés à la va-vite.
const HAUTEUR = { note: 112, post: 100, main: 74, tampon: 46, chrono: 168 };

function melangerTab(a) {
  const t = [...a];
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return t;
}
const entre = (a, b) => a + Math.random() * (b - a);

function poserMarginalia() {
  const box = $("#marges");
  if (!box) return;
  const vh = window.innerHeight;
  // Largeur réellement disponible dans la marge : la feuille est centrée et sa
  // largeur change selon l'écran (1000 px hors séance, 1440 en séance). Sans ce
  // calcul, une note large posée loin du bord passerait sous le contenu dès que
  // la fenêtre est un peu juste — ce qui ne se voyait pas sur un écran très large.
  const f = document.querySelector(".feuille");
  const dispo = f ? Math.max(0, Math.round((window.innerWidth - f.getBoundingClientRect().width) / 2) - 10) : 200;
  const fonds = melangerTab(MARGINALIA);
  let k = 0;
  const html = [];

  // Entre quatre et sept éléments, répartis inégalement : jamais trois et trois.
  const total = 4 + Math.floor(Math.random() * 4);
  let nG = 1 + Math.floor(Math.random() * (total - 1));
  if (nG === total - nG && total % 2 === 0) nG += Math.random() < 0.5 ? 1 : -1;   // on évite l'équilibre parfait
  const parts = { g: nG, d: total - nG };

  for (const cote of ["g", "d"]) {
    // Départ différent de chaque côté : les deux colonnes ne commencent jamais à
    // la même hauteur. À gauche on démarre plus bas, pour ne pas recouvrir le
    // cartouche « SÉANCE 04-B » qui est fixé dans le coin.
    // Jamais au-dessus de 96 px : le bandeau du haut est collant et recouvrirait
    // le début de la note, qui apparaîtrait coupée.
    let y = cote === "g" ? entre(150, 300) : entre(96, 220);
    for (let n = 0; n < parts[cote]; n++) {
      const m = fonds[k];
      if (!m) break;
      const h = HAUTEUR[m.t] || 100;
      if (y + h > vh - 110) break;                   // on laisse les cartouches de coin tranquilles
      k++;

      const rot = entre(-7, 7).toFixed(2);
      // Décalage horizontal : la plupart dans la marge, quelques-uns qui mordent
      // le bord de l'écran.
      //
      // Mais SEULEMENT ceux qui ont un fond : un post-it ou un tampon dont un
      // coin dépasse se lit comme un objet posé de travers. Une note manuscrite,
      // qui n'est que du texte nu, se lit comme un bug — on ne voit plus que des
      // moitiés de mots. Elles restent donc entièrement dans la marge.
      const peutDeborder = m.t === "post" || m.t === "tampon";
      const dehors = peutDeborder && Math.random() < 0.35;
      const dx = Math.round(dehors ? entre(-20, -6) : entre(10, 54));
      const larg = Math.min(Math.round(entre(148, 214)), dispo - dx);
      if (larg < 130) continue;               // marge trop étroite pour cet élément
      const opa = entre(0.82, 1).toFixed(2);

      let inner;
      if (m.t === "note") inner = `<div class="mg-note"><span class="obj">${m.o}</span>${m.h}</div>`;
      else if (m.t === "chrono") inner = `<div class="mg-note mg-chrono"><span class="obj">${m.o}</span>${m.h}</div>`;
      else if (m.t === "post") inner = `<div class="mg-post ${["", "rose", "bleu", "vert"][Math.floor(Math.random() * 4)]}">${m.h}</div>`;
      else if (m.t === "main") inner = `<div class="mg-main">${m.h}</div>`;
      else inner = `<span class="mg-tampon ${m.c || ""}">${m.h}</span>`;

      // `${cote}` vaut "g" ou "d" : il faut la vraie propriété CSS, sinon la
      // déclaration est ignorée et tout s'empile au bord gauche.
      const bord = cote === "g" ? "left" : "right";
      html.push(`<div class="marge ${cote}" style="top:${Math.round(y)}px;${bord}:${dx}px;width:${larg}px;
        opacity:${opa};transform:rotate(${rot}deg);animation-delay:${Math.round(entre(0, 500))}ms">${inner}</div>`);

      // écart vertical très variable : parfois deux notes presque collées,
      // parfois un grand vide. C'est ce qui rend la colonne crédible.
      y += h + (Math.random() < 0.22 ? entre(14, 34) : entre(70, 230));
    }
  }
  box.innerHTML = html.join("");

  // Reprise après coup, sur les hauteurs RÉELLES.
  //
  // Les hauteurs du tableau ci-dessus sont des estimations : une note de quatre
  // lignes est bien plus haute qu'une note de deux, et la rotation ajoute encore
  // quelques pixels. Plutôt que de gonfler les marges de sécurité — ce qui
  // reviendrait à réaligner la colonne —, on mesure ce qui a été posé et on
  // repousse ce qui se chevauche. On garde l'irrégularité, on perd les collisions.
  ["g", "d"].forEach(cote => {
    const els = [...box.querySelectorAll(".marge." + cote)]
      .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    let bas = -Infinity;
    els.forEach(e => {
      let y = parseFloat(e.style.top);
      const h = e.offsetHeight + 8;                 // marge pour la rotation
      if (y < bas + 16) y = bas + 16 + Math.random() * 40;
      if (y + h > vh - 100) { e.remove(); return; }  // plutôt retirer que chevaucher un coin
      e.style.top = Math.round(y) + "px";
      bas = y + h;
    });
  });
}

const PHASES = {
  intro: "Ouverture de séance", meeting: "Séance en cours", blanc: "Suspension",
  vote: "Scrutin", results: "Procès-verbal", final: "Clôture"
};
function renderState() {
  if (!STATE) return;
  majMicro();
  majBoutonQuitter();
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
    // Plus aucun verrou sur l'effectif : on doit pouvoir ouvrir seul pour vérifier
    // le son, le placement et le rendu. L'avertissement remplace l'interdiction.
    $("#lhint").textContent = n < 2
      ? "Séance d'essai en solo. Pas de débat, pas de vote — mais tout le reste fonctionne."
      : n < 3 ? "À deux, le débat contradictoire est sauté : il n'y aurait personne pour juger."
      : n < 5 ? "En dessous de cinq participants, l'identification est très difficile. Six est l'effectif nominal."
              : "Effectif suffisant. La séance peut être ouverte.";
    const host = ME === STATE.hostId;
    $("#hostbox").classList.toggle("hide", !host);
    $("#waithost").classList.toggle("hide", host);
    $("#start").disabled = false;
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
  majTribune();
  majMemo();
  majVisibilite();
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
      case "quitte":
        // le serveur a bien libéré la place ; le client est déjà revenu à l'accueil
        break;
      case "debatAnnule":
        maTribune = null;
        bandeauReseau("<b>Débat interrompu.</b> Un des deux intervenants a quitté la séance.", "");
        setTimeout(() => bandeauReseau(""), 5000);
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
        if (m.retard) {
          bandeauReseau(`<b>Vous arrivez en cours de séance.</b> Vous entendez et vous parlez,
            mais vous n'avez pas de pièce pour cette manche et vous ne marquez pas de point.
            Vous serez un participant à part entière à la manche suivante.`, "");
          setTimeout(() => bandeauReseau(""), 9000);
        } else if (!m.reprise) ouvrirBrief(pet, m.nbFarters, m.hand.length);
        $("#memobox").dataset.sig = "";
        if (pet) majPression(0);
        majVisibilite();
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
    if (enSortie) return;                     // départ volontaire : rien à reprendre
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
const bq = $("#btnquitter"); if (bq) bq.onclick = demanderSortie;
const so = $("#sortieoui"); if (so) so.onclick = quitterSeance;
const sn = $("#sortienon"); if (sn) sn.onclick = () => $("#sortie").classList.add("hide");

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
  // La visibilité est décidée par majVisibilite() et par elle seule : ici on ne
  // fait que mettre à jour le contenu.
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
const lr = $("#lireregl"); if (lr) lr.onclick = () => basculeRegl(true);

// ---------------------------------------------------------------------------
// Détection du mobile
//
// On ne se fie pas au seul agent utilisateur, qui ment volontiers : on croise
// avec le pointeur grossier et l'absence de survol, qui décrivent l'appareil
// réel. L'avis n'apparaît que là où il sert.
// ---------------------------------------------------------------------------
const surMobile = (() => {
  try {
    const ua = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent);
    const tactile = matchMedia("(pointer: coarse)").matches && matchMedia("(hover: none)").matches;
    return ua || (tactile && Math.min(screen.width, screen.height) < 900);
  } catch { return false; }
})();
if (surMobile) {
  const ma = $("#mobileavis"); if (ma) ma.classList.remove("hide");
  // Le post-it décoratif est masqué sous 1180 px : on remonte l'essentiel dans le
  // bandeau d'inscription, où il sera lu.
  document.querySelectorAll(".casque .tampon-casque").forEach(e => e.remove());
}
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

// premières marges, pour l'écran d'accueil
ecranCourant = "home";
poserMarginalia();

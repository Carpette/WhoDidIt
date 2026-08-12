import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { SOUNDS, MUSIQUES, INCIDENT, MOTIONS, MOTIONS_ADMIN, MOTIONS_CLASSIQUES } from "./content.js";

const PORT = process.env.PORT || 8080;
const app = express();
// Cache : les fichiers audio ne changent jamais, le code change à chaque itération.
// Un max-age global gardait l'ancienne page une heure après un déploiement — on
// croyait tester le correctif, on testait la version précédente.
app.use(express.static("public", {
  etag: true,
  setHeaders(res, p) {
    if (/[\\/](sfx|music)[\\/]/.test(p)) res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    else res.setHeader("Cache-Control", "no-cache");
  }
}));
app.get("/healthz", (_, res) => res.send("ok"));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const SEATS = 6;
const env = (k, d) => Number(process.env[k] || d);
const CFG = {
  meetingBase: env("MEETING_MS", 150_000),  // 2 min 30 par défaut
  meetingJitter: env("JITTER_MS", 15_000),  // fin variable ±15 s
  blanc: env("BLANC_MS", 4_000),
  intro: env("INTRO_MS", 9_000),
  vote: env("VOTE_MS", 35_000),
  results: env("RESULTS_MS", 16_000),
  minSpeech: env("MIN_SPEECH_MS", 12_000),  // temps de parole minimum par manche
  cooldown: env("COOLDOWN_MS", 15_000),     // délai minimum entre deux émissions du même joueur
  pression: env("PRESSION_MS", 95_000),     // temps de remplissage complet de la jauge
  debat: env("DEBAT_MS", 90_000),           // le débat contradictoire — un seul par manche
  delib: env("DELIB_MS", 45_000),           // délibération libre, tous micros ouverts
  voteDebat: env("VOTE_DEBAT_MS", 9_000),   // la salle se prononce
  revelDebat: env("REVEL_DEBAT_MS", 7_000), // révélation des intervenants
  motion: env("MOTION_MS", 15_000)          // durée d'une motion d'ordre
};

// Serveurs ICE. STUN seul ne suffit pas derrière un NAT symétrique (réseau
// d'entreprise typiquement) : il faut un TURN. Configurable sans toucher au code.
const ICE = [{ urls: (process.env.STUN_URLS || "stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478").split(",") }];
if (process.env.TURN_URLS) {
  ICE.push({
    urls: process.env.TURN_URLS.split(","),
    username: process.env.TURN_USER || "",
    credential: process.env.TURN_PASS || ""
  });
}
console.log("ICE:", JSON.stringify(ICE.map(s => s.urls)));

const rooms = new Map();
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
// Mélange de Fisher-Yates. NE JAMAIS revenir à `sort(() => Math.random() - 0.5)` :
// ce n'est pas un mélange. Le tri de V8 compare des paires dans un ordre fixe, et
// une fonction de comparaison incohérente laisse les premiers éléments en tête.
// Mesuré à six joueurs : le premier de la liste finissait 1er dans 28,5 % des cas
// au lieu de 16,7 %. Comme une Map itère dans l'ordre d'insertion, ce « premier »
// était toujours l'hôte — qui se retrouvait donc péteur bien trop souvent.
function melanger(a) {
  const t = [...a];
  for (let i = t.length - 1; i > 0; i--) { const j = rnd(i + 1); [t[i], t[j]] = [t[j], t[i]]; }
  return t;
}
const code = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[rnd(32)]).join("");

function room(c) {
  if (!rooms.has(c)) rooms.set(c, {
    code: c, players: new Map(), phase: "lobby", round: 0, rounds: 3,
    hostId: null, timer: null, endsAt: 0,
    votes: {}, eliminated: new Set(), log: [],
    debats: [], di: -1, debat: null, sousPhase: null, voteD: {}, motion: null,
    pairesVues: new Set(), motionsVues: new Set()
  });
  return rooms.get(c);
}

function pub(r) {
  return {
    code: r.code, phase: r.phase, round: r.round, rounds: r.rounds,
    endsAt: r.endsAt, hostId: r.hostId,
    sousPhase: r.sousPhase,
    debat: r.debat ? { i: r.debat.i, n: r.debats.length, motion: r.debat.motion } : null,
    motionEnCours: !!(r.motion && Date.now() < r.motion.fin),
    seats: Array.from({ length: SEATS }, (_, i) => {
      const p = [...r.players.values()].find(x => x.seat === i);
      return p ? {
        seat: i, id: p.id, nom: p.nom, connected: p.online !== false,
        out: r.eliminated.has(p.id)
      } : null;
    })
  };
}

const send = (ws, type, data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...data })); };
const bcast = (r, type, data) => r.players.forEach(p => send(p.ws, type, data));
const sync = (r) => bcast(r, "state", { state: pub(r) });

// schedule() diffuse l'état APRÈS avoir posé l'échéance.
//
// Tous les appels du fichier faisaient sync() puis schedule() : l'état partait
// donc avec l'échéance de la phase PRÉCÉDENTE, et le chronomètre des joueurs
// affichait « — » ou « 0 s » à chaque changement de phase, jusqu'à la diffusion
// suivante. En syncant ici, l'ordre devient impossible à se tromper.
function schedule(r, ms, fn) {
  clearTimeout(r.timer);
  r.endsAt = Date.now() + ms;
  r.timer = setTimeout(() => fn(r), ms);
  sync(r);
}

// Placement de la manche.
//
// On tire d'abord les deux intervenants, puis on les installe EN VIS-À-VIS ; les
// autres sont répartis au hasard sur les sièges restants. Deux conséquences :
//   — pour tout auditeur, les deux voix sont séparées de 90°, l'écart maximal.
//     Un tirage libre pouvait donner deux voisins à 30°, indistinguables.
//   — chaque intervenant a son contradicteur droit devant, à 0°.
//
// La paire de sièges en vis-à-vis est elle-même tirée au sort parmi les trois
// possibles : sans ça, la salle saurait d'avance quels sièges débattent.
//
// Le mélange des places à chaque manche est ce qui rend le vis-à-vis viable : les
// sièges en face l'un de l'autre ne changent pas, mais les gens qui les occupent
// changent à chaque fois.
function placer(r, joueurs) {
  const cle = (a, b) => [a.id, b.id].sort().join("~");
  let duo = null;
  for (let essai = 0; essai < 40; essai++) {
    const m = melanger(joueurs);
    duo = [m[0], m[1]];
    if (!r.pairesVues.has(cle(duo[0], duo[1]))) break;
  }
  r.pairesVues.add(cle(duo[0], duo[1]));

  const paireSieges = pick([[0, 3], [1, 4], [2, 5]]);
  const libres = melanger([0, 1, 2, 3, 4, 5].filter(i => !paireSieges.includes(i)));
  duo[0].seat = paireSieges[0];
  duo[1].seat = paireSieges[1];
  joueurs.filter(p => p !== duo[0] && p !== duo[1]).forEach((p, i) => { p.seat = libres[i]; });
  return duo;
}

function tirerDans(r, liste) {
  const libres = liste.filter(m => !r.motionsVues.has(m));
  const m = pick(libres.length ? libres : liste);
  r.motionsVues.add(m);
  return m;
}

// Programme des motions d'une manche. Les deux registres sont mélangés de force :
// trois motions administratives d'affilée finissent par se ressembler quel que soit
// le sujet, et c'est la lassitude de TON qui s'installe en premier. On garantit donc
// au moins un classique par manche dès qu'il y a deux débats — un sujet sur lequel
// tout le monde a déjà un avis relance systématiquement l'énergie de la table.
function programmeMotions(r, n) {
  const out = [];
  // Un débat par manche : on alterne les deux registres à peu près à parts égales.
  // Trois motions administratives d'affilée finissent par se ressembler quel que
  // soit le sujet — c'est la lassitude de ton qui s'installe en premier.
  const iClassique = n >= 2 ? rnd(n) : (Math.random() < 0.45 ? 0 : -1);
  for (let i = 0; i < n; i++) {
    out.push(tirerDans(r, i === iClassique ? MOTIONS_CLASSIQUES : MOTIONS_ADMIN));
  }
  return out;
}

function startRound(r) {
  r.round++;
  r.votes = {};
  r.eliminated = new Set();
  const alive = [...r.players.values()];
  const nbFarters = alive.length >= 6 ? 2 : 1;   // 2 responsables seulement à effectif plein
  r.nbFarters = nbFarters;
  const shuffled = melanger(alive);
  alive.forEach(p => {
    p.role = "innocent"; p.speech = 0; p.scored = 0;
    p.emissions = 0; p.incidents = 0; p.pression = 0; p.gel = 0; p.bonusDebat = 0;
  });
  shuffled.slice(0, nbFarters).forEach(p => p.role = "peteur");
  // Le nombre de cartes du péteur suit l'effectif : à 3 joueurs, 4 pets dans une
  // seule réunion saturent la scène et le grillent immédiatement.
  const mainPeteur = Math.max(2, Math.min(4, alive.length - 1));
  alive.forEach(p => send(p.ws, "place", { seat: p.seat }));
  alive.forEach(p => {
    const n = p.role === "peteur" ? mainPeteur : 1;
    p.hand = Array.from({ length: n }, () => pick(SOUNDS).id)
      .map((id, i) => ({ uid: `${p.id}-${r.round}-${i}`, id }));
    p.lastFart = 0;
    send(p.ws, "role", { role: p.role, hand: p.hand, nbFarters, cooldown: CFG.cooldown / 1000 });
  });
  // Programme des débats de la manche
  const [da, db] = placer(r, alive);
  r.debats = [{
    i: 1, a: da.id, b: db.id, motion: programmeMotions(r, 1)[0],
    // le camp est tiré au sort : personne ne choisit sa position
    pour: Math.random() < 0.5 ? da.id : db.id
  }];
  r.debats.forEach(d => { d.contre = d.a === d.pour ? d.b : d.a; });
  r.di = -1; r.debat = null; r.sousPhase = null; r.motion = null;

  // ATTENTION à l'ordre : schedule() pose r.endsAt, sync() le diffuse. L'inverse
  // envoyait l'ouverture avec l'échéance de la phase PRÉCÉDENTE — le chrono
  // affichait « — » et le briefing n'avait aucun décompte.
  // La première ouverture est plus longue : c'est là que le briefing s'affiche,
  // et trois consignes ne se lisent pas en neuf secondes.
  const dureeIntro = r.round === 1 ? Math.round(CFG.intro * 1.9) : CFG.intro;
  r.phase = "intro";
  schedule(r, dureeIntro, (rr) => {
    rr.phase = "meeting"; sync(rr);
    demarrerPression(rr);
    debatSuivant(rr);
  });
}

// --- le débat contradictoire -------------------------------------------------
// Les intervenants sont ANONYMES : la salle ne sait pas qui a la parole et devra
// l'identifier à l'oreille pour voter. C'est la même compétence que pour les pets,
// exercée sur un second canal.
function niveaux(r) {
  const motionActive = r.motion && Date.now() < r.motion.fin;
  r.players.forEach(p => {
    let n = 0.25;                                    // la salle : réactions seulement
    if (motionActive) n = (p.id === r.motion.id) ? 1 : 0.25;
    else if (r.debat && r.sousPhase === "debat" && (p.id === r.debat.a || p.id === r.debat.b)) n = 1;
    if (r.sousPhase !== "debat" && !motionActive) n = 1;   // hors débat, tout le monde parle
    if (r.eliminated.has(p.id)) n = 0;
    send(p.ws, "parole", { n });
  });
}

function debatSuivant(r) {
  r.di++;
  if (r.di >= r.debats.length) {
    // Délibération : tous les micros s'ouvrent. Sans elle, le scrutin final se
    // tiendrait sans qu'un mot ait été échangé sur les émissions entendues.
    r.debat = null; r.sousPhase = "deliberation";
    sync(r); niveaux(r);
    return schedule(r, CFG.delib, (rr) => {
      clearInterval(rr.tick); rr.tick = null;
      rr.sousPhase = null;
      rr.phase = "blanc"; sync(rr); niveaux(rr);
      schedule(rr, CFG.blanc, (r2) => {
        r2.phase = "vote"; sync(r2);
        schedule(r2, CFG.vote, endRound);
      });
    });
  }
  const d = r.debats[r.di];
  r.debat = d; r.sousPhase = "debat"; r.voteD = {}; r.motion = null;
  sync(r); niveaux(r);

  // chaque intervenant reçoit sa position, et lui seul
  [d.a, d.b].forEach(id => {
    const p = r.players.get(id);
    if (p) send(p.ws, "tribune", {
      motion: d.motion,
      camp: id === d.pour ? "pour" : "contre",
      i: d.i, n: r.debats.length
    });
  });

  schedule(r, CFG.debat, finDebat);
}

function finDebat(r) {
  r.sousPhase = "vote-debat"; r.motion = null;
  sync(r); niveaux(r);
  schedule(r, CFG.voteDebat, depouillerDebat);
}

function depouillerDebat(r) {
  const d = r.debat;
  const tally = {}; let nuls = 0, valides = 0;
  Object.entries(r.voteD).forEach(([, cibleId]) => {
    if (cibleId === d.a || cibleId === d.b) { tally[cibleId] = (tally[cibleId] || 0) + 1; valides++; }
    else nuls++;
  });
  let defaillant = null;
  const va = tally[d.a] || 0, vb = tally[d.b] || 0;
  if (va !== vb && Math.max(va, vb) >= 2) defaillant = va > vb ? d.a : d.b;

  if (defaillant) {
    const perd = r.players.get(defaillant);
    const autre = r.players.get(defaillant === d.a ? d.b : d.a);
    if (perd) perd.bonusDebat = (perd.bonusDebat || 0) - 1;
    if (autre) autre.bonusDebat = (autre.bonusDebat || 0) + 1;
  }

  const seat = (id) => { const p = r.players.get(id); return p ? p.seat : null; };
  r.sousPhase = "revelation"; sync(r); niveaux(r);
  bcast(r, "resultatDebat", {
    motion: d.motion, i: d.i, n: r.debats.length,
    pour: seat(d.pour), contre: seat(d.contre),
    nomPour: (r.players.get(d.pour) || {}).nom, nomContre: (r.players.get(d.contre) || {}).nom,
    defaillant: defaillant ? seat(defaillant) : null,
    nomDefaillant: defaillant ? (r.players.get(defaillant) || {}).nom : null,
    nuls, valides
  });
  schedule(r, CFG.revelDebat, debatSuivant);
}

// La pression intestinale. Elle ne concerne que ceux qui sont à l'origine des faits :
// tant qu'ils n'émettent pas, elle monte. À saturation, le corps décide à leur place
// et l'incident part à leur position, au pire moment possible.
const PAS = 500;
function demarrerPression(r) {
  clearInterval(r.tick);
  r.tick = setInterval(() => {
    if (r.phase !== "meeting") return;
    r.players.forEach(p => {
      if (p.role !== "peteur" || r.eliminated.has(p.id)) return;

      // Pendant la diffusion d'un incident, la pression ne monte pas : le corps
      // vient de tout donner. Sans ce répit, un second incident partirait dans la
      // seconde qui suit la fin du premier.
      if (p.gel && Date.now() < p.gel) {
        send(p.ws, "pression", { v: 0, gel: true });
        return;
      }

      p.pression = Math.min(100, (p.pression || 0) + 100 * PAS / CFG.pression);
      if (p.pression >= 100) {
        p.pression = 0;
        p.incidents = (p.incidents || 0) + 1;
        p.lastFart = Date.now();
        // La jauge reste gelée le temps que l'incident finisse de se faire entendre :
        // deux incidents qui se chevauchent seraient illisibles, et injustes.
        p.gel = Date.now() + INCIDENT.dur * 1000 + 3000;
        bcast(r, "sfx", { seat: p.seat, sound: INCIDENT.id, incident: true });
        send(p.ws, "incident", {});
        r.log.push({ round: r.round, seat: p.seat, sound: INCIDENT.id, incident: true, at: Date.now() });
      }
      send(p.ws, "pression", { v: Math.round(p.pression) });
    });
  }, PAS);
}

// Soulagement apporté par une émission : proportionnel à la durée du son. Une pièce
// longue soulage beaucoup mais se repère ; une pièce brève est discrète mais ne
// fait gagner que quelques secondes de répit.
function soulagement(id) {
  const s = SOUNDS.find(x => x.id === id);
  return Math.min(100, 30 + 15 * (s ? s.dur : 1));
}

function endRound(r) {
  clearInterval(r.tick); r.tick = null;
  const players = [...r.players.values()];
  const tally = {};
  Object.values(r.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
  let max = 0, top = [];
  for (const [id, n] of Object.entries(tally)) {
    if (n > max) { max = n; top = [id]; } else if (n === max) top.push(id);
  }
  const outId = (max >= 2 && top.length === 1) ? top[0] : null;
  if (outId) r.eliminated.add(outId);

  players.forEach(p => {
    const votesRecus = tally[p.id] || 0;
    let pts = 0;
    if (p.role === "peteur") {
      // Sans émission volontaire, l'office n'est pas rempli : rien à marquer.
      // Un incident subi ne compte pas — le corps a agi, pas le joueur.
      if (p.id === outId || !p.emissions) pts = 0;
      else pts = Math.min(p.emissions, 3) + (votesRecus > 0 ? 1 : 3);
    }
    else {
      if (p.id === outId) pts = 0;
      else {
        pts = Math.min(votesRecus, 2);
        const cible = players.find(x => x.id === r.votes[p.id]);
        if (cible && cible.role === "peteur") pts += 2;
      }
    }
    pts += (p.bonusDebat || 0);
    p.scored = pts; p.score = (p.score || 0) + pts;
  });

  const reveal = players.map(p => ({
    id: p.id, nom: p.nom, seat: p.seat, role: p.role,
    votes: tally[p.id] || 0, votaPour: r.votes[p.id] || null,
    speech: Math.round(p.speech / 1000), muet: p.speech < CFG.minSpeech,
    emissions: p.emissions || 0, incidents: p.incidents || 0,
    debat: p.bonusDebat || 0,
    pts: p.scored, total: p.score || 0
  })).sort((a, b) => b.total - a.total);

  r.phase = "results"; sync(r);
  bcast(r, "reveal", { reveal, outId, minSpeech: CFG.minSpeech / 1000 });
  schedule(r, CFG.results, (rr) => {
    if (rr.round >= rr.rounds) {
      [...rr.players.values()].forEach(p => { if (p.online === false) rr.players.delete(p.id); });
      rr.phase = "final"; rr.endsAt = 0; sync(rr); bcast(rr, "musique", { piste: pick(MUSIQUES) });
    }
    else startRound(rr);
  });
}

wss.on("connection", (ws) => {
  let cur = null, me = null;

  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.type === "join") {
      const c = (m.code || code()).toUpperCase();
      const existe = rooms.has(c);
      const r = room(c);

      // --- reprise de séance ---------------------------------------------
      // Le siège d'un joueur déconnecté est conservé jusqu'à la fin de la partie.
      // Il revient avec son rôle, sa main, son score et sa place.
      if (m.token && existe) {
        const p = [...r.players.values()].find(x => x.token === m.token);
        if (p) {
          try { if (p.ws && p.ws !== ws) p.ws.close(); } catch {}
          p.ws = ws; p.online = true;
          if (m.nom) p.nom = String(m.nom).slice(0, 16);
          me = p; cur = r;
          if (!r.hostId || !r.players.has(r.hostId)) r.hostId = p.id;
          send(ws, "joined", {
            id: p.id, seat: p.seat, code: c, sounds: SOUNDS,
            minSpeech: CFG.minSpeech / 1000, ice: ICE, token: p.token, reprise: true
          });
          if (r.phase !== "lobby") {
            send(ws, "role", {
              role: p.role, hand: p.hand, nbFarters: r.nbFarters || 1,
              cooldown: CFG.cooldown / 1000, reprise: true
            });
          }
          sync(r);
          send(ws, "motionEtat", { dispo: !!p.motionDispo });
          if (r.sousPhase === "debat" && r.debat && (p.id === r.debat.a || p.id === r.debat.b)) {
            send(ws, "tribune", {
              motion: r.debat.motion, camp: p.id === r.debat.pour ? "pour" : "contre",
              i: r.debat.i, n: r.debats.length
            });
          }
          niveaux(r);
          // on force la reconstruction des liaisons audio avec ce joueur
          bcast(r, "peerreset", { id: p.id });
          bcast(r, "peers", { peers: [...r.players.values()].map(x => ({ id: x.id, seat: x.seat, nom: x.nom })) });
          return;
        }
        // jeton périmé : on retombe sur une inscription normale
      }

      if (!existe && m.code) return send(ws, "err", { msg: "Aucune séance ne porte cette référence." });
      if (r.players.size >= SEATS) return send(ws, "err", { msg: "Réunion complète (6 places)." });
      if (r.phase !== "lobby") return send(ws, "err", { msg: "Séance déjà ouverte — impossible de s'inscrire en cours." });
      const used = new Set([...r.players.values()].map(p => p.seat));
      const seat = [...Array(SEATS).keys()].find(i => !used.has(i));
      me = {
        id: Math.random().toString(36).slice(2, 10),
        token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        nom: (m.nom || "Anonyme").slice(0, 16), seat, ws, online: true,
        score: 0, speech: 0, hand: [], role: "innocent", motionDispo: true
      };
      r.players.set(me.id, me); cur = r;
      if (!r.hostId) r.hostId = me.id;
      send(ws, "joined", { id: me.id, seat, code: c, sounds: SOUNDS, minSpeech: CFG.minSpeech / 1000, ice: ICE, token: me.token, motionDispo: true });
      sync(r);
      bcast(r, "peers", { peers: [...r.players.values()].map(p => ({ id: p.id, seat: p.seat, nom: p.nom })) });
      return;
    }
    if (!cur || !me) return;
    const r = cur;

    switch (m.type) {
      case "config":
        if (me.id === r.hostId) { r.rounds = Math.max(1, Math.min(10, m.rounds | 0 || 3)); sync(r); }
        break;
      case "restart":
        if (me.id === r.hostId && r.phase === "final") {
          r.round = 0; r.phase = "lobby"; r.votes = {}; r.eliminated = new Set();
          r.players.forEach(p => { p.score = 0; p.hand = []; p.speech = 0; p.motionDispo = true; });
          r.pairesVues = new Set();
          clearTimeout(r.timer); r.endsAt = 0; sync(r);
        }
        break;
      case "start":
        if (me.id === r.hostId && r.phase === "lobby" && r.players.size >= 3) startRound(r);
        break;
      case "fart": {
        if (r.phase !== "meeting" || r.eliminated.has(me.id)) return;
        const card = me.hand.find(c => c.uid === m.uid);
        if (!card) return;
        // Délai entre deux émissions : sans lui, on vide sa main en dix secondes
        // et la scène sonore est saturée d'un seul coup.
        const reste = (me.lastFart || 0) + CFG.cooldown - Date.now();
        if (reste > 0) return send(ws, "hand", { hand: me.hand, cooldownMs: reste });
        me.lastFart = Date.now();
        me.emissions = (me.emissions || 0) + 1;
        if (me.role === "peteur") {
          me.pression = Math.max(0, (me.pression || 0) - soulagement(card.id));
          send(ws, "pression", { v: Math.round(me.pression) });
        }
        me.hand = me.hand.filter(c => c.uid !== m.uid);
        send(ws, "hand", { hand: me.hand, cooldownMs: CFG.cooldown });
        bcast(r, "sfx", { seat: me.seat, sound: card.id, t: Date.now() });
        r.log.push({ round: r.round, seat: me.seat, sound: card.id, at: Date.now() });
        break;
      }
      case "speech":
        if (r.phase === "meeting") me.speech += Math.min(2000, m.ms | 0);
        break;
      case "voteDebat": {
        if (r.sousPhase !== "vote-debat" || !r.debat) return;
        if (me.id === r.debat.a || me.id === r.debat.b) return;   // on ne se juge pas
        if (r.eliminated.has(me.id)) return;
        r.voteD[me.id] = m.target;
        const votants = [...r.players.values()]
          .filter(p => p.online !== false && !r.eliminated.has(p.id) && p.id !== r.debat.a && p.id !== r.debat.b).length;
        bcast(r, "votedDebat", { count: Object.keys(r.voteD).length, total: votants });
        break;
      }
      case "motion": {
        // Une seule motion d'ordre par joueur et par partie. Elle suspend le
        // chronomètre du débat : sinon elle deviendrait une arme pour faire taire
        // un intervenant et le faire passer pour défaillant.
        if (r.phase !== "meeting" || r.sousPhase !== "debat") return;
        if (!me.motionDispo || r.eliminated.has(me.id)) return;
        if (r.motion && Date.now() < r.motion.fin) return;
        if (me.id === r.debat.a || me.id === r.debat.b) return;
        me.motionDispo = false;
        r.motion = { id: me.id, fin: Date.now() + CFG.motion };
        const reste = Math.max(0, r.endsAt - Date.now());
        schedule(r, reste + CFG.motion, finDebat);       // le débat reprend où il s'était arrêté
        sync(r); niveaux(r);
        send(ws, "maMotion", {});
        bcast(r, "motionOuverte", { fin: r.motion.fin });
        setTimeout(() => {
          if (r.motion && Date.now() >= r.motion.fin) {
            r.motion = null; sync(r); niveaux(r); bcast(r, "motionClose", {});
          }
        }, CFG.motion + 60);
        break;
      }
      case "vote":
        if (r.phase === "vote" && !r.eliminated.has(me.id)) {
          r.votes[me.id] = m.target;
          bcast(r, "voted", { count: Object.keys(r.votes).length, total: r.players.size });
        }
        break;
      case "signal": {
        const t = r.players.get(m.to);
        if (t) send(t.ws, "signal", { from: me.id, data: m.data });
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!cur || !me) return;
    if (me.ws !== ws) return;                 // socket remplacée par une reprise
    me.online = false;

    // En salon, on libère la place. En séance, on la conserve : le joueur peut
    // revenir, et supprimer son siège fausserait la manche en cours.
    if (cur.phase === "lobby" || cur.phase === "final") cur.players.delete(me.id);

    const restants = [...cur.players.values()].filter(p => p.online !== false);
    if (cur.hostId === me.id) cur.hostId = restants.length ? restants[0].id : null;
    if (restants.length === 0) { clearTimeout(cur.timer); clearInterval(cur.tick); rooms.delete(cur.code); return; }
    bcast(cur, "peerleft", { id: me.id });
    sync(cur);
  });
});

server.listen(PORT, () => console.log("Qui a fait ça ?! sur :" + PORT));

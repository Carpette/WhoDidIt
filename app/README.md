# Qui a fait ça ?! — prototype palier 1

Jeu de déduction sociale audio. Une réunion en ligne, une consigne de séance, et quelqu'un qui pète.
Tout le gameplay repose sur la **spatialisation binaurale** du son. **Casque obligatoire.**

---

## Ce que fait ce prototype

- Salon avec code de réunion à 4 lettres, 6 places (jouable à partir de 3).
- Attribution secrète des rôles : 2 péteurs à partir de 6 joueurs, 1 en dessous.
  La main du péteur suit l'effectif (2 cartes à 3 joueurs, 4 à partir de 5) — sinon
  il sature la scène et se grille en une manche.
  **En dessous de 5 joueurs, la déduction est très faible.** 6 est la bonne cible.
- **Débat contradictoire**, un par manche, 90 s. Deux participants tirés au sort reçoivent la
  parole et une position imposée (pour / contre) sur une motion tirée parmi **319**
  (231 administratives + 88 classiques, mélangées volontairement : c'est la lassitude de *ton*
  qui s'installe avant celle des sujets).
  **Leur identité n'est pas communiquée** — la salle doit les identifier à l'oreille.
  Les micros de la salle restent ouverts à −12 dB : les rires passent, pas les discours.
- **Placement en vis-à-vis** : les deux intervenants sont installés aux extrémités d'un diamètre,
  les autres répartis au hasard sur les sièges restants. Pour tout auditeur, les deux voix sont
  donc séparées de 90° — l'écart maximal ; un tirage libre pouvait donner deux voisins à 30°,
  indistinguables. Chaque intervenant a son contradicteur droit devant, à 0°.
  **Les places sont rebattues à chaque manche** : c'est ce qui rend le vis-à-vis viable, les
  sièges ne changent pas mais les gens qui les occupent changent.
- **Délibération libre** de 45 s après le débat, tous micros ouverts : sans elle, le scrutin
  final se tiendrait sans qu'un mot ait été échangé sur les émissions entendues.
- **Vote de la salle** après chaque débat : « qui n'a pas défendu sa position ». Un vote porté
  sur un siège qui ne débattait pas est **nul**, mais compté et publié au dépouillement —
  c'est la mesure directe de la compétence d'identification vocale de la table.
  Défaillant : −1 ; son contradicteur : +1. Les intervenants sont ensuite révélés.
- **Motion d'ordre** : une par joueur et par partie. 15 s de parole pleine pour un membre de la
  salle, intervenants atténués, **chronomètre du débat suspendu** (sinon elle deviendrait une
  arme pour faire passer un intervenant pour défaillant). Le motionnaire reste anonyme.
- **Le blanc** : 4 secondes de silence imposé, micros coupés, en fin de réunion.
- Vote : une accusation par joueur, en cliquant sur un siège.
- **Mesure du temps de parole** : en dessous du minimum, le siège est signalé au moment
  du vote. Aucune sanction automatique — ce sont les joueurs qui jugent.
- **Délai de 15 s entre deux émissions du même joueur** — sans lui, on vide sa main
  en dix secondes et la scène sonore est saturée d'un coup.
- **Pression intestinale** (péteurs uniquement, jauge privée) : elle monte pendant toute la
  séance. Émettre la fait redescendre proportionnellement à la durée du son joué
  (`30 + 15 × durée`, plafonné à 100). À saturation, **le serveur émet à la place du joueur**
  un son de 12 s à sa position — l'*Incident*. La jauge est ensuite gelée le temps de la
  diffusion, pour éviter deux incidents qui se chevauchent.
  Un incident ne rapporte aucun point : il n'est pas imputable à l'initiative du joueur.
- Carnet de séance manuscrit, conservé localement, remis à zéro à chaque manche.
- **Reprise de séance** : le siège d'un joueur déconnecté est conservé jusqu'à la fin de la
  partie. Reconnexion automatique avec repli exponentiel, et reprise manuelle après un
  rechargement complet — le joueur retrouve siège, rôle, main et score. Un jeton est stocké
  localement (validité 2 h) et effacé à la clôture.
- **Règlement intérieur illustré** : huit articles et **cinq schémas SVG** — frise du déroulement,
  plan de table avec l'angle de 90°, niveaux de parole par phase, échelle de traçabilité, jauge de
  pression. Dépliable depuis le bandeau ou par la touche `?`, fermeture par `Échap`.
  Un encadré « en quatre lignes » résume le jeu en tête. Évite de briefer chaque joueur à l'oral.
  Les raccourcis ignorent toute frappe portant un modificateur — pas question de détourner
  `Cmd+R` — et sont inactifs dans les champs de saisie.
- **Barème corrigé** : un péteur qui n'émet rien marque **0**. Auparavant l'inaction était la
  stratégie strictement dominante — ne rien faire rapportait le maximum sans aucun risque.
  Désormais +1 par émission volontaire (plafonné à +3), plus 3 s'il n'a reçu aucune voix,
  ou plus 1 s'il a été accusé sans être exclu.
- Score, révélation des rôles, manches enchaînées, relance de partie.

### Mobile

Le jeu est jouable au téléphone : il ne demande qu'un casque et des oreilles, l'écran ne
servant qu'à désigner un siège et jouer une carte. Vérifié sans débordement de 390 à 768 px.

- Bandeau compacté (l'exergue disparaît sous 640 px, le code de séance sous 400 px) : sans ça
  le titre se casse à un mot par ligne et l'en-tête collant recouvre la page.
- Procès-verbal en défilement horizontal — huit colonnes ne s'écrasent pas proprement.
- **Wake Lock** : l'écran ne s'éteint pas pendant une partie. Ce jeu se joue sans toucher à
  l'écran, or un téléphone se verrouille au bout de trente secondes et suspend l'audio avec lui.
  Au retour d'arrière-plan, l'`AudioContext` est réveillé s'il a été suspendu.

> **Casque filaire obligatoire sur téléphone.** Un casque Bluetooth bascule en profil « mains
> libres » (HFP) dès que son micro est capturé : le HFP est **monophonique**, donc toute la
> spatialisation disparaît. C'est exactement la cause racine du problème diagnostiqué sur
> Firefox, mais imposée cette fois par le transport Bluetooth — aucun correctif logiciel n'y peut
> rien. Filaire, ou adaptateur USB-C / Lightning.

### Direction artistique

Papeterie administrative, même famille que *Souffle Diplomatique* mais dominante
vert-de-gris au lieu du lavande : papier crème `#fbf6ee`, encre aubergine `#2d2837`,
filet `#d9cfbb`. Trois voix typographiques — **Fraunces** pour l'autorité, **IBM Plex
Mono** en petites capitales très espacées pour tout ce qui est bureaucratique,
**Caveat** pour l'humain qui annote la paperasse. Tampons caoutchouc pivotés,
post-its, plan de salle dessiné comme un plan d'architecte, procès-verbal en fin de
manche. Le seul écran sombre est la suspension de séance — le drame est rationné.

### Audio

- **Les pets sont pré-rendus en binaural** avec les HRTF mesurées du mannequin MIT KEMAR,
  réflexions de salle d'ordre 1 et réverbération diffuse. C'est exactement le rendu qui a
  obtenu 7/8 au test de localisation en aveugle. Chaque son existe en 5 versions,
  une par position relative autour de la table.
- **La voix est spatialisée en temps réel** via `PannerNode` en mode HRTF, à la même
  position et à la même distance que le siège du joueur.
- **Sidetone actif.** Chacun se réentend dans son casque. Sans ça, celui qui parle
  aurait le canal le plus propre de la table et masquerait tout le monde sans rien
  subir — le jeu serait cassé au niveau le plus profond.
- Rien n'affiche qui parle. C'est volontaire, c'est le cœur du jeu.

### Géométrie

À une table ronde, les autres convives sont vus sous un angle égal à la moitié de
l'angle au centre. À 6 joueurs : 0°, ±30°, ±60° — **tout le monde est devant**, personne
derrière. La confusion avant/arrière, point faible n°1 du binaural, disparaît.
Distances : 1,33 m pour les voisins, 2,40 m pour celui d'en face.

---

## Limites assumées de ce palier

- **Le mixage est fait côté client.** Un joueur qui ouvre les outils de développement
  peut voir quel siège a émis quel son. C'est acceptable entre amis, ça ne l'est pas
  en production : il faudra un mixage binaural côté serveur.
- Voix en **mesh WebRTC** (chacun se connecte à chacun). Ça tient à 6, pas au-delà.
  Sans TURN configuré, un joueur derrière un NAT symétrique n'est pas entendu —
  et c'est silencieux, pas bruyant : rien n'indique l'échec sans les pastilles.
  Voir « TURN » plus bas.
- La reprise de séance conserve le siège, mais **un joueur absent au moment du scrutin ne vote
  pas** : sa voix est simplement perdue.
- Aucune carte hors émission (SILENCE !, coupure micro, rembobinage) — c'est le palier 2.

---

## Lancer en local

```bash
npm install
npm start          # http://localhost:8080
```

Pour tester vite, toutes les durées sont réglables par variable d'environnement (en ms) :

```bash
MEETING_MS=30000 INTRO_MS=3000 VOTE_MS=15000 npm start
```

| Variable | Défaut | Rôle |
|---|---|---|
| `MEETING_MS` | 150000 | durée de la réunion |
| `JITTER_MS` | 15000 | flou sur la fin de réunion (±) |
| `BLANC_MS` | 4000 | silence imposé de fin |
| `INTRO_MS` | 9000 | ouverture de séance |
| `VOTE_MS` | 35000 | durée du vote |
| `RESULTS_MS` | 16000 | affichage des résultats |
| `MIN_SPEECH_MS` | 12000 | temps de parole minimum par manche |
| `COOLDOWN_MS` | 15000 | délai imposé entre deux émissions du même joueur |
| `DEBAT_MS` | 90000 | durée du débat contradictoire |
| `DELIB_MS` | 45000 | délibération libre après le débat |
| `VOTE_DEBAT_MS` | 9000 | vote de la salle sur le débat |
| `REVEL_DEBAT_MS` | 7000 | révélation des intervenants |
| `MOTION_MS` | 15000 | durée d'une motion d'ordre |
| `PRESSION_MS` | 95000 | temps de remplissage complet de la jauge de pression |
| `STUN_URLS` | STUN Google + Twilio | serveurs STUN, séparés par des virgules |
| `TURN_URLS` | *(vide)* | serveurs TURN, séparés par des virgules |
| `TURN_USER` / `TURN_PASS` | *(vide)* | identifiants TURN |

---

## Déploiement

### Fly.io

```bash
fly launch --no-deploy --name qui-a-fait-ca --region cdg
fly deploy --ha=false      # <-- IMPÉRATIF : sans ça Fly crée 2 machines
fly scale count 1          # ceinture et bretelles
fly machines list          # vérifier qu'il n'y en a qu'une
fly open
```

> **Le piège n°1.** `fly launch` et `fly deploy` créent **deux** machines par défaut
> (haute disponibilité). `min_machines_running = 1` ne l'empêche pas : il garantit
> qu'au moins une reste éveillée, pas qu'il n'y en ait qu'une seule. Avec deux machines,
> deux joueurs qui entrent le même code atterrissent dans deux salons vides différents.

Points d'attention, tous déjà réglés dans `fly.toml` :

- **Exactement une machine, qui ne dort pas.** L'état des parties est en mémoire dans le
  process. `min_machines_running = 1` empêche la mise en veille ; c'est `--ha=false` /
  `fly scale count 1` qui empêche la deuxième machine. Les deux sont nécessaires.
- Ne **pas** monter à 2 instances tant que l'état n'est pas sorti dans un Redis, ou tant
  que le routage n'épingle pas un code de réunion à une machine via `fly-replay`.
- Les WebSockets passent nativement par le proxy Fly, rien à configurer.
- HTTPS est forcé — obligatoire, `getUserMedia` ne fonctionne pas en clair.

### Cloudflare

Un CNAME `jeu.tondomaine.fr` vers `qui-a-fait-ca.fly.dev`, puis `fly certs add jeu.tondomaine.fr`.

**Mets le nuage orange en DNS only (gris), ou vérifie que le proxy laisse passer les WebSockets.**
Le proxy Cloudflare supporte les WebSockets, mais ajoute une latence sur le canal de
signalisation et coupe les connexions inactives au bout d'environ 100 s. Le plus simple
pour un playtest : DNS only.

### Diagnostic audio intégré

Chaque siège porte une **pastille** en haut à droite :

| Couleur | Sens |
|---|---|
| 🟢 vert | du son arrive vraiment de ce joueur (mesuré sur le flux reçu) |
| 🟠 orange | connexion établie mais **aucun son ne passe** |
| 🔴 rouge | connexion WebRTC échouée |
| ⚪ gris | en cours de connexion |

Une ligne de diagnostic sous la table nomme les joueurs dont la voix n'arrive pas.
Dans la console du navigateur, `__audio()` renvoie l'état complet de la chaîne.

Le bouton **🎧 Tester mon casque** du salon joue un pet aux 5 positions dans l'ordre :
chacun vérifie son casque avant de commencer.

### Le traitement micro détruit la spatialisation — résolu

**Symptôme** : sous Firefox, tous les sons se jouaient en stéréo « plate », sans aucune image
spatiale. Chrome, en parallèle sur la même machine et le même casque, était parfait.

**Fausses pistes écartées en chemin**, toutes mesurées : ce n'était pas le casque
(`maxChannelCount = 2`), pas le 7.1 virtuel, pas les fichiers binauraux (les bips de contrôle
sont générés à la volée et étaient mono eux aussi), pas le rendu HRTF.

**Cause réelle** : les contraintes `getUserMedia`. Dès qu'**un seul** de `echoCancellation`,
`noiseSuppression` ou `autoGainControl` est demandé, Firefox monte la chaîne de traitement
audio de libwebrtc et couple entrée et sortie dans un **flux duplex de communication**, qui est
monophonique. Toute la sortie du graphe WebAudio y est ré-additionnée : ITD et ILD s'annulent.
Couper la seule annulation d'écho ne suffisait pas — la correction de gain automatique
maintenait la même chaîne.

**Correctif** : les **trois** traitements sont coupés. Le casque étant obligatoire, il n'y a
aucune boucle acoustique à annuler. Une case sur l'écran d'accueil permet de tout réactiver
pour quelqu'un sans casque, et la salle d'attente affiche alors un avertissement explicite.

Le problème étant corrigé, **aucun message ne mentionne de navigateur dans l'interface**.
Le seul avertissement qui subsiste est celui que le joueur a lui-même provoqué en cochant
la case. Nommer un navigateur devant quelqu'un qui n'a plus rien à corriger ne fait
qu'inquiéter, et jette un discrédit qui n'a plus lieu d'être.

### Le traitement micro, refait à la main

Puisque celui du navigateur est inutilisable, la chaîne est reconstruite dans le graphe
WebAudio — qui n'a pas l'effet de bord sur la sortie. Dans l'ordre :

1. **Coupe-bas à 95 Hz** — chocs de bureau, manipulations, ronflement secteur.
2. **Creux de 5 dB à 4,2 kHz** — c'est la bande où claquent les touches de clavier ;
   la voix n'y perd presque rien.
3. **Compression douce** (seuil −30 dB, ratio 3:1) — remplace la correction de gain
   automatique du navigateur et resserre les écarts entre joueurs.
4. **Porte de bruit** — ferme le micro tant que personne ne parle. Détection sur RMS toutes
   les 25 ms, ouverture en 6 ms, maintien 280 ms après le dernier son, fermeture en 90 ms.
   Seuil réglable par joueur (curseur « Seuil d'ouverture du micro »), échelle exponentielle.

Ce qui part vers les autres et ce qu'on se réentend en sidetone sont **le même signal traité** :
si vous vous entendez, la table vous entend. La jauge de micro passe au **vert quand la porte
est ouverte**, grise sinon — le réglage se fait à l'œil, en tapant au clavier puis en parlant.

Le comptage du temps de parole se fait **après** la porte : le bruit de clavier ne compte pas
comme de la participation.

Techniquement, la piste envoyée aux pairs n'est plus celle de `getUserMedia` mais celle d'un
`MediaStreamAudioDestinationNode` placé en sortie de chaîne.

### Outils de diagnostic conservés

- **Vérifier mes canaux (sans micro)**, sur l'écran d'accueil : joue deux bips, un par canal,
  avant toute capture. Compare la sortie avant / après ouverture du micro — c'est ce test qui
  a isolé la cause.
- **Essai acoustique** en salle d'attente : bips voie A (graphe WebAudio) puis voie B (lecteur
  média), puis les cinq positions **par le chemin réellement utilisé en séance**.
- **Mode B** : bascule les pets sur le lecteur média, qui échappe au flux duplex. Filet de
  sécurité manuel, désactivé par défaut. Ne rattrape pas les voix, qui exigent le `PannerNode`.
- **Sélecteur de microphone** avec changement à chaud (`replaceTrack` chez tous les pairs) :
  capturer un micro autre que celui du casque rompt le couplage entrée/sortie.
- `__audio()` dans la console : canaux, fréquence, micro actif, mode de sortie, état du
  traitement.

### Tester le TURN sans joueurs humains

**Deux onglets sur la même machine ne testent rien.** Ils se connectent par candidat
`host`, en boucle locale : ni STUN ni TURN ne sont sollicités. Un TURN cassé passe le test.

Trois moyens de lever le doute, du plus rapide au plus complet :

1. **Trickle ICE** — [webrtc.github.io/samples/src/content/peerconnection/trickle-ice](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/).
   Saisir l'URL TURN et les identifiants, cliquer *Gather candidates*. Si une ligne de
   type **`relay`** apparaît, le serveur et les identifiants sont bons. Sinon ils sont
   faux, ou le port est bloqué. Trente secondes, aucun joueur.

2. **Mode relais forcé** — ajouter `?relay=1` à l'URL du jeu. `iceTransportPolicy` passe
   à `relay` : **toutes** les liaisons doivent transiter par le TURN, y compris entre deux
   onglets de la même machine. Si la voix passe dans ce mode, le TURN fonctionne de bout en
   bout. Si rien ne passe, il est en cause. C'est le test décisif, et il ne demande qu'une
   machine. Un bandeau signale que le mode est actif.

3. **Deux réseaux réels** — le portable en Wi-Fi et le téléphone en 4G. Deux NAT distincts,
   un seul humain. C'est le plus proche des conditions de jeu.

### Voir la voie empruntée en partie réelle

Toutes les 3 s, chaque liaison est interrogée via `getStats()` pour connaître la paire de
candidats retenue. Le résultat s'affiche sous le plan de salle et dans `__audio()` :

| Voie | Sens |
|---|---|
| `host` | réseau local — aucun serveur sollicité |
| `srflx` | NAT traversé par STUN, liaison directe |
| `relay` | passé par le serveur TURN |

`__audio().liaisons` donne le détail par siège, avec l'état et le RTT en millisecondes.

> Sur un réseau restrictif, ajouter une URL TURN en **TCP sur 443** à `TURN_URLS` :
> c'est ce qui franchit les pare-feux d'entreprise quand l'UDP 3478 est fermé.

### Si la voix ne passe pas chez quelqu'un

Pastille orange ou rouge = NAT symétrique (réseau d'entreprise, la plupart du temps).
Il faut un serveur TURN. **Aucune modification de code n'est nécessaire**, tout passe
par des variables d'environnement — le serveur transmet la config ICE au client :

```bash
fly secrets set \
  TURN_URLS="turn:turn.cloudflare.com:3478?transport=udp,turn:turn.cloudflare.com:3478?transport=tcp" \
  TURN_USER="…" \
  TURN_PASS="…"
```

Les logs au démarrage affichent la config ICE effective (`fly logs`).

Fournisseurs : [Cloudflare Calls TURN](https://developers.cloudflare.com/calls/turn/)
(gratuit jusqu'à 1 To/mois) ou Twilio NTS. Le client récupère la config depuis le
serveur à la connexion — il suffit de redéployer les secrets, rien à recompiler.

---

## Ajouter des sons

`tools/audio/` contient la chaîne de spatialisation (Python).

```bash
pip install slab numpy scipy --break-system-packages
python3 tools/audio/spatialize.py     # lit des WAV mono, écrit 5 rendus par son
```

Puis convertir en MP3 et déposer dans `public/sfx/` sous la forme
`<id>_1.mp3` … `<id>_5.mp3` plus `<id>_self.mp3` (le son brut, non spatialisé,
joué à celui qui pète). Enfin, déclarer le son dans `content.js` :

```js
{ id: "mon_pet", nom: "Le Nouveau", dur: 0.9, loc: 2 }
```

`loc` va de 1 à 3 : c'est la **localisabilité mesurée** du son, affichée en étoiles
au joueur. Elle se lit dans `Sounds_edit/RAPPORT.md` (indice ILD à 60°) :
★★★ au-delà de −8 dB, ★★ entre −8 et −6,3 dB, ★ en dessous.

---

## Checklist avant playtest

1. Tout le monde au **casque**, L à gauche, puis **🎧 Tester mon casque** dans le salon.
1bis. **Vérifier les pastilles vertes** avant d'ouvrir la séance. Une pastille orange
   ou rouge = ce joueur ne sera pas entendu, et aucune manche ne le rattrapera.
2. Chrome ou Edge de préférence. Safari fonctionne, Firefox est plus capricieux sur le mesh.
3. Autoriser le micro à l'arrivée sur la page — sans micro, pas de jeu.
4. L'hôte crée la réunion, partage le code (ou l'URL, qui contient déjà le code).
5. Prévenir : **on parle beaucoup**. Le silence tue le jeu.

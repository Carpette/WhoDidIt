# Qui a fait ça ?!

Jeu de déduction sociale **audio**. Une réunion en ligne, six personnes autour d'une
table ronde, et un ou deux participants qui pètent en douce. Aucune information à
l'écran ne dit qui a fait quoi : **il faut localiser le son à l'oreille**.

**Le casque est obligatoire.** Sur haut-parleurs, le jeu n'a strictement aucun sens.

---

## Pourquoi ça marche

Tout repose sur une hypothèse qui a été vérifiée avant d'écrire une ligne de jeu :
un navigateur peut-il placer un son à un endroit précis autour de la tête, assez
finement pour qu'un joueur désigne le bon siège ?

Oui, à trois conditions :

1. **HRTF mesurée, pas simulée.** Les sons sont rendus hors ligne avec le jeu de
   filtres **MIT KEMAR** (710 directions, 512 coefficients), pas avec un
   panoramique stéréo. Chaque siège a sa propre paire de filtres.
2. **Personne derrière.** À six autour d'une table ronde, l'angle sous lequel on
   voit son voisin vaut la moitié de l'angle au centre : tout le monde tient dans
   un arc frontal de 120°, aux positions 0°, ±30°, ±60°. Il n'y a donc **aucune
   confusion avant/arrière**, qui est le point faible de toute spatialisation
   binaurale.
3. **Des sons larges en fréquence.** L'indice de localisation le plus robuste est
   l'écart de niveau entre les deux oreilles, et il n'existe qu'au-dessus d'environ
   1,5 kHz. Un pet trop grave n'est pas localisable — c'est mesuré, et c'est devenu
   une **statistique de jeu** : chaque son affiche sa « traçabilité ».

Test à l'aveugle sur le premier prototype : **7 identifications correctes sur 8**.

---

## Structure du dépôt

```
app/                    le jeu — serveur Node + client navigateur
  server.js             état des salons, phases, scoring (tout en mémoire)
  content.js            banc de sons, textes, musiques
  ordres-du-jour.js     319 motions soumises au débat
  public/               client : index.html (CSS inclus), app.js
  public/sfx/           198 rendus binauraux servis au jeu (33 sons × 6 positions)
  public/music/         musiques de fin de partie
  tools/audio/          la chaîne de rendu binaural (Python)
  README.md             règles complètes, déploiement, pièges connus

Sounds/                 sources brutes, telles que téléchargées — jamais modifiées
Sounds_edit/            sources nettoyées et découpées
  pets/                 les 60 pets exploitables (source du rendu)
  musique/              sources des musiques
  autres/ rejets/       ce qui n'a pas été retenu, conservé pour trace
  PROVENANCE.md         registre des licences, source par source
  RAPPORT.md            journal du tri et des traitements

DESIGN.md               le concept, les décisions de gameplay et leur raison
poc_spatialisation_v2.html   la démonstration d'origine, autonome, à ouvrir au casque
```

---

## Deux chaînes distinctes

**La chaîne audio (Python, hors ligne).** Les pets ne sont pas spatialisés dans le
navigateur : ils sont **pré-rendus** une fois pour toutes, sièges 1 à 5 plus la
position de l'émetteur lui-même. C'est ce qui permet d'utiliser une vraie HRTF
mesurée plutôt que l'approximation du navigateur, et de **mesurer** la
localisabilité de chaque son avant de l'inclure.

```bash
cd app/tools/audio
pip install numpy scipy slab --break-system-packages
python3 build_sfx.py pet_strain pet_taco …      # → app/public/sfx/
```

Les paramètres de la salle virtuelle sont en tête de `build_sfx.py` :
réverbération à 0,15 et atténuation en 1/d^1,4. Ces deux valeurs ont été choisies
par mesure, pas au jugé — elles maximisent l'écart perçu entre les sièges 1 et 2,
qui sont les plus faciles à confondre.

> **Si vous refaites un rendu**, incrémentez `SFX_VER` en tête de
> `app/public/app.js`. Les sons sont servis avec un cache d'une semaine : sans ce
> jeton, les joueurs garderaient l'ancien banc.

**La chaîne des voix (navigateur, temps réel).** Les voix passent en WebRTC et sont
spatialisées à la volée par le navigateur, à la position du siège de chacun.
C'est moins précis qu'une HRTF mesurée, mais c'est du direct : on n'a pas le choix.

---

## Lancer en local

```bash
cd app
npm install
npm start                 # http://localhost:8080
```

Trois joueurs minimum. En dessous de cinq, la déduction est très faible ; **six est
l'effectif nominal**.

## Déployer

```bash
cd app
fly deploy --ha=false     # le --ha=false n'est PAS optionnel
```

L'état des salons vit **en mémoire du processus**. Deux machines Fly = deux
serveurs qui ne partagent rien, donc des joueurs qui ne se voient pas. `--ha=false`
et `min_machines_running = 1` sont là pour ça.

Voir `app/README.md` pour les règles complètes, la configuration réseau et la liste
des pièges déjà rencontrés.

---

## Licences des sons

Tous les sons retenus proviennent de sources libres de droit, principalement
Freesound en **CC0**. Le registre complet — auteur, identifiant, licence, source
par source — est dans `Sounds_edit/PROVENANCE.md`. Les extraits dont l'origine
reste à confirmer y sont **explicitement signalés** et doivent être remplacés avant
toute diffusion publique.

Le code est privé et n'est pas publié sous licence libre.

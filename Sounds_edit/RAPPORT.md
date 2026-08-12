# Rapport d'analyse du banc de sons — v1

Source analysée : `Sounds/` (26 fichiers, intacts, je n'ai rien supprimé ni modifié).
Sortie : `Sounds_edit/` — mono, 48 kHz, 24 bits, silences rognés, fondus de 4/8 ms, crête normalisée à −1 dBFS.

## 1. Doublons exacts (PCM identique, bit à bit)

| Gardé | Doublon à supprimer |
|---|---|
| `fart-squeak-01.mp3` | `squeaky-fart.mp3` |
| `girl-fart.mp3` | `small-short-fart.mp3` |
| `dirty-long-fart.mp3` | `silly_farts-joe-1473367952.mp3` |

À noter : `faaaa...art.mp3` a exactement la même durée que `girl-fart.mp3` mais un contenu différent — c'est une variante retraitée, pas un doublon.

## 2. Problème de stéréo pré-existante

La spatialisation exige des sources **mono et sèches**. Un son déjà stéréo contient une image spatiale qui se battra avec la nôtre.

- **Parfaitement dual-mono (idéal)** : `chewbacca`, `chili-chili`, `dodgerfart`, `farthardlongfunny`, `rec_3s_15`, `wet-fart_MKsK7n2`
- **Vraie stéréo (à surveiller)** : `dirty-long-fart` (−5,4 dB de canal latéral), `family-guy` (−7,9), `fart-03` (−11,6), `fart-and-vomit` (−14,6), `wet-fart-2` (−15,8), `girl-fart` (−16,7)

Tous ont été sommés en mono. Sur les plus stéréo, écoute bien : une annulation de phase peut avoir mangé du contenu.

## 3. Qualité technique

- `the-long-and-winded-road-...mp3` : **16 kHz d'échantillonnage**, plafond spectral à 8 kHz. Trop dégradé pour de la spatialisation fine, et c'est un medley de 31 s. Non traité — à remplacer par une meilleure source si le contenu t'intéresse.
- `chili-chili-fart` : 24 kHz, acceptable mais en dessous du lot.
- `fart-squeak-01` / `squeaky-fart` : crête à −24 dBFS, très faible. Rattrapé (+23,5 dB) mais le rapport signal/bruit en pâtit.

## 4. Classement par localisabilité (indice HF−LF)

Écart entre l'énergie au-dessus de 2 kHz et en dessous de 1,2 kHz. **Plus c'est haut, plus le son est facile à localiser** — c'est mesuré, pas estimé.

**Très localisables** — candidats « pet franc », celui qui te fait repérer :
`pet_bouche-splat` (+6,1) · `pet_humide-2` (+1,9) · `pet_faaart` (+0,7) · `pet_squeak` (−0,2) · `pet_bugleboy` (−0,4)

**Moyens** : `pet_hard-long` (−2,2) · `pet_chili` (−2,6) · `pet_generique` (−3,3) · `pet_dirty-long` (−3,7) · `pet_dodger-final` (−4,7) · `pet_humide-1` (−4,9) · `pet_dodger-long` (−5,6)

**Peu localisables** — candidats naturels « pet furtif » :
`pet_aigu-court` (−17,6) · `pet_toot-court` (−10,7) · `pet_chewbacca` (−10,1) · `pet_03` (−10,0) · `pet_toot-long` (−9,2)

> **Conséquence de game design** : la difficulté de localisation d'une carte n'a pas besoin d'être truquée. Elle est une propriété physique du son. Un « pet furtif » grave est objectivement plus dur à situer qu'un « pet franc » large bande. Le banc de sons devient un outil d'équilibrage.

## 5. Découpes effectuées

| Fichier produit | Source | Découpe |
|---|---|---|
| `pet_vomit-cut` | fart-and-vomit | 0 → 1,95 s (le vomi retiré) |
| `pet_bugleboy` | bugleboyfart | 0,90 → 2,00 s (4,2 s de silence en queue retirés) |
| `pet_toot-court` / `pet_toot-long` | fart-toot | 2 pets isolés, 2,5 s de silence au milieu supprimés |
| `pet_dodger-long` / `pet_dodger-final` | dodgerfart | 2 pets isolés |
| `atrier_my-song-7_a/b` | my-song-7 | 2 segments |

## 6. `a_trier/` — ce que je ne peux pas valider seul

`famguy_01` à `famguy_15` : les 15 segments de `family-guy-fart-song`, découpés aux frontières de silence.
**Je ne peux pas les écouter.** Je ne sais donc pas lesquels sont des pets et lesquels sont de la voix chantée. `famguy_15` fait 10,3 s et est très probablement la partie chantée. À toi de faire le tri à l'oreille — renomme et déplace vers `pets/` ce qui est bon.

Idem pour `atrier_rec3s` et `atrier_my-song-7_*` : contenu inconnu de moi.

## 7. Limite atteinte

La spatialisation de ces sons ne peut pas se faire ici : le moteur HRTF (MIT KEMAR) tourne dans mon environnement cloud, et le transfert de fichiers depuis ce Mac est actuellement refusé — **la session de l'app Claude sur cette machine demande une reconnexion**. Une fois reconnecté, je récupère les fichiers validés et je régénère la page de test avec tes vrais sons.

---

# v2 — après ton tri

## Localisabilité mesurée sur le rendu binaural (ILD à 60°)

Les 9 sons que tu viens de valider, classés :

| Son | Durée | ILD @60° | Verdict |
|---|---|---|---|
| famguy_01 | 0,72 s | −8,2 dB | ★★★ |
| famguy_02 | 1,21 s | −7,9 dB | ★★ |
| famguy_14 | 1,54 s | −5,9 dB | ★ |
| famguy_05 | 0,38 s | −5,2 dB | ★ |
| famguy_04 | 0,33 s | −4,6 dB | ★ |
| famguy_07 | 0,96 s | −4,5 dB | ★ |
| famguy_08 | 0,95 s | −4,0 dB | ★ |
| famguy_03 | 1,85 s | −3,2 dB | ★ |
| atrier_my-song-7_a | 3,71 s | −3,1 dB | ★ |

Pour comparaison, le banc initial allait de −10,0 à −2,8 dB.

**Constat : les extraits Family Guy sont globalement peu localisables.** Sept des neuf sont sous −6 dB. C'est cohérent avec leur origine — bande-son de dessin animé, déjà compressée, mixée et bandée-limitée. Ce ne sont pas de mauvais sons, mais ce sont des **sons de bluff**, pas des sons de preuve. Deux exceptions : `famguy_01` et `famguy_02` tiennent la comparaison avec les meilleurs du banc.

## Musique

`famguy_15` sortait du pipeline en mono — inadapté à de la musique. Réextrait depuis la source **en stéréo**, 48 kHz / 24 bits, 10,4 s, fondus aux extrémités : `Sounds_edit/musique/musique_fin-de-partie.wav`. La version mono a été déplacée dans `_to_delete/`.

Ce fichier ne doit **pas** passer par le moteur binaural : un écran de fin se joue en stéréo classique, hors de la salle virtuelle.

## Reste à trier

`a_trier/` contient encore `famguy_09` à `famguy_13` (cinq segments de 0,36 à 0,40 s).

## Total

`Sounds_spatialized/` : **150 rendus** = 30 pets × 5 sièges.

---

# v3 — nouveaux sons

## Localisabilité mesurée (ILD à 60° sur rendu binaural)

| Son | Durée | ILD @60° | Verdict |
|---|---|---|---|
| pet_strain | 0,71 s | **−12,8 dB** | ★★★ — record du banc |
| pet_rec1s | 0,93 s | −8,9 dB | ★★★ |
| pet_squeak-2 | 2,16 s | −8,2 dB | ★★★ |
| pet_ketchup | 2,57 s | −7,4 dB | ★★ |
| pet_puka-long | 2,65 s | −6,6 dB | ★★ |
| pet_puka-court | 0,63 s | −6,5 dB | ★★ |
| pet_taco | 3,82 s | −6,5 dB | ★★ |
| pet_ptt-1 | 0,17 s | −5,9 dB | ★ |
| pet_ptt-3 | 1,18 s | −5,5 dB | ★ |
| pet_ptt-2 | 0,26 s | −5,2 dB | ★ |
| pet_dreamybull | 2,47 s | −4,6 dB | ★ |
| pet_krack | 0,45 s | −2,8 dB | ★ |
| pet_sourd | 1,12 s | −2,5 dB | ★ — quasi introuvable |

**L'amplitude du banc passe de −12,8 à −2,5 dB, soit un facteur 5.** Le paquet a maintenant de vrais extrêmes aux deux bouts.

## Découpes
- `zvuk-puka` (22 kHz, mono) → 2 pets : `pet_puka-court`, `pet_puka-long`.
- `whatsapp-ptt-…` → 3 pets : `pet_ptt-1/2/3`.
- `fart-strain` → coupé à 0,78 s (le reste du fichier est vide).
- `taco-fart` → 0,24 → 4,14 s. `ketchup-fart` → 0 → 2,60 s.

## Doublon
`silly_farts-joe-1473367952_1.mp3` est **identique au PCM près** à `dirty-long-fart.mp3` (déjà traité en `pet_dirty-long`). Déplacé dans `rejets/`.

## Musiques
`goofy-ahh-fart-music` (8,2 s) et `fart-song-remix` (19,0 s) normalisées en **stéréo**, 48 kHz / 24 bits, fondu de sortie de 250 ms. Les MP3 sources sont dans `_to_delete/`.
Les trois musiques sont câblées dans le jeu : une est tirée au sort à l'écran de fin de partie.

## Total
`Sounds_spatialized/` : **215 rendus** = 43 pets × 5 sièges.
Paquet de cartes du jeu : **14 sons**, dont 6 ★★★, 4 ★★ et 4 ★.

---

# v4 — ajouts du 10 août (après-midi)

| Son | Durée | ILD @60° | Verdict |
|---|---|---|---|
| pet_record21 | 0,32 s | −5,8 dB | ★ |

`record20210713205920-…mp3` : mono réel (canal latéral à −90 dB, parfait), mais **très grave** — HF−LF à −14,3 dB, presque toute l'énergie sous 1,2 kHz. Coupé à 0,36 s (le reste du fichier est vide). Résultat : peu localisable, ce qui en fait une bonne carte de bluff. Nommé **« Le Feutré »** dans le jeu.

## Musique
`fartcore.mp3` (13,2 s, vraie stéréo, canal latéral à −1,9 dB) normalisée en stéréo 48 kHz / 24 bits avec fondu de sortie de 300 ms → `musique_fartcore.wav`. Le MP3 source est dans `_to_delete/`.

**Quatre musiques** sont maintenant câblées ; une est tirée au sort à la clôture de séance.

## Total
`Sounds_spatialized/` : 220 rendus = 44 pets × 5 sièges.
Paquet du jeu : **15 sons** — 6 ★★★, 4 ★★, 5 ★.

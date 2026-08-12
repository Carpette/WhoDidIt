# Qui a fait ça ?! — document de design v0.2

*Remplace la v0.1. Intègre tout ce qui a été tranché en discussion, plus les résultats mesurés du POC audio.*

---

## 1. Pitch

Une réunion en ligne. Six personnes autour d'une table, casque sur les oreilles, audio spatialisé au degré près. La réunion a un ordre du jour absurde et une règle de conduite que tout le monde doit respecter.

Et pendant que ça discute, quelqu'un pète.

Personne ne sait qui parle — aucun nom ne s'affiche. Personne ne sait qui pète. Tout ce qu'on a, c'est ses deux oreilles et une place à table.

---

## 2. Le pilier central : deux couches, une seule compétence

C'est l'idée qui tient tout le jeu.

Comme rien n'identifie le locuteur à l'écran, **prouver que Kevin a dit « oui » demande exactement la même chose que prouver que Kevin a pété** : localiser un son et l'attribuer à un siège.

La discussion n'est donc pas un décor autour du jeu de pets. C'est le même jeu, sur un second canal, joué en continu. Les joueurs s'entraînent à la compétence décisive sans s'en apercevoir, et celui qui sait reconnaître les voix dans l'espace est aussi celui qui saura placer ses pets.

Tout le reste du design découle de là.

---

## 3. Structure d'une manche

Pas de phases, pas de tours. Une seule fenêtre continue.

```
MANCHE
 ├── Placement       sièges tirés au sort, fixes pour la manche
 ├── Ordre du jour   un sujet absurde s'affiche
 ├── Contrainte      une règle de conduite publique, la même pour tous
 ├── Missions        une mission secrète personnelle par joueur
 │
 ├── LA RÉUNION      ~90 s. On parle. On pète. En même temps.
 │                   Les cartes se jouent librement, quand on veut.
 │
 ├── LE BLANC        4 s de silence imposé, micros coupés.
 │                   Toute carte encore en attente part à nu.
 │
 ├── VOTE            une accusation par joueur (voir §6)
 └── Révélation + score
```

Une partie se joue en X manches, X paramétrable au lancement.

**Pourquoi le format libre.** Le masquage social est le moteur du jeu, pas un compromis. La localisation d'un son se joue dans ses deux premières millisecondes — c'est l'effet de précédence. Si la conversation couvre l'*attaque* d'un pet, la direction est perdue même si toute la queue reste audible. Les gens se taisent après avoir entendu : ils captent la fin, ils ratent l'information. Un pet long lancé pendant un fou rire est encore mieux caché, parce que plusieurs rires simultanés viennent de plusieurs directions à la fois.

**Le blanc final** donne une ponctuation dramatique à chaque manche sans structurer quoi que ce soit avant, et punit celui qui a trop attendu.

---

## 4. Les contraintes de conversation

### La règle publique (une par manche, la même pour tous)

Annoncée au début, connue de tous, surveillée par tous.

**Privilégier les contraintes positives, qui forcent la parole**, plutôt que les interdictions, qui poussent au silence prudent — or on a besoin que les gens parlent :

- Tu dois répondre à toute question qu'on te pose.
- Personne ne doit rester silencieux plus de dix secondes.
- Toute affirmation doit être appuyée par un chiffre inventé.
- On ne peut parler qu'en posant des questions.

Garder quelques interdictions en rotation pour la variété (« ne jamais dire oui »), mais en minorité.

### La mission secrète (une par joueur, cachée)

Positive et manipulatrice. C'est un piège à tendre, pas une contrainte à subir :

- Fais dire « oui » à la personne en face de toi.
- Fais parler ton voisin de gauche pendant vingt secondes d'affilée.
- Obtiens que le groupe prenne une décision sur le point 4.

### Pourquoi cette combinaison

Elle ouvre le meilleur coup du jeu : **un péteur peut piéger un innocent pour détourner le vote**. Tu sens le groupe se refermer sur toi, tu manœuvres pour faire enfreindre la règle à Marie, le vote part sur elle. Tu ne t'es pas défendu, tu as offert une proie plus facile.

Symétriquement, elle donne à l'innocent un moyen concret d'attirer les soupçons volontairement — enfreindre la règle exprès, survivre au vote, empocher les points.

---

## 5. Rôles

**Péteur** (1 à 3 selon l'effectif, option « les péteurs se connaissent » cochable au lancement)
Objectif : ne pas être accusé, être encore là à la fin. Sa main contient une majorité de cartes d'émission, il pétera forcément.

**Innocent**
Objectif principal : identifier et éliminer les péteurs. Objectif secondaire : se faire soupçonner sans mourir.

**Rôles optionnels à explorer**
*Le Nez* — obtient une fois par manche un indice fiable sur le quadrant d'origine d'un son.
*L'Intestin fragile* — innocent qui pète involontairement, le système déclenche à sa place. Générateur de faux positifs légitimes.

---

## 6. Le vote : deux armes, un seul tir

**Le piège à éviter : la preuve facile chasse la preuve difficile.** Si un même vote peut éliminer un contrevenant ou un péteur, les joueurs voteront toujours sur l'infraction, qui est certaine, jamais sur le pet, qui est un pari. La couche pet meurt étouffée par son décor.

**Solution retenue.** Chaque joueur lance une accusation et une seule, au choix :

| Accusation | Effet |
|---|---|
| **« Il a enfreint la règle »** | Ne tue pas. Coûte des points à l'accusé si la majorité suit. |
| **« C'est lui le péteur »** | Élimine si la majorité suit. |

Seule la couche pet a le pouvoir d'éliminer. Le vote reste unique et tendu, l'arbitrage entre les deux couches est un vrai choix, et la règle de conduite garde du poids sans écraser le jeu.

---

## 7. Les cartes

La structure vient des cartes, jamais du format. La réunion est libre et bordélique par défaut ; la structure n'apparaît que si quelqu'un dépense une carte pour la créer.

**Règle d'équilibrage capitale : la majorité des cartes doivent être muettes.** Viser deux à quatre sons par réunion, pas six. Une scène saturée n'est plus analysable par l'oreille humaine — au-delà de trois sources concurrentes, la scène auditive s'effondre.

### Émission
Le Franc · Le Long · Le Furtif · Le Humide.
Les innocents en ont **au moins une**, obligatoirement. Les péteurs en ont une majorité,
et leur nombre suit l'effectif (2 cartes à 3 joueurs, 4 à partir de 5).

Un **délai de quinze secondes** sépare deux émissions du même joueur : sans lui, on vide sa
main en dix secondes et la scène sonore est saturée d'un coup.

### Silence et micro — le contre-jeu des innocents
**SILENCE !** — coupe tous les micros trois secondes. Fabrique une fenêtre de silence pur où le moindre pet est à nu. Le timing est un vrai jeu de lecture.
**Coupure micro** — cible une personne dix secondes. Elle peut encore péter, mais nue, et ne peut plus se défendre.
**La parole est à toi** — force quelqu'un à parler dix secondes. Ambigu : tu le cloues au micro pour t'en servir de masque, ou tu l'exposes.

> À surveiller : si le groupe est très bavard en permanence, plus personne n'est identifiable et les péteurs gagnent toujours. **SILENCE ! doit sans doute être garanti dans la main de chaque innocent**, pas tiré au hasard, sinon une manche peut être ingagnable.

### Spatial
Une carte de déplacement vise **toujours une position, jamais un joueur** : « décale-moi de trois places vers la gauche », « échange ma position avec celui d'en face ».
La voix ET les sons du joueur migrent immédiatement à la nouvelle position.
Autres pistes : rotation de toute la table d'un cran · Le Vent, qui décale la perception des sons d'un cran pendant dix secondes.

### Enquête et défense
**Rembobinage** — rejoue les cinq dernières secondes à toute la table. Pièce maîtresse : c'est la preuve, et elle sert **pour les deux couches**. « Écoutez, le "oui" vient de la droite, pas d'en face. » On plaide avec des enregistrements.
Le Renifleur · L'Alibi (annule une voix contre soi).

---

## 7 bis. La pression intestinale

C'est la réponse au problème du péteur passif, et elle vaut mieux que n'importe quel barème.

Le péteur voit une **jauge de pression**, connue de lui seul, qui monte tout au long de la
séance. Émettre la fait redescendre, **à proportion de la durée du son joué** : une pièce
longue soulage durablement mais se repère, une pièce brève est discrète mais n'accorde qu'un
répit. À saturation, **le corps décide à sa place** : l'*Incident* part à sa position — douze
secondes ininterrompues, le son le plus long et le plus reconnaissable du répertoire, au
moment qu'il n'aurait pas choisi. La jauge est ensuite gelée le temps de la diffusion, pour
qu'un second incident ne se superpose pas au premier.

**Ce que ça change.** La question n'est plus *faut-il émettre*, mais **à quel moment**.
L'inaction n'est plus une stratégie, c'est un compte à rebours. Et le jeu produit de lui-même
ses meilleurs moments : celui qui a trop attendu se fait trahir par son propre corps dans un
silence de mort, devant tout le monde.

Un incident ne rapporte **aucun point** : il n'est pas imputable à l'initiative du joueur,
seulement à son imprévoyance.

## 8. Le joueur éliminé

Il est **sorti de la réunion, pas de la salle**. Il devient le bruit de couloir : il déclenche des sons d'ambiance à son ancienne place — une porte, une chaise, un téléphone, la machine à café.

Aucun point à gagner, aucune influence sur le vote, mais il alimente l'économie du masquage et continue de faire du bruit pour ceux qui restent. Il joue encore, il ne gagne plus, et il emmerde tout le monde — ce qui est précisément ce dont un joueur éliminé a envie.

---

## 9. Scoring (v0, à équilibrer en playtest)

| Situation | Points |
|---|---|
| **Péteur n'ayant rien émis volontairement** | **0** |
| Péteur — par émission volontaire | +1, plafonné à +3 |
| … et non accusé | +3 de plus |
| … ou accusé sans être éliminé | +1 de plus |
| Péteur éliminé | 0 |
| Incident subi (émission forcée par la pression) | 0 — le corps a agi, pas le joueur |
| Innocent ayant reçu ≥1 voix et survivant | +1 par voix, plafonné à +2 |
| Innocent éliminé | 0 — fin de manche pour lui |
| Innocent ayant accusé juste un péteur | +2 |
| Mission secrète accomplie | +2 |
| Infraction retenue contre soi | −2 |

**Pourquoi ce barème.** Dans la première version, le péteur marquait +3 en ne faisant rien :
émettre n'apportait aucun point et ne faisait qu'ajouter du risque. L'inaction était donc
*strictement dominante*, ce qui est la pire chose qui puisse arriver à un jeu — et elle était
d'autant plus confortable que les innocents, eux, ont intérêt à faire du bruit, offrant au
péteur muet une couverture gratuite.

Désormais le gain croît avec ce qu'on a osé faire, et chaque émission supplémentaire expose
davantage. La décision devient continue au lieu d'être binaire, et il n'existe plus de point
fixe où ne rien faire est confortable.

---

## 10. Audio — ce qui est prouvé, ce qui reste à faire

### Prouvé par le POC
- Rendu binaural HRTF réelle (MIT KEMAR) + réflexions de salle d'ordre 1 + réverbération diffuse.
- **Test de localisation en aveugle : 7/8** (hasard = 1,6/8). La mécanique tient.
- **La table ronde met tout le monde devant.** Géométrie : l'angle sous lequel on voit un autre convive vaut la moitié de l'angle au centre. À 6, les autres sont à 0°, ±30°, ±60° — arc frontal de 120°, personne derrière. La confusion avant/arrière, point faible n°1 du binaural, disparaît par construction.
- La distance varie de 1,33 m (voisins) à 2,40 m (en face) : indice de niveau et de rapport direct/réverbéré exploitable.

### Le banc de sons est un outil d'équilibrage
30 pets nettoyés, mesurés sur leur rendu binaural réel. L'écart de niveau interaural à 60° va de **−10,0 dB** (`pet_dirty-long`) à **−2,8 dB** (`pet_aigu-court`) : un facteur 3,5 sur l'indice principal de localisation.

**La difficulté d'une carte n'a pas besoin d'être truquée, elle est une propriété physique du son.** Le « pet franc » et le « pet furtif » existent déjà dans le banc, il suffit de les choisir. La rareté relative des sons localisables devient un paramètre d'équilibrage du paquet.

Les extraits Family Guy sont majoritairement peu localisables (sept sur neuf sous −6 dB) : ce sont des **sons de bluff**, pas des sons de preuve.

### À implémenter — non négociable
**Le sidetone.** Quand tu parles, tu ne t'entends pas dans ton casque. Donc celui qui parle a le canal le plus propre de la table : il masque tout le monde et entend tout. La stratégie optimale devient « parler en continu » et le mode de jeu est cassé au niveau le plus profond. Correction : réinjecter sa propre voix dans son casque au niveau où on s'entendrait dans une vraie pièce, comme le fait la conduction osseuse.

**Mixage binaural côté serveur.** Si le mixage est fait côté client, le client reçoit les pistes séparées et leurs positions : un client modifié affiche « pet joué par Kevin » et le jeu est mort. Chaque joueur ne doit recevoir qu'un flux stéréo déjà mixé, sans métadonnée d'origine. Coûteux en CPU serveur, c'est le prix de l'intégrité.

**Aucun indicateur de niveau par joueur.** Un VU-mètre individuel est un vecteur de triche. *(Une jauge de bruit ambiant globale serait techniquement sûre, mais rendrait le mécanisme lisible donc optimisable — écarté volontairement : le bon moment doit se sentir, pas se lire.)*

**Casque obligatoire**, avec calibration au premier lancement.

**Plan de table public, voix non identifiée.** On sait qui est assis où ; on ne sait pas qui parle. C'est ce qui rend les deux couches jouables. Sans plan de table, le vote porterait sur des inconnus et il n'y aurait plus rien sur quoi raisonner.

---

## 11. Feuille de route — contre l'empilement

On a beaucoup empilé. C'est déjà plus lourd qu'*Among Us*, qui n'a que deux boutons. Rien ne se perd, mais tout se séquence.

### Palier 1 — la boucle nue
Six personnes. Une réunion de 90 s. Une contrainte publique. Deux péteurs. Un vote. **Aucune carte.**
Techniquement : la spatialisation est prouvée, les sons sont prêts. Il manque le canal vocal spatialisé avec sidetone, et un bouton pour déclencher un son. Quelques jours de prototype, pas un jeu.
**Question à laquelle ce palier répond : est-ce que ça fait rire pendant vingt minutes ?** Si non, aucune carte ne le sauvera.

### Palier 2 — le contre-jeu
Ajout de SILENCE !, Coupure micro, Rembobinage, et des cartes d'émission différenciées (franc / furtif / long).
**Question : est-ce que les innocents peuvent gagner ?**

### Palier 3 — la profondeur
Missions secrètes, cartes spatiales, double arme de vote, rôles optionnels, joueur éliminé en bruit de couloir.
**Question : est-ce qu'on y rejoue ?**

---

## 12. Questions encore ouvertes

1. Les péteurs se connaissent-ils ? — tranché : **option cochable au lancement**.
2. Effectif : 5 à 8. À 8 l'écart angulaire tombe à 22,5°. **Sweet spot probable à 6.**
3. Durée de la réunion : 90 s est une hypothèse, à valider en playtest.
4. Comment les innocents obtiennent leur carte de pet obligatoire : pioche garantie ou main imposée ?
5. Le score est-il individuel ou par camp ?
6. Accessibilité : le jeu est structurellement injouable pour les personnes sourdes ou malentendantes. Choix assumé, mais il ferme une partie du marché.

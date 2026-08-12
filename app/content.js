// Contenu éditorial — ordres du jour et consignes de réunion.

// Les 231 motions vivent dans ordres-du-jour.js. AGENDA est conservé pour
// compatibilité tant que le débat contradictoire n'est pas branché.
export { MOTIONS, MOTIONS_ADMIN, MOTIONS_CLASSIQUES, CAMPS } from "./ordres-du-jour.js";

// AGENDA et RULES ont été retirés : la motion soumise au débat contradictoire
// tient désormais lieu d'ordre du jour, et la « consigne de tenue » n'avait plus
// aucune conséquence de jeu depuis que le vote porte sur le responsable. Les
// listes sont conservées ci-dessous, en commentaire, pour le jour où le vote
// d'infraction sera construit.
/*
export const AGENDA = [
  "Point 4 — Faut-il remplacer la machine à café ?",
  "Point 7 — Nouvelle politique de télétravail pour les animaux de compagnie.",
  "Point 2 — Le vendredi doit-il devenir un jour facultatif ?",
  "Point 11 — Choix du nouveau nom de la salle de réunion.",
  "Point 9 — Peut-on interdire le micro-ondes du 2e étage ?",
  "Point 5 — Répartition équitable des plantes vertes.",
  "Point 13 — Faut-il tutoyer les prestataires ?",
  "Point 1 — Bilan du dernier séminaire, que personne n'assume.",
  "Point 8 — Instaurer un thème musical pour l'ascenseur.",
  "Point 6 — La pause déjeuner est-elle trop longue ou trop courte ?",
  "Point 12 — Que faire du frigo du 3e, personne ne sait à qui il est.",
  "Point 3 — Doit-on rendre les réunions debout obligatoires ?",
  "Point 10 — Refonte totale de la signalétique des toilettes.",
  "Point 14 — Faut-il un référent officiel pour les anniversaires ?",
  "Point 15 — Le badge d'entrée doit-il faire un bruit plus sympathique ?"
];

// Consignes majoritairement POSITIVES : elles forcent la parole.
export const RULES = [
  { t: "Tu dois répondre à toute question qu'on te pose.", kind: "positive" },
  { t: "Personne ne doit rester silencieux plus de dix secondes.", kind: "positive" },
  { t: "Toute affirmation doit être appuyée par un chiffre inventé.", kind: "positive" },
  { t: "On ne peut parler qu'en posant des questions.", kind: "positive" },
  { t: "Chaque prise de parole doit commencer par « alors ».", kind: "positive" },
  { t: "Tu dois citer le prénom de quelqu'un dans chaque phrase.", kind: "positive" },
  { t: "Toute idée doit être présentée comme venant de quelqu'un d'autre.", kind: "positive" },
  { t: "Tu dois approuver bruyamment ce que dit ton voisin de gauche.", kind: "positive" },
  { t: "Chaque intervention doit durer au moins cinq secondes.", kind: "positive" },
  { t: "Tu dois placer le mot « synergie » au moins deux fois.", kind: "positive" },
  { t: "Interdiction de dire « oui ».", kind: "negative" },
  { t: "Interdiction de dire « non ».", kind: "negative" },
  { t: "Interdiction de dire « je ».", kind: "negative" }
];

*/

export const SOUNDS = [
  // loc = localisabilité MESURÉE (ILD à 60° sur le rendu binaural réel)
  // 3 = au-delà de -9,7 dB · 2 = de -9,7 à -8,0 dB · 1 = en dessous
  // (barème recalé après le rendu « salle nette » : réverb 0,15 et distance en 1/d^1,4)
  { id: "pet_strain",       nom: "La Poussée",    dur: 0.7, loc: 3, fla: "Aucun doute possible sur la provenance. Le Comité vous le déconseille formellement." },  // -12,8 dB — le plus repérable du banc
  { id: "pet_dirty-long",   nom: "Le Dirty Long", dur: 3.9, loc: 3, fla: "Long, sale, et parfaitement situable. Un aveu à retardement." },  // -10,0
  { id: "pet_humide-2",     nom: "L'Humide",      dur: 0.5, loc: 3, fla: "Bref mais net. Le genre de chose qui fait tourner cinq têtes." },  //  -9,0
  { id: "pet_rec1s",        nom: "Le Sec",        dur: 0.9, loc: 3, fla: "Sec, franc, administratif. Il ne s'excuse pas." },  //  -8,9
  { id: "pet_bouche-splat", nom: "Le Splat",      dur: 0.2, loc: 3, fla: "Deux dixièmes de seconde. Largement assez pour vous perdre." },  //  -8,5
  { id: "pet_squeak",       nom: "Le Squeak",     dur: 1.8, loc: 3, fla: "Le grincement du fauteuil, sauf que ce n'est pas le fauteuil." },  //  -8,4
  { id: "pet_ketchup",      nom: "Le Ketchup",    dur: 2.6, loc: 2, fla: "Une texture que le règlement intérieur ne prévoit pas." },  //  -7,4
  { id: "pet_bugleboy",     nom: "Le Clairon",    dur: 0.9, loc: 2, fla: "Sonne comme une annonce officielle. N'en est pas une." },  //  -7,0
  { id: "pet_puka-court",   nom: "Le Puka",       dur: 0.6, loc: 2, fla: "Bref, discret, plausible. Un classique du séminaire." },  //  -6,5
  { id: "pet_taco",         nom: "Le Taco",       dur: 3.8, loc: 2, fla: "Quatre secondes d'incident diplomatique. Prévoir une couverture sonore." },  //  -6,5
  { id: "pet_toot-long",    nom: "Le Toot",       dur: 0.6, loc: 1, fla: "Petit, grave, difficile à situer. Le bon compromis." },  //  -5,2
  { id: "pet_krack",        nom: "Le Krack",      dur: 0.5, loc: 1, fla: "Un bruit de chaise. Enfin, presque." },  //  -2,8
  { id: "pet_aigu-court",   nom: "Le Furtif",     dur: 0.3, loc: 1, fla: "Trois dixièmes de seconde et déjà oublié. Personne ne saura." },  //  -2,8
  { id: "pet_record21",    nom: "Le Feutré",     dur: 0.3, loc: 1, fla: "Trois dixièmes de seconde, tout en bas du spectre. Le Comité lui-même n'y verrait que du feu." },  //  -5,8
  { id: "pet_sourd",        nom: "Le Sourd",      dur: 1.1, loc: 1, fla: "Sourd, diffus, impossible à attribuer. La pièce la plus lâche du dossier." },  //  -2,5 — quasi introuvable
  // --- fonds CC0 (Freesound) — licences perpétuelles, voir Sounds_edit/PROVENANCE.md
  { id: "pet_crazy-2",      nom: "Le Claquant",       dur: 0.3, loc: 3, fla: "Net, sec, sans appel. Le genre de chose qui fait tourner cinq têtes d'un coup." },
  { id: "pet_blubber-2",    nom: "Le Rebond",         dur: 0.6, loc: 3, fla: "Il repart une seconde fois, comme s'il tenait à être entendu." },
  { id: "pet_crazy-1",      nom: "Le Coup de Tampon", dur: 0.3, loc: 3, fla: "Bref et administratif. On croirait un parapheur qu'on referme." },
  { id: "pet_blubber-1",    nom: "Le Flottant",       dur: 0.7, loc: 3, fla: "Mou en surface, parfaitement localisable en dessous. Un piège." },
  { id: "pet_bassimat",     nom: "Le Circonstancié",  dur: 1.7, loc: 3, fla: "Long, argumenté, difficile à contredire. Et impossible à nier." },
  { id: "pet_chili-bad",    nom: "Le Chili Contrarié", dur: 1.4, loc: 3, fla: "La cantine du 2e avait prévenu. Personne n'a écouté." },
  { id: "pet_queef",        nom: "Le Sifflement",     dur: 0.7, loc: 2, fla: "Aigu, court, ambigu. Plaidez le fauteuil." },
  { id: "pet_flasque-2",    nom: "Le Mou",            dur: 0.7, loc: 1, fla: "Sans conviction, sans relief, sans témoin fiable." },
  { id: "pet_flasque-3",    nom: "Le Traînant",       dur: 1.8, loc: 1, fla: "Il s'étire, il s'attarde, il ne dit jamais d'où il vient." },
  { id: "pet_flasque-1",    nom: "Le Soupir",         dur: 0.4, loc: 1, fla: "On pourrait croire à de la lassitude. C'en est peut-être." },
  { id: "pet_flasque-7",    nom: "Le Résidu",         dur: 0.5, loc: 1, fla: "Ce qui restait après le point 6. Discret, comme il se doit." },
  { id: "pet_flasque-4",    nom: "Le Communiqué",     dur: 1.9, loc: 1, fla: "Long, officiel, et pourtant impossible à attribuer à qui que ce soit." },
  { id: "pet_cuvette-1",    nom: "L'Écho de Faïence", dur: 1.4, loc: 1, fla: "La réverbération n'est pas celle de cette pièce. Personne ne le remarquera." },
  { id: "pet_trompette-1",  nom: "La Fanfare",        dur: 1.0, loc: 1, fla: "Grave et cuivré. Majestueux, et curieusement introuvable." },
  { id: "pet_trompette-2",  nom: "Le Cor de Chasse",  dur: 1.2, loc: 1, fla: "Deux notes. La seconde était de trop." },
  { id: "pet_flasque-6",    nom: "L'Étouffé",         dur: 0.7, loc: 1, fla: "Retenu jusqu'au bout. Le fauteuil a absorbé le reste." },
  { id: "pet_flasque-5",    nom: "L'Amorti",          dur: 0.8, loc: 1, fla: "Tout en bas du spectre. Le Comité n'y verra que du feu." }
];

// L'incident : ce qui sort quand la pression n'a pas été gérée. Douze secondes
// extraites de « the long and winded road » — le bloc continu du fichier, sans
// coupure. Un seul son, toujours le même : il doit devenir immédiatement
// reconnaissable de toute la table, et humiliant par sa seule longueur.
export const INCIDENT = { id: "pet_incident", nom: "L'Incident", dur: 12.2 };

export const MUSIQUES = [
  "musique_fin-de-partie",
  "musique_goofy-ahh-fart-music",
  "musique_fart-song-remix",
  "musique_fartcore"
];

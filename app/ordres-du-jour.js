// ============================================================================
//  Qui a fait ça ?! — Ordres du jour
//
//  Chaque entrée est une PROPOSITION, pas un thème. C'est indispensable pour le
//  débat contradictoire : il faut qu'on puisse être POUR ou CONTRE sans réfléchir.
//  « Le frigo du 3e étage » n'est pas jouable ; « Le contenu du frigo du 3e doit
//  être détruit sans préavis le vendredi soir » l'est.
//
//  Règle de comédie appliquée partout : sérieux administratif + enjeu dérisoire
//  + un détail trop précis. C'est la précision qui fait rire, pas l'absurdité.
//
//  Le numéro de point est ajouté à l'exécution (« Point 47 — … »), ce qui donne
//  une numérotation incohérente d'une séance à l'autre. C'est volontaire.
// ============================================================================

export const MOTIONS_ADMIN = [

  // ---------- Locaux, mobilier, ergonomie ----------------------------------
  "Les mugs personnels doivent être immatriculés.",
  "Chaque fauteuil doit porter le nom de son occupant habituel, gravé.",
  "Les chaises à roulettes doivent être interdites aux étages impairs.",
  "Un référent hauteur d'écran doit être désigné par service.",
  "Les tapis de souris doivent être fournis par l'employeur et par lui seul.",
  "Le mobilier debout doit être réservé aux réunions de moins de dix minutes.",
  "Les cloisons acoustiques doivent être portées à 1,60 m.",
  "Chaque bureau doit disposer d'une corbeille distincte pour le papier brouillon.",
  "Les tiroirs du bas ne doivent plus servir de garde-manger.",
  "Les casiers non ouverts depuis six mois doivent être forcés.",
  "Le canapé du hall doit être retiré : il encourage la station assise prolongée.",
  "Les rallonges électriques doivent faire l'objet d'une demande écrite.",
  "Un plan de circulation intérieure doit être affiché à chaque étage.",
  "Les portes doivent toutes s'ouvrir dans le même sens.",
  "Le tableau blanc de la salle 3 ne doit plus jamais être effacé.",
  "Les post-its jaunes doivent être réservés aux sujets urgents.",
  "Chaque agrafeuse doit être rattachée administrativement à un service.",
  "Les stylos à quatre couleurs constituent un avantage en nature.",
  "Les plantes artificielles doivent être arrosées pour ne pas heurter les vraies.",
  "Le paillasson d'entrée doit comporter un message de bienvenue actualisé chaque trimestre.",
  "Les fenêtres doivent être numérotées.",
  "Un registre des ampoules grillées doit être institué.",
  "Le distributeur de savon du 1er doit être déplacé de vingt centimètres vers la gauche.",
  "Les prises USB murales doivent être partagées équitablement entre les services.",
  "Chaque étage doit disposer d'une réserve stratégique d'élastiques.",

  // ---------- Cuisine, frigo, café, cantine --------------------------------
  "Le contenu du frigo du 3e doit être détruit sans préavis le vendredi à 18 h.",
  "La machine à café doit être remplacée par une machine identique mais neuve.",
  "Le café doit être facturé au centime près selon la taille du gobelet.",
  "Les tasses laissées dans l'évier doivent être confisquées pendant un mois.",
  "Le micro-ondes du 2e doit être interdit aux poissons.",
  "Un délai de décence de trente minutes doit séparer deux réchauffages de choucroute.",
  "Les repas à odeur forte doivent être déclarés la veille.",
  "Le sucre en morceaux doit remplacer définitivement le sucre en poudre.",
  "Les capsules de café doivent être comptabilisées par service.",
  "La bouilloire doit être détartrée par roulement alphabétique.",
  "Les yaourts sans nom doivent être considérés comme des biens communs.",
  "Le lait végétal doit bénéficier d'une étagère dédiée.",
  "Il doit être interdit de faire du pop-corn au micro-ondes après 15 h.",
  "La fontaine à eau doit proposer une option tiède.",
  "Les gâteaux d'anniversaire doivent être découpés par un tiers neutre.",
  "Le grille-pain de la cuisine doit être doté d'un mode d'emploi affiché.",
  "Les couverts en métal doivent être remplacés par des couverts consignés.",
  "Le nombre de biscuits par personne et par pause doit être plafonné à trois.",
  "L'eau gazeuse doit être considérée comme une boisson de fin de semaine.",
  "Les restes de plateau-repas doivent être signalés sur le canal général.",
  "La cafetière individuelle sur le bureau constitue une concurrence déloyale.",
  "Le thé doit disposer d'une théière commune plutôt que de sachets individuels.",
  "Les emballages de sandwich doivent être pliés avant dépôt.",
  "Un référent vaisselle doit être élu pour un mandat de six mois renouvelable.",
  "La cantine doit publier ses menus avec quinze jours d'avance.",

  // ---------- Température, lumière, open space -----------------------------
  "La température des bureaux doit être fixée à 21,5 °C, sans exception.",
  "Les ventilateurs personnels doivent être orientés vers le haut.",
  "L'ouverture d'une fenêtre doit recueillir l'accord des quatre bureaux voisins.",
  "Les stores doivent être remontés à heure fixe.",
  "L'éclairage doit être réduit de 20 % l'après-midi pour favoriser la concentration.",
  "Le port d'un plaid au bureau doit faire l'objet d'une autorisation nominative.",
  "Les lampes de bureau personnelles doivent être de la même couleur.",
  "Le chauffage doit être coupé les jours où il fait plus de 12 °C dehors.",
  "Un thermomètre de référence unique doit être installé, et lui seul fait foi.",
  "Les casques antibruit doivent être fournis à tous, y compris à ceux qui ne se plaignent pas.",
  "Les conversations en open space doivent se tenir en dessous de 55 décibels.",
  "Un espace silence absolu doit être créé, et personne ne doit y aller.",
  "Les claviers mécaniques doivent être interdits en zone ouverte.",
  "Les appels téléphoniques debout doivent être proscrits.",
  "Chaque service doit disposer d'un référent courant d'air.",
  "Les diffuseurs de parfum d'ambiance doivent faire l'objet d'un vote annuel.",
  "L'humidité relative doit être affichée en temps réel dans le hall.",
  "Les stores du côté sud doivent être motorisés en priorité sur ceux du nord.",

  // ---------- Sécurité, badges, accès --------------------------------------
  "Le badge d'entrée doit émettre un son plus sympathique.",
  "Les badges oubliés doivent donner lieu à une amende symbolique de un euro.",
  "La photo du badge doit être renouvelée tous les deux ans.",
  "Les visiteurs doivent porter un badge d'une couleur différente selon l'étage visité.",
  "L'exercice d'évacuation doit être annoncé pour éviter la panique.",
  "L'exercice d'évacuation ne doit surtout pas être annoncé.",
  "Le point de rassemblement doit être déplacé à l'ombre.",
  "Les codes d'accès doivent changer chaque premier lundi du mois.",
  "Le sas d'entrée doit accepter deux personnes simultanément.",
  "Un registre des retards de badge doit être tenu et affiché.",
  "Les caméras du parking doivent être remplacées par des panneaux annonçant des caméras.",
  "Le port du badge doit être obligatoire jusque dans les toilettes.",
  "Les serrures à code doivent être remplacées par des serrures à clé.",
  "Un référent incendie doit être désigné par étage, avec suppléant.",
  "Le gilet jaune du référent évacuation doit être ajusté à sa taille.",

  // ---------- RH, process, réunions ----------------------------------------
  "Le vendredi doit devenir un jour facultatif.",
  "Les réunions doivent commencer à heure impaire pour éviter les collisions d'agenda.",
  "Toute réunion de plus de quatre personnes doit produire un compte rendu.",
  "Toute réunion de moins de quatre personnes ne doit produire aucun compte rendu.",
  "Les réunions debout doivent devenir obligatoires.",
  "Les réunions doivent être limitées à vingt-cinq minutes pour permettre les déplacements.",
  "Le tour de table d'introduction doit être supprimé.",
  "Chaque réunion doit désigner un gardien du temps investi de l'autorité nécessaire.",
  "Les invitations sans ordre du jour doivent être refusées automatiquement.",
  "Le tutoiement des prestataires doit être généralisé.",
  "Le vouvoiement doit être rétabli dans les échanges écrits.",
  "L'entretien annuel doit se tenir en marchant.",
  "Les objectifs individuels doivent être formulés en moins de dix mots.",
  "La période d'essai doit inclure une semaine dans chaque service.",
  "Les congés doivent être posés par tranches indivisibles de trois jours.",
  "Le télétravail doit être limité aux jours de pluie.",
  "Le télétravail doit être interdit les jours de pluie, pour préserver le lien social.",
  "Une politique de télétravail doit être instaurée pour les animaux de compagnie.",
  "Les horaires flexibles doivent s'arrêter à 9 h 30.",
  "Le pointage doit être remplacé par la confiance, puis rétabli six mois plus tard.",
  "Les arrêts maladie de un jour doivent faire l'objet d'un appel bienveillant.",
  "Le bilan du dernier séminaire doit être officiellement assumé par quelqu'un.",
  "Les organigrammes doivent être affichés à l'envers pour souligner l'horizontalité.",
  "Chaque salarié doit se voir attribuer un binôme de secours.",
  "Les périodes d'astreinte doivent être compensées en jours de repos plutôt qu'en prime.",
  "Le nombre de niveaux hiérarchiques doit être ramené à quatre.",
  "Un référent bien-être doit être institué, distinct du référent qualité de vie au travail.",
  "Les questionnaires de satisfaction interne doivent être anonymes mais nominatifs.",
  "La pause déjeuner doit être portée à une heure et quart.",
  "La pause déjeuner doit être ramenée à quarante-cinq minutes, mais mieux organisée.",

  // ---------- Séminaires, team building, pots ------------------------------
  "Le séminaire annuel doit se tenir dans les locaux, pour des raisons de sobriété.",
  "Les activités de cohésion doivent être facultatives mais fortement recommandées.",
  "L'escape game doit être remplacé par un atelier poterie.",
  "Le karaoké de fin de séminaire doit faire l'objet d'un ordre de passage tiré au sort.",
  "Les photos de séminaire doivent être validées par les intéressés avant diffusion.",
  "Le pot de départ doit être financé par celui qui part.",
  "Le pot de départ doit être financé par ceux qui restent.",
  "Les discours de départ doivent être limités à quatre-vingt-dix secondes.",
  "Le petit-déjeuner d'équipe doit se tenir avant 8 h 30 pour ne pas empiéter sur la production.",
  "Les after-work doivent être organisés un mardi.",
  "Le repas de fin d'année doit comporter une option debout.",
  "Les cadeaux de fin d'année doivent être identiques pour tous, y compris pour la direction.",
  "Le tirage au sort du Secret Santa doit être supervisé par un tiers.",
  "Les jeux de société au bureau doivent être limités aux pauses officielles.",
  "Le baby-foot doit être retiré : il crée des inégalités de compétence.",
  "Le baby-foot doit être conservé mais déplacé au sous-sol.",
  "Un tournoi interservices doit être organisé chaque trimestre, avec classement affiché.",
  "Les anniversaires doivent être fêtés une fois par mois, groupés.",

  // ---------- Informatique et outils ---------------------------------------
  "Les mots de passe doivent être changés tous les quarante-cinq jours.",
  "Les mots de passe ne doivent plus jamais être changés.",
  "Le fond d'écran doit être imposé et identique pour tous.",
  "Les emojis doivent être proscrits dans les échanges internes.",
  "Les emojis doivent être obligatoires pour désamorcer les tensions écrites.",
  "L'accusé de lecture doit être activé par défaut.",
  "Les réponses à tous doivent nécessiter une confirmation supplémentaire.",
  "Les courriels envoyés après 19 h doivent être différés au lendemain matin.",
  "Les signatures de courriel doivent tenir en trois lignes maximum.",
  "Le tri des courriels doit faire l'objet d'une formation obligatoire.",
  "Les visioconférences doivent se tenir caméra allumée, sans exception.",
  "Les fonds d'écran virtuels en visioconférence doivent être interdits.",
  "Chaque poste doit être redémarré tous les vendredis à 17 h.",
  "Les imprimantes doivent imprimer en recto-verso par défaut et sans dérogation.",
  "L'impression couleur doit nécessiter l'accord d'un responsable.",
  "Les fichiers partagés doivent suivre une convention de nommage unique.",
  "Les dossiers nommés « divers » doivent être supprimés sans avertissement.",
  "Les captures d'écran doivent être proscrites au profit des liens.",
  "Le nombre d'onglets ouverts simultanément doit être plafonné.",
  "Un référent tableur doit être désigné par service.",

  // ---------- Communication interne, vocabulaire ---------------------------
  "Le mot « synergie » doit être retiré du vocabulaire interne.",
  "Le mot « impact » doit être remplacé par « effet ».",
  "Les acronymes internes doivent être accompagnés de leur signification à chaque emploi.",
  "Un glossaire interne doit être publié et mis à jour mensuellement.",
  "Les notes de service doivent tenir sur une page.",
  "Les notes de service doivent être lues à voix haute en réunion d'équipe.",
  "Le journal interne doit reparaître, après onze ans d'interruption.",
  "Les affichages muraux doivent être datés et retirés au bout d'un mois.",
  "La newsletter interne doit passer d'hebdomadaire à quotidienne.",
  "Les messages sur le canal général doivent être réservés aux annonces officielles.",
  "L'usage des majuscules doit être encadré.",
  "Les points de suspension doivent être proscrits dans les communications officielles.",
  "Le nom de la salle de réunion doit être choisi par vote à bulletin secret.",
  "Les salles de réunion doivent porter des noms de rivières plutôt que de fruits.",
  "Le sigle de la société doit être prononcé et non épelé.",
  "Les signatures manuscrites doivent être rétablies sur les documents internes.",
  "Le vocabulaire anglais doit faire l'objet d'une traduction officielle interne.",
  "Toute idée doit être présentée par écrit avant d'être présentée à l'oral.",
  "Les comptes rendus doivent mentionner les silences.",
  "La boîte à idées doit être relevée en présence de deux témoins.",

  // ---------- Écologie, RSE, tri -------------------------------------------
  "Le tri sélectif doit comporter une cinquième poubelle.",
  "Les gobelets jetables doivent être supprimés sans période de transition.",
  "Chaque salarié doit se voir remettre une gourde nominative.",
  "L'impression doit être plafonnée à cent pages par personne et par mois.",
  "Les déplacements de moins de trois cents kilomètres doivent se faire en train.",
  "Le bilan carbone interne doit être affiché dans le hall, actualisé chaque semaine.",
  "Les mails doivent être supprimés au bout de deux ans pour réduire le stockage.",
  "Un composteur doit être installé sur la terrasse.",
  "Les lumières doivent s'éteindre automatiquement à 20 h, y compris en réunion.",
  "Le papier recyclé doit être imposé malgré son grammage inférieur.",
  "La climatisation doit être coupée en dessous de 28 °C.",
  "Un référent sobriété doit être désigné et doté d'un pouvoir de contrôle.",
  "Les emballages individuels doivent disparaître de la machine à friandises.",
  "Les vélos doivent pouvoir être garés à l'intérieur, dans le hall.",
  "La prime mobilité durable doit être étendue à la marche à pied.",

  // ---------- Toilettes, ascenseur, parking --------------------------------
  "La signalétique des toilettes doit être entièrement repensée.",
  "Les toilettes doivent être mixtes à tous les étages.",
  "Le sèche-mains à air doit être remplacé par des essuie-mains papier.",
  "Les essuie-mains papier doivent être remplacés par un sèche-mains à air.",
  "Un registre de passage des agents d'entretien doit être affiché dans chaque cabine.",
  "La musique d'ambiance des toilettes doit être supprimée.",
  "Une musique d'ambiance doit être installée dans les toilettes.",
  "L'ascenseur doit être interdit pour un déplacement de moins de deux étages.",
  "Un thème musical doit être instauré dans l'ascenseur.",
  "L'ascenseur doit annoncer les étages à voix haute.",
  "Les miroirs de l'ascenseur doivent être retirés pour réduire l'encombrement visuel.",
  "Les places de parking doivent être attribuées par ancienneté.",
  "Les places de parking doivent être tirées au sort chaque trimestre.",
  "Les véhicules mal garés doivent être signalés par affichage nominatif.",
  "Le local à vélos doit être doté d'une pompe commune.",
  "Le passage piéton du parking doit être repeint dans une couleur plus visible.",
  "La barrière du parking doit rester levée entre 12 h et 14 h.",
  "Un référent stationnement doit être désigné parmi les non-motorisés.",

  // ---------- Animaux, plantes, décoration ---------------------------------
  "Les plantes vertes doivent être réparties équitablement entre les services.",
  "Chaque plante verte doit être parrainée nommément.",
  "Les cactus doivent être écartés pour des raisons de sécurité.",
  "Les animaux de compagnie doivent être admis le mercredi.",
  "Les poissons rouges du hall doivent être nommés par vote.",
  "L'aquarium du hall doit être remplacé par un mur végétal.",
  "Les tableaux du couloir doivent être tournés d'un quart chaque mois.",
  "Les photos personnelles sur les bureaux doivent être limitées à trois cadres.",
  "Les décorations de fin d'année doivent être installées au 1er décembre, pas avant.",
  "Les guirlandes lumineuses doivent être éteintes en dehors des heures ouvrées.",
  "La couleur des murs du couloir doit être soumise à consultation.",
  "Le sapin doit être artificiel, réutilisable et entreposé dans les combles.",

  // ---------- Kafka --------------------------------------------------------
  "Le règlement intérieur doit comporter un article sur la lecture du règlement intérieur.",
  "Une commission doit être créée pour évaluer l'utilité des commissions existantes.",
  "Les décisions prises en réunion doivent être confirmées lors d'une réunion ultérieure.",
  "Le compte rendu de la présente séance doit être approuvé avant la fin de la présente séance.",
  "Un formulaire doit être créé pour demander la suppression d'un formulaire.",
  "Les demandes urgentes doivent être déposées cinq jours ouvrés à l'avance.",
  "Les procédures doivent être simplifiées, selon une procédure à définir.",
  "Le nombre de référents doit être plafonné par un référent référents.",
  "Toute exception doit être documentée, y compris les exceptions à cette règle.",
  "Le point divers doit figurer en début d'ordre du jour.",
  "Les décisions unanimes doivent être réexaminées, l'unanimité étant suspecte.",
  "Le vote à main levée doit être remplacé par un vote à bulletin secret à main levée.",
  "Les archives doivent être numérisées puis imprimées pour conservation.",
  "Un audit doit être commandé sur le coût des audits.",
  "La présente motion doit être adoptée sans être débattue."
];


// ============================================================================
//  Les classiques
//
//  Différence de nature avec les motions administratives : sur celles-ci, tout le
//  monde a déjà un avis. Se voir imposer le camp adverse devient donc un vrai
//  exercice, et l'énergie de la conversation monte d'un cran.
//
//  Elles restent formulées comme des motions : c'est le décalage entre la
//  solennité de la forme et la futilité du fond qui fait rire, pas le sujet seul.
//
//  Contrepartie à surveiller : la salle a un avis, elle aussi. Le vote peut
//  glisser de « qui n'a pas défendu sa position » vers « qui avait tort ». Si ça
//  se produit en playtest, il faudra rappeler la consigne, ou plafonner la part
//  de classiques dans une manche.
// ============================================================================

export const MOTIONS_CLASSIQUES = [

  // ---------- Table et cuisine ---------------------------------------------
  "Le lait doit être versé avant les céréales.",
  "L'ananas a sa place sur une pizza.",
  "Il faut dire chocolatine.",
  "Le beurre doit être salé.",
  "Les pâtes se mangent avec du ketchup.",
  "On peut mettre des glaçons dans le vin blanc.",
  "Le café doit se boire sans sucre.",
  "La raclette est un plat d'été.",
  "Les frites se mangent à la fourchette.",
  "Le pain doit être coupé, jamais rompu.",
  "La cuisson à point est la seule acceptable.",
  "Le sucre dans les tomates est une hérésie.",
  "La bûche de Noël doit être glacée.",
  "On peut manger de la pizza froide au petit-déjeuner.",
  "Le fromage se mange avant le dessert, sans exception.",
  "L'eau plate est supérieure à l'eau gazeuse.",
  "Le ketchup se conserve au réfrigérateur.",
  "Un croissant se trempe dans le café.",
  "La mayonnaise industrielle vaut la maison.",
  "Les œufs se conservent hors du réfrigérateur.",

  // ---------- Saisons, climat, géographie ----------------------------------
  "L'été est supérieur à l'hiver.",
  "La montagne vaut mieux que la mer.",
  "Il faut dormir la fenêtre ouverte, même en hiver.",
  "La pluie est un temps agréable.",
  "Le changement d'heure doit être maintenu.",
  "Le Sud est surestimé.",
  "Une semaine de vacances vaut mieux que trois week-ends prolongés.",
  "Le camping est une forme de vacances.",

  // ---------- Maison et habitudes ------------------------------------------
  "Le papier toilette se déroule par-dessus.",
  "On retire ses chaussures en entrant chez quelqu'un.",
  "Les serviettes doivent être roulées, pas pliées.",
  "Le dentifrice se presse par le milieu.",
  "Le lit doit être fait tous les matins.",
  "La douche se prend le soir.",
  "Les chaussettes se portent avec des sandales quand il fait chaud.",
  "La vaisselle se fait immédiatement après le repas.",
  "Le réveil doit sonner une seule fois.",
  "On peut porter le même pull deux jours de suite.",
  "Les plantes d'intérieur méritent un prénom.",
  "Le linge doit être repassé, y compris les draps.",

  // ---------- Société et savoir-vivre --------------------------------------
  "La bise doit être définitivement abandonnée.",
  "Il faut applaudir à l'atterrissage de l'avion.",
  "On doit répondre à un message vocal par un message vocal.",
  "Il est acceptable d'appeler quelqu'un sans prévenir.",
  "Le tutoiement doit être la règle par défaut.",
  "Il faut laisser sa place dans le métro, même sans y être obligé.",
  "On peut arriver un quart d'heure en retard à un dîner.",
  "Le pourboire doit devenir obligatoire.",
  "Siffler dans un lieu public doit être toléré.",
  "Il faut rendre un Tupperware rempli.",
  "Offrir de l'argent est un cadeau valable.",
  "On doit prévenir avant de passer chez quelqu'un.",

  // ---------- Écrans et numérique ------------------------------------------
  "Le mode sombre est objectivement supérieur.",
  "Les notifications doivent être toutes désactivées.",
  "Il faut lire les conditions générales.",
  "Le téléphone n'a pas sa place à table.",
  "Les vidéos doivent se regarder en vitesse normale.",
  "Le son du clavier tactile doit rester activé.",
  "Il faut fermer les onglets qu'on n'utilise plus.",
  "Le téléphone doit rester en mode sonnerie, jamais vibreur.",
  "Les photos doivent être triées, pas accumulées.",
  "L'ordinateur doit être éteint chaque soir, pas mis en veille.",

  // ---------- Culture et divertissement ------------------------------------
  "Les films doivent être vus en version originale.",
  "Le générique de début d'une série doit être regardé en entier.",
  "Révéler la fin d'un film sorti il y a plus de dix ans n'est pas un spoiler.",
  "Un livre commencé doit être terminé.",
  "Le cinéma se regarde sans nourriture.",
  "Les rediffusions valent mieux que la nouveauté.",
  "Il faut rester jusqu'à la fin du générique de fin.",
  "La musique doit s'écouter album par album, pas en aléatoire.",

  // ---------- Transports et déplacements -----------------------------------
  "En avion, le hublot vaut mieux que le couloir.",
  "Le bagage cabine suffit pour une semaine.",
  "Il faut arriver deux heures avant à l'aéroport.",
  "On doit céder son accoudoir au voisin du milieu.",
  "La voiture doit être lavée au moins une fois par mois.",
  "Le vélo a la priorité morale sur la voiture en ville.",

  // ---------- Animaux -------------------------------------------------------
  "Le chat est supérieur au chien.",
  "Les animaux ont le droit de monter sur le canapé.",
  "Parler à son animal est un comportement normal.",
  "Un poisson rouge est un animal de compagnie à part entière.",

  // ---------- Grandes questions inutiles -----------------------------------
  "Un hot-dog est un sandwich.",
  "L'eau ne mouille pas, elle rend mouillé.",
  "Le zéro est un nombre pair.",
  "Une paille a deux trous.",
  "La semaine commence le dimanche.",
  "Un carré est un rectangle, et il faut l'assumer.",
  "Le chiffre 7 est le plus sympathique.",
  "Marcher est plus rapide que courir sur une distance suffisante."
];

// L'ensemble servi au jeu. Le mélange des deux registres est ce qui empêche la
// lassitude de ton : trois motions administratives d'affilée finissent par se
// ressembler, même si les sujets diffèrent.
export const MOTIONS_TOUTES = [...MOTIONS_ADMIN, ...MOTIONS_CLASSIQUES];

// Assignation des camps pour le débat contradictoire : chaque motion étant une
// proposition, les deux positions sont toujours les mêmes. Inutile de les écrire
// une par une.
export const MOTIONS = MOTIONS_TOUTES;

export const CAMPS = {
  pour: "Vous défendez l'adoption de la motion.",
  contre: "Vous vous opposez à la motion."
};

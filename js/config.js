// Configuration du générateur de visuels « preview de match ».
// Modifiez ce fichier pour ajouter vos sites et vos templates, puis rechargez la page.
window.APP_CONFIG = {
  // Format de l'image exportée (16:9)
  width: 1200,
  height: 675,

  // Sports proposés en haut de l'écran.
  //   label, sides : texte unique, ou un texte par langue { fr, en, 'pt-BR' }
  //   template : fond utilisé si le site choisi n'a pas de template propre (optionnel)
  //   teamLogo : remplace le réglage teamLogo plus bas pour ce sport (optionnel)
  sports: [
    {
      id: 'nba',
      label: 'NBA',
      sides: { fr: ['Équipe A', 'Équipe B'], en: ['Team A', 'Team B'], 'pt-BR': ['Time A', 'Time B'] },
      // Logos centrés dans l'espace libre entre les bandes et le VS des templates NBA
      teamLogo: { box: 300, positions: [[350, 338], [850, 338]] },
    },
    {
      id: 'football',
      label: { fr: 'Football', en: 'Football', 'pt-BR': 'Futebol' },
      sides: { fr: ['Club A', 'Club B'], en: ['Club A', 'Club B'], 'pt-BR': ['Clube A', 'Clube B'] },
    },
  ],

  // Sites proposés dans le menu « Site ». Chaque site a son template et son logo (en haut à droite).
  //   id       : identifiant unique
  //   name     : nom affiché dans le menu
  //   sports   : sports concernés, ex. ['nba']
  //   template : image de fond (16:9) dans assets/templates/
  //   logo     : PNG ou SVG à fond transparent dans assets/sites/
  //              (si le fichier manque, le nom du site est affiché à la place)
  //   height   : hauteur du logo en px sur l'image finale (optionnel)
  //   teamLogo : positions/taille des logos d'équipes propres à ce template (optionnel)
  sites: [
    {
      id: 'basketusa',
      name: 'Basketusa.com',
      sports: ['nba'],
      template: 'assets/templates/nba.png',
      logo: 'assets/sites/basketusa-transparent.png',
    },
    {
      id: 'lakersbrasil',
      name: 'LakersBrasil.com',
      sports: ['nba'],
      template: 'assets/templates/lakers.png',
      logo: 'assets/sites/lakersbrasil.jpg',
      height: 84, // logo carré : plus haut pour rester lisible
    },
  ],

  // Pages « photo joueur » : une mise en page par page (attribut data-layout de <body>).
  //   template   : fond commun à tous les sites (le site choisi ne donne que le logo en haut à droite)
  //   players    : nombre de joueurs placés librement (boutons gauche / centre / droite)
  //   slots      : cases fixes ; chaque joueur est posé sur le sol de sa case (px de l'image finale) :
  //                x = centre, floor = hauteur du sol, maxW / maxH = taille maximale à 100 %,
  //                side = libellé de position, clip = contour de la case [[x, y], …]
  //                name = zone du nom sous la case { x: centre, y: milieu, w: largeur maximale }
  //   title      : titre facultatif (centre du texte, taille et couleur par défaut, largeur maximale)
  //   siteLogo   : 'optional' → menu des sites (tous sports) avec « Aucun logo »
  //   filePrefix : début du nom de fichier exporté
  playerLayouts: {
    player: { template: 'assets/templates/base.png', players: 1 },
    player2: { template: 'assets/templates/base.png', players: 2 },
    // Trois panneaux inclinés : sol lumineux à y = 596, séparateurs mesurés sur le template
    ballondor: {
      template: 'assets/templates/ballondor-top3.png',
      siteLogo: 'optional',
      filePrefix: 'ballon-dor',
      // Titre en haut, entre le trophée et les projecteurs
      title: { x: 600, y: 92, size: 56, color: '#ffffff', maxW: 720 },
      // Noms : dans la bande noire sous chaque case (y 596 → 657), centrés sur le trait de sol de la case
      slots: [
        { x: 218, floor: 596, maxW: 290, maxH: 400, side: 'left', clip: [[197, 0], [538, 0], [368, 596], [27, 596]],
          name: { x: 183, y: 629, w: 290 } },
        { x: 580, floor: 596, maxW: 290, maxH: 400, side: 'center', clip: [[542, 0], [890, 0], [729, 596], [372, 596]],
          name: { x: 554, y: 629, w: 285 } },
        { x: 962, floor: 596, maxW: 310, maxH: 400, side: 'right', clip: [[894, 0], [1279, 0], [1118, 596], [733, 596]],
          name: { x: 944, y: 629, w: 328 } },
      ],
    },
  },

  // Logo du site : marge par rapport aux bords haut et droit, hauteur par défaut
  siteLogo: { margin: 32, defaultHeight: 56 },

  // Logos des équipes (réglage par défaut) : chaque logo tient dans un carré de « box » px
  // (à 100 %), centré sur les positions [x, y] ci-dessous (gauche, droite).
  teamLogo: { box: 340, positions: [[300, 338], [900, 338]] },
};

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
  //   logoOnDark : variante claire du logo, utilisée sur les fonds sombres (optionnel)
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
    // Sites football (logos tirés des kits de marque NSN ; logoOnDark : version blanche pour les fonds sombres)
    {
      id: 'topmercato', name: 'Topmercato', sports: ['football'],
      logo: 'assets/sites/topmercato.png', logoOnDark: 'assets/sites/tm-logo-white.png',
    },
    { id: 'afrik-foot', name: 'Afrik-Foot', sports: ['football'], logo: 'assets/sites/afrik-foot.png', height: 72 },
    {
      id: 'sportsmole', name: 'Sportsmole', sports: ['football'],
      logo: 'assets/sites/sportsmole.png', logoOnDark: 'assets/sites/sm-logo-white.png',
    },
    {
      id: 'footballwhispers', name: 'FootballWhispers', sports: ['football'], height: 72,
      logo: 'assets/sites/football-whispers.png', logoOnDark: 'assets/sites/fw-white.png',
    },
    {
      id: 'trivela', name: 'Trivela', sports: ['football'],
      logo: 'assets/sites/trivela.png', logoOnDark: 'assets/sites/trivela-t-white.png',
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
  //   siteLogo   : 'optional' → menu des sites avec « Aucun logo »
  //   sport      : sport des sites proposés (par défaut 'nba')
  //   dark       : fond sombre → logos en version claire (logoOnDark) quand elle existe
  //   filePrefix : début du nom de fichier exporté
  playerLayouts: {
    player: { template: 'assets/templates/base.png', players: 1 },
    player2: { template: 'assets/templates/base.png', players: 2 },
    // Trois panneaux inclinés : sol lumineux à y = 596, séparateurs mesurés sur le template
    ballondor: {
      template: 'assets/templates/ballondor-top3.png',
      siteLogo: 'optional',
      sport: 'football',
      dark: true,
      filePrefix: 'ballon-dor',
      // Titre en haut, entre le trophée et les projecteurs
      title: { x: 600, y: 92, size: 56, color: '#ffffff', maxW: 720 },
      // Logo du site : même zone discrète que le Top 10 (120 × 40 px en haut à droite)
      logo: { x: 1056, y: 24, w: 120, h: 40 },
      // Noms : dans la bande noire sous chaque case (y 596 → 657), centrés sur le trait de sol de la case
      slots: [
        { x: 218, floor: 596, maxW: 290, maxH: 400, side: 'left', clip: [[197, 0], [538, 0], [368, 596], [27, 596]],
          name: { x: 183, y: 629, w: 290 } },
        { x: 580, floor: 596, maxW: 290, maxH: 400, side: 'center', clip: [[542, 0], [890, 0], [729, 596], [372, 596]],
          name: { x: 554, y: 629, w: 285 } },
        { x: 962, floor: 596, maxW: 310, maxH: 400, side: 'right', clip: [[894, 0], [1279, 0], [1118, 596], [733, 596]],
          name: { x: 944, y: 629, w: 328 } },
      ],
      // Formats proposés en plus du 16:9 à certains sites (choix « Format » sous le menu Site) : chacun
      // remplace la taille, le template, le titre, la zone du logo et les cases (px de son image)
      formats: [
        {
          id: '3x2', label: '3:2', width: 1200, height: 800, sites: ['topmercato'],
          template: 'assets/templates/ballondor-top3TM.png',
          title: { x: 600, y: 100, size: 60, color: '#ffffff', maxW: 760 },
          logo: { x: 1056, y: 24, w: 120, h: 40 },
          // Cases séparées par des traits verticaux (x 410 et 789), sol à y 676, noms dans la bande noire (676 → 767)
          slots: [
            { x: 203, floor: 676, maxW: 330, maxH: 460, side: 'left', clip: [[0, 0], [408, 0], [408, 676], [0, 676]],
              name: { x: 202, y: 721, w: 360 } },
            { x: 592, floor: 676, maxW: 320, maxH: 460, side: 'center', clip: [[412, 0], [787, 0], [787, 676], [412, 676]],
              name: { x: 598, y: 721, w: 330 } },
            { x: 978, floor: 676, maxW: 330, maxH: 460, side: 'right', clip: [[791, 0], [1200, 0], [1200, 676], [791, 676]],
              name: { x: 986, y: 721, w: 330 } },
          ],
        },
      ],
    },
  },

  // Visuel « Ballon d'Or — Top 10 » (ballondor-top10.html), en px de l'image finale :
  //   rows  : centre vertical de chaque ligne du classement (sous chacun des 10 filets dorés du template)
  //   rank  : colonne du classement, chiffres dorés (centre x, taille)
  //   thumb : vignette ronde (centre x, rayon)
  //   name  : début du nom (x) et largeur maximale avant la colonne des clubs
  //   club  : colonne des logos de club (centre x, côté du carré)
  //   logo  : zone du logo du site, le logo y est calé en haut à droite
  ballondorTop10: {
    template: 'assets/templates/ballondor-top10.png',
    siteLogo: 'optional',
    sport: 'football',
    dark: true,
    filePrefix: 'ballon-dor-top10',
    rows: [112, 166, 219, 272, 325, 379, 432, 486, 539, 593],
    rank: { x: 412, size: 32 },
    thumb: { x: 466, r: 21 },
    name: { x: 501, maxW: 440, size: 26 },
    club: { x: 992, size: 34 },
    logo: { x: 1056, y: 24, w: 120, h: 40 },
  },

  // Ambiances de lumière des pages joueur, appliquées à chaque joueur détouré (dosées par « Intensité ») :
  //   luma       : luminosité moyenne visée, la même pour tous les joueurs (absente = photo inchangée) ;
  //                un joueur sombre est bien éclairci, un joueur clair (maillot blanc) peu assombri
  //   exposure   : plus clair (+) ou plus sombre (−), par une courbe gamma qui garde le noir et le blanc
  //   contrast   : contraste en S (1 = inchangé) ; saturation : intensité des couleurs (1 = inchangée)
  //   warmth     : température (+ plus chaud, − plus froid)
  //   grade      : teinte les hautes lumières avec la couleur de la lumière du décor (template)
  //   rim        : liseré de lumière sur le contour : force, largeur (px de l'image finale),
  //                couleur ('ambient' = couleur de la lumière du décor)
  //   ground     : assombrit le bas du joueur pour l'ancrer dans le décor
  lightLooks: [
    { id: 'none' },
    { id: 'natural', luma: 0.42 },
    { id: 'bright', luma: 0.42, exposure: 0.45, contrast: 1.05, saturation: 1.06 },
    { id: 'dark', luma: 0.42, exposure: -0.5, contrast: 1.18, saturation: 0.92 },
    { id: 'studio', luma: 0.44, exposure: 0.1, contrast: 1.14, saturation: 1.03, warmth: -0.02, rim: { strength: 0.35, width: 5, color: '#ffffff' } },
    { id: 'cinematic', luma: 0.42, exposure: -0.25, contrast: 1.3, saturation: 0.9, grade: 0.22, rim: { strength: 0.5, width: 7, color: 'ambient' }, ground: 0.35 },
    { id: 'decor', luma: 0.42, contrast: 1.1, saturation: 0.95, warmth: 0.04, grade: 0.3, rim: { strength: 0.7, width: 9, color: 'ambient' } },
  ],

  // Visuel « Ballon d'Or — Top 10 » vertical 9:16 (ballondor-top10-vertical.html) : mêmes réglages que
  // ballondorTop10, en px de l'image finale (1080 × 1920). Classement et site partagés avec le 16:9 ;
  // style des noms enregistré à part (namesKey), la taille n'étant pas la même.
  ballondorTop10Vertical: {
    template: 'assets/templates/ballondor-top10-vertical.png',
    width: 1080,
    height: 1920,
    siteLogo: 'optional',
    sport: 'football',
    dark: true,
    filePrefix: 'ballon-dor-top10-vertical',
    namesKey: 'top10v',
    rows: [568, 646, 724, 801, 879, 956, 1034, 1110, 1188, 1266],
    rank: { x: 202, size: 46 },
    thumb: { x: 278, r: 30 },
    name: { x: 326, maxW: 500, size: 38 },
    club: { x: 872, size: 50 },
    logo: { x: 870, y: 48, w: 160, h: 54 },
  },

  // Polices du titre et des noms (pages Ballon d'Or), chargées depuis Google Fonts dans ces pages.
  //   id : valeur enregistrée ; family / weight : police dessinée sur l'image ; fallback : police de secours
  fonts: [
    { id: 'inter', name: 'Inter', family: 'Inter', weight: 800, fallback: 'system-ui, sans-serif' },
    { id: 'montserrat', name: 'Montserrat', family: 'Montserrat', weight: 800, fallback: 'sans-serif' },
    { id: 'poppins', name: 'Poppins', family: 'Poppins', weight: 700, fallback: 'sans-serif' },
    { id: 'oswald', name: 'Oswald', family: 'Oswald', weight: 600, fallback: 'Impact, sans-serif' },
    { id: 'barlow', name: 'Barlow Condensed', family: 'Barlow Condensed', weight: 700, fallback: 'sans-serif' },
    { id: 'bebas', name: 'Bebas Neue', family: 'Bebas Neue', weight: 400, fallback: 'Impact, sans-serif' },
    { id: 'anton', name: 'Anton', family: 'Anton', weight: 400, fallback: 'Impact, sans-serif' },
    { id: 'teko', name: 'Teko', family: 'Teko', weight: 600, fallback: 'sans-serif' },
    { id: 'playfair', name: 'Playfair Display', family: 'Playfair Display', weight: 800, fallback: 'Georgia, serif' },
    { id: 'cinzel', name: 'Cinzel', family: 'Cinzel', weight: 700, fallback: 'Georgia, serif' },
  ],

  // Logo du site : marge par rapport aux bords haut et droit, hauteur par défaut
  siteLogo: { margin: 32, defaultHeight: 56 },

  // Logos des équipes (réglage par défaut) : chaque logo tient dans un carré de « box » px
  // (à 100 %), centré sur les positions [x, y] ci-dessous (gauche, droite).
  teamLogo: { box: 340, positions: [[300, 338], [900, 338]] },
};

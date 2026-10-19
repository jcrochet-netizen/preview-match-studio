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

  // Logo du site : marge par rapport aux bords haut et droit, hauteur par défaut
  siteLogo: { margin: 32, defaultHeight: 56 },

  // Logos des équipes (réglage par défaut) : chaque logo tient dans un carré de « box » px
  // (à 100 %), centré sur les positions [x, y] ci-dessous (gauche, droite).
  teamLogo: { box: 340, positions: [[300, 338], [900, 338]] },
};

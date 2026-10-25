// Candidats du visuel « Ballon d'Or — Top 10 » (ballondor-top10.html) : nom affiché, vignette et club.
// Les vignettes et les logos (150 × 150 px, fond transparent) sont chargés directement depuis le CDN
// Sportmonks, qui autorise leur usage dans l'outil (CORS) ; ils ne sont pas stockés dans le dépôt.
// Pour ajouter un joueur : { id: <id Sportmonks>, name: 'Prénom Nom', img: '<image_path Sportmonks>', club: '<clé>' }.
// Le menu les trie par ordre alphabétique.

// Clubs (logo Sportmonks : images/soccer/teams/<id % 32>/<id>.png), à jour des transferts de l'été 2026
window.BALLONDOR_CLUBS = {
  psg: { name: 'Paris Saint-Germain', logo: 'https://cdn.sportmonks.com/images/soccer/teams/15/591.png' },
  realmadrid: { name: 'Real Madrid', logo: 'https://cdn.sportmonks.com/images/soccer/teams/12/3468.png' },
  barcelona: { name: 'FC Barcelona', logo: 'https://cdn.sportmonks.com/images/soccer/teams/19/83.png' },
  bayern: { name: 'Bayern Munich', logo: 'https://cdn.sportmonks.com/images/soccer/teams/23/503.png' },
  arsenal: { name: 'Arsenal', logo: 'https://cdn.sportmonks.com/images/soccer/teams/19/19.png' },
  mancity: { name: 'Manchester City', logo: 'https://cdn.sportmonks.com/images/soccer/teams/9/9.png' },
  manutd: { name: 'Manchester United', logo: 'https://cdn.sportmonks.com/images/soccer/teams/14/14.png' },
  inter: { name: 'Inter', logo: 'https://cdn.sportmonks.com/images/soccer/teams/18/2930.png' },
  intermiami: { name: 'Inter Miami', logo: 'https://cdn.sportmonks.com/images/soccer/teams/3/239235.png' },
  alnassr: { name: 'Al-Nassr', logo: 'https://cdn.sportmonks.com/images/soccer/teams/10/2506.png' },
  alqadsiah: { name: 'Al-Qadsiah', logo: 'https://cdn.sportmonks.com/images/soccer/teams/4/13092.png' },
};

window.BALLONDOR_CANDIDATES = [
    { id: 187260, name: 'Achraf Hakimi', img: 'https://cdn.sportmonks.com/images/soccer/players/28/187260.png', club: 'psg' },
    { id: 129602, name: 'Bruno Fernandes', img: 'https://cdn.sportmonks.com/images/soccer/players/2/129602.png', club: 'manutd' },
    { id: 33685, name: 'Dayot Upamecano', img: 'https://cdn.sportmonks.com/images/soccer/players/21/33685.png', club: 'bayern' },
    { id: 5273, name: 'Declan Rice', img: 'https://cdn.sportmonks.com/images/soccer/players/25/5273.png', club: 'arsenal' },
    { id: 154421, name: 'Erling Haaland', img: 'https://cdn.sportmonks.com/images/soccer/players/21/154421.png', club: 'mancity' },
    { id: 186735, name: 'Fabián Ruiz', img: 'https://cdn.sportmonks.com/images/soccer/players/15/186735.png', club: 'psg' },
    { id: 448389, name: 'Ferran Torres', img: 'https://cdn.sportmonks.com/images/soccer/players/5/448389.png', club: 'psg' },
    { id: 97811, name: 'Gabriel Magalhães', img: 'https://cdn.sportmonks.com/images/soccer/players/19/97811.png', club: 'arsenal' },
    { id: 997, name: 'Harry Kane', img: 'https://cdn.sportmonks.com/images/soccer/players/5/997.png', club: 'bayern' },
    { id: 37255840, name: 'Jude Bellingham', img: 'https://cdn.sportmonks.com/images/soccer/players/0/37255840.png', club: 'realmadrid' },
    { id: 37592729, name: 'João Neves', img: 'https://cdn.sportmonks.com/images/soccer/players/25/37592729.png', club: 'psg' },
    { id: 254057, name: 'Julián Quiñones', img: 'https://cdn.sportmonks.com/images/soccer/players/9/254057.png', club: 'alqadsiah' },
    { id: 1479337, name: 'Khvicha Kvaratskhelia', img: 'https://cdn.sportmonks.com/images/soccer/players/9/1479337.png', club: 'psg' },
    { id: 96611, name: 'Kylian Mbappé', img: 'https://cdn.sportmonks.com/images/soccer/players/3/96611.png', club: 'realmadrid' },
    { id: 37656179, name: 'Lamine Yamal', img: 'https://cdn.sportmonks.com/images/soccer/players/19/37656179.png', club: 'barcelona' },
    { id: 333594, name: 'Lautaro Martínez', img: 'https://cdn.sportmonks.com/images/soccer/players/26/333594.png', club: 'inter' },
    { id: 184798, name: 'Lionel Messi', img: 'https://cdn.sportmonks.com/images/soccer/players/30/184798.png', club: 'intermiami' },
    { id: 241036, name: 'Luis Díaz', img: 'https://cdn.sportmonks.com/images/soccer/players/12/241036.png', club: 'bayern' },
    { id: 448448, name: 'Marc Cucurella', img: 'https://cdn.sportmonks.com/images/soccer/players/0/448448.png', club: 'realmadrid' },
    { id: 96208, name: 'Marquinhos', img: 'https://cdn.sportmonks.com/images/soccer/players/16/96208.png', club: 'psg' },
    { id: 24799984, name: 'Michael Olise', img: 'https://cdn.sportmonks.com/images/soccer/players/16/24799984.png', club: 'bayern' },
    { id: 37262099, name: 'Nuno Mendes', img: 'https://cdn.sportmonks.com/images/soccer/players/19/37262099.png', club: 'psg' },
    { id: 32403, name: 'Ousmane Dembélé', img: 'https://cdn.sportmonks.com/images/soccer/players/19/32403.png', club: 'psg' },
    { id: 37656790, name: 'Pau Cubarsí', img: 'https://cdn.sportmonks.com/images/soccer/players/22/37656790.png', club: 'barcelona' },
    { id: 186910, name: 'Rodri', img: 'https://cdn.sportmonks.com/images/soccer/players/30/186910.png', club: 'barcelona' },
    { id: 1389, name: 'Sadio Mané', img: 'https://cdn.sportmonks.com/images/soccer/players/13/1389.png', club: 'alnassr' },
    { id: 600687, name: 'Vinícius Júnior', img: 'https://cdn.sportmonks.com/images/soccer/players/15/600687.png', club: 'realmadrid' },
    { id: 4545430, name: 'Vitinha', img: 'https://cdn.sportmonks.com/images/soccer/players/22/4545430.png', club: 'psg' },
    { id: 17544737, name: 'William Saliba', img: 'https://cdn.sportmonks.com/images/soccer/players/1/17544737.png', club: 'arsenal' },
    { id: 12393419, name: 'Willian Pacho', img: 'https://cdn.sportmonks.com/images/soccer/players/11/12393419.png', club: 'psg' },
];

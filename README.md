# Preview Match Studio

Générateur de visuels « Club A vs Club B » pour les articles preview (NBA, football).
Export en 1200 × 675 px (16:9), en JPG, WebP ou PNG.

## Lancer l'outil

En ligne : https://jcrochet-netizen.github.io/preview-match-studio/

En local : double-cliquez sur `lancer.command` : un petit serveur local démarre et le navigateur s'ouvre sur
http://localhost:8779 (ou le port libre suivant). Laissez la fenêtre du Terminal ouverte pendant l'utilisation.

Si vous ouvrez `index.html` directement depuis le Finder, le téléchargement sera bloqué par le navigateur.

## Utilisation

1. **Site** : choisissez le site dans le menu. Son template et son logo (en haut à droite) se chargent.
2. **Fond** : « Importer un template » remplace le fond du site (mémorisé dans ce navigateur).
3. **Logos** : choisissez le club dans le menu (le bon logo se place tout seul) ou importez un logo
   (clic, glisser-déposer ou Cmd+V). Déplacez-le à la souris,
   ajustez la taille (curseur ou molette), puis cliquez sur **Valider la position**.
   La dernière position validée est réutilisée pour les visuels suivants.
4. **Prévisualiser**, vérifiez le nom du fichier et le format, puis **Télécharger**.

Langue : français, anglais ou portugais (Brésil), via le menu en haut à droite. Le choix est mémorisé ;
à la première visite, la langue du navigateur est utilisée. Les textes sont dans `js/i18n.js`.

Raccourcis : flèches = déplacer au pixel (Maj = 10 px), Alt pendant le glisser = sans magnétisme,
Échap = désélectionner.

## Test : photo(s) de joueur détourée(s) par IA (`player.html`, `player2.html`)

Page de test : on importe la photo d'un joueur, une IA isole le joueur du décor et le pose sur le
template du site choisi. On peut ensuite le déplacer, le redimensionner, le retourner, puis exporter
le visuel (ou le joueur seul en PNG transparent).
`player2.html` fait la même chose avec deux joueurs (un de chaque côté du VS) ; les deux photos
sont détourées l'une après l'autre. Le sélecteur « 1 joueur / 2 joueurs » passe d'une page à l'autre.

- Moteur : [IMG.LY Background Removal](https://github.com/imgly/background-removal-js) 1.7.0, exécuté
  dans le navigateur. La photo n'est envoyée à aucun serveur. Le modèle se télécharge au premier usage
  puis reste en cache : « Haute qualité » ≈ 170 Mo (par défaut, contours plus nets), « Standard »
  ≈ 80 Mo, « Rapide » ≈ 40 Mo. Licence AGPL-3.0.
- « Rogner le contour » (0 à 5 px, 2 px par défaut, réglable par joueur) retire quelques pixels sur
  tout le tour du joueur pour effacer le liseré de fond et les mèches fantômes.
- L'option « Rendre le joueur bien opaque » comble les zones que le modèle laisse semi-transparentes
  (ex. maillot jaune sur parquet jaune).
- Préférez des photos où le joueur n'est coupé qu'en bas du cadre : une coupe sur le côté reste visible.
- Carte « Lumière » : une ambiance appliquée aux joueurs détourés, dosée par « Intensité ».
  Originale (photo telle quelle), Naturelle, Plus claire, Plus sombre, Studio photo (net, liseré blanc),
  Cinématique (contrastée, tons du décor, bas du joueur assombri) et Lumière du décor (halo de la couleur
  du fond). La couleur du décor est lue dans le template : dorée sur le Ballon d'Or, neutre sur `base.png`.
  Toutes sauf Originale donnent aussi la même luminosité aux joueurs (photos de sources différentes).
  Les réglages de chaque ambiance sont dans `js/config.js` (`lightLooks`).

## Ballon d'Or (`ballondor.html`)

Le menu « Visuel » en haut du panneau passe d'un visuel Ballon d'Or à l'autre : « Top 3 »
(`ballondor.html`), « Top 10 - 16/9 » (`ballondor-top10.html`) et « Top 10 - 9/16 »
(`ballondor-top10-vertical.html`).

Visuel « top 3 » sur le template `ballondor-top3.png` : trois cases, une photo de joueur par case,
détourée par IA comme sur les pages joueur (mêmes réglages : moteur, rognage, opacité, ombre).

- Chaque joueur est posé sur le trait lumineux de sa case et, par défaut, découpé le long des bords
  inclinés de la case (option « Garder chaque joueur dans sa case »). « Recentrer dans la case »
  le replace au départ.
- Une photo déposée sur l'image va dans la case la plus proche.
- Titre facultatif (étape 2) : texte en gras, taille, couleur (Blanc, Or ou au choix) et police.
  On le déplace à la souris ; il est réduit automatiquement s'il est trop long.
- Polices du titre et des noms : 10 polices Google Fonts (Inter, Montserrat, Poppins, Oswald, Barlow
  Condensed, Bebas Neue, Anton, Teko, Playfair Display, Cinzel), chaque bouton écrit dans sa police.
  La liste est dans `js/config.js` (`fonts`) ; pour en ajouter une, ajoutez-la aussi au lien Google Fonts
  de `ballondor.html` et `ballondor-top10.html`.
- Nom de chaque joueur (dans sa carte) : affiché dans la bande noire sous la case, centré sur la largeur
  de la case et réduit s'il dépasse. Chaque nom se déplace à la souris ; police, couleur et taille
  (communes aux trois noms) dans la carte « Noms des joueurs ». Les noms servent aussi au nom du fichier.
- Le logo du site est facultatif (« Aucun logo » par défaut) ; le menu propose les sites football
  (Topmercato, Afrik-Foot, Sportsmole, FootballWhispers, Trivela). Sur ce fond sombre, la version
  claire du logo (`logoOnDark` dans `js/config.js`) est utilisée quand elle existe.
- Les cases (centre, sol, taille, contour) sont décrites dans `js/config.js`, `playerLayouts.ballondor`,
  en pixels de l'image finale.
- Format 3:2 (1200 × 800 px) pour Topmercato : avec ce site, un choix « Format de l'image » apparaît sous
  le menu Site (16:9 ou 3:2, mémorisé). Le 3:2 utilise `ballondor-top3TM.png` et ses propres cases ; les
  photos détourées sont gardées, et le titre et les noms ont leur position pour chaque format. Les formats
  sont dans `playerLayouts.ballondor.formats` (`sites` : sites qui les proposent).

## Ballon d'Or — Top 10 (`ballondor-top10.html`, `ballondor-top10-vertical.html`)

Deux formats, même outil (`js/top10.js`) : 16/9 en 1200 × 675 px (`ballondor-top10.png`, config
`ballondorTop10`) et 9/16 en 1080 × 1920 px pour les stories (`ballondor-top10-vertical.png`, config
`ballondorTop10Vertical`). La page choisit son format avec `data-layout` sur `<body>`. Le classement et le
site sont partagés entre les deux formats : on remplit le top 10 une fois et on exporte les deux ; le style
des noms (police, couleur, taille) est enregistré à part pour chaque format.

Visuel « top 10 » sur le template `ballondor-top10.png` (10 filets dorés) : pour chaque ligne, on choisit
le joueur dans un menu (liste alphabétique). La ligne affiche, de gauche à droite : le rang (chiffres
dorés, dessinés par l'outil), la vignette ronde du joueur, son nom et le logo de son club.

- Un joueur déjà classé est grisé dans les autres menus. « Nouveau classement » vide les dix lignes.
- Vignettes et logos de club viennent du CDN Sportmonks (`cdn.sportmonks.com`, 150 × 150 px, fond
  transparent), chargés en CORS pour que l'export fonctionne. Il faut donc une connexion internet.
- Noms : police (même liste que le Top 3), couleur et taille communes aux dix lignes ; un nom trop long
  est réduit.
- Logo du site facultatif, calé en haut à droite au-dessus du classement (`logo` dans la config).
- Les candidats sont dans `js/ballondor-candidates.js` (`id`, `name`, `img`, `club`), les clubs dans
  `BALLONDOR_CLUBS` du même fichier (clubs à jour des transferts de l'été 2026 : Rodri au Barça,
  Ferran Torres au PSG, Cucurella au Real Madrid). Pour un transfert, changez la clé `club` du joueur ;
  pour un nouveau club, ajoutez son logo Sportmonks (`images/soccer/teams/<id % 32>/<id>.png`).
- Les lignes (centres verticaux), le rang, la vignette, le nom, le logo du club et la zone du logo du site
  sont dans `js/config.js`, `ballondorTop10`, en pixels de l'image finale.

## Ajouter un site et son template (pour toute l'équipe)

Chaque site a son propre template : choisir le site dans le menu charge son fond et place son logo.

1. Déposez le template (16:9, 1200 × 675 px ou plus) dans `assets/templates/` et ajoutez la ligne
   `!assets/templates/<fichier>` dans `.gitignore` pour qu'il soit versionné.
2. Déposez le logo du site (PNG ou SVG transparent) dans `assets/sites/`.
3. Ajoutez une entrée dans `js/config.js`, section `sites` :

   ```js
   { id: 'mon-site', name: 'MonSite.com', sports: ['nba'],
     template: 'assets/templates/mon-site.png', logo: 'assets/sites/mon-site.png' },
   ```

## Ajouter un club au menu

Déposez le logo (SVG ou PNG transparent) dans `assets/teams/<sport>/`, puis ajoutez une ligne dans
`js/teams.js` : `{ id: 'PSG', name: 'Paris Saint-Germain', logo: 'assets/teams/football/PSG.svg' },`.
Les 30 logos NBA viennent du CDN officiel de la NBA (copiés depuis le projet BasketUSA).

Les positions par défaut des logos et la taille du logo du site se règlent aussi dans `js/config.js`.

## Déploiement Easydeploy

Le site est aussi déployé via [easydeploy](https://github.com/northstar-network/easydeploy), en plus de
GitHub Pages. Les deux partagent le même code : GitHub Pages sert `jcrochet-netizen/preview-match-studio`
(remote `origin`), easydeploy déploie `northstar-network/preview-match-studio` (remote `easydeploy`,
`git push easydeploy main`).

| Fichier | Rôle |
| --- | --- |
| `docker-compose.yml` | nginx (image officielle) derrière Traefik (`nsnrouting`), sans port publié, réseau `proxy` |
| `nginx.conf` | Sert le site et bloque les fichiers techniques du dépôt (`.git`, `.env.prod`, `*.yml`…) |
| `.env.prod` | Commité : nom d'hôte et TLS seulement, aucun secret |
| `.github/workflows/deploy.yml` | À chaque push sur `main` du dépôt easydeploy : SSH, `git pull`, `docker compose up -d` |

Avant le premier déploiement : créer `northstar-network/preview-match-studio` via le gestionnaire de
permissions (`github-permission-manager.n10.xyz`), puis renseigner les secrets du dépôt
(Settings → Secrets → Actions) : `SSH_HOST`, `SSH_USERNAME`, `SSH_PRIVATE_KEY`, et `SSH_PORT` si ce
n'est pas 22.

URL de production : https://preview-match-studio.easydeploy.tech

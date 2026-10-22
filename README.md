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

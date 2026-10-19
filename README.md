# Preview Match Studio

Générateur de visuels « Club A vs Club B » pour les articles preview (NBA, football).
Export en 1200 × 675 px (16:9), en JPG, WebP ou PNG.

## Lancer l'outil

En ligne : https://jcrochet-netizen.github.io/preview-match-studio/

En local : double-cliquez sur `lancer.command` : un petit serveur local démarre et le navigateur s'ouvre sur
http://localhost:8765. Laissez la fenêtre du Terminal ouverte pendant l'utilisation.

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

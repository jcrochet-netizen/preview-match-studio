/* Preview Match Studio — page « Swap shirt » : le maillot du joueur est coupé en deux par une déchirure.
   Chaque moitié garde le maillot de la photo ou reçoit l'image d'un autre maillot, posée sur le torse
   (déplacement, taille, rotation, déformation à la main) et éclairée comme la photo. */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const I18N = window.APP_I18N;
  const SW = CFG.swapShirt;
  const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
  const EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
  const QUALITY = 0.92;
  const WORK_MAX = 2400; // photo plus grande réduite (côté le plus long) : export « taille actuelle » à cette taille
  const DETECT_MAX = 1024; // image envoyée au modèle de détection
  const SHADE_MAX = 640; // résolution des cartes de lumière et de plis
  const SHIRT_MAX = 1400; // image de maillot importée, réduite au besoin
  const GRID = 8; // subdivisions du maillage de déformation (par côté)
  const TOOLS = ['move', 'warp', 'add', 'erase', 'tear', 'frame'];

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const slugify = (str) => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).join('-');

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  const readCtx = (c) => c.getContext('2d', { willReadFrequently: true });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
      img.src = src;
    });
  }

  async function fileToCanvas(file, max) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const k = Math.min(1, max / Math.max(w, h));
      const c = makeCanvas(w * k, h * k);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, c.width, c.height);
      return { canvas: c, w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvasToBlob = (c, type, quality) => new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('export vide'))), type, quality);
  });

  // Recadre une image sur ses pixels non transparents
  function trimTransparent(src) {
    const w = src.width;
    const h = src.height;
    const c = makeCanvas(w, h);
    const x = readCtx(c);
    x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let col = 0; col < w; col++) {
        if (d[(y * w + col) * 4 + 3] > 8) {
          if (col < minX) minX = col;
          if (col > maxX) maxX = col;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return c;
    const o = makeCanvas(maxX - minX + 1, maxY - minY + 1);
    o.getContext('2d').drawImage(c, minX, minY, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }

  // Générateur pseudo-aléatoire reproductible (la même déchirure pour la même graine)
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bruit 1D lissé (valeurs aléatoires interpolées), entre −1 et 1
  function noise1D(seed) {
    const rnd = mulberry32(seed);
    const vals = Array.from({ length: 1024 }, () => rnd() * 2 - 1);
    const at = (i) => vals[((i % 1024) + 1024) % 1024];
    return (x) => {
      const i = Math.floor(x);
      const f = x - i;
      const s = f * f * (3 - 2 * f);
      return at(i) + (at(i + 1) - at(i)) * s;
    };
  }

  // Flou rapide d'un tableau (trois passes de moyenne glissante, proche d'un flou gaussien)
  function blur(src, w, h, r) {
    const out = Float32Array.from(src);
    if (r < 1) return out;
    const tmp = new Float32Array(w * h);
    const n = 2 * r + 1;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += out[row + clamp(x, 0, w - 1)];
        for (let x = 0; x < w; x++) {
          tmp[row + x] = acc / n;
          acc += out[row + Math.min(w - 1, x + r + 1)] - out[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          out[y * w + x] = acc / n;
          acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
      }
    }
    return out;
  }

  const prefs = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`mps:${key}`);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`mps:${key}`, JSON.stringify(value)); } catch { /* ignoré */ }
    },
  };

  // ---------- Langue (mêmes textes et même choix de langue que le reste de l'outil) ----------
  function detectLang() {
    const saved = prefs.get('lang', null);
    if (saved && I18N.dict[saved]) return saved;
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('pt')) return 'pt-BR';
    if (nav.startsWith('en')) return 'en';
    return 'fr';
  }
  let lang = detectLang();

  function t(key, params = {}) {
    const str = I18N.dict[lang]?.[key] ?? I18N.dict.fr[key] ?? key;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  }

  function applyStaticTexts(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(key));
      });
    });
  }

  const num = (n, digits) => n.toLocaleString(lang, { maximumFractionDigits: digits });
  const formatSize = (bytes) => (bytes < 1048576
    ? t('size.kb', { n: num(Math.round(bytes / 1024), 0) })
    : t('size.mb', { n: num(bytes / 1048576, 1) }));

  // ---------- État ----------
  const makeHalf = () => ({
    mode: 'keep', // 'keep' : maillot de la photo ; 'image' : image importée
    source: null, // image du maillot telle qu'importée (réduite)
    img: null, // image du maillot prête (fond retiré, recadrée)
    name: '',
    removeBg: true,
    x: 0, // centre de l'image du maillot, en px de la photo
    y: 0,
    base: 1, // échelle de départ (le maillot couvre la zone détectée)
    zoom: 100, // taille réglée par l'utilisateur (%)
    rot: 0, // rotation (degrés)
    bright: 0, // luminosité (−60 à 60)
    mesh: Array.from({ length: 9 }, () => [0, 0]), // décalages des 3 × 3 poignées de déformation
    placed: false,
  });

  const state = {
    site: null,
    logoLight: prefs.get('swap:logoLight', true),
    photo: null, // { canvas, w, h, orig: { w, h }, name }
    mask: null, // zone du maillot (canvas à la taille de la photo, opacité = zone)
    autoMask: null, // zone trouvée par la détection, pour y revenir
    shape: null, // { box, cx, cy, bw, bh, top, bottom } : cadre de travail et mesures de la zone
    tear: { top: 0, bottom: 0, set: false, seed: 7, width: prefs.get('swap:tearWidth', 100) },
    halves: [makeHalf(), makeHalf()],
    active: 0, // moitié sélectionnée (outils Déplacer et Déformer)
    tool: 'move',
    brush: prefs.get('swap:brush', 60),
    showZone: false,
    light: prefs.get('swap:light', 80),
    folds: prefs.get('swap:folds', 60),
    format: prefs.get('swap:format', 'original'),
    frames: {}, // cadrage par format : { zoom, cx, cy }
    detect: { busy: false, frac: null, text: '' },
    pointer: null, // dernière position du pointeur sur la photo (curseur du pinceau)
  };

  const cache = {
    broad: null, // carte de lumière (gris neutre = 128)
    folds: null, // carte des plis
    halfMasks: [null, null],
    layers: [null, null], // moitiés rendues (à la taille du cadre de travail)
    tear: null, // papier de la déchirure
    tint: null, // zone du maillot teintée (affichage)
    scratch: null,
  };

  let siteToken = 0;
  let detectToken = 0;
  let drag = null;
  const preview = { url: '', blob: null };

  const els = {
    canvas: $('#editor'),
    stage: $('#stage'),
    emptyDrop: $('#emptyDrop'),
    photoFileStage: $('#photoFileStage'),
    stageBusy: $('#stageBusy'),
    stageBusyText: $('#stageBusyText'),
    status: $('#statusText'),
    keys: $('#keysText'),
    toolBar: $('#toolBar'),
    langSelect: $('#langSelect'),
    resetBtn: $('#resetBtn'),
    siteSelect: $('#siteSelect'),
    logoLight: $('#logoLight'),
    photoDrop: $('#photoDrop'),
    photoFile: $('#photoFile'),
    photoThumb: $('#photoThumb'),
    photoDropText: $('#photoDropText'),
    engineSelect: $('#engineSelect'),
    detectProgress: $('#detectProgress'),
    detectBar: $('#detectBar'),
    redetectBtn: $('#redetectBtn'),
    brushSize: $('#brushSize'),
    brushSizeOut: $('#brushSizeOut'),
    showZone: $('#showZone'),
    tearWidth: $('#tearWidth'),
    tearWidthOut: $('#tearWidthOut'),
    newTearBtn: $('#newTearBtn'),
    resetZoneBtn: $('#resetZoneBtn'),
    halves: $('#halves'),
    lightRange: $('#lightRange'),
    lightOut: $('#lightOut'),
    foldsRange: $('#foldsRange'),
    foldsOut: $('#foldsOut'),
    formatChoice: $('#formatChoice'),
    zoomField: $('#zoomField'),
    zoomRange: $('#zoomRange'),
    zoomOut: $('#zoomOut'),
    frameNote: $('#frameNote'),
    previewBtn: $('#previewBtn'),
    dialog: $('#previewDialog'),
    previewImg: $('#previewImg'),
    previewError: $('#previewError'),
    filenameInput: $('#filenameInput'),
    extLabel: $('#extLabel'),
    formatSelect: $('#formatSelect'),
    previewMeta: $('#previewMeta'),
    downloadBtn: $('#downloadBtn'),
    toast: $('#toast'),
  };
  const ctx = els.canvas.getContext('2d');
  const cards = [];

  // ---------- Format et cadrage ----------
  const currentFormat = () => SW.formats.find((f) => f.id === state.format) || SW.formats[0];

  function frameSize() {
    const f = currentFormat();
    if (f.id !== 'original') return { w: f.width, h: f.height };
    return state.photo ? { w: state.photo.w, h: state.photo.h } : { w: 1200, h: 675 };
  }

  const frameOf = () => {
    if (!state.frames[state.format]) state.frames[state.format] = { zoom: 100, cx: null, cy: null };
    return state.frames[state.format];
  };

  // Passage photo → image finale : la photo couvre le cadre (zoom réglable), centrée par défaut sur le joueur
  function view() {
    const F = frameSize();
    const p = state.photo;
    if (!p || currentFormat().id === 'original') return { s: F.w / (p ? p.w : F.w), tx: 0, ty: 0 };
    const fr = frameOf();
    const s = Math.max(F.w / p.w, F.h / p.h) * (fr.zoom / 100);
    const hw = F.w / (2 * s);
    const hh = F.h / (2 * s);
    const cx = clamp(fr.cx ?? (state.shape ? state.shape.cx : p.w / 2), hw, p.w - hw);
    const cy = clamp(fr.cy ?? p.h / 2, hh, p.h - hh);
    return { s, tx: F.w / 2 - cx * s, ty: F.h / 2 - cy * s, cx, cy };
  }

  // ---------- Zone du maillot ----------
  // Cadre de travail (zone + marge), centre de gravité et largeur du maillot, mesurés sur une copie réduite
  function computeShape() {
    const p = state.photo;
    if (!p || !state.mask) { state.shape = null; return; }
    const k = Math.min(1, 600 / Math.max(p.w, p.h));
    const c = makeCanvas(p.w * k, p.h * k);
    const x = readCtx(c);
    x.drawImage(state.mask, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width;
    let minY = c.height;
    let maxX = -1;
    let maxY = -1;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < c.height; y++) {
      for (let col = 0; col < c.width; col++) {
        const a = d[(y * c.width + col) * 4 + 3];
        if (a < 60) continue;
        if (col < minX) minX = col;
        if (col > maxX) maxX = col;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sx += col;
        sy += y;
        n++;
      }
    }
    if (n < 12) { state.shape = null; return; }
    const bw = (maxX - minX + 1) / k;
    const bh = (maxY - minY + 1) / k;
    const mx = bw * 0.1;
    const my = bh * 0.1;
    const x0 = Math.max(0, Math.floor(minX / k - mx));
    const y0 = Math.max(0, Math.floor(minY / k - my));
    const x1 = Math.min(p.w, Math.ceil((maxX + 1) / k + mx));
    const y1 = Math.min(p.h, Math.ceil((maxY + 1) / k + my));
    state.shape = {
      box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      cx: (sx / n + 0.5) / k,
      cy: (sy / n + 0.5) / k,
      bw,
      bh,
      top: minY / k,
      bottom: (maxY + 1) / k,
    };
  }

  // Cartes de lumière et de plis tirées du maillot de la photo (gris 128 = neutre), appliquées au nouveau
  // maillot en « lumière dure ». Pour ne pas reprendre le motif de l'ancien maillot (rayures, sponsor,
  // manches blanches), les pixels sont regroupés par famille de couleur et chacun n'est comparé qu'aux
  // pixels voisins de la même famille : il ne reste que l'ombre et la lumière (générale et des plis).
  function buildShading() {
    const s = state.shape;
    cache.broad = null;
    cache.folds = null;
    if (!s) return;
    const b = s.box;
    const k = Math.min(1, SHADE_MAX / Math.max(b.w, b.h));
    const w = Math.max(8, Math.round(b.w * k));
    const h = Math.max(8, Math.round(b.h * k));
    const n = w * h;
    const c = makeCanvas(w, h);
    const x = readCtx(c);
    x.drawImage(state.photo.canvas, b.x, b.y, b.w, b.h, 0, 0, w, h);
    const px = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h);
    x.drawImage(state.mask, b.x, b.y, b.w, b.h, 0, 0, w, h);
    const ma = x.getImageData(0, 0, w, h).data;
    // Luminosité et couleur (axes rouge-vert et jaune-bleu, sans l'intensité) de chaque pixel du maillot
    const L = new Float32Array(n);
    const F = new Float32Array(n * 3);
    const inside = [];
    for (let i = 0; i < n; i++) {
      const r = px[i * 4] / 255;
      const g = px[i * 4 + 1] / 255;
      const bl = px[i * 4 + 2] / 255;
      L[i] = 0.299 * r + 0.587 * g + 0.114 * bl;
      const sum = r + g + bl + 0.06;
      F[i * 3] = (r - g) / sum;
      F[i * 3 + 1] = (r + g - 2 * bl) / (2 * sum);
      F[i * 3 + 2] = L[i] * 0.6;
      if (ma[i * 4 + 3] > 127) inside.push(i);
    }
    if (inside.length < 50) return;
    // Familles de couleur : k-moyennes sur un échantillon, puis chaque pixel prend la plus proche
    const K = 6;
    const rnd = mulberry32(11);
    const sample = inside.filter((_, q) => q % 3 === 0);
    const centers = Array.from({ length: K }, (_, q) => {
      const i = sample[Math.floor(((q + rnd()) / K) * sample.length)] ?? sample[0];
      return [F[i * 3], F[i * 3 + 1], F[i * 3 + 2]];
    });
    const nearest = (i) => {
      let best = 0;
      let bd = Infinity;
      for (let q = 0; q < K; q++) {
        const d0 = F[i * 3] - centers[q][0];
        const d1 = F[i * 3 + 1] - centers[q][1];
        const d2 = F[i * 3 + 2] - centers[q][2];
        const d = d0 * d0 + d1 * d1 + d2 * d2;
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    };
    for (let it = 0; it < 8; it++) {
      const acc = Array.from({ length: K }, () => [0, 0, 0, 0]);
      sample.forEach((i) => {
        const a = acc[nearest(i)];
        a[0] += F[i * 3]; a[1] += F[i * 3 + 1]; a[2] += F[i * 3 + 2]; a[3]++;
      });
      acc.forEach((a, q) => { if (a[3]) centers[q] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    const label = new Int8Array(n).fill(-1);
    inside.forEach((i) => { label[i] = nearest(i); });
    const sw = s.bw * k;
    const rBig = Math.max(3, Math.round(sw * 0.12));
    const rFine = Math.max(1, Math.round(sw * 0.005));
    const rFold = Math.max(2, Math.round(sw * 0.035));
    const broad = new Float32Array(n).fill(1);
    const folds = new Float32Array(n).fill(1);
    for (let q = 0; q < K; q++) {
      const Mq = new Float32Array(n);
      const LMq = new Float32Array(n);
      let sumL = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (label[i] !== q) continue;
        Mq[i] = 1;
        LMq[i] = L[i];
        sumL += L[i];
        count++;
      }
      if (count < inside.length * 0.004) continue;
      const mean = Math.max(0.02, sumL / count);
      // Moyenne locale de la famille (flou normalisé par la présence de la famille)
      const local = (r) => {
        const a = blur(LMq, w, h, r);
        const m = blur(Mq, w, h, r);
        return (i) => (m[i] > 0.01 ? a[i] / m[i] : mean);
      };
      const big = local(rBig);
      const fine = local(rFine);
      const fold = local(rFold);
      for (let i = 0; i < n; i++) {
        if (label[i] !== q) continue;
        broad[i] = big(i) / mean;
        folds[i] = fine(i) / Math.max(0.01, fold(i));
      }
    }
    // Bords entre familles de couleur (lettres, écussons, liserés) : pas de plis ici, sinon le dessin de
    // l'ancien maillot réapparaîtrait en relief
    const edge = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let col = 0; col < w; col++) {
        const i = y * w + col;
        if (label[i] < 0) continue;
        for (let dy = -2; dy <= 2 && !edge[i]; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy;
            const xx = col + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            if (label[yy * w + xx] !== label[i]) { edge[i] = 1; break; }
          }
        }
      }
    }
    const edgeSoft = blur(edge, w, h, Math.max(1, Math.round(sw * 0.006)));
    for (let i = 0; i < n; i++) folds[i] = 1 + (folds[i] - 1) * clamp(1 - edgeSoft[i] * 1.6, 0, 1);
    // La lumière générale varie doucement : lissée sur le maillot, sans marche entre familles
    const Mall = new Float32Array(n);
    const BM = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (label[i] < 0) continue;
      Mall[i] = 1;
      BM[i] = broad[i];
    }
    const rSmooth = Math.max(2, Math.round(sw * 0.04));
    const bs = blur(BM, w, h, rSmooth);
    const ms = blur(Mall, w, h, rSmooth);
    for (let i = 0; i < n; i++) if (label[i] >= 0 && ms[i] > 0.01) broad[i] = bs[i] / ms[i];
    const toMap = (vals, lo, hi, gain) => {
      const m = makeCanvas(w, h);
      const mx = m.getContext('2d');
      const img = mx.createImageData(w, h);
      for (let i = 0; i < n; i++) {
        const v = label[i] < 0 ? 128 : clamp(0.5 * (1 + (vals[i] - 1) * gain), lo, hi) * 255;
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      mx.putImageData(img, 0, 0);
      return m;
    };
    cache.broad = toMap(broad, 0.28, 0.64, 1);
    cache.folds = toMap(folds, 0.32, 0.66, 1.3);
  }

  // Zone teintée pour l'affichage (outils de zone, ou case « Afficher la zone »)
  function buildTint() {
    if (!state.mask) { cache.tint = null; return; }
    const c = cache.tint && cache.tint.width === state.mask.width && cache.tint.height === state.mask.height
      ? cache.tint : makeCanvas(state.mask.width, state.mask.height);
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'copy';
    x.drawImage(state.mask, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = 'rgba(255, 107, 31, 0.45)';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    cache.tint = c;
  }

  // ---------- Déchirure ----------
  // Bords gauche et droit de la bande de papier, en px de la photo : une ligne entre les poignées haut et bas,
  // ondulée, d'épaisseur variable, avec de petites dents sur chaque bord (papier déchiré)
  function tearEdges() {
    const s = state.shape;
    const b = s.box;
    const n1 = noise1D(state.tear.seed);
    const n2 = noise1D(state.tear.seed + 101);
    const n3 = noise1D(state.tear.seed + 202);
    const wave = (y) => n1(y) * 0.62 + n1(y * 2.3 + 17) * 0.26 + n1(y * 5.1 + 41) * 0.12;
    const amp = s.bw * 0.012;
    const base = s.bw * 0.009 * (state.tear.width / 100);
    const step = Math.max(1.5, b.h / 420);
    const left = [];
    const right = [];
    for (let y = b.y - step; y <= b.y + b.h + step; y += step) {
      const u = (y - s.top) / Math.max(1, s.bottom - s.top);
      const xc = lerp(state.tear.top, state.tear.bottom, u) + amp * wave(y / (s.bw * 0.08));
      const w = base * (0.45 + 1.1 * (0.5 + 0.5 * n2(y / (s.bw * 0.05))));
      const teethL = base * 0.35 * n3(y / 2.6);
      const teethR = base * 0.35 * n3(y / 2.3 + 300);
      left.push([xc - w / 2 + teethL, y]);
      right.push([xc + w / 2 + teethR, y]);
    }
    return { left, right, base };
  }

  // Masques des deux moitiés (zone du maillot de part et d'autre de la déchirure) et papier de la déchirure
  function buildTear() {
    const s = state.shape;
    cache.halfMasks = [null, null];
    cache.tear = null;
    if (!s) return;
    const b = s.box;
    const e = tearEdges();
    const L = e.left.map(([x, y]) => [x - b.x, y - b.y]);
    const R = e.right.map(([x, y]) => [x - b.x, y - b.y]);
    const keepZone = (x) => {
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(state.mask, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      x.globalCompositeOperation = 'source-over';
    };
    const polygon = (x, pts) => {
      x.beginPath();
      pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath();
    };
    const first = L[0][1];
    const last = L[L.length - 1][1];
    const left = makeCanvas(b.w, b.h);
    const lx = left.getContext('2d');
    polygon(lx, [[-4, first], ...L, [-4, last]]);
    lx.fillStyle = '#fff';
    lx.fill();
    keepZone(lx);
    const right = makeCanvas(b.w, b.h);
    const rx = right.getContext('2d');
    polygon(rx, [[b.w + 4, first], ...R, [b.w + 4, last]]);
    rx.fillStyle = '#fff';
    rx.fill();
    keepZone(rx);
    cache.halfMasks = [left, right];

    if (state.tear.width <= 0) return;
    const paper = makeCanvas(b.w, b.h);
    const px = paper.getContext('2d');
    polygon(px, [...L, ...R.slice().reverse()]);
    // Le papier se soulève : ombre portée douce sur la moitié gauche
    px.save();
    px.shadowColor = 'rgba(0, 0, 0, 0.5)';
    px.shadowBlur = Math.max(2, e.base * 0.9);
    px.shadowOffsetX = -Math.max(0.5, e.base * 0.25);
    const g = px.createLinearGradient(0, 0, 0, b.h);
    g.addColorStop(0, '#f6f3ec');
    g.addColorStop(1, '#e6e1d6');
    px.fillStyle = g;
    px.fill();
    px.restore();
    // Fibres claires le long des bords
    px.lineWidth = Math.max(0.6, e.base * 0.18);
    px.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    [L, R].forEach((pts) => {
      px.beginPath();
      pts.forEach(([x, y], i) => (i ? px.lineTo(x, y) : px.moveTo(x, y)));
      px.stroke();
    });
    keepZone(px);
    cache.tear = paper;
  }

  // Position horizontale de la déchirure à la hauteur y (pour savoir de quel côté se trouve un point)
  const tearXAt = (y) => {
    const s = state.shape;
    const u = (y - s.top) / Math.max(1, s.bottom - s.top);
    return lerp(state.tear.top, state.tear.bottom, u);
  };

  // ---------- Maillot importé : placement et déformation ----------
  const halfScale = (h) => h.base * (h.zoom / 100);

  // Décalage de déformation au point (u, v) de l'image du maillot : interpolation des 3 × 3 poignées
  function meshOffset(mesh, u, v) {
    const ci = u < 0.5 ? 0 : 1;
    const cj = v < 0.5 ? 0 : 1;
    const lu = clamp((u - ci * 0.5) * 2, 0, 1);
    const lv = clamp((v - cj * 0.5) * 2, 0, 1);
    const p00 = mesh[cj * 3 + ci];
    const p10 = mesh[cj * 3 + ci + 1];
    const p01 = mesh[(cj + 1) * 3 + ci];
    const p11 = mesh[(cj + 1) * 3 + ci + 1];
    return [
      lerp(lerp(p00[0], p10[0], lu), lerp(p01[0], p11[0], lu), lv),
      lerp(lerp(p00[1], p10[1], lu), lerp(p01[1], p11[1], lu), lv),
    ];
  }

  // Point (u, v) de l'image du maillot → position sur la photo
  function halfPoint(h, u, v, warp = true) {
    const s = halfScale(h);
    const a = (h.rot * Math.PI) / 180;
    const lx = (u - 0.5) * h.img.width * s;
    const ly = (v - 0.5) * h.img.height * s;
    let x = h.x + lx * Math.cos(a) - ly * Math.sin(a);
    let y = h.y + lx * Math.sin(a) + ly * Math.cos(a);
    if (warp) {
      const o = meshOffset(h.mesh, u, v);
      x += o[0];
      y += o[1];
    }
    return [x, y];
  }

  const isWarped = (h) => h.mesh.some(([dx, dy]) => Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01);

  // Triangle de l'image source (s0, s1, s2) dessiné sur le triangle de destination (d0, d1, d2)
  function drawTriangle(c, img, s0, s1, s2, d0, d1, d2) {
    const cx = (d0[0] + d1[0] + d2[0]) / 3;
    const cy = (d0[1] + d1[1] + d2[1]) / 3;
    // Triangle très légèrement agrandi pour masquer les jointures entre triangles
    const grow = ([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const l = Math.hypot(dx, dy) || 1;
      return [x + (dx / l) * 0.8, y + (dy / l) * 0.8];
    };
    const [x0, y0] = s0;
    const [x1, y1] = s1;
    const [x2, y2] = s2;
    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (!den) return;
    const [u0, v0] = d0;
    const [u1, v1] = d1;
    const [u2, v2] = d2;
    const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / den;
    const cc = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / den;
    const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / den;
    const d = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / den;
    c.save();
    c.beginPath();
    const g0 = grow(d0);
    const g1 = grow(d1);
    const g2 = grow(d2);
    c.moveTo(g0[0], g0[1]);
    c.lineTo(g1[0], g1[1]);
    c.lineTo(g2[0], g2[1]);
    c.closePath();
    c.clip();
    c.transform(a, b, cc, d, u0 - a * x0 - cc * y0, v0 - b * x0 - d * y0);
    c.drawImage(img, 0, 0);
    c.restore();
  }

  // Image du maillot posée sur la photo (coordonnées de la photo), déformée si besoin
  function drawShirt(c, h) {
    const img = h.img;
    if (!isWarped(h)) {
      c.save();
      c.translate(h.x, h.y);
      c.rotate((h.rot * Math.PI) / 180);
      const s = halfScale(h);
      c.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
      c.restore();
      return;
    }
    const n = GRID + 1;
    const pts = [];
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) pts.push(halfPoint(h, i / GRID, j / GRID));
    }
    const sw = img.width;
    const sh = img.height;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const s00 = [(i / GRID) * sw, (j / GRID) * sh];
        const s10 = [((i + 1) / GRID) * sw, (j / GRID) * sh];
        const s01 = [(i / GRID) * sw, ((j + 1) / GRID) * sh];
        const s11 = [((i + 1) / GRID) * sw, ((j + 1) / GRID) * sh];
        const d00 = pts[j * n + i];
        const d10 = pts[j * n + i + 1];
        const d01 = pts[(j + 1) * n + i];
        const d11 = pts[(j + 1) * n + i + 1];
        drawTriangle(c, img, s00, s10, s11, d00, d10, d11);
        drawTriangle(c, img, s00, s11, s01, d00, d11, d01);
      }
    }
  }

  // Moitié i rendue dans le cadre de travail : maillot posé, luminosité, lumière et plis de la photo,
  // puis découpe à la zone de cette moitié
  function renderHalf(i) {
    const h = state.halves[i];
    const s = state.shape;
    if (!s || h.mode !== 'image' || !h.img || !cache.halfMasks[i]) { cache.layers[i] = null; return; }
    const b = s.box;
    let layer = cache.layers[i];
    if (!layer || layer.width !== b.w || layer.height !== b.h) layer = makeCanvas(b.w, b.h);
    const x = layer.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, b.w, b.h);
    x.save();
    x.translate(-b.x, -b.y);
    x.imageSmoothingQuality = 'high';
    drawShirt(x, h);
    x.restore();
    if (h.bright) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = h.bright > 0 ? `rgba(255, 255, 255, ${(h.bright / 100) * 0.8})` : `rgba(0, 0, 0, ${(-h.bright / 100) * 0.8})`;
      x.fillRect(0, 0, b.w, b.h);
    }
    // Lumière de la photo puis plis : carte limitée au maillot posé, appliquée en « lumière dure »
    if (!cache.scratch || cache.scratch.width !== b.w || cache.scratch.height !== b.h) cache.scratch = makeCanvas(b.w, b.h);
    const tmp = cache.scratch.getContext('2d');
    [[cache.broad, state.light], [cache.folds, state.folds]].forEach(([map, amount]) => {
      if (!map || amount <= 0) return;
      tmp.globalCompositeOperation = 'copy';
      tmp.imageSmoothingQuality = 'high';
      tmp.drawImage(map, 0, 0, b.w, b.h);
      tmp.globalCompositeOperation = 'destination-in';
      tmp.drawImage(layer, 0, 0);
      x.globalCompositeOperation = 'hard-light';
      x.globalAlpha = amount / 100;
      x.drawImage(cache.scratch, 0, 0);
      x.globalAlpha = 1;
    });
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(cache.halfMasks[i], 0, 0);
    x.globalCompositeOperation = 'source-over';
    cache.layers[i] = layer;
  }

  // Placement de départ : le maillot couvre la zone détectée, col en haut de la zone
  function placeHalf(h) {
    const s = state.shape;
    if (!s || !h.img) { h.placed = false; return; }
    h.base = Math.max(s.bw / h.img.width, s.bh / h.img.height) * 1.04;
    h.zoom = 100;
    h.rot = 0;
    h.mesh = Array.from({ length: 9 }, () => [0, 0]);
    h.x = s.cx;
    h.y = s.top + (h.img.height * h.base) / 2 - s.bh * 0.02;
    h.placed = true;
  }

  // Fond uni de l'image d'un maillot retiré : remplissage depuis les bords de l'image, dans une tolérance
  // de couleur autour de la couleur médiane des bords (photos produit sur fond blanc ou gris)
  function removeFlatBackground(src) {
    const w = src.width;
    const h = src.height;
    const c = makeCanvas(w, h);
    const x = readCtx(c);
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    // Image déjà détourée (PNG transparent) : on la garde telle quelle
    let transparent = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] < 200) transparent++;
    if (transparent > d.length / 16 / 50) return c;
    const border = [];
    for (let col = 0; col < w; col++) border.push(col, (h - 1) * w + col);
    for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    const median = (ch) => {
      const v = border.map((i) => d[i * 4 + ch]).sort((a, b) => a - b);
      return v[v.length >> 1];
    };
    const ref = [median(0), median(1), median(2)];
    const tol = 42 * 42;
    const near = (i) => {
      const dr = d[i * 4] - ref[0];
      const dg = d[i * 4 + 1] - ref[1];
      const db = d[i * 4 + 2] - ref[2];
      return dr * dr + dg * dg + db * db < tol;
    };
    const bg = new Uint8Array(w * h);
    const stack = [];
    border.forEach((i) => { if (!bg[i] && near(i)) { bg[i] = 1; stack.push(i); } });
    while (stack.length) {
      const i = stack.pop();
      const px = i % w;
      const neighbours = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of neighbours) {
        if (j < 0 || j >= w * h || bg[j] || !near(j)) continue;
        bg[j] = 1;
        stack.push(j);
      }
    }
    for (let i = 0; i < w * h; i++) {
      if (bg[i]) { d[i * 4 + 3] = 0; continue; }
      // Bord adouci : pixel du maillot touchant le fond
      const px = i % w;
      if ((px > 0 && bg[i - 1]) || (px < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < w * (h - 1) && bg[i + w])) d[i * 4 + 3] = 150;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function prepareShirt(h) {
    if (!h.source) { h.img = null; return; }
    h.img = trimTransparent(h.removeBg ? removeFlatBackground(h.source) : h.source);
  }

  // ---------- Recalculs regroupés ----------
  const dirty = { shape: false, tear: false, layers: new Set(), tint: false };
  let updateQueued = false;

  function invalidate({ shape = false, tear = false, layers = [], tint = false } = {}) {
    if (shape) dirty.shape = true;
    if (tear) dirty.tear = true;
    if (tint) dirty.tint = true;
    layers.forEach((i) => dirty.layers.add(i));
    if (updateQueued) return;
    updateQueued = true;
    // Prochaine image, ou au plus tard dans 60 ms (requestAnimationFrame est suspendu quand la page
    // n'est pas affichée)
    let fired = false;
    const run = (fn) => () => { if (!fired) { fired = true; fn(); } };
    const schedule = (fn) => { requestAnimationFrame(run(fn)); setTimeout(run(fn), 60); };
    schedule(() => {
      updateQueued = false;
      try {
        if (dirty.shape) {
          computeShape();
          if (!state.tear.set) resetTear();
          buildShading();
          state.halves.forEach((h) => { if (h.img && !h.placed) placeHalf(h); });
          dirty.tear = true;
          dirty.tint = true;
        }
        if (dirty.tear) {
          buildTear();
          dirty.layers.add(0).add(1);
        }
        dirty.layers.forEach((i) => renderHalf(i));
        if (dirty.tint) buildTint();
      } catch (err) {
        console.error(err);
      } finally {
        dirty.shape = false;
        dirty.tear = false;
        dirty.tint = false;
        dirty.layers.clear();
      }
      paint();
    });
  }

  const allLayers = [0, 1];

  // ---------- Rendu ----------
  function renderScene(c, k, editor) {
    const F = frameSize();
    c.save();
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, F.w, F.h);
    if (state.photo) {
      const v = view();
      c.save();
      c.translate(v.tx, v.ty);
      c.scale(v.s, v.s);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(state.photo.canvas, 0, 0);
      if (state.shape) {
        const b = state.shape.box;
        cache.layers.forEach((l) => { if (l) c.drawImage(l, b.x, b.y); });
        if (cache.tear) c.drawImage(cache.tear, b.x, b.y);
      }
      if (editor) drawOverlays(c, k * v.s);
      c.restore();
    }
    drawSiteLogo(c, F);
    c.restore();
  }

  // Repères d'édition (jamais exportés) ; « px » = pixels d'écran par pixel de la photo
  function drawOverlays(c, px) {
    const lw = 1.5 / px;
    const hr = 6 / px;
    const handle = (x, y, color = '#ff6b1f') => {
      c.beginPath();
      c.arc(x, y, hr, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
      c.lineWidth = lw * 1.4;
      c.strokeStyle = color;
      c.stroke();
    };
    if (cache.tint && (state.showZone || state.tool === 'add' || state.tool === 'erase')) c.drawImage(cache.tint, 0, 0);
    const s = state.shape;
    const h = state.halves[state.active];
    const shirtTool = state.tool === 'move' || state.tool === 'warp';
    if (s && shirtTool && h.mode === 'image' && h.img) {
      // Maillot entier en transparence pendant qu'on le déplace ou le déforme
      if (drag && (drag.type === 'move' || drag.type === 'warp')) {
        c.save();
        c.globalAlpha = 0.35;
        drawShirt(c, h);
        c.restore();
      }
      // Contour de l'image du maillot
      c.save();
      c.setLineDash([6 / px, 5 / px]);
      c.lineWidth = lw;
      c.strokeStyle = 'rgba(255, 107, 31, 0.9)';
      c.beginPath();
      const steps = 16;
      const edge = [];
      for (let q = 0; q <= steps; q++) edge.push([q / steps, 0]);
      for (let q = 0; q <= steps; q++) edge.push([1, q / steps]);
      for (let q = steps; q >= 0; q--) edge.push([q / steps, 1]);
      for (let q = steps; q >= 0; q--) edge.push([0, q / steps]);
      edge.forEach(([u, v], q) => {
        const [x, y] = halfPoint(h, u, v);
        if (q) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.stroke();
      c.restore();
      if (state.tool === 'warp') {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) handle(...halfPoint(h, i / 2, j / 2));
      }
    }
    if (s && state.tool === 'tear') {
      c.save();
      c.setLineDash([6 / px, 5 / px]);
      c.lineWidth = lw;
      c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      c.beginPath();
      c.moveTo(state.tear.top, s.top);
      c.lineTo(state.tear.bottom, s.bottom);
      c.stroke();
      c.restore();
      handle(state.tear.top, s.top);
      handle(state.tear.bottom, s.bottom);
    }
    if (state.pointer && (state.tool === 'add' || state.tool === 'erase')) {
      c.beginPath();
      c.arc(state.pointer.x, state.pointer.y, state.brush / 2, 0, Math.PI * 2);
      c.lineWidth = lw;
      c.strokeStyle = '#fff';
      c.stroke();
    }
  }

  function drawSiteLogo(c, F) {
    const site = state.site;
    if (!site) return;
    const m = F.w * SW.logo.margin;
    const bw = F.w * SW.logo.w;
    const bh = F.w * SW.logo.h;
    if (site.img) {
      let dh = bh;
      let dw = (site.img.width * bh) / site.img.height;
      if (dw > bw) {
        dw = bw;
        dh = (site.img.height * dw) / site.img.width;
      }
      c.drawImage(site.img, F.w - m - dw, m, dw, dh);
      return;
    }
    c.save();
    c.font = `800 ${Math.round(bh * 0.5)}px Inter, system-ui, sans-serif`;
    c.fillStyle = '#ffffff';
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.fillText(site.name, F.w - m, m, bw);
    c.restore();
  }

  // Taille de la zone d'image : au format choisi, sans dépasser la hauteur de l'écran
  function layoutStage() {
    const F = frameSize();
    els.stage.style.aspectRatio = `${F.w} / ${F.h}`;
    els.stage.style.width = `min(100%, calc((100vh - 210px) * ${F.w / F.h}))`;
  }

  function paint() {
    const r = els.canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (els.canvas.width !== w || els.canvas.height !== h) {
      els.canvas.width = w;
      els.canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!state.photo) return;
    renderScene(ctx, w / frameSize().w, true);
  }

  // ---------- Interface ----------
  function setBusy(text, frac = null) {
    state.detect.text = text;
    state.detect.frac = frac;
    refreshUI();
  }

  function refreshUI() {
    const hasPhoto = !!state.photo;
    els.emptyDrop.hidden = hasPhoto;
    els.stageBusy.hidden = !state.detect.busy;
    els.stageBusyText.textContent = state.detect.text;
    els.detectProgress.hidden = !state.detect.busy;
    els.detectProgress.classList.toggle('is-indeterminate', state.detect.frac == null);
    els.detectBar.style.width = state.detect.frac == null ? '' : `${Math.round(state.detect.frac * 100)}%`;
    els.redetectBtn.hidden = !hasPhoto || state.detect.busy;
    els.engineSelect.disabled = state.detect.busy;
    els.photoThumb.hidden = !hasPhoto;
    if (hasPhoto && els.photoThumb.dataset.src !== String(state.photo.id)) {
      els.photoThumb.src = state.photo.canvas.toDataURL('image/jpeg', 0.6);
      els.photoThumb.dataset.src = String(state.photo.id);
    }
    els.photoDropText.textContent = hasPhoto ? state.photo.name : t('swap.photoDrop');

    els.toolBar.querySelectorAll('button[data-tool]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool));
      b.disabled = !hasPhoto || (b.dataset.tool === 'frame' && currentFormat().id === 'original');
    });
    els.canvas.style.cursor = { move: 'move', warp: 'default', add: 'crosshair', erase: 'crosshair', tear: 'ew-resize', frame: 'grab' }[state.tool];
    els.keys.innerHTML = t(`swap.keys.${state.tool}`);

    els.brushSize.value = state.brush;
    els.brushSizeOut.textContent = `${state.brush} px`;
    els.showZone.checked = state.showZone;
    els.tearWidth.value = state.tear.width;
    els.tearWidthOut.textContent = `${state.tear.width} %`;
    els.resetZoneBtn.disabled = !state.autoMask;
    els.newTearBtn.disabled = !state.shape;
    els.lightRange.value = state.light;
    els.lightOut.textContent = `${state.light} %`;
    els.foldsRange.value = state.folds;
    els.foldsOut.textContent = `${state.folds} %`;
    els.logoLight.checked = state.logoLight;

    state.halves.forEach((h, i) => {
      const card = cards[i];
      card.root.classList.toggle('is-active', state.active === i);
      card.label.textContent = t(i ? 'swap.right' : 'swap.left');
      card.badge.textContent = state.active === i ? t('swap.selected') : '';
      card.badge.hidden = state.active !== i;
      card.mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === h.mode)));
      card.body.hidden = h.mode !== 'image';
      card.thumb.hidden = !h.img;
      if (h.img && card.thumb.dataset.v !== h.name + h.removeBg) {
        card.thumb.src = h.img.toDataURL('image/png');
        card.thumb.dataset.v = h.name + h.removeBg;
      }
      card.dropText.textContent = h.img ? h.name : t('swap.shirtDrop');
      card.removeBg.checked = h.removeBg;
      card.zoom.value = h.zoom;
      card.zoomOut.textContent = `${Math.round(h.zoom)} %`;
      card.rot.value = h.rot;
      card.rotOut.textContent = `${num(h.rot, 1)}°`;
      card.bright.value = h.bright;
      card.brightOut.textContent = h.bright > 0 ? `+${h.bright}` : String(h.bright);
      [card.zoom, card.rot, card.bright, card.recenter].forEach((el) => { el.disabled = !h.img; });
      card.unwarp.disabled = !h.img || !isWarped(h);
    });

    // Menu des formats : reconstruit seulement quand ses libellés changent (photo, langue)
    const fmt = currentFormat();
    const labels = SW.formats.map((f) => {
      if (f.id !== 'original') return `${f.label} · ${f.width} × ${f.height} px`;
      if (!state.photo) return t('swap.formatOriginalNone');
      const p = state.photo;
      return p.w < p.orig.w ? t('swap.formatOriginalReduced', { w: p.w, h: p.h, ow: p.orig.w, oh: p.orig.h })
        : t('swap.formatOriginal', { w: p.w, h: p.h });
    });
    if (els.formatChoice.dataset.labels !== labels.join('|')) {
      els.formatChoice.replaceChildren(...SW.formats.map((f, i) => new Option(labels[i], f.id)));
      els.formatChoice.dataset.labels = labels.join('|');
    }
    els.formatChoice.value = fmt.id;
    const framed = fmt.id !== 'original';
    els.zoomField.hidden = !framed;
    els.frameNote.hidden = !framed;
    els.zoomRange.value = frameOf().zoom;
    els.zoomOut.textContent = `${frameOf().zoom} %`;

    els.previewBtn.disabled = !hasPhoto || state.detect.busy;
    els.previewBtn.title = hasPhoto ? '' : t('swap.disabledTitle');
    let status = t('swap.statusStart');
    if (state.detect.busy) status = state.detect.text;
    else if (hasPhoto && !state.shape) status = t('swap.statusNoZone');
    else if (hasPhoto) status = state.halves.some((h) => h.mode === 'image' && h.img) ? t('swap.statusEdit') : t('swap.statusReady');
    els.status.textContent = status;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove('show'), 3600);
  }

  function setTool(tool) {
    if (!TOOLS.includes(tool)) return;
    state.tool = tool;
    refreshUI();
    paint();
  }

  // ---------- Cartes des deux moitiés ----------
  function buildCards() {
    const tpl = $('#halfTpl');
    [0, 1].forEach((i) => {
      const root = tpl.content.firstElementChild.cloneNode(true);
      const q = (role) => root.querySelector(`[data-role="${role}"]`);
      const card = {
        root,
        label: q('label'),
        badge: q('badge'),
        mode: q('mode'),
        body: q('body'),
        drop: q('drop'),
        file: q('file'),
        thumb: q('thumb'),
        dropText: q('dropText'),
        removeBg: q('removeBg'),
        zoom: q('zoom'),
        zoomOut: q('zoomOut'),
        rot: q('rot'),
        rotOut: q('rotOut'),
        bright: q('bright'),
        brightOut: q('brightOut'),
        recenter: q('recenter'),
        unwarp: q('unwarp'),
      };
      cards.push(card);
      els.halves.append(root);
      const h = () => state.halves[i];
      root.addEventListener('pointerdown', () => {
        if (state.active === i) return;
        state.active = i;
        refreshUI();
        paint();
      });
      card.mode.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-mode]');
        if (!b) return;
        h().mode = b.dataset.mode;
        state.active = i;
        if (h().mode === 'image' && !h().img) card.file.click();
        invalidate({ layers: [i] });
        refreshUI();
      });
      card.file.addEventListener('change', () => {
        if (card.file.files[0]) setShirt(i, card.file.files[0]);
        card.file.value = '';
      });
      bindDrop(card.drop, (file) => setShirt(i, file));
      card.removeBg.addEventListener('change', () => {
        h().removeBg = card.removeBg.checked;
        prepareShirt(h());
        invalidate({ layers: [i] });
        refreshUI();
      });
      card.zoom.addEventListener('input', () => { h().zoom = Number(card.zoom.value); changedHalf(i); });
      card.rot.addEventListener('input', () => { h().rot = Number(card.rot.value); changedHalf(i); });
      card.bright.addEventListener('input', () => { h().bright = Number(card.bright.value); changedHalf(i); });
      card.recenter.addEventListener('click', () => { placeHalf(h()); changedHalf(i); });
      card.unwarp.addEventListener('click', () => { h().mesh = Array.from({ length: 9 }, () => [0, 0]); changedHalf(i); });
    });
  }

  function changedHalf(i) {
    invalidate({ layers: [i] });
    refreshUI();
  }

  async function setShirt(i, file) {
    if (!file || !file.type.startsWith('image/')) { toast(t('toast.notImage')); return; }
    let loaded;
    try {
      loaded = await fileToCanvas(file, SHIRT_MAX);
    } catch {
      toast(t('toast.unreadable'));
      return;
    }
    const h = state.halves[i];
    h.source = loaded.canvas;
    h.name = file.name;
    h.mode = 'image';
    prepareShirt(h);
    h.placed = false;
    h.bright = 0;
    placeHalf(h);
    state.active = i;
    if (!['move', 'warp'].includes(state.tool)) state.tool = 'move';
    invalidate({ layers: [i] });
    refreshUI();
  }

  // ---------- Photo et détection ----------
  async function setPhoto(file) {
    if (!file || !file.type.startsWith('image/')) { toast(t('toast.notImage')); return; }
    let loaded;
    try {
      loaded = await fileToCanvas(file, WORK_MAX);
    } catch {
      toast(t('toast.unreadable'));
      return;
    }
    detectToken++;
    state.tear.set = false;
    state.photo = {
      id: Date.now(),
      canvas: loaded.canvas,
      w: loaded.canvas.width,
      h: loaded.canvas.height,
      orig: { w: loaded.w, h: loaded.h },
      name: file.name,
    };
    state.mask = makeCanvas(state.photo.w, state.photo.h);
    state.autoMask = null;
    state.shape = null;
    state.frames = {};
    state.halves.forEach((h) => { h.placed = false; });
    cache.layers = [null, null];
    cache.tear = null;
    layoutStage();
    invalidate({ shape: true, tint: true });
    refreshUI();
    detect();
  }

  let engine = null; // module Transformers.js
  let segmenter = null; // { precision, pipe }

  async function getSegmenter(precision) {
    if (!engine) engine = await import(SW.engineUrl);
    engine.env.allowLocalModels = false;
    if (segmenter && segmenter.precision === precision) return segmenter.pipe;
    // Progression du téléchargement du modèle (premier usage), tous fichiers confondus
    const files = new Map();
    const progress = (e) => {
      if (e.status !== 'progress' || !e.total) return;
      files.set(e.file, [e.loaded, e.total]);
      let loaded = 0;
      let total = 0;
      files.forEach(([l, tt]) => { loaded += l; total += tt; });
      setBusy(t('swap.loadingModel', { p: `${Math.round((loaded / total) * 100)} %` }), loaded / total);
    };
    const opts = { progress_callback: progress };
    let pipe = null;
    // Haute précision sur la carte graphique quand elle est disponible, sinon processeur (modèle allégé en standard)
    if (precision === 'high' && 'gpu' in navigator) {
      try { pipe = await engine.pipeline('image-segmentation', SW.model, { ...opts, device: 'webgpu', dtype: 'fp32' }); } catch { pipe = null; }
    }
    if (!pipe) pipe = await engine.pipeline('image-segmentation', SW.model, { ...opts, device: 'wasm', dtype: precision === 'high' ? 'fp32' : 'q8' });
    segmenter = { precision, pipe };
    return pipe;
  }

  async function detect() {
    if (!state.photo) return;
    const token = ++detectToken;
    const started = performance.now();
    state.detect.busy = true;
    setBusy(t('swap.loadingModel', { p: '' }));
    try {
      const pipe = await getSegmenter(els.engineSelect.value);
      if (token !== detectToken) return;
      setBusy(t('swap.analyzing'));
      await new Promise((r) => setTimeout(r, 30));
      const p = state.photo;
      const k = Math.min(1, DETECT_MAX / Math.max(p.w, p.h));
      const small = makeCanvas(p.w * k, p.h * k);
      small.getContext('2d').drawImage(p.canvas, 0, 0, small.width, small.height);
      const image = await engine.RawImage.fromBlob(await canvasToBlob(small, 'image/png'));
      const out = await pipe(image);
      if (token !== detectToken) return;
      const hits = out.filter((o) => SW.shirtLabels.includes(o.label)).map((o) => o.mask);
      const mask = hits.length ? maskFromSegmentation(hits) : null;
      state.detect.busy = false;
      if (!mask) {
        state.autoMask = null;
        state.tool = 'add';
        toast(t('swap.noShirt'));
      } else {
        state.autoMask = mask;
        state.mask = makeCanvas(p.w, p.h);
        state.mask.getContext('2d').drawImage(mask, 0, 0);
        state.halves.forEach((h) => { h.placed = false; });
        computeShape();
        resetTear();
        toast(t('swap.detected', { s: num((performance.now() - started) / 1000, 1) }));
      }
      invalidate({ shape: true, tint: true });
    } catch (err) {
      if (token !== detectToken) return;
      state.detect.busy = false;
      state.tool = 'add';
      toast(t('swap.detectFailed', { msg: err.message || err }));
    }
    refreshUI();
    paint();
  }

  // Masque du maillot : zones du modèle retenues (SW.shirtLabels) réunies, réduites à la plus grande zone
  // d'un seul tenant (écarte les maillots du public), agrandies à la taille de la photo, bord net mais adouci
  function maskFromSegmentation(masks) {
    const w = masks[0].width;
    const h = masks[0].height;
    const on = new Uint8Array(w * h);
    masks.forEach((raw) => {
      const ch = raw.channels || 1;
      for (let i = 0; i < w * h; i++) if (raw.data[i * ch] > 127) on[i] = 1;
    });
    const label = new Int32Array(w * h).fill(-1);
    const sizes = [];
    for (let i = 0; i < w * h; i++) {
      if (!on[i] || label[i] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [i];
      label[i] = id;
      while (stack.length) {
        const j = stack.pop();
        size++;
        const x = j % w;
        const next = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w];
        for (const q of next) {
          if (q < 0 || q >= w * h || !on[q] || label[q] >= 0) continue;
          label[q] = id;
          stack.push(q);
        }
      }
      sizes.push(size);
    }
    if (!sizes.length) return null;
    const biggest = Math.max(...sizes);
    if (biggest < w * h * 0.002) return null;
    const small = makeCanvas(w, h);
    const sx = small.getContext('2d');
    const img = sx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const keep = label[i] >= 0 && sizes[label[i]] >= biggest * 0.15;
      img.data.set([255, 255, 255, keep ? 255 : 0], i * 4);
    }
    sx.putImageData(img, 0, 0);
    const p = state.photo;
    const out = makeCanvas(p.w, p.h);
    const ox = readCtx(out);
    ox.imageSmoothingEnabled = true;
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(small, 0, 0, p.w, p.h);
    // L'agrandissement étale le bord : on le resserre sur 2 à 3 px
    const big = ox.getImageData(0, 0, p.w, p.h);
    const d = big.data;
    for (let i = 3; i < d.length; i += 4) d[i] = clamp(((d[i] - 80) * 255) / 100, 0, 255);
    ox.putImageData(big, 0, 0);
    return out;
  }

  // Déchirure au centre du maillot (centre de gravité de la zone), verticale
  function resetTear() {
    const s = state.shape;
    if (!s) return;
    state.tear.top = s.cx;
    state.tear.bottom = s.cx;
    state.tear.set = true;
  }

  function resetAll() {
    detectToken++;
    state.photo = null;
    state.mask = null;
    state.autoMask = null;
    state.shape = null;
    state.detect.busy = false;
    state.halves.forEach((h) => { h.placed = false; });
    cache.layers = [null, null];
    cache.tear = null;
    cache.tint = null;
    els.photoThumb.dataset.src = '';
    layoutStage();
    refreshUI();
    paint();
  }

  // ---------- Pinceau de zone ----------
  function stamp(x, y) {
    const c = state.mask.getContext('2d');
    const r = state.brush / 2;
    const g = c.createRadialGradient(x, y, r * 0.55, x, y, r);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.globalCompositeOperation = state.tool === 'erase' ? 'destination-out' : 'source-over';
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }

  function strokeTo(x, y) {
    const last = drag.last;
    const dist = Math.hypot(x - last.x, y - last.y);
    const stepLen = Math.max(1, state.brush * 0.2);
    const steps = Math.ceil(dist / stepLen);
    for (let s = 1; s <= steps; s++) stamp(lerp(last.x, x, s / steps), lerp(last.y, y, s / steps));
    drag.last = { x, y };
  }

  // ---------- Pointeur ----------
  function toPhoto(e) {
    const r = els.canvas.getBoundingClientRect();
    const F = frameSize();
    const v = view();
    const fx = ((e.clientX - r.left) * F.w) / r.width;
    const fy = ((e.clientY - r.top) * F.h) / r.height;
    return { x: (fx - v.tx) / v.s, y: (fy - v.ty) / v.s, fx, fy, px: (r.width / F.w) * v.s };
  }

  const near = (pt, x, y, radius) => Math.hypot(pt.x - x, pt.y - y) <= radius;

  // Moitié sous le pointeur (côté de la déchirure), si elle a un maillot importé
  function halfAt(pt) {
    if (!state.shape) return -1;
    const i = pt.x < tearXAt(pt.y) ? 0 : 1;
    const h = state.halves[i];
    return h.mode === 'image' && h.img ? i : -1;
  }

  function onPointerDown(e) {
    if (!state.photo || state.detect.busy) return;
    const pt = toPhoto(e);
    const radius = 12 / pt.px;
    const tool = state.tool;
    if (tool === 'move' || tool === 'warp') {
      const h = state.halves[state.active];
      if (tool === 'warp' && h.mode === 'image' && h.img) {
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const [hx, hy] = halfPoint(h, i / 2, j / 2);
            if (near(pt, hx, hy, radius)) {
              const m = h.mesh[j * 3 + i];
              drag = { type: 'warp', i: state.active, k: j * 3 + i, sx: pt.x, sy: pt.y, ox: m[0], oy: m[1] };
              break;
            }
          }
          if (drag) break;
        }
      }
      if (!drag) {
        const under = halfAt(pt);
        if (under >= 0) state.active = under;
        const target = state.halves[state.active];
        if (!(target.mode === 'image' && target.img)) {
          toast(t('swap.needShirt'));
          refreshUI();
          return;
        }
        if (tool === 'move') drag = { type: 'move', i: state.active, sx: pt.x, sy: pt.y, x0: target.x, y0: target.y };
        refreshUI();
      }
    } else if (tool === 'add' || tool === 'erase') {
      drag = { type: 'brush', last: { x: pt.x, y: pt.y } };
      stamp(pt.x, pt.y);
      buildTint();
    } else if (tool === 'tear') {
      if (!state.shape) return;
      const s = state.shape;
      let which = 'both';
      if (near(pt, state.tear.top, s.top, radius)) which = 'top';
      else if (near(pt, state.tear.bottom, s.bottom, radius)) which = 'bottom';
      drag = { type: 'tear', which, sx: pt.x, top: state.tear.top, bottom: state.tear.bottom };
    } else if (tool === 'frame') {
      if (currentFormat().id === 'original') return;
      const v = view();
      drag = { type: 'frame', fx: pt.fx, fy: pt.fy, cx: v.cx, cy: v.cy, s: v.s };
      els.canvas.style.cursor = 'grabbing';
    }
    if (drag) els.canvas.setPointerCapture(e.pointerId);
    paint();
  }

  function onPointerMove(e) {
    if (!state.photo) return;
    const pt = toPhoto(e);
    state.pointer = { x: pt.x, y: pt.y };
    if (!drag) {
      if (state.tool === 'add' || state.tool === 'erase') paint();
      return;
    }
    if (drag.type === 'move') {
      const h = state.halves[drag.i];
      h.x = drag.x0 + (pt.x - drag.sx);
      h.y = drag.y0 + (pt.y - drag.sy);
      invalidate({ layers: [drag.i] });
    } else if (drag.type === 'warp') {
      const h = state.halves[drag.i];
      h.mesh[drag.k] = [drag.ox + (pt.x - drag.sx), drag.oy + (pt.y - drag.sy)];
      invalidate({ layers: [drag.i] });
    } else if (drag.type === 'brush') {
      strokeTo(pt.x, pt.y);
      buildTint();
      paint();
    } else if (drag.type === 'tear') {
      const dx = pt.x - drag.sx;
      if (drag.which !== 'bottom') state.tear.top = drag.top + dx;
      if (drag.which !== 'top') state.tear.bottom = drag.bottom + dx;
      invalidate({ tear: true });
    } else if (drag.type === 'frame') {
      const fr = frameOf();
      fr.cx = drag.cx - (pt.fx - drag.fx) / drag.s;
      fr.cy = drag.cy - (pt.fy - drag.fy) / drag.s;
      paint();
    }
  }

  function onPointerUp() {
    if (!drag) return;
    const done = drag;
    drag = null;
    if (done.type === 'brush') invalidate({ shape: true, tint: true });
    if (done.type === 'frame') {
      // Garde le cadrage dans les limites de la photo
      const v = view();
      Object.assign(frameOf(), { cx: v.cx, cy: v.cy });
    }
    refreshUI();
    paint();
  }

  function onWheel(e) {
    if (!state.photo) return;
    const dir = e.deltaY < 0 ? 1 : -1;
    if (state.tool === 'move') {
      const h = state.halves[state.active];
      if (!(h.mode === 'image' && h.img)) return;
      e.preventDefault();
      h.zoom = clamp(Math.round(h.zoom * (1 + dir * 0.03)), 40, 250);
      changedHalf(state.active);
    } else if (state.tool === 'frame' && currentFormat().id !== 'original') {
      e.preventDefault();
      const fr = frameOf();
      fr.zoom = clamp(fr.zoom + dir * 5, 100, 300);
      refreshUI();
      paint();
    } else if (state.tool === 'add' || state.tool === 'erase') {
      e.preventDefault();
      setBrush(state.brush + dir * 4);
    }
  }

  function onKey(e) {
    if (state.tool !== 'move' || !state.photo) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const h = state.halves[state.active];
    if (!d || !(h.mode === 'image' && h.img)) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    h.x += d[0] * step;
    h.y += d[1] * step;
    changedHalf(state.active);
  }

  function setBrush(v) {
    state.brush = clamp(Math.round(v), 6, 200);
    prefs.set('swap:brush', state.brush);
    refreshUI();
    paint();
  }

  // ---------- Site ----------
  function populateSites() {
    const options = CFG.sites.map((s) => new Option(s.name, s.id));
    options.unshift(new Option(t('player.noLogo'), ''));
    els.siteSelect.replaceChildren(...options);
    els.siteSelect.value = state.site ? state.site.id : '';
  }

  async function selectSite(id) {
    const token = ++siteToken;
    const site = CFG.sites.find((s) => s.id === id) || null;
    let img = null;
    if (site && site.logo) {
      try {
        img = trimTransparent(await loadImage((state.logoLight && site.logoOnDark) || site.logo));
      } catch { img = null; }
    }
    if (token !== siteToken) return;
    state.site = site ? { ...site, img } : null;
    els.siteSelect.value = site ? site.id : '';
    prefs.set('swap:site', site ? site.id : '');
    paint();
  }

  // ---------- Aperçu & export ----------
  async function renderPreview() {
    const F = frameSize();
    const c = makeCanvas(F.w, F.h);
    renderScene(c.getContext('2d'), 1, false);
    const fmt = els.formatSelect.value;
    let blob;
    try {
      blob = await canvasToBlob(c, MIME[fmt], QUALITY);
    } catch (err) {
      preview.blob = null;
      els.previewImg.setAttribute('src', '');
      els.previewError.hidden = false;
      els.previewError.textContent = err.name === 'SecurityError' ? t('export.blocked') : t('export.failed', { msg: err.message });
      els.downloadBtn.disabled = true;
      els.previewMeta.textContent = '';
      return;
    }
    if (preview.url) URL.revokeObjectURL(preview.url);
    preview.blob = blob;
    preview.url = URL.createObjectURL(blob);
    els.previewError.hidden = true;
    els.previewImg.setAttribute('src', preview.url);
    els.extLabel.textContent = EXT[blob.type] || '.png';
    els.downloadBtn.disabled = false;
    const fallback = blob.type !== MIME[fmt] ? t('export.webpFallback') : '';
    els.previewMeta.textContent = `${F.w} × ${F.h} px · ${formatSize(blob.size)}${fallback}`;
  }

  async function openPreview() {
    if (!state.photo || state.detect.busy) return;
    const fmt = currentFormat();
    els.filenameInput.value = [
      SW.filePrefix,
      slugify(state.photo.name.replace(/\.[^.]+$/, '')),
      state.site && state.site.id,
      fmt.id !== 'original' && fmt.id,
    ].filter(Boolean).join('-');
    els.previewImg.setAttribute('src', '');
    els.dialog.showModal();
    await renderPreview();
  }

  function download() {
    if (!preview.blob) return;
    const name = (slugify(els.filenameInput.value) || SW.filePrefix) + (EXT[preview.blob.type] || '.png');
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    toast(t('toast.downloaded', { name }));
  }

  // ---------- Événements ----------
  function bindDrop(el, onFile) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('is-over');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  }

  function bindEvents() {
    els.toolBar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tool]');
      if (b && !b.disabled) setTool(b.dataset.tool);
    });
    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerup', onPointerUp);
    els.canvas.addEventListener('pointercancel', onPointerUp);
    els.canvas.addEventListener('pointerleave', () => { state.pointer = null; if (!drag) paint(); });
    els.canvas.addEventListener('wheel', onWheel, { passive: false });
    els.canvas.addEventListener('keydown', onKey);

    els.photoFile.addEventListener('change', () => { if (els.photoFile.files[0]) setPhoto(els.photoFile.files[0]); els.photoFile.value = ''; });
    els.photoFileStage.addEventListener('change', () => { if (els.photoFileStage.files[0]) setPhoto(els.photoFileStage.files[0]); els.photoFileStage.value = ''; });
    bindDrop(els.photoDrop, setPhoto);
    bindDrop(els.stage, setPhoto);
    els.redetectBtn.addEventListener('click', detect);
    els.engineSelect.value = prefs.get('swap:engine', 'standard');
    els.engineSelect.addEventListener('change', () => {
      prefs.set('swap:engine', els.engineSelect.value);
      if (state.photo) detect();
    });
    els.resetBtn.addEventListener('click', resetAll);

    els.brushSize.addEventListener('input', () => setBrush(Number(els.brushSize.value)));
    els.showZone.addEventListener('change', () => { state.showZone = els.showZone.checked; paint(); });
    els.tearWidth.addEventListener('input', () => {
      state.tear.width = Number(els.tearWidth.value);
      prefs.set('swap:tearWidth', state.tear.width);
      invalidate({ tear: true });
      refreshUI();
    });
    els.newTearBtn.addEventListener('click', () => {
      state.tear.seed = Math.floor(Math.random() * 1e6);
      invalidate({ tear: true });
    });
    els.resetZoneBtn.addEventListener('click', () => {
      if (!state.autoMask) return;
      const c = state.mask.getContext('2d');
      c.globalCompositeOperation = 'copy';
      c.drawImage(state.autoMask, 0, 0);
      c.globalCompositeOperation = 'source-over';
      invalidate({ shape: true, tint: true });
    });
    els.lightRange.addEventListener('input', () => {
      state.light = Number(els.lightRange.value);
      prefs.set('swap:light', state.light);
      invalidate({ layers: allLayers });
      refreshUI();
    });
    els.foldsRange.addEventListener('input', () => {
      state.folds = Number(els.foldsRange.value);
      prefs.set('swap:folds', state.folds);
      invalidate({ layers: allLayers });
      refreshUI();
    });

    els.siteSelect.addEventListener('change', () => selectSite(els.siteSelect.value));
    els.logoLight.addEventListener('change', () => {
      state.logoLight = els.logoLight.checked;
      prefs.set('swap:logoLight', state.logoLight);
      selectSite(state.site ? state.site.id : '');
    });

    els.formatChoice.addEventListener('change', () => {
      state.format = els.formatChoice.value;
      prefs.set('swap:format', state.format);
      if (state.tool === 'frame' && currentFormat().id === 'original') state.tool = 'move';
      layoutStage();
      refreshUI();
      paint();
    });
    els.zoomRange.addEventListener('input', () => {
      frameOf().zoom = Number(els.zoomRange.value);
      refreshUI();
      paint();
    });

    els.previewBtn.addEventListener('click', openPreview);
    els.downloadBtn.addEventListener('click', download);
    els.formatSelect.value = prefs.get('format', 'jpeg');
    els.formatSelect.addEventListener('change', () => {
      prefs.set('format', els.formatSelect.value);
      if (els.dialog.open) renderPreview();
    });
    els.dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => els.dialog.close()));

    Object.entries(I18N.languages).forEach(([code, label]) => els.langSelect.append(new Option(label, code)));
    els.langSelect.value = lang;
    els.langSelect.addEventListener('change', () => {
      lang = I18N.dict[els.langSelect.value] ? els.langSelect.value : 'fr';
      prefs.set('lang', lang);
      document.documentElement.lang = lang;
      applyStaticTexts();
      populateSites();
      refreshUI();
    });

    new ResizeObserver(() => paint()).observe(els.stage);
  }

  // ---------- Démarrage ----------
  buildCards();
  document.documentElement.lang = lang;
  applyStaticTexts();
  bindEvents();
  populateSites();
  layoutStage();
  refreshUI();
  selectSite(prefs.get('swap:site', ''));

  // Exposé pour le débogage dans la console.
  window.SwapStudio = { state, cache, setPhoto, setShirt, detect, invalidate, paint };
})();

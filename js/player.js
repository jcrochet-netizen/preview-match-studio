/* Preview Match Studio — pages « photo joueur » : photo(s) de joueur détourée(s) par IA et posée(s) sur un template.
   La mise en page vient de <body data-layout="…"> et de playerLayouts (js/config.js) : joueurs placés
   librement (player.html, player2.html) ou cases fixes (ballondor.html). */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const I18N = window.APP_I18N;
  const W = CFG.width;
  const H = CFG.height;
  const SPORT = 'nba';
  const LAYOUT_ID = CFG.playerLayouts[document.body.dataset.layout] ? document.body.dataset.layout : 'player';
  const LAYOUT = CFG.playerLayouts[LAYOUT_ID];
  const SLOTS = LAYOUT.slots || null; // cases fixes : chaque joueur est posé sur le sol de sa case
  const COUNT = SLOTS ? SLOTS.length : Math.min(2, Math.max(1, LAYOUT.players || 1));
  const OPTIONAL_LOGO = LAYOUT.siteLogo === 'optional';
  const TITLE = LAYOUT.title || null; // titre facultatif (page Ballon d'Or)
  const NAME_SIZE = 28; // taille des noms sous les cases (réduite si le nom est plus large que la case)
  // Moteur de détourage : IMG.LY Background Removal (licence AGPL), exécuté dans le navigateur.
  // Le modèle est téléchargé depuis le CDN d'IMG.LY au premier usage, puis gardé en cache.
  const ENGINE_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
  const PHOTO_MAX = 2400; // photos plus grandes réduites avant détourage (plus rapide, même rendu)
  const CUTOUT_MAX = 2000;
  const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
  const EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
  const QUALITY = 0.92;
  const SNAP = 10;
  // Position horizontale (centre du joueur) des boutons « À gauche / Au centre / À droite »
  const ANCHORS = { left: 330, center: W / 2, right: W - 330 };
  // Position de départ de chaque joueur, et largeur maximale à 100 % (en part de l'image)
  const START = COUNT === 1 ? ['left'] : ['left', 'right'];
  const MAX_WIDTH = COUNT === 1 ? 0.6 : 0.45;
  const startX = (i) => (SLOTS ? SLOTS[i].x : ANCHORS[START[i]]);
  const floorY = (i) => (SLOTS ? SLOTS[i].floor : H);

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const slugify = (str) => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).join('-');

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
      img.src = src;
    });
  }

  async function loadBlobImage(blob) {
    const url = URL.createObjectURL(blob);
    try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
  }

  const imgSize = (img) => ({ w: img.naturalWidth || img.width || 512, h: img.naturalHeight || img.height || 512 });

  const canvasToBlob = (c, type, quality) => new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('export vide'))), type, quality);
  });

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  // Recadre une image sur ses pixels non transparents (le détourage garde la taille de la photo).
  function trimTransparent(img, max) {
    const { w, h } = imgSize(img);
    const probe = Math.min(1, 800 / Math.max(w, h));
    const pw = Math.max(1, Math.round(w * probe));
    const ph = Math.max(1, Math.round(h * probe));
    const pc = document.createElement('canvas');
    pc.width = pw;
    pc.height = ph;
    const px = pc.getContext('2d', { willReadFrequently: true });
    px.drawImage(img, 0, 0, pw, ph);
    const data = px.getImageData(0, 0, pw, ph).data;
    let minX = pw;
    let minY = ph;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        if (data[(y * pw + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // rien de détouré
    const sx = Math.max(0, (minX - 1) / probe);
    const sy = Math.max(0, (minY - 1) / probe);
    const sw = Math.min(w, (maxX + 2) / probe) - sx;
    const sh = Math.min(h, (maxY + 2) / probe) - sy;
    const out = Math.min(1, max / Math.max(sw, sh));
    const oc = document.createElement('canvas');
    oc.width = Math.max(1, Math.round(sw * out));
    oc.height = Math.max(1, Math.round(sh * out));
    const ox = oc.getContext('2d');
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(img, sx, sy, sw, sh, 0, 0, oc.width, oc.height);
    return oc;
  }

  // Rend opaques les zones que le modèle a laissées semi-transparentes à l'intérieur du joueur
  // (ex. maillot jaune sur parquet jaune). Les bords fins (cheveux) gardent leur dégradé.
  function hardenAlpha(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height);
    const p = img.data;
    const lo = 0.06 * 255;
    const hi = 0.45 * 255;
    for (let i = 3; i < p.length; i += 4) p[i] = clamp(Math.round(((p[i] - lo) / (hi - lo)) * 255), 0, 255);
    x.putImageData(img, 0, 0);
    return c;
  }

  // Rogne le contour du joueur de « radius » pixels, en douceur (bord adouci sur ~1,5 px) :
  // supprime le liseré de fond et les mèches fantômes laissés par le modèle. Les bords de la photo
  // (joueur coupé par le cadre, en bas) ne sont pas rognés.
  function erodeAlpha(src, radius) {
    const w = src.width;
    const h = src.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, w, h);
    const p = img.data;
    // Distance de chaque pixel au fond le plus proche (transformée de distance en deux passes)
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = p[i * 4 + 3] < 128 ? 0 : 1e9;
    const D = Math.SQRT2;
    for (let y = 0; y < h; y++) {
      for (let col = 0; col < w; col++) {
        const i = y * w + col;
        let v = d[i];
        if (!v) continue;
        if (col > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - w] + 1);
          if (col > 0) v = Math.min(v, d[i - w - 1] + D);
          if (col < w - 1) v = Math.min(v, d[i - w + 1] + D);
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let col = w - 1; col >= 0; col--) {
        const i = y * w + col;
        let v = d[i];
        if (!v) continue;
        if (col < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 1);
          if (col < w - 1) v = Math.min(v, d[i + w + 1] + D);
          if (col > 0) v = Math.min(v, d[i + w - 1] + D);
        }
        d[i] = v;
      }
    }
    for (let i = 0; i < d.length; i++) p[i * 4 + 3] = Math.round(p[i * 4 + 3] * clamp((d[i] - radius + 0.5) / 1.5, 0, 1));
    x.putImageData(img, 0, 0);
    return c;
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

  // ---------- Langue (mêmes textes et même choix de langue que le dashboard) ----------
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

  const pct = (scale) => `${Math.round(scale * 100)}${lang === 'fr' ? ' ' : ''}%`;
  const num = (n, digits) => n.toLocaleString(lang, { maximumFractionDigits: digits });
  // Les nombres sont formatés dans la langue affichée (4,4 s en français, 4.4 s en anglais)
  const localParams = (params = {}) => Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, typeof v === 'number' ? num(v, 1) : v]),
  );
  const formatSize = (bytes) => (bytes < 1048576
    ? t('size.kb', { n: num(Math.round(bytes / 1024), 0) })
    : t('size.mb', { n: num(bytes / 1048576, 1) }));
  // Clé propre à la page quand elle existe (« player2.xxx », « ballondor.xxx »), sinon « player.xxx »
  const pageKey = (key) => (I18N.dict.fr[`${LAYOUT_ID}.${key}`] ? `${LAYOUT_ID}.${key}` : `player.${key}`);
  const playerLabel = (i) => (COUNT === 1 ? t('player.single') : t('player.slot', { n: i + 1 }));
  const SIDE_KEYS = { left: 'team.left', center: 'player.middle', right: 'team.right' };
  function sideText(i) {
    if (SLOTS) return SLOTS[i].side ? t(SIDE_KEYS[SLOTS[i].side]) : '';
    return COUNT === 2 ? t(SIDE_KEYS[START[i]]) : '';
  }

  // ---------- État ----------
  const makePlayer = (i) => ({
    index: i,
    photo: null, // { file, name, url }
    rawCutout: null, // canvas du joueur détouré et recadré, tel que rendu par le modèle
    cutout: null, // version affichée (renforcée ou non)
    placed: false, // position déjà choisie pour cette photo
    x: startX(i), // centre horizontal
    y: floorY(i), // bas du joueur
    scale: 1,
    flip: false,
    name: '', // nom affiché sous la case (cases fixes)
    trim: prefs.get('player:trim', 2), // pixels rognés sur le contour (image finale, joueur à 100 %)
    busy: false,
    queued: false,
    progress: null, // { frac, text }
    message: null, // { key, params, warn } : traduit à l'affichage
    token: 0,
  });

  const state = {
    site: null,
    template: null,
    players: Array.from({ length: COUNT }, (_, i) => makePlayer(i)),
    selected: -1,
    hover: -1,
    shadow: prefs.get('player:shadow', true),
    harden: prefs.get('player:harden', true),
    clip: prefs.get(`${LAYOUT_ID}:clip`, true), // cases fixes : joueur découpé au contour de sa case
    // Titre : texte, taille, couleur, police et position (centre du texte), mémorisés
    title: TITLE ? {
      text: '', size: TITLE.size, color: TITLE.color, font: 'inter', x: TITLE.x, y: TITLE.y,
      ...prefs.get(`${LAYOUT_ID}:title`, {}),
    } : null,
    titleSelected: false,
    titleHover: false,
    guides: [],
  };
  let titleBox = null; // cadre du titre, calculé au dernier rendu (sélection et déplacement)
  let drag = null;
  let siteToken = 0;
  let queue = Promise.resolve(); // les détourages passent l'un après l'autre
  const preview = { url: '', blob: null };

  const els = {
    stage: $('#stage'),
    canvas: $('#editor'),
    stageBusy: $('#stageBusy'),
    stageBusyText: $('#stageBusyText'),
    status: $('#statusText'),
    langSelect: $('#langSelect'),
    resetBtn: $('#resetBtn'),
    siteSelect: $('#siteSelect'),
    players: $('#players'),
    engineSelect: $('#engineSelect'),
    hardenToggle: $('#hardenToggle'),
    shadowToggle: $('#shadowToggle'),
    clipToggle: $('#clipToggle'),
    titleText: $('#titleText'),
    titleSize: $('#titleSize'),
    titleSizeOut: $('#titleSizeOut'),
    titleColor: $('#titleColor'),
    titleFont: $('#titleFont'),
    titleSwatches: $('#titleSwatches'),
    titleCenterBtn: $('#titleCenterBtn'),
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

  // ---------- Géométrie ----------
  // Échelle de la photo détourée quand le joueur est à 100 % : 92 % de la hauteur de l'image
  // (dans la limite de MAX_WIDTH), ou la taille maximale de sa case.
  function baseScale(img, i) {
    const { w, h } = imgSize(img);
    if (SLOTS) return Math.min(SLOTS[i].maxH / h, SLOTS[i].maxW / w);
    return Math.min((H * 0.92) / h, (W * MAX_WIDTH) / w);
  }

  function playerRect(p) {
    const { w, h } = imgSize(p.cutout);
    const base = baseScale(p.cutout, p.index);
    const dw = w * base * p.scale;
    const dh = h * base * p.scale;
    return { x: p.x - dw / 2, y: p.y - dh, w: dw, h: dh };
  }

  // Centre horizontal pour « À gauche / Au centre / À droite », sans faire déborder le joueur.
  function anchorX(p, anchor) {
    if (anchor === 'center' || !p.cutout) return ANCHORS[anchor];
    const half = Math.min(playerRect(p).w / 2, W / 2);
    return anchor === 'left' ? Math.max(ANCHORS.left, half) : Math.min(ANCHORS.right, W - half);
  }

  // Emplacement vide (cliquer ou déposer la photo) : au centre de la case, ou à la position de départ
  function slotRect(i) {
    if (SLOTS) {
      const sl = SLOTS[i];
      const w = Math.min(sl.maxW, 240);
      const h = Math.min(sl.maxH * 0.6, 220);
      return { x: sl.x - w / 2, y: sl.floor - sl.maxH / 2 - h / 2, w, h };
    }
    const s = 260;
    return { x: ANCHORS[START[i]] - s / 2, y: (H - s) / 2, w: s, h: s };
  }

  // Case la plus proche horizontalement (photo déposée sur l'image)
  function nearestSlot(pt) {
    let best = 0;
    SLOTS.forEach((sl, i) => { if (Math.abs(pt.x - sl.x) < Math.abs(pt.x - SLOTS[best].x)) best = i; });
    return best;
  }

  function clipToSlot(c, i) {
    c.beginPath();
    SLOTS[i].clip.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.clip();
  }

  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  // Ordre d'affichage : le joueur sélectionné passe devant
  function drawOrder() {
    const order = state.players.map((_, i) => i);
    return state.selected >= 0 ? [...order.filter((i) => i !== state.selected), state.selected] : order;
  }

  function hitPlayer(pt) {
    return [...drawOrder()].reverse().find((i) => state.players[i].cutout && inRect(pt, playerRect(state.players[i]))) ?? -1;
  }

  const hitSlot = (pt) => state.players.findIndex((p, i) => !p.cutout && !p.busy && inRect(pt, slotRect(i)));

  function toLogical(e) {
    const r = els.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  // Magnétisme : sol, positions gauche / centre / droite (ou centre de la case), symétrie avec l'autre joueur
  function snap(i, x, y) {
    const p = state.players[i];
    const guides = [];
    if (Math.abs(y - floorY(i)) < SNAP) y = floorY(i);
    const targets = SLOTS ? [SLOTS[i].x] : Object.keys(ANCHORS).map((a) => anchorX(p, a));
    const other = state.players[1 - i];
    if (COUNT === 2 && other.cutout) targets.push(W - other.x);
    const target = targets.find((tx) => Math.abs(x - tx) < SNAP);
    if (target !== undefined) {
      x = target;
      guides.push({ x });
    }
    state.guides = guides;
    return { x, y };
  }

  // ---------- Rendu ----------
  function render(c, editor) {
    const k = c.getTransform().a;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';

    if (state.template) {
      const { w, h } = imgSize(state.template);
      const s = Math.max(W / w, H / h);
      c.drawImage(state.template, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
    } else {
      c.fillStyle = '#d9dbe0';
      c.fillRect(0, 0, W, H);
    }

    drawOrder().forEach((i) => {
      const p = state.players[i];
      if (!p.cutout) return;
      const r = playerRect(p);
      c.save();
      if (SLOTS && state.clip) clipToSlot(c, i);
      if (state.shadow) {
        c.shadowColor = 'rgba(0, 0, 0, 0.45)';
        c.shadowBlur = 36 * k;
        c.shadowOffsetY = 14 * k;
      }
      if (p.flip) {
        c.translate(r.x + r.w, r.y);
        c.scale(-1, 1);
        c.drawImage(p.cutout, 0, 0, r.w, r.h);
      } else {
        c.drawImage(p.cutout, r.x, r.y, r.w, r.h);
      }
      c.restore();
    });

    drawNames(c, k);
    drawTitle(c, k);
    drawSiteLogo(c);
    if (editor) drawOverlay(c);
  }

  // Texte centré sur (x, y), réduit pour tenir dans maxW, avec une ombre pour rester lisible
  function fitText(c, text, font, size, maxW) {
    c.font = font(size);
    const w = c.measureText(text).width;
    if (w > maxW) {
      size *= maxW / w;
      c.font = font(size);
    }
    return { size, w: Math.min(w, maxW) };
  }

  // Noms des joueurs dans la bande sous chaque case, centrés sur la largeur de la case
  function drawNames(c, k) {
    if (!SLOTS) return;
    state.players.forEach((p, i) => {
      const zone = SLOTS[i].name;
      const text = p.name.trim();
      if (!zone || !text) return;
      c.save();
      fitText(c, text, (size) => `800 ${size}px Inter, system-ui, sans-serif`, NAME_SIZE, zone.w);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffffff';
      c.shadowColor = 'rgba(0, 0, 0, 0.6)';
      c.shadowBlur = 8 * k;
      c.fillText(text, zone.x, zone.y);
      c.restore();
    });
  }

  const titleFont = (size) => (state.title.font === 'anton'
    ? `${size}px Anton, Impact, sans-serif`
    : `800 ${size}px Inter, system-ui, sans-serif`);

  function drawTitle(c, k) {
    titleBox = null;
    const tt = state.title;
    if (!tt || !tt.text.trim()) return;
    c.save();
    const { size, w } = fitText(c, tt.text, titleFont, tt.size, TITLE.maxW);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = tt.color;
    c.shadowColor = 'rgba(0, 0, 0, 0.55)';
    c.shadowBlur = 18 * k;
    c.shadowOffsetY = 4 * k;
    c.fillText(tt.text, tt.x, tt.y);
    c.restore();
    titleBox = { x: tt.x - w / 2 - 8, y: tt.y - size * 0.65, w: w + 16, h: size * 1.3 };
  }

  function drawSiteLogo(c) {
    const site = state.site;
    if (!site) return;
    const m = CFG.siteLogo.margin;
    const h = site.height || CFG.siteLogo.defaultHeight;
    if (site.img) {
      const { w: iw, h: ih } = imgSize(site.img);
      let dh = h;
      let dw = (iw * h) / ih;
      if (dw > W * 0.32) {
        dw = W * 0.32;
        dh = (ih * dw) / iw;
      }
      c.drawImage(site.img, W - m - dw, m, dw, dh);
      return;
    }
    c.save();
    c.font = `800 ${Math.round(h * 0.5)}px Inter, system-ui, sans-serif`;
    const padX = h * 0.42;
    const bw = c.measureText(site.name).width + padX * 2;
    c.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(c, W - m - bw, m, bw, h, h / 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    c.fillText(site.name, W - m - bw + padX, m + h / 2 + 1);
    c.restore();
  }

  function drawOverlay(c) {
    const u = W / (els.canvas.clientWidth || W);
    c.save();
    state.players.forEach((p, i) => {
      if (!p.cutout && !p.busy) {
        // Emplacement vide : cliquer ou déposer la photo
        const r = slotRect(i);
        c.setLineDash([10 * u, 8 * u]);
        c.lineWidth = 2 * u;
        c.strokeStyle = 'rgba(20, 24, 33, 0.45)';
        c.fillStyle = 'rgba(255, 255, 255, 0.55)';
        roundRect(c, r.x, r.y, r.w, r.h, 18);
        c.fill();
        c.stroke();
        c.setLineDash([]);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const fs = Math.min(16 * u, 28);
        c.fillStyle = 'rgba(20, 24, 33, 0.85)';
        c.font = `700 ${fs}px Inter, system-ui, sans-serif`;
        c.fillText(`+ ${playerLabel(i)}`, r.x + r.w / 2, r.y + r.h / 2 - fs * 0.6);
        c.fillStyle = 'rgba(20, 24, 33, 0.6)';
        c.font = `500 ${fs * 0.68}px Inter, system-ui, sans-serif`;
        c.fillText(t('player.slotHint'), r.x + r.w / 2, r.y + r.h / 2 + fs * 0.75);
      } else if (p.cutout && (state.selected === i || state.hover === i)) {
        const r = playerRect(p);
        c.setLineDash([7 * u, 5 * u]);
        c.lineWidth = 2 * u;
        c.strokeStyle = state.selected === i ? '#ff6b1f' : 'rgba(20, 24, 33, 0.5)';
        c.strokeRect(r.x, r.y, r.w, r.h);
      }
    });
    if (titleBox && (state.titleSelected || state.titleHover)) {
      c.setLineDash([7 * u, 5 * u]);
      c.lineWidth = 2 * u;
      c.strokeStyle = state.titleSelected ? '#ff6b1f' : 'rgba(255, 255, 255, 0.55)';
      c.strokeRect(titleBox.x, titleBox.y, titleBox.w, titleBox.h);
    }
    if (state.guides.length) {
      c.setLineDash([6 * u, 5 * u]);
      c.lineWidth = 1.5 * u;
      c.strokeStyle = '#ff3fa4';
      state.guides.forEach((g) => {
        c.beginPath();
        c.moveTo(g.x, 0);
        c.lineTo(g.x, H);
        c.stroke();
      });
    }
    c.restore();
  }

  let drawQueued = false;
  function draw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      const k = els.canvas.width / W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      render(ctx, true);
    });
  }

  function sizeCanvas() {
    const k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    els.canvas.width = Math.round(W * k);
    els.canvas.height = Math.round(H * k);
    draw();
  }

  // ---------- Cartes des joueurs ----------
  function buildCards() {
    const tpl = $('#playerTpl');
    state.players.forEach((p, i) => {
      const root = tpl.content.firstElementChild.cloneNode(true);
      const q = (role) => root.querySelector(`[data-role="${role}"]`);
      const card = {
        root,
        label: q('label'),
        side: q('side'),
        badge: q('badge'),
        drop: q('drop'),
        file: q('file'),
        thumb: q('thumb'),
        dropText: q('dropText'),
        progress: q('progress'),
        bar: q('bar'),
        note: q('note'),
        compare: q('compare'),
        before: q('before'),
        after: q('after'),
        anchors: q('anchors'),
        recenter: q('recenter'),
        nameField: q('nameField'),
        name: q('name'),
        size: q('size'),
        sizeOut: q('sizeOut'),
        flip: q('flip'),
        trim: q('trim'),
        rerun: q('rerun'),
        cutoutBtn: q('cutout'),
      };
      card.file.addEventListener('change', () => {
        const file = card.file.files[0];
        card.file.value = '';
        if (file) setPhoto(i, file);
      });
      card.drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.drop.classList.add('is-over');
      });
      card.drop.addEventListener('dragleave', () => card.drop.classList.remove('is-over'));
      card.drop.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.drop.classList.remove('is-over');
        if (!state.players[i].busy && e.dataTransfer.files[0]) setPhoto(i, e.dataTransfer.files[0]);
      });
      // Cases fixes : « Recentrer dans la case » remplace les boutons gauche / centre / droite
      card.anchors.hidden = !!SLOTS;
      card.recenter.hidden = !SLOTS;
      card.anchors.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-anchor]');
        if (b) setAnchor(i, b.dataset.anchor);
      });
      card.recenter.addEventListener('click', () => recenter(i));
      // Nom sous la case (pages à cases fixes avec une zone de nom)
      if (card.nameField) {
        card.nameField.hidden = !(SLOTS && SLOTS[i].name);
        card.name.addEventListener('input', () => {
          state.players[i].name = card.name.value;
          draw();
        });
      }
      card.size.addEventListener('input', () => {
        state.players[i].scale = card.size.value / 100;
        state.selected = i;
        refreshUI();
        draw();
      });
      card.trim.addEventListener('change', () => {
        const p = state.players[i];
        p.trim = Number(card.trim.value);
        prefs.set('player:trim', p.trim);
        applyCutout(i);
        state.selected = i;
        refreshUI();
        draw();
      });
      card.flip.addEventListener('change', () => {
        state.players[i].flip = card.flip.checked;
        state.selected = i;
        refreshUI();
        draw();
      });
      card.rerun.addEventListener('click', () => runCutout(i));
      card.cutoutBtn.addEventListener('click', () => downloadCutout(i));
      root.addEventListener('pointerdown', (e) => {
        if (state.players[i].cutout && !e.target.closest('button, input, select, label')) {
          state.selected = i;
          refreshUI();
          draw();
        }
      });
      els.players.append(root);
      cards.push(card);
    });
  }

  // ---------- Interface ----------
  function refreshUI() {
    state.players.forEach((p, i) => {
      const card = cards[i];
      card.label.textContent = playerLabel(i);
      card.side.textContent = sideText(i);
      card.root.classList.toggle('is-selected', state.selected === i && !!p.cutout);

      const photoSrc = p.photo ? p.photo.url : '';
      if (card.thumb.getAttribute('src') !== photoSrc) card.thumb.setAttribute('src', photoSrc);
      card.thumb.hidden = !p.photo;
      card.dropText.textContent = p.photo ? t('player.dropReplace', { name: p.photo.name }) : t('player.dropEmpty');
      card.drop.classList.toggle('is-disabled', p.busy);

      const [cls, badge] = p.busy ? ['warn', p.queued ? 'player.badgeQueued' : 'player.badgeBusy']
        : p.cutout ? ['ok', 'player.badgeReady']
        : p.message && p.message.warn ? ['warn', 'player.badgeError'] : ['', 'player.badgeEmpty'];
      card.badge.className = `badge ${cls}`;
      card.badge.textContent = t(badge);

      card.progress.hidden = !p.busy;
      if (p.busy && p.progress) {
        const indeterminate = p.progress.frac == null;
        card.progress.classList.toggle('is-indeterminate', indeterminate);
        card.bar.style.width = indeterminate ? '' : `${Math.round(p.progress.frac * 100)}%`;
      }
      const note = p.busy && p.progress ? { text: p.progress.text }
        : p.message ? { text: t(p.message.key, localParams(p.message.params)), warn: p.message.warn } : null;
      card.note.className = `note${note && note.warn ? ' warn' : ''}`;
      card.note.textContent = note ? note.text : '';

      card.compare.hidden = !p.photo;
      if (card.before.getAttribute('src') !== photoSrc) card.before.setAttribute('src', photoSrc);
      card.after.hidden = !p.cutout;

      card.anchors.querySelectorAll('button').forEach((b) => {
        b.disabled = !p.cutout;
        b.setAttribute('aria-pressed', String(!!p.cutout && Math.abs(p.x - anchorX(p, b.dataset.anchor)) < 1));
      });
      card.recenter.disabled = !p.cutout;
      if (card.name && card.name.value !== p.name) card.name.value = p.name;
      card.size.disabled = !p.cutout;
      card.size.value = Math.round(p.scale * 100);
      card.sizeOut.textContent = pct(p.scale);
      card.flip.checked = p.flip;
      card.flip.disabled = !p.cutout;
      card.trim.value = String(p.trim);
      card.trim.disabled = !p.rawCutout || p.busy;
      card.rerun.hidden = !p.photo;
      card.rerun.disabled = p.busy;
      card.cutoutBtn.hidden = !p.cutout;
    });

    const anyBusy = state.players.some((p) => p.busy);
    els.engineSelect.disabled = anyBusy;
    els.hardenToggle.checked = state.harden;
    els.hardenToggle.disabled = anyBusy;
    els.shadowToggle.checked = state.shadow;
    if (els.clipToggle) els.clipToggle.checked = state.clip;
    if (state.title) {
      if (els.titleText.value !== state.title.text) els.titleText.value = state.title.text;
      els.titleSize.value = state.title.size;
      els.titleSizeOut.textContent = `${state.title.size} px`;
      els.titleColor.value = state.title.color;
      els.titleFont.value = state.title.font;
    }

    // Bandeau sur l'image pendant un détourage (celui qui tourne, pas ceux en attente)
    const activeIndex = state.players.findIndex((p) => p.busy && !p.queued);
    const active = state.players[activeIndex];
    els.stageBusy.hidden = !active;
    const busyText = active && active.progress
      ? (COUNT > 1 ? `${playerLabel(activeIndex)} · ${active.progress.text}` : active.progress.text) : '';
    els.stageBusyText.textContent = busyText;

    const ready = state.players.every((p) => p.cutout) && !anyBusy;
    els.previewBtn.disabled = !ready;
    els.previewBtn.title = ready ? '' : t(pageKey('disabledTitle'));

    const missing = state.players.findIndex((p) => !p.photo);
    els.status.textContent = busyText
      || (state.players.every((p) => !p.photo) ? t(pageKey('statusStart'))
        : missing >= 0 ? t('player.statusMissing', { n: missing + 1 })
          : t(pageKey('statusReady')));
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  // ---------- Site & template ----------
  // Sites NBA, ou tous les sites avec « Aucun logo » quand le logo est facultatif
  const pageSites = () => (OPTIONAL_LOGO ? CFG.sites : CFG.sites.filter((s) => !s.sports || s.sports.includes(SPORT)));

  function populateSites() {
    const options = pageSites().map((s) => new Option(s.name, s.id));
    if (OPTIONAL_LOGO) options.unshift(new Option(t('player.noLogo'), ''));
    els.siteSelect.replaceChildren(...options);
    els.siteSelect.value = state.site ? state.site.id : '';
  }

  async function selectSite(id) {
    const token = ++siteToken;
    const sites = pageSites();
    const site = sites.find((s) => s.id === id) || (OPTIONAL_LOGO ? null : sites[0]);
    const templatePath = LAYOUT.template || (site && site.template);
    const [template, logo] = await Promise.all([
      templatePath ? loadImage(templatePath).catch(() => null) : null,
      site && site.logo ? loadImage(site.logo).catch(() => null) : null,
    ]);
    if (token !== siteToken) return;
    state.site = site ? { ...site, img: logo ? (trimTransparent(logo, 1200) || logo) : null } : null;
    state.template = template;
    els.siteSelect.value = site ? site.id : '';
    prefs.set(`${LAYOUT_ID}:site`, site ? site.id : '');
    refreshUI();
    draw();
  }

  // ---------- Détourage par IA ----------
  let enginePromise = null;
  function loadEngine() {
    if (!enginePromise) enginePromise = import(ENGINE_URL).catch((err) => { enginePromise = null; throw err; });
    return enginePromise;
  }

  // Réduit les très grandes photos avant de les confier au modèle.
  async function prepareInput(file) {
    const img = await loadBlobImage(file);
    const { w, h } = imgSize(img);
    const k = Math.min(1, PHOTO_MAX / Math.max(w, h));
    if (k === 1) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return canvasToBlob(c, 'image/jpeg', 0.95);
  }

  function setProgress(p, frac, text) {
    p.progress = { frac, text };
    refreshUI();
  }

  async function removeBg(p, input) {
    let mod;
    try {
      mod = await loadEngine();
    } catch {
      const err = new Error('engine');
      err.code = 'engine';
      throw err;
    }
    const removeBackground = mod.removeBackground || mod.default;
    const downloads = new Map();
    const config = {
      model: els.engineSelect.value,
      output: { format: 'image/png', quality: 1 },
      progress: (key, current, total) => {
        if (key.startsWith('fetch')) {
          downloads.set(key, [current, total]);
          let done = 0;
          let all = 0;
          downloads.forEach(([d, a]) => { done += d; all += a; });
          const frac = all ? done / all : null;
          setProgress(p, frac, t('player.downloading', { pct: frac == null ? '…' : Math.round(frac * 100) }));
        } else if (key.startsWith('compute')) {
          setProgress(p, null, t('player.computing'));
        }
      },
    };
    // WebGPU quand le navigateur le propose (plus rapide), sinon processeur
    if ('gpu' in navigator) {
      try { return await removeBackground(input, { ...config, device: 'gpu' }); } catch { /* repli sur le processeur */ }
    }
    return removeBackground(input, { ...config, device: 'cpu' });
  }

  function applyCutout(i) {
    const p = state.players[i];
    let c = p.rawCutout;
    if (c && state.harden) c = hardenAlpha(c);
    // Rognage exprimé en pixels de l'image finale, converti en pixels de la photo
    if (c && p.trim > 0) c = erodeAlpha(c, p.trim / baseScale(c, i));
    p.cutout = c;
    if (p.cutout) cards[i].after.src = p.cutout.toDataURL('image/png');
  }

  // Met le détourage du joueur i dans la file : un seul calcul à la fois.
  function runCutout(i) {
    const p = state.players[i];
    if (!p.photo) return;
    const token = ++p.token;
    p.busy = true;
    p.queued = true;
    p.message = null;
    p.progress = { frac: null, text: t('player.queued') };
    refreshUI();
    draw();
    queue = queue.then(() => doCutout(i, token)).catch(() => {});
  }

  async function doCutout(i, token) {
    const p = state.players[i];
    if (token !== p.token) return;
    const started = performance.now();
    p.queued = false;
    setProgress(p, null, t('player.loadingEngine'));
    try {
      const input = await prepareInput(p.photo.file);
      const blob = await removeBg(p, input);
      if (token !== p.token) return;
      const trimmed = trimTransparent(await loadBlobImage(blob), CUTOUT_MAX);
      if (!trimmed) throw new Error(t('player.nothingFound'));
      p.rawCutout = trimmed;
      applyCutout(i);
      if (!p.placed) {
        p.scale = 1;
        p.y = floorY(i);
        p.x = SLOTS ? SLOTS[i].x : anchorX(p, START[i]);
        p.placed = true;
      }
      state.selected = i;
      p.message = { key: 'player.done', params: { s: (performance.now() - started) / 1000 } };
    } catch (err) {
      if (token !== p.token) return;
      console.error(err);
      p.message = err.code === 'engine'
        ? { key: 'player.errorEngine', warn: true }
        : { key: 'player.error', params: { msg: err.message || String(err) }, warn: true };
    } finally {
      if (token === p.token) {
        p.busy = false;
        p.progress = null;
        refreshUI();
        draw();
      }
    }
  }

  function setPhoto(i, file) {
    if (!file || !file.type.startsWith('image/')) return toast(t('toast.notImage'));
    const p = state.players[i];
    if (p.photo) URL.revokeObjectURL(p.photo.url);
    p.photo = { file, name: file.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(file) };
    p.rawCutout = null;
    p.cutout = null;
    p.placed = false;
    runCutout(i);
  }

  function setAnchor(i, anchor) {
    const p = state.players[i];
    p.x = anchorX(p, anchor);
    p.y = H;
    state.selected = i;
    refreshUI();
    draw();
  }

  function recenter(i) {
    const p = state.players[i];
    p.x = SLOTS[i].x;
    p.y = floorY(i);
    state.selected = i;
    refreshUI();
    draw();
  }

  function saveTitle() {
    prefs.set(`${LAYOUT_ID}:title`, state.title);
  }

  function setTitle(changes) {
    Object.assign(state.title, changes);
    saveTitle();
    refreshUI();
    draw();
  }

  function newPhotos() {
    state.players.forEach((p, i) => {
      p.token++;
      if (p.photo) URL.revokeObjectURL(p.photo.url);
      Object.assign(p, makePlayer(i), { token: p.token });
    });
    state.selected = -1;
    refreshUI();
    draw();
  }

  async function downloadCutout(i) {
    const p = state.players[i];
    if (!p.cutout) return;
    const blob = await canvasToBlob(p.cutout, 'image/png');
    saveBlob(blob, `${slugify(p.photo.name) || 'player'}-cutout.png`);
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(t('toast.downloaded', { name }));
  }

  // ---------- Aperçu & export ----------
  async function renderPreview() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    render(c.getContext('2d'), false);
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
    els.previewMeta.textContent = `${W} × ${H} px · ${formatSize(blob.size)}${fallback}`;
  }

  async function openPreview() {
    if (!state.players.every((p) => p.cutout) || state.players.some((p) => p.busy)) return;
    state.selected = -1;
    refreshUI();
    draw();
    const names = state.players.map((p) => slugify(p.name.trim() || p.photo.name)).filter(Boolean);
    const base = LAYOUT.filePrefix ? [LAYOUT.filePrefix, ...names].join('-') : names.join('-vs-');
    els.filenameInput.value = [base, state.site && state.site.id].filter(Boolean).join('-');
    els.previewImg.setAttribute('src', '');
    els.dialog.showModal();
    await renderPreview();
  }

  function download() {
    if (!preview.blob) return;
    const base = slugify(els.filenameInput.value) || 'player-preview';
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = base + (EXT[preview.blob.type] || '.png');
    document.body.append(a);
    a.click();
    a.remove();
    toast(t('toast.downloaded', { name: a.download }));
  }

  // ---------- Événements ----------
  function bindEvents() {
    const cv = els.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cv.focus({ preventScroll: true });
      const pt = toLogical(e);
      if (titleBox && inRect(pt, titleBox)) {
        state.titleSelected = true;
        state.selected = -1;
        drag = { title: true, dx: pt.x - state.title.x, dy: pt.y - state.title.y };
        cv.setPointerCapture(e.pointerId);
        cv.classList.add('is-dragging');
        refreshUI();
        draw();
        return;
      }
      state.titleSelected = false;
      const i = hitPlayer(pt);
      if (i >= 0) {
        const p = state.players[i];
        state.selected = i;
        drag = { i, dx: pt.x - p.x, dy: pt.y - p.y };
        cv.setPointerCapture(e.pointerId);
        cv.classList.add('is-dragging');
      } else {
        state.selected = -1;
        const slot = hitSlot(pt);
        if (slot >= 0) cards[slot].file.click();
      }
      refreshUI();
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      const pt = toLogical(e);
      if (drag && drag.title) {
        let x = clamp(pt.x - drag.dx, 0, W);
        const y = clamp(pt.y - drag.dy, 0, H);
        state.guides = [];
        if (!e.altKey && Math.abs(x - W / 2) < SNAP) {
          x = W / 2;
          state.guides = [{ x }];
        }
        state.title.x = x;
        state.title.y = y;
        draw();
        return;
      }
      if (drag) {
        const p = state.players[drag.i];
        let x = clamp(pt.x - drag.dx, 0, W);
        let y = clamp(pt.y - drag.dy, 0, H * 1.5);
        state.guides = [];
        if (!e.altKey) ({ x, y } = snap(drag.i, x, y));
        p.x = x;
        p.y = y;
        draw();
        return;
      }
      const overTitle = !!titleBox && inRect(pt, titleBox);
      const over = overTitle ? -1 : hitPlayer(pt);
      cv.style.cursor = overTitle || over >= 0 ? 'grab' : hitSlot(pt) >= 0 ? 'pointer' : 'default';
      if (over !== state.hover || overTitle !== state.titleHover) {
        state.hover = over;
        state.titleHover = overTitle;
        draw();
      }
    });
    const endDrag = () => {
      if (!drag) return;
      if (drag.title) saveTitle();
      drag = null;
      state.guides = [];
      cv.classList.remove('is-dragging');
      refreshUI();
      draw();
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', () => {
      if (!drag && (state.hover !== -1 || state.titleHover)) {
        state.hover = -1;
        state.titleHover = false;
        draw();
      }
    });
    cv.addEventListener('wheel', (e) => {
      const i = hitPlayer(toLogical(e));
      if (i < 0) return;
      e.preventDefault();
      const p = state.players[i];
      p.scale = clamp(p.scale * Math.exp(-e.deltaY * 0.0015), 0.2, 2.5);
      state.selected = i;
      refreshUI();
      draw();
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
      const p = state.players[state.selected];
      const titleActive = state.titleSelected && !!titleBox;
      if (els.dialog.open || (!titleActive && (!p || !p.cutout))) return;
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'Escape') {
        state.selected = -1;
        state.titleSelected = false;
        refreshUI();
        draw();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      if (titleActive) {
        state.title.x = clamp(state.title.x + d[0], 0, W);
        state.title.y = clamp(state.title.y + d[1], 0, H);
        saveTitle();
      } else {
        p.x = clamp(p.x + d[0], 0, W);
        p.y = clamp(p.y + d[1], 0, H * 1.5);
      }
      refreshUI();
      draw();
    });

    // Photo déposée sur l'image : moitié gauche = joueur 1, moitié droite = joueur 2
    els.stage.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      els.stage.classList.add('is-over');
    });
    els.stage.addEventListener('dragleave', (e) => {
      if (!els.stage.contains(e.relatedTarget)) els.stage.classList.remove('is-over');
    });
    els.stage.addEventListener('drop', (e) => {
      e.preventDefault();
      els.stage.classList.remove('is-over');
      const file = e.dataTransfer.files[0];
      const pt = toLogical(e);
      const i = SLOTS ? nearestSlot(pt) : COUNT === 2 && pt.x >= W / 2 ? 1 : 0;
      if (file && !state.players[i].busy) setPhoto(i, file);
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // Coller une image : joueur sélectionné, sinon le premier sans photo
    document.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (!file || els.dialog.open) return;
      const sel = state.players[state.selected];
      const i = sel && !sel.busy ? state.selected : state.players.findIndex((p) => !p.photo);
      if (i < 0) return;
      e.preventDefault();
      setPhoto(i, file);
    });

    els.engineSelect.value = prefs.get('player:engine', 'isnet');
    els.engineSelect.addEventListener('change', () => prefs.set('player:engine', els.engineSelect.value));
    els.hardenToggle.addEventListener('change', () => {
      state.harden = els.hardenToggle.checked;
      prefs.set('player:harden', state.harden);
      state.players.forEach((_, i) => applyCutout(i));
      refreshUI();
      draw();
    });
    if (els.clipToggle) {
      els.clipToggle.addEventListener('change', () => {
        state.clip = els.clipToggle.checked;
        prefs.set(`${LAYOUT_ID}:clip`, state.clip);
        draw();
      });
    }
    if (state.title) {
      els.titleText.addEventListener('input', () => {
        state.title.text = els.titleText.value;
        saveTitle();
        draw();
      });
      els.titleSize.addEventListener('input', () => setTitle({ size: Number(els.titleSize.value) }));
      els.titleColor.addEventListener('input', () => setTitle({ color: els.titleColor.value }));
      els.titleSwatches.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-color]');
        if (b) setTitle({ color: b.dataset.color });
      });
      els.titleFont.addEventListener('change', () => {
        setTitle({ font: els.titleFont.value });
        // Anton n'est chargée qu'à la demande : on redessine une fois la police disponible
        if (document.fonts) document.fonts.load(titleFont(state.title.size)).then(draw);
      });
      els.titleCenterBtn.addEventListener('click', () => setTitle({ x: TITLE.x, y: TITLE.y }));
    }
    els.shadowToggle.addEventListener('change', () => {
      state.shadow = els.shadowToggle.checked;
      prefs.set('player:shadow', state.shadow);
      draw();
    });
    els.siteSelect.addEventListener('change', () => selectSite(els.siteSelect.value));
    els.resetBtn.addEventListener('click', newPhotos);

    els.previewBtn.addEventListener('click', openPreview);
    els.formatSelect.value = prefs.get('format', 'jpeg');
    els.formatSelect.addEventListener('change', () => {
      prefs.set('format', els.formatSelect.value);
      renderPreview();
    });
    els.downloadBtn.addEventListener('click', download);
    els.dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => els.dialog.close()));
    els.dialog.addEventListener('click', (e) => { if (e.target === els.dialog) els.dialog.close(); });

    Object.entries(I18N.languages).forEach(([code, label]) => els.langSelect.append(new Option(label, code)));
    els.langSelect.value = lang;
    els.langSelect.addEventListener('change', () => {
      lang = I18N.dict[els.langSelect.value] ? els.langSelect.value : 'fr';
      prefs.set('lang', lang);
      document.documentElement.lang = lang;
      applyStaticTexts();
      populateSites();
      refreshUI();
      draw();
    });

    new ResizeObserver(draw).observe(els.canvas);
  }

  // ---------- Démarrage ----------
  buildCards();
  document.documentElement.lang = lang;
  applyStaticTexts();
  bindEvents();
  sizeCanvas();
  populateSites();
  refreshUI();
  selectSite(prefs.get(`${LAYOUT_ID}:site`, ''));
  if (document.fonts) {
    document.fonts.ready.then(draw);
    if (state.title && state.title.font === 'anton') document.fonts.load(titleFont(state.title.size)).then(draw);
  }

  // Exposé pour le débogage dans la console.
  window.PlayerStudio = { state, setPhoto, draw };
})();

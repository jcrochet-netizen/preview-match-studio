/* Preview Match Studio — page de test : photo de joueur détourée par IA et posée sur le template */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const I18N = window.APP_I18N;
  const W = CFG.width;
  const H = CFG.height;
  const SPORT = 'nba';
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

  // ---------- État ----------
  const state = {
    site: null,
    template: null,
    photo: null, // { file, name, url }
    rawCutout: null, // canvas du joueur détouré et recadré, tel que rendu par le modèle
    cutout: null, // version affichée (renforcée ou non)
    placed: false, // position déjà choisie pour cette photo
    x: ANCHORS.left, // centre horizontal du joueur
    y: H, // bas du joueur
    scale: 1,
    flip: prefs.get('player:flip', false),
    shadow: prefs.get('player:shadow', true),
    harden: prefs.get('player:harden', true),
    busy: false,
    progress: null, // { frac, text }
    message: null, // { key, params, warn } : traduit à l'affichage (suit la langue choisie)
    selected: false,
    hover: false,
    guides: [],
  };
  let drag = null;
  let runToken = 0;
  let siteToken = 0;
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
    photoDrop: $('#photoDrop'),
    photoInput: $('#photoInput'),
    photoThumb: $('#photoThumb'),
    photoText: $('#photoText'),
    engineSelect: $('#engineSelect'),
    hardenToggle: $('#hardenToggle'),
    progress: $('#progress'),
    progressBar: $('#progressBar'),
    engineNote: $('#engineNote'),
    compare: $('#compare'),
    beforeImg: $('#beforeImg'),
    afterImg: $('#afterImg'),
    rerunBtn: $('#rerunBtn'),
    cutoutBtn: $('#cutoutBtn'),
    anchorSeg: $('#anchorSeg'),
    sizeRange: $('#sizeRange'),
    sizeOut: $('#sizeOut'),
    flipToggle: $('#flipToggle'),
    shadowToggle: $('#shadowToggle'),
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

  // ---------- Géométrie ----------
  // À 100 %, le joueur occupe 92 % de la hauteur (sans dépasser 60 % de la largeur), posé en bas.
  function playerRect() {
    const { w, h } = imgSize(state.cutout);
    const base = Math.min((H * 0.92) / h, (W * 0.6) / w);
    const dw = w * base * state.scale;
    const dh = h * base * state.scale;
    return { x: state.x - dw / 2, y: state.y - dh, w: dw, h: dh };
  }

  // Centre horizontal pour « À gauche / Au centre / À droite », sans faire déborder le joueur.
  function anchorX(anchor) {
    if (anchor === 'center' || !state.cutout) return ANCHORS[anchor];
    const half = Math.min(playerRect().w / 2, W / 2);
    return anchor === 'left' ? Math.max(ANCHORS.left, half) : Math.min(ANCHORS.right, W - half);
  }

  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const hitPlayer = (p) => !!state.cutout && inRect(p, playerRect());

  function toLogical(e) {
    const r = els.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  // Magnétisme : bas de l'image, centre et positions gauche / droite
  function snap(x, y) {
    const guides = [];
    if (Math.abs(y - H) < SNAP) y = H;
    const target = Object.keys(ANCHORS).map(anchorX).find((ax) => Math.abs(x - ax) < SNAP);
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

    if (state.cutout) {
      const r = playerRect();
      c.save();
      if (state.shadow) {
        c.shadowColor = 'rgba(0, 0, 0, 0.45)';
        c.shadowBlur = 36 * k;
        c.shadowOffsetY = 14 * k;
      }
      if (state.flip) {
        c.translate(r.x + r.w, r.y);
        c.scale(-1, 1);
        c.drawImage(state.cutout, 0, 0, r.w, r.h);
      } else {
        c.drawImage(state.cutout, r.x, r.y, r.w, r.h);
      }
      c.restore();
    }

    drawSiteLogo(c);
    if (editor) drawOverlay(c);
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
    if (!state.cutout && !state.busy) {
      // Cadre ajusté à la longueur du texte (variable selon la langue)
      c.font = `700 ${Math.min(16 * u, 26)}px Inter, system-ui, sans-serif`;
      const bw = Math.min(W - 80, c.measureText(t('player.canvasHint')).width + 80);
      const bh = 120;
      const x = (W - bw) / 2;
      const y = (H - bh) / 2;
      c.setLineDash([10 * u, 8 * u]);
      c.lineWidth = 2 * u;
      c.strokeStyle = 'rgba(20, 24, 33, 0.45)';
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      roundRect(c, x, y, bw, bh, 18);
      c.fill();
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(20, 24, 33, 0.8)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(t('player.canvasHint'), W / 2, H / 2);
    }
    if (state.cutout && (state.selected || state.hover)) {
      const r = playerRect();
      c.setLineDash([7 * u, 5 * u]);
      c.lineWidth = 2 * u;
      c.strokeStyle = state.selected ? '#ff6b1f' : 'rgba(20, 24, 33, 0.5)';
      c.strokeRect(r.x, r.y, r.w, r.h);
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
    const k = clamp(window.devicePixelRatio || 1, 1, 2);
    els.canvas.width = Math.round(W * k);
    els.canvas.height = Math.round(H * k);
    draw();
  }

  // ---------- Interface ----------
  function refreshUI() {
    const hasPhoto = !!state.photo;
    const photoSrc = hasPhoto ? state.photo.url : '';
    if (els.photoThumb.getAttribute('src') !== photoSrc) els.photoThumb.setAttribute('src', photoSrc);
    els.photoThumb.hidden = !hasPhoto;
    els.photoText.textContent = hasPhoto ? t('player.dropReplace', { name: state.photo.name }) : t('player.dropEmpty');
    els.photoDrop.classList.toggle('is-disabled', state.busy);

    els.progress.hidden = !state.busy;
    if (state.busy && state.progress) {
      const indeterminate = state.progress.frac == null;
      els.progress.classList.toggle('is-indeterminate', indeterminate);
      els.progressBar.style.width = indeterminate ? '' : `${Math.round(state.progress.frac * 100)}%`;
    }
    const note = state.busy && state.progress ? { text: state.progress.text }
      : state.message ? { text: t(state.message.key, localParams(state.message.params)), warn: state.message.warn }
      : { text: t('player.engineIntro') };
    els.engineNote.className = `note${note.warn ? ' warn' : ''}`;
    els.engineNote.textContent = note.text;
    els.stageBusy.hidden = !state.busy;
    els.stageBusyText.textContent = state.progress ? state.progress.text : '';

    els.compare.hidden = !hasPhoto;
    els.afterImg.hidden = !state.cutout;
    if (els.beforeImg.getAttribute('src') !== photoSrc) els.beforeImg.setAttribute('src', photoSrc);

    els.rerunBtn.hidden = !hasPhoto;
    els.rerunBtn.disabled = state.busy;
    els.cutoutBtn.hidden = !state.cutout;
    els.engineSelect.disabled = state.busy;

    els.anchorSeg.querySelectorAll('button').forEach((b) => {
      b.disabled = !state.cutout;
      b.setAttribute('aria-pressed', String(!!state.cutout && Math.abs(state.x - anchorX(b.dataset.anchor)) < 1));
    });
    els.sizeRange.disabled = !state.cutout;
    els.sizeRange.value = Math.round(state.scale * 100);
    els.sizeOut.textContent = pct(state.scale);
    els.flipToggle.checked = state.flip;
    els.hardenToggle.checked = state.harden;
    els.hardenToggle.disabled = state.busy;
    els.shadowToggle.checked = state.shadow;

    const ready = !!state.cutout && !state.busy;
    els.previewBtn.disabled = !ready;
    els.previewBtn.title = ready ? '' : t('player.disabledTitle');

    els.status.textContent = state.busy && state.progress ? state.progress.text
      : state.cutout ? t('player.statusReady') : t('player.statusStart');
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  function setProgress(frac, text) {
    state.progress = { frac, text };
    refreshUI();
  }

  // ---------- Site & template ----------
  const nbaSites = () => CFG.sites.filter((s) => !s.sports || s.sports.includes(SPORT));

  function populateSites() {
    els.siteSelect.replaceChildren(...nbaSites().map((s) => new Option(s.name, s.id)));
  }

  async function selectSite(id) {
    const token = ++siteToken;
    const sites = nbaSites();
    const site = sites.find((s) => s.id === id) || sites[0];
    if (!site) return;
    const [template, logo] = await Promise.all([
      site.template ? loadImage(site.template).catch(() => null) : null,
      site.logo ? loadImage(site.logo).catch(() => null) : null,
    ]);
    if (token !== siteToken) return;
    state.site = { ...site, img: logo ? (trimTransparent(logo, 1200) || logo) : null };
    state.template = template;
    els.siteSelect.value = site.id;
    prefs.set('player:site', site.id);
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

  async function removeBg(input) {
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
          setProgress(frac, t('player.downloading', { pct: frac == null ? '…' : Math.round(frac * 100) }));
        } else if (key.startsWith('compute')) {
          setProgress(null, t('player.computing'));
        }
      },
    };
    // WebGPU quand le navigateur le propose (plus rapide), sinon processeur
    if ('gpu' in navigator) {
      try { return await removeBackground(input, { ...config, device: 'gpu' }); } catch { /* repli sur le processeur */ }
    }
    return removeBackground(input, { ...config, device: 'cpu' });
  }

  async function runCutout() {
    if (!state.photo) return;
    const token = ++runToken;
    const started = performance.now();
    state.busy = true;
    state.message = null;
    setProgress(null, t('player.loadingEngine'));
    draw();
    try {
      const input = await prepareInput(state.photo.file);
      const blob = await removeBg(input);
      if (token !== runToken) return;
      const trimmed = trimTransparent(await loadBlobImage(blob), CUTOUT_MAX);
      if (!trimmed) throw new Error(t('player.nothingFound'));
      state.rawCutout = trimmed;
      applyCutout();
      if (!state.placed) {
        state.scale = 1;
        state.y = H;
        state.x = anchorX('left');
        state.placed = true;
      }
      state.selected = true;
      state.message = { key: 'player.done', params: { s: (performance.now() - started) / 1000 } };
    } catch (err) {
      if (token !== runToken) return;
      console.error(err);
      state.message = err.code === 'engine'
        ? { key: 'player.errorEngine', warn: true }
        : { key: 'player.error', params: { msg: err.message || String(err) }, warn: true };
    } finally {
      if (token === runToken) {
        state.busy = false;
        state.progress = null;
        refreshUI();
        draw();
      }
    }
  }

  function applyCutout() {
    state.cutout = state.rawCutout && (state.harden ? hardenAlpha(state.rawCutout) : state.rawCutout);
    if (state.cutout) els.afterImg.src = state.cutout.toDataURL('image/png');
  }

  function setPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return toast(t('toast.notImage'));
    if (state.photo) URL.revokeObjectURL(state.photo.url);
    state.photo = { file, name: file.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(file) };
    state.rawCutout = null;
    state.cutout = null;
    state.placed = false;
    runCutout();
  }

  function setAnchor(anchor) {
    state.x = anchorX(anchor);
    state.y = H;
    state.selected = true;
    refreshUI();
    draw();
  }

  function newPhoto() {
    runToken++;
    if (state.photo) URL.revokeObjectURL(state.photo.url);
    Object.assign(state, { photo: null, rawCutout: null, cutout: null, placed: false, busy: false, progress: null, message: null, selected: false, x: ANCHORS.left, y: H, scale: 1 });
    refreshUI();
    draw();
  }

  async function downloadCutout() {
    if (!state.cutout) return;
    const blob = await canvasToBlob(state.cutout, 'image/png');
    saveBlob(blob, `${slugify(state.photo.name) || 'player'}-cutout.png`);
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
    if (!state.cutout || state.busy) return;
    state.selected = false;
    draw();
    els.filenameInput.value = [slugify(state.photo.name), state.site && state.site.id].filter(Boolean).join('-');
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
      const p = toLogical(e);
      if (hitPlayer(p)) {
        state.selected = true;
        drag = { dx: p.x - state.x, dy: p.y - state.y };
        cv.setPointerCapture(e.pointerId);
        cv.classList.add('is-dragging');
      } else {
        state.selected = false;
        if (!state.cutout && !state.busy) els.photoInput.click();
      }
      refreshUI();
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = toLogical(e);
      if (drag) {
        let x = clamp(p.x - drag.dx, 0, W);
        let y = clamp(p.y - drag.dy, 0, H * 1.5);
        state.guides = [];
        if (!e.altKey) ({ x, y } = snap(x, y));
        state.x = x;
        state.y = y;
        draw();
        return;
      }
      const over = hitPlayer(p);
      cv.style.cursor = over ? 'grab' : !state.cutout && !state.busy ? 'pointer' : 'default';
      if (over !== state.hover) {
        state.hover = over;
        draw();
      }
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      state.guides = [];
      cv.classList.remove('is-dragging');
      refreshUI();
      draw();
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', () => {
      if (!drag && state.hover) {
        state.hover = false;
        draw();
      }
    });
    cv.addEventListener('wheel', (e) => {
      if (!hitPlayer(toLogical(e))) return;
      e.preventDefault();
      state.scale = clamp(state.scale * Math.exp(-e.deltaY * 0.0015), 0.2, 2.5);
      state.selected = true;
      refreshUI();
      draw();
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
      if (els.dialog.open || !state.cutout || !state.selected) return;
      if (e.target.closest('input, select, textarea')) return;
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      state.x = clamp(state.x + d[0], 0, W);
      state.y = clamp(state.y + d[1], 0, H * 1.5);
      refreshUI();
      draw();
    });

    // Photo : clic, glisser-déposer (zone ou image), coller
    els.photoInput.addEventListener('change', () => {
      const file = els.photoInput.files[0];
      els.photoInput.value = '';
      if (file) setPhoto(file);
    });
    [els.photoDrop, els.stage].forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        zone.classList.add('is-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-over');
        if (!state.busy && e.dataTransfer.files[0]) setPhoto(e.dataTransfer.files[0]);
      });
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
    document.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file && !state.busy && !els.dialog.open) {
        e.preventDefault();
        setPhoto(file);
      }
    });

    els.rerunBtn.addEventListener('click', runCutout);
    els.cutoutBtn.addEventListener('click', downloadCutout);
    els.engineSelect.value = prefs.get('player:engine', 'isnet_fp16');
    els.engineSelect.addEventListener('change', () => prefs.set('player:engine', els.engineSelect.value));
    els.anchorSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-anchor]');
      if (b) setAnchor(b.dataset.anchor);
    });
    els.sizeRange.addEventListener('input', () => {
      state.scale = els.sizeRange.value / 100;
      state.selected = true;
      refreshUI();
      draw();
    });
    els.flipToggle.addEventListener('change', () => {
      state.flip = els.flipToggle.checked;
      prefs.set('player:flip', state.flip);
      draw();
    });
    els.hardenToggle.addEventListener('change', () => {
      state.harden = els.hardenToggle.checked;
      prefs.set('player:harden', state.harden);
      applyCutout();
      refreshUI();
      draw();
    });
    els.shadowToggle.addEventListener('change', () => {
      state.shadow = els.shadowToggle.checked;
      prefs.set('player:shadow', state.shadow);
      draw();
    });
    els.siteSelect.addEventListener('change', () => selectSite(els.siteSelect.value));
    els.resetBtn.addEventListener('click', newPhoto);

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
      refreshUI();
      draw();
    });

    new ResizeObserver(draw).observe(els.canvas);
  }

  // ---------- Démarrage ----------
  document.documentElement.lang = lang;
  applyStaticTexts();
  bindEvents();
  sizeCanvas();
  populateSites();
  refreshUI();
  selectSite(prefs.get('player:site', ''));
  if (document.fonts) document.fonts.ready.then(draw);

  // Exposé pour le débogage dans la console.
  window.PlayerStudio = { state, setPhoto, draw };
})();

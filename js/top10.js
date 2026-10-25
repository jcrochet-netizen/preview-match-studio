/* Preview Match Studio — visuel « Ballon d'Or — Top 10 » : un joueur par ligne du tableau du template,
   choisi dans un menu ; sa vignette Sportmonks et son nom s'affichent sur la ligne. */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const I18N = window.APP_I18N;
  // Format choisi par la page (data-layout sur <body>) : 16:9 par défaut, ou 9:16
  const L = CFG[document.body.dataset.layout] || CFG.ballondorTop10;
  const W = L.width || CFG.width;
  const H = L.height || CFG.height;
  // Classement et site sont partagés entre les formats ; le style des noms est propre à chacun
  const NAMES_KEY = `${L.namesKey || 'top10'}:names`;
  const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
  const EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
  const QUALITY = 0.92;
  const COUNT = L.rows.length;

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const slugify = (str) => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).join('-');

  // Les vignettes viennent du CDN Sportmonks : chargement « anonymous » pour pouvoir exporter le canvas
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
      img.src = src;
    });
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

  // Recadre une image sur ses pixels non transparents (logos de sites avec des marges)
  function trimTransparent(img) {
    const { w, h } = imgSize(img);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
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
    if (maxX < 0) return img;
    const o = document.createElement('canvas');
    o.width = maxX - minX + 1;
    o.height = maxY - minY + 1;
    o.getContext('2d').drawImage(c, minX, minY, o.width, o.height, 0, 0, o.width, o.height);
    return o;
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

  // ---------- Données ----------
  const CANDIDATES = window.BALLONDOR_CANDIDATES;
  const CLUBS = window.BALLONDOR_CLUBS || {};
  const byId = new Map(CANDIDATES.map((c) => [String(c.id), c]));
  const sortedCandidates = () => [...CANDIDATES].sort((a, b) => a.name.localeCompare(b.name, lang));

  const state = {
    site: null,
    template: null,
    // Classement : id Sportmonks du joueur de chaque ligne ('' = vide), mémorisé
    ranking: (() => {
      const saved = prefs.get('top10:ranking', []);
      return Array.from({ length: COUNT }, (_, i) => (byId.has(String(saved[i])) ? String(saved[i]) : ''));
    })(),
    names: { font: 'inter', color: '#ffffff', size: L.name.size, ...prefs.get(NAMES_KEY, {}) },
  };
  const thumbs = new Map(); // id → vignette chargée (ou null si indisponible)
  const clubLogos = new Map(); // clé du club → logo chargé (ou null si indisponible)
  let siteToken = 0;
  const preview = { url: '', blob: null };

  const els = {
    canvas: $('#editor'),
    status: $('#statusText'),
    langSelect: $('#langSelect'),
    resetBtn: $('#resetBtn'),
    visualSelect: $('#visualSelect'),
    siteSelect: $('#siteSelect'),
    rankList: $('#rankList'),
    namesFont: $('#namesFont'),
    namesColor: $('#namesColor'),
    namesSwatches: $('#namesSwatches'),
    namesSize: $('#namesSize'),
    namesSizeOut: $('#namesSizeOut'),
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
  const rows = []; // { select, thumb } pour chaque ligne du classement

  // ---------- Rendu ----------
  // Police des noms : liste commune aux pages Ballon d'Or (CFG.fonts) ; un id inconnu retombe sur la première
  const fontDef = (id) => CFG.fonts.find((f) => f.id === id) || CFG.fonts[0];
  const fontOf = (id) => {
    const f = fontDef(id);
    return (size) => `${f.weight} ${size}px "${f.family}", ${f.fallback}`;
  };

  // Sélecteur de police : un bouton par police, écrit dans cette police
  function buildFontPicker(root, onPick) {
    root.replaceChildren(...CFG.fonts.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'font-tile';
      b.dataset.font = f.id;
      b.textContent = f.name;
      b.style.fontFamily = `"${f.family}", ${f.fallback}`;
      b.style.fontWeight = f.weight;
      return b;
    }));
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.font-tile');
      if (b) onPick(b.dataset.font);
    });
  }

  const markFont = (root, id) => root.querySelectorAll('.font-tile').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.font === fontDef(id).id));
  });

  function render(c) {
    const k = c.getTransform().a;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    if (state.template) {
      const { w, h } = imgSize(state.template);
      const s = Math.max(W / w, H / h);
      c.drawImage(state.template, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
    } else {
      c.fillStyle = '#0b0b0b';
      c.fillRect(0, 0, W, H);
    }
    L.rows.forEach((y, i) => drawRank(c, k, i + 1, y));
    state.ranking.forEach((id, i) => {
      const player = byId.get(id);
      if (!player) return;
      drawThumb(c, thumbs.get(id), L.rows[i]);
      drawName(c, k, player.name, L.rows[i]);
      drawClub(c, clubLogos.get(player.club), L.rows[i]);
    });
    drawSiteLogo(c);
  }

  // Classement : chiffres dorés en dégradé (comme le titre du template), affichés sur les 10 lignes
  function drawRank(c, k, n, y) {
    const { x, size } = L.rank;
    c.save();
    c.font = `600 ${size}px Oswald, Impact, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const cap = c.measureText('0').actualBoundingBoxAscent;
    const base = y + cap / 2;
    const gold = c.createLinearGradient(0, base - cap, 0, base);
    gold.addColorStop(0, '#fff3c4');
    gold.addColorStop(0.45, '#e8c15f');
    gold.addColorStop(1, '#a4712a');
    c.fillStyle = gold;
    c.shadowColor = 'rgba(0, 0, 0, 0.7)';
    c.shadowBlur = 6 * k;
    c.fillText(String(n), x, base);
    c.restore();
  }

  // Logo du club, centré dans sa colonne
  function drawClub(c, img, y) {
    if (!img) return;
    const { x, size } = L.club;
    const { w, h } = imgSize(img);
    const s = size / Math.max(w, h);
    c.drawImage(img, x - (w * s) / 2, y - (h * s) / 2, w * s, h * s);
  }

  // Vignette ronde : fond sombre, portrait Sportmonks cadré sur le visage, liseré doré
  function drawThumb(c, img, y) {
    const { x, r } = L.thumb;
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.closePath();
    const bg = c.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
    bg.addColorStop(0, '#3a2c12');
    bg.addColorStop(1, '#120d05');
    c.fillStyle = bg;
    c.fill();
    if (img) {
      c.clip();
      // Photo entière dans le cercle, même cadrage que les vignettes du panneau
      c.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
    c.restore();
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.lineWidth = r * 0.075;
    c.strokeStyle = '#d4a93c';
    c.stroke();
    c.restore();
  }

  function drawName(c, k, text, y) {
    const font = fontOf(state.names.font);
    let size = state.names.size;
    c.save();
    c.font = font(size);
    const w = c.measureText(text).width;
    if (w > L.name.maxW) {
      size *= L.name.maxW / w;
      c.font = font(size);
    }
    // Centré sur la ligne d'après la hauteur des capitales : même placement quelle que soit la police
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const cap = c.measureText('H').actualBoundingBoxAscent;
    c.fillStyle = state.names.color;
    c.shadowColor = 'rgba(0, 0, 0, 0.6)';
    c.shadowBlur = 6 * k;
    c.fillText(text, L.name.x, y + cap / 2);
    c.restore();
  }

  function drawSiteLogo(c) {
    const site = state.site;
    if (!site) return;
    const m = CFG.siteLogo.margin;
    const box = L.logo || { x: W * 0.68 - m, y: m, w: W * 0.32, h: Infinity };
    const h = Math.min(site.height || CFG.siteLogo.defaultHeight, box.h);
    if (site.img) {
      // Calé en haut à droite de la zone réservée, sans déborder sur le tableau
      const { w: iw, h: ih } = imgSize(site.img);
      let dh = h;
      let dw = (iw * h) / ih;
      if (dw > box.w) {
        dw = box.w;
        dh = (ih * dw) / iw;
      }
      c.drawImage(site.img, box.x + box.w - dw, box.y, dw, dh);
      return;
    }
    c.save();
    c.font = `800 ${Math.round(h * 0.5)}px Inter, system-ui, sans-serif`;
    const padX = h * 0.42;
    const bw = Math.min(c.measureText(site.name).width + padX * 2, box.w);
    const bx = box.x + box.w - bw;
    c.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(c, bx, box.y, bw, h, h / 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    c.fillText(site.name, bx + padX, box.y + h / 2 + 1, bw - padX * 2);
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
      render(ctx);
    });
  }

  function sizeCanvas() {
    const k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    els.canvas.width = Math.round(W * k);
    els.canvas.height = Math.round(H * k);
    draw();
  }

  // ---------- Vignettes ----------
  async function ensureClub(key) {
    if (!CLUBS[key] || clubLogos.has(key)) return;
    clubLogos.set(key, null);
    try {
      clubLogos.set(key, await loadImage(CLUBS[key].logo));
    } catch {
      // logo indisponible : la colonne reste vide pour ce joueur
    }
    refreshUI();
    draw();
  }

  async function ensureThumb(id) {
    if (!id) return;
    ensureClub(byId.get(id).club);
    if (thumbs.has(id)) return;
    thumbs.set(id, null);
    try {
      thumbs.set(id, await loadImage(byId.get(id).img));
    } catch {
      toast(t('top10.thumbError', { name: byId.get(id).name }));
    }
    refreshUI();
    draw();
  }

  // ---------- Interface ----------
  function buildRankList() {
    for (let i = 0; i < COUNT; i++) {
      const li = document.createElement('li');
      li.className = 'rank-row';
      const numEl = document.createElement('span');
      numEl.className = 'rank-num';
      numEl.textContent = i + 1;
      const thumb = document.createElement('img');
      thumb.className = 'rank-thumb';
      thumb.alt = '';
      thumb.hidden = true;
      const select = document.createElement('select');
      select.className = 'select';
      select.setAttribute('aria-label', String(i + 1));
      select.addEventListener('change', () => setRank(i, select.value));
      const club = document.createElement('img');
      club.className = 'rank-club';
      club.crossOrigin = 'anonymous'; // même requête que le logo dessiné sur l'image
      club.hidden = true;
      li.append(numEl, thumb, select, club);
      els.rankList.append(li);
      rows.push({ select, thumb, club });
    }
  }

  function populateRankMenus() {
    const list = sortedCandidates();
    rows.forEach(({ select }) => {
      select.replaceChildren(new Option(t('top10.choose'), ''), ...list.map((c) => new Option(c.name, String(c.id))));
    });
  }

  function refreshUI() {
    rows.forEach(({ select, thumb, club }, i) => {
      const id = state.ranking[i];
      select.value = id;
      // Un joueur ne peut occuper qu'une ligne
      [...select.options].forEach((o) => { o.disabled = !!o.value && o.value !== id && state.ranking.includes(o.value); });
      const src = id ? byId.get(id).img : '';
      if (thumb.getAttribute('src') !== src) {
        if (src) thumb.crossOrigin = 'anonymous';
        thumb.setAttribute('src', src);
      }
      thumb.hidden = !id;
      const clubInfo = id ? CLUBS[byId.get(id).club] : null;
      const logo = clubInfo ? clubInfo.logo : '';
      if (club.getAttribute('src') !== logo) club.setAttribute('src', logo);
      club.alt = clubInfo ? clubInfo.name : '';
      club.title = club.alt;
      club.hidden = !clubInfo;
    });
    markFont(els.namesFont, state.names.font);
    els.namesColor.value = state.names.color;
    els.namesSize.value = state.names.size;
    els.namesSizeOut.textContent = `${state.names.size} px`;

    const filled = state.ranking.filter(Boolean).length;
    els.previewBtn.disabled = filled === 0;
    els.previewBtn.title = filled ? '' : t('top10.disabledTitle');
    els.status.textContent = filled === 0 ? t('top10.statusStart')
      : filled < COUNT ? t('top10.statusPartial', { n: filled, total: COUNT })
        : t('top10.statusReady');
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  function setRank(i, id) {
    state.ranking[i] = id;
    prefs.set('top10:ranking', state.ranking);
    ensureThumb(id);
    refreshUI();
    draw();
  }

  function setNames(changes) {
    Object.assign(state.names, changes);
    prefs.set(NAMES_KEY, state.names);
    refreshUI();
    draw();
  }

  // ---------- Site & template ----------
  const pageSites = () => CFG.sites.filter((s) => !s.sports || s.sports.includes(L.sport));

  function populateSites() {
    els.siteSelect.replaceChildren(new Option(t('player.noLogo'), ''), ...pageSites().map((s) => new Option(s.name, s.id)));
    els.siteSelect.value = state.site ? state.site.id : '';
  }

  async function selectSite(id) {
    const token = ++siteToken;
    const site = pageSites().find((s) => s.id === id) || null;
    const logoPath = site && ((L.dark && site.logoOnDark) || site.logo);
    const logo = logoPath ? await loadImage(logoPath).catch(() => null) : null;
    if (token !== siteToken) return;
    state.site = site ? { ...site, img: logo ? trimTransparent(logo) : null } : null;
    els.siteSelect.value = site ? site.id : '';
    prefs.set('top10:site', site ? site.id : '');
    draw();
  }

  // ---------- Aperçu & export ----------
  async function renderPreview() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    render(c.getContext('2d'));
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
    if (!state.ranking.some(Boolean)) return;
    els.filenameInput.value = [L.filePrefix, state.site && state.site.id].filter(Boolean).join('-');
    els.previewImg.setAttribute('src', '');
    els.dialog.showModal();
    await renderPreview();
  }

  function download() {
    if (!preview.blob) return;
    const name = (slugify(els.filenameInput.value) || L.filePrefix) + (EXT[preview.blob.type] || '.png');
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    toast(t('toast.downloaded', { name }));
  }

  // ---------- Événements ----------
  function bindEvents() {
    els.visualSelect.addEventListener('change', () => { location.href = els.visualSelect.value; });
    els.siteSelect.addEventListener('change', () => selectSite(els.siteSelect.value));
    els.resetBtn.addEventListener('click', () => {
      state.ranking = state.ranking.map(() => '');
      prefs.set('top10:ranking', state.ranking);
      refreshUI();
      draw();
    });
    buildFontPicker(els.namesFont, (font) => {
      setNames({ font });
      // La police n'est chargée qu'à la demande : on redessine une fois qu'elle est disponible
      if (document.fonts) document.fonts.load(fontOf(font)(state.names.size)).then(draw);
    });
    els.namesColor.addEventListener('input', () => setNames({ color: els.namesColor.value }));
    els.namesSwatches.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-color]');
      if (b) setNames({ color: b.dataset.color });
    });
    els.namesSize.addEventListener('input', () => setNames({ size: Number(els.namesSize.value) }));

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
      populateRankMenus();
      refreshUI();
      draw();
    });

    new ResizeObserver(draw).observe(els.canvas);
  }

  // ---------- Démarrage ----------
  buildRankList();
  document.documentElement.lang = lang;
  applyStaticTexts();
  populateRankMenus();
  bindEvents();
  sizeCanvas();
  populateSites();
  refreshUI();
  loadImage(L.template).then((img) => { state.template = img; draw(); }).catch(() => draw());
  selectSite(prefs.get('top10:site', ''));
  state.ranking.forEach((id) => ensureThumb(id));
  if (document.fonts) {
    document.fonts.ready.then(draw);
    document.fonts.load(fontOf(state.names.font)(state.names.size)).then(draw);
    document.fonts.load(`600 ${L.rank.size}px Oswald`).then(draw);
  }

  // Exposé pour le débogage dans la console.
  window.Top10Studio = { state, draw, setRank };
})();

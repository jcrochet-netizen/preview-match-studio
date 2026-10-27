/* Preview Match Studio — page « Swap shirt 3 » : montage généré par l'IA d'OpenAI (API Images, modification à
   partir de photos). Photos de référence du joueur + photo du maillot + prompt → une ou plusieurs propositions,
   puis cadrage au format choisi, logo du site et téléchargement. La clé API est collée dans la page. */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const I18N = window.APP_I18N;
  const S3 = CFG.swapShirt3;
  const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
  const EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
  const QUALITY = 0.92;
  const PLAYER_SLOTS = 3;

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const slugify = (str) => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).join('-');

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
      img.src = src;
    });
  }

  // Photo importée, réduite à « max » px de côté (moins lourde à envoyer, même rendu pour le modèle)
  async function fileToCanvas(file, max) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvasToBlob = (c, type, quality) => new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('export vide'))), type, quality);
  });

  function trimTransparent(src) {
    const w = src.width;
    const h = src.height;
    const c = makeCanvas(w, h);
    const x = c.getContext('2d', { willReadFrequently: true });
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

  const prefs = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`mps:${key}`);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        if (value == null) localStorage.removeItem(`mps:${key}`);
        else localStorage.setItem(`mps:${key}`, JSON.stringify(value));
      } catch { /* ignoré */ }
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
  const state = {
    key: prefs.get('swap3:key', ''), // mémorisée seulement si la case est cochée
    remember: !!prefs.get('swap3:key', ''),
    playerName: prefs.get('swap3:player', ''),
    clubName: prefs.get('swap3:club', ''),
    photos: Array(PLAYER_SLOTS).fill(null), // photos du joueur (canvas réduits)
    shirt: null, // photo du maillot
    prompt: '',
    promptEdited: false,
    model: prefs.get('swap3:model', S3.models[0]),
    format: prefs.get('swap3:format', S3.formats[0].id),
    quality: prefs.get('swap3:quality', 'high'),
    count: prefs.get('swap3:count', 1),
    results: [], // { img, w, h, format } : propositions reçues
    selected: -1,
    busy: null, // { started, controller, timer }
    site: null,
    logoLight: prefs.get('swap3:logoLight', true),
    frames: {}, // cadrage de chaque proposition : { zoom, cx, cy }
  };
  if (!S3.models.includes(state.model)) state.model = S3.models[0];

  let siteToken = 0;
  let drag = null;
  const preview = { url: '', blob: null };

  const els = {
    canvas: $('#editor'),
    stage: $('#stage'),
    emptyState: $('#emptyState'),
    stageBusy: $('#stageBusy'),
    stageBusyText: $('#stageBusyText'),
    cancelBtn: $('#cancelBtn'),
    results: $('#results'),
    status: $('#statusText'),
    langSelect: $('#langSelect'),
    apiKey: $('#apiKey'),
    rememberKey: $('#rememberKey'),
    playerName: $('#playerName'),
    playerPhotos: $('#playerPhotos'),
    clubName: $('#clubName'),
    shirtPhoto: $('#shirtPhoto'),
    promptInput: $('#promptInput'),
    promptResetBtn: $('#promptResetBtn'),
    modelSelect: $('#modelSelect'),
    formatChoice: $('#formatChoice'),
    qualitySelect: $('#qualitySelect'),
    countSelect: $('#countSelect'),
    generateBtn: $('#generateBtn'),
    siteSelect: $('#siteSelect'),
    logoLight: $('#logoLight'),
    zoomRange: $('#zoomRange'),
    zoomOut: $('#zoomOut'),
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
  const slots = []; // cases photo : { root, img, text, kind, index }

  // ---------- Prompt ----------
  // Prompt type, rempli avec le nom du joueur, du club et le nombre de photos de référence (envoyées avant le
  // maillot, dans cet ordre)
  function promptTemplate() {
    const n = state.photos.filter(Boolean).length || 1;
    const player = state.playerName.trim() || t('swap3.playerFallback');
    const club = state.clubName.trim() || t('swap3.clubFallback');
    return [
      t('swap3.promptIntro', { player, club }),
      t(n === 1 ? 'swap3.promptRefOne' : 'swap3.promptRefMany', { player, n }),
      t('swap3.promptShirt', { club }),
      t('swap3.promptStyle'),
    ].join(' ');
  }

  function refreshPrompt() {
    if (state.promptEdited) return;
    state.prompt = promptTemplate();
    els.promptInput.value = state.prompt;
  }

  // ---------- Format et cadrage ----------
  const currentFormat = () => S3.formats.find((f) => f.id === state.format) || S3.formats[0];
  const result = () => state.results[state.selected] || null;
  const frameSize = () => {
    const r = result();
    const f = r ? r.format : currentFormat();
    return { w: f.width, h: f.height };
  };
  const frameOf = () => {
    if (!state.frames[state.selected]) state.frames[state.selected] = { zoom: 100, cx: null, cy: null };
    return state.frames[state.selected];
  };

  // Image générée → image finale : elle couvre le cadre (zoom réglable), centrée par défaut
  function view() {
    const F = frameSize();
    const r = result();
    const fr = frameOf();
    const s = Math.max(F.w / r.w, F.h / r.h) * (fr.zoom / 100);
    const hw = F.w / (2 * s);
    const hh = F.h / (2 * s);
    const cx = clamp(fr.cx ?? r.w / 2, hw, r.w - hw);
    const cy = clamp(fr.cy ?? r.h / 2, hh, r.h - hh);
    return { s, tx: F.w / 2 - cx * s, ty: F.h / 2 - cy * s, cx, cy };
  }

  // ---------- Rendu ----------
  function renderScene(c, k) {
    const F = frameSize();
    c.save();
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, F.w, F.h);
    const r = result();
    if (r) {
      const v = view();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(r.img, v.tx, v.ty, r.w * v.s, r.h * v.s);
    }
    drawSiteLogo(c, F);
    c.restore();
  }

  function drawSiteLogo(c, F) {
    const site = state.site;
    if (!site) return;
    const m = F.w * S3.logo.margin;
    const bw = F.w * S3.logo.w;
    const bh = F.w * S3.logo.h;
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

  // Zone d'image au format choisi, sans dépasser la hauteur de l'écran
  function layoutStage() {
    const F = frameSize();
    els.stage.style.aspectRatio = `${F.w} / ${F.h}`;
    els.stage.style.width = `min(100%, calc((100vh - 260px) * ${F.w / F.h}))`;
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
    if (result()) renderScene(ctx, w / frameSize().w);
  }

  // ---------- Interface ----------
  function buildSlots() {
    const make = (parent, kind, index, labelKey) => {
      const root = document.createElement('label');
      root.className = 'drop ref-slot';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.hidden = true;
      const img = document.createElement('img');
      img.alt = '';
      img.hidden = true;
      const text = document.createElement('span');
      text.dataset.i18n = labelKey;
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'ref-clear';
      clear.textContent = '×';
      clear.hidden = true;
      clear.dataset.i18nAttr = 'aria-label:swap3.removePhoto;title:swap3.removePhoto';
      root.append(input, img, text, clear);
      parent.append(root);
      const slot = { root, img, text, clear, kind, index };
      slots.push(slot);
      input.addEventListener('change', () => {
        if (input.files[0]) setRefPhoto(slot, input.files[0]);
        input.value = '';
      });
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setRef(slot, null);
      });
      bindDrop(root, (file) => setRefPhoto(slot, file));
    };
    for (let i = 0; i < PLAYER_SLOTS; i++) make(els.playerPhotos, 'player', i, 'swap3.playerPhoto');
    make(els.shirtPhoto, 'shirt', 0, 'swap3.shirtPhoto');
  }

  const getRef = (slot) => (slot.kind === 'shirt' ? state.shirt : state.photos[slot.index]);
  function setRef(slot, canvas) {
    if (slot.kind === 'shirt') state.shirt = canvas;
    else state.photos[slot.index] = canvas;
    refreshPrompt();
    refreshUI();
  }

  async function setRefPhoto(slot, file) {
    if (!file || !file.type.startsWith('image/')) { toast(t('toast.notImage')); return; }
    try {
      setRef(slot, await fileToCanvas(file, S3.uploadMax));
    } catch {
      toast(t('toast.unreadable'));
    }
  }

  // Modèles et qualités : les modèles 2.5 acceptent aussi « xhigh » et « max »
  function populateGeneration() {
    els.modelSelect.replaceChildren(...S3.models.map((m) => new Option(m, m, false, m === state.model)));
    els.formatChoice.replaceChildren(...S3.formats.map((f) => new Option(`${f.label} · ${f.width} × ${f.height} px`, f.id, false, f.id === state.format)));
    const extra = state.model.startsWith('gpt-image-2.5');
    const qualities = ['medium', 'high', ...(extra ? ['xhigh', 'max'] : [])];
    if (!qualities.includes(state.quality)) state.quality = 'high';
    els.qualitySelect.replaceChildren(...qualities.map((q) => new Option(t(`swap3.quality.${q}`), q, false, q === state.quality)));
    els.countSelect.value = String(state.count);
  }

  function refreshUI() {
    slots.forEach((slot) => {
      const c = getRef(slot);
      slot.img.hidden = !c;
      slot.clear.hidden = !c;
      if (c && slot.shown !== c) slot.img.src = c.toDataURL('image/jpeg', 0.6);
      slot.shown = c;
      slot.root.classList.toggle('has-photo', !!c);
      slot.text.hidden = !!c;
    });
    const hasResult = !!result();
    els.emptyState.hidden = hasResult || !!state.busy;
    els.stageBusy.hidden = !state.busy;
    els.generateBtn.disabled = !!state.busy;
    els.previewBtn.disabled = !hasResult || !!state.busy;
    els.zoomRange.disabled = !hasResult;
    els.zoomRange.value = hasResult ? frameOf().zoom : 100;
    els.zoomOut.textContent = `${hasResult ? frameOf().zoom : 100} %`;
    els.logoLight.checked = state.logoLight;
    els.rememberKey.checked = state.remember;

    els.results.hidden = !state.results.length;
    els.results.replaceChildren(...state.results.map((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'result-thumb';
      b.setAttribute('aria-pressed', String(i === state.selected));
      b.setAttribute('aria-label', t('swap3.resultN', { n: i + 1 }));
      const img = document.createElement('img');
      img.src = r.thumb;
      img.alt = '';
      b.append(img);
      b.addEventListener('click', () => selectResult(i));
      return b;
    }));

    let status = t('swap3.statusStart');
    if (state.busy) status = t('swap3.statusBusy');
    else if (hasResult) status = t('swap3.statusResult', { n: state.selected + 1, total: state.results.length });
    els.status.textContent = status;
  }

  function selectResult(i) {
    state.selected = i;
    layoutStage();
    refreshUI();
    paint();
  }

  function toast(msg, long = false) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove('show'), long ? 9000 : 3600);
  }

  // ---------- Génération (API Images d'OpenAI) ----------
  function sizeFor(model, f) {
    return model === 'gpt-image-1.5' ? f.legacy : f.request;
  }

  // Vérifie la clé et l'accès au modèle (gratuit) : les erreurs de l'API Images ne sont pas lisibles depuis
  // une page web (pas d'en-tête CORS sur ses réponses d'erreur), celles-ci le sont. Renvoie le message ou null.
  async function checkAccess(key, model, signal) {
    const res = await fetch(`${S3.modelsEndpoint}/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` }, signal });
    if (res.ok) return null;
    const json = await res.json().catch(() => null);
    return (json && json.error && json.error.message) || `HTTP ${res.status}`;
  }

  async function generate() {
    const key = els.apiKey.value.trim();
    const photos = state.photos.filter(Boolean);
    const prompt = els.promptInput.value.trim();
    if (!key) { toast(t('swap3.needKey')); els.apiKey.focus(); return; }
    if (!photos.length) { toast(t('swap3.needPlayer')); return; }
    if (!state.shirt) { toast(t('swap3.needShirt')); return; }
    if (!prompt) { toast(t('swap3.needPrompt')); return; }
    const f = currentFormat();
    const body = new FormData();
    body.append('model', state.model);
    body.append('prompt', prompt);
    // Images 1 à n : le joueur ; dernière image : le maillot (l'ordre est celui annoncé dans le prompt)
    for (const [i, c] of photos.entries()) body.append('image[]', await canvasToBlob(c, 'image/jpeg', 0.92), `joueur-${i + 1}.jpg`);
    body.append('image[]', await canvasToBlob(state.shirt, 'image/jpeg', 0.92), 'maillot.jpg');
    body.append('size', sizeFor(state.model, f));
    body.append('quality', state.quality);
    body.append('n', String(state.count));
    body.append('output_format', 'jpeg');
    body.append('output_compression', '95');
    // Fidélité au visage : à préciser pour gpt-image-1.5 seulement (gpt-image-2 et suivants : à omettre)
    if (state.model === 'gpt-image-1.5') body.append('input_fidelity', 'high');

    const controller = new AbortController();
    const started = performance.now();
    state.busy = { controller, started };
    const tick = () => {
      els.stageBusyText.textContent = t('swap3.generating', { s: Math.round((performance.now() - started) / 1000) });
    };
    tick();
    state.busy.timer = setInterval(tick, 1000);
    refreshUI();
    let checked = false;
    try {
      const refused = await checkAccess(key, state.model, controller.signal);
      if (refused) throw new Error(refused);
      checked = true;
      const res = await fetch(S3.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json && json.error && json.error.message) || `HTTP ${res.status}`);
      const items = (json && json.data) || [];
      if (!items.length) throw new Error(t('swap3.noImage'));
      const before = state.results.length;
      for (const item of items) {
        const img = await loadImage(`data:image/jpeg;base64,${item.b64_json}`);
        const th = makeCanvas(160, (160 * img.naturalHeight) / img.naturalWidth);
        th.getContext('2d').drawImage(img, 0, 0, th.width, th.height);
        state.results.push({ img, w: img.naturalWidth, h: img.naturalHeight, format: f, thumb: th.toDataURL('image/jpeg', 0.7) });
      }
      state.selected = before;
      layoutStage();
      toast(t('swap3.done', { n: items.length, s: num((performance.now() - started) / 1000, 0) }));
    } catch (err) {
      if (err.name === 'AbortError') toast(t('swap3.cancelled'));
      // Erreur réseau après une clé et un modèle valides : refus de l'API Images, dont le détail n'est pas
      // lisible depuis la page (organisation non vérifiée, contenu refusé, crédits épuisés…)
      else if (err instanceof TypeError) toast(t(checked ? 'swap3.refusedHidden' : 'swap3.network'), true);
      else toast(t('swap3.failed', { msg: err.message }), true);
    } finally {
      clearInterval(state.busy.timer);
      state.busy = null;
      refreshUI();
      paint();
    }
  }

  // ---------- Pointeur (cadrage) ----------
  function onPointerDown(e) {
    if (!result()) return;
    const r = els.canvas.getBoundingClientRect();
    const F = frameSize();
    const v = view();
    drag = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, k: F.w / r.width / v.s };
    els.canvas.setPointerCapture(e.pointerId);
    els.canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!drag) return;
    const fr = frameOf();
    fr.cx = drag.cx - (e.clientX - drag.x) * drag.k;
    fr.cy = drag.cy - (e.clientY - drag.y) * drag.k;
    paint();
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    els.canvas.style.cursor = 'grab';
    const v = view();
    Object.assign(frameOf(), { cx: v.cx, cy: v.cy });
  }

  function onWheel(e) {
    if (!result()) return;
    e.preventDefault();
    const fr = frameOf();
    fr.zoom = clamp(fr.zoom + (e.deltaY < 0 ? 5 : -5), 100, 300);
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
    prefs.set('swap3:site', site ? site.id : '');
    paint();
  }

  // ---------- Aperçu & export ----------
  async function renderPreview() {
    const F = frameSize();
    const c = makeCanvas(F.w, F.h);
    renderScene(c.getContext('2d'), 1);
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
    const r = result();
    if (!r) return;
    els.filenameInput.value = [
      S3.filePrefix,
      slugify(state.playerName),
      slugify(state.clubName),
      state.site && state.site.id,
      r.format.id,
    ].filter(Boolean).join('-');
    els.previewImg.setAttribute('src', '');
    els.dialog.showModal();
    await renderPreview();
  }

  function download() {
    if (!preview.blob) return;
    const name = (slugify(els.filenameInput.value) || S3.filePrefix) + (EXT[preview.blob.type] || '.png');
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

  // Clé : en mémoire, et dans le navigateur seulement si « Mémoriser » est coché
  function saveKey() {
    prefs.set('swap3:key', state.remember && els.apiKey.value.trim() ? els.apiKey.value.trim() : null);
  }

  function bindEvents() {
    els.apiKey.value = state.key;
    els.apiKey.addEventListener('input', saveKey);
    els.rememberKey.addEventListener('change', () => {
      state.remember = els.rememberKey.checked;
      saveKey();
    });

    els.playerName.value = state.playerName;
    els.clubName.value = state.clubName;
    els.playerName.addEventListener('input', () => {
      state.playerName = els.playerName.value;
      prefs.set('swap3:player', state.playerName);
      refreshPrompt();
    });
    els.clubName.addEventListener('input', () => {
      state.clubName = els.clubName.value;
      prefs.set('swap3:club', state.clubName);
      refreshPrompt();
    });
    els.promptInput.addEventListener('input', () => {
      state.prompt = els.promptInput.value;
      state.promptEdited = state.prompt !== promptTemplate();
    });
    els.promptResetBtn.addEventListener('click', () => {
      state.promptEdited = false;
      refreshPrompt();
    });

    els.modelSelect.addEventListener('change', () => {
      state.model = els.modelSelect.value;
      prefs.set('swap3:model', state.model);
      populateGeneration();
    });
    els.formatChoice.addEventListener('change', () => {
      state.format = els.formatChoice.value;
      prefs.set('swap3:format', state.format);
    });
    els.qualitySelect.addEventListener('change', () => {
      state.quality = els.qualitySelect.value;
      prefs.set('swap3:quality', state.quality);
    });
    els.countSelect.addEventListener('change', () => {
      state.count = Number(els.countSelect.value);
      prefs.set('swap3:count', state.count);
    });
    els.generateBtn.addEventListener('click', generate);
    els.cancelBtn.addEventListener('click', () => { if (state.busy) state.busy.controller.abort(); });

    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerup', onPointerUp);
    els.canvas.addEventListener('pointercancel', onPointerUp);
    els.canvas.addEventListener('wheel', onWheel, { passive: false });
    els.canvas.style.cursor = 'grab';
    els.zoomRange.addEventListener('input', () => {
      if (!result()) return;
      frameOf().zoom = Number(els.zoomRange.value);
      refreshUI();
      paint();
    });

    els.siteSelect.addEventListener('change', () => selectSite(els.siteSelect.value));
    els.logoLight.addEventListener('change', () => {
      state.logoLight = els.logoLight.checked;
      prefs.set('swap3:logoLight', state.logoLight);
      selectSite(state.site ? state.site.id : '');
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
      populateGeneration();
      refreshPrompt();
      refreshUI();
    });

    new ResizeObserver(() => paint()).observe(els.stage);
  }

  // ---------- Démarrage ----------
  buildSlots();
  document.documentElement.lang = lang;
  applyStaticTexts();
  bindEvents();
  populateSites();
  populateGeneration();
  refreshPrompt();
  layoutStage();
  refreshUI();
  selectSite(prefs.get('swap3:site', ''));

  // Exposé pour le débogage dans la console.
  window.Swap3Studio = { state, generate, paint, selectResult };
})();

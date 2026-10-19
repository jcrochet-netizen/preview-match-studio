/* Preview Match Studio — éditeur de visuels « Club A vs Club B » */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const W = CFG.width;
  const H = CFG.height;
  const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
  const EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
  const QUALITY = 0.92;
  const SNAP = 8; // distance de magnétisme, en px de l'image finale
  const SCALE_MIN = 0.2;
  const SCALE_MAX = 2.5;

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const STOP_WORDS = new Set(['logo', 'logotype', 'icon', 'primary', 'official', 'transparent']);

  function slugify(str, dropStopWords = false) {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !(dropStopWords && STOP_WORDS.has(t)))
      .join('-');
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
      img.src = src;
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Certains SVG sans dimensions renvoient 0 : on les traite comme des carrés.
  function imgSize(img) {
    return { w: img.naturalWidth || 512, h: img.naturalHeight || 512 };
  }

  // Retire les marges transparentes autour d'un logo (fréquentes dans les PNG téléchargés)
  // et limite sa taille pour garder l'éditeur fluide.
  const LOGO_MAX = 1600;
  const isVector = (img) => /^data:image\/svg|\.svg([?#]|$)/i.test(img.src);

  async function trimLogo(img) {
    try {
      // Un SVG est d'abord dessiné en haute définition : sinon il serait flou une fois agrandi.
      let src = img;
      let { w, h } = imgSize(img);
      const vector = isVector(img);
      if (vector) {
        const k = LOGO_MAX / Math.max(w, h);
        const rc = document.createElement('canvas');
        rc.width = Math.round(w * k);
        rc.height = Math.round(h * k);
        rc.getContext('2d').drawImage(img, 0, 0, rc.width, rc.height);
        src = rc;
        w = rc.width;
        h = rc.height;
      }
      const probe = Math.min(1, 800 / Math.max(w, h)); // détection sur une version réduite
      const pw = Math.max(1, Math.round(w * probe));
      const ph = Math.max(1, Math.round(h * probe));
      const pc = document.createElement('canvas');
      pc.width = pw;
      pc.height = ph;
      const px = pc.getContext('2d', { willReadFrequently: true });
      px.drawImage(src, 0, 0, pw, ph);
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
      if (maxX < 0) return img; // image entièrement transparente
      // Un pixel de marge pour ne pas rogner l'anticrénelage des bords
      const sx = Math.max(0, (minX - 1) / probe);
      const sy = Math.max(0, (minY - 1) / probe);
      const sw = Math.min(w, (maxX + 2) / probe) - sx;
      const sh = Math.min(h, (maxY + 2) / probe) - sy;
      const out = Math.min(1, LOGO_MAX / Math.max(sw, sh));
      if (!vector && sw > w * 0.98 && sh > h * 0.98 && out === 1) return img;
      const oc = document.createElement('canvas');
      oc.width = Math.max(1, Math.round(sw * out));
      oc.height = Math.max(1, Math.round(sh * out));
      const ox = oc.getContext('2d');
      ox.imageSmoothingQuality = 'high';
      ox.drawImage(src, sx, sy, sw, sh, 0, 0, oc.width, oc.height);
      return await loadImage(oc.toDataURL('image/png'));
    } catch {
      return img;
    }
  }

  function formatSize(bytes) {
    const num = (n, digits) => n.toLocaleString(lang, { maximumFractionDigits: digits });
    return bytes < 1048576
      ? t('size.kb', { n: num(Math.round(bytes / 1024), 0) })
      : t('size.mb', { n: num(bytes / 1048576, 1) });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  // Préférences légères (localStorage) : peuvent être indisponibles en navigation privée.
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

  // ---------- Langue ----------
  const I18N = window.APP_I18N;

  // Langue mémorisée, sinon celle du navigateur (portugais → pt-BR, anglais → en), sinon français.
  function detectLang() {
    const saved = prefs.get('lang', null);
    if (saved && I18N.dict[saved]) return saved;
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('pt')) return 'pt-BR';
    if (nav.startsWith('en')) return 'en';
    return 'fr';
  }
  let lang = detectLang();

  // Texte traduit ; une clé absente retombe sur le français. {nom} est remplacé par params.nom.
  function t(key, params = {}) {
    const str = I18N.dict[lang]?.[key] ?? I18N.dict.fr[key] ?? key;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  }

  // Valeur de config traduisible : texte unique ou objet { fr, en, 'pt-BR' }.
  const loc = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v[lang] ?? v.fr ?? Object.values(v)[0] : v);
  const sportLabel = (sport) => loc(sport.label);
  const sideName = (i) => loc(state.sport.sides)[i];
  const pct = (scale) => `${Math.round(scale * 100)}${lang === 'fr' ? ' ' : ''}%`; // « 100 % » en français, « 100% » ailleurs

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

  // Stockage des images ajoutées depuis l'interface (templates, logos de sites) : IndexedDB.
  const store = (() => {
    let dbPromise;
    const db = () => {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open('preview-match-studio', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('kv');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbPromise;
    };
    const run = async (mode, fn) => {
      const d = await db();
      return new Promise((resolve, reject) => {
        const tx = d.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      });
    };
    return {
      async get(key) { try { return await run('readonly', (s) => s.get(key)); } catch { return undefined; } },
      async set(key, value) { try { await run('readwrite', (s) => s.put(value, key)); return true; } catch { return false; } },
      async del(key) { try { await run('readwrite', (s) => s.delete(key)); return true; } catch { return false; } },
    };
  })();

  // ---------- État ----------
  const makeLogo = () => ({ img: null, name: '', teamId: '', x: 0, y: 0, scale: 1, locked: false });

  const state = {
    sport: CFG.sports[0],
    template: null,
    templateInfo: { source: 'placeholder', name: '' },
    logos: [makeLogo(), makeLogo()],
    selected: -1,
    hover: -1,
    guides: [],
    site: null,
    siteHeight: CFG.siteLogo.defaultHeight,
    customSites: [],
    vs: prefs.get('vs', false),
    shadow: prefs.get('shadow', true),
  };

  let drag = null;
  let templateToken = 0;
  let siteToken = 0;
  const siteImages = new Map();
  const teamImages = new Map();
  const teamTokens = [0, 0];
  const preview = { url: '', blob: null };

  // ---------- DOM ----------
  const els = {
    stage: $('#stage'),
    canvas: $('#editor'),
    sportSeg: $('#sportSeg'),
    langSelect: $('#langSelect'),
    resetBtn: $('#resetBtn'),
    status: $('#statusText'),
    templateThumbWrap: $('#templateThumbWrap'),
    templateThumb: $('#templateThumb'),
    templateName: $('#templateName'),
    templateNote: $('#templateNote'),
    templateInput: $('#templateInput'),
    templateResetBtn: $('#templateResetBtn'),
    vsToggle: $('#vsToggle'),
    teams: $('#teams'),
    mirrorBtn: $('#mirrorBtn'),
    shadowToggle: $('#shadowToggle'),
    siteSelect: $('#siteSelect'),
    siteNote: $('#siteNote'),
    siteSize: $('#siteSize'),
    siteSizeOut: $('#siteSizeOut'),
    deleteSiteBtn: $('#deleteSiteBtn'),
    addSite: $('#addSite'),
    addSiteForm: $('#addSiteForm'),
    newSiteName: $('#newSiteName'),
    newSiteLogo: $('#newSiteLogo'),
    newSiteLogoName: $('#newSiteLogoName'),
    confirmDialog: $('#confirmDialog'),
    confirmText: $('#confirmText'),
    checklist: $('#checklist'),
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
  const teamEls = [];

  // ---------- Géométrie ----------
  // Le template dépend du site choisi (à défaut, du sport) : cette clé sert au template importé
  // depuis l'interface et à la mémoire des dernières positions validées.
  const contextKey = () => `${state.sport.id}:${state.site ? state.site.id : '-'}`;
  const teamLogoCfg = () => (state.site && state.site.teamLogo) || state.sport.teamLogo || CFG.teamLogo;

  function defaultPos(i) {
    const [x, y] = teamLogoCfg().positions[i];
    return { x, y, scale: 1 };
  }

  // Un nouveau logo reprend la dernière position validée pour ce sport (le template ne change pas).
  function startPos(i) {
    return prefs.get(`pos:${contextKey()}:${i}`, null) || defaultPos(i);
  }

  function logoRect(l) {
    const { w, h } = imgSize(l.img);
    const s = (teamLogoCfg().box / Math.max(w, h)) * l.scale;
    const dw = w * s;
    const dh = h * s;
    return { x: l.x - dw / 2, y: l.y - dh / 2, w: dw, h: dh };
  }

  function slotRect(i) {
    const p = startPos(i);
    const s = 230;
    return { x: p.x - s / 2, y: p.y - s / 2, w: s, h: s };
  }

  const inRect = (p, r, pad = 0) =>
    p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

  function hitLogo(p) {
    const order = state.selected >= 0 ? [state.selected, 1 - state.selected] : [1, 0];
    return order.find((i) => state.logos[i].img && inRect(p, logoRect(state.logos[i]), 6)) ?? -1;
  }

  function hitEmptySlot(p) {
    return [0, 1].find((i) => !state.logos[i].img && inRect(p, slotRect(i))) ?? -1;
  }

  function toLogical(e) {
    const r = els.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  // Magnétisme : centre vertical de l'image, même hauteur que l'autre logo, symétrie horizontale.
  function snap(i, x, y) {
    const other = state.logos[1 - i];
    const guides = [];
    if (Math.abs(y - H / 2) < SNAP) {
      y = H / 2;
      guides.push({ y });
    } else if (other.img && Math.abs(y - other.y) < SNAP) {
      y = other.y;
      guides.push({ y });
    }
    if (other.img && Math.abs(x - (W - other.x)) < SNAP) {
      x = W - other.x;
      guides.push({ x }, { x: other.x });
    }
    state.guides = guides;
    return { x, y };
  }

  // ---------- Rendu ----------
  function render(c, editor) {
    const k = c.getTransform().a; // les ombres ignorent la transformation : on les met à l'échelle
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';

    drawBackground(c, editor, k);
    if (state.vs) drawVS(c, k);

    state.logos.forEach((l) => {
      if (!l.img) return;
      const r = logoRect(l);
      c.save();
      if (state.shadow) {
        c.shadowColor = 'rgba(0, 0, 0, 0.55)';
        c.shadowBlur = 30 * k;
        c.shadowOffsetY = 12 * k;
      }
      c.drawImage(l.img, r.x, r.y, r.w, r.h);
      c.restore();
    });

    drawSiteLogo(c);
    if (editor) drawOverlay(c);
  }

  function drawBackground(c, editor, k) {
    if (!state.template) {
      drawPlaceholder(c, editor, k);
      return;
    }
    // Recadrage « cover » : le template remplit tout le 16:9, centré.
    const { w, h } = imgSize(state.template);
    const s = Math.max(W / w, H / h);
    c.drawImage(state.template, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
  }

  function drawPlaceholder(c, editor, k) {
    const [left, right] = state.sport.id === 'football' ? ['#0d4a32', '#0a2e4d'] : ['#13235c', '#6b1222'];
    c.fillStyle = left;
    c.fillRect(0, 0, W, H);
    c.fillStyle = right;
    c.beginPath();
    c.moveTo(W / 2 + 80, 0);
    c.lineTo(W, 0);
    c.lineTo(W, H);
    c.lineTo(W / 2 - 80, H);
    c.closePath();
    c.fill();

    const glow = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.75);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);

    c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(W / 2 + 80, 0);
    c.lineTo(W / 2 - 80, H);
    c.stroke();

    if (!state.vs) drawVS(c, k);

    if (editor) {
      c.save();
      c.font = '600 15px Inter, system-ui, sans-serif';
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.textBaseline = 'bottom';
      c.fillText(t('canvas.placeholderHint'), 28, H - 22);
      c.restore();
    }
  }

  function drawVS(c, k) {
    c.save();
    c.font = 'italic 150px Anton, Impact, "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0, 0, 0, 0.6)';
    c.shadowBlur = 24 * k;
    c.shadowOffsetY = 6 * k;
    c.fillStyle = '#ffffff';
    c.fillText('VS', W / 2, H / 2 + 6);
    c.restore();
  }

  function drawSiteLogo(c) {
    const site = state.site;
    if (!site) return;
    const m = CFG.siteLogo.margin;
    const h = state.siteHeight;
    const maxW = W * 0.32;

    if (site.img) {
      const { w: iw, h: ih } = imgSize(site.img);
      let dh = h;
      let dw = (iw * h) / ih;
      if (dw > maxW) {
        dw = maxW;
        dh = (ih * maxW) / iw;
      }
      c.drawImage(site.img, W - m - dw, m, dw, dh);
      return;
    }

    // Pas de fichier logo : on affiche le nom du site dans une pastille.
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

  // Éléments d'édition (cadres, poignées, repères) : jamais présents dans l'export.
  function drawOverlay(c) {
    const u = W / (els.canvas.clientWidth || W); // 1 px écran exprimé en px de l'image
    c.save();

    state.logos.forEach((l, i) => {
      if (!l.img) {
        const r = slotRect(i);
        c.setLineDash([10 * u, 8 * u]);
        c.lineWidth = 2 * u;
        c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        c.fillStyle = 'rgba(0, 0, 0, 0.28)';
        roundRect(c, r.x, r.y, r.w, r.h, 18);
        c.fill();
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = 'rgba(255, 255, 255, 0.9)';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        // Taille plafonnée pour que le texte tienne dans l'emplacement, même sur petit écran.
        const fs = Math.min(16 * u, 28);
        c.font = `700 ${fs}px Inter, system-ui, sans-serif`;
        c.fillText(`+ ${sideName(i)}`, r.x + r.w / 2, r.y + r.h / 2 - fs * 0.6);
        c.font = `500 ${fs * 0.68}px Inter, system-ui, sans-serif`;
        c.fillStyle = 'rgba(255, 255, 255, 0.6)';
        c.fillText(t('canvas.slotHint'), r.x + r.w / 2, r.y + r.h / 2 + fs * 0.75);
        return;
      }

      const r = logoRect(l);
      if (l.locked) {
        // Pastille « validé »
        const cx = r.x + r.w;
        const cy = r.y;
        const rad = 12 * u;
        c.fillStyle = '#2bd17e';
        c.beginPath();
        c.arc(cx, cy, rad, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2.2 * u;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(cx - 5 * u, cy + 0.5 * u);
        c.lineTo(cx - 1.5 * u, cy + 4 * u);
        c.lineTo(cx + 5 * u, cy - 3.5 * u);
        c.stroke();
        if (i === state.selected || i === state.hover) {
          c.setLineDash([4 * u, 4 * u]);
          c.lineWidth = 1.5 * u;
          c.strokeStyle = 'rgba(43, 209, 126, 0.8)';
          c.strokeRect(r.x, r.y, r.w, r.h);
          c.setLineDash([]);
        }
      } else if (i === state.selected) {
        c.setLineDash([7 * u, 5 * u]);
        c.lineWidth = 2 * u;
        c.strokeStyle = '#ff6b1f';
        c.strokeRect(r.x, r.y, r.w, r.h);
        c.setLineDash([]);
        const hs = 9 * u;
        c.fillStyle = '#ffffff';
        c.strokeStyle = '#ff6b1f';
        [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([hx, hy]) => {
          c.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          c.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        });
      } else if (i === state.hover) {
        c.lineWidth = 1.5 * u;
        c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        c.strokeRect(r.x, r.y, r.w, r.h);
      }
    });

    if (state.guides.length) {
      c.strokeStyle = '#ff3fa4';
      c.lineWidth = 1.5 * u;
      c.setLineDash([6 * u, 5 * u]);
      state.guides.forEach((g) => {
        c.beginPath();
        if (g.y != null) {
          c.moveTo(0, g.y);
          c.lineTo(W, g.y);
        } else {
          c.moveTo(g.x, 0);
          c.lineTo(g.x, H);
        }
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
  function buildSportSeg() {
    CFG.sports.forEach((sport) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.textContent = sportLabel(sport);
      b.dataset.id = sport.id;
      b.addEventListener('click', () => sport !== state.sport && setSport(sport));
      els.sportSeg.append(b);
    });
  }

  function buildTeamCards() {
    const tpl = $('#teamTpl');
    [0, 1].forEach((i) => {
      const root = tpl.content.firstElementChild.cloneNode(true);
      const q = (role) => root.querySelector(`[data-role="${role}"]`);
      const t = {
        root,
        label: q('label'),
        side: q('side'),
        badge: q('badge'),
        club: q('club'),
        drop: q('drop'),
        file: q('file'),
        thumb: q('thumb'),
        dropText: q('dropText'),
        size: q('size'),
        sizeOut: q('sizeOut'),
        validate: q('validate'),
        edit: q('edit'),
        reset: q('reset'),
      };
      t.club.addEventListener('change', () => selectTeam(i, t.club.value));
      t.file.addEventListener('change', () => {
        if (t.file.files[0]) setLogo(i, t.file.files[0]);
        t.file.value = '';
      });
      t.drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        t.drop.classList.add('is-over');
      });
      t.drop.addEventListener('dragleave', () => t.drop.classList.remove('is-over'));
      t.drop.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        t.drop.classList.remove('is-over');
        const file = e.dataTransfer.files[0];
        if (file) setLogo(i, file);
      });
      t.size.addEventListener('input', () => {
        state.logos[i].scale = t.size.value / 100;
        state.selected = i;
        refreshUI();
        draw();
      });
      t.validate.addEventListener('click', () => setLocked(i, true));
      t.edit.addEventListener('click', () => setLocked(i, false));
      t.reset.addEventListener('click', () => {
        Object.assign(state.logos[i], defaultPos(i));
        state.selected = i;
        refreshUI();
        draw();
      });
      root.addEventListener('pointerdown', (e) => {
        if (state.logos[i].img && !e.target.closest('button, input, select')) {
          state.selected = i;
          refreshUI();
          draw();
        }
      });
      els.teams.append(root);
      teamEls.push(t);
    });
  }

  function refreshUI() {
    const sport = state.sport;
    els.sportSeg.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.id === sport.id));
      b.textContent = sportLabel(CFG.sports.find((x) => x.id === b.dataset.id));
    });
    document.querySelectorAll('[data-role="dropLabel"]').forEach((el, i) => { el.textContent = sideName(i); });

    // Fond
    const ti = state.templateInfo;
    els.templateName.textContent = ti.source === 'placeholder' ? t('bg.placeholderName') : ti.name;
    els.templateNote.className = `note${ti.source === 'placeholder' ? ' warn' : ''}`;
    const owner = state.site ? state.site.name : sportLabel(sport);
    els.templateNote.textContent = {
      custom: t('bg.custom', { owner }),
      config: t('bg.config', { owner }),
      placeholder: ti.path ? t('bg.missing', { path: ti.path }) : t('bg.none', { owner }),
    }[ti.source];
    const thumbSrc = state.template ? state.template.src : '';
    if (els.templateThumb.getAttribute('src') !== thumbSrc) els.templateThumb.setAttribute('src', thumbSrc);
    els.templateThumbWrap.classList.toggle('is-football', sport.id === 'football');
    els.templateResetBtn.hidden = ti.source !== 'custom';
    els.vsToggle.checked = state.vs;
    els.shadowToggle.checked = state.shadow;

    // Équipes
    const hasTeams = teamsForSport().length > 0;
    state.logos.forEach((l, i) => {
      const te = teamEls[i];
      te.club.value = l.teamId;
      te.club.disabled = l.locked;
      // Un même club ne peut pas être choisi des deux côtés
      const otherId = state.logos[1 - i].teamId;
      [...te.club.options].forEach((o) => { o.disabled = !!o.value && o.value === otherId; });
      te.label.textContent = sideName(i);
      te.side.textContent = t(i ? 'team.right' : 'team.left');
      te.root.classList.toggle('is-selected', state.selected === i && !l.locked);
      te.root.classList.toggle('is-locked', l.locked);
      const src = l.img ? l.img.src : '';
      if (te.thumb.getAttribute('src') !== src) te.thumb.setAttribute('src', src);
      te.thumb.hidden = !l.img;
      te.dropText.textContent = l.img && !l.teamId ? t('team.dropReplace', { name: l.name })
        : t(hasTeams ? 'team.dropOr' : 'team.dropEmpty');
      const [cls, label] = !l.img ? ['', hasTeams ? 'badge.choose' : 'badge.import']
        : l.locked ? ['ok', 'badge.locked'] : ['warn', 'badge.place'];
      te.badge.className = `badge ${cls}`;
      te.badge.textContent = t(label);
      te.size.value = Math.round(l.scale * 100);
      te.size.disabled = !l.img || l.locked;
      te.sizeOut.textContent = pct(l.scale);
      te.validate.hidden = l.locked;
      te.validate.disabled = !l.img;
      te.edit.hidden = !l.locked;
      te.reset.disabled = !l.img || l.locked;
    });
    const [a, b] = state.logos;
    els.mirrorBtn.disabled = !(a.img && b.img) || b.locked;

    // Site
    const site = state.site;
    els.siteSelect.value = site ? site.id : '';
    els.siteSize.disabled = !site;
    els.siteSize.value = state.siteHeight;
    els.siteSizeOut.textContent = site ? `${state.siteHeight} px` : '';
    els.deleteSiteBtn.hidden = !(site && site.custom);
    els.newSiteLogoName.textContent = els.newSiteLogo.files[0]?.name || t('site.noFile');
    if (site && !site.img) {
      els.siteNote.className = 'note warn';
      els.siteNote.textContent = t('site.missingLogo', { path: site.logo || t('site.undefined') });
    } else {
      els.siteNote.className = 'note';
      els.siteNote.textContent = t(site ? 'site.note' : 'site.noneNote');
    }

    // Checklist
    const items = [
      ...state.logos.map((l, i) => ({
        ok: l.img && l.locked,
        text: t(!l.img ? (hasTeams ? 'check.clubToChoose' : 'check.logoToImport') : l.locked ? 'check.locked' : 'check.toValidate', { side: sideName(i) }),
      })),
      { ok: site ? true : 'warn', text: site ? t('check.site', { name: site.name }) : t('check.noSite') },
    ];
    if (ti.source === 'placeholder') items.unshift({ ok: 'warn', text: t('check.placeholder') });
    els.checklist.replaceChildren(...items.map((it) => {
      const li = document.createElement('li');
      li.className = it.ok === true ? 'ok' : it.ok === 'warn' ? 'warn' : '';
      li.textContent = it.text;
      return li;
    }));
    els.previewBtn.disabled = !isReady();
    els.previewBtn.title = isReady() ? '' : t('export.disabledTitle');

    refreshStatus();
  }

  function refreshStatus() {
    const i = state.selected;
    const l = state.logos[i];
    if (l && l.img) {
      els.status.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = sideName(i);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = `x ${Math.round(l.x)} · y ${Math.round(l.y)} · ${pct(l.scale)}`;
      els.status.append(strong, ' · ', num, l.locked ? t('status.lockedSuffix') : '');
    } else if (isReady()) {
      els.status.textContent = t('status.ready');
    } else if (state.logos.some((x) => x.img)) {
      els.status.textContent = t('status.select');
    } else {
      els.status.textContent = t('status.start');
    }
  }

  const isReady = () => state.logos.every((l) => l.img && l.locked);

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  // ---------- Actions ----------
  async function setSport(sport) {
    state.sport = sport;
    prefs.set('sport', sport.id);
    state.guides = [];
    populateTeamMenus();
    populateSites();
    await selectSite(prefs.get(`site:${sport.id}`, ''));
  }

  // Renvoie false si un chargement plus récent a pris le relais.
  async function loadTemplate() {
    const token = ++templateToken;
    const path = (state.site && state.site.template) || state.sport.template;
    let img = null;
    let info = { source: 'placeholder', name: '', path };

    const custom = await store.get(`template:${contextKey()}`);
    if (custom) {
      try {
        img = await loadImage(custom.data);
        info = { source: 'custom', name: custom.name };
      } catch { /* on retombe sur le template du config */ }
    }
    if (!img && path) {
      try {
        img = await loadImage(path);
        info = { source: 'config', name: path.split('/').pop(), path };
      } catch { /* fond provisoire */ }
    }
    if (token !== templateToken) return false;
    state.template = img;
    state.templateInfo = info;
    return true;
  }

  async function importTemplate(file) {
    if (!file.type.startsWith('image/')) return toast(t('toast.notImage'));
    const data = await readAsDataURL(file);
    let img;
    try { img = await loadImage(data); } catch { return toast(t('toast.unreadable')); }
    const saved = await store.set(`template:${contextKey()}`, { name: file.name, data });
    state.template = img;
    state.templateInfo = { source: 'custom', name: file.name };
    templateToken++;
    const { w, h } = imgSize(img);
    if (Math.abs(w / h - W / H) > 0.02) toast(t('toast.cropped', { w, h }));
    else if (w < W) toast(t('toast.upscaled', { w, W }));
    else if (!saved) toast(t('toast.sessionOnly'));
    else toast(t('toast.templateSaved', { owner: state.site ? state.site.name : sportLabel(state.sport) }));
    refreshUI();
    draw();
  }

  async function resetTemplate() {
    await store.del(`template:${contextKey()}`);
    await loadTemplate();
    refreshUI();
    draw();
  }

  function applyLogo(i, img, name, teamId) {
    const l = state.logos[i];
    if (!l.img) Object.assign(l, startPos(i));
    l.img = img;
    l.name = name;
    l.teamId = teamId;
    l.locked = false;
    state.selected = i;
    refreshUI();
    draw();
  }

  async function setLogo(i, file) {
    if (!file || !file.type.startsWith('image/')) return toast(t('toast.notImage'));
    const token = ++teamTokens[i];
    let img;
    try { img = await trimLogo(await loadImage(await readAsDataURL(file))); } catch { return toast(t('toast.unreadable')); }
    if (token !== teamTokens[i]) return;
    applyLogo(i, img, file.name.replace(/\.[^.]+$/, ''), '');
  }

  // Clubs du sport en cours (js/teams.js), triés par nom
  const teamsForSport = () => ((window.APP_TEAMS || {})[state.sport.id] || [])
    .slice().sort((a, b) => a.name.localeCompare(b.name, lang));

  function populateTeamMenus() {
    const teams = teamsForSport();
    teamEls.forEach((te) => {
      te.club.replaceChildren(new Option(t('team.chooseClub'), ''), ...teams.map((t) => new Option(t.name, t.id)));
      te.club.hidden = !teams.length;
    });
  }

  async function selectTeam(i, id) {
    const team = teamsForSport().find((t) => t.id === id);
    if (!team) return;
    const token = ++teamTokens[i];
    const key = `${state.sport.id}:${team.id}`;
    let img = teamImages.get(key);
    if (!img) {
      try {
        img = await trimLogo(await loadImage(team.logo));
      } catch {
        refreshUI();
        return toast(t('toast.teamLogoMissing', { path: team.logo }));
      }
      teamImages.set(key, img);
    }
    if (token !== teamTokens[i]) return;
    applyLogo(i, img, team.name, team.id);
  }

  function setLocked(i, locked) {
    const l = state.logos[i];
    if (!l.img) return;
    l.locked = locked;
    if (locked) {
      l.x = Math.round(l.x);
      l.y = Math.round(l.y);
      prefs.set(`pos:${contextKey()}:${i}`, { x: l.x, y: l.y, scale: l.scale });
      if (state.selected === i) state.selected = -1;
    } else {
      state.selected = i;
    }
    refreshUI();
    draw();
  }

  function mirror() {
    const [a, b] = state.logos;
    if (!a.img || !b.img) return;
    if (b.locked) return toast(t('toast.unlockFirst', { side: sideName(1) }));
    Object.assign(b, { x: W - a.x, y: a.y, scale: a.scale });
    state.selected = 1;
    refreshUI();
    draw();
  }

  function newVisual() {
    state.logos = [makeLogo(), makeLogo()];
    state.selected = -1;
    state.hover = -1;
    state.guides = [];
    refreshUI();
    draw();
  }

  // ---------- Sites ----------
  function allSites() {
    return [
      ...CFG.sites.map((s) => ({ ...s, custom: false })),
      ...state.customSites.map((s) => ({ ...s, custom: true })),
    ];
  }

  const sitesForSport = () => allSites().filter((s) => !s.sports || s.sports.includes(state.sport.id));

  function populateSites() {
    const sel = els.siteSelect;
    const sites = sitesForSport();
    sel.replaceChildren();
    sel.disabled = !sites.length;
    if (!sites.length) {
      sel.append(new Option(t('site.noneConfigured'), ''));
      return;
    }
    const groups = [
      [t('site.groupConfig'), sites.filter((s) => !s.custom)],
      [t('site.groupCustom'), sites.filter((s) => s.custom)],
    ];
    groups.forEach(([label, list]) => {
      if (!list.length) return;
      const g = document.createElement('optgroup');
      g.label = label;
      list.forEach((s) => g.append(new Option(s.name, s.id)));
      sel.append(g);
    });
  }

  // Sélectionne un site (à défaut, le premier du sport) puis charge son template.
  async function selectSite(id) {
    const token = ++siteToken;
    const sites = sitesForSport();
    const site = sites.find((s) => s.id === id) || sites[0] || null;
    let img = null;
    if (site) {
      img = siteImages.get(site.id);
      if (img === undefined) {
        try { img = site.logo ? await trimLogo(await loadImage(site.logo)) : null; } catch { img = null; }
        siteImages.set(site.id, img);
      }
    }
    if (token !== siteToken) return;
    state.site = site && { ...site, img };
    if (site) {
      state.siteHeight = prefs.get(`siteHeight:${site.id}`, site.height || CFG.siteLogo.defaultHeight);
      prefs.set(`site:${state.sport.id}`, site.id);
    }
    if (!(await loadTemplate())) return;
    refreshUI();
    draw();
  }

  async function addSite(e) {
    e.preventDefault();
    const name = els.newSiteName.value.trim();
    const file = els.newSiteLogo.files[0];
    if (!name) return toast(t('toast.siteNameMissing'));
    if (!file) return toast(t('toast.siteLogoMissing'));
    if (!file.type.startsWith('image/')) return toast(t('toast.siteLogoNotImage'));
    const logo = await readAsDataURL(file);
    const id = `ui-${slugify(name) || 'site'}-${Date.now().toString(36)}`;
    state.customSites.push({ id, name, logo });
    const saved = await store.set('sites', state.customSites);
    populateSites();
    await selectSite(id);
    els.addSiteForm.reset();
    els.addSite.open = false;
    refreshUI();
    toast(t(saved ? 'toast.siteAdded' : 'toast.siteAddedSession', { name }));
  }

  // Confirmation dans la langue de l'interface (window.confirm suivrait celle du navigateur)
  function askConfirm(text) {
    return new Promise((resolve) => {
      els.confirmText.textContent = text;
      els.confirmDialog.returnValue = '';
      els.confirmDialog.addEventListener('close', () => resolve(els.confirmDialog.returnValue === 'ok'), { once: true });
      els.confirmDialog.showModal();
    });
  }

  async function deleteSite() {
    const site = state.site;
    if (!site || !site.custom) return;
    if (!(await askConfirm(t('confirm.deleteSite', { name: site.name })))) return;
    state.customSites = state.customSites.filter((s) => s.id !== site.id);
    siteImages.delete(site.id);
    await store.set('sites', state.customSites);
    populateSites();
    await selectSite('');
  }

  // ---------- Aperçu & export ----------
  function defaultFilename() {
    const [a, b] = state.logos.map((l, i) => slugify(l.name, true) || slugify(sideName(i)));
    return `${a}-vs-${b}-preview`;
  }

  async function renderPreview() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const cx = c.getContext('2d');
    render(cx, false);

    const fmt = els.formatSelect.value;
    let blob;
    try {
      blob = await new Promise((resolve, reject) => {
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('export vide'))), MIME[fmt], QUALITY);
      });
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
    if (!isReady()) return;
    state.selected = -1;
    refreshUI();
    draw();
    els.filenameInput.value = defaultFilename();
    els.previewImg.setAttribute('src', '');
    els.dialog.showModal();
    await renderPreview();
  }

  function download() {
    if (!preview.blob) return;
    const name = (slugify(els.filenameInput.value) || defaultFilename()) + (EXT[preview.blob.type] || '.png');
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    toast(t('toast.downloaded', { name }));
  }

  function openSlotPicker(i) {
    const te = teamEls[i];
    if (te.club.hidden) {
      te.file.click();
      return;
    }
    te.root.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    te.club.focus({ preventScroll: true });
    try { te.club.showPicker(); } catch { /* navigateur sans showPicker : le menu reste sélectionné */ }
  }

  // ---------- Événements ----------
  function bindCanvas() {
    const cv = els.canvas;

    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cv.focus({ preventScroll: true });
      const p = toLogical(e);
      const i = hitLogo(p);
      if (i >= 0) {
        const l = state.logos[i];
        state.selected = i;
        if (l.locked) {
          toast(t('toast.lockedClick'));
        } else {
          drag = { i, dx: p.x - l.x, dy: p.y - l.y };
          cv.setPointerCapture(e.pointerId);
          cv.classList.add('is-dragging');
        }
      } else {
        state.selected = -1;
        const slot = hitEmptySlot(p);
        if (slot >= 0) openSlotPicker(slot);
      }
      refreshUI();
      draw();
    });

    cv.addEventListener('pointermove', (e) => {
      const p = toLogical(e);
      if (drag) {
        const l = state.logos[drag.i];
        let x = clamp(p.x - drag.dx, 0, W);
        let y = clamp(p.y - drag.dy, 0, H);
        state.guides = [];
        if (!e.altKey) ({ x, y } = snap(drag.i, x, y));
        l.x = x;
        l.y = y;
        refreshStatus();
        draw();
        return;
      }
      const i = hitLogo(p);
      cv.style.cursor = i >= 0 ? (state.logos[i].locked ? 'default' : 'grab') : hitEmptySlot(p) >= 0 ? 'pointer' : 'default';
      if (i !== state.hover) {
        state.hover = i;
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
      if (!drag && state.hover !== -1) {
        state.hover = -1;
        draw();
      }
    });

    cv.addEventListener('wheel', (e) => {
      const i = hitLogo(toLogical(e));
      if (i < 0 || state.logos[i].locked) return;
      e.preventDefault();
      const l = state.logos[i];
      l.scale = clamp(l.scale * Math.exp(-e.deltaY * 0.0015), SCALE_MIN, SCALE_MAX);
      state.selected = i;
      refreshUI();
      draw();
    }, { passive: false });

    // Glisser un fichier sur l'image : moitié gauche = équipe A, moitié droite = équipe B.
    const halves = els.stage.querySelectorAll('.drop-hint > div');
    const sideOf = (e) => (toLogical(e).x < W / 2 ? 0 : 1);
    els.stage.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      els.stage.classList.add('is-dropping');
      const side = sideOf(e);
      halves.forEach((h, i) => h.classList.toggle('is-active', i === side));
    });
    els.stage.addEventListener('dragleave', (e) => {
      if (!els.stage.contains(e.relatedTarget)) els.stage.classList.remove('is-dropping');
    });
    els.stage.addEventListener('drop', (e) => {
      e.preventDefault();
      els.stage.classList.remove('is-dropping');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const side = sideOf(e);
      if (state.logos[side].locked) return toast(t('toast.unlockFirst', { side: sideName(side) }));
      setLogo(side, file);
    });
  }

  function bindEvents() {
    bindCanvas();

    // Évite que le navigateur ouvre l'image si on la lâche à côté d'une zone de dépôt.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (els.dialog.open) return;
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'Escape' && state.selected >= 0) {
        state.selected = -1;
        refreshUI();
        draw();
        return;
      }
      const l = state.logos[state.selected];
      if (!l || !l.img || l.locked) return;
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      l.x = clamp(l.x + d[0], 0, W);
      l.y = clamp(l.y + d[1], 0, H);
      refreshStatus();
      draw();
    });

    // Coller une image (Cmd+V) : va dans le logo sélectionné, sinon dans le premier emplacement vide.
    document.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (!file || els.dialog.open) return;
      const sel = state.logos[state.selected];
      const target = sel && !sel.locked ? state.selected : state.logos.findIndex((l) => !l.img);
      if (target < 0) return toast(t('toast.pasteSelect'));
      e.preventDefault();
      setLogo(target, file);
    });

    els.resetBtn.addEventListener('click', newVisual);
    els.templateInput.addEventListener('change', () => {
      const file = els.templateInput.files[0];
      els.templateInput.value = '';
      if (file) importTemplate(file);
    });
    els.templateResetBtn.addEventListener('click', resetTemplate);
    els.vsToggle.addEventListener('change', () => {
      state.vs = els.vsToggle.checked;
      prefs.set('vs', state.vs);
      draw();
    });
    els.shadowToggle.addEventListener('change', () => {
      state.shadow = els.shadowToggle.checked;
      prefs.set('shadow', state.shadow);
      draw();
    });
    els.mirrorBtn.addEventListener('click', mirror);

    els.siteSelect.addEventListener('change', () => selectSite(els.siteSelect.value));
    els.siteSize.addEventListener('input', () => {
      state.siteHeight = Number(els.siteSize.value);
      if (state.site) prefs.set(`siteHeight:${state.site.id}`, state.siteHeight);
      els.siteSizeOut.textContent = `${state.siteHeight} px`;
      draw();
    });
    els.deleteSiteBtn.addEventListener('click', deleteSite);
    els.addSiteForm.addEventListener('submit', addSite);
    els.newSiteLogo.addEventListener('change', refreshUI);

    els.previewBtn.addEventListener('click', openPreview);
    els.formatSelect.value = prefs.get('format', 'jpeg');
    els.formatSelect.addEventListener('change', () => {
      prefs.set('format', els.formatSelect.value);
      renderPreview();
    });
    els.downloadBtn.addEventListener('click', download);
    els.dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => els.dialog.close()));
    els.dialog.addEventListener('click', (e) => { if (e.target === els.dialog) els.dialog.close(); });

    new ResizeObserver(draw).observe(els.canvas);
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', sizeCanvas);
  }

  function buildLangSelect() {
    Object.entries(I18N.languages).forEach(([code, label]) => els.langSelect.append(new Option(label, code)));
    els.langSelect.value = lang;
    els.langSelect.addEventListener('change', () => setLang(els.langSelect.value));
  }

  function setLang(next) {
    lang = I18N.dict[next] ? next : 'fr';
    prefs.set('lang', lang);
    document.documentElement.lang = lang;
    els.langSelect.value = lang;
    applyStaticTexts();
    populateTeamMenus();
    populateSites();
    refreshUI();
    draw();
  }

  // ---------- Démarrage ----------
  async function init() {
    buildSportSeg();
    buildTeamCards();
    buildLangSelect();
    document.documentElement.lang = lang;
    applyStaticTexts();
    bindEvents();
    sizeCanvas();
    state.customSites = (await store.get('sites')) || [];
    const sport = CFG.sports.find((s) => s.id === prefs.get('sport')) || CFG.sports[0];
    await setSport(sport);
    if (document.fonts) document.fonts.ready.then(draw);
  }

  // Exposé pour le débogage dans la console.
  window.PreviewStudio = { state, draw, setLogo };

  init();
})();

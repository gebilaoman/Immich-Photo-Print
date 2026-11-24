// Immich 照片打印：在 Immich 顶栏"分享"左边加一个打印按钮（找不到顶栏时改用右下角浮动按钮）。
// 选中照片（或打开单张大图）后点按钮，进入打印页：左边设置，右边逐页预览，再调用浏览器打印。
// 只读：不修改 Immich 的任何数据。
(() => {
  'use strict';

  if (globalThis.__ipxLoaded) return; // 设置页添加服务器时会补注入一次，避免重复运行
  globalThis.__ipxLoaded = true;

  const { t, refresh: refreshLang, lang } = globalThis.IPX_I18N; // 见 i18n.js
  const ICON = globalThis.IPX_ICONS; // 见 icons.js

  // ---------- 纸张 ----------
  // 尺寸单位 mm，与打印机驱动的纸张尺寸完全一致（不一致时 Chrome 会缩放）：
  // 以爱普生喷墨照片打印机在 macOS 上的 PageSize 为准：3.5x5、4x6、5x7、101.6x180.6mm、A6、A5、A4（照片尺寸都有 .Fullbleed 无边距版）。
  // 名称与爱普生 App 的叫法一致（文字在 i18n.js：paper_<键>）。multi：这种纸是否提供"每张纸印几张"。
  const PAPERS = {
    p9x13: { w: 88.9, h: 127 },
    p10x15: { w: 101.6, h: 152.4 },
    p13x18: { w: 127, h: 177.8 },
    p16x9: { w: 101.6, h: 180.6 },
    a6: { w: 105, h: 148 },
    a5: { w: 148, h: 210, multi: true },
    a4: { w: 210, h: 297, multi: true },
  };
  const PER_PAGE = { 1: [1, 1], 2: [1, 2], 4: [2, 2] }; // 张数 → [列, 行]
  const MULTI_MARGIN = 8; // 一张纸印多张时，纸边和照片间距（mm）
  const BORDERS = { none: 0, thin: 3, wide: 6 }; // 版面：白边宽度（mm）
  const CAP_SIZE = { s: 0.02, m: 0.025, l: 0.032 }; // 字号 = 照片格短边 × 系数（5 寸纸上"中"约 2.2 mm）

  const DEFAULTS = {
    paper: 'p9x13',
    perPage: 1,
    layout: 'none',
    fit: 'cover',
    rotate: true,
    color: 'color',
    capDate: false,
    capTime: false,
    capPlace: false,
    capDesc: false,
    dateStyle: 'long', // long：按语言的长日期；dots：2026.05.24
    capPos: 'overlay', // overlay：印在照片右下角；below：写在照片下方
    capSize: 'm',
    capColor: 'gold', // gold | white | orange
    order: 'asc',
    copies: 1,
  };

  // 图片来源：默认用服务器生成的预览 JPEG（短边 1440 像素，5–7 寸纸约 270–400 dpi，足够清晰，且比原图小得多）。
  // 只有 A4/A5 一张纸印一张时才用原图，且原图须是浏览器能直接显示的格式（HEIC 不行，仍用预览图）。
  const WEB_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);

  const UUID_IN_VIEWER = /\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

  // ---------- 小工具 ----------
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null) e.append(c);
    return e;
  }

  function icon(name, size = 20) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICON[name]);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  // ---------- 选中状态跟踪 ----------
  // 时间线是虚拟滚动，滚出屏幕的缩略图会被移除。这里把"见过且处于选中状态"的照片记下来，
  // 只在缩略图还在页面上时更新它的状态；选择栏消失（选中数为 0）时清空。
  const selected = new Set();

  function readSelectedCount() {
    const bar = document.querySelector('[data-testid="control-bar"]');
    if (!bar) return 0;
    const n = parseInt(bar.querySelector('p.sm\\:hidden')?.textContent.trim() ?? '', 10);
    return Number.isFinite(n) ? n : 0;
  }

  function scanSelection() {
    const count = readSelectedCount();
    if (!count) {
      selected.clear();
      return 0;
    }
    for (const node of document.querySelectorAll('[data-asset]')) {
      const id = node.getAttribute('data-asset');
      if (!id) continue;
      if (node.hasAttribute('data-selected')) selected.add(id);
      else selected.delete(id);
    }
    return count;
  }

  function viewerAssetId() {
    const m = location.pathname.match(UUID_IN_VIEWER);
    return m ? m[1].toLowerCase() : null;
  }

  // ---------- 入口按钮 ----------
  // 顶栏按钮放在 Immich 右侧按钮组的最左边（"分享"左侧），样式复制自旁边的原生按钮。
  // 顶栏由 Svelte 管理，重新渲染时可能把按钮移除，所以每次轮询都检查一遍，缺了就补。
  // 找不到顶栏（例如 Immich 改版）时，退回右下角的浮动按钮。
  const BAR_SELECTION = '[data-testid="control-bar"] nav > div.ms-auto';
  const BAR_VIEWER = '[data-testid="asset-viewer-navbar-actions"]';

  const fab = el('button', { id: 'ipx-fab', type: 'button' });
  document.body.appendChild(fab);
  let target = null; // { ids, expected }

  const launch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (target) openPrint(target.ids, target.expected);
  };
  fab.addEventListener('click', launch);

  function ensureBarButton(selector, label) {
    const group = document.querySelector(selector);
    const sibling = group && group.querySelector(':scope > button');
    if (!group || !sibling) return false;
    let btn = group.querySelector(':scope > [data-ipx-bar]');
    if (!btn) {
      btn = el('button', { type: 'button', class: sibling.className, 'data-ipx-bar': '1' });
      const svg = icon('printer');
      svg.setAttribute('width', '60%');
      svg.setAttribute('height', '60%');
      btn.appendChild(svg);
      btn.addEventListener('click', launch);
      group.insertBefore(btn, group.firstChild);
    }
    if (btn.getAttribute('aria-label') !== label) {
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    return true;
  }

  function removeBarButtons(except) {
    for (const b of document.querySelectorAll('[data-ipx-bar]')) {
      if (!except || !b.closest(except)) b.remove();
    }
  }

  function updateEntry() {
    if (document.getElementById('ipx-root')) {
      fab.classList.remove('ipx-show');
      return;
    }
    refreshLang(); // 用户在 Immich 设置里换了语言，按钮文字跟着变
    const vid = viewerAssetId();
    const count = scanSelection();
    const viewingVideo = !!document.querySelector('#immich-asset-viewer [data-testid="viewer-content"] video');
    let placed = false;
    if (vid && viewingVideo) {
      target = null; // 视频不能打印
      removeBarButtons(null);
    } else if (vid) {
      target = { ids: [vid], expected: 1 };
      fab.textContent = `🖨 ${t('bar_print_one')}`;
      placed = ensureBarButton(BAR_VIEWER, t('bar_print_one'));
      removeBarButtons(BAR_VIEWER);
    } else if (count > 0) {
      target = { ids: [...selected], expected: count };
      fab.textContent = `🖨 ${t('bar_print_selected', { n: count })}`;
      placed = ensureBarButton(BAR_SELECTION, t('bar_print_selected', { n: count }));
      removeBarButtons(BAR_SELECTION);
    } else {
      target = null;
      removeBarButtons(null);
    }
    fab.classList.toggle('ipx-show', !!target && !placed);
  }

  setInterval(updateEntry, 400);
  updateEntry();

  // ---------- 设置的保存 ----------
  function loadSettings() {
    return new Promise((resolve) => {
      const clean = (v) => {
        const s = { ...DEFAULTS, ...(v || {}) };
        if (!PAPERS[s.paper]) s.paper = DEFAULTS.paper; // 旧版本的纸张键
        if (!PER_PAGE[s.perPage]) s.perPage = 1;
        if (!(s.layout in BORDERS)) s.layout = DEFAULTS.layout;
        if (!['overlay', 'below'].includes(s.capPos)) s.capPos = DEFAULTS.capPos;
        s.copies = Math.min(20, Math.max(1, parseInt(s.copies, 10) || 1));
        return s;
      };
      try {
        chrome.storage.local.get(DEFAULTS, (v) => resolve(clean(v)));
      } catch {
        resolve(clean());
      }
    });
  }
  function saveSettings(s) {
    try {
      chrome.storage.local.set(s);
    } catch {
      /* 存不了就算了，下次用默认值 */
    }
  }

  // ---------- 取照片 ----------
  async function fetchInfo(id) {
    const r = await fetch(`/api/assets/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch (err) {
          out[k] = { error: err };
        }
      }
    });
    await Promise.all(workers);
    return out;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, ok: true });
      img.onerror = () => resolve({ w: 0, h: 0, ok: false });
      img.src = src;
    });
  }

  // ---------- 文字（日期、地点、描述） ----------
  // localDateTime 是拍摄地的当地时间，按 UTC 字段读出，不做时区换算。
  function parseLocal(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
  }
  const pad2 = (n) => String(n).padStart(2, '0');

  function formatDate(iso, style, withTime, withDate = true) {
    const p = parseLocal(iso);
    if (!p) return '';
    if (style === 'dots') {
      return [withDate ? `${p.y}.${pad2(p.mo)}.${pad2(p.d)}` : '', withTime ? `${pad2(p.h)}:${pad2(p.mi)}` : '']
        .filter(Boolean)
        .join(' ');
    }
    const opts = { timeZone: 'UTC' };
    if (withDate) Object.assign(opts, { year: 'numeric', month: 'long', day: 'numeric' });
    if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    try {
      return new Intl.DateTimeFormat(lang(), opts).format(new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)));
    } catch {
      return formatDate(iso, 'dots', withTime, withDate);
    }
  }

  function captionLines(ph, s) {
    const first = [];
    if (s.capDate) first.push(formatDate(ph.time, s.dateStyle, s.capTime));
    if (s.capPlace && ph.place) first.push(ph.place);
    const lines = [];
    const head = first.filter(Boolean).join(' · ');
    if (head) lines.push(head);
    if (s.capDesc && ph.desc) lines.push(ph.desc);
    return lines;
  }

  const placeOf = (exif) => (exif && (exif.city || exif.state || exif.country)) || '';
  const textOn = (s) => s.capDate || s.capPlace || s.capDesc;

  // ---------- 排版 ----------
  // 把图片放进 aw×ah 的区域；返回图片实际可见的矩形（相对区域）
  function placeImage(img, aw, ah, nat, fit, autoRotate) {
    const rotate = autoRotate && nat.w !== nat.h && nat.w > nat.h !== aw > ah;
    const bw = rotate ? ah : aw;
    const bh = rotate ? aw : ah;
    Object.assign(img.style, {
      width: `${bw}mm`,
      height: `${bh}mm`,
      left: `${(aw - bw) / 2}mm`,
      top: `${(ah - bh) / 2}mm`,
      objectFit: fit,
      transform: rotate ? 'rotate(90deg)' : 'none',
    });
    if (fit === 'cover' || !nat.w || !nat.h) return { x: 0, y: 0, w: aw, h: ah };
    const iw = rotate ? nat.h : nat.w;
    const ih = rotate ? nat.w : nat.h;
    const k = Math.min(aw / iw, ah / ih);
    return { x: (aw - iw * k) / 2, y: (ah - ih * k) / 2, w: iw * k, h: ih * k };
  }

  function buildCell(ph, cw, ch, s) {
    const cell = el('div', { class: 'ipx-cell' });
    const b = BORDERS[s.layout] ?? 0;
    const lines = textOn(s) ? captionLines(ph, s) : [];
    const fs = Math.max(1.6, Math.min(cw, ch) * (CAP_SIZE[s.capSize] || CAP_SIZE.m));
    const below = s.capPos === 'below' && lines.length > 0;
    const strip = below ? lines.length * fs * 1.3 + fs * 1.4 : 0;
    const aw = cw - 2 * b;
    const ah = ch - 2 * b - strip;

    const photo = el('div', { class: 'ipx-photo' });
    Object.assign(photo.style, { left: `${b}mm`, top: `${b}mm`, width: `${aw}mm`, height: `${ah}mm` });
    const useOriginal = PAPERS[s.paper].multi && s.perPage === 1 && ph.original;
    const img = el('img', { src: useOriginal ? ph.original : ph.preview, alt: ph.name });
    const rect = placeImage(img, aw, ah, ph, s.fit, s.rotate);
    photo.appendChild(img);
    cell.appendChild(photo);

    if (lines.length && !below) {
      const pad = fs * 0.8;
      const color = ['gold', 'white', 'orange'].includes(s.capColor) ? s.capColor : 'gold';
      const cap = el('div', { class: `ipx-cap ipx-cap-overlay ipx-${color}` }, lines.join('\n'));
      Object.assign(cap.style, {
        right: `${aw - (rect.x + rect.w) + pad}mm`,
        bottom: `${ah - (rect.y + rect.h) + pad}mm`,
        maxWidth: `${Math.max(rect.w - 2 * pad, 10)}mm`,
        fontSize: `${fs}mm`,
      });
      photo.appendChild(cap);
    } else if (below) {
      const cap = el('div', { class: 'ipx-cap ipx-cap-below' }, lines.join('\n'));
      Object.assign(cap.style, {
        left: `${b + fs * 0.4}mm`,
        top: `${b + ah}mm`,
        width: `${aw - fs * 0.8}mm`,
        height: `${strip}mm`,
        fontSize: `${fs}mm`,
      });
      cell.appendChild(cap);
    }
    return cell;
  }

  // 生成全部页面（屏幕上只显示当前页，打印时全部输出）。返回 { total, pageOf: Map(照片id → 第几页) }
  function buildPages(container, photos, s) {
    const p = PAPERS[s.paper];
    const per = p.multi ? s.perPage : 1;
    const [cols, rows] = PER_PAGE[per];
    const margin = per > 1 ? MULTI_MARGIN : 0;
    const gap = per > 1 ? MULTI_MARGIN : 0;
    const cw = (p.w - 2 * margin - gap * (cols - 1)) / cols;
    const ch = (p.h - 2 * margin - gap * (rows - 1)) / rows;
    const total = Math.ceil(photos.length / per);
    const pageOf = new Map();

    container.textContent = '';
    for (let pi = 0; pi < total; pi++) {
      const page = el('div', { class: `ipx-page${s.color === 'gray' ? ' ipx-gray' : ''}` });
      Object.assign(page.style, { width: `${p.w}mm`, height: `${p.h}mm` });
      photos.slice(pi * per, pi * per + per).forEach((ph, k) => {
        if (!pageOf.has(ph.id)) pageOf.set(ph.id, pi);
        const cell = buildCell(ph, cw, ch, s);
        Object.assign(cell.style, {
          left: `${margin + (k % cols) * (cw + gap)}mm`,
          top: `${margin + Math.floor(k / cols) * (ch + gap)}mm`,
          width: `${cw}mm`,
          height: `${ch}mm`,
        });
        page.appendChild(cell);
      });
      container.appendChild(el('div', { class: 'ipx-page-wrap', 'data-page': String(pi) }, page));
    }

    let style = document.getElementById('ipx-page-style');
    if (!style) {
      style = el('style', { id: 'ipx-page-style' });
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${p.w}mm ${p.h}mm; margin: 0; }`;
    return { total, pageOf };
  }

  // ---------- 设置列表的部件 ----------
  // 一行：图标 · 名称 · 当前值 · 箭头；点开展开选项（选中项打勾）。同一时间只展开一行。
  function makePanel(onChange) {
    const rows = []; // { refresh() }
    let openRow = null;

    function pickRow(iconName, label, options, getValue, setValue, isEnabled = () => true) {
      const value = el('span', { class: 'ipx-item-value' });
      const head = el(
        'button',
        { type: 'button', class: 'ipx-item', 'aria-expanded': 'false' },
        el('span', { class: 'ipx-item-icon' }, icon(iconName, 18)),
        el('span', { class: 'ipx-item-label' }, label),
        value,
        el('span', { class: 'ipx-chev' }, icon('chev', 20)),
      );
      const list = el('div', { class: 'ipx-options', hidden: true, role: 'listbox' });
      const optBtns = options().map((o) => {
        const btn = el(
          'button',
          { type: 'button', class: 'ipx-opt', role: 'option' },
          el('span', { class: 'ipx-opt-text' }, el('span', { class: 'ipx-opt-main' }, o.label), o.desc ? el('span', { class: 'ipx-opt-desc' }, o.desc) : null),
          el('span', { class: 'ipx-opt-check' }, icon('check', 20)),
        );
        btn.addEventListener('click', () => {
          setValue(o.value);
          close();
          onChange();
        });
        list.appendChild(btn);
        return [o, btn];
      });
      const row = { head, list };
      function close() {
        list.hidden = true;
        head.setAttribute('aria-expanded', 'false');
        if (openRow === row) openRow = null;
      }
      row.close = close;
      head.addEventListener('click', () => {
        const opening = list.hidden;
        if (openRow && openRow !== row) openRow.close();
        list.hidden = !opening;
        head.setAttribute('aria-expanded', String(opening));
        openRow = opening ? row : null;
      });
      row.refresh = () => {
        const v = getValue();
        const cur = optBtns.find(([o]) => o.value === v);
        value.textContent = cur ? cur[0].short || cur[0].label : '';
        for (const [o, b] of optBtns) {
          b.classList.toggle('ipx-on', o.value === v);
          b.setAttribute('aria-selected', String(o.value === v));
        }
        // 用不上的设置直接隐藏（例如没开"按日期打印"时，不显示日期格式）
        const enabled = isEnabled();
        head.hidden = !enabled;
        if (!enabled) close();
      };
      rows.push(row);
      return row;
    }

    function switchRow(iconName, label, getValue, setValue, isEnabled = () => true) {
      const head = el(
        'button',
        { type: 'button', class: 'ipx-item', role: 'switch', 'aria-checked': 'false' },
        el('span', { class: 'ipx-item-icon' }, icon(iconName, 18)),
        el('span', { class: 'ipx-item-label' }, label),
        el('span', { class: 'ipx-switch' }),
      );
      head.addEventListener('click', () => {
        setValue(!getValue());
        if (openRow) openRow.close();
        onChange();
      });
      const row = { head, list: null };
      row.refresh = () => {
        head.setAttribute('aria-checked', String(!!getValue()));
        head.hidden = !isEnabled();
      };
      rows.push(row);
      return row;
    }

    function group(title, ...items) {
      const g = el('div', { class: 'ipx-group' });
      for (const r of items) {
        g.appendChild(r.head);
        if (r.list) g.appendChild(r.list);
      }
      return [el('div', { class: 'ipx-group-title' }, title), g];
    }

    return { pickRow, switchRow, group, refresh: () => rows.forEach((r) => r.refresh()) };
  }

  // ---------- 打印页 ----------
  let keyGuard = null;
  let resizeObs = null;

  function closePrint() {
    document.getElementById('ipx-root')?.remove();
    document.getElementById('ipx-page-style')?.remove();
    if (keyGuard) window.removeEventListener('keydown', keyGuard, true);
    keyGuard = null;
    resizeObs?.disconnect();
    resizeObs = null;
    updateEntry();
  }

  async function openPrint(ids, expected) {
    if (document.getElementById('ipx-root')) return;
    refreshLang();
    const s = await loadSettings();
    const excluded = new Set();
    const photos = []; // 加载成功的照片
    const notes = [];
    let loading = true;
    let cur = 0; // 当前预览第几页
    let layout = { total: 0, pageOf: new Map() };

    // ----- 骨架 -----
    const closeBtn = el('button', { type: 'button', class: 'ipx-round', title: t('close'), 'aria-label': t('close') }, icon('close', 18));
    const scroll = el('div', { class: 'ipx-scroll' });

    const copiesOut = el('output', {}, String(s.copies));
    const minus = el('button', { type: 'button', 'aria-label': '−' }, icon('minus', 18));
    const plus = el('button', { type: 'button', 'aria-label': '+' }, icon('plus', 18));
    const printBtn = el('button', { type: 'button', class: 'ipx-print', disabled: true }, icon('printer', 20), el('span', {}, t('btn_print')));
    const tip = el('div', { class: 'ipx-tip' });
    const foot = el(
      'div',
      { class: 'ipx-foot' },
      el('div', { class: 'ipx-foot-row' }, el('span', { class: 'ipx-lbl' }, t('copies')), el('div', { class: 'ipx-stepper' }, minus, copiesOut, plus)),
      printBtn,
      tip,
    );
    const side = el(
      'aside',
      { id: 'ipx-side' },
      el('div', { class: 'ipx-head' }, el('span', { class: 'ipx-head-icon' }, icon('printer', 20)), el('h2', {}, t('title')), closeBtn),
      scroll,
      foot,
    );

    const summary = el('span', { id: 'ipx-summary' }, t('status_reading'));
    const notesBox = el('span', { id: 'ipx-notes' });
    const prev = el('button', { type: 'button', class: 'ipx-round', 'aria-label': '‹' }, icon('left', 20));
    const next = el('button', { type: 'button', class: 'ipx-round', 'aria-label': '›' }, icon('right', 20));
    const pageNo = el('span', { id: 'ipx-pageno' });
    const pager = el('div', { class: 'ipx-pager' }, prev, pageNo, next);
    const pages = el('div', { id: 'ipx-pages' });
    const stage = el(
      'div',
      { id: 'ipx-stage' },
      pages,
      el('div', { class: 'ipx-loading' }, el('div', { class: 'ipx-spinner' }), el('span', {}, t('status_reading'))),
    );
    const filmTitle = el('div', { id: 'ipx-film-title' });
    const film = el('div', { id: 'ipx-film' });
    const main = el(
      'main',
      { id: 'ipx-main' },
      el('div', { class: 'ipx-bar' }, summary, notesBox, el('span', { class: 'ipx-spacer' }), pager),
      stage,
      el('div', { class: 'ipx-film-wrap' }, filmTitle, film),
    );
    const root = el('div', { id: 'ipx-root', lang: lang() }, side, main);

    // ----- 设置列表 -----
    const set = (k) => (v) => {
      s[k] = v;
    };
    const get = (k) => () => s[k];
    const panel = makePanel(() => update(true));
    const sample = '2026-05-24T16:47:00.000Z';
    const paperRow = panel.pickRow(
      'paper',
      t('item_paper'),
      () =>
        Object.keys(PAPERS).map((k) => ({
          value: k,
          label: t(`paper_${k}`),
          desc: ['p9x13', 'p10x15', 'p13x18'].includes(k) ? t(`paper_note_${k}`) : null,
          short: ['p9x13', 'p10x15', 'p13x18'].includes(k) ? t(`paper_note_${k}`) : t(`paper_${k}`).split(' ')[0],
        })),
      get('paper'),
      set('paper'),
    );
    const perPageRow = panel.pickRow(
      'perpage',
      t('item_perpage'),
      () => [1, 2, 4].map((n) => ({ value: n, label: t('perpage', { n }) })),
      get('perPage'),
      set('perPage'),
      () => !!PAPERS[s.paper].multi,
    );
    const layoutRow = panel.pickRow(
      'frame',
      t('item_layout'),
      () => Object.keys(BORDERS).map((k) => ({ value: k, label: t(`layout_${k}`), desc: t(`layout_${k}_desc`) })),
      get('layout'),
      set('layout'),
    );
    const fitRow = panel.pickRow(
      'fit',
      t('item_fit'),
      () => ['cover', 'contain'].map((k) => ({ value: k, label: t(`fit_${k}`), desc: t(`fit_${k}_desc`) })),
      get('fit'),
      set('fit'),
    );
    const rotateRow = panel.switchRow('rotate', t('item_rotate'), get('rotate'), set('rotate'));
    const colorRow = panel.pickRow(
      'color',
      t('item_color'),
      () => ['color', 'gray'].map((k) => ({ value: k, label: t(`color_${k}`) })),
      get('color'),
      set('color'),
    );

    const anyText = () => textOn(s);
    const dateRow = panel.switchRow('date', t('item_date'), get('capDate'), set('capDate'));
    const dateFmtRow = panel.pickRow(
      'stamp',
      t('item_date_format'),
      () => ['long', 'dots'].map((k) => ({ value: k, label: formatDate(sample, k, false) })),
      get('dateStyle'),
      set('dateStyle'),
      () => s.capDate,
    );
    const timeRow = panel.switchRow('clock', t('item_time'), get('capTime'), set('capTime'), () => s.capDate);
    const placeRow = panel.switchRow('place', t('item_place'), get('capPlace'), set('capPlace'));
    const descRow = panel.switchRow('desc', t('item_desc'), get('capDesc'), set('capDesc'));
    const posRow = panel.pickRow(
      'position',
      t('item_position'),
      () => ['overlay', 'below'].map((k) => ({ value: k, label: t(`pos_${k}`), desc: t(`pos_${k}_desc`) })),
      get('capPos'),
      set('capPos'),
      anyText,
    );
    const sizeRow = panel.pickRow(
      'size',
      t('item_size'),
      () => ['s', 'm', 'l'].map((k) => ({ value: k, label: t(`size_${k}`) })),
      get('capSize'),
      set('capSize'),
      anyText,
    );
    const textColorRow = panel.pickRow(
      'color',
      t('item_textcolor'),
      () => ['gold', 'white', 'orange'].map((k) => ({ value: k, label: t(`textcolor_${k}`) })),
      get('capColor'),
      set('capColor'),
      () => anyText() && s.capPos === 'overlay',
    );
    const orderRow = panel.pickRow(
      'order',
      t('item_order'),
      () => ['asc', 'desc'].map((k) => ({ value: k, label: t(`order_${k}`) })),
      get('order'),
      set('order'),
    );

    scroll.append(
      ...panel.group(t('group_paper'), paperRow, perPageRow, layoutRow, fitRow, rotateRow, colorRow),
      ...panel.group(t('group_text'), dateRow, dateFmtRow, timeRow, placeRow, descRow, posRow, sizeRow, textColorRow),
      ...panel.group(t('group_more'), orderRow),
    );

    // ----- 交互 -----
    document.body.appendChild(root);
    fab.classList.remove('ipx-show');
    keyGuard = (e) => {
      if (e.key === 'Escape') closePrint();
      else if (e.key === 'ArrowLeft' && !e.target.closest?.('input,select')) go(cur - 1);
      else if (e.key === 'ArrowRight' && !e.target.closest?.('input,select')) go(cur + 1);
      e.stopPropagation(); // 不让 Immich 的快捷键在背后生效
    };
    window.addEventListener('keydown', keyGuard, true);
    closeBtn.addEventListener('click', closePrint);
    // 打印前等所有图片加载完（A4 用原图时，原图可能还在下载）
    printBtn.addEventListener('click', async () => {
      printBtn.disabled = true;
      const label = printBtn.lastChild.textContent;
      printBtn.lastChild.textContent = t('status_preparing');
      await Promise.all([...pages.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
      printBtn.lastChild.textContent = label;
      printBtn.disabled = false;
      window.print();
    });
    prev.addEventListener('click', () => go(cur - 1));
    next.addEventListener('click', () => go(cur + 1));
    const setCopies = (n) => {
      s.copies = Math.min(20, Math.max(1, n));
      update(true);
    };
    minus.addEventListener('click', () => setCopies(s.copies - 1));
    plus.addEventListener('click', () => setCopies(s.copies + 1));

    // 预览缩放：当前页按舞台大小等比放到最大
    function fit() {
      const page = pages.querySelector('.ipx-page-wrap.ipx-cur .ipx-page');
      if (!page) return;
      const p = PAPERS[s.paper];
      const pxPerMm = 96 / 25.4;
      const W = stage.clientWidth - 64;
      const H = stage.clientHeight - 48;
      const z = Math.max(0.2, Math.min(W / (p.w * pxPerMm), H / (p.h * pxPerMm), 2.2));
      for (const pg of pages.querySelectorAll('.ipx-page')) pg.style.zoom = String(z);
    }
    resizeObs = new ResizeObserver(fit);
    resizeObs.observe(stage);

    function go(i) {
      if (!layout.total) return;
      cur = Math.max(0, Math.min(layout.total - 1, i));
      for (const w of pages.children) w.classList.toggle('ipx-cur', Number(w.dataset.page) === cur);
      pageNo.textContent = t('page_no', { i: cur + 1, n: layout.total });
      prev.disabled = cur === 0;
      next.disabled = cur >= layout.total - 1;
      for (const th of film.children) th.classList.toggle('ipx-cur', layout.pageOf.get(th.dataset.id) === cur);
      fit();
    }

    const byOrder = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0) * (s.order === 'desc' ? -1 : 1);

    function renderFilm() {
      film.textContent = '';
      for (const ph of [...photos].sort(byOrder)) {
        const check = el('span', { class: 'ipx-thumb-check', role: 'checkbox', 'aria-checked': String(!excluded.has(ph.id)) }, icon('check', 14));
        const th = el(
          'button',
          { type: 'button', class: `ipx-thumb${excluded.has(ph.id) ? ' ipx-excluded' : ''}`, title: ph.name, 'data-id': ph.id },
          el('img', { src: `/api/assets/${ph.id}/thumbnail?size=thumbnail`, alt: '' }),
          check,
        );
        check.addEventListener('click', (e) => {
          e.stopPropagation();
          if (excluded.has(ph.id)) excluded.delete(ph.id);
          else excluded.add(ph.id);
          update(false);
        });
        th.addEventListener('click', () => {
          if (layout.pageOf.has(ph.id)) go(layout.pageOf.get(ph.id));
        });
        film.appendChild(th);
      }
      filmTitle.textContent = t('film_hint') + (excluded.size ? ` · ${t('film_excluded', { n: excluded.size })}` : '');
    }

    function renderTip() {
      const p = PAPERS[s.paper];
      const lines = [t('tip_paper', { paper: t(`paper_${s.paper}`) }), t('tip_margin')];
      if (s.layout === 'none' && !p.multi) lines.push(t('tip_borderless'));
      if (!p.multi) lines.push(t('tip_media'));
      const open = tip.querySelector('details')?.open ?? false;
      tip.textContent = '';
      const d = el('details', { open }, el('summary', {}, icon('info', 16), el('span', {}, t('tip_title'))), el('ul', {}, ...lines.map((x) => el('li', {}, x))));
      tip.append(d);
    }

    // keepPage：设置变化后尽量停在当前页
    function update(keepPage) {
      saveSettings(s);
      panel.refresh();
      copiesOut.textContent = String(s.copies);
      minus.disabled = s.copies <= 1;
      plus.disabled = s.copies >= 20;
      renderTip();
      if (loading) return;

      const list = photos.filter((ph) => !excluded.has(ph.id)).sort(byOrder);
      const expanded = list.flatMap((ph) => Array.from({ length: s.copies }, () => ph));
      layout = buildPages(pages, expanded, s);
      stage.querySelector('.ipx-loading')?.remove();
      stage.querySelector('.ipx-empty')?.remove();
      if (!layout.total) stage.appendChild(el('div', { class: 'ipx-empty' }, t('empty')));
      renderFilm();
      go(keepPage ? cur : 0);
      pager.style.visibility = layout.total ? '' : 'hidden';

      summary.textContent =
        t('status_summary', { photos: t('count_photos', { n: list.length }), pages: t('count_pages', { n: layout.total }) }) +
        (s.copies > 1 ? t('summary_copies', { n: s.copies }) : '');
      notesBox.textContent = notes.join(' ');
      printBtn.disabled = layout.total === 0;
      printBtn.lastChild.textContent = layout.total ? t('btn_print_n', { n: layout.total }) : t('btn_print');
    }
    update(false);

    // ----- 读照片 -----
    const infos = await mapPool(ids, 6, fetchInfo);
    if (!document.body.contains(root)) return;
    let videos = 0;
    let failed = 0;
    const list = [];
    infos.forEach((a, k) => {
      if (!a || a.error) {
        failed++;
        return;
      }
      if (a.type !== 'IMAGE') {
        videos++;
        return;
      }
      list.push({
        id: ids[k],
        preview: `/api/assets/${ids[k]}/thumbnail?size=preview`,
        original: WEB_OK.has(a.originalMimeType) ? `/api/assets/${ids[k]}/original` : null,
        name: a.originalFileName || '',
        time: a.localDateTime || a.fileCreatedAt || '',
        place: placeOf(a.exifInfo),
        desc: (a.exifInfo && a.exifInfo.description) || '',
      });
    });
    summary.textContent = t('status_loading', { n: list.length });
    const loaded = await mapPool(list, 6, (ph) => loadImage(ph.preview)); // 只需宽高比，预览图即可
    if (!document.body.contains(root)) return;
    loaded.forEach((r, k) => {
      if (r && r.ok) photos.push({ ...list[k], w: r.w, h: r.h });
      else failed++;
    });
    if (expected > ids.length) notes.push(t('note_missing', { expected, missing: expected - ids.length }));
    if (videos) notes.push(t('note_videos', { n: videos }));
    if (failed) notes.push(t('note_failed', { n: failed }));
    loading = false;
    update(false);
  }
})();

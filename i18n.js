// 多语言：跟随 Immich 网页当前的界面语言。
// 判断规则与 Immich v3.4.2 一致（web/src/lib/stores/preferences.store.ts、web/src/lib/utils/i18n.ts）：
//   1. localStorage 的 "lang"（用户在 Immich 设置里选的语言）；
//   2. 没有选过时，按浏览器语言列表找 Immich 支持的第一个语言，zh-CN/zh-SG → zh-Hans，zh-TW/zh-HK/zh-MO → zh-Hant；
//   3. 都没有时用英文。
// 得到 Immich 的语言后，再映射到本插件已翻译的语言；没有翻译的一律用英文。
//
// 加一种语言：在 MESSAGES 里加一组（键与 en 相同），键名用 Immich 的语言代码（把 _ 换成 -）。
(() => {
  'use strict';

  // Immich v3.4.2 的 i18n 文件列表（i18n/*.json），_ 已换成 -
  const IMMICH_LANGS = new Set(
    ('af ar az be bg bi bn br bs ca cs cv da de de-CH el en en-GB eo es et eu fa fi fil fr ga gl gsw gu he hi hr hu hy id ' +
      'is it ja ka kab kk km kmr kn ko kxm lb lmo lt lv mfa mi mk ml mn mr ms nb-NO ne nl nn pa pl pt pt-BR ro ru si sk sl ' +
      'sq sr-Cyrl sr-Latn sv sw swg ta te th tl tr uk ur uz vi yue-Hant zh-Hans zh-Hant').split(' '),
  );
  const IMMICH_ALIASES = { 'zh-CN': 'zh-Hans', 'zh-HK': 'zh-Hant', 'zh-MO': 'zh-Hant', 'zh-SG': 'zh-Hans', 'zh-TW': 'zh-Hant' };

  // Immich 语言 → 本插件使用的翻译（没有列出的语言先按前缀匹配，再回退英文）
  const OUR_ALIASES = { 'yue-Hant': 'zh-Hant' };

  const MESSAGES = {
    en: {
      title: 'Print',
      close: 'Close (Esc)',
      group_paper: 'Paper & layout',
      group_text: 'Date & text',
      group_more: 'More',
      item_paper: 'Paper size',
      item_perpage: 'Photos per sheet',
      item_layout: 'Layout',
      item_fit: 'Fit',
      item_rotate: 'Auto-rotate',
      item_color: 'Color',
      item_date: 'Print date',
      item_date_format: 'Date format',
      item_time: 'Include time',
      item_place: 'Place',
      item_desc: 'Description',
      item_position: 'Text position',
      item_size: 'Text size',
      item_textcolor: 'Text color',
      item_order: 'Order',
      copies: 'Copies',
      paper_p9x13: '9 x 13 cm (3.5 x 5 in)',
      paper_p10x15: '10 x 15 cm (4 x 6 in)',
      paper_p13x18: '13 x 18 cm (5 x 7 in)',
      paper_p16x9: '16:9 wide (102 x 181 mm)',
      paper_a6: 'A6 105 x 148 mm',
      paper_a5: 'A5 148 x 210 mm',
      paper_a4: 'A4 210 x 297 mm',
      paper_note_p9x13: 'Standard photo print',
      paper_note_p10x15: 'Postcard-size photo',
      paper_note_p13x18: 'Large photo',
      perpage_one: '{n} per sheet',
      perpage_other: '{n} per sheet',
      layout_none: 'Borderless',
      layout_none_desc: 'The photo covers the whole sheet. Turn on borderless printing for your printer.',
      layout_thin: 'Thin border',
      layout_thin_desc: 'A 3 mm white border.',
      layout_wide: 'Wide border',
      layout_wide_desc: 'A 6 mm white border, like a classic print.',
      fit_cover: 'Fill',
      fit_cover_desc: 'Fills the frame. Edges may be cropped.',
      fit_contain: 'Whole photo',
      fit_contain_desc: 'Nothing is cropped. There may be white space.',
      color_color: 'Color',
      color_gray: 'Black & white',
      on: 'On',
      off: 'Off',
      pos_overlay: 'On the photo',
      pos_overlay_desc: 'Bottom-right corner, like a camera date stamp.',
      pos_below: 'Below the photo',
      pos_below_desc: 'In a white strip under the photo.',
      size_s: 'Small',
      size_m: 'Medium',
      size_l: 'Large',
      textcolor_gold: 'Gold',
      textcolor_white: 'White',
      textcolor_orange: 'Retro orange',
      order_asc: 'Oldest first',
      order_desc: 'Newest first',
      film_hint: 'Click a photo to show its page. Click the check mark to leave it out.',
      film_excluded_one: '{n} left out',
      film_excluded_other: '{n} left out',
      status_reading: 'Reading photos…',
      status_preparing: 'Preparing…',
      status_loading_one: 'Loading {n} photo…',
      status_loading_other: 'Loading {n} photos…',
      status_summary: '{photos} · {pages}',
      count_photos_one: '{n} photo',
      count_photos_other: '{n} photos',
      count_pages_one: '{n} sheet',
      count_pages_other: '{n} sheets',
      summary_copies: ' · {n} copies each',
      page_no: '{i} / {n}',
      empty: 'No photos to print.',
      note_missing: '{missing} of {expected} selected photos were never shown on screen (for example, chosen with "Select all") and are not included.',
      note_videos_one: '{n} video skipped.',
      note_videos_other: '{n} videos skipped.',
      note_failed_one: '{n} photo failed to load.',
      note_failed_other: '{n} photos failed to load.',
      btn_print: 'Print',
      btn_print_n_one: 'Print {n} sheet',
      btn_print_n_other: 'Print {n} sheets',
      tip_title: 'In the print dialog',
      tip_paper: 'Paper size: {paper}',
      tip_margin: 'Margins: None · Scale: Default',
      tip_borderless: 'Borderless: click "Print using system dialog" and choose the paper size marked "Borderless".',
      tip_media: 'Photo paper: in the system dialog, set the media type to glossy photo paper and the quality to High.',
      bar_print_one: 'Print this photo',
      bar_print_selected_one: 'Print {n} selected photo',
      bar_print_selected_other: 'Print {n} selected photos',
    },

    'zh-Hans': {
      title: '打印',
      close: '关闭（Esc）',
      group_paper: '纸张与版面',
      group_text: '日期与文字',
      group_more: '其他',
      item_paper: '打印纸尺寸',
      item_perpage: '每张纸印几张',
      item_layout: '版面',
      item_fit: '适应方式',
      item_rotate: '横图自动转向',
      item_color: '色彩',
      item_date: '按日期打印',
      item_date_format: '日期格式',
      item_time: '包含时间',
      item_place: '地点',
      item_desc: '描述',
      item_position: '文字位置',
      item_size: '字号',
      item_textcolor: '文字颜色',
      item_order: '顺序',
      copies: '份数',
      paper_p9x13: '9 x 13 厘米 (3.5 x 5 英寸)',
      paper_p10x15: '10 x 15 厘米 (4 x 6 英寸)',
      paper_p13x18: '13 x 18 厘米 (5 x 7 英寸)',
      paper_p16x9: '16:9 宽尺寸 (102 x 181 毫米)',
      paper_a6: 'A6 105 x 148 毫米',
      paper_a5: 'A5 148 x 210 毫米',
      paper_a4: 'A4 210 x 297 毫米',
      paper_note_p9x13: '5 寸照片',
      paper_note_p10x15: '6 寸照片',
      paper_note_p13x18: '7 寸照片',
      perpage: '每张 {n} 张',
      layout_none: '无边距',
      layout_none_desc: '照片印满整张纸。打印机需要打开无边距打印。',
      layout_thin: '窄白边',
      layout_thin_desc: '四周留 3 毫米白边。',
      layout_wide: '宽白边',
      layout_wide_desc: '四周留 6 毫米白边，经典冲印效果。',
      fit_cover: '铺满',
      fit_cover_desc: '照片占满画面，边缘会裁掉一点。',
      fit_contain: '完整照片',
      fit_contain_desc: '照片完整不裁切，可能留白。',
      color_color: '彩色',
      color_gray: '黑白',
      on: '开',
      off: '关',
      pos_overlay: '印在照片上',
      pos_overlay_desc: '右下角，像相机的日期水印。',
      pos_below: '写在照片下方',
      pos_below_desc: '照片下方留一条白边写字。',
      size_s: '小',
      size_m: '中',
      size_l: '大',
      textcolor_gold: '金黄',
      textcolor_white: '白色',
      textcolor_orange: '复古橙',
      order_asc: '从早到晚',
      order_desc: '从晚到早',
      film_hint: '点照片查看所在页，点右上角的勾可以不打印这张。',
      film_excluded: '已排除 {n} 张',
      status_reading: '正在读取照片…',
      status_preparing: '正在准备…',
      status_loading: '正在加载 {n} 张照片…',
      status_summary: '{photos} · {pages}',
      count_photos: '{n} 张照片',
      count_pages: '{n} 张纸',
      summary_copies: ' · 每张 {n} 份',
      page_no: '{i} / {n}',
      empty: '没有要打印的照片。',
      note_missing: '已选 {expected} 张，其中 {missing} 张没在屏幕上出现过（可能是用"全选"选的），没有包含。',
      note_videos: '已跳过 {n} 个视频。',
      note_failed: '{n} 张照片加载失败。',
      btn_print: '打印',
      btn_print_n: '打印 {n} 张纸',
      tip_title: '打印对话框里这样设置',
      tip_paper: '纸张尺寸：{paper}',
      tip_margin: '边距：无 · 缩放：默认',
      tip_borderless: '无边距：点"使用系统对话框进行打印"，纸张尺寸选带"无边距"的那一项。',
      tip_media: '照片纸：在系统对话框的打印设置里，介质类型选光泽照片纸，打印质量选高。',
      bar_print_one: '打印这张',
      bar_print_selected: '打印已选 {n} 张',
    },

    'zh-Hant': {
      title: '列印',
      close: '關閉（Esc）',
      group_paper: '紙張與版面',
      group_text: '日期與文字',
      group_more: '其他',
      item_paper: '紙張大小',
      item_perpage: '每張紙印幾張',
      item_layout: '版面',
      item_fit: '適應方式',
      item_rotate: '橫向相片自動轉向',
      item_color: '色彩',
      item_date: '列印日期',
      item_date_format: '日期格式',
      item_time: '包含時間',
      item_place: '地點',
      item_desc: '說明',
      item_position: '文字位置',
      item_size: '字級',
      item_textcolor: '文字顏色',
      item_order: '順序',
      copies: '份數',
      paper_p9x13: '9 x 13 公分 (3.5 x 5 英吋)',
      paper_p10x15: '10 x 15 公分 (4 x 6 英吋)',
      paper_p13x18: '13 x 18 公分 (5 x 7 英吋)',
      paper_p16x9: '16:9 寬尺寸 (102 x 181 公釐)',
      paper_a6: 'A6 105 x 148 公釐',
      paper_a5: 'A5 148 x 210 公釐',
      paper_a4: 'A4 210 x 297 公釐',
      paper_note_p9x13: '5 吋相片',
      paper_note_p10x15: '6 吋相片',
      paper_note_p13x18: '7 吋相片',
      perpage: '每張 {n} 張',
      layout_none: '無邊界',
      layout_none_desc: '相片印滿整張紙。印表機需要開啟無邊界列印。',
      layout_thin: '窄白邊',
      layout_thin_desc: '四周留 3 公釐白邊。',
      layout_wide: '寬白邊',
      layout_wide_desc: '四周留 6 公釐白邊，經典沖印效果。',
      fit_cover: '滿版',
      fit_cover_desc: '相片佔滿畫面，邊緣會裁掉一點。',
      fit_contain: '完整相片',
      fit_contain_desc: '相片完整不裁切，可能留白。',
      color_color: '彩色',
      color_gray: '黑白',
      on: '開',
      off: '關',
      pos_overlay: '印在相片上',
      pos_overlay_desc: '右下角，像相機的日期浮水印。',
      pos_below: '寫在相片下方',
      pos_below_desc: '相片下方留一條白邊寫字。',
      size_s: '小',
      size_m: '中',
      size_l: '大',
      textcolor_gold: '金黃',
      textcolor_white: '白色',
      textcolor_orange: '復古橙',
      order_asc: '從舊到新',
      order_desc: '從新到舊',
      film_hint: '點相片查看所在頁，點右上角的勾可以不列印這張。',
      film_excluded: '已排除 {n} 張',
      status_reading: '正在讀取相片…',
      status_preparing: '正在準備…',
      status_loading: '正在載入 {n} 張相片…',
      status_summary: '{photos} · {pages}',
      count_photos: '{n} 張相片',
      count_pages: '{n} 張紙',
      summary_copies: ' · 每張 {n} 份',
      page_no: '{i} / {n}',
      empty: '沒有要列印的相片。',
      note_missing: '已選 {expected} 張，其中 {missing} 張沒在螢幕上出現過（可能是用「全選」選的），沒有包含。',
      note_videos: '已略過 {n} 部影片。',
      note_failed: '{n} 張相片載入失敗。',
      btn_print: '列印',
      btn_print_n: '列印 {n} 張紙',
      tip_title: '列印對話框中這樣設定',
      tip_paper: '紙張大小：{paper}',
      tip_margin: '邊界：無 · 縮放：預設',
      tip_borderless: '無邊界：點「使用系統對話框列印」，紙張大小選有「無邊界」的那一項。',
      tip_media: '相紙：在系統對話框的列印設定中，媒體類型選光面相紙，列印品質選高。',
      bar_print_one: '列印這張',
      bar_print_selected: '列印已選的 {n} 張',
    },
  };

  const norm = (code) => String(code || '').replace(/"/g, '').trim().replaceAll('_', '-');
  const subLocales = (code) =>
    code
      .split('-')
      .map((_, i, arr) => arr.slice(0, i + 1).join('-'))
      .reverse();

  // 照 Immich 的 getClosestAvailableLocale：逐个候选，先查别名，再按"完整 → 去掉最后一段"匹配
  function closest(candidates, available) {
    for (const raw of candidates) {
      const c = IMMICH_ALIASES[norm(raw)] || norm(raw);
      const hit = subLocales(c).find((s) => available.has(s));
      if (hit) return hit;
    }
    return null;
  }

  function immichLang() {
    let stored = null;
    try {
      stored = localStorage.getItem('lang');
    } catch {
      /* 读不到就按浏览器语言 */
    }
    if (stored && norm(stored)) return norm(stored);
    return closest(navigator.languages || [navigator.language], IMMICH_LANGS) || 'en';
  }

  function ourLang(code) {
    if (OUR_ALIASES[code]) return OUR_ALIASES[code];
    const ours = new Set(Object.keys(MESSAGES));
    return subLocales(code).find((s) => ours.has(s)) || 'en';
  }

  let current = 'en';
  let rules = new Intl.PluralRules('en');

  function refresh() {
    const next = ourLang(immichLang());
    if (next !== current) {
      current = next;
      try {
        rules = new Intl.PluralRules(current);
      } catch {
        rules = new Intl.PluralRules('en');
      }
    }
    return current;
  }

  // t('key', { n: 3 })：有 n 时先找 key_one / key_other 这类复数形式
  function t(key, vars = {}) {
    const dicts = [MESSAGES[current], MESSAGES.en];
    let text;
    for (const d of dicts) {
      if (!d) continue;
      if (typeof vars.n === 'number') text = d[`${key}_${rules.select(vars.n)}`] ?? d[`${key}_other`];
      text = text ?? d[key];
      if (text != null) break;
    }
    if (text == null) return key;
    return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }

  refresh();
  globalThis.IPX_I18N = { t, refresh, lang: () => current };
})();

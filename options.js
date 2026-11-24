// 设置页：管理 Immich 服务器地址。添加时向用户申请该地址的访问权限，后台据此注册内容脚本。
(() => {
  'use strict';
  const msg = (k, subs) => chrome.i18n.getMessage(k, subs) || k;
  const $ = (id) => document.getElementById(id);

  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = msg(node.dataset.i18n);
  document.title = msg('extName');
  $('url').placeholder = msg('optPlaceholder');

  function say(text, kind) {
    $('msg').textContent = text;
    $('msg').className = kind || '';
  }

  // 只保留协议、主机和端口
  function toOrigin(raw) {
    let s = raw.trim();
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
    } catch {
      return null;
    }
  }

  async function getServers() {
    const { servers = [] } = await chrome.storage.sync.get('servers');
    return servers;
  }

  function trashIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', globalThis.IPX_ICONS.close);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
    return svg;
  }

  async function render() {
    const servers = await getServers();
    const list = $('list');
    list.textContent = '';
    if (!servers.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = msg('optNone');
      list.appendChild(li);
      return;
    }
    for (const origin of servers) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = origin;
      const del = document.createElement('button');
      del.type = 'button';
      del.title = msg('optRemove');
      del.setAttribute('aria-label', `${msg('optRemove')} ${origin}`);
      del.appendChild(trashIcon());
      del.addEventListener('click', async () => {
        const next = (await getServers()).filter((o) => o !== origin);
        await chrome.storage.sync.set({ servers: next });
        try {
          await chrome.permissions.remove({ origins: [`${origin}/*`] });
        } catch {
          /* 已无权限 */
        }
        say(msg('optRemoved', [origin]), 'ok');
        render();
      });
      li.append(span, del);
      list.appendChild(li);
    }
  }

  $('add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const origin = toOrigin($('url').value);
    if (!origin) {
      say(msg('optInvalid'), 'err');
      return;
    }
    // 必须在用户点击的同一时刻申请权限
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      say(msg('optDenied'), 'err');
      return;
    }
    const servers = await getServers();
    if (!servers.includes(origin)) servers.push(origin);
    await chrome.storage.sync.set({ servers });
    chrome.runtime.sendMessage({ type: 'ipx-inject', origin }).catch(() => {});
    $('url').value = '';
    say(msg('optAdded', [origin]), 'ok');
    render();
  });

  render();
})();

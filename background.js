// 后台：按用户在设置页添加的 Immich 服务器，动态注册内容脚本。
// manifest 里静态注册的只有官方演示站和 localhost:2283；其他服务器要用户在设置页添加并授权。
const SCRIPT_ID = 'ipx-user-servers';
const FILES = { js: ['i18n.js', 'icons.js', 'content.js'], css: ['content.css'] };

async function sync() {
  const { servers = [] } = await chrome.storage.sync.get('servers');
  const granted = [];
  for (const origin of servers) {
    // 用户可能在 chrome://extensions 里撤销了授权，只注册仍有权限的
    if (await chrome.permissions.contains({ origins: [`${origin}/*`] })) granted.push(`${origin}/*`);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (!granted.length) return;
  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_ID, matches: granted, js: FILES.js, css: FILES.css, runAt: 'document_idle', persistAcrossSessions: true },
  ]);
}

chrome.runtime.onInstalled.addListener(() => {
  sync();
});
chrome.runtime.onStartup.addListener(() => {
  sync();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.servers) sync();
});
chrome.permissions.onRemoved.addListener(() => {
  sync();
});

// 点工具栏上的插件图标：打开设置页
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// 设置页添加服务器后，立刻在已打开的该服务器页面里生效（不用手动刷新）
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'ipx-inject' && msg.origin) {
    chrome.tabs.query({ url: `${msg.origin}/*` }).then(async (tabs) => {
      for (const tab of tabs) {
        try {
          await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: FILES.css });
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES.js });
        } catch {
          /* 标签页可能已关闭 */
        }
      }
      reply({ ok: true, tabs: tabs.length });
    });
    return true;
  }
  return false;
});

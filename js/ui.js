// 各画面共通のヘッダー付きシェルを描画するヘルパー。

export function shell(app, { title, backHref, actionsHtml = '', bodyHtml }) {
  app.innerHTML = `
    <header class="appbar no-print">
      ${backHref ? `<button data-nav="${backHref}">← 戻る</button>` : '<span></span>'}
      <h1>${title}</h1>
      <span>${actionsHtml}</span>
    </header>
    <main>${bodyHtml}</main>
  `;
  app.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = el.getAttribute('data-nav');
    });
  });
}

// LINEアプリ内蔵ブラウザ（WebView）はwindow.print()やファイルダウンロードを
// ブロックすることが多いため、検出して案内を出す。
export function isLineInAppBrowser() {
  return /\bLine\//i.test(navigator.userAgent);
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

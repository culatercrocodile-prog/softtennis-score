import { listMatches, createMatch, deleteMatch, getMatch } from './storage.js';
import { shell, escapeHtml } from './ui.js';
import { renderMatchScreen } from './match.js';
import { renderSheetScreen } from './sheet.js';

const app = document.getElementById('app');

function renderList() {
  const matches = listMatches();
  const rows = matches.map((m) => {
    const statusBadge = m.status === 'finished'
      ? `<span class="badge finished">終了</span>`
      : `<span class="badge">進行中</span>`;
    const dateStr = new Date(m.createdAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
    const target = m.status === 'finished' ? `#/sheet/${m.id}` : `#/match/${m.id}`;
    return `
      <li>
        <a href="${target}">${escapeHtml(m.self.front)}・${escapeHtml(m.self.back)} vs ${escapeHtml(m.opponent.front)}・${escapeHtml(m.opponent.back)}</a>
        <span>${dateStr} ${statusBadge}</span>
        <button class="no-print" data-del="${m.id}" title="削除">🗑</button>
      </li>`;
  }).join('');

  shell(app, {
    title: 'ソフトテニス スコア記録',
    bodyHtml: `
      <div class="card">
        <button class="btn-primary btn-block" data-nav="#/setup">＋ 新しい試合を記録</button>
      </div>
      <div class="card">
        <h2>試合一覧</h2>
        ${matches.length ? `<ul class="match-list">${rows}</ul>` : '<p>まだ試合がありません。</p>'}
      </div>
    `,
  });

  app.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-del');
      if (confirm('この試合の記録を削除しますか？')) {
        deleteMatch(id);
        renderList();
      }
    });
  });
}

function renderSetup() {
  shell(app, {
    title: '試合設定',
    backHref: '#/',
    bodyHtml: `
      <form class="card" id="setup-form">
        <fieldset>
          <legend>自チーム</legend>
          <div class="field"><label>後衛の選手名</label><input type="text" name="selfBack" required></div>
          <div class="field"><label>前衛の選手名</label><input type="text" name="selfFront" required></div>
          <div class="field">
            <label>サーブする選手</label>
            <label><input type="radio" name="selfServerPosition" value="back" checked> 後衛</label>
            <label><input type="radio" name="selfServerPosition" value="front"> 前衛</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>相手チーム</legend>
          <div class="field"><label>後衛の選手名</label><input type="text" name="oppBack" required></div>
          <div class="field"><label>前衛の選手名</label><input type="text" name="oppFront" required></div>
          <div class="field">
            <label>サーブする選手</label>
            <label><input type="radio" name="oppServerPosition" value="back" checked> 後衛</label>
            <label><input type="radio" name="oppServerPosition" value="front"> 前衛</label>
          </div>
        </fieldset>
        <p style="font-size:0.85rem;color:var(--gray)">※前衛・後衛および各チームのサーブ担当選手は試合中固定として扱います（ゲームごとの交代はありません）。</p>
        <fieldset>
          <legend>先攻サーブ</legend>
          <div class="field">
            <label><input type="radio" name="firstServer" value="self" checked> 自チーム</label>
            <label><input type="radio" name="firstServer" value="opponent"> 相手チーム</label>
          </div>
        </fieldset>
        <button type="submit" class="btn-primary btn-block">記録を開始</button>
      </form>
    `,
  });

  document.getElementById('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const match = createMatch({
      self: { front: fd.get('selfFront').trim(), back: fd.get('selfBack').trim(), serverPosition: fd.get('selfServerPosition') },
      opponent: { front: fd.get('oppFront').trim(), back: fd.get('oppBack').trim(), serverPosition: fd.get('oppServerPosition') },
      firstServer: fd.get('firstServer'),
    });
    location.hash = `#/match/${match.id}`;
  });
}

function router() {
  const hash = location.hash || '#/';
  const matchRoute = hash.match(/^#\/match\/(.+)$/);
  const sheetRoute = hash.match(/^#\/sheet\/(.+)$/);

  if (hash === '#/' || hash === '') {
    renderList();
  } else if (hash === '#/setup') {
    renderSetup();
  } else if (matchRoute) {
    const match = getMatch(matchRoute[1]);
    if (!match) { location.hash = '#/'; return; }
    renderMatchScreen(app, match);
  } else if (sheetRoute) {
    const match = getMatch(sheetRoute[1]);
    if (!match) { location.hash = '#/'; return; }
    renderSheetScreen(app, match);
  } else {
    renderList();
  }
}

window.addEventListener('hashchange', router);
router();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

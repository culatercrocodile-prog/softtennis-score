import { deriveState, reasonOptions, other, activeServePosition, AUTO_POSITION_SHOT_TYPES, DEFAULT_MATCH_FORMAT, FINAL_GAME_POINT_OPTIONS } from './rules.js';
import { saveMatch } from './storage.js';
import { shell, escapeHtml } from './ui.js';

export function renderMatchScreen(app, initialMatch) {
  const match = initialMatch;
  let pendingWinner = null; // null | 'self' | 'opponent'
  let pendingReason = null; // null | { shotType, outcome, agentTeam, label }
  let servePhase = '1st'; // '1st' | '2nd'
  let editingNames = false;

  const headerActionsHtml = `
    <button data-edit-names>選手名</button>
    <button data-nav="#/sheet/${match.id}">シート</button>
  `;

  function matchShell(opts) {
    shell(app, opts);
    app.querySelector('[data-edit-names]')?.addEventListener('click', () => {
      editingNames = true;
      render();
    });
  }

  function persist() {
    saveMatch(match);
  }

  function resetPending() {
    pendingWinner = null;
    pendingReason = null;
    servePhase = '1st';
  }

  function addPoint({ winner, reason, actingPlayerKey, serveType, server }) {
    match.pointLog.push({
      server,
      serveType,
      winner,
      agentTeam: reason.agentTeam,
      shotType: reason.shotType,
      outcome: reason.outcome,
      actingPlayerKey, // 'front' | 'back'
      timestamp: new Date().toISOString(),
    });
    persist();
    resetPending();
    render();
  }

  function handleFault(state) {
    if (servePhase === '1st') {
      servePhase = '2nd';
      render();
      return;
    }
    const server = state.currentServer;
    addPoint({
      winner: other(server),
      reason: { shotType: 'double_fault', outcome: 'error', agentTeam: server },
      actingPlayerKey: activeServePosition(match, server, state.currentGame.server, state.currentGame.rotatesBetweenPairs, state.currentGame.points.length),
      serveType: '2nd',
      server,
    });
  }

  function handleWinner(winner) {
    pendingWinner = winner;
    pendingReason = null;
    render();
  }

  function handleReason(reason, state) {
    if (AUTO_POSITION_SHOT_TYPES.has(reason.shotType)) {
      addPoint({
        winner: pendingWinner,
        reason,
        actingPlayerKey: activeServePosition(match, reason.agentTeam, state.currentGame.server, state.currentGame.rotatesBetweenPairs, state.currentGame.points.length),
        serveType: servePhase,
        server: state.currentServer,
      });
    } else {
      pendingReason = reason;
      render();
    }
  }

  function handlePosition(actingPlayerKey, state) {
    addPoint({
      winner: pendingWinner,
      reason: pendingReason,
      actingPlayerKey,
      serveType: servePhase,
      server: state.currentServer,
    });
  }

  function handleServePosition(side, position) {
    const team = side === 'self' ? match.self : match.opponent;
    team.serverPosition = position;
    persist();
    render();
  }

  function handleFinalGameFormat(points) {
    match.finalGameFormat = points;
    persist();
    render();
  }

  function handleUndo() {
    if (match.pointLog.length === 0) return;
    match.pointLog.pop();
    match.status = 'in_progress';
    delete match.winner;
    persist();
    resetPending();
    render();
  }

  function teamLabel(side) {
    const team = side === 'self' ? match.self : match.opponent;
    return `${team.back}・${team.front}`;
  }

  function gameCountBadgeHtml(state) {
    return `
      <div class="game-count">
        ゲームカウント
        <span class="game-count-value">${state.gameCountSelf} - ${state.gameCountOpponent}</span>
      </div>
    `;
  }

  function renderServePositionChoice(state) {
    const side = state.currentServer;
    const team = side === 'self' ? match.self : match.opponent;
    const teamName = side === 'self' ? '自ペア' : '相手ペア';

    matchShell({
      title: `${escapeHtml(match.self.front)}組 vs ${escapeHtml(match.opponent.front)}組`,
      backHref: '#/',
      actionsHtml: headerActionsHtml,
      bodyHtml: `
        <div class="card">
          <div class="game-status">
            第${state.currentGame.gameNumber}ゲーム（${match.matchFormat ?? DEFAULT_MATCH_FORMAT}ゲームマッチ）
          </div>
          ${gameCountBadgeHtml(state)}
          <div class="serve-status">
            ${escapeHtml(teamName)}（${escapeHtml(teamLabel(side))}）が最初にサーブします。<br>
            まずサーブ（およびレシーブ）を最初に担当する選手を選んでください。サーブ権はゲーム中2ポイントごとにペア内のもう一方の選手と交代します。
          </div>
          <div class="win-buttons">
            <button id="btn-serve-pos-back">${escapeHtml(team.back)}（後衛）</button>
            <button id="btn-serve-pos-front">${escapeHtml(team.front)}（前衛）</button>
          </div>
        </div>
      `,
    });

    document.getElementById('btn-serve-pos-back')?.addEventListener('click', () => handleServePosition(side, 'back'));
    document.getElementById('btn-serve-pos-front')?.addEventListener('click', () => handleServePosition(side, 'front'));
  }

  function renderFinalGameFormatChoice(state) {
    matchShell({
      title: `${escapeHtml(match.self.front)}組 vs ${escapeHtml(match.opponent.front)}組`,
      backHref: '#/',
      actionsHtml: headerActionsHtml,
      bodyHtml: `
        <div class="card">
          <div class="game-status">
            第${state.currentGame.gameNumber}ゲーム（ファイナルゲーム）
          </div>
          ${gameCountBadgeHtml(state)}
          <div class="serve-status">
            🏆 ファイナルゲームです。形式を選んでください。
          </div>
          <div class="win-buttons">
            ${FINAL_GAME_POINT_OPTIONS.map((points) => `
              <button data-final-points="${points}">
                ${points}ポイント先取${points === 7
                  ? '（6-6以降は2点差・サーブは2ポイントごとに両ペア間で交代）'
                  : '（3-3以降は2点差・通常ゲームと同じく片方のペアのみサーブ）'}
              </button>
            `).join('')}
          </div>
        </div>
      `,
    });

    app.querySelectorAll('[data-final-points]').forEach((btn) => {
      btn.addEventListener('click', () => handleFinalGameFormat(Number(btn.getAttribute('data-final-points'))));
    });
  }

  function renderNameEditor() {
    const field = (label, name, value) =>
      `<div class="field"><label>${label}</label><input type="text" name="${name}" value="${escapeHtml(value)}" required></div>`;

    shell(app, {
      title: '選手名の変更',
      bodyHtml: `
        <form class="card" id="names-form">
          <fieldset>
            <legend>自ペア</legend>
            ${field('後衛の選手名', 'selfBack', match.self.back)}
            ${field('前衛の選手名', 'selfFront', match.self.front)}
          </fieldset>
          <fieldset>
            <legend>相手ペア</legend>
            ${field('後衛の選手名', 'oppBack', match.opponent.back)}
            ${field('前衛の選手名', 'oppFront', match.opponent.front)}
          </fieldset>
          <p style="font-size:0.85rem;color:var(--gray)">※これまでの記録の選手名もすべて新しい名前に置き換わります。</p>
          <button type="submit" class="btn-primary btn-block">保存</button>
          <button type="button" class="btn-block" id="btn-cancel-names">キャンセル</button>
        </form>
      `,
    });

    document.getElementById('names-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      match.self.back = fd.get('selfBack').trim();
      match.self.front = fd.get('selfFront').trim();
      match.opponent.back = fd.get('oppBack').trim();
      match.opponent.front = fd.get('oppFront').trim();
      persist();
      editingNames = false;
      render();
    });
    document.getElementById('btn-cancel-names').addEventListener('click', () => {
      editingNames = false;
      render();
    });
  }

  function render() {
    const state = deriveState(match);

    if (state.isFinished) {
      if (match.status !== 'finished') {
        match.status = 'finished';
        match.winner = state.matchWinner;
        persist();
      }
      location.hash = `#/sheet/${match.id}`;
      return;
    }

    if (editingNames) {
      renderNameEditor();
      return;
    }

    if (state.currentGame.isFinalGame && !match.finalGameFormat) {
      renderFinalGameFormatChoice(state);
      return;
    }

    if (!state.currentServerPosition) {
      renderServePositionChoice(state);
      return;
    }

    const finalGameRule = match.finalGameFormat === 4
      ? '4ポイント先取・3-3以降は2点差'
      : '7ポイント先取・6-6以降は2点差';
    const banner = state.currentGame.isFinalGame && state.currentGame.points.length === 0
      ? `<div class="banner">🏆 ゲームカウント${state.gameCountSelf}-${state.gameCountOpponent}！ ファイナルゲーム（${finalGameRule}）です</div>`
      : '';

    let actionHtml;
    if (pendingWinner === null) {
      actionHtml = `
        <div class="serve-status">
          サーブ: <strong>${escapeHtml(teamLabel(state.currentServer))}（${escapeHtml(state.currentServerPlayerName)}・${state.currentServerPosition === 'front' ? '前衛' : '後衛'}）</strong>
          — ${servePhase === '1st' ? 'ファーストサーブ' : 'セカンドサーブ'}
        </div>
        <button class="fault-btn btn-block" id="btn-fault">サーブフォルト</button>
        <div class="win-buttons">
          <button class="self-btn" id="btn-win-self">自ペア得点</button>
          <button class="opponent-btn" id="btn-win-opp">相手ペア得点</button>
        </div>
      `;
    } else if (pendingReason === null) {
      const options = reasonOptions(pendingWinner, state.currentServer);
      const label = pendingWinner === 'self' ? '自ペアの得点' : '相手ペアの得点';
      actionHtml = `
        <div class="serve-status">${label} — 決まり方を選択してください</div>
        <div class="category-grid">
          ${options.map((o, i) => `<button class="${o.agentTeam === 'self' ? 'self-btn' : 'opponent-btn'}" data-reason="${i}">${escapeHtml(o.label)}</button>`).join('')}
        </div>
        <button class="btn-block no-print" id="btn-cancel-reason">← 選び直す</button>
      `;
      // 選択肢をクロージャに保持しておく（クリックハンドラで参照するため）
      render.currentOptions = options;
    } else {
      const team = pendingReason.agentTeam === 'self' ? match.self : match.opponent;
      const teamName = pendingReason.agentTeam === 'self' ? '自ペア' : '相手ペア';
      actionHtml = `
        <div class="serve-status">${escapeHtml(pendingReason.label)} — ${escapeHtml(teamName)}のどちらの選手が行いましたか？</div>
        <div class="win-buttons">
          <button id="btn-pos-front">${escapeHtml(team.front)}（前衛）</button>
          <button id="btn-pos-back">${escapeHtml(team.back)}（後衛）</button>
        </div>
        <button class="btn-block no-print" id="btn-cancel-position">← 選び直す</button>
      `;
    }

    matchShell({
      title: `${escapeHtml(match.self.front)}組 vs ${escapeHtml(match.opponent.front)}組`,
      backHref: '#/',
      actionsHtml: headerActionsHtml,
      bodyHtml: `
        <div class="card">
          <div class="game-status">
            第${state.currentGame.gameNumber}ゲーム（${match.matchFormat ?? DEFAULT_MATCH_FORMAT}ゲームマッチ）
          </div>
          ${gameCountBadgeHtml(state)}
          ${banner}
          <div class="scoreboard">
            <div class="side ${state.currentServer === 'self' ? 'serving' : ''}">
              <div class="name">自ペア</div>
              <div class="score">${state.currentGame.scoreSelf}</div>
            </div>
            <div class="sep">-</div>
            <div class="side ${state.currentServer === 'opponent' ? 'serving' : ''}">
              <div class="name">相手ペア</div>
              <div class="score">${state.currentGame.scoreOpponent}</div>
            </div>
          </div>
          ${actionHtml}
          <div class="undo-bar no-print">
            <button id="btn-undo" ${match.pointLog.length === 0 ? 'disabled' : ''}>直前の1ポイントを取り消す</button>
          </div>
        </div>
      `,
    });

    document.getElementById('btn-fault')?.addEventListener('click', () => handleFault(state));
    document.getElementById('btn-win-self')?.addEventListener('click', () => handleWinner('self'));
    document.getElementById('btn-win-opp')?.addEventListener('click', () => handleWinner('opponent'));
    document.getElementById('btn-cancel-reason')?.addEventListener('click', () => { pendingWinner = null; render(); });
    document.getElementById('btn-cancel-position')?.addEventListener('click', () => { pendingReason = null; render(); });
    document.getElementById('btn-pos-front')?.addEventListener('click', () => handlePosition('front', state));
    document.getElementById('btn-pos-back')?.addEventListener('click', () => handlePosition('back', state));
    document.getElementById('btn-undo')?.addEventListener('click', handleUndo);
    app.querySelectorAll('[data-reason]').forEach((btn) => {
      btn.addEventListener('click', () => handleReason(render.currentOptions[Number(btn.getAttribute('data-reason'))], state));
    });
  }

  render();
}

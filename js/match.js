import { deriveState, reasonOptions, other, serverPositionOf, AUTO_POSITION_SHOT_TYPES } from './rules.js';
import { saveMatch } from './storage.js';
import { shell, escapeHtml } from './ui.js';

export function renderMatchScreen(app, initialMatch) {
  const match = initialMatch;
  let pendingWinner = null; // null | 'self' | 'opponent'
  let pendingReason = null; // null | { shotType, outcome, agentTeam, label }
  let servePhase = '1st'; // '1st' | '2nd'

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
      actingPlayerKey: serverPositionOf(match, server),
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
        actingPlayerKey: serverPositionOf(match, reason.agentTeam),
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
    return `${team.front}・${team.back}`;
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

    const banner = state.currentGame.isFinalGame && state.currentGame.points.length === 0
      ? `<div class="banner">🏆 ゲームカウント${state.gameCountSelf}-${state.gameCountOpponent}！ ファイナルゲーム（7ポイント先取・6-6以降は2点差）です</div>`
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
          <button class="self-btn" id="btn-win-self">自チーム得点</button>
          <button class="opponent-btn" id="btn-win-opp">相手チーム得点</button>
        </div>
      `;
    } else if (pendingReason === null) {
      const options = reasonOptions(pendingWinner, state.currentServer);
      const label = pendingWinner === 'self' ? '自チームの得点' : '相手チームの得点';
      actionHtml = `
        <div class="serve-status">${label} — 決まり方を選択してください</div>
        <div class="category-grid">
          ${options.map((o, i) => `<button data-reason="${i}">${escapeHtml(o.label)}</button>`).join('')}
        </div>
        <button class="btn-block no-print" id="btn-cancel-reason">← 選び直す</button>
      `;
      // 選択肢をクロージャに保持しておく（クリックハンドラで参照するため）
      render.currentOptions = options;
    } else {
      const team = pendingReason.agentTeam === 'self' ? match.self : match.opponent;
      const teamName = pendingReason.agentTeam === 'self' ? '自チーム' : '相手チーム';
      actionHtml = `
        <div class="serve-status">${escapeHtml(pendingReason.label)} — ${escapeHtml(teamName)}のどちらの選手が行いましたか？</div>
        <div class="win-buttons">
          <button id="btn-pos-front">${escapeHtml(team.front)}（前衛）</button>
          <button id="btn-pos-back">${escapeHtml(team.back)}（後衛）</button>
        </div>
        <button class="btn-block no-print" id="btn-cancel-position">← 選び直す</button>
      `;
    }

    shell(app, {
      title: `${escapeHtml(match.self.front)}組 vs ${escapeHtml(match.opponent.front)}組`,
      backHref: '#/',
      actionsHtml: `<button data-nav="#/sheet/${match.id}">シート</button>`,
      bodyHtml: `
        <div class="card">
          <div class="game-status">
            第${state.currentGame.gameNumber}ゲーム（ゲームカウント ${state.gameCountSelf} - ${state.gameCountOpponent}）
          </div>
          ${banner}
          <div class="scoreboard">
            <div class="side ${state.currentServer === 'self' ? 'serving' : ''}">
              <div class="name">自チーム</div>
              <div class="score">${state.currentGame.scoreSelf}</div>
            </div>
            <div class="sep">-</div>
            <div class="side ${state.currentServer === 'opponent' ? 'serving' : ''}">
              <div class="name">相手チーム</div>
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

import { deriveState, other, activeServePosition, DEFAULT_MATCH_FORMAT } from './rules.js';
import { shell, escapeHtml } from './ui.js';

const SHOT_TYPE_NAMES = {
  ace: 'サービスエース',
  volley: 'ボレー',
  smash: 'スマッシュ',
  stroke: 'ストローク',
  receive: 'レシーブ',
  out: 'アウト',
  net: 'ネット',
  double_fault: 'ダブルフォルト',
  other: 'その他',
};

function rate(num, den) {
  return den ? Math.round((num / den) * 1000) / 10 : null;
}

function fmtRate(r, den) {
  return r === null ? '-' : `${r}%（${den}本中）`;
}

function teamName(match, team) {
  const t = team === 'self' ? match.self : match.opponent;
  return `${t.front}・${t.back}`;
}

function playerName(match, team, positionKey) {
  const t = team === 'self' ? match.self : match.opponent;
  if (positionKey === 'front') return t.front;
  if (positionKey === 'back') return t.back;
  return '不明';
}

// ポイントログの各ポイントについて、そのポイントで実際にサーブした選手のポジション
// （'front'|'back'）を求め、ポイントをキーにしたMapで返す（ファイナルゲームの
// サーブ回転を考慮するため、deriveStateが導出したゲーム単位の情報が必要）。
function computeServerPositions(match, state) {
  const map = new Map();
  flattenGames(state).forEach((g) => {
    g.points.forEach((p, i) => {
      map.set(p, activeServePosition(match, p.server, g.server, g.isFinalGame, i));
    });
  });
  return map;
}

function playerServiceStats(team, log, serverPosMap) {
  const teamServe = log.filter((p) => p.server === team);
  const stats = {};
  ['front', 'back'].forEach((pos) => {
    const pts = teamServe.filter((p) => serverPosMap.get(p) === pos);
    const firstIn = pts.filter((p) => p.serveType === '1st');
    stats[pos] = {
      total: pts.length,
      firstInRate: rate(firstIn.length, pts.length), firstInDen: pts.length,
      doubleFaultCount: pts.filter((p) => p.shotType === 'double_fault').length,
    };
  });
  return stats;
}

export function computeTeamStats(match, team, state) {
  const opp = other(team);
  const log = match.pointLog;
  const serverPosMap = computeServerPositions(match, state);
  const teamServe = log.filter((p) => p.server === team);
  const oppServe = log.filter((p) => p.server === opp);
  const teamServe1st = teamServe.filter((p) => p.serveType === '1st');
  const teamServe2nd = teamServe.filter((p) => p.serveType === '2nd');
  const oppServe1st = oppServe.filter((p) => p.serveType === '1st');
  const oppServe2nd = oppServe.filter((p) => p.serveType === '2nd');

  const totalPoints = log.length;
  const teamPoints = log.filter((p) => p.winner === team).length;

  const decidePoints = log.filter((p) => p.agentTeam === team && p.outcome === 'decide');
  const errorPoints = log.filter((p) => p.agentTeam === team && p.outcome === 'error');

  return {
    service: {
      total: teamServe.length,
      firstWinRate: rate(teamServe1st.filter((p) => p.winner === team).length, teamServe1st.length), firstWinDen: teamServe1st.length,
      secondWinRate: rate(teamServe2nd.filter((p) => p.winner === team).length, teamServe2nd.length), secondWinDen: teamServe2nd.length,
      players: playerServiceStats(team, log, serverPosMap),
    },
    receive: {
      total: oppServe.length,
      firstWinRate: rate(oppServe1st.filter((p) => p.winner === team).length, oppServe1st.length), firstWinDen: oppServe1st.length,
      secondWinRate: rate(oppServe2nd.filter((p) => p.winner === team).length, oppServe2nd.length), secondWinDen: oppServe2nd.length,
    },
    total: { totalPoints, teamPoints, winRate: rate(teamPoints, totalPoints) },
    decidePoints,
    errorPoints,
  };
}

function flattenGames(state) {
  const all = [...state.games];
  if (state.currentGame) all.push({ ...state.currentGame, winner: null, inProgress: true });
  return all;
}

function breakdownTable(points, match, team) {
  const groups = {};
  points.forEach((p) => {
    groups[p.shotType] = groups[p.shotType] || { front: 0, back: 0, unknown: 0 };
    const key = p.actingPlayerKey === 'front' || p.actingPlayerKey === 'back' ? p.actingPlayerKey : 'unknown';
    groups[p.shotType][key] += 1;
  });
  const total = points.length;
  const t = team === 'self' ? match.self : match.opponent;
  const entries = Object.entries(groups).sort((a, b) => {
    const totA = a[1].front + a[1].back + a[1].unknown;
    const totB = b[1].front + b[1].back + b[1].unknown;
    return totB - totA;
  });
  if (entries.length === 0) return '<tr><td colspan="5">記録なし</td></tr>';
  return entries.map(([shotType, g]) => {
    const sub = g.front + g.back + g.unknown;
    return `
      <tr>
        <td>${escapeHtml(SHOT_TYPE_NAMES[shotType] ?? shotType)}</td>
        <td>${g.front}（${escapeHtml(t.front)}）</td>
        <td>${g.back}（${escapeHtml(t.back)}）</td>
        <td>${sub}</td>
        <td>${rate(sub, total)}%</td>
      </tr>`;
  }).join('');
}

function toCsv(match, games) {
  const header = ['ゲーム', '第何ポイント', 'サーブ', 'サーブ種別', '得点/失点', '決まり方ペア', '決まり方', '決め/ミス', '実行選手', 'ポジション'];
  const rows = [header];
  games.forEach((g) => {
    g.points.forEach((p, i) => {
      rows.push([
        g.gameNumber,
        i + 1,
        p.server === 'self' ? '自ペア' : '相手ペア',
        p.serveType,
        p.winner === 'self' ? '自ペア得点' : '相手ペア得点',
        p.agentTeam === 'self' ? '自ペア' : '相手ペア',
        SHOT_TYPE_NAMES[p.shotType] ?? p.shotType,
        p.outcome === 'decide' ? '決め' : 'ミス',
        playerName(match, p.agentTeam, p.actingPlayerKey),
        p.actingPlayerKey === 'front' ? '前衛' : p.actingPlayerKey === 'back' ? '後衛' : '',
      ]);
    });
  });
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function playerServiceStatsTable(match, team, players) {
  const t = team === 'self' ? match.self : match.opponent;
  const rows = ['front', 'back'].map((pos) => {
    const s = players[pos];
    return `
      <tr>
        <td>${escapeHtml(t[pos])}（${pos === 'front' ? '前衛' : '後衛'}）</td>
        <td>${fmtRate(s.firstInRate, s.firstInDen)}</td>
        <td>${s.doubleFaultCount}件</td>
      </tr>`;
  }).join('');
  return `
    <table class="sheet-table">
      <thead><tr><th>選手</th><th>1stサーブ成功率</th><th>ダブルフォルト数</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function teamStatsHtml(match, team, stats) {
  const label = team === 'self' ? '自ペア' : '相手ペア';
  const oppLabel = team === 'self' ? '相手ペア' : '自ペア';
  return `
    <div class="card">
      <h3>${label}の成績（${escapeHtml(teamName(match, team))}）</h3>
      <p><strong>サービスゲーム時</strong>（${label}のサーブ、${stats.service.total}本）</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">1stサーブ時のポイント取得率</div><div class="value">${fmtRate(stats.service.firstWinRate, stats.service.firstWinDen)}</div></div>
        <div class="stat-box"><div class="label">2ndサーブ時のポイント取得率</div><div class="value">${fmtRate(stats.service.secondWinRate, stats.service.secondWinDen)}</div></div>
      </div>
      <p>選手別サーブ成績</p>
      ${playerServiceStatsTable(match, team, stats.service.players)}
      <p><strong>レシーブゲーム時</strong>（${oppLabel}のサーブ、${stats.receive.total}本）</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">${oppLabel}の1stサーブ時のポイント取得率</div><div class="value">${fmtRate(stats.receive.firstWinRate, stats.receive.firstWinDen)}</div></div>
        <div class="stat-box"><div class="label">${oppLabel}の2ndサーブ時のポイント取得率</div><div class="value">${fmtRate(stats.receive.secondWinRate, stats.receive.secondWinDen)}</div></div>
      </div>
      <p><strong>トータル</strong></p>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">総ポイント取得率</div><div class="value">${fmtRate(stats.total.winRate, stats.total.totalPoints)}</div></div>
        <div class="stat-box"><div class="label">総ポイント数</div><div class="value">${stats.total.teamPoints} / ${stats.total.totalPoints}</div></div>
      </div>
      <p>${label}が決めて得点（前衛・後衛別）</p>
      <table class="sheet-table">
        <thead><tr><th>決まり方</th><th>前衛</th><th>後衛</th><th>件数</th><th>割合</th></tr></thead>
        <tbody>${breakdownTable(stats.decidePoints, match, team)}</tbody>
      </table>
      <p>${label}が失点（前衛・後衛別）</p>
      <table class="sheet-table">
        <thead><tr><th>決まり方</th><th>前衛</th><th>後衛</th><th>件数</th><th>割合</th></tr></thead>
        <tbody>${breakdownTable(stats.errorPoints, match, team)}</tbody>
      </table>
    </div>
  `;
}

export function renderSheetScreen(app, match) {
  const state = deriveState(match);
  const games = flattenGames(state);
  const selfStats = computeTeamStats(match, 'self', state);
  const opponentStats = computeTeamStats(match, 'opponent', state);
  const dateStr = new Date(match.createdAt).toLocaleDateString('ja-JP');

  const gameRows = games.map((g) => `
    <tr>
      <td>${g.gameNumber}${g.isFinalGame ? '（F）' : ''}</td>
      <td>${g.server === 'self' ? '自ペア' : '相手ペア'}</td>
      <td>${g.scoreSelf} - ${g.scoreOpponent}</td>
      <td>${g.inProgress ? '進行中' : (g.winner === 'self' ? '自ペア' : '相手ペア')}</td>
    </tr>`).join('');

  const resultLine = state.isFinished
    ? `<strong>${state.matchWinner === 'self' ? '自ペアの勝利' : '相手ペアの勝利'}</strong>（ゲームカウント ${state.gameCountSelf} - ${state.gameCountOpponent}）`
    : `試合進行中（ゲームカウント ${state.gameCountSelf} - ${state.gameCountOpponent}）`;

  shell(app, {
    title: 'スコアシート',
    backHref: match.status === 'finished' ? '#/' : `#/match/${match.id}`,
    actionsHtml: match.status !== 'finished' ? `<button data-nav="#/match/${match.id}">記録へ戻る</button>` : '',
    bodyHtml: `
      <div id="sheet-content">
        <div class="card">
          <h2>${escapeHtml(teamName(match, 'self'))}（自ペア） vs ${escapeHtml(teamName(match, 'opponent'))}（相手ペア）</h2>
          <p>${dateStr}　${match.matchFormat ?? DEFAULT_MATCH_FORMAT}ゲームマッチ　${resultLine}</p>
        </div>

        <div class="card">
          <h3>ゲーム経過</h3>
          <table class="sheet-table">
            <thead><tr><th>ゲーム</th><th>サーブ</th><th>スコア（自-相手）</th><th>勝者</th></tr></thead>
            <tbody>${gameRows}</tbody>
          </table>
        </div>

        ${teamStatsHtml(match, 'self', selfStats)}
        ${teamStatsHtml(match, 'opponent', opponentStats)}
      </div>

      <div class="card no-print">
        <h3>出力</h3>
        <div class="export-buttons">
          <button class="btn-primary" id="btn-print">印刷用PDF（印刷ダイアログ）</button>
          <button id="btn-pdf">PDFダウンロード</button>
          <button id="btn-csv">CSVダウンロード</button>
        </div>
      </div>
    `,
  });

  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('btn-pdf')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-pdf');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '生成中…';
    try {
      await downloadSheetPdf(match);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
  document.getElementById('btn-csv')?.addEventListener('click', () => {
    downloadBlob(`softtennis_${match.id}.csv`, `﻿${toCsv(match, games)}`, 'text/csv;charset=utf-8');
  });
}

// スコアシート画面のDOMをそのまま画像化し、A4サイズのPDFファイルとしてダウンロードする。
// 日本語フォントをPDF側に埋め込む必要がないよう、html2canvasでラスタライズしてから
// jsPDFに画像として貼り付ける方式を取っている。
async function downloadSheetPdf(match) {
  const target = document.getElementById('sheet-content');
  const canvas = await window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff' });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(`softtennis_${match.id}.pdf`);
}

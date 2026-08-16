// ルールエンジン: 試合データ(pointLogの並び)から現在の状態を導出する純粋関数群。
// 状態は常に pointLog を先頭から再生して算出するため、Undo は単純に末尾の1件を
// 取り除いて再導出するだけでよい。

export const POINTS_TO_WIN_GAME = 4;
export const POINTS_TO_WIN_FINAL_GAME = 7;
export const GAMES_TO_WIN_MATCH = 4;

export function other(side) {
  return side === 'self' ? 'opponent' : 'self';
}

// --- 決まり方（ショットの種類 × 決めた/ミスした × どちらのチームが行ったか） ---
// レシーブ・サービスエース・ダブルフォルトは「サーブ側/レシーブ側とも後衛が行う」という
// 一般的な前衛・後衛の定型フォーメーションを前提に、実行選手を自動判定できる。
// ボレー・スマッシュ・ストローク・アウト・ネット・その他はラリー中に前衛・後衛どちらが
// 行ったか一意に決まらないため、記録画面側で選手を選んでもらう。
export const AUTO_POSITION_SHOT_TYPES = new Set(['ace', 'double_fault', 'receive']);

const REASON_LABELS = {
  'ace|decide|self': 'サービスエース',
  'ace|decide|opponent': '相手のサービスエース',
  'volley|decide|self': '自チームのボレー決め',
  'volley|decide|opponent': '相手のボレー決め',
  'volley|error|self': '自チームのボレーミス',
  'volley|error|opponent': '相手のボレーミス',
  'smash|decide|self': '自チームのスマッシュ決め',
  'smash|decide|opponent': '相手のスマッシュ決め',
  'smash|error|self': '自チームのスマッシュミス',
  'smash|error|opponent': '相手のスマッシュミス',
  'stroke|decide|self': '自チームのストローク決め',
  'stroke|decide|opponent': '相手のストローク決め',
  'stroke|error|self': '自チームのストロークミス',
  'stroke|error|opponent': '相手のストロークミス',
  'receive|error|self': '自チームのレシーブミス',
  'receive|error|opponent': '相手のレシーブミス',
  'out|error|self': '自チームのアウト',
  'out|error|opponent': '相手のアウト',
  'net|error|self': '自チームのネット',
  'net|error|opponent': '相手のネット',
  'double_fault|error|self': '自チームのダブルフォルト',
  'double_fault|error|opponent': '相手のダブルフォルト',
  'other|decide|self': 'その他（自チーム）',
  'other|decide|opponent': 'その他（相手）',
};

export function reasonKey({ shotType, outcome, agentTeam }) {
  return `${shotType}|${outcome}|${agentTeam}`;
}

export function reasonLabel(reason) {
  return REASON_LABELS[reasonKey(reason)] ?? reasonKey(reason);
}

// winner: そのポイントを取った側 ('self'|'opponent')。server: そのポイントのサーブ側。
// 選択可能な「決まり方」ボタンの一覧を返す。
export function reasonOptions(winner, server) {
  const loser = other(winner);
  const list = [];
  if (server === winner) list.push({ shotType: 'ace', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'volley', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'smash', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'stroke', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'receive', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'volley', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'smash', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'stroke', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'out', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'net', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'other', outcome: 'decide', agentTeam: winner });
  return list.map((r) => ({ ...r, label: reasonLabel(r) }));
}

function isGameWon(scoreA, scoreB, target) {
  return scoreA >= target && scoreA - scoreB >= 2;
}

// pointLog を再生し、試合の全体状態を導出する。
// match: { self: {front, back}, opponent: {front, back}, firstServer, pointLog }
export function deriveState(match) {
  const games = [];
  let gameNumber = 1;
  let server = match.firstServer;
  let scoreSelf = 0;
  let scoreOpponent = 0;
  let gameCountSelf = 0;
  let gameCountOpponent = 0;
  let isFinalGame = gameCountSelf === 3 && gameCountOpponent === 3;
  let currentGamePoints = [];
  let matchWinner = null;

  for (const point of match.pointLog) {
    if (matchWinner) break; // 試合終了後のログは無視（通常は発生しない）

    currentGamePoints.push(point);
    if (point.winner === 'self') scoreSelf += 1;
    else scoreOpponent += 1;

    const target = isFinalGame ? POINTS_TO_WIN_FINAL_GAME : POINTS_TO_WIN_GAME;
    const selfWonGame = isGameWon(scoreSelf, scoreOpponent, target);
    const opponentWonGame = isGameWon(scoreOpponent, scoreSelf, target);

    if (selfWonGame || opponentWonGame) {
      const winner = selfWonGame ? 'self' : 'opponent';
      games.push({
        gameNumber,
        server,
        isFinalGame,
        points: currentGamePoints,
        scoreSelf,
        scoreOpponent,
        winner,
      });
      if (winner === 'self') gameCountSelf += 1;
      else gameCountOpponent += 1;

      if (isFinalGame || gameCountSelf >= GAMES_TO_WIN_MATCH || gameCountOpponent >= GAMES_TO_WIN_MATCH) {
        matchWinner = winner;
        break;
      }

      gameNumber += 1;
      server = other(server);
      scoreSelf = 0;
      scoreOpponent = 0;
      currentGamePoints = [];
      isFinalGame = gameCountSelf === 3 && gameCountOpponent === 3;
    }
  }

  const isFinished = matchWinner !== null;
  const currentGame = isFinished
    ? null
    : {
        gameNumber,
        server,
        isFinalGame,
        points: currentGamePoints,
        scoreSelf,
        scoreOpponent,
      };

  // 後衛の選手が常にサーブするという定型フォーメーションを前提に自動判定する。
  const currentServerTeam = isFinished ? null : (server === 'self' ? match.self : match.opponent);

  return {
    games,
    currentGame,
    gameCountSelf,
    gameCountOpponent,
    matchWinner,
    isFinished,
    currentServer: isFinished ? null : server,
    currentServerPlayerName: isFinished ? null : currentServerTeam.back,
    pointsToWinCurrentGame: isFinished ? null : (isFinalGame ? POINTS_TO_WIN_FINAL_GAME : POINTS_TO_WIN_GAME),
  };
}

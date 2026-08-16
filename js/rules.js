// ルールエンジン: 試合データ(pointLogの並び)から現在の状態を導出する純粋関数群。
// 状態は常に pointLog を先頭から再生して算出するため、Undo は単純に末尾の1件を
// 取り除いて再導出するだけでよい。

export const POINTS_TO_WIN_GAME = 4;
export const POINTS_TO_WIN_FINAL_GAME = 7;

// 「Xゲームマッチ」として選択できる形式。数字は決着までの最大ゲーム数（奇数）。
export const MATCH_FORMATS = [3, 5, 7];
export const DEFAULT_MATCH_FORMAT = 7;

// マッチ形式（3/5/7ゲームマッチ）から、勝利に必要なゲーム先取数を算出する。
// 例: 7ゲームマッチ → 4ゲーム先取。旧データ互換のため未指定時はデフォルト形式を使う。
export function gamesToWinMatch(matchFormat) {
  return ((matchFormat ?? DEFAULT_MATCH_FORMAT) + 1) / 2;
}

export function other(side) {
  return side === 'self' ? 'opponent' : 'self';
}

function otherPosition(position) {
  return position === 'front' ? 'back' : 'front';
}

// 通常ゲームでは、そのゲームの最初のサーブ側チームがゲームを通してサーブする。
// ファイナルゲームでは2ポイントごとに「最初のサーブ順チーム→もう一方のチーム→
// 最初のチームの別選手→もう一方チームの別選手」の順でサーブ権が回る。
// gameServer: そのゲームで最初にサーブするチーム。pointIndexInGame: 0始まりのポイント番号。
export function serverTeamForPoint(gameServer, isFinalGame, pointIndexInGame) {
  if (!isFinalGame) return gameServer;
  const block = Math.floor(pointIndexInGame / 2);
  return block % 2 === 0 ? gameServer : other(gameServer);
}

// side ('self'|'opponent') のペアが、通常ゲームなら指定済みの担当選手固定で、
// ファイナルゲームなら上記の回転順に応じて、サーブ（またはレシーブ）を行う選手の
// ポジション ('front'|'back') を返す。まだ選手が選択されていない場合は null を返す
// （記録画面でその都度選んでもらう必要がある）。
export function activeServePosition(match, side, gameServer, isFinalGame, pointIndexInGame) {
  const team = side === 'self' ? match.self : match.opponent;
  if (!team.serverPosition) return null;
  if (!isFinalGame) return team.serverPosition;
  const offset = side === gameServer ? 0 : 1;
  const block = Math.floor(pointIndexInGame / 2);
  const localTurn = Math.max(0, Math.floor((block - offset) / 2));
  return localTurn % 2 === 0 ? team.serverPosition : otherPosition(team.serverPosition);
}

// --- 決まり方（ショットの種類 × 決めた/ミスした × どちらのペアが行ったか） ---
// レシーブ・サービスエース・ダブルフォルトは「サーブ側/レシーブ側とも、各ペアで
// あらかじめ指定したサーブ担当選手（前衛 or 後衛）が行う」という前提を元に、
// 実行選手を自動判定できる。
// ボレー・スマッシュ・ストローク・アウト・ネット・その他はラリー中に前衛・後衛どちらが
// 行ったか一意に決まらないため、記録画面側で選手を選んでもらう。
export const AUTO_POSITION_SHOT_TYPES = new Set(['ace', 'double_fault', 'receive']);

// 自ペア/相手ペアどちらの行為かをすべてのラベルで明示し、記録者が取り違えないようにする。
const REASON_LABELS = {
  'ace|decide|self': '自ペアのサービスエース',
  'ace|decide|opponent': '相手ペアのサービスエース',
  'volley|decide|self': '自ペアのボレー決め',
  'volley|decide|opponent': '相手ペアのボレー決め',
  'volley|error|self': '自ペアのボレーミス',
  'volley|error|opponent': '相手ペアのボレーミス',
  'smash|decide|self': '自ペアのスマッシュ決め',
  'smash|decide|opponent': '相手ペアのスマッシュ決め',
  'smash|error|self': '自ペアのスマッシュミス',
  'smash|error|opponent': '相手ペアのスマッシュミス',
  'stroke|decide|self': '自ペアのストローク決め',
  'stroke|decide|opponent': '相手ペアのストローク決め',
  'stroke|error|self': '自ペアのストロークミス',
  'stroke|error|opponent': '相手ペアのストロークミス',
  'receive|error|self': '自ペアのレシーブミス',
  'receive|error|opponent': '相手ペアのレシーブミス',
  'out|error|self': '自ペアのアウト',
  'out|error|opponent': '相手ペアのアウト',
  'net|error|self': '自ペアのネット',
  'net|error|opponent': '相手ペアのネット',
  'double_fault|error|self': '自ペアのダブルフォルト',
  'double_fault|error|opponent': '相手ペアのダブルフォルト',
  'other|decide|self': 'その他（自ペア）',
  'other|decide|opponent': 'その他（相手ペア）',
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
// match: { self: {front, back}, opponent: {front, back}, firstServer, matchFormat, pointLog }
export function deriveState(match) {
  const gamesToWin = gamesToWinMatch(match.matchFormat);
  const games = [];
  let gameNumber = 1;
  // そのゲームで最初にサーブするチーム（通常ゲームはこれが最後までサーブ側になる）。
  let gameServer = match.firstServer;
  let scoreSelf = 0;
  let scoreOpponent = 0;
  let gameCountSelf = 0;
  let gameCountOpponent = 0;
  let isFinalGame = gameCountSelf === gamesToWin - 1 && gameCountOpponent === gamesToWin - 1;
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
        server: gameServer,
        isFinalGame,
        points: currentGamePoints,
        scoreSelf,
        scoreOpponent,
        winner,
      });
      if (winner === 'self') gameCountSelf += 1;
      else gameCountOpponent += 1;

      if (isFinalGame || gameCountSelf >= gamesToWin || gameCountOpponent >= gamesToWin) {
        matchWinner = winner;
        break;
      }

      gameNumber += 1;
      gameServer = other(gameServer);
      scoreSelf = 0;
      scoreOpponent = 0;
      currentGamePoints = [];
      isFinalGame = gameCountSelf === gamesToWin - 1 && gameCountOpponent === gamesToWin - 1;
    }
  }

  const isFinished = matchWinner !== null;
  const currentGame = isFinished
    ? null
    : {
        gameNumber,
        server: gameServer,
        isFinalGame,
        points: currentGamePoints,
        scoreSelf,
        scoreOpponent,
      };

  // 次に記録されるポイント（0始まり）の時点で、実際にサーブするチーム/選手を求める。
  // ファイナルゲームでは2ポイントごとに回転するため、ゲーム開始時のサーブ側とは限らない。
  const pointIndexInGame = currentGamePoints.length;
  const currentServer = isFinished ? null : serverTeamForPoint(gameServer, isFinalGame, pointIndexInGame);
  const currentServerPosition = isFinished
    ? null
    : activeServePosition(match, currentServer, gameServer, isFinalGame, pointIndexInGame);
  const currentServerTeam = currentServer === 'self' ? match.self : currentServer === 'opponent' ? match.opponent : null;

  return {
    games,
    currentGame,
    gameCountSelf,
    gameCountOpponent,
    gamesToWinMatch: gamesToWin,
    matchWinner,
    isFinished,
    currentServer,
    currentServerPosition,
    currentServerPlayerName: (isFinished || !currentServerPosition) ? null : currentServerTeam[currentServerPosition],
    pointsToWinCurrentGame: isFinished ? null : (isFinalGame ? POINTS_TO_WIN_FINAL_GAME : POINTS_TO_WIN_GAME),
  };
}

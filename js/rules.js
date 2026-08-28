// ルールエンジン: 試合データ(pointLogの並び)から現在の状態を導出する純粋関数群。
// 状態は常に pointLog を先頭から再生して算出するため、Undo は単純に末尾の1件を
// 取り除いて再導出するだけでよい。

export const POINTS_TO_WIN_GAME = 4;
export const POINTS_TO_WIN_FINAL_GAME = 7;

// 「Xゲームマッチ」として選択できる形式。数字は決着までの最大ゲーム数（奇数）。
export const MATCH_FORMATS = [3, 5, 7];
export const DEFAULT_MATCH_FORMAT = 7;

// ファイナルゲームの形式。7pt: 7ポイント先取・サーブは2ポイントごとに両ペア間で回転。
// 4pt: 通常ゲームと同じく4ポイント先取・片方のペアのみがサーブする。
export const FINAL_GAME_POINT_OPTIONS = [7, 4];
export const DEFAULT_FINAL_GAME_POINTS = 7;

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

// 通常ゲーム（および4ポイント制ファイナルゲーム）では、そのゲームの最初のサーブ側
// チームがゲームを通してサーブする。7ポイント制ファイナルゲームでは2ポイントごとに
// 「最初のサーブ順チーム→もう一方のチーム→最初のチームの別選手→もう一方チームの
// 別選手」の順でサーブ権が回る。
// gameServer: そのゲームで最初にサーブするチーム。pointIndexInGame: 0始まりのポイント番号。
// rotatesBetweenPairs: 7ポイント制ファイナルゲームかどうか（サーブ側ペア自体が回転するか）。
export function serverTeamForPoint(gameServer, rotatesBetweenPairs, pointIndexInGame) {
  if (!rotatesBetweenPairs) return gameServer;
  const block = Math.floor(pointIndexInGame / 2);
  return block % 2 === 0 ? gameServer : other(gameServer);
}

// side ('self'|'opponent') のペアが、サーブ（またはレシーブ）を行う選手のポジション
// ('front'|'back') を返す。サーブ側でまだ選手が選択されていない場合は null を返す
// （記録画面でその都度選んでもらう必要がある）。
// サーブ側: rotatesBetweenPairs=false（通常ゲーム・4ポイント制ファイナル）ではサーブ側
// ペアのみ2ポイントごとに担当選手が交代する。rotatesBetweenPairs=true（7ポイント制
// ファイナル）では2ポイントごとに両ペア間でサーブ権自体が回転し、各ペア内でも自分たち
// の番が回ってくるたびに担当選手が交代する。
// レシーブ側: そのゲーム内で何本目のサーブ（0始まり）かの偶数/奇数だけで決まり
// （0-0からの1本目=0本目=偶数は後衛、次の奇数本目は前衛…）、レシーブ側チームが
// どちらの選手をサーブ順1番目に選んだか（serverPosition）とは無関係。
export function activeServePosition(match, side, gameServer, rotatesBetweenPairs, pointIndexInGame) {
  const team = side === 'self' ? match.self : match.opponent;
  const actualServer = serverTeamForPoint(gameServer, rotatesBetweenPairs, pointIndexInGame);

  if (side !== actualServer) {
    return pointIndexInGame % 2 === 0 ? 'back' : 'front';
  }

  if (!team.serverPosition) return null;
  const block = Math.floor(pointIndexInGame / 2);
  if (!rotatesBetweenPairs) {
    return block % 2 === 0 ? team.serverPosition : otherPosition(team.serverPosition);
  }
  const localTurn = Math.floor(block / 2);
  return localTurn % 2 === 0 ? team.serverPosition : otherPosition(team.serverPosition);
}

// --- 決まり方（ショットの種類 × 決めた/ミスした × どちらのペアが行ったか） ---
// レシーブ・レシーブエース・サービスエース・ダブルフォルトは「サーブ側/レシーブ側とも、
// 各ペアであらかじめ指定したサーブ担当選手（前衛 or 後衛）が行う」という前提を元に、
// 実行選手を自動判定できる。
// ボレー・スマッシュ・ストロークはラリー中に前衛・後衛どちらが行ったか一意に決まらない
// ため、記録画面側で選手を選んでもらう。
export const AUTO_POSITION_SHOT_TYPES = new Set(['ace', 'receive_ace', 'double_fault', 'receive']);

// 自ペア/相手ペアどちらの行為かをすべてのラベルで明示し、記録者が取り違えないようにする。
const REASON_LABELS = {
  'ace|decide|self': '自ペアのサービスエース',
  'ace|decide|opponent': '相手ペアのサービスエース',
  'receive_ace|decide|self': '自ペアのレシーブエース',
  'receive_ace|decide|opponent': '相手ペアのレシーブエース',
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
  // サービスエースはサーブ側が勝った場合、レシーブエースはレシーブ側が勝った場合にのみ選択肢に出す。
  if (server === winner) list.push({ shotType: 'ace', outcome: 'decide', agentTeam: winner });
  if (server !== winner) list.push({ shotType: 'receive_ace', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'volley', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'smash', outcome: 'decide', agentTeam: winner });
  list.push({ shotType: 'stroke', outcome: 'decide', agentTeam: winner });
  // レシーブミスはレシーブ側（サーブしていない側）が失点した場合にのみ選択肢に出す。
  if (server === winner) list.push({ shotType: 'receive', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'volley', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'smash', outcome: 'error', agentTeam: loser });
  list.push({ shotType: 'stroke', outcome: 'error', agentTeam: loser });
  return list.map((r) => ({ ...r, label: reasonLabel(r) }));
}

function isGameWon(scoreA, scoreB, target) {
  return scoreA >= target && scoreA - scoreB >= 2;
}

// isFinalGame・finalGameFormatから、そのゲームの目標ポイント数と、サーブ権がペア間で
// 回転するかどうかを算出する。
function finalGameRule(isFinalGame, finalGameFormat) {
  const rotatesBetweenPairs = isFinalGame && finalGameFormat !== 4;
  const target = rotatesBetweenPairs ? POINTS_TO_WIN_FINAL_GAME : POINTS_TO_WIN_GAME;
  return { rotatesBetweenPairs, target };
}

// pointLog を再生し、試合の全体状態を導出する。
// match: { self: {front, back}, opponent: {front, back}, firstServer, matchFormat,
//          finalGameFormat, pointLog }
export function deriveState(match) {
  const gamesToWin = gamesToWinMatch(match.matchFormat);
  const finalGameFormat = match.finalGameFormat ?? DEFAULT_FINAL_GAME_POINTS;
  const games = [];
  let gameNumber = 1;
  // そのゲームで最初にサーブするチーム（通常ゲーム・4ポイント制ファイナルはこれが
  // 最後までサーブ側になる）。
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

    const { rotatesBetweenPairs, target } = finalGameRule(isFinalGame, finalGameFormat);
    const selfWonGame = isGameWon(scoreSelf, scoreOpponent, target);
    const opponentWonGame = isGameWon(scoreOpponent, scoreSelf, target);

    if (selfWonGame || opponentWonGame) {
      const winner = selfWonGame ? 'self' : 'opponent';
      games.push({
        gameNumber,
        server: gameServer,
        isFinalGame,
        finalGameFormat: isFinalGame ? finalGameFormat : null,
        rotatesBetweenPairs,
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
  const { rotatesBetweenPairs: currentRotates, target: currentTarget } = finalGameRule(isFinalGame, finalGameFormat);
  const currentGame = isFinished
    ? null
    : {
        gameNumber,
        server: gameServer,
        isFinalGame,
        finalGameFormat: isFinalGame ? finalGameFormat : null,
        rotatesBetweenPairs: currentRotates,
        points: currentGamePoints,
        scoreSelf,
        scoreOpponent,
      };

  // 次に記録されるポイント（0始まり）の時点で、実際にサーブするチーム/選手を求める。
  // 7ポイント制ファイナルゲームでは2ポイントごとに回転するため、ゲーム開始時のサーブ側
  // とは限らない。
  const pointIndexInGame = currentGamePoints.length;
  const currentServer = isFinished ? null : serverTeamForPoint(gameServer, currentRotates, pointIndexInGame);
  const currentServerPosition = isFinished
    ? null
    : activeServePosition(match, currentServer, gameServer, currentRotates, pointIndexInGame);
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
    pointsToWinCurrentGame: isFinished ? null : currentTarget,
  };
}

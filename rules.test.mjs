import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveState, gamesToWinMatch, serverTeamForPoint, activeServePosition } from './js/rules.js';

function baseMatch(overrides = {}) {
  return {
    self: { front: '自前衛', back: '自後衛', serverPosition: 'back' },
    opponent: { front: '相前衛', back: '相後衛', serverPosition: 'back' },
    firstServer: 'self',
    pointLog: [],
    ...overrides,
  };
}

function points(winners, server = 'self') {
  return winners.map((winner) => ({
    server,
    serveType: '1st',
    winner,
    agentTeam: winner,
    shotType: 'stroke',
    outcome: 'decide',
    actingPlayerKey: 'back',
  }));
}

test('4-0で自ペアが1ゲーム先取する', () => {
  const match = baseMatch({ pointLog: points(['self', 'self', 'self', 'self']) });
  const state = deriveState(match);
  assert.equal(state.games.length, 1);
  assert.equal(state.games[0].winner, 'self');
  assert.equal(state.games[0].scoreSelf, 4);
  assert.equal(state.gameCountSelf, 1);
  assert.equal(state.currentGame.gameNumber, 2);
});

test('3-3からは2点差がつくまでゲームが終わらない（デュース）', () => {
  const winners = ['self', 'opponent', 'self', 'opponent', 'self', 'opponent']; // 3-3
  const match = baseMatch({ pointLog: points(winners) });
  let state = deriveState(match);
  assert.equal(state.games.length, 0, '3-3ではまだゲームは終わらない');
  assert.equal(state.currentGame.scoreSelf, 3);
  assert.equal(state.currentGame.scoreOpponent, 3);

  // 4-3ではまだ終わらない
  match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  state = deriveState(match);
  assert.equal(state.games.length, 0, '4-3ではまだ終わらない（diffが1のため）');

  // 5-3で決着（diff2）
  match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  state = deriveState(match);
  assert.equal(state.games.length, 1);
  assert.equal(state.games[0].scoreSelf, 5);
  assert.equal(state.games[0].scoreOpponent, 3);
});

test('ゲームカウント3-3でファイナルゲーム（7点制）に切り替わる', () => {
  const pointLog = [];
  // self が3ゲーム、opponent が3ゲームを先取（各ゲーム4-0で消化）
  for (let g = 0; g < 3; g += 1) pointLog.push(...points(['self', 'self', 'self', 'self']));
  for (let g = 0; g < 3; g += 1) pointLog.push(...points(['opponent', 'opponent', 'opponent', 'opponent']));

  const match = baseMatch({ pointLog });
  const state = deriveState(match);
  assert.equal(state.gameCountSelf, 3);
  assert.equal(state.gameCountOpponent, 3);
  assert.equal(state.currentGame.isFinalGame, true, '3-3の次はファイナルゲーム');
  assert.equal(state.pointsToWinCurrentGame, 7);
});

test('ファイナルゲームは7点先取、6-6以降は2点差が必要', () => {
  const pointLog = [];
  for (let g = 0; g < 3; g += 1) pointLog.push(...points(['self', 'self', 'self', 'self']));
  for (let g = 0; g < 3; g += 1) pointLog.push(...points(['opponent', 'opponent', 'opponent', 'opponent']));
  // ファイナルゲームで6-6まで
  for (let i = 0; i < 6; i += 1) pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  for (let i = 0; i < 6; i += 1) pointLog.push({ server: 'self', serveType: '1st', winner: 'opponent', agentTeam: 'opponent', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });

  const match = baseMatch({ pointLog });
  let state = deriveState(match);
  assert.equal(state.isFinished, false, '6-6ではまだ終わらない');
  assert.equal(state.currentGame.scoreSelf, 6);
  assert.equal(state.currentGame.scoreOpponent, 6);

  match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' }); // 7-6
  state = deriveState(match);
  assert.equal(state.isFinished, false, '7-6ではまだ終わらない（diff1）');

  match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' }); // 8-6
  state = deriveState(match);
  assert.equal(state.isFinished, true);
  assert.equal(state.matchWinner, 'self');
});

test('4ゲーム先取（3-3にならないケース、デフォルトの7ゲームマッチ）で試合が終了する', () => {
  const pointLog = [];
  for (let g = 0; g < gamesToWinMatch(); g += 1) pointLog.push(...points(['self', 'self', 'self', 'self']));
  const match = baseMatch({ pointLog });
  const state = deriveState(match);
  assert.equal(state.isFinished, true);
  assert.equal(state.matchWinner, 'self');
  assert.equal(state.gameCountSelf, 4);
});

test('3ゲームマッチでは1-1の次がファイナルゲームになり、2ゲーム先取で終了する', () => {
  const match = baseMatch({ matchFormat: 3, pointLog: points(['self', 'self', 'self', 'self']) });
  let state = deriveState(match);
  assert.equal(state.gamesToWinMatch, 2);
  assert.equal(state.gameCountSelf, 1);
  assert.equal(state.isFinished, false, '1ゲーム先取だけではまだ終わらない');

  match.pointLog.push(...points(['opponent', 'opponent', 'opponent', 'opponent']));
  state = deriveState(match);
  assert.equal(state.gameCountOpponent, 1);
  assert.equal(state.currentGame.isFinalGame, true, '1-1になったので次はファイナルゲーム');
  assert.equal(state.pointsToWinCurrentGame, 7);

  for (let i = 0; i < 7; i += 1) match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  state = deriveState(match);
  assert.equal(state.isFinished, true);
  assert.equal(state.matchWinner, 'self');
  assert.equal(state.gameCountSelf, 2);
});

test('5ゲームマッチでは2-2の次がファイナルゲームになる', () => {
  const pointLog = [];
  for (let g = 0; g < 2; g += 1) pointLog.push(...points(['self', 'self', 'self', 'self']));
  for (let g = 0; g < 2; g += 1) pointLog.push(...points(['opponent', 'opponent', 'opponent', 'opponent']));
  const match = baseMatch({ matchFormat: 5, pointLog });
  const state = deriveState(match);
  assert.equal(state.gamesToWinMatch, 3);
  assert.equal(state.gameCountSelf, 2);
  assert.equal(state.gameCountOpponent, 2);
  assert.equal(state.currentGame.isFinalGame, true);
});

test('matchFormatを指定しない場合は従来通り7ゲームマッチ（4ゲーム先取）として扱われる', () => {
  const match = baseMatch({ pointLog: [] });
  const state = deriveState(match);
  assert.equal(state.gamesToWinMatch, 4);
});

test('サーブ側はゲームごとに交互に交代する', () => {
  const match = baseMatch({ pointLog: points(['self', 'self', 'self', 'self']) });
  const state = deriveState(match);
  assert.equal(state.games[0].server, 'self');
  assert.equal(state.currentGame.server, 'opponent');
});

test('ダブルフォルトを含むポイントも通常通り集計される', () => {
  const pointLog = [
    { server: 'self', serveType: '2nd', winner: 'opponent', agentTeam: 'self', shotType: 'double_fault', outcome: 'error', actingPlayerKey: 'back' },
    ...points(['self', 'self', 'self', 'self']),
  ];
  const match = baseMatch({ pointLog });
  const state = deriveState(match);
  assert.equal(state.games[0].scoreSelf, 4);
  assert.equal(state.games[0].scoreOpponent, 1);
});

test('サーブする選手はペアごとに指定したポジション（後衛）で自動判定される', () => {
  const match = baseMatch({ pointLog: [] });
  const state = deriveState(match);
  assert.equal(state.currentServer, 'self');
  assert.equal(state.currentServerPosition, 'back');
  assert.equal(state.currentServerPlayerName, '自後衛');
});

test('サーブ担当選手を前衛に指定した場合はその選手が自動判定される', () => {
  const match = baseMatch({
    self: { front: '自前衛', back: '自後衛', serverPosition: 'front' },
    pointLog: [],
  });
  const state = deriveState(match);
  assert.equal(state.currentServer, 'self');
  assert.equal(state.currentServerPosition, 'front');
  assert.equal(state.currentServerPlayerName, '自前衛');
});

test('serverPositionが未指定の場合はcurrentServerPositionがnullになり、選手選択が必要なことを示す', () => {
  const match = baseMatch({
    self: { front: '自前衛', back: '自後衛' },
    pointLog: [],
  });
  const state = deriveState(match);
  assert.equal(state.currentServerPosition, null);
  assert.equal(state.currentServerPlayerName, null);
});

test('通常ゲームではサーブ側チームはゲームを通して固定される（回転しない）', () => {
  for (let i = 0; i < 6; i += 1) {
    assert.equal(serverTeamForPoint('self', false, i), 'self');
  }
});

test('ファイナルゲームでは2ポイントごとに「自ペア→相手ペア→自ペアの別選手→相手ペアの別選手」の順でサーブが回る', () => {
  const match = baseMatch({});
  // gameServer='self' から始まるファイナルゲームを想定
  const expectedTeams = ['self', 'self', 'opponent', 'opponent', 'self', 'self', 'opponent', 'opponent', 'self', 'self'];
  const expectedPositions = ['back', 'back', 'back', 'back', 'front', 'front', 'front', 'front', 'back', 'back'];
  expectedTeams.forEach((team, i) => {
    const actualTeam = serverTeamForPoint('self', true, i);
    assert.equal(actualTeam, team, `point index ${i} の サーブ側チーム`);
    const actualPosition = activeServePosition(match, actualTeam, 'self', true, i);
    assert.equal(actualPosition, expectedPositions[i], `point index ${i} の サーブポジション`);
  });
});

test('ファイナルゲームの回転は実際の試合進行（deriveState）でも反映される', () => {
  const match = baseMatch({ matchFormat: 3 });
  match.pointLog.push(...points(['self', 'self', 'self', 'self'])); // game1: selfが4-0
  match.pointLog.push(...points(['opponent', 'opponent', 'opponent', 'opponent'])); // game2: opponentが4-0 -> 1-1
  let state = deriveState(match);
  assert.equal(state.currentGame.isFinalGame, true);
  assert.equal(state.currentGame.server, 'self', 'ファイナルゲームの最初のサーブ順は通常通りゲーム2の次のチーム');
  assert.equal(state.currentServer, 'self');
  assert.equal(state.currentServerPosition, 'back');

  // 2ポイント消化 → 相手ペアの後衛に交代
  match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  match.pointLog.push({ server: 'self', serveType: '1st', winner: 'self', agentTeam: 'self', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  state = deriveState(match);
  assert.equal(state.currentServer, 'opponent');
  assert.equal(state.currentServerPosition, 'back');

  // さらに2ポイント消化 → 自ペアの前衛（別選手）に交代
  match.pointLog.push({ server: 'opponent', serveType: '1st', winner: 'opponent', agentTeam: 'opponent', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  match.pointLog.push({ server: 'opponent', serveType: '1st', winner: 'opponent', agentTeam: 'opponent', shotType: 'stroke', outcome: 'decide', actingPlayerKey: 'back' });
  state = deriveState(match);
  assert.equal(state.currentServer, 'self');
  assert.equal(state.currentServerPosition, 'front');
});

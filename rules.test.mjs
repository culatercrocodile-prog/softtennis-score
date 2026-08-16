import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveState, GAMES_TO_WIN_MATCH } from './js/rules.js';

function baseMatch(overrides = {}) {
  return {
    self: { front: '自前衛', back: '自後衛' },
    opponent: { front: '相前衛', back: '相後衛' },
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

test('4-0で自チームが1ゲーム先取する', () => {
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

test('4ゲーム先取（3-3にならないケース）で試合が終了する', () => {
  const pointLog = [];
  for (let g = 0; g < GAMES_TO_WIN_MATCH; g += 1) pointLog.push(...points(['self', 'self', 'self', 'self']));
  const match = baseMatch({ pointLog });
  const state = deriveState(match);
  assert.equal(state.isFinished, true);
  assert.equal(state.matchWinner, 'self');
  assert.equal(state.gameCountSelf, 4);
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

test('サーブする選手は常に後衛（自動判定）', () => {
  const match = baseMatch({ pointLog: [] });
  const state = deriveState(match);
  assert.equal(state.currentServer, 'self');
  assert.equal(state.currentServerPlayerName, '自後衛');
});

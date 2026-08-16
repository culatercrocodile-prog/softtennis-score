// localStorageを使った試合データのCRUD。

const STORAGE_KEY = 'softtennis_matches_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(matches) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
}

export function listMatches() {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMatch(id) {
  return readAll().find((m) => m.id === id) ?? null;
}

export function saveMatch(match) {
  const matches = readAll();
  const index = matches.findIndex((m) => m.id === match.id);
  if (index >= 0) matches[index] = match;
  else matches.push(match);
  writeAll(matches);
  return match;
}

export function deleteMatch(id) {
  writeAll(readAll().filter((m) => m.id !== id));
}

export function generateId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createMatch({ self, opponent, firstServer }) {
  const match = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    status: 'in_progress',
    self,
    opponent,
    firstServer,
    pointLog: [],
  };
  saveMatch(match);
  return match;
}

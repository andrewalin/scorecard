export const DEFAULT_HOLE = 1;
export const DEFAULT_STROKES = 3;
export const MIN_VALUE = 1;
export const SUBMIT_THRESHOLD = 95;
export const HOLES_PER_SECTION = 9;
export const RESET_HOLE_CONFIRM_MS = 2500;
export const ROUND_MODES = {
  SIMPLE_9: "9",
  SIMPLE_18: "18",
  CUSTOM: "c",
};

export function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value ?? "")) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return parsed >= MIN_VALUE ? parsed : null;
}

export function defaultHoleLabel(hole) {
  return String(hole);
}

export function createHoleData(hole, label = defaultHoleLabel(hole)) {
  return { hole, label };
}

export function parseHoleLabel(value, fallbackHole) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "") {
    return createHoleData(fallbackHole);
  }

  const match = /^(\d+)([a-z]{0,2})$/.exec(normalized);
  if (!match) {
    return null;
  }

  const hole = parsePositiveInteger(match[1]);
  if (hole === null) {
    return null;
  }

  return createHoleData(hole, `${hole}${match[2]}`);
}

export function encodeScoreEntry(entry) {
  return `${entry.label}=${entry.strokes}`;
}

export function parseScoreEntry(value) {
  const [rawLabel, rawStrokes, extra] = (value ?? "").trim().toLowerCase().split("=");
  if (!rawLabel || !rawStrokes || extra !== undefined) {
    return null;
  }

  const holeData = parseHoleLabel(rawLabel, DEFAULT_HOLE);
  const strokes = parsePositiveInteger(rawStrokes);
  if (holeData === null || strokes === null) {
    return null;
  }

  return {
    hole: holeData.hole,
    label: holeData.label,
    strokes,
  };
}

export function getActiveEntry(state) {
  return state.editIndex === null ? null : state.entries[state.editIndex] ?? null;
}

export function getActiveHole(state) {
  const activeEntry = getActiveEntry(state);
  return activeEntry ? createHoleData(activeEntry.hole, activeEntry.label) : state.liveHole;
}

export function activeHoleHasCustomLabel(state) {
  const activeHole = getActiveHole(state);
  return activeHole.label !== defaultHoleLabel(activeHole.hole);
}

export function setLiveHole(state, holeData) {
  state.liveHole = createHoleData(holeData.hole, holeData.label);
}

export function isCustomRoundMode(state) {
  return state.roundMode === ROUND_MODES.CUSTOM;
}

export function syncEditedEntry(state, changes = {}) {
  const entry = getActiveEntry(state);
  if (!entry) {
    return;
  }

  if (changes.hole !== undefined) {
    entry.hole = changes.hole;
  }
  if (changes.label !== undefined) {
    entry.label = changes.label;
  }

  entry.strokes = state.draftStrokes;
}

export function advanceLiveHole(state) {
  const roundEnd = state.roundMode === ROUND_MODES.SIMPLE_9
    ? 9
    : state.roundMode === ROUND_MODES.SIMPLE_18
      ? 18
      : null;

  if (roundEnd !== null && state.liveHole.hole === roundEnd) {
    setLiveHole(state, createHoleData(DEFAULT_HOLE));
    return;
  }

  setLiveHole(state, createHoleData(state.liveHole.hole + 1));
}

export function readState(search) {
  const params = new URLSearchParams(search);
  const entries = [];

  for (const value of params.getAll("score")) {
    for (const compactEntry of value.split("|")) {
      const entry = parseScoreEntry(compactEntry);
      if (entry) {
        entries.push(entry);
      }
    }
  }

  const draftStrokes = parsePositiveInteger(params.get("s")) ?? DEFAULT_STROKES;
  const roundMode = Object.values(ROUND_MODES).includes(params.get("m"))
    ? params.get("m")
    : ROUND_MODES.SIMPLE_18;
  const liveHoleNumber = parsePositiveInteger(params.get("h")) ?? DEFAULT_HOLE;
  const liveHole = roundMode === ROUND_MODES.CUSTOM
    ? parseHoleLabel(params.get("l"), liveHoleNumber) ?? createHoleData(liveHoleNumber)
    : createHoleData(liveHoleNumber);
  const rawEditIndex = parsePositiveInteger(params.get("edit"));
  const editIndex =
    rawEditIndex !== null && rawEditIndex <= entries.length ? rawEditIndex - 1 : null;

  const state = {
    liveHole,
    roundMode,
    draftStrokes: Math.max(draftStrokes, MIN_VALUE),
    entries,
    editIndex,
  };

  const activeEntry = getActiveEntry(state);
  if (!activeEntry) {
    state.editIndex = null;
  } else {
    state.draftStrokes = activeEntry.strokes;
  }

  return state;
}

export function writeState(pathname, history, state) {
  const parts = [
    `m=${state.roundMode}`,
    `h=${state.liveHole.hole}`,
    `s=${state.draftStrokes}`,
  ];

  if (isCustomRoundMode(state) && state.liveHole.label !== defaultHoleLabel(state.liveHole.hole)) {
    parts.push(`l=${state.liveHole.label}`);
  }

  if (state.editIndex !== null) {
    parts.push(`edit=${state.editIndex + 1}`);
  }

  if (state.entries.length > 0) {
    parts.push(`score=${state.entries.map(encodeScoreEntry).join("|")}`);
  }

  history.replaceState({}, "", `${pathname}?${parts.join("&")}`);
}

const DEFAULT_HOLE = 1;
const DEFAULT_STROKES = 3;
const MIN_VALUE = 1;
const SUBMIT_THRESHOLD = 95;
const HOLES_PER_SECTION = 9;
const RESET_HOLE_CONFIRM_MS = 2500;

const holeValue = document.querySelector("#hole-value");
const strokesValue = document.querySelector("#strokes-value");
const scorecardList = document.querySelector("#scorecard-list");
const summaryCopy = document.querySelector("#summary-copy");
const submitSlider = document.querySelector("#submit-slider");
const submitWrap = document.querySelector(".submit-wrap");
const summaryPanel = document.querySelector("#summary-panel");
const modeCopy = document.querySelector("#mode-copy");
const toggleScorecardButton = document.querySelector("#toggle-scorecard");
const exitEditButton = document.querySelector("#exit-edit");
const resetHoleButton = document.querySelector("#reset-hole");
const toggleHoleLabelButton = document.querySelector("#toggle-hole-label");
const holeLabelInput = document.querySelector("#hole-label-input");
const submitLabel = document.querySelector(".submit-label");
const scoreBreakdownBar = document.querySelector("#score-breakdown-bar");
const scoreBreakdownLegend = document.querySelector("#score-breakdown-legend");
const liveScorecardTable = document.querySelector("#live-scorecard-table");

let submitLocked = false;
let isScorecardOpen = false;
let isHoleLabelEditorOpen = false;
let isResetHoleConfirming = false;
let resetHoleConfirmTimer = null;

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value ?? "")) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return parsed >= MIN_VALUE ? parsed : null;
}

function defaultHoleLabel(hole) {
  return String(hole);
}

function createHoleData(hole, label = defaultHoleLabel(hole)) {
  return { hole, label };
}

function parseHoleLabel(value, fallbackHole) {
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

function encodeScoreEntry(entry) {
  return `${entry.label}=${entry.strokes}`;
}

function parseScoreEntry(value) {
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

function getActiveEntry() {
  return state.editIndex === null ? null : state.entries[state.editIndex] ?? null;
}

function getActiveHole() {
  const activeEntry = getActiveEntry();
  return activeEntry ? createHoleData(activeEntry.hole, activeEntry.label) : state.liveHole;
}

function activeHoleHasCustomLabel() {
  const activeHole = getActiveHole();
  return activeHole.label !== defaultHoleLabel(activeHole.hole);
}

function setLiveHole(holeData) {
  state.liveHole = createHoleData(holeData.hole, holeData.label);
}

function syncEditedEntry(changes = {}) {
  const entry = getActiveEntry();
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

function clearResetHoleConfirm() {
  isResetHoleConfirming = false;
  if (resetHoleConfirmTimer !== null) {
    window.clearTimeout(resetHoleConfirmTimer);
    resetHoleConfirmTimer = null;
  }
}

function startResetHoleConfirm() {
  clearResetHoleConfirm();
  isResetHoleConfirming = true;
  resetHoleConfirmTimer = window.setTimeout(() => {
    isResetHoleConfirming = false;
    resetHoleConfirmTimer = null;
    render();
  }, RESET_HOLE_CONFIRM_MS);
}

function readState() {
  const params = new URLSearchParams(window.location.search);
  const entries = [];

  for (const value of params.getAll("score")) {
    for (const compactEntry of value.split("|")) {
      const entry = parseScoreEntry(compactEntry);
      if (entry) {
        entries.push(entry);
      }
    }
  }

  const liveHoleNumber = parsePositiveInteger(params.get("h")) ?? DEFAULT_HOLE;
  const liveHole =
    parseHoleLabel(params.get("l"), liveHoleNumber) ?? createHoleData(liveHoleNumber);
  const draftStrokes = parsePositiveInteger(params.get("s")) ?? DEFAULT_STROKES;
  const rawEditIndex = parsePositiveInteger(params.get("edit"));
  const editIndex =
    rawEditIndex !== null && rawEditIndex <= entries.length ? rawEditIndex - 1 : null;

  const nextState = {
    liveHole,
    draftStrokes: Math.max(draftStrokes, MIN_VALUE),
    entries,
    editIndex,
  };

  const activeEntry = nextState.editIndex === null ? null : nextState.entries[nextState.editIndex];
  if (!activeEntry) {
    nextState.editIndex = null;
  } else {
    nextState.draftStrokes = activeEntry.strokes;
  }

  return nextState;
}

function writeState() {
  const parts = [
    `h=${state.liveHole.hole}`,
    `s=${state.draftStrokes}`,
  ];

  if (state.liveHole.label !== defaultHoleLabel(state.liveHole.hole)) {
    parts.push(`l=${state.liveHole.label}`);
  }

  if (state.editIndex !== null) {
    parts.push(`edit=${state.editIndex + 1}`);
  }

  if (state.entries.length > 0) {
    parts.push(`score=${state.entries.map(encodeScoreEntry).join("|")}`);
  }

  window.history.replaceState({}, "", `${window.location.pathname}?${parts.join("&")}`);
}

function commitAndRender() {
  writeState();
  render();
}

function renderSummary() {
  const totalTracked = state.entries.length;
  const totalStrokes = state.entries.reduce((sum, entry) => sum + entry.strokes, 0);
  const averageStrokes = totalTracked === 0 ? 0 : totalStrokes / totalTracked;

  summaryCopy.textContent =
    `${totalTracked} hole${totalTracked === 1 ? "" : "s"} • ` +
    `${totalStrokes} stroke${totalStrokes === 1 ? "" : "s"} • ` +
    `${averageStrokes.toFixed(2)} avg`;
}

function renderControls() {
  const activeHole = getActiveHole();
  const isEditing = state.editIndex !== null;

  holeValue.textContent = String(activeHole.hole);
  strokesValue.textContent = String(state.draftStrokes);
  modeCopy.textContent = isEditing ? `Edit mode: play ${state.editIndex + 1}` : "New score";
  exitEditButton.hidden = !isEditing;
  submitWrap.hidden = isEditing;
  submitLabel.textContent = "Slide to submit score";
  summaryPanel.hidden = !isScorecardOpen;
  toggleScorecardButton.setAttribute("aria-expanded", String(isScorecardOpen));
  toggleScorecardButton.textContent = isScorecardOpen ? "Hide" : "Edit";

  document
    .querySelectorAll('[data-action^="hole-"]')
    .forEach((button) => (button.disabled = isEditing));

  resetHoleButton.disabled = isEditing;
  resetHoleButton.textContent = isResetHoleConfirming ? "Tap again for 1" : "Set to 1";

  holeLabelInput.hidden = !isHoleLabelEditorOpen && !activeHoleHasCustomLabel();
  holeLabelInput.value = activeHole.label;
  toggleHoleLabelButton.textContent =
    isHoleLabelEditorOpen || activeHoleHasCustomLabel() ? "Use number" : "Custom label";
}

function renderScoreBreakdown() {
  const totalScores = state.entries.length;
  if (totalScores === 0) {
    scoreBreakdownBar.replaceChildren();
    scoreBreakdownBar.setAttribute("aria-label", "No scores recorded yet");
    scoreBreakdownLegend.replaceChildren();
    return;
  }

  const strokeCounts = new Map();
  for (const entry of state.entries) {
    strokeCounts.set(entry.strokes, (strokeCounts.get(entry.strokes) ?? 0) + 1);
  }

  const orderedScores = [...strokeCounts.entries()].sort((a, b) => a[0] - b[0]);
  const barFragment = document.createDocumentFragment();
  const legendFragment = document.createDocumentFragment();
  const ariaParts = [];

  for (const [index, [strokes, count]] of orderedScores.entries()) {
    const percent = (count / totalScores) * 100;
    const color = `hsl(${(strokes * 47) % 360} 45% ${56 - Math.min(index, 4) * 4}%)`;
    const segment = document.createElement("span");
    const label = document.createElement("span");

    segment.className = "score-breakdown-segment";
    segment.style.width = `${percent}%`;
    segment.style.setProperty("--segment-color", color);
    segment.title = `${strokes} strokes: ${count}/${totalScores} (${Math.round(percent)}%)`;

    label.className = "score-breakdown-chip";
    label.style.setProperty("--segment-color", color);
    label.textContent = `${strokes}: ${Math.round(percent)}%`;

    ariaParts.push(`${Math.round(percent)} percent ${strokes} strokes`);
    barFragment.append(segment);
    legendFragment.append(label);
  }

  scoreBreakdownBar.replaceChildren(barFragment);
  scoreBreakdownBar.setAttribute("aria-label", ariaParts.join(", "));
  scoreBreakdownLegend.replaceChildren(legendFragment);
}

function renderLiveScorecard() {
  const activeHole = getActiveHole();
  const totalSlots = Math.max(state.entries.length + 1, 1);
  const sections = Math.max(1, Math.ceil(totalSlots / HOLES_PER_SECTION));
  const fragment = document.createDocumentFragment();

  for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
    const holeRow = document.createElement("tr");
    const strokesRow = document.createElement("tr");

    holeRow.className = "live-scorecard-row";
    strokesRow.className = "live-scorecard-row";

    for (const labelText of ["Hole", "Strokes"]) {
      const header = document.createElement("th");
      header.scope = "row";
      header.className = "live-scorecard-label";
      header.textContent = labelText;
      (labelText === "Hole" ? holeRow : strokesRow).append(header);
    }

    for (let offset = 0; offset < HOLES_PER_SECTION; offset += 1) {
      const slotIndex = sectionIndex * HOLES_PER_SECTION + offset;
      const entry = state.entries[slotIndex];
      const holeCell = document.createElement("td");
      const strokesCell = document.createElement("td");

      holeCell.className = "live-scorecard-hole-cell";
      strokesCell.className = "live-scorecard-strokes-cell";
      holeCell.textContent = entry ? entry.label : slotIndex === state.entries.length ? activeHole.label : "";
      strokesCell.textContent = entry ? String(entry.strokes) : "";

      if (slotIndex === state.entries.length) {
        holeCell.classList.add("is-current");
        strokesCell.classList.add("is-current");
      }

      if (slotIndex === state.editIndex) {
        holeCell.classList.add("is-editing");
        strokesCell.classList.add("is-editing");
      }

      holeRow.append(holeCell);
      strokesRow.append(strokesCell);
    }

    fragment.append(holeRow, strokesRow);
  }

  liveScorecardTable.replaceChildren(fragment);
}

function renderScorecardList() {
  scorecardList.replaceChildren(
    ...state.entries.map((entry, index) => {
      const item = document.createElement("li");
      item.className = "scorecard-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = `scorecard-button${index === state.editIndex ? " is-selected" : ""}`;
      button.dataset.editIndex = String(index);

      const left = document.createElement("div");
      const holeLabel = document.createElement("div");
      const metaLabel = document.createElement("div");
      const strokesLabel = document.createElement("div");

      holeLabel.className = "scorecard-hole";
      holeLabel.textContent = `Hole ${entry.label}`;

      metaLabel.className = "scorecard-meta";
      metaLabel.textContent = `Play ${index + 1}`;

      strokesLabel.className = "scorecard-strokes";
      strokesLabel.textContent = `${entry.strokes} stroke${entry.strokes === 1 ? "" : "s"}`;

      left.append(holeLabel, metaLabel);
      button.append(left, strokesLabel);
      item.append(button);
      return item;
    }),
  );
}

function render() {
  renderSummary();
  renderControls();
  renderScoreBreakdown();
  renderLiveScorecard();
  renderScorecardList();
}

function resetSubmitSlider() {
  submitSlider.value = "0";
}

function releaseSubmitLock() {
  submitLocked = false;
  resetSubmitSlider();
}

function advanceLiveHole() {
  setLiveHole(createHoleData(state.liveHole.hole + 1));
}

function submitScore() {
  clearResetHoleConfirm();
  const activeHole = getActiveHole();

  state.entries.push({
    hole: activeHole.hole,
    label: activeHole.label,
    strokes: state.draftStrokes,
  });

  state.editIndex = null;
  advanceLiveHole();
  state.draftStrokes = DEFAULT_STROKES;
  isHoleLabelEditorOpen = false;
  commitAndRender();
  submitLocked = true;
  resetSubmitSlider();
}

function updateLiveHole(delta) {
  clearResetHoleConfirm();
  setLiveHole(createHoleData(Math.max(MIN_VALUE, state.liveHole.hole + delta)));
  commitAndRender();
}

function updateDraftStrokes(delta) {
  state.draftStrokes = Math.max(MIN_VALUE, state.draftStrokes + delta);
  syncEditedEntry();
  commitAndRender();
}

function updateState(action) {
  switch (action) {
    case "hole-decrement":
      if (state.editIndex === null) {
        updateLiveHole(-1);
      }
      return;
    case "hole-increment":
      if (state.editIndex === null) {
        updateLiveHole(1);
      }
      return;
    case "strokes-decrement":
      updateDraftStrokes(-1);
      return;
    case "strokes-increment":
      updateDraftStrokes(1);
      return;
    default:
      return;
  }
}

function startEditing(index) {
  const entry = state.entries[index];
  if (!entry) {
    return;
  }

  isScorecardOpen = true;
  clearResetHoleConfirm();
  state.editIndex = index;
  state.draftStrokes = entry.strokes;
  isHoleLabelEditorOpen = entry.label !== defaultHoleLabel(entry.hole);
  commitAndRender();
}

function exitEditMode() {
  syncEditedEntry();
  clearResetHoleConfirm();
  isScorecardOpen = false;
  state.editIndex = null;
  state.draftStrokes = DEFAULT_STROKES;
  isHoleLabelEditorOpen = false;
  commitAndRender();
}

function toggleScorecard() {
  if (isScorecardOpen && state.editIndex !== null) {
    exitEditMode();
    return;
  }

  isScorecardOpen = !isScorecardOpen;
  render();
}

function handleResetHoleClick() {
  if (state.editIndex !== null) {
    return;
  }

  if (isResetHoleConfirming) {
    clearResetHoleConfirm();
    setLiveHole(createHoleData(DEFAULT_HOLE));
    commitAndRender();
    return;
  }

  startResetHoleConfirm();
  render();
}

function handleToggleHoleLabel() {
  if (isHoleLabelEditorOpen || activeHoleHasCustomLabel()) {
    const activeHole = getActiveHole();
    const defaultLabel = defaultHoleLabel(activeHole.hole);

    if (state.editIndex !== null) {
      syncEditedEntry({ label: defaultLabel });
    } else {
      setLiveHole(createHoleData(state.liveHole.hole));
    }

    isHoleLabelEditorOpen = false;
    commitAndRender();
    return;
  }

  isHoleLabelEditorOpen = true;
  render();
  holeLabelInput.focus();
  holeLabelInput.select();
}

function applyHoleLabelInput() {
  const activeHole = getActiveHole();
  const parsed = parseHoleLabel(holeLabelInput.value, activeHole.hole);

  holeLabelInput.setCustomValidity(parsed ? "" : "Use a hole label like 15, 15a, or 15b.");
  if (!parsed) {
    return;
  }

  if (state.editIndex !== null) {
    syncEditedEntry(parsed);
  } else {
    setLiveHole(parsed);
  }

  commitAndRender();
}

function handleSubmitSlider() {
  if (submitLocked || Number(submitSlider.value) < SUBMIT_THRESHOLD) {
    return;
  }

  if (state.editIndex !== null) {
    syncEditedEntry();
    commitAndRender();
    submitLocked = true;
    resetSubmitSlider();
    return;
  }

  submitScore();
}

const state = readState();
writeState();
render();

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.editIndex !== undefined) {
    startEditing(Number(button.dataset.editIndex));
    return;
  }

  if (button.id === "exit-edit") {
    exitEditMode();
    return;
  }

  if (button.id === "toggle-scorecard") {
    toggleScorecard();
    return;
  }

  if (button.id === "reset-hole") {
    handleResetHoleClick();
    return;
  }

  if (button.id === "toggle-hole-label") {
    handleToggleHoleLabel();
    return;
  }

  updateState(button.dataset.action);
});

holeLabelInput.addEventListener("input", applyHoleLabelInput);
submitSlider.addEventListener("input", handleSubmitSlider);
submitSlider.addEventListener("change", releaseSubmitLock);
submitSlider.addEventListener("pointerup", releaseSubmitLock);
submitSlider.addEventListener("pointercancel", releaseSubmitLock);

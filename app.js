const DEFAULT_HOLE = 1;
const DEFAULT_STROKES = 3;
const MIN_VALUE = 1;
const SUBMIT_THRESHOLD = 95;

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
const RESET_HOLE_CONFIRM_MS = 2500;

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
    render(state);
  }, RESET_HOLE_CONFIRM_MS);
}

function parseHoleLabel(value, fallbackHole) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "") {
    return {
      hole: fallbackHole,
      label: defaultHoleLabel(fallbackHole),
    };
  }

  const match = /^(\d+)([a-z]{0,2})$/.exec(normalized);
  if (!match) {
    return null;
  }

  const hole = parsePositiveInteger(match[1]);
  if (hole === null) {
    return null;
  }

  return {
    hole,
    label: `${hole}${match[2]}`,
  };
}

function parseScoreEntry(value) {
  const match = /^([0-9]+[a-z]{0,2})=(\d+)$/.exec((value ?? "").trim().toLowerCase());
  if (!match) {
    return null;
  }

  const holeData = parseHoleLabel(match[1], DEFAULT_HOLE);
  const strokes = parsePositiveInteger(match[2]);
  if (holeData === null || strokes === null) {
    return null;
  }

  return {
    hole: holeData.hole,
    label: holeData.label,
    strokes,
  };
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

  const currentHole = parsePositiveInteger(params.get("h")) ?? DEFAULT_HOLE;
  const currentLabel =
    parseHoleLabel(params.get("l"), currentHole)?.label ?? defaultHoleLabel(currentHole);
  const draftStrokes = parsePositiveInteger(params.get("s")) ?? DEFAULT_STROKES;
  const rawEditIndex = parsePositiveInteger(params.get("edit"));
  const editIndex =
    rawEditIndex !== null && rawEditIndex <= entries.length ? rawEditIndex - 1 : null;

  const state = {
    currentHole: Math.max(currentHole, MIN_VALUE),
    currentLabel,
    selectedHole: Math.max(currentHole, MIN_VALUE),
    selectedLabel: currentLabel,
    draftStrokes: Math.max(draftStrokes, MIN_VALUE),
    entries,
    editIndex,
  };

  if (state.editIndex !== null) {
    const entry = state.entries[state.editIndex];
    if (entry) {
      state.selectedHole = entry.hole;
      state.selectedLabel = entry.label;
      state.draftStrokes = entry.strokes;
    } else {
      state.editIndex = null;
    }
  }

  return state;
}

function writeState(state) {
  const parts = [
    `h=${state.currentHole}`,
    `s=${state.draftStrokes}`,
  ];
  if (state.currentLabel !== defaultHoleLabel(state.currentHole)) {
    parts.push(`l=${encodeURIComponent(state.currentLabel)}`);
  }
  if (state.editIndex !== null) {
    parts.push(`edit=${state.editIndex + 1}`);
  }

  if (state.entries.length > 0) {
    const compactScore = state.entries
      .map((entry) => `${encodeURIComponent(entry.label)}=${entry.strokes}`)
      .join("|");
    parts.push(`score=${compactScore}`);
  }

  const nextUrl = `${window.location.pathname}?${parts.join("&")}`;
  window.history.replaceState({}, "", nextUrl);
}

function buildLiveScorecard(state) {
  const totalSlots = Math.max(state.entries.length + 1, 1);
  const sections = Math.max(1, Math.ceil(totalSlots / 9));
  const fragment = document.createDocumentFragment();

  for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
    const holeRow = document.createElement("tr");
    const strokesRow = document.createElement("tr");

    holeRow.className = "live-scorecard-row";
    strokesRow.className = "live-scorecard-row";

    const holeHeader = document.createElement("th");
    holeHeader.scope = "row";
    holeHeader.className = "live-scorecard-label";
    holeHeader.textContent = "Hole";

    const strokesHeader = document.createElement("th");
    strokesHeader.scope = "row";
    strokesHeader.className = "live-scorecard-label";
    strokesHeader.textContent = "Strokes";

    holeRow.append(holeHeader);
    strokesRow.append(strokesHeader);

    for (let offset = 0; offset < 9; offset += 1) {
      const slotIndex = sectionIndex * 9 + offset;
      const entry = state.entries[slotIndex];
      const holeCell = document.createElement("td");
      const strokesCell = document.createElement("td");
      const isCurrentHole = slotIndex === state.entries.length;
      const isEditingHole = slotIndex === state.editIndex;

      holeCell.className = "live-scorecard-hole-cell";
      strokesCell.className = "live-scorecard-strokes-cell";
      holeCell.textContent = entry ? entry.label : isCurrentHole ? state.currentLabel : "";
      strokesCell.textContent = entry ? String(entry.strokes) : "";

      if (isCurrentHole) {
        holeCell.classList.add("is-current");
        strokesCell.classList.add("is-current");
      }

      if (isEditingHole) {
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

function buildScoreBreakdown(state) {
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
    const segment = document.createElement("span");
    const label = document.createElement("span");

    segment.className = "score-breakdown-segment";
    segment.style.width = `${percent}%`;
    segment.style.setProperty("--segment-color", `hsl(${(strokes * 47) % 360} 45% ${56 - Math.min(index, 4) * 4}%)`);
    segment.title = `${strokes} strokes: ${count}/${totalScores} (${Math.round(percent)}%)`;

    label.className = "score-breakdown-chip";
    label.style.setProperty("--segment-color", `hsl(${(strokes * 47) % 360} 45% ${56 - Math.min(index, 4) * 4}%)`);
    label.textContent = `${strokes}: ${Math.round(percent)}%`;

    ariaParts.push(`${Math.round(percent)} percent ${strokes} strokes`);
    barFragment.append(segment);
    legendFragment.append(label);
  }

  scoreBreakdownBar.replaceChildren(barFragment);
  scoreBreakdownBar.setAttribute("aria-label", ariaParts.join(", "));
  scoreBreakdownLegend.replaceChildren(legendFragment);
}

function renderHoleLabelEditor(state) {
  const hasCustomLabel = state.selectedLabel !== defaultHoleLabel(state.selectedHole);
  holeLabelInput.hidden = !isHoleLabelEditorOpen && !hasCustomLabel;
  holeLabelInput.value = state.selectedLabel;
  toggleHoleLabelButton.textContent =
    isHoleLabelEditorOpen || hasCustomLabel ? "Use number" : "Custom label";
}

function renderResetHoleButton(state) {
  const isEditing = state.editIndex !== null;
  resetHoleButton.disabled = isEditing;
  resetHoleButton.textContent = isResetHoleConfirming ? "Tap again for 1" : "Set to 1";
}

function render(state) {
  holeValue.textContent = String(state.selectedHole);
  strokesValue.textContent = String(state.draftStrokes);
  const isEditing = state.editIndex !== null;
  modeCopy.textContent = isEditing ? `Edit mode: play ${state.editIndex + 1}` : "New score";
  exitEditButton.hidden = !isEditing;
  submitWrap.hidden = isEditing;
  submitLabel.textContent = "Slide to submit score";
  summaryPanel.hidden = !isScorecardOpen;
  toggleScorecardButton.setAttribute("aria-expanded", String(isScorecardOpen));
  toggleScorecardButton.textContent = isScorecardOpen ? "Hide" : "Edit";

  const totalTracked = state.entries.length;
  const totalStrokes = state.entries.reduce((sum, entry) => sum + entry.strokes, 0);
  const averageStrokes = totalTracked === 0 ? 0 : totalStrokes / totalTracked;
  summaryCopy.textContent =
    `${totalTracked} hole${totalTracked === 1 ? "" : "s"} • ` +
    `${totalStrokes} stroke${totalStrokes === 1 ? "" : "s"} • ` +
    `${averageStrokes.toFixed(2)} avg`;
  document
    .querySelectorAll('[data-action^="hole-"]')
    .forEach((button) => (button.disabled = isEditing));
  renderResetHoleButton(state);
  renderHoleLabelEditor(state);
  buildScoreBreakdown(state);
  buildLiveScorecard(state);

  scorecardList.replaceChildren(
    ...state.entries.map((entry, index) => {
        const item = document.createElement("li");
        item.className = "scorecard-item";

        const button = document.createElement("button");
        button.type = "button";
        button.className = `scorecard-button${
          index === state.editIndex ? " is-selected" : ""
        }`;
        button.dataset.editIndex = String(index);

        const left = document.createElement("div");

        const holeLabel = document.createElement("div");
        holeLabel.className = "scorecard-hole";
        holeLabel.textContent = `Hole ${entry.label}`;

        const metaLabel = document.createElement("div");
        metaLabel.className = "scorecard-meta";
        metaLabel.textContent = `Play ${index + 1}`;

        const strokesLabel = document.createElement("div");
        strokesLabel.className = "scorecard-strokes";
        strokesLabel.textContent = `${entry.strokes} stroke${entry.strokes === 1 ? "" : "s"}`;

        left.append(holeLabel, metaLabel);
        button.append(left, strokesLabel);
        item.append(button);
        return item;
      })
  );
}

function resetSubmitSlider() {
  submitSlider.value = "0";
}

function releaseSubmitLock() {
  submitLocked = false;
  resetSubmitSlider();
}

function syncEditedEntry() {
  if (state.editIndex === null) {
    return;
  }

  const entry = state.entries[state.editIndex];
  if (!entry) {
    return;
  }

  entry.hole = state.selectedHole;
  entry.label = state.selectedLabel;
  entry.strokes = state.draftStrokes;
}

function submitScore() {
  clearResetHoleConfirm();
  state.entries.push({
    hole: state.selectedHole,
    label: state.selectedLabel,
    strokes: state.draftStrokes,
  });
  state.editIndex = null;
  state.currentHole += 1;
  state.currentLabel = defaultHoleLabel(state.currentHole);
  state.selectedHole = state.currentHole;
  state.selectedLabel = state.currentLabel;
  state.draftStrokes = DEFAULT_STROKES;
  isHoleLabelEditorOpen = false;
  writeState(state);
  render(state);
  submitLocked = true;
  resetSubmitSlider();
}

function updateState(action) {
  switch (action) {
    case "hole-decrement":
      if (state.editIndex !== null) {
        return;
      }
      clearResetHoleConfirm();
      state.currentHole = Math.max(MIN_VALUE, state.currentHole - 1);
      state.currentLabel = defaultHoleLabel(state.currentHole);
      state.selectedHole = state.currentHole;
      state.selectedLabel = state.currentLabel;
      break;
    case "hole-increment":
      if (state.editIndex !== null) {
        return;
      }
      clearResetHoleConfirm();
      state.currentHole += 1;
      state.currentLabel = defaultHoleLabel(state.currentHole);
      state.selectedHole = state.currentHole;
      state.selectedLabel = state.currentLabel;
      break;
    case "strokes-decrement":
      state.draftStrokes = Math.max(MIN_VALUE, state.draftStrokes - 1);
      break;
    case "strokes-increment":
      state.draftStrokes += 1;
      break;
    default:
      return;
  }

  syncEditedEntry();
  writeState(state);
  render(state);
}

function startEditing(index) {
  const entry = state.entries[index];
  if (!entry) {
    return;
  }

  isScorecardOpen = true;
  clearResetHoleConfirm();
  state.editIndex = index;
  state.selectedHole = entry.hole;
  state.selectedLabel = entry.label;
  state.draftStrokes = entry.strokes;
  isHoleLabelEditorOpen = entry.label !== defaultHoleLabel(entry.hole);
  writeState(state);
  render(state);
}

function exitEditMode() {
  syncEditedEntry();
  clearResetHoleConfirm();
  isScorecardOpen = false;
  state.editIndex = null;
  state.selectedHole = state.currentHole;
  state.selectedLabel = state.currentLabel;
  state.draftStrokes = DEFAULT_STROKES;
  isHoleLabelEditorOpen = false;
  writeState(state);
  render(state);
}

function toggleScorecard() {
  if (isScorecardOpen && state.editIndex !== null) {
    exitEditMode();
    return;
  }

  isScorecardOpen = !isScorecardOpen;
  render(state);
}

const state = readState();
writeState(state);
render(state);

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
    if (state.editIndex !== null) {
      return;
    }

    if (isResetHoleConfirming) {
      clearResetHoleConfirm();
      state.currentHole = DEFAULT_HOLE;
      state.currentLabel = defaultHoleLabel(DEFAULT_HOLE);
      state.selectedHole = state.currentHole;
      state.selectedLabel = state.currentLabel;
      writeState(state);
      render(state);
      return;
    }

    startResetHoleConfirm();
    render(state);
    return;
  }

  if (button.id === "toggle-hole-label") {
    const isCustomLabel = state.selectedLabel !== defaultHoleLabel(state.selectedHole);
    if (isHoleLabelEditorOpen || isCustomLabel) {
      if (state.editIndex !== null) {
        state.selectedLabel = defaultHoleLabel(state.selectedHole);
        syncEditedEntry();
      } else {
        state.currentLabel = defaultHoleLabel(state.currentHole);
        state.selectedHole = state.currentHole;
        state.selectedLabel = state.currentLabel;
      }
      isHoleLabelEditorOpen = false;
      writeState(state);
      render(state);
      return;
    }

    isHoleLabelEditorOpen = true;
    render(state);
    holeLabelInput.focus();
    holeLabelInput.select();
    return;
  }

  updateState(button.dataset.action);
});

holeLabelInput.addEventListener("input", () => {
  const parsed = parseHoleLabel(holeLabelInput.value, state.selectedHole);
  holeLabelInput.setCustomValidity(parsed ? "" : "Use a hole label like 15, 15a, or 15b.");
  if (!parsed) {
    return;
  }

  if (state.editIndex !== null) {
    state.selectedHole = parsed.hole;
    state.selectedLabel = parsed.label;
    syncEditedEntry();
  } else {
    state.currentHole = parsed.hole;
    state.currentLabel = parsed.label;
    state.selectedHole = state.currentHole;
    state.selectedLabel = state.currentLabel;
  }

  writeState(state);
  render(state);
});

submitSlider.addEventListener("input", () => {
  if (!submitLocked && Number(submitSlider.value) >= SUBMIT_THRESHOLD) {
    if (state.editIndex !== null) {
      syncEditedEntry();
      writeState(state);
      render(state);
      submitLocked = true;
      resetSubmitSlider();
      return;
    }

    submitScore();
  }
});

submitSlider.addEventListener("change", releaseSubmitLock);
submitSlider.addEventListener("pointerup", releaseSubmitLock);
submitSlider.addEventListener("pointercancel", releaseSubmitLock);

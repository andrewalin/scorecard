import {
  DEFAULT_HOLE,
  RESET_HOLE_CONFIRM_MS,
  SUBMIT_THRESHOLD,
  activeHoleHasCustomLabel,
  advanceLiveHole,
  createHoleData,
  defaultHoleLabel,
  getActiveHole,
  parseHoleLabel,
  readState,
  setLiveHole,
  syncEditedEntry,
  writeState,
} from "./state.js";
import { render } from "./render.js";

const refs = {
  holeValue: document.querySelector("#hole-value"),
  strokesValue: document.querySelector("#strokes-value"),
  scorecardList: document.querySelector("#scorecard-list"),
  summaryCopy: document.querySelector("#summary-copy"),
  submitSlider: document.querySelector("#submit-slider"),
  submitWrap: document.querySelector(".submit-wrap"),
  summaryPanel: document.querySelector("#summary-panel"),
  modeCopy: document.querySelector("#mode-copy"),
  toggleScorecardButton: document.querySelector("#toggle-scorecard"),
  exitEditButton: document.querySelector("#exit-edit"),
  resetHoleButton: document.querySelector("#reset-hole"),
  toggleHoleLabelButton: document.querySelector("#toggle-hole-label"),
  holeLabelInput: document.querySelector("#hole-label-input"),
  submitLabel: document.querySelector(".submit-label"),
  scoreBreakdownBar: document.querySelector("#score-breakdown-bar"),
  scoreBreakdownLegend: document.querySelector("#score-breakdown-legend"),
  liveScorecardTable: document.querySelector("#live-scorecard-table"),
};

const uiState = {
  submitLocked: false,
  isScorecardOpen: false,
  isHoleLabelEditorOpen: false,
  isResetHoleConfirming: false,
};

let resetHoleConfirmTimer = null;

function commitAndRender() {
  writeState(window.location.pathname, window.history, state);
  render(refs, state, uiState);
}

function clearResetHoleConfirm() {
  uiState.isResetHoleConfirming = false;
  if (resetHoleConfirmTimer !== null) {
    window.clearTimeout(resetHoleConfirmTimer);
    resetHoleConfirmTimer = null;
  }
}

function startResetHoleConfirm() {
  clearResetHoleConfirm();
  uiState.isResetHoleConfirming = true;
  resetHoleConfirmTimer = window.setTimeout(() => {
    uiState.isResetHoleConfirming = false;
    resetHoleConfirmTimer = null;
    render(refs, state, uiState);
  }, RESET_HOLE_CONFIRM_MS);
}

function resetSubmitSlider() {
  refs.submitSlider.value = "0";
}

function releaseSubmitLock() {
  uiState.submitLocked = false;
  resetSubmitSlider();
}

function submitScore() {
  clearResetHoleConfirm();
  const activeHole = getActiveHole(state);

  state.entries.push({
    hole: activeHole.hole,
    label: activeHole.label,
    strokes: state.draftStrokes,
  });

  state.editIndex = null;
  advanceLiveHole(state);
  state.draftStrokes = 3;
  uiState.isHoleLabelEditorOpen = false;
  commitAndRender();
  uiState.submitLocked = true;
  resetSubmitSlider();
}

function updateLiveHole(delta) {
  clearResetHoleConfirm();
  setLiveHole(state, createHoleData(Math.max(1, state.liveHole.hole + delta)));
  commitAndRender();
}

function updateDraftStrokes(delta) {
  state.draftStrokes = Math.max(1, state.draftStrokes + delta);
  syncEditedEntry(state);
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

  uiState.isScorecardOpen = true;
  clearResetHoleConfirm();
  state.editIndex = index;
  state.draftStrokes = entry.strokes;
  uiState.isHoleLabelEditorOpen = entry.label !== defaultHoleLabel(entry.hole);
  commitAndRender();
}

function exitEditMode() {
  syncEditedEntry(state);
  clearResetHoleConfirm();
  uiState.isScorecardOpen = false;
  state.editIndex = null;
  state.draftStrokes = 3;
  uiState.isHoleLabelEditorOpen = false;
  commitAndRender();
}

function toggleScorecard() {
  if (uiState.isScorecardOpen && state.editIndex !== null) {
    exitEditMode();
    return;
  }

  uiState.isScorecardOpen = !uiState.isScorecardOpen;
  render(refs, state, uiState);
}

function handleResetHoleClick() {
  if (state.editIndex !== null) {
    return;
  }

  if (uiState.isResetHoleConfirming) {
    clearResetHoleConfirm();
    setLiveHole(state, createHoleData(DEFAULT_HOLE));
    commitAndRender();
    return;
  }

  startResetHoleConfirm();
  render(refs, state, uiState);
}

function handleToggleHoleLabel() {
  if (uiState.isHoleLabelEditorOpen || activeHoleHasCustomLabel(state)) {
    const activeHole = getActiveHole(state);
    const defaultLabel = defaultHoleLabel(activeHole.hole);

    if (state.editIndex !== null) {
      syncEditedEntry(state, { label: defaultLabel });
    } else {
      setLiveHole(state, createHoleData(state.liveHole.hole));
    }

    uiState.isHoleLabelEditorOpen = false;
    commitAndRender();
    return;
  }

  uiState.isHoleLabelEditorOpen = true;
  render(refs, state, uiState);
  refs.holeLabelInput.focus();
  refs.holeLabelInput.select();
}

function applyHoleLabelInput() {
  const activeHole = getActiveHole(state);
  const parsed = parseHoleLabel(refs.holeLabelInput.value, activeHole.hole);

  refs.holeLabelInput.setCustomValidity(parsed ? "" : "Use a hole label like 15, 15a, or 15b.");
  if (!parsed) {
    return;
  }

  if (state.editIndex !== null) {
    syncEditedEntry(state, parsed);
  } else {
    setLiveHole(state, parsed);
  }

  commitAndRender();
}

function handleSubmitSlider() {
  if (uiState.submitLocked || Number(refs.submitSlider.value) < SUBMIT_THRESHOLD) {
    return;
  }

  if (state.editIndex !== null) {
    syncEditedEntry(state);
    commitAndRender();
    uiState.submitLocked = true;
    resetSubmitSlider();
    return;
  }

  submitScore();
}

const state = readState(window.location.search);
writeState(window.location.pathname, window.history, state);
render(refs, state, uiState);

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

refs.holeLabelInput.addEventListener("input", applyHoleLabelInput);
refs.submitSlider.addEventListener("input", handleSubmitSlider);
refs.submitSlider.addEventListener("change", releaseSubmitLock);
refs.submitSlider.addEventListener("pointerup", releaseSubmitLock);
refs.submitSlider.addEventListener("pointercancel", releaseSubmitLock);

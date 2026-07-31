import {
  DEFAULT_HOLE,
  RESET_HOLE_CONFIRM_MS,
  ROUND_MODES,
  activeHoleHasCustomLabel,
  advanceLiveHole,
  createHoleData,
  defaultHoleLabel,
  getActiveHole,
  isCustomRoundMode,
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
  summaryCopy: document.querySelector("#summary-copy"),
  submitButton: document.querySelector("#submit-score"),
  submitWrap: document.querySelector(".submit-wrap"),
  toggleScorecardButton: document.querySelector("#toggle-scorecard"),
  exitEditButton: document.querySelector("#exit-edit"),
  roundModeButtons: document.querySelectorAll("[data-round-mode]"),
  resetHoleButton: document.querySelector("#reset-hole"),
  toggleHoleLabelButton: document.querySelector("#toggle-hole-label"),
  holeLabelInput: document.querySelector("#hole-label-input"),
  scoreBreakdownBar: document.querySelector("#score-breakdown-bar"),
  scoreBreakdownLegend: document.querySelector("#score-breakdown-legend"),
  liveScorecardTable: document.querySelector("#live-scorecard-table"),
};

const uiState = {
  submitLocked: false,
  isScorecardOpen: false,
  isHoleLabelEditorOpen: false,
  isResetHoleConfirming: false,
  isStartHoleConfirming: false,
};

let resetHoleConfirmTimer = null;
let startHoleConfirmTimer = null;
let submitLockTimer = null;

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

function clearStartHoleConfirm() {
  uiState.isStartHoleConfirming = false;
  if (startHoleConfirmTimer !== null) {
    window.clearTimeout(startHoleConfirmTimer);
    startHoleConfirmTimer = null;
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

function startStartHoleConfirm() {
  clearStartHoleConfirm();
  uiState.isStartHoleConfirming = true;
  startHoleConfirmTimer = window.setTimeout(() => {
    uiState.isStartHoleConfirming = false;
    startHoleConfirmTimer = null;
    render(refs, state, uiState);
  }, RESET_HOLE_CONFIRM_MS);
}

function getSimpleRoundEnd() {
  if (state.roundMode === ROUND_MODES.SIMPLE_9) {
    return 9;
  }

  if (state.roundMode === ROUND_MODES.SIMPLE_18) {
    return 18;
  }

  return null;
}

function canPickSimpleStartHole() {
  return !isCustomRoundMode(state) && state.entries.length === 0 && state.editIndex === null;
}

function shouldConfirmDefaultStartHole() {
  const activeHole = getActiveHole(state);

  return (
    state.editIndex === null &&
    state.entries.length === 0 &&
    activeHole.hole === DEFAULT_HOLE &&
    activeHole.label === defaultHoleLabel(DEFAULT_HOLE)
  );
}

function submitScore() {
  clearResetHoleConfirm();
  clearStartHoleConfirm();
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
}

function updateLiveHole(delta) {
  if (!isCustomRoundMode(state) && !canPickSimpleStartHole()) {
    return;
  }

  clearResetHoleConfirm();
  clearStartHoleConfirm();
  const simpleRoundEnd = getSimpleRoundEnd();
  if (simpleRoundEnd !== null) {
    const nextHole = ((state.liveHole.hole - 1 + delta + simpleRoundEnd) % simpleRoundEnd) + 1;
    setLiveHole(state, createHoleData(nextHole));
  } else {
    setLiveHole(state, createHoleData(Math.max(1, state.liveHole.hole + delta)));
  }
  commitAndRender();
}

function updateDraftStrokes(delta) {
  clearStartHoleConfirm();
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

  uiState.isScorecardOpen = false;
  clearResetHoleConfirm();
  clearStartHoleConfirm();
  state.editIndex = index;
  state.draftStrokes = entry.strokes;
  uiState.isHoleLabelEditorOpen = entry.label !== defaultHoleLabel(entry.hole);
  commitAndRender();
}

function exitEditMode() {
  syncEditedEntry(state);
  clearResetHoleConfirm();
  clearStartHoleConfirm();
  uiState.isScorecardOpen = false;
  state.editIndex = null;
  state.draftStrokes = 3;
  uiState.isHoleLabelEditorOpen = false;
  commitAndRender();
}

function toggleScorecard() {
  if (state.editIndex !== null) {
    exitEditMode();
    return;
  }

  uiState.isScorecardOpen = !uiState.isScorecardOpen;
  render(refs, state, uiState);
}

function handleResetHoleClick() {
  if (state.editIndex !== null || !isCustomRoundMode(state)) {
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
  if (!isCustomRoundMode(state)) {
    return;
  }

  clearStartHoleConfirm();

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
  if (!isCustomRoundMode(state)) {
    return;
  }

  clearStartHoleConfirm();
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

function lockSubmitTemporarily() {
  uiState.submitLocked = true;
  refs.submitButton.disabled = true;

  if (submitLockTimer !== null) {
    window.clearTimeout(submitLockTimer);
  }

  submitLockTimer = window.setTimeout(() => {
    uiState.submitLocked = false;
    submitLockTimer = null;
    render(refs, state, uiState);
  }, 650);
}

function handleSubmitButton() {
  if (uiState.submitLocked) {
    return;
  }

  if (state.editIndex !== null) {
    lockSubmitTemporarily();
    syncEditedEntry(state);
    commitAndRender();
    return;
  }

  if (shouldConfirmDefaultStartHole() && !uiState.isStartHoleConfirming) {
    clearResetHoleConfirm();
    startStartHoleConfirm();
    render(refs, state, uiState);
    refs.submitButton.focus();
    return;
  }

  lockSubmitTemporarily();
  submitScore();
}

function handleRoundModeChange(roundMode) {
  if (!Object.values(ROUND_MODES).includes(roundMode) || state.roundMode === roundMode) {
    return;
  }

  clearResetHoleConfirm();
  clearStartHoleConfirm();
  state.roundMode = roundMode;
  uiState.isHoleLabelEditorOpen = false;
  if (!isCustomRoundMode(state)) {
    setLiveHole(state, createHoleData(state.liveHole.hole));
  }
  commitAndRender();
}

const state = readState(window.location.search);
writeState(window.location.pathname, window.history, state);
render(refs, state, uiState);

document.addEventListener("click", (event) => {
  const liveScorecardCell = event.target.closest("[data-live-edit-index]");
  if (liveScorecardCell) {
    const index = Number(liveScorecardCell.dataset.liveEditIndex);
    if (uiState.isScorecardOpen && Number.isInteger(index)) {
      startEditing(index);
    }
    return;
  }

  const button = event.target.closest("button");
  if (!button) {
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

  if (button.dataset.roundMode) {
    handleRoundModeChange(button.dataset.roundMode);
    return;
  }

  updateState(button.dataset.action);
});

refs.holeLabelInput.addEventListener("input", applyHoleLabelInput);
refs.submitButton.addEventListener("click", handleSubmitButton);

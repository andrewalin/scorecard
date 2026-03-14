import {
  HOLES_PER_SECTION,
  activeHoleHasCustomLabel,
  defaultHoleLabel,
  getActiveHole,
} from "./state.js";

function renderSummary(summaryCopy, state) {
  const totalTracked = state.entries.length;
  const totalStrokes = state.entries.reduce((sum, entry) => sum + entry.strokes, 0);
  const averageStrokes = totalTracked === 0 ? 0 : totalStrokes / totalTracked;

  summaryCopy.textContent =
    `${totalTracked} hole${totalTracked === 1 ? "" : "s"} • ` +
    `${totalStrokes} stroke${totalStrokes === 1 ? "" : "s"} • ` +
    `${averageStrokes.toFixed(2)} avg`;
}

function renderControls(refs, state, uiState) {
  const activeHole = getActiveHole(state);
  const isEditing = state.editIndex !== null;

  refs.holeValue.textContent = String(activeHole.hole);
  refs.strokesValue.textContent = String(state.draftStrokes);
  refs.modeCopy.textContent = isEditing ? `Edit mode: play ${state.editIndex + 1}` : "New score";
  refs.exitEditButton.hidden = !isEditing;
  refs.submitWrap.hidden = isEditing;
  refs.submitLabel.textContent = "Slide to submit score";
  refs.summaryPanel.hidden = !uiState.isScorecardOpen;
  refs.toggleScorecardButton.setAttribute("aria-expanded", String(uiState.isScorecardOpen));
  refs.toggleScorecardButton.textContent = uiState.isScorecardOpen ? "Hide" : "Edit";

  document
    .querySelectorAll('[data-action^="hole-"]')
    .forEach((button) => (button.disabled = isEditing));

  refs.resetHoleButton.disabled = isEditing;
  refs.resetHoleButton.textContent = uiState.isResetHoleConfirming ? "Tap again for 1" : "Set to 1";

  refs.holeLabelInput.hidden = !uiState.isHoleLabelEditorOpen && !activeHoleHasCustomLabel(state);
  refs.holeLabelInput.value = activeHole.label;
  refs.toggleHoleLabelButton.textContent =
    uiState.isHoleLabelEditorOpen || activeHoleHasCustomLabel(state) ? "Use number" : "Custom label";
}

function renderScoreBreakdown(refs, state) {
  const totalScores = state.entries.length;
  if (totalScores === 0) {
    refs.scoreBreakdownBar.replaceChildren();
    refs.scoreBreakdownBar.setAttribute("aria-label", "No scores recorded yet");
    refs.scoreBreakdownLegend.replaceChildren();
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

  refs.scoreBreakdownBar.replaceChildren(barFragment);
  refs.scoreBreakdownBar.setAttribute("aria-label", ariaParts.join(", "));
  refs.scoreBreakdownLegend.replaceChildren(legendFragment);
}

function renderLiveScorecard(refs, state) {
  const activeHole = getActiveHole(state);
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

  refs.liveScorecardTable.replaceChildren(fragment);
}

function renderScorecardList(refs, state) {
  refs.scorecardList.replaceChildren(
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

export function render(refs, state, uiState) {
  renderSummary(refs.summaryCopy, state);
  renderControls(refs, state, uiState);
  renderScoreBreakdown(refs, state);
  renderLiveScorecard(refs, state);
  renderScorecardList(refs, state);
}

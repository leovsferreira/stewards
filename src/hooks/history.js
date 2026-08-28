import { useSyncExternalStore } from "react";

const MAX_HISTORY = 50;

const undoStack = [];
const redoStack = [];
let evictedNetworkEdits = 0;
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return `${undoStack.length}:${redoStack.length}`;
}

// entry: { kind: "network" | "suggestion", at?: [lng, lat], undo: fn, redo: fn }
export function pushHistory(entry) {
  undoStack.push(entry);
  if (undoStack.length > MAX_HISTORY) {
    const evicted = undoStack.shift();
    if (evicted.kind === "network") evictedNetworkEdits++;
  }
  redoStack.length = 0;
  emit();
}

export function undoHistory() {
  const entry = undoStack.pop();
  if (!entry) return null;
  redoStack.push(entry);
  try {
    entry.undo();
  } catch (err) {
    console.error("Undo failed, clearing history:", err);
    clearHistory();
    return null;
  }
  emit();
  return entry;
}

export function redoHistory() {
  const entry = redoStack.pop();
  if (!entry) return null;
  undoStack.push(entry);
  try {
    entry.redo();
  } catch (err) {
    console.error("Redo failed, clearing history:", err);
    clearHistory();
    return null;
  }
  emit();
  return entry;
}

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  evictedNetworkEdits = 0;
  emit();
}

// drops only network entries (used when the network is saved or rebuilt and
// its node ids regenerate — suggestion deltas remain valid)
export function clearNetworkHistory() {
  const keepSuggestion = (stack) => {
    const kept = stack.filter((e) => e.kind === "suggestion");
    stack.length = 0;
    stack.push(...kept);
  };
  keepSuggestion(undoStack);
  keepSuggestion(redoStack);
  evictedNetworkEdits = 0;
  emit();
}

// drops only suggestion entries (used on training submit, which clears the
// suggestion state but leaves the network — and its deltas — fully valid)
export function clearSuggestionHistory() {
  const keepNetwork = (stack) => {
    const kept = stack.filter((e) => e.kind === "network");
    stack.length = 0;
    stack.push(...kept);
  };
  keepNetwork(undoStack);
  keepNetwork(redoStack);
  emit();
}

// true while any network edit is reachable in the current state (used to keep
// the dirty flag honest when undoing back to the loaded network)
export function hasNetworkEdits() {
  return evictedNetworkEdits > 0 || undoStack.some((e) => e.kind === "network");
}

export function useHistorySnapshot() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const [u, r] = snap.split(":");
  return { canUndo: u !== "0", canRedo: r !== "0" };
}

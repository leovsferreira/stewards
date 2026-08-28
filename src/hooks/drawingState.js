export const isDrawingRef = { current: false };
export const isDrawingEdgesRef = { current: false };
export const isDeletingNodesRef = { current: false };
// true while a pointer gesture (node drag, vertex drag, delete marquee) is in
// progress, so undo/redo can't fire mid-gesture and corrupt the drag baseline
export const isGestureActiveRef = { current: false };

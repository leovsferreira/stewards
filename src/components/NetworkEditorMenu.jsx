/**
 * NetworkEditorMenu
 *
 * Floating context menu that appears when the user right-clicks a network edge.
 * Must be rendered inside a `position: relative` container (leftPane).
 *
 * Props:
 *   contextMenu   – { edgeId, x, y, lng, lat } | null
 *   setContextMenu – setter to dismiss
 *   splitEdge     – (edgeId, lng, lat) → void
 */
export function NetworkEditorMenu({ contextMenu, setContextMenu, splitEdge }) {
  if (!contextMenu) return null;

  const { edgeId, x, y, lng, lat } = contextMenu;

  return (
    <div
      className="editorMenu"
      style={{ left: x, top: y }}
      // Prevent the map's click handler from closing the menu immediately
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="editorMenuTitle">Edge</div>
      <button
        className="editorMenuItem"
        onClick={() => splitEdge(edgeId, lng, lat)}
      >
        ✂ Split edge
      </button>
      <button
        className="editorMenuItem cancel"
        onClick={() => setContextMenu(null)}
      >
        Cancel
      </button>
    </div>
  );
}
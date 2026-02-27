/**
 * NetworkEditorMenu
 *
 * Floating context menu that appears when the user right-clicks a network
 * edge OR a network node.
 *
 * Must be rendered inside a `position: relative` container (leftPane).
 *
 * Props:
 *   contextMenu    – { type: 'edge', edgeId, x, y, lng, lat }
 *                  | { type: 'node', nodeId, x, y }
 *                  | null
 *   setContextMenu – setter to dismiss
 *   splitEdge      – (edgeId, lng, lat) → void
 *   deleteNode     – (nodeId) → void
 */
export function NetworkEditorMenu({ contextMenu, setContextMenu, splitEdge, deleteNode }) {
  if (!contextMenu) return null;

  const { type, x, y } = contextMenu;

  return (
    <div
      className="editorMenu"
      style={{ left: x, top: y }}
      // Prevent the map's click handler from closing the menu immediately
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {type === "edge" ? (
        <>
          <div className="editorMenuTitle">Edge</div>
          <button
            className="editorMenuItem"
            onClick={() => splitEdge(contextMenu.edgeId, contextMenu.lng, contextMenu.lat)}
          >
            ✂ Split edge
          </button>
        </>
      ) : (
        <>
          <div className="editorMenuTitle">Node</div>
          <button
            className="editorMenuItem danger"
            onClick={() => deleteNode(contextMenu.nodeId)}
          >
            🗑 Delete node
          </button>
        </>
      )}
      <button
        className="editorMenuItem cancel"
        onClick={() => setContextMenu(null)}
      >
        Cancel
      </button>
    </div>
  );
}
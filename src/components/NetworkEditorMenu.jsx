export function NetworkEditorMenu({ contextMenu, setContextMenu, splitEdge, deleteNode }) {
  if (!contextMenu) return null;

  const { type, x, y } = contextMenu;

  return (
    <div
      className="editorMenu"
      style={{ left: x, top: y }}
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
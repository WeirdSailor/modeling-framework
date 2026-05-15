// SelectedTable.jsx — right panel showing units in the active draft

function SelectedTable({
  draft,
  bmusById,
  selectionPattern,
  readOnly,
  pendingRemoveIds,
  setPendingRemoveIds,
  onRemoveOne,
  onRemoveMany,
  onUpdateNotes,
  onDropIds,
}) {
  const [dragOver, setDragOver] = React.useState(false);

  const togglePendingRemove = (id) => {
    setPendingRemoveIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked =
    draft.selected.length > 0 &&
    draft.selected.every(s => pendingRemoveIds.has(s.bmuId));
  const someChecked = draft.selected.some(s => pendingRemoveIds.has(s.bmuId));

  const toggleAll = () => {
    setPendingRemoveIds(prev => {
      if (allChecked) return new Set();
      return new Set(draft.selected.map(s => s.bmuId));
    });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    const raw = e.dataTransfer.getData("application/x-bmu-ids");
    if (!raw) return;
    try {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length) onDropIds(ids);
    } catch {}
  };

  const onDragOver = (e) => {
    if (readOnly || selectionPattern !== "drag") return;
    if (!e.dataTransfer.types.includes("application/x-bmu-ids")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const totals = draft.selected.reduce(
    (acc, s) => {
      const b = bmusById[s.bmuId];
      if (!b) return acc;
      acc.pn += b.pn;
      acc.mel += b.mel;
      acc.value += b.pn * b.price;
      return acc;
    },
    { pn: 0, mel: 0, value: 0 }
  );

  return (
    <div
      className={[
        "panel selected-panel",
        dragOver ? "panel-drop-active" : "",
        readOnly ? "panel-readonly" : "",
      ].join(" ")}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
    >
      <header className="panel-head">
        <div className="panel-title">
          <h2>Selected</h2>
          <span className="count-pill">{draft.selected.length}</span>
        </div>
        <div className="totals">
          <Stat label="Σ PN" value={totals.pn.toLocaleString() + " MW"} />
          <Stat label="Σ MEL" value={totals.mel.toLocaleString() + " MW"} />
          <Stat label="Est. value" value={"£" + Math.round(totals.value).toLocaleString()} />
        </div>
      </header>

      <div className="table-scroll">
        {draft.selected.length === 0 ? (
          <div className="empty-drop">
            <div className="empty-drop-inner">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 7h16M4 12h16M4 17h10"></path>
              </svg>
              <p className="empty-title">No units in this draft yet</p>
              <p className="empty-sub">
                {selectionPattern === "drag"
                  ? "Drag rows here from Available units"
                  : selectionPattern === "click"
                  ? "Click rows in Available units to add them"
                  : "Tick rows in Available units, then press Select →"}
              </p>
            </div>
          </div>
        ) : (
          <table className="data-table selected-table">
            <thead>
              <tr>
                {!readOnly && (
                  <th className="check-col">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th>BMU</th>
                <th className="num">PN</th>
                <th className="num">MEL</th>
                <th className="num">SEL</th>
                <th className="num">Price</th>
                <th className="notes-col">Notes</th>
                {!readOnly && <th className="action-col"></th>}
              </tr>
            </thead>
            <tbody>
              {draft.selected.map(s => {
                const b = bmusById[s.bmuId];
                if (!b) return null;
                const pending = pendingRemoveIds.has(s.bmuId);
                return (
                  <tr key={s.bmuId} className={pending ? "row-pending-remove" : ""}>
                    {!readOnly && (
                      <td className="check-col">
                        <input
                          type="checkbox"
                          checked={pending}
                          onChange={() => togglePendingRemove(s.bmuId)}
                        />
                      </td>
                    )}
                    <td className="mono bmu-cell">
                      <span>{b.id}</span>
                      <span className="site-sub">{b.site} · <TypeChip type={b.type} /></span>
                    </td>
                    <td className="mono num">{b.pn}</td>
                    <td className="mono num">{b.mel}</td>
                    <td className="mono num">{b.sel}</td>
                    <td className="mono num">£{b.price.toFixed(2)}</td>
                    <td className="notes-col">
                      {readOnly ? (
                        <span className="notes-readonly">{s.notes || <em className="muted">—</em>}</span>
                      ) : (
                        <input
                          type="text"
                          className="notes-input"
                          value={s.notes}
                          placeholder="Add a note…"
                          onChange={e => onUpdateNotes(s.bmuId, e.target.value)}
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className="action-col">
                        <button
                          className="row-remove-btn"
                          onClick={() => onRemoveOne(s.bmuId)}
                          title="Remove from draft"
                        >×</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!readOnly && selectionPattern === "buttons" && (
        <footer className="panel-foot">
          <span className="foot-meta">
            {pendingRemoveIds.size > 0 ? `${pendingRemoveIds.size} checked` : "Tick rows or use × to remove"}
          </span>
          <button
            className="btn btn-secondary"
            disabled={pendingRemoveIds.size === 0}
            onClick={() => { onRemoveMany(Array.from(pendingRemoveIds)); setPendingRemoveIds(new Set()); }}
          >
            ← Remove
          </button>
        </footer>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
    </div>
  );
}

window.SelectedTable = SelectedTable;
window.Stat = Stat;

// AvailableTable.jsx — left panel listing all BMUs, sortable, searchable, multi-select
const { useState, useMemo, useCallback } = React;

function AvailableTable({
  bmus,
  inActiveDraftIds,        // Set<string>
  inOtherDraftsIds,        // Set<string> — visual hint only (drafts are independent)
  selectionPattern,        // 'buttons' | 'click' | 'drag'
  pendingIds,              // Set<string> of items with pending checkbox
  setPendingIds,
  onAddOne,
  onAddMany,
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [typeFilter, setTypeFilter] = useState("All");

  const types = useMemo(() => {
    const t = new Set(bmus.map(b => b.type));
    return ["All", ...Array.from(t).sort()];
  }, [bmus]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = bmus.filter(b => {
      if (typeFilter !== "All" && b.type !== typeFilter) return false;
      if (!q) return true;
      return (
        b.id.toLowerCase().includes(q) ||
        b.site.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [bmus, search, sort, typeFilter]);

  const visibleSelectableIds = useMemo(
    () => visible.filter(b => !inActiveDraftIds.has(b.id)).map(b => b.id),
    [visible, inActiveDraftIds]
  );
  const allVisibleChecked =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every(id => pendingIds.has(id));
  const someVisibleChecked =
    visibleSelectableIds.some(id => pendingIds.has(id));

  const toggleSort = (key) => {
    setSort(s => ({
      key,
      dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
    }));
  };

  const togglePending = (id) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (allVisibleChecked) {
        visibleSelectableIds.forEach(id => next.delete(id));
      } else {
        visibleSelectableIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const onRowClick = (bmu) => {
    if (inActiveDraftIds.has(bmu.id)) return;
    if (selectionPattern === "click") {
      onAddOne(bmu.id);
    } else {
      togglePending(bmu.id);
    }
  };

  const onDragStart = (e, bmu) => {
    if (selectionPattern !== "drag") { e.preventDefault(); return; }
    if (inActiveDraftIds.has(bmu.id)) { e.preventDefault(); return; }
    // If multiple are pending and we drag one of them, send all
    const ids = pendingIds.has(bmu.id) && pendingIds.size > 1
      ? Array.from(pendingIds)
      : [bmu.id];
    e.dataTransfer.setData("application/x-bmu-ids", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="panel available-panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Available units</h2>
          <span className="count-pill">{visible.length} of {bmus.length}</span>
        </div>
        <div className="toolbar">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input
              type="text"
              placeholder="Search BMU, site, type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-btn" onClick={() => setSearch("")} aria-label="Clear">×</button>
            )}
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </header>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {selectionPattern !== "click" && (
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    ref={el => { if (el) el.indeterminate = !allVisibleChecked && someVisibleChecked; }}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible"
                  />
                </th>
              )}
              <Th onClick={() => toggleSort("id")} active={sort.key === "id"} dir={sort.dir}>BMU</Th>
              <Th onClick={() => toggleSort("type")} active={sort.key === "type"} dir={sort.dir}>Type</Th>
              <Th onClick={() => toggleSort("pn")} active={sort.key === "pn"} dir={sort.dir} numeric>PN</Th>
              <Th onClick={() => toggleSort("mel")} active={sort.key === "mel"} dir={sort.dir} numeric>MEL</Th>
              <Th onClick={() => toggleSort("sel")} active={sort.key === "sel"} dir={sort.dir} numeric>SEL</Th>
              <Th onClick={() => toggleSort("price")} active={sort.key === "price"} dir={sort.dir} numeric>Price</Th>
              {selectionPattern === "buttons" && <th className="action-col"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={selectionPattern === "click" ? 6 : 8} className="empty">No units match your filters.</td></tr>
            )}
            {visible.map(b => {
              const inDraft = inActiveDraftIds.has(b.id);
              const inOther = !inDraft && inOtherDraftsIds.has(b.id);
              const isPending = pendingIds.has(b.id);
              return (
                <tr
                  key={b.id}
                  className={[
                    inDraft ? "row-in-draft" : "",
                    isPending ? "row-pending" : "",
                    selectionPattern === "click" && !inDraft ? "row-clickable" : "",
                  ].join(" ")}
                  onClick={() => onRowClick(b)}
                  draggable={selectionPattern === "drag" && !inDraft}
                  onDragStart={e => onDragStart(e, b)}
                  title={inDraft ? "Already in this draft" : ""}
                >
                  {selectionPattern !== "click" && (
                    <td className="check-col" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isPending}
                        disabled={inDraft}
                        onChange={() => togglePending(b.id)}
                      />
                    </td>
                  )}
                  <td className="mono bmu-cell">
                    <span>{b.id}</span>
                    <span className="site-sub">{b.site}</span>
                    {inDraft && <span className="badge badge-in">In draft</span>}
                    {inOther && <span className="badge badge-other" title="Also in another draft">Also in {inOther}</span>}
                  </td>
                  <td><TypeChip type={b.type} /></td>
                  <td className="mono num">{b.pn}</td>
                  <td className="mono num">{b.mel}</td>
                  <td className="mono num">{b.sel}</td>
                  <td className="mono num">£{b.price.toFixed(2)}</td>
                  {selectionPattern === "buttons" && (
                    <td className="action-col" onClick={e => e.stopPropagation()}>
                      <button
                        className="row-add-btn"
                        disabled={inDraft}
                        onClick={() => onAddOne(b.id)}
                        title="Add to draft"
                      >+</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectionPattern === "buttons" && (
        <footer className="panel-foot">
          <span className="foot-meta">
            {pendingIds.size > 0 ? `${pendingIds.size} checked` : "Tick rows or use + to add"}
          </span>
          <button
            className="btn btn-primary"
            disabled={pendingIds.size === 0}
            onClick={() => { onAddMany(Array.from(pendingIds)); setPendingIds(new Set()); }}
          >
            Select →
          </button>
        </footer>
      )}
      {selectionPattern === "click" && (
        <footer className="panel-foot">
          <span className="foot-meta">Click any row to add it to the draft</span>
        </footer>
      )}
      {selectionPattern === "drag" && (
        <footer className="panel-foot">
          <span className="foot-meta">
            {pendingIds.size > 1 ? `Drag any checked row to move ${pendingIds.size}` : "Drag rows into the Selected panel"}
          </span>
        </footer>
      )}
    </div>
  );
}

function Th({ children, onClick, active, dir, numeric }) {
  return (
    <th onClick={onClick} className={[numeric ? "num" : "", "sortable", active ? "active" : ""].join(" ")}>
      <span className="th-inner">
        {children}
        <span className="sort-caret" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

function TypeChip({ type }) {
  const cls = "chip chip-" + type.toLowerCase().replace(/[^a-z]/g, "");
  return <span className={cls}>{type}</span>;
}

window.AvailableTable = AvailableTable;
window.TypeChip = TypeChip;

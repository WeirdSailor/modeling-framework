// DraftSidebar.jsx + DraftDetails.jsx — manage drafts, edit name + time window

function DraftSidebar({
  drafts,
  activeId,
  onSelect,
  onCreate,
  showCommitted,
  setShowCommitted,
}) {
  const editing = drafts.filter(d => d.state === "draft");
  const archive = drafts.filter(d => d.state !== "draft");

  return (
    <aside className="draft-sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark"></div>
          <div className="brand-text">
            <span className="brand-title">BM Drafts</span>
            <span className="brand-sub">Balancing Mechanism</span>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={onCreate}>
          <span className="plus">+</span> New draft
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">
          <span>Editing</span>
          <span className="count-pill count-pill-sm">{editing.length}</span>
        </div>
        <ul className="draft-list">
          {editing.length === 0 && (
            <li className="draft-list-empty">No drafts in progress</li>
          )}
          {editing.map(d => (
            <DraftListItem
              key={d.id}
              draft={d}
              active={d.id === activeId}
              onClick={() => onSelect(d.id)}
            />
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <button
          className="sidebar-label sidebar-label-toggle"
          onClick={() => setShowCommitted(v => !v)}
        >
          <span>Archive</span>
          <span className="count-pill count-pill-sm">{archive.length}</span>
          <span className={"caret " + (showCommitted ? "open" : "")}>▾</span>
        </button>
        {showCommitted && (
          <ul className="draft-list">
            {archive.length === 0 && (
              <li className="draft-list-empty">Nothing archived yet</li>
            )}
            {archive.map(d => (
              <DraftListItem
                key={d.id}
                draft={d}
                active={d.id === activeId}
                onClick={() => onSelect(d.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function DraftListItem({ draft, active, onClick }) {
  return (
    <li
      className={["draft-item", active ? "active" : "", "state-" + draft.state].join(" ")}
      onClick={onClick}
    >
      <div className="draft-item-row">
        <span className="draft-item-name">{draft.name}</span>
        <StateBadge state={draft.state} />
      </div>
      <div className="draft-item-row">
        <span className="draft-item-meta">
          {formatRange(draft.fromKey, draft.toKey)}
        </span>
        <span className="draft-item-count">{draft.selected.length} units</span>
      </div>
    </li>
  );
}

function StateBadge({ state }) {
  const map = {
    draft:     { label: "Draft",     cls: "badge-state-draft" },
    committed: { label: "Committed", cls: "badge-state-committed" },
    discarded: { label: "Discarded", cls: "badge-state-discarded" },
  };
  const m = map[state] || map.draft;
  return <span className={"state-badge " + m.cls}>{m.label}</span>;
}

function formatRange(fromKey, toKey) {
  if (!fromKey || !toKey) return "—";
  const f = parseKey(fromKey), t = parseKey(toKey);
  if (!f || !t) return "—";
  if (f.day === t.day) return `${f.day} · ${f.time}–${t.time}`;
  return `${f.day} ${f.time} → ${t.day} ${t.time}`;
}

function parseKey(key) {
  if (!key) return null;
  const [day, periodStr] = key.split("|");
  const period = parseInt(periodStr, 10);
  if (!day || !period) return null;
  const totalMin = (period - 1) * 30;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
  const mm = String(totalMin % 60).padStart(2, "0");
  return { day, period, time: `${hh}:${mm}` };
}

// ---------- Draft details (header strip above the workspace) ----------

function DraftDetails({
  draft,
  onChangeName,
  onChangeFrom,
  onChangeTo,
  onCommit,
  onDiscard,
  onReopen,
  onDelete,
  readOnly,
}) {
  const isReadOnly = readOnly || draft.state !== "draft";
  const range = formatRange(draft.fromKey, draft.toKey);
  const minutes = rangeMinutes(draft.fromKey, draft.toKey);

  return (
    <div className="draft-details">
      <div className="dd-left">
        <div className="dd-name-row">
          {isReadOnly ? (
            <h1 className="dd-name dd-name-readonly">{draft.name}</h1>
          ) : (
            <input
              className="dd-name-input"
              value={draft.name}
              onChange={e => onChangeName(e.target.value)}
              placeholder="Untitled draft"
            />
          )}
          <StateBadge state={draft.state} />
        </div>
        <div className="dd-meta">
          <span className="dd-meta-item">
            <span className="dd-meta-label">Window</span>
            <span className="dd-meta-value mono">{range}</span>
          </span>
          {minutes != null && (
            <span className="dd-meta-item">
              <span className="dd-meta-label">Duration</span>
              <span className="dd-meta-value mono">
                {Math.floor(minutes / 60)}h {minutes % 60 ? (minutes % 60) + "m" : ""}
              </span>
            </span>
          )}
          <span className="dd-meta-item">
            <span className="dd-meta-label">Units</span>
            <span className="dd-meta-value mono">{draft.selected.length}</span>
          </span>
        </div>
      </div>

      <div className="dd-right">
        <div className="time-pickers">
          <SettlementSelect
            label="From"
            value={draft.fromKey}
            onChange={onChangeFrom}
            disabled={isReadOnly}
          />
          <span className="time-arrow">→</span>
          <SettlementSelect
            label="To"
            value={draft.toKey}
            onChange={onChangeTo}
            disabled={isReadOnly}
          />
        </div>

        <div className="dd-actions">
          {draft.state === "draft" && (
            <React.Fragment>
              <button className="btn btn-ghost" onClick={onDiscard}>Discard</button>
              <button
                className="btn btn-primary"
                onClick={onCommit}
                disabled={draft.selected.length === 0}
                title={draft.selected.length === 0 ? "Add at least one unit before committing" : ""}
              >
                Commit draft
              </button>
            </React.Fragment>
          )}
          {draft.state === "committed" && (
            <React.Fragment>
              <span className="dd-readonly-hint">Committed — read only</span>
              <button className="btn btn-ghost" onClick={onReopen}>Reopen</button>
            </React.Fragment>
          )}
          {draft.state === "discarded" && (
            <React.Fragment>
              <span className="dd-readonly-hint">Discarded</span>
              <button className="btn btn-ghost" onClick={onReopen}>Restore</button>
              <button className="btn btn-danger-ghost" onClick={onDelete}>Delete</button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function rangeMinutes(fromKey, toKey) {
  const f = parseKey(fromKey), t = parseKey(toKey);
  if (!f || !t) return null;
  const dayOffset = (d) => (d === "Today" ? 0 : 1440);
  const start = dayOffset(f.day) + (f.period - 1) * 30;
  const end   = dayOffset(t.day) + (t.period - 1) * 30;
  const diff = end - start;
  return diff > 0 ? diff : null;
}

function SettlementSelect({ label, value, onChange, disabled }) {
  return (
    <label className={"settle-select " + (disabled ? "disabled" : "")}>
      <span className="settle-label">{label}</span>
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="" disabled>Pick…</option>
        {window.SETTLEMENT_OPTIONS.map(o => (
          <option key={o.day + "|" + o.period} value={o.day + "|" + o.period}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

window.DraftSidebar = DraftSidebar;
window.DraftDetails = DraftDetails;
window.StateBadge = StateBadge;
window.formatRange = formatRange;
window.parseKey = parseKey;

// app.jsx — root, state, wiring

const { useState, useMemo, useEffect, useCallback } = React;

function uid() {
  return "drft_" + Math.random().toString(36).slice(2, 8);
}

function App() {
  const [t, setTweak] = window.useTweaks({
    layout: "three-col",        // 'three-col' | 'stacked'
    selectionPattern: "buttons", // 'buttons' | 'click' | 'drag'
    showSidebar: true,
    theme: "light",              // 'light' | 'dark'
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
  }, [t.theme]);

  const [drafts, setDrafts] = useState(window.SEED_DRAFTS);
  const [activeId, setActiveId] = useState(window.SEED_DRAFTS[0].id);
  const [pendingAddIds, setPendingAddIds] = useState(new Set());
  const [pendingRemoveIds, setPendingRemoveIds] = useState(new Set());
  const [showCommitted, setShowCommitted] = useState(true);
  const [toast, setToast] = useState(null);

  const bmusById = useMemo(() => {
    const map = {};
    window.SEED_BMUS.forEach(b => { map[b.id] = b; });
    return map;
  }, []);

  const activeDraft = drafts.find(d => d.id === activeId) || drafts[0];

  // When user switches drafts, clear pending checkbox state
  useEffect(() => {
    setPendingAddIds(new Set());
    setPendingRemoveIds(new Set());
  }, [activeId]);

  const inActiveDraftIds = useMemo(
    () => new Set((activeDraft?.selected || []).map(s => s.bmuId)),
    [activeDraft]
  );

  // Build "also in another draft" hint map
  const inOtherDraftsIds = useMemo(() => {
    const map = new Map();
    drafts.forEach(d => {
      if (d.id === activeId || d.state !== "draft") return;
      d.selected.forEach(s => {
        if (!map.has(s.bmuId)) map.set(s.bmuId, d.name);
      });
    });
    return map;
  }, [drafts, activeId]);

  // ----- mutations -----
  const updateActive = useCallback((mut) => {
    setDrafts(prev => prev.map(d => d.id === activeId ? mut(d) : d));
  }, [activeId]);

  const addBmus = useCallback((ids) => {
    if (!ids.length || !activeDraft || activeDraft.state !== "draft") return;
    updateActive(d => {
      const have = new Set(d.selected.map(s => s.bmuId));
      const additions = ids
        .filter(id => !have.has(id) && bmusById[id])
        .map(id => ({ bmuId: id, notes: "" }));
      if (!additions.length) return d;
      return { ...d, selected: [...d.selected, ...additions] };
    });
    flashToast(ids.length === 1
      ? `Added ${ids[0]}`
      : `Added ${ids.length} units`);
  }, [activeDraft, bmusById, updateActive]);

  const removeBmus = useCallback((ids) => {
    if (!ids.length) return;
    updateActive(d => ({
      ...d,
      selected: d.selected.filter(s => !ids.includes(s.bmuId)),
    }));
    flashToast(ids.length === 1 ? `Removed ${ids[0]}` : `Removed ${ids.length} units`);
  }, [updateActive]);

  const updateNotes = useCallback((bmuId, notes) => {
    updateActive(d => ({
      ...d,
      selected: d.selected.map(s => s.bmuId === bmuId ? { ...s, notes } : s),
    }));
  }, [updateActive]);

  const flashToast = (msg) => {
    setToast(msg);
    clearTimeout(flashToast._t);
    flashToast._t = setTimeout(() => setToast(null), 1800);
  };

  // ----- draft lifecycle -----
  const onCreateDraft = () => {
    const newId = uid();
    const draft = {
      id: newId,
      name: "Untitled draft",
      state: "draft",
      fromKey: "Today|34",
      toKey: "Today|40",
      selected: [],
      createdAt: Date.now(),
    };
    setDrafts(prev => [draft, ...prev]);
    setActiveId(newId);
    flashToast("New draft created");
  };

  const onCommit = () => {
    if (!activeDraft) return;
    if (activeDraft.selected.length === 0) return;
    if (!confirm(`Commit "${activeDraft.name}" with ${activeDraft.selected.length} unit(s)?\n\nOnce committed, the draft becomes read-only.`)) return;
    updateActive(d => ({ ...d, state: "committed", committedAt: Date.now() }));
    flashToast("Draft committed");
  };

  const onDiscard = () => {
    if (!activeDraft) return;
    if (!confirm(`Discard "${activeDraft.name}"?\n\nIt will be moved to the archive. You can restore it later.`)) return;
    updateActive(d => ({ ...d, state: "discarded", discardedAt: Date.now() }));
    flashToast("Draft discarded");
  };

  const onReopen = () => {
    updateActive(d => ({ ...d, state: "draft" }));
    flashToast("Draft reopened");
  };

  const onDeleteDraft = () => {
    if (!activeDraft) return;
    if (!confirm(`Permanently delete "${activeDraft.name}"? This cannot be undone.`)) return;
    setDrafts(prev => {
      const next = prev.filter(d => d.id !== activeId);
      if (next.length) setActiveId(next[0].id);
      return next;
    });
    flashToast("Draft deleted");
  };

  // ----- render -----
  if (!activeDraft) {
    return (
      <div className="empty-state">
        <h2>No drafts</h2>
        <button className="btn btn-primary" onClick={onCreateDraft}>+ New draft</button>
      </div>
    );
  }

  const inOtherSet = new Set(inOtherDraftsIds.keys());
  // Hack: pass through a function-ish — but inOtherDraftsIds we want the name too
  const inOtherIdsSet = new Set();
  inOtherDraftsIds.forEach((_, k) => inOtherIdsSet.add(k));

  const readOnly = activeDraft.state !== "draft";

  return (
    <div className={[
      "app",
      "layout-" + t.layout,
      t.showSidebar ? "with-sidebar" : "no-sidebar",
    ].join(" ")}>
      {t.showSidebar && (
        <DraftSidebar
          drafts={drafts}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={onCreateDraft}
          showCommitted={showCommitted}
          setShowCommitted={setShowCommitted}
        />
      )}

      <main className="workspace" data-screen-label="Draft Workspace">
        <DraftDetails
          draft={activeDraft}
          onChangeName={(v) => updateActive(d => ({ ...d, name: v }))}
          onChangeFrom={(v) => updateActive(d => ({ ...d, fromKey: v }))}
          onChangeTo={(v) => updateActive(d => ({ ...d, toKey: v }))}
          onCommit={onCommit}
          onDiscard={onDiscard}
          onReopen={onReopen}
          onDelete={onDeleteDraft}
          readOnly={readOnly}
        />

        <div className={"workspace-grid grid-" + t.layout}>
          <AvailableTable
            bmus={window.SEED_BMUS}
            inActiveDraftIds={inActiveDraftIds}
            inOtherDraftsIds={inOtherIdsSet}
            selectionPattern={readOnly ? "click-disabled" : t.selectionPattern}
            pendingIds={pendingAddIds}
            setPendingIds={setPendingAddIds}
            onAddOne={(id) => addBmus([id])}
            onAddMany={(ids) => addBmus(ids)}
          />

          <SelectedTable
            draft={activeDraft}
            bmusById={bmusById}
            selectionPattern={t.selectionPattern}
            readOnly={readOnly}
            pendingRemoveIds={pendingRemoveIds}
            setPendingRemoveIds={setPendingRemoveIds}
            onRemoveOne={(id) => removeBmus([id])}
            onRemoveMany={(ids) => removeBmus(ids)}
            onUpdateNotes={updateNotes}
            onDropIds={(ids) => addBmus(ids)}
          />
        </div>
      </main>

      {/* Tweaks */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Theme">
          <window.TweakRadio
            label="Appearance"
            value={t.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark",  label: "Dark" },
            ]}
          />
        </window.TweakSection>
        <window.TweakSection label="Layout">
          <window.TweakRadio
            label="Workspace"
            value={t.layout}
            onChange={(v) => setTweak("layout", v)}
            options={[
              { value: "three-col", label: "Side" },
              { value: "stacked",   label: "Stack" },
            ]}
          />
          <window.TweakToggle
            label="Drafts sidebar"
            value={t.showSidebar}
            onChange={(v) => setTweak("showSidebar", v)}
          />
        </window.TweakSection>
        <window.TweakSection label="Selection pattern">
          <window.TweakRadio
            label="Move units by"
            value={t.selectionPattern}
            onChange={(v) => setTweak("selectionPattern", v)}
            options={[
              { value: "buttons", label: "Buttons" },
              { value: "click",   label: "Click" },
              { value: "drag",    label: "Drag" },
            ]}
          />
        </window.TweakSection>
      </window.TweaksPanel>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

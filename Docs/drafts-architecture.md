# Drafts: Architecture for Phase 1 and Beyond

**Status:** a **proposal for discussion** describing the target solution: Phase 1 (day one) and the phases that follow. It incorporates the architecture review, the **sandbox brief** (day one = one private sandbox per operator, §9) and the **scenarios brief** (design seams for multiple scenarios, §10). Decisions are tracked in §19.1. Conflicts raised while merging the briefs, and their resolutions, are in §19.2. Items still open are in §19.3.
**Audience:** product owner and solution architect.
**Diagrams:** open [`drafts-architecture-diagrams.html`](drafts-architecture-diagrams.html) in a browser for a visual walkthrough.

**How to read this document**

| Part | What it covers | Read if you want to… |
|---|---|---|
| **Mental model** (next section) | Drafts explained as GitHub pull requests: what to borrow and what not | get the idea in two minutes |
| **A. Logical model and rules** (§1–10) | Platform-independent design: concepts, data model, lifecycle, the committed plan, calculation and comparison rules, permissions, **day one sandbox**, **scenarios (future)** | agree *what* the system does |
| **B. Reference implementation** (§11–17) | One way to build it (PostgreSQL, API, live events), with assumptions marked | discuss *how* to build it |
| **C. Delivery plan** (§18–20) | Phases, decisions, resolved conflicts, open items, risks | plan the work |

**Releases at a glance:** Phase 1 (day one) = one private **sandbox** per operator, with the full committed-plan design. Phase 2 = multiple private drafts and side-by-side comparison. Phase 3 = sharing. Details in §18.

---

# Mental model: drafts are like GitHub pull requests

If you know GitHub, you already know most of this design. The committed plan is `main`. A draft is a pull request against it. The dotted line is the PR's diff view. Committing is merging. On day one each operator has a single **sandbox**, which is like a working copy: you stage changes, commit some or all of them, and keep going.

## The mapping

| GitHub / Git | Our drafts | Notes |
|---|---|---|
| `main` branch | **Committed plan**: the solid baseline every operator sees | One shared plan (D3). Stored as a versioned log (§5.1) |
| Working copy with staged changes | **Sandbox** (day one): one private working draft per operator | §9 |
| `git add -p` (stage only some changes) | **Partial commit**: commit selected sandbox units, keep the rest | D15 |
| Branch / pull request | **Named draft** (Phase 2): a proposed change on top of the plan | Holds intent (units + times), not results |
| "Files changed" view | **Dotted line**: the plan as it would be if the sandbox or draft went in | Computed live in the browser |
| Commits inside a PR | **Actions**, one per unit | §2.4 |
| Merge | **Commit**: actions are added to the plan | One transaction (§14.3) |
| Check out a merged change to amend it, then a follow-up PR | **Edit on a committed draft** = load it into the sandbox, change it, commit as a **supersede**: replaces the old in one step, with no gap | §4.3, D16, D20 |
| Revert commit | **Withdraw** (UI label could be "Uncommit"): removes actions from an effective time onward. History is kept | §4.4, D17 |
| Closing a PR without merging | **Clear sandbox** (day one), **discard** a named draft (Phase 2) | |
| Fork | **Duplicate** (Phase 2) | |
| Reviewer / read access | **Share** (Phase 3) | |
| Merge conflict | **Clash**: same unit, overlapping half-hours. **Blocked**, so amend the existing commitment instead | D18 |
| Required review before merge | **Commit approval** | D4 |
| CI checks before merge | **Validation before commit**: clashes, effective-time warnings, drift since last edit, MNZT (if D14 = profiles) | §4.4, §7.3 |
| HEAD commit id | **Plan version** (`plan_seq`) | Tells browsers their baseline is stale |
| `git log` / blame | **Plan history**: plan actions with the version they were added and removed in | §5.5 |

Scenarios (§10) have no Git equivalent. They are the *environment* a change is tested in, like running the same PR's test suite against several configurations.

## Where the analogy breaks (and why the design differs)

1. **The base moves by itself.** `main` only changes when someone merges. Our baseline also changes every few minutes as new market data arrives. → Drafts store **intent**, not results, so they are re-applied to whatever the current baseline is. There is never a manual rebase.
2. **Drafts are usually competing alternatives.** Most PRs eventually get merged. Several drafts are often different answers to the same shortfall, and only one is committed. → Comparing options matters (pin on day one, comparison table in Phase 2, §7).
3. **Time runs out, and the past is fixed.** A PR can sit for months, and a revert undoes everything. A draft for 17:00 is worthless at 17:30, and half-hours already delivered can't be undone. → Real times, an **Expired** flag, and changes that apply only from an **effective time** (§4.4).
4. **Conflicts are about meaning, not lines.** Git compares text. We compare "same unit, same half-hour". → A rule enforced by the database, never a merge editor.
5. **Live, not pull-based.** Operators must see a colleague's commit within seconds. → Server-pushed live events (§15).
6. **Merging doesn't change other work.** Other operators' sandboxes and drafts redraw against the new baseline, and any unit now committed elsewhere stops counting (§6.3).

## Worth borrowing

| Idea from GitHub | What it means for us | Where it fits |
|---|---|---|
| **Protected `main`** | Only commit, supersede and withdraw can change the plan. Nothing writes to it directly | Built in (§5.1) |
| **Never rewrite history** | Plan actions are never edited or deleted. Changes close old rows and add new ones | Built in (§5.1) |
| **Staging only some changes** | Partial commit from the sandbox | Phase 1 (D15) |
| **Amend via a new change, not by editing merged code** | Edit loads a commitment into the sandbox, and committing supersedes it atomically | Phase 1 (§4.3) |
| **Checks before merge** | Clash, effective-time and drift checks are shown in the commit dialog before the operator confirms | Phase 1 |
| **Required review** | Optional senior approval before commit | D4 (Phase 4 if chosen) |
| **PR description** | The commit dialog asks for a name and description (*why*). Supersede and withdraw require a reason | Phase 1 |
| **Review comments** | Recipients of a shared draft can comment ("why not PEHE-1?") | Phase 4 (after sharing) |
| **Notifications** | "Your commitment was edited by NSE", later "OSM shared a draft with you" | Phase 1 (plan events), Phase 3 (sharing) |
| **History browsing** | "Show me the plan as it was at 14:00": a simple query over plan actions | Query in Phase 1, UI in Phase 4 |
| **Blame** | For any unit and half-hour: which commitment put it there, who committed it, when, and what it replaced | Query in Phase 1, UI in Phase 4 |

## Not worth borrowing

| Git / GitHub feature | Why not |
|---|---|
| **Git itself as the storage engine** | We need queries, transactions, constraints, row-level security and live events. A relational database does all of this |
| **Branches of branches / stacked PRs** | A draft is always against the current plan. To build on a colleague's draft, duplicate it. To see two drafts together, use the read-only combined preview (§7.2) |
| **Text diffs and three-way merges** | Our "diff" is a calculated MW delta per half-hour, and our "conflict" is a rule. There is nothing to merge line by line |
| **Manual rebase** | The baseline moves constantly, so drafts must re-apply automatically |
| **Pull-based sync** | Operators need changes pushed to them in seconds |
| **Long-lived drafts** | Drafts expire with time |
| **Force-push / history rewrite** | Breaks the audit trail. Never allowed |
| **Merge commits that combine several drafts** | Each commit is its own commitment record, which keeps "which option did we choose and why" clear |

---

# Part A: Logical model and rules

This part is **platform-independent**. It describes what the system does and the rules it enforces, whatever it is built with. Part B describes one way to build it.

The full model (named drafts, sharing) is described first, because day one is a restricted form of it. §9 describes **day one: the sandbox**, and which parts of the full model it switches off.

## 1. Goals and requirements

### 1.1 Functional requirements

| # | Requirement | From |
|---|---|---|
| F1 | An operator can create, rename, describe, duplicate, discard, restore and delete their own **named drafts** | Phase 2 |
| F2 | An operator can add and remove units, set each unit's window (open-ended allowed), output, **one or more reasons**, event type and notes | Phase 1 (in the sandbox) |
| F3 | The operator's work in progress is drawn as a dotted overlay on the Margin and area charts, updating **instantly** as they edit | Phase 1 |
| F4 | The operator can show or hide each draft's overlay | Phase 2 |
| F5 | Committing adds units to the **shared committed plan**. Every operator's solid lines update | Phase 1 |
| F6 | A committed draft can be **edited** (familiar flow, implemented as load + supersede, without a gap) or **withdrawn**. Both apply from an effective time and never change the past | Phase 1 |
| F7 | The owner can share a draft with named operators or a desk. Recipients see it read-only and can duplicate it | Phase 3 |
| F8 | Committed-data drift indicators: ↑/↓ where a committed unit's data has moved since commit | Phase 1 |
| F9 | The sandbox's impact is shown on the **dashboard** as well as the charts (§7.4) | Phase 1 |
| F10 | Compare options side by side across all areas (§7.1) | Phase 2 |
| F11 | Preview two or more drafts combined, read-only (§7.2) | Phase 2 |
| F12 *(new)* | One private, persisted **sandbox** per operator, with clear, partial commit and load-from-plan (§9) | Phase 1 |
| F13 *(new)* | **Pin** one previous sandbox state as a reference while editing (§9.8) | Phase 1 |

### 1.2 Production requirements

| # | Requirement |
|---|---|
| N1 | **Persistence.** Sandboxes and drafts survive reloads, refreshes, restarts and new market data |
| N2 | **Real multi-user.** Operators on different machines see commits within seconds (and shared drafts from Phase 3) |
| N3 | **Identity.** Single sign-on. No self-selected identity |
| N4 | **Authorisation enforced server-side** |
| N5 | **Consistency.** All operators compute the baseline from the same scenario, planning policy, market data and committed plan version |
| N6 | **Audit and history.** Every command is recorded. The committed plan at any past version can be reconstructed exactly |
| N7 | **Concurrency safety.** Commits and edits never silently overwrite each other. Two commitments for the same unit and half-hour can never both exist |
| N8 | **Time correctness.** Actions refer to real half-hours (UTC), including clock-change days (46/50 SPs). The past is never changed |
| N9 | **Availability** suitable for a control-room tool (target to be agreed, D12) |
| N10 | **Scenario-ready.** Every calculation takes the scenario as an explicit input, so more scenarios can be added later without a redesign (§10) |

---

## 2. Core concepts and invariants

### 2.1 Glossary

| Term | Meaning |
|---|---|
| **Draft** | An editable container of proposed actions, owned by one operator. Stores intent, never results. Has a **kind**: `sandbox` or named `draft` |
| **Sandbox** | The operator's single private working draft on day one (§9). A draft with restrictions, not a separate mechanism |
| **Action** | One unit inside a draft: window, output, reasons, event type, note |
| **Commitment** | A draft with status *committed*: the record of one commit (its name, description, units, unit-data snapshot) |
| **Committed plan** | The set of **plan actions** currently in force. One plan for everyone (D3), independent of scenario |
| **Plan action** | An immutable copy of an action, made at commit. Carries the plan version it was **added in** and, once closed, the version it was **removed in** |
| **Plan version** (`plan_seq`) | A counter incremented by every change to the plan (commit, supersede, withdraw) |
| **Load from plan** | Copy committed plan actions into the sandbox so they can be changed. Behind the **Edit** button |
| **Supersede** | Atomically close loaded plan actions from the effective time and add their replacements |
| **Withdraw** | Close a commitment's plan actions from an effective time onward ("uncommit") |
| **Effective time** | The half-hour boundary from which a change to an existing plan-action row takes effect. Set **per row**. Never in the past |
| **Pin** | A display-only copy of the sandbox's impact at one moment, kept as a reference line (§9.8) |
| **Market snapshot** | **Facts**: an immutable copy of PN, MEL, MIL and standing data at a point in time |
| **Scenario** | One coherent set of **input values**: demand, renewable forecasts and requirement values (§10). One live scenario ("central") until multi-scenario working is built, plus an "outturn" scenario of actuals for historical mode |
| **Planning policy** | Global rules applied to every scenario: reserve % (TR2) and requirement rules. Versioned, audited, changed only by the **policy owner**, and never retroactive. Not part of any scenario |
| **Availability data** | Global, audited area availability: **contracted** values (facts: contracts that exist) and **constraint overrides** (manual). Not part of any scenario (see D21) |
| **Baseline** | Per half-hour totals for (scenario, policy, snapshot, plan version): units already running plus the committed plan |
| **Overlay** | Baseline + the delta of the sandbox or a draft: the dotted line |

### 2.2 Principles

1. **Drafts are intent, not results.** They are re-applied to whatever the current baseline is, and nothing is stored per draft.
2. **The committed plan is a versioned log, not mutable state.** It changes only by adding plan actions or closing them, never by editing them.
3. **Baseline + delta.** The baseline is computed once per (scenario, policy, snapshot, plan version). Each draft is a delta on top of it.
4. **Absolute time.** Every action uses UTC half-hour boundaries. Slot indices exist only on screen.
5. **Commands, not raw writes.** Intent-level commands are validated and applied atomically, with an audit record and an event.
6. **One calculation library**, with the scenario, the planning policy and the contribution model (D14) as explicit inputs.
7. **Day one restricts, later phases lift.** The sandbox, single scenario and lack of sharing are restrictions on the full model, never separate mechanisms.

### 2.3 Invariants (always true)

| # | Invariant |
|---|---|
| I1 | The committed plan at version N is exactly the plan actions with `added_in ≤ N` and (`removed_in` empty or `removed_in > N`) |
| I2 | A plan action is never edited. The only change ever made to it is setting `removed_in`, once |
| I3 | At any plan version, **no two plan actions for the same unit overlap in time** (D18) |
| I4 | A commitment's contents never change. Its plan actions can only be closed |
| I5 | No command changes a half-hour that has already started: effective times are never in the past (D17) |
| I6 | A unit appears at most once in a draft |
| I7 | Every action has at least one reason |
| I8 | **Day one:** each operator has at most one open draft **per context** (live, historical): their sandbox (lifted in Phase 2) |
| I9 | No calculation reads forecasts, requirements, policy or availability data from global state. The scenario, the planning policy and the availability data are always passed in |
| I10 | The committed plan is scenario-independent. Each plan change records the reference scenario and policy version it was validated against |

### 2.4 One draft, many units

A draft, including the sandbox, is a **container**. Each unit added to it becomes one **action** (one row). A draft with five units is one draft with five actions, not five drafts.

```
Draft A  (owner NSE, default window 17:00–19:00)
 ├─ action: T_DRAXX-1   17:00–19:00   645 MW   [Margin, Inertia]
 ├─ action: T_CNQPS-2   17:30–19:00   380 MW   [Margin]
 └─ action: T_PEHE-1    18:00–open    250 MW   [Recovery Reserve]

Draft B  (owner OSM)
 ├─ action: T_CNQPS-2   06:00–08:00   380 MW   [Inertia]       ← same unit as in Draft A: allowed
 └─ action: T_SHBA-1    06:00–09:00   400 MW   [Response]
```

(Unit names and figures are illustrative.)

- **A unit appears at most once in a draft** (I6).
- **Each action has its own settings:** window (the end can be open), output, one or more reasons, event type and note. New actions start with the draft's default window.
- **The same unit can be in several open drafts**, including other operators'. Each draft's dotted line counts it independently.
- **Commitments can't overlap:** two commitments for the same unit at the same time are blocked (I3, §5.2). Draft A and Draft B above could both be committed, because their times don't overlap.
- **Lifecycle commands act on the draft**, apart from partial commit, which selects units (D15).

---

## 3. Logical data model

```mermaid
erDiagram
  USER ||--o{ DRAFT : owns
  DRAFT ||--o{ DRAFT_ACTION : contains
  DRAFT_ACTION |o--o| PLAN_ACTION : "replaces (loaded)"
  DRAFT ||--o{ DRAFT_SHARE : "shared via (Phase 3)"
  DRAFT ||--o{ PLAN_ACTION : "committed as"
  PLAN_EVENT ||--o{ PLAN_ACTION : "added in / removed in"
  PLAN_EVENT }o--|| SCENARIO : "validated against"
  DRAFT ||--o{ COMMIT_UNIT_SNAPSHOT : "frozen at commit"
  USER ||--o| SANDBOX_PIN : pins
  UNIT ||--o{ DRAFT_ACTION : "used by"
  UNIT ||--o{ PLAN_ACTION : "committed as"
  SCENARIO ||--o{ SCENARIO_INPUT : "demand, renewables, requirement values"
  PLANNING_POLICY ||--o{ PLAN_EVENT : "version applied"
  MARKET_SNAPSHOT ||--o{ MARKET_DATA : "PN, MEL, MIL"
```

| Entity | Key attributes | Notes |
|---|---|---|
| **User** | identity, role, desk | From SSO |
| **Draft** | owner, **kind** (`sandbox` / `draft`), name, description, status, default window, context (live / historical), version (concurrency), last-evaluated impact (drift check), source (the sandbox a commitment came from) | Status: `draft` (open), `committed`, `superseded`, `withdrawn`, `discarded`. A commitment with only some rows closed shows as **partly amended** |
| **Draft action** | unit, start, end (empty = open-ended), output, **reasons (list, ≥ 1)**, event type, note, **replaces** (the plan-action row it was loaded from, if any), **effective time** (loaded or removed units only; default next half-hour), **removal** flag (a loaded unit the operator deleted, to be withdrawn at commit) | Unique per (draft, unit) |
| **Draft share** | draft, grantee (user **or** desk), permission (view) | Phase 3. Desk shares follow desk membership |
| **Plan action** | source commitment and action, unit, start, end, output, reasons, event type, `added_in`, `removed_in`, `split_from` | Immutable (I2). See §5 |
| **Plan event** | plan version, time, actor, type (`commit`, `supersede`, `withdraw`), commitment, change reason, per-row changes (row closed, its effective time, replacement), acknowledged warnings, **reference scenario**, **policy version**, impact summary | Append-only. One per plan change |
| **Commit unit snapshot** | commitment, unit, MEL, SEL, NDZ, MZT, MNZT, prices | Drives ↑/↓ drift arrows and indicative cost |
| **Sandbox pin** | owner, pinned at, scenario, snapshot, plan version, per-area impact series | Display only. One per user. Never committable |
| **Scenario** | name, source (generated / manual / **actual**), generator run, valid from/to, description, metadata (e.g. what makes it distinct), status (active / superseded / retired) | Imported and read-only. A new run creates new rows. One live "central" scenario until multi-scenario working, plus "outturn" (`actual`) for historical mode |
| **Scenario inputs** | per half-hour demand, wind, solar, …; per half-hour and area **requirement values**, each with a source (manual / generated / actual) | Input values. Not part of the market snapshot. Operator-entered values on the Requirements screen are central-scenario inputs with source = manual |
| **Planning policy** | reserve % (TR2), requirement rules, valid from, set by, reason | Global, applied to every scenario. Versioned and audited. Changed only by the **policy owner** role. Takes effect from a stated time, never retroactively (see C16) |
| **Contracted availability** | area, half-hour, contracted MW, valid from, set by | **Fact**: reflects contracts that exist. Global and audited, the same treatment as SR/QR services (D9) |
| **Constraint override** | area, half-hour, constrained MW, valid from, set by, reason | **Manual availability override.** Global and audited in Phase 1. The first candidate to vary by scenario if D21 allows availability |
| **Market snapshot** | time taken, kind, per unit PN / MEL / MIL, standing data | **Facts.** Immutable. No demand |
| **Audit event** | actor, time, entity, command, before, after | Append-only |
| *Optional (D14)* **Action profile** | action, half-hour, MW, source (generated / override) | Only if unit profiles are chosen |
| *Optional (D19)* **Delivery status** | plan action → committed / instructed / delivered / lapsed, or a link to instruction records | Room left, not built in the first release |

**Time model.** Starts and ends are UTC half-hour boundaries, and the end is exclusive. They are displayed as Europe/London settlement date + SP (tested rules exist in `src/dashboard2/time.ts`, including 46/50-SP days). An action whose end has passed is **expired**. It is excluded from **forward-looking** views (overlays, comparison, commit checks) but **kept in history views and the plan record**.

---

## 4. Lifecycle and commands

### 4.1 States

The full model (Phase 2 onwards). The day-one sandbox uses a subset (§9.6).

```
                       Commit (all or selected units)
  New → [ Draft / Sandbox ] ─────────────────────────────► [ Committed ] ── Withdraw (from effective time) ──► [ Withdrawn ]
          │  ▲          ▲                                       │
  Discard │  │ Restore  │ Edit = load into sandbox              │ when all its plan actions are replaced
  (Ph. 2) ▼  │          └───────────────────────────────────────┤
     [ Discarded ]                                              ▼
          │                                               [ Superseded ]
        Delete
```

- **Draft / sandbox**: editable by the owner. Dotted line.
- **Committed**: a commitment. Its plan actions are in the plan. Its contents **never change** (I4) and it **never returns to draft**. To change it, load it into the sandbox (§4.3).
- **Superseded / Withdrawn**: all of its plan actions have been closed (by supersede or withdraw). Earlier half-hours stay in the plan record. If only some of them are closed, it stays *committed* and shows as **partly amended** (amendment works on individual plan-action rows).
- **Discarded** (Phase 2): a named draft set aside. Restorable. Can be deleted.
- **Expired** is a display flag on any draft whose actions are all in the past.

### 4.2 Commands

| Command | Applies to | Effect on the plan | From |
|---|---|---|---|
| Add / change / remove units, reasons, window | Sandbox or draft (owner) | None | Phase 1 |
| **Clear sandbox** | Sandbox | None. Loaded units go back to being untouched commitments | Phase 1 |
| **Commit** (all, or selected units) | Sandbox or draft | Adds plan actions for the selected units' own windows (§4.4). Selected units move into a new **commitment**. Unselected units stay | Phase 1 |
| **Edit** = load from plan | A whole commitment, or individual committed units | None until commit. Loaded units are copied into the sandbox, each linked to the plan-action row it replaces, with its own effective time (default next half-hour). **Warns if the sandbox isn't empty** | Phase 1 |
| Commit with loaded units (= **supersede**) | Sandbox | One transaction: closes each loaded plan action from **its own** effective time (split there), adds the replacements, and withdraws loaded units the operator deleted. One new plan version | Phase 1 |
| **Withdraw** | Commitment, or selected rows of it | Closes the rows, each from its own effective time (default next half-hour). New plan version | Phase 1 |
| **Pin** / unpin | Sandbox | None (display only) | Phase 1 |
| Create / rename / duplicate / discard / restore / delete named drafts | Draft (owner) | None | Phase 2 |
| Share / unshare | Draft (owner) | None | Phase 3 |

### 4.3 Editing a committed draft (D16, D20)

Operators keep a familiar **Edit** button on committed drafts. Under the sandbox model:

1. **Edit loads the commitment, or individual committed units, into the operator's sandbox.** If the sandbox already has content, the operator is **warned** first ("Your sandbox has 3 units. Loading Draft A adds its units alongside them"), and can cancel, clear first, or continue. Mixing is safe: each amended unit carries its own effective time, new units keep their own windows, and reasons are per unit.
2. Loaded units are copies, each linked to the plan-action row it replaces and given an **effective time** (default: next half-hour, editable per unit). **The commitment stays in the plan** while the operator works, so nobody sees a gap or a false shortfall.
3. The dotted line shows **the plan with the loaded actions replaced** by the sandbox's version, not "plan plus a second copy" (§6.2).
4. Deleting a loaded unit marks it for removal: it is shown struck through and is withdrawn at commit.
5. **Commit** performs a supersede (one transaction, one plan version). If only some of a commitment's units were amended, it shows as **partly amended**. **Clear** cancels, and the commitment is untouched.
6. If someone else changes the same plan actions first (e.g. a senior operator), committing fails with a clear message, and the operator reloads.

From Phase 2, Edit could instead open the commitment in a new named draft. Revisit with D20.

Committed records stay immutable while the operator flow stays familiar. **This user-experience choice is D20, for operator sign-off.** It does not block the build.

### 4.4 Effective-time rules (D17)

The effective time is the half-hour boundary from which a change to an **existing** plan-action row takes effect. It is set **per amended row**, not per commit:

- **Loaded (amended) units** and **withdrawn units** each carry their own effective time. Default: the start of the next half-hour. The operator can move any of them later.
- **New units** have no effective time. They use their own windows.

| Rule | Type | Detail |
|---|---|---|
| **Never in the past** | **Hard**: rejected | No change may touch a half-hour that has already started. An effective time must be ≥ now, so the earliest allowed is the **start of the next half-hour**. A new unit's window is clipped to start no earlier than that, and a window entirely in the past can't be committed (it has expired) |
| **Within gate closure** | Warning: acknowledge to continue | The change (an effective time, or a new unit's start) falls before gate closure for that half-hour (≈ 1 hour before delivery) |
| **Within unit notice time** | Warning: acknowledge to continue | For units being added or extended: the change starts earlier than now + the unit's NDZ (notice to deviate from zero) |
| *Minimum run / off time* (if D14 = profiles) | Warning | Window shorter than MNZT, or a gap shorter than MZT |

Acknowledged warnings are stored on the plan event and in the audit trail.

How an effective time T applies to an existing plan-action row:
- Entirely before T: untouched.
- Entirely after T: closed.
- Spanning T: **split**. The original is closed, and a new plan action covering start → T is added (`split_from` links them). The past stays in the plan exactly as it was.

Because effective times are per row, one commit can amend several units from different times, add new units and withdraw others, all as one plan version. That is why loading into a non-empty sandbox only needs a warning.

### 4.5 Historical mode

Work done against a historical window carries `context = historical`:

- Each operator has **one sandbox per context**, so one live and one historical (I8).
- It is evaluated against an **outturn scenario** (`source = actual`). Recorded demand and renewables are treated as **facts** here, not assumptions (§10.4).
- Requirement values are the ones **in force at the time**, recovered from retained central-scenario versions. Where no record exists (before go-live, or a gap), requirements are shown as **unavailable**, never invented. History is complete from go-live onwards (retention: C15).
- A historical sandbox **cannot commit at all** on day one (D10). Its purpose is analysis and replay, and the pin covers comparison. A practice plan for training may be considered in Phase 4.

---

## 5. The committed plan

### 5.1 A versioned log of plan actions

On commit, the selected actions are **copied** into the plan as plan actions, stamped with the new plan version (`added_in`), and **moved into a new commitment record** (a draft with status *committed*, named in the commit dialog). The sandbox keeps any unselected units (§9.7).

- **Current plan** = plan actions not yet closed.
- **Plan at version N** (or at 14:00) = invariant I1. It's a query, not a reconstruction.
- **Changing the plan** only ever closes plan actions (sets `removed_in`) and adds new ones, in one transaction per plan version.

### 5.2 One commitment per unit per half-hour (D18)

**A unit can have only one open plan action at any moment** (invariant I3). A commit that would overlap an existing commitment for the same unit is **rejected**, and the message names the clashing commitment and owner.

- To change a unit's commitment, **Edit** it (load into the sandbox, §4.3). The supersede closes the old plan actions before adding the new ones, so it never clashes with itself.
- This removes any "which value wins?" ambiguity instead of resolving it with a rule.
- It replaces D5: there is no "warn and acknowledge" for clashes.

### 5.3 Reasons are a list

**One unit, one commitment, many reasons.** Each action carries a list of reasons (at least one), e.g. `[Margin, Inertia]`. Together with §5.2, if two operators need the same unit for different purposes, the second **edits the existing commitment to add their reason** instead of committing a duplicate.

| Where reasons are used | Rule |
|---|---|
| Area availability (calculation) | **Not affected.** A committed unit contributes physically to every area, whatever its reasons |
| Committed tab cost cards, per-reason breakdowns | A unit appears under **each** of its reasons. **Totals count it once.** Per-reason figures can add up to more than the total, and the UI says so |
| Dashboard tile alerts filtered by reason | A unit matches if the reason is in its list |

### 5.4 Supersede and withdraw in one picture

```
Plan version N:    A  DRAXX-1  15:00 ─────────────────────── 19:00
Edit A (load into sandbox), trim to 18:00, effective 16:30, committed at 16:10:
Plan version N+1:  A  DRAXX-1  15:00 ──── 16:30                       (split: past kept, rest closed)
                   A′ DRAXX-1             16:30 ──── 18:00            (added in the same version)
```

The rejected alternative (uncommit, edit, recommit) would produce a version with nothing committed, which every screen would show as a shortfall, and it would also erase 15:00–16:30.

### 5.5 History and blame

- **Plan at time T:** find the plan version current at T, then apply I1.
- **Blame (unit, half-hour):** the plan action covering it, plus its commitment, the plan event that added it (who, when, reason, reference scenario), and what it replaced (`split_from`, and the closed plan actions in the same plan event).
- **Lineage:** the plan events chain one commitment to the ones that amended it.

### 5.6 Room for instruction and delivery (D19)

Committing does not instruct a unit. A production tool will eventually need to know whether a plan action was **instructed** and whether it **delivered**, to reconcile plan with reality. The model leaves room for this with an optional delivery status on plan actions (committed / instructed / delivered / lapsed) or a link to instruction records. It is not built in the first release.

---

## 6. Calculation rules

### 6.1 Baseline + delta, with explicit inputs

In plain terms: the **solid lines** are the baseline, meaning everything already running plus the committed plan, stored once per half-hour. The **dotted line** for the sandbox or a draft is the baseline plus that draft's extra units, computed when the chart draws. It is drawn only over the half-hours the draft changes, with an anchor point either side joining it to the solid line. Nothing is stored per draft, so ten drafts cost ten short lists of units, not ten copies of the market data.


- **Baseline** for (scenario, policy, snapshot, plan version): units already running (PN > 1 MW) plus open plan actions, **once per unit per half-hour**, evaluated against the scenario's demand and requirement values and the planning policy (reserve %, requirement rules).
- **Overlay** for the sandbox or a draft: baseline + its units that aren't already counted in that half-hour.
- **Explicit inputs.** Calculation functions take the scenario and the planning policy as arguments, e.g. `computeBaseline(snapshot, availability, scenario, policy, plan)` and `applyDraft(baseline, scenario, policy, draft)`. Nothing reads "the forecast", "the requirement", "the reserve %" or "the contracted MW" from global or store state (I9). Area availability is `max(0, contracted − constrained) + committed contributions`, with contracted and constrained values coming from global availability data.
- **One contribution function** answers "what does this action add in this half-hour?" for every area. In Phase 1 it returns a flat block. It is the switch point for D14 (§6.4).

### 6.2 Rules

- **No double counting per half-hour**, for margin and all areas.
- **Loaded units are drawn as replacements.** For a sandbox containing loaded units, the overlay is *baseline − the loaded plan actions' contribution (each from its own effective time) + the sandbox's contribution*. The calculation library computes the loaded contribution with the same function and subtracts it. Loaded units marked for removal subtract and add nothing.
- **Visibility:** draw only the user's own sandbox and drafts, plus (Phase 3) drafts shared with them, minus any they have hidden.
- **Expired actions** are excluded from forward-looking views and kept in history views (§3).
- **Open-ended actions** run to the end of the displayed horizon.
- **Missing requirement values** (e.g. historical half-hours with no record) are shown as **unavailable**: no requirement line and an "unknown" status, never treated as zero.
- **Partial line:** drawn only over the half-hours a draft changes, with an anchor point either side.

### 6.3 The moving baseline

When the baseline changes (new snapshot, new scenario run, or someone else changes the plan), every overlay is recomputed. Nothing is stored per draft, so nothing needs migrating. If a unit in my sandbox is now committed by someone else, my overlay stops counting it, and the UI flags it ("already committed by OSM at 14:32; Edit that commitment to change it").

### 6.4 Open decision D14: how each unit's contribution is modelled

**Already settled:** a draft's impact is the **sum of its units' contributions** per half-hour. Lifecycle, the plan model and the API are the same for both options.

**Open:** the *shape* of each unit's contribution over time.

#### Option A: flat block (simplest)

Each action has a start, an end and one output level. For every half-hour from start to end, the unit adds the same amount: EMX += MEL, EOL += output, EMI += SEL.

```
MW │    ┌───────────┐
   │    │           │
   └────┴───────────┴────
       start       end
```

#### Option B: unit profile

Each action has a start, an end **and a MW value per half-hour**, generated from the unit's data (NDZ, SEL, MEL, run-up / run-down rates, MNZT / MZT) and editable by the operator for individual half-hours. The draft impact is the sum of the profiles.

```
MW │            ┌────┐
   │          ╱      ╲
   │        ╱          ╲
   └──┬───┴──────────────┴──
    start notice ramp  hold  ramp down
```

#### Comparison

| | Option A: flat block | Option B: unit profile |
|---|---|---|
| Realism | Overstates contribution in the first half-hours. Ignores notice time and ramping | Contribution follows notice, ramp-up, hold and ramp-down |
| MNZT / MZT | Not checked | Warnings (§4.4) |
| Per-unit breakdown on the chart | Possible, but every unit is a rectangle | Meaningful ("of +1,200 MW at 18:30, DRAXX-1 gives 645") |
| Clash rule (D18) | By overlapping windows | Same rule. Windows still define the commitment |
| Operator effort | Pick units and a window | Same by default. Optional per-half-hour edits |
| Data needed | Standard unit data (MEL, SEL) | Plus run-up / run-down rates: availability to be confirmed |
| Rules needed | None | Agreed ramp and notice rules, plus a definition of the EMX / headroom a ramping unit contributes |
| Build effort | Lowest | Profile generator, profile editor, more tests |
| Storage | Output on the action | Plus a profile per action, copied to the plan on commit |

#### Questions to answer before choosing

1. Do operators need notice and ramp realism in a planning tool, or is "on from start to end" an accepted simplification?
2. Are run-up / run-down rates available for the units we care about?
3. If a unit is ramping, does it count towards EMX from the start of the ramp, or only once at full output?
4. Should operators be able to edit a generated profile, and should that be audited separately?

#### Keeping the decision open (no regret)

A flat block is a profile with the same value in every half-hour. With the single contribution function (§6.1) in place from Phase 1, choosing Option B later means changing that function, adding profile storage and building the editor. Nothing else changes.

---

## 7. Comparing options

The main reason for having several drafts is choosing between them. **Day one** has one sandbox, so comparison is limited to **pinning one previous state** (§9.8). **Phase 2** brings the comparison table and the combined preview below, alongside multiple named drafts.

### 7.1 Comparison table (Phase 2)

Select two or more drafts and open **Compare**. Drafts are columns, with the current plan as the first column.

| Row | Content |
|---|---|
| Per area (Margin, each reserve, Response, Inertia, Voltage) | Worst headroom over the horizon, and how it changes vs the current plan. Red if still short |
| Half-hours still short | Count across all areas |
| Units / MW added | Counted once per unit |
| Indicative cost | From unit price data. **Labelled indicative**: prices are placeholders until real offer data is integrated |
| Would clash | Units already committed elsewhere, so this draft would be rejected as it stands (D18) |
| Warnings | Gate closure / notice warnings at the default effective time |
| For a draft with loaded units | Shown as a change against the commitment it replaces |

It is computed in the browser from the same overlays. With multiple scenarios (§10) it extends from drafts × areas to drafts × areas × scenarios.

### 7.2 Combined preview (Phase 2, read-only)

Select two or more drafts and choose **Preview together**. You get one extra overlay, "A + B", plus a column in the comparison table.

- It is **read-only and never stored**. It does not create a draft, so the "no drafts built on drafts" rule still holds.
- A unit that appears in both drafts is counted once. If its settings differ, the preview flags it and uses the first-selected draft's version, because committing both as they stand would be rejected (D18).

### 7.3 The moving baseline while comparing

- **Drift check at commit (Phase 1):** the sandbox records the impact it had when last edited (scenario, snapshot, plan version, per-area worst headroom). The commit dialog recomputes against the latest data and flags a **material change**, e.g. an area's status changes or headroom moves by more than a configurable threshold.
- **Freeze market data (optional, later):** hold the display on one market snapshot while weighing options, with a banner saying so. Commit always validates against the latest data. (Renamed from "pin a snapshot" so it isn't confused with the sandbox **pin**.)

### 7.4 Dashboard preview (day one, D13)

The sandbox's impact is shown on the **dashboard** as well as the charts, from day one. Each tile shows the current-plan figure and the with-sandbox figure, computed with the same overlay calculation. How Dashboard 2 shows it should follow Dashboard 2's own design spec.

---

## 8. Roles and permissions

| Action | Owner | Shared with (view) | Other operator | Senior operator | Viewer | Admin | From |
|---|---|---|---|---|---|---|---|
| Use own sandbox (edit, clear, pin, commit) | ✅ ² | — | — | — | ❌ | — | Phase 1 |
| See another operator's sandbox | — | — | ❌ | ❌ (D28) | ❌ | ❌ | Phase 1 |
| Edit (load + supersede) a commitment | ✅ | ❌ | ❌ | ✅ ³ | ❌ | ✅ | Phase 1 |
| Withdraw a commitment | ✅ | ❌ | ❌ | ✅ ³ | ❌ | ✅ | Phase 1 |
| See the committed plan, its history and blame | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Phase 1 |
| Change planning policy (reserve %, requirement rules) | — | — | ❌ | ❌ | ❌ | ❌ ⁴ | Phase 1 |
| Edit contracted values / constraint overrides | — | — | ? | ? | ❌ | ? | Phase 1 (C17) |
| Named drafts: create, edit, discard, restore, delete | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | Phase 2 |
| See a named draft & overlay | ✅ | ✅ | ❌ | ❌ ¹ | ❌ | ✅ | Phase 2 / 3 |
| Share / unshare | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Phase 3 |
| Duplicate, compare, preview together | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | Phase 2 / 3 |

¹ Option: senior operators see all open drafts (D7).
² Option: commit requires senior approval (D4).
³ Covers the case where the owner has gone off shift (D6). The senior loads the commitment into **their own** sandbox. A reason is mandatory.
⁴ Only the dedicated **policy owner** role can change planning policy: not generic admins, not senior operators. Changes are versioned, take effect from a stated time (never retroactively), are audited, and push a live event so every screen shows that the policy changed.

---

## 9. Day one: the sandbox

### 9.1 What it is

Each operator has **one private working area**, the sandbox. They add and remove candidate units and see the impact immediately as dotted lines on the charts and as with-sandbox figures on the dashboard, across all operational areas. When they commit, the selected units go into the committed plan, and the sandbox keeps whatever wasn't selected, ready for the next piece of work.

For the operator: one draft at a time, play freely, commit, carry on.

### 9.2 A sandbox is a restricted draft

A sandbox is **not a separate mechanism**. It is a draft (`kind = sandbox`) with restrictions:

| Restriction | Day one | Lifted in |
|---|---|---|
| One open draft per user per context (live, historical) | Enforced (partial unique index) | Phase 2 (multiple private drafts) |
| Private, never shared | Enforced | Phase 3 (sharing) |
| Committed units leave the sandbox | Behaviour of the commit command | Stays. In Phase 2 a named draft closes when fully committed |

It uses the same tables, the same `@modelling/calc` functions, the same overlay rendering and the same commit command as the full model. Moving to multiple drafts later means removing the one-per-user rule and adding UI, not changing the model.

**Do not** implement the sandbox as a list held only in UI state, or as a separate "sandbox" table. Both would have to be thrown away in Phase 2.

### 9.3 What stays exactly the same on day one

The hardest part of the architecture is the committed plan, and the sandbox does not simplify it. All of these are required on day one:

- Immutable plan actions with plan versions (§5.1), and audit of every command.
- Blocking overlapping commitments for the same unit, enforced by the database and safe against concurrent commits (§5.2).
- **Supersede** and the **effective-time split** (§4.3, §4.4), because operators still need to amend committed actions.
- Live events for **plan** changes, so every operator's solid lines update when anyone commits.
- The **scenario seams** (§10.4).

### 9.4 What day one leaves out

- Sharing, "Shared with me", share permissions and desk shares.
- The draft list in the sidebar, draft colours, and per-draft show/hide toggles.
- Discard, restore, delete and duplicate.
- The "in N other drafts" indicator.
- Live events for drafts (`draft.*`). Plan events (`plan.*`) remain.
- The comparison table and combined preview (Phase 2).

### 9.5 Required on day one

1. **Persisted server-side.** "Temporary" means "committed units leave", not "lost on refresh, reload or new market data". Losing work to a page reload would damage operator trust.
2. **Clear sandbox.** One command to empty it without committing.
3. **Partial commit (D15).** The operator selects which sandbox units to commit. Those go into the plan, and **the rest stay in the sandbox**. The default is commit all.
4. **Commit dialog.** Name and description for the commitment, an effective time per amended unit (default next half-hour), warnings to acknowledge, clashes, impact against the current baseline, and a flag if it has changed since the sandbox was last edited.
5. **Load from plan (Edit).** Load a commitment into the sandbox to amend it, committed as a supersede. Warns if the sandbox isn't empty (§4.3).
6. **Pin** one previous state, with a "pinned vs now" panel (§9.8).
7. **Dashboard.** Tiles show the sandbox's impact alongside the current plan (§7.4).

### 9.6 Sandbox lifecycle

```
                    add units  /  Edit (load from plan; warn if not empty)
    [ Empty ] ─────────────────────────────────────────────────────► [ Has work ]
        ▲                                                               │  │  │
        │ Commit all                                                    │  │  │ Pin (display only)
        ├───────────────────────────────────────────────────────────────┘  │  ▼
        │ Clear                                                            │ (reference line)
        └──────────────────────────────────────────────────────────────────┘
                                                Commit selected → stays in [ Has work ] with the unselected units
```

### 9.7 What commit does to the sandbox (confirmed)

The sandbox brief left a choice between removing committed actions from the sandbox and closing it to open a new one. The confirmed approach is a third option, which keeps the audit trail clearest:

- The **selected actions move into a new commitment record**: a draft row with `kind = draft`, `status = committed`, named in the commit dialog, with `source = this sandbox`. Plan actions point at this record.
- The **sandbox row stays open** with the unselected units. It keeps a stable identity, and the one-per-user index is never briefly violated.

Why: a commitment must never change after commit (I4). If plan actions pointed at the sandbox row, which keeps changing, that invariant would break, and the Committed tab could no longer group units by commitment.

### 9.8 Pin: day-one comparison

The main value of multiple drafts is comparing competing options. With one sandbox, the operator would have to swap units in and out and remember the numbers. Day one mitigates this with a **pin**:

- **Pin** keeps the current sandbox impact as a faded reference line on the charts, while the operator keeps editing.
- **One pinned state per user.** Pinning again replaces it.
- A small **"Pinned vs now" panel** shows per-area worst headroom for both. This is the confirmed day-one form of comparison. The full comparison table comes in Phase 2.
- It is **display state only**: stored per user, not a draft, never committable.
- It is **not recomputed** when data changes. It is a recorded picture of the moment it was pinned, labelled with its time, and the panel shows when it has become stale.

Phase 2 replaces the pin with real multiple drafts and the comparison table.

### 9.9 Path to Phases 2 and 3

| Phase | Main change |
|---|---|
| 2: multiple private drafts | Drop the one-per-user index. Add named drafts (`kind = draft`), sidebar list, colours, show/hide, discard / restore / delete / duplicate, comparison table, preview together |
| 3: sharing | Add `draft_shares`, desk shares, draft live events, read-only view, duplicate to own |

Multiple private drafts come before sharing, because comparing options is far more valuable to operators than sharing them.

---

## 10. Scenarios (future): design for it, don't build it

### 10.1 What a scenario is

A **scenario** is a coherent set of input variables describing one plausible future state of the system: demand, wind and solar forecasts, and the requirements derived from them (reserve, response, inertia, area requirements, and so on). Every tile, chart and margin figure is calculated against a scenario. Phase 1 has exactly one live scenario ("central").

Two things vary independently:

| | Drafts | Scenarios |
|---|---|---|
| What varies | What **we** do (unit commitment) | What the **world** does (forecasts, requirements) |
| Who creates them | Operators | Mainly a scenario generator |
| Stored as | Intent (units, times, settings) | A coherent bundle of input values |

```
result = evaluate(scenario,      policy,        market snapshot,  committed plan,   draft)
                  input values   global rules   facts             what we've done   what we might do
```

Because drafts store intent, the same draft can be evaluated against any scenario unchanged. Multi-scenario working is therefore a grid: **drafts × scenarios**.

### 10.2 Where scenarios come from

Mostly from a **scenario generator**. A scenario is only useful if it is:

1. **Credible.** The combination of values is plausible together. Variables are correlated (wind, temperature, demand), so values must never be mixed across scenarios or edited one variable at a time.
2. **Decision-relevant.** It stresses the system in a way that calls for a distinct set of actions. Two scenarios that lead to the same actions add nothing.

Credibility and distinctness are the generator's job. The tool **consumes** scenarios and does not generate them.

A lesser, second source: **manual what-if scenarios**, where an operator applies an alternative profile (e.g. a different wind percentile). These must be labelled as user-defined and not credibility-assured. (Renamed from the brief's "manual sandbox scenarios" so they aren't confused with the operator's sandbox.)

### 10.3 Future capabilities (not to build now)

- Evaluate one draft against several scenarios and see impacts per area per scenario.
- Comparison table extended to drafts × areas × scenarios.
- Identify **robust options**: drafts that satisfy requirements in more than one scenario.
- Feedback to the generator: if the same draft clears two scenarios, they are not decision-distinct.

### 10.4 Seams to build in now (Phase 1, cheap, no regret)

1. **Scenario is a first-class entity with exactly one instance** ("central"). Forecasts and requirements carry a scenario id.
2. **Separate facts, input values and policy.** PN, MEL, MIL and standing data are facts and stay in the market snapshot. Demand, renewable forecasts and requirement **values** belong to the scenario. Reserve % and requirement **rules** are **planning policy**: global config, applied to every scenario. **Demand moves out of `market_sp`.**
3. **The scenario and the policy are explicit arguments to `@modelling/calc`** (§6.1, I9). This is the most important seam, the same pattern as D14.
4. **Baseline cache keyed by (scenario, policy, snapshot, plan version).**
5. **The committed plan is scenario-independent.** Each plan event records the reference scenario and policy version it was validated against (I10).
6. **Impact results keyed by scenario** wherever they are computed or cached: overlays, the pin, the drift check, and the commit-time impact in the audit record.
7. **Scenarios are imported, versioned and read-only.** A new generator run creates new rows rather than editing old ones, the same immutability principle as plan actions.

How each input is classified:

- **Reserve %** is global **planning policy**: versioned, audited, the same for every operator and scenario.
- **Requirement rules** are policy too.
- **Requirement values** entered by operators (Requirements screen) are inputs of the central scenario with `source = manual`. Later a generator may supply them per scenario.
- **Contracted values** are **facts** (contracts that exist): global, audited availability data alongside SR/QR services. Not scenario inputs.
- **Constrained values** are **manual availability overrides**: global and audited in Phase 1. If scenarios are ever allowed to vary availability (D21), constraints are the obvious first candidate.
- **Historical mode** uses an **outturn** scenario (`source = actual`): actual demand and renewables, plus the requirement values in force at the time, recovered from retained central-scenario versions. Missing records show as unavailable.

### 10.5 Not to build now

- Multi-scenario UI, a scenario selector, or scenario management screens.
- Weighting, probabilities or expected values across scenarios.
- Searching or optimising for options that satisfy several scenarios.
- Integration with a scenario generator.

---

# Part B: Reference implementation

This part describes **one way** to build Part A. It will be shaped by organisational standards, existing platforms and internal data feeds.

## 11. Assumptions

| Area | Assumption in this document | Likely in a real system |
|---|---|---|
| Market data source (facts) | Data submitted by **market participants** (PNs, MELs, dynamic and standing data), received directly from source | Same |
| Scenario source (input values) | One "central" scenario: current demand forecast plus operator-entered requirement values (`source = manual`). An "outturn" scenario for historical mode | Scenario generator output (§10) |
| Planning policy | Global config table (reserve %, requirement rules), changed only by the policy owner role | Same, owned by an operational authority |
| Availability data | Global tables for contracted values and constraint overrides, edited on the Requirements screen | Contract and outage systems feeding the same tables |
| Database | PostgreSQL | Organisation's standard relational database. The no-overlap rule (I3) needs equivalent support |
| Live updates | Server-Sent Events | Organisation's messaging / push standard |
| Front end | Web app (e.g. Next.js / React) | Organisation's front-end standard |
| Hosting | Not specified | Organisation's platform |
| Identity | OIDC SSO (e.g. Entra ID) | Organisation's identity provider |

## 12. Components

### 12.1 Component diagram

```mermaid
flowchart LR
  subgraph Client["Browser: web app"]
    UI["UI components"]
    Cache["Client cache<br/>(server data)"]
    Calc1["@modelling/calc<br/>overlays, pin, comparison"]
    UI <--> Cache --> Calc1 --> UI
  end
  IdP["Identity provider (SSO)"]
  subgraph Server["Application tier"]
    API["Planning API<br/>commands + queries"]
    RT["Live events (SSE)"]
    Calc2["@modelling/calc<br/>baseline, commit checks"]
    Ingest["Market-data ingestion"]
    ScIn["Scenario import"]
    API --- Calc2
  end
  DB[("PostgreSQL<br/>drafts, plan actions, plan events,<br/>scenarios, policy, snapshots, audit")]
  Feed["Market participants<br/>(PN, MEL, unit data)"]
  Gen["Scenario source<br/>(central forecast now,<br/>generator later)"]
  Client -- "sign in" --> IdP
  Client -- "HTTPS + token" --> API
  RT -- "events" --> Client
  API <--> DB
  Ingest --> DB
  ScIn --> DB
  Ingest -- "snapshot.created" --> RT
  ScIn -- "scenario.created" --> RT
  API -- "plan.* (draft.* from Ph. 3)" --> RT
  Feed --> Ingest
  Gen --> ScIn
```

### 12.2 Components

| Component | Responsibility |
|---|---|
| **Web client** | The operator UI. A client cache of server state. Computes overlays, the pin and (Phase 2) comparison locally. Edits are applied optimistically and confirmed by the server |
| **Planning API** | Commands (sandbox edits, clear, load, commit, withdraw, pin; later drafts and shares), queries (plan, history, blame, baseline). Enforces permissions, invariants and effective-time rules. Writes audit records. Publishes events |
| **Live events** | Pushes events to connected clients. SSE is enough because all writes go through the API |
| **Market-data ingestion** | Receives the data market participants submit (PNs, MELs, dynamic and standing data) and writes immutable snapshots on a schedule (e.g. every 5 minutes) |
| **Scenario import** | Writes immutable scenario rows. One central scenario until multi-scenario working |
| **`@modelling/calc`** | Pure functions with explicit scenario and policy inputs: contribution, baseline, overlay (including loaded-unit replacement), pin impact, comparison, status, time helpers. Golden-tested |
| **PostgreSQL** | System of record. Enforces I3 with an exclusion constraint and I8 with a partial unique index |
| **Identity provider** | SSO, user id, role and desk claims |

### 12.3 PostgreSQL or Firestore (D1)

| Criterion | PostgreSQL + API | Firestore + security rules |
|---|---|---|
| Time to first version | Medium | **Fast** |
| **Enforce "no overlapping commitments" (I3)** | **Native**: exclusion constraint, race-free | Not native. Needs per-unit lock documents and careful transactions |
| One sandbox per user per context (I8) | Partial unique index | Document id = user id + context |
| Atomic supersede across many rows | One SQL transaction | Possible, with document-count limits |
| History / blame queries | SQL over plan actions | Needs denormalisation or export |
| Permission enforcement | API + row-level security | Security rules |
| Live updates | Needs an SSE layer | **Built in** |

**Recommendation:** PostgreSQL + API. The plan model (§5) leans heavily on constraints and multi-row transactions, which strengthens this choice. Firestore remains possible for a throwaway pilot.

---

## 13. Physical schema

**`users`**: `id`, `idp_subject` (unique), `display_name`, `email`, `roles` (set of `viewer | operator | senior_operator | policy_owner | admin`), `desk`. Roles are a set because a policy owner may also be an operator.

**`drafts`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `kind` | enum `sandbox \| draft` | Default `sandbox`. Commitment records are `draft` |
| `name`, `description` | text | Required on commitment records (from the commit dialog) |
| `color` | text null | Phase 2 |
| `status` | enum `draft \| committed \| superseded \| withdrawn \| discarded` | `draft` = open. "Partly amended" is derived: committed with some plan-action rows closed |
| `owner_id` | uuid FK users | |
| `context`, `historical_snapshot_id` | enum `live \| historical`, uuid null | §4.5. Historical work uses the outturn scenario |
| `window_start`, `window_end` | timestamptz | Default window for new actions |
| `source_draft_id` | uuid null | The sandbox a commitment came from, or the draft a duplicate came from |
| `version` | int | Optimistic concurrency. Every write, including bulk action edits, carries `If-Match` |
| `committed_at`, `committed_by`, `commit_plan_seq`, `commit_snapshot_id` | null | |
| `closed_at`, `closed_by`, `closed_plan_seq`, `close_reason` | null | When it becomes superseded or withdrawn |
| `discarded_at`, `discarded_by` | null | Phase 2 |
| `last_evaluated` | jsonb null | Scenario, snapshot, plan seq, per-area worst headroom at last edit (drift check) |
| `created_at`, `updated_at` | timestamptz | |

Index **(day one only, I8):** `CREATE UNIQUE INDEX one_open_draft_per_user_context ON drafts (owner_id, context) WHERE status = 'draft'`: one live and one historical sandbox per user. Dropping it is the main model change for Phase 2.

**`draft_actions`**: `id`, `draft_id`, `bm_unit_id`, `start_at`, `end_at` (null = open-ended, exclusive), `output_mw`, `reasons` (`reason_code[]`, `CHECK (cardinality(reasons) >= 1)`), `operation_type`, `note`, **`replaces_plan_action_id`** (uuid null: set when loaded from the plan), **`effective_at`** (timestamptz null: for loaded or removed units; default next half-hour), **`is_removal`** (bool: a loaded unit the operator deleted, withdrawn at commit), `created_at`, `created_by`. `UNIQUE (draft_id, bm_unit_id)`.

**`plan_actions`** (the committed plan)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `draft_id`, `draft_action_id` | uuid FK | The commitment record and action |
| `bm_unit_id` | text | |
| `start_at`, `end_at` | timestamptz, end null = open-ended | Clipped to the effective time |
| `output_mw`, `reasons`, `operation_type` | | Copied from the action |
| `added_in_seq` | bigint FK plan_events | |
| `removed_in_seq` | bigint null FK plan_events | Set once, when closed |
| `split_from_id` | uuid null | Retained past part of a split row |
| `delivery_status` | enum null | Reserved for D19 |

Constraints:
- **No overlap (I3):** `EXCLUDE USING gist (bm_unit_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (removed_in_seq IS NULL)` (requires `btree_gist`). Two simultaneous commits for the same unit can't both succeed.
- **Immutability (I2):** no UPDATE grant except through a function that sets `removed_in_seq` from null. No DELETE grant.

**`plan_events`**: `seq` (bigserial = plan version), `at`, `actor_id`, `type` (`commit | supersede | withdraw`), `draft_id` (the commitment), `reason`, `changes` (jsonb: each closed row, its effective time and replacement), `acknowledged_warnings` (jsonb), **`reference_scenario_id`**, **`policy_version`**, `impact` (jsonb: per-area impact at commit, keyed by scenario). Append-only.

**`commit_unit_snapshots`**: `draft_id`, `bm_unit_id`, `mel`, `sel`, `ndz`, `mzt`, `mnzt`, `price_to_sel`, `price_to_mel`.

**`sandbox_pins`**: (`owner_id`, `context`) PK, `pinned_at`, `scenario_id`, `snapshot_id`, `plan_seq`, `impact` (jsonb: per-area series and worst headroom).

**`scenarios`**: `id`, `name`, `source` (`generated | manual | actual`), `generator_run_id` null, `generated_at`, `valid_from`, `valid_to`, `description`, `metadata` (jsonb), `status` (`active | superseded | retired`).
**`scenario_sp`**: `scenario_id`, `start_at`, `demand`, `wind`, `solar`, …
**`scenario_requirements`**: `scenario_id`, `start_at`, `area`, `requirement` (MW / GVAs / MVAr), `source` (`manual | generated | actual`). Operator-entered requirement values are central-scenario rows with `source = manual`.
**`planning_policy`**: `version` (PK), `reserve_pct`, `requirement_rules` (jsonb), `valid_from` (never earlier than the next half-hour: no retroactive change), `set_by` (policy owner), `reason`. Append-only: a change creates a new version. Applied to every scenario.

**Outturn scenario** (`source = actual`): built from recorded demand and renewables plus the requirement values of the central-scenario version in force at each half-hour. Where none exists, requirement values are null (shown as unavailable), never zero. Complete from go-live onwards, which needs every central-scenario version to be retained (C15).

**`market_snapshots`**, **`market_sp`** (`snapshot_id`, `start_at`, `has_confirmed_pn`; **no demand**), **`market_unit_sp`** (`pn`, `mel`, `mil`, `is_proxy`), **`bm_units`**: facts. Immutable, with retention for the latest N plus any referenced by a commit.

**`audit_events`**: `id`, `at`, `actor_id`, `entity_type`, `entity_id`, `action`, `before`, `after`, `request_id`. Append-only.

Phase 3: **`draft_shares`** (`draft_id`, `grantee_user_id` *or* `grantee_desk`, `permission`, `granted_by`, `granted_at`). Not created on day one.

Optional, only if chosen: **`draft_action_profiles`** / **`plan_action_profiles`** (D14). **`plan_action_instructions`** (D19).

**Related global data**, all append-only with `valid_from`, `set_by` and audit:
- `unit_redeclarations`, `unit_services` (scope: D9).
- **`area_contracted`**: `area`, `start_at`, `contracted` (facts).
- **`area_constraint_overrides`**: `area`, `start_at`, `constrained`, `reason` (manual overrides).

The Requirements screen writes to three places: requirement values to central-scenario inputs (`source = manual`), contracted values to `area_contracted`, and constrained values to `area_constraint_overrides`. The baseline cache key gains the availability-data version.

Baseline cache key: **(scenario_id, policy_version, availability_version, snapshot_id, plan_seq)**.

---

## 14. Key workflows

### 14.1 Edit the sandbox

```mermaid
sequenceDiagram
  participant U as Operator's browser
  participant A as Planning API
  participant D as PostgreSQL
  U->>U: Apply edit to local cache, overlay redraws instantly
  U->>A: PATCH /sandbox/actions/{aid}  (If-Match: version 7)
  A->>A: Caller owns the sandbox?
  A->>D: UPDATE … WHERE version = 7, insert audit row
  A-->>U: 200, version 8
```

No events go to other users: the sandbox is private. A version mismatch (the same user in two tabs) returns 409, and the client reloads.

### 14.2 Load a commitment into the sandbox (Edit)

`POST /sandbox/load {draftId | planActionIds[]}`. If the sandbox isn't empty and the request doesn't carry `confirmNonEmpty`, the API returns 409 with the current contents and the client shows the warning. Otherwise it copies each open plan action into the sandbox as an action with `replaces_plan_action_id` set and `effective_at` defaulting to the next half-hour. Nothing changes in the plan.

### 14.3 Commit (all or selected; supersede when loaded units are included)

```mermaid
sequenceDiagram
  participant U as Operator's browser
  participant A as Planning API
  participant D as PostgreSQL
  participant R as Live events
  participant All as All browsers
  U->>A: POST /sandbox/commit {actionIds?, name, description, reason?, acknowledgeWarnings?} If-Match (effective times are on the actions)
  A->>D: BEGIN; lock sandbox FOR UPDATE; lock loaded plan actions
  A->>A: Rights. Loaded plan actions still open? (else 409: changed by someone else)
  A->>A: Every effective time and new-unit start ≥ next half-hour? (hard: else 422)
  A->>A: Gate-closure / notice warnings
  alt warnings not acknowledged
    A-->>U: 409 {warnings} → confirm dialog
  else
    A->>D: Close loaded plan actions of selected (and removal) units, each from its own effective time (split spanning rows)
    A->>D: Create commitment record; move selected actions into it
    A->>D: Insert plan actions for the selected units' windows (no-overlap constraint)
    alt overlap with another commitment
      D-->>A: exclusion violation → ROLLBACK
      A-->>U: 409 {clashes: unit, commitment, owner} "Edit that commitment instead"
    else
      A->>D: Unit snapshots, plan_event (seq N+1, reference scenario, policy version, changes, impact), audit; COMMIT
      A->>A: Recompute baseline (scenario, policy, snapshot, N+1)
      A-->>U: 200 (sandbox now holds the unselected units)
      A->>R: plan.committed / plan.superseded {seq N+1}
      R-->>All: refetch baseline, solid lines update
    end
  end
```

### 14.4 Withdraw

`POST /commitments/{id}/withdraw {rows?: [{planActionId, effectiveAt?}], reason, acknowledgeWarnings?}`. Withdraws the whole commitment or selected rows, each from its own effective time (default next half-hour), splitting where needed, with no new actions. Emits `plan.withdrawn`.

### 14.5 Pin

`PUT /sandbox/pin` stores the impact the client has just computed (with the scenario, snapshot and plan version it was computed against). `DELETE /sandbox/pin` clears it. Display only, and audited like any other command.

### 14.6 New market data or scenario run

Ingestion writes a snapshot and emits `snapshot.created`. Scenario import writes a new scenario version and emits `scenario.created`. A planning-policy change (policy owner only) creates a new version that takes effect from its stated time, never retroactively, and emits `policy.changed`, so every screen shows a "policy changed" notice. Changes to availability data emit `availability.changed`. The API computes the baseline for (scenario, policy, snapshot, plan version). Clients refetch, and overlays recompute. The sandbox, drafts and plan are untouched. The pin is not recomputed (§9.8).

---

## 15. API and events

**Day one (Phase 1)**

| Method & path | Purpose |
|---|---|
| `GET /me` | Current user, role, desk |
| `GET /sandbox?context=live\|historical` · `PATCH /sandbox` | Read sandbox / update name, window (`If-Match`) |
| `POST /sandbox/actions` · `PATCH/DELETE /sandbox/actions/{aid}` | Units (bulk add carries `If-Match` too) |
| `POST /sandbox/clear` | Empty without committing |
| `POST /sandbox/load` | Edit: load a commitment or plan actions (§14.2) |
| `POST /sandbox/commit` | Commit all or selected units, supersede when loaded (§14.3). Live sandbox only: rejected for historical |
| `PUT / DELETE /sandbox/pin` | Pin (§14.5) |
| `GET /commitments` · `GET /commitments/{id}` | Committed records (Committed tab) |
| `POST /commitments/{id}/withdraw` | Withdraw (§14.4) |
| `GET /plan?version=N` or `?at=…` · `GET /plan/blame?unit=…&at=…` · `GET /plan/events?since=N` | Plan, blame, history |
| `GET /scenarios/current?context=…` · `GET /policy/current` | Central (or outturn) scenario · planning policy |
| `PUT /policy` | Change planning policy: new version from a stated time, audited (policy owner role only) |
| `PUT /availability/contracted` · `PUT /availability/constraints` | Edit contracted values / constraint overrides: new version, audited (who may: C17) |
| `GET /snapshots/latest` · `/snapshots/{id}` | Facts |
| `GET /baseline?scenario=…&policy=…&snapshot=…&planSeq=…` | Baseline and per-half-hour committed units |
| `GET /audit?entity=…&id=…` | Audit trail |
| `GET /events` (SSE) | Live events |

**Phase 2** adds `/drafts` (create, read, update, duplicate, discard, restore, delete, commit, load), working the same way as the sandbox endpoints. Comparison and the combined preview are client-side.
**Phase 3** adds `/drafts/{id}/shares`.

**Events:** day one `plan.committed`, `plan.superseded`, `plan.withdrawn`, `snapshot.created`, `scenario.created`, `policy.changed`, `availability.changed`. From Phase 3 also `draft.created`, `draft.updated`, `draft.deleted`, `draft.shared`, `draft.unshared`. Ids and versions only. Clients refetch what they need.

---

## 16. Front end

**Day one**

| Area | Change |
|---|---|
| Client state | Server-backed cache with optimistic updates |
| Time | All windows are real times (UTC), displayed as settlement date + SP |
| Sidebar | Signed-in user. **Sandbox panel** (unit count, Clear, Pin). Committed list with **Edit** and **Withdraw** |
| Sandbox table | Shows the sandbox. Reasons as a multi-select. Checkboxes for partial commit (default all). Loaded units marked "editing committed", removed loaded units struck through |
| Commit dialog | Name and description, effective time per amended unit (default and earliest = next half-hour), warnings to acknowledge, clashes, drift since last edit |
| Edit on a committed draft | Loads it into the sandbox, with a warning if the sandbox isn't empty |
| Charts | One sandbox overlay (loaded units drawn as replacements). Faded pinned line |
| Pinned vs now panel | Per-area worst headroom, pinned and current, with the pin's time |
| Dashboard | Tiles show current-plan and with-sandbox figures (§7.4) |
| Config | Reserve % and requirement rules are global planning policy, editable only by the policy owner. Every screen shows a notice when policy changes |
| Requirements screen | Requirement values edit the central scenario (`source = manual`). Contracted values edit global availability facts. Constrained values edit global availability overrides. All audited |
| Historical mode | A separate historical sandbox, evaluated against the outturn scenario. **Commit disabled.** Requirements shown as unavailable where no record exists |
| Committed tab | Groups by commitment. Per-reason cards count a unit under each reason, with a note that totals count it once |
| Data loading | Market data, scenarios and the baseline come from the server. Subscribe to plan, snapshot, scenario, policy and availability events |

**Phase 2:** draft list, colours, show/hide, discard / restore / delete / duplicate, comparison table, preview together. **Phase 3:** share controls, "Shared with me".

---

## 17. Non-functional design

| Concern | Approach |
|---|---|
| **Performance** | Overlays, pin, dashboard figures and comparison in the browser (< 50 ms typical). Baseline cached per (scenario, policy, snapshot, plan version). Live propagation < 2 s |
| **Availability** | Stateless API (≥ 2 instances), highly available database with point-in-time recovery. Read-only fallback with a banner if the API is unreachable |
| **Security** | TLS, SSO tokens, row-level security, least-privilege roles, no UPDATE/DELETE on plan and audit tables. Plans are operationally sensitive |
| **Audit** | Plan actions, plan events and audit events are append-only. Retention agreed with compliance |
| **Observability** | Commit latency, clash and warning rates, ingestion and scenario freshness, alerts on stale data |
| **Testing** | Golden tests for the calculation library (baseline, overlay, loaded-unit replacement, dedup, clock-change days, scenario passed explicitly). Database tests for the no-overlap constraint, the one-sandbox index and split logic. Multi-user end-to-end tests: simultaneous commits of the same unit (exactly one succeeds), owner and senior loading the same commitment (the second commit is rejected), partial commit with loaded units, one commit amending rows at different effective times plus new units |

---

# Part C: Delivery plan

## 18. Phases

The phases follow the sandbox brief's release plan. The earlier build steps are folded into Phase 1 as sub-steps. Sizes are relative (S/M/L), to be estimated once the open decisions in §19 are resolved.

| Phase | Scope | Exit criteria | Size |
|---|---|---|---|
| **0. Decide** | Resolve open decisions and the remaining open items (§19.3). Confirm platform, identity provider, data feeds, hosting. Start operator sign-off on D20 | Architect + product owner sign-off | S |
| **1. Day one: sandbox** | | | **L** overall |
| 1a. Groundwork (no back end) | Real-time (UTC) action model. Build `@modelling/calc` with golden tests. Single contribution function (D14 seam). **Scenario and planning policy as explicit inputs, one central scenario, facts separated from input values and policy** (§10.4). Reasons as a list | Golden tests pass for baseline, overlay, dedup and clock-change days | M |
| 1b. Back end and committed plan | Database, Planning API, SSO. **Persisted sandbox** (one per user per context): clear, partial commit, load from plan (Edit, row level), pin with "pinned vs now", drift check, **dashboard with-sandbox figures**. `plan_actions` / `plan_events`, supersede, withdraw, per-row effective times and warnings, no-overlap constraint, live plan events. Market-data ingestion, scenario tables (central + outturn), planning policy with the policy owner role, availability data (contracted values, constraint overrides). Plan-at-version and blame queries. Audit | Simultaneous commits of the same unit: one succeeds. Edit never produces a gap. Withdraw never changes the past. Refresh never loses sandbox work | L |
| 1c. Harden and roll out | Observability, security review, load and disaster-recovery tests, operator UAT, shadow run | UAT sign-off. Runbook written | M |
| **2. Multiple private drafts** | Drop the one-per-user index. Named drafts, sidebar list, colours, show/hide, discard / restore / delete / duplicate. **Comparison table and preview together** | Operators compare two options side by side across all areas | M |
| **3. Sharing** | `draft_shares` (users and desks), read-only view, duplicate to own, draft live events, permissions | Two users on two machines share and see updates < 2 s | M |
| **4. Enhancements** (optional) | Commit approval, review comments, history and blame UI, freeze market data, instruction/delivery tracking (D19), unit profiles (if D14 = B), multi-scenario capabilities (§10.3), a practice plan for training (D10) | Per feature | — |

## 19. Decisions and flagged conflicts

### 19.1 Decisions

Status: **Adopted** = built into this design. **Proposed** = recommended, awaiting agreement. **Open** = needs an answer. **Sign-off** = adopted, pending operator confirmation, not blocking. **Partly decided** = part confirmed, part still open. **Retired** = merged into another decision. Conflicts resolved while merging the briefs are recorded in §19.2.

| # | Decision | Options | Recommendation | Status |
|---|---|---|---|---|
| D1 | Platform | PostgreSQL + API / Firestore | PostgreSQL + API (needed for the no-overlap constraint) | Open (architect) |
| D2 | Identity provider and role source | Organisation SSO / other | Organisation SSO, roles from groups | Open (architect) |
| D3 | What the committed plan means | One shared plan / per-desk plans | One shared plan | Open (operators) |
| D4 | Commit approval | Direct / senior approval | Direct, approval later if needed | Open (operators) |
| D5 | Conflicting commits | — | **Replaced by D18** | Closed |
| D6 | Who can edit or withdraw others' commitments | Owner only / owner + senior | Owner + senior (via their own sandbox), reason mandatory | Open (operators) |
| D7 | Supervisor visibility of open named drafts | Private unless shared / seniors see all | Private unless shared (see also D28) | Open (operators) |
| D8 | Share targets | Individuals / individuals + desks | Both. Desk shares follow desk membership | Proposed (Phase 3) |
| D9 | Scope of redeclarations and SR/QR services | Global / per draft / per user | Global, audited. Contracted values and constraint overrides already get this treatment (C12) | Open (operators) |
| D10 | Historical-mode work | Commits to a separate practice plan / never committable | **Historical sandboxes can't commit at all on day one.** They are for analysis and replay, and the pin covers comparison. A practice plan for training can be considered in Phase 4 | Decided |
| D11 | Snapshot cadence and retention | e.g. 5 min, keep 24 h + referenced | As suggested. Retention for historical replay: see C15 | Proposed |
| D12 | Availability target | Business hours / 24×7 | 24×7 | Open (organisation) |
| D13 | Dashboard preview of sandbox impact | Day one / later | **Day one**: tiles show current-plan and with-sandbox figures (§7.4) | Adopted (C1) |
| D14 | How each unit's contribution is modelled (§6.4) | Flat block / unit profile | Answer the §6.4 questions first. Phase 1 keeps both possible | Open |
| D15 | Partial commit | Commit all only / commit selected units | **Selected units are committed. Unselected units stay in the sandbox. Default commit all** | Adopted (D26 merged into it) |
| D16 | How a commitment is amended | Uncommit → edit → recommit / atomic supersede | Atomic supersede, via load into the sandbox | Adopted |
| D17 | Effective time of plan changes | Whole window / from effective time | From an effective time **per amended row** (default next half-hour). New units use their own windows. **Hard:** never in the past. **Warnings:** gate closure, unit notice time | Adopted (C4) |
| D18 | Same unit in two commitments | Latest wins / highest wins / block | Block (database-enforced). Amend via Edit (supersede). Reasons as a list cover multi-purpose use | Adopted |
| D19 | Instruction and delivery tracking | Out of scope / leave room / build | Leave room in the model | Adopted (room only) |
| D20 | "Edit" on committed drafts | Reopen for editing (mutable) / Edit = load into sandbox + commit as supersede | **Load into the sandbox (warn if not empty), commit as supersede.** Familiar flow, immutable record | **Sign-off** (operators, non-blocking) |
| D21 | What a scenario may vary | Forecasts and requirements only / also unit availability (e.g. a trip) | Open. If availability is included, model a scenario as overrides on the base snapshot, using the same delta pattern as drafts. **Constraints are the obvious first candidate**: they are already manual overrides (C12) | Open |
| D22 | Scenario sources | Generated only / generated + manual what-if | Both. Manual what-if scenarios clearly labelled | Proposed |
| D23 | Reference scenario for commit validation | Always central / operator selects | Central in Phase 1. Recorded on every plan event | Proposed |
| D24 | Scenario lifetime | Per generator run / rolling | Per run, versioned. Old runs retained if referenced by a commit. **Central-scenario versions may need longer retention** for historical requirement values (C15) | Proposed |
| D25 | Day-one draft model | Sandbox (one per user) / full multiple drafts | Sandbox, built on the full draft model | **Proposed.** Needs stakeholder agreement. This document assumes adoption |
| D26 | What happens to uncommitted units on commit | — | **Retired: merged into D15** | Retired |
| D27 | Comparison on day one | None / pin one previous state | Pin one previous state. Comparison table and preview together in Phase 2 | Adopted |
| D28 | Can a senior see another operator's sandbox | No / yes, read-only | No on day one (consistent with D7) | Proposed |

### 19.2 Conflicts raised while merging the briefs (resolved)

| # | Conflict | Resolution | Applied in |
|---|---|---|---|
| C1 | Sandbox brief showed impact on the dashboard on day one; D13 said later | **Day one.** Dashboard tiles show with-sandbox figures | D13, F9, §7.4, §9.5, Phase 1b |
| C2 | D26 duplicated D15 | **Keep D15, retire D26** | D15, D26 |
| C3 | Loading a single committed unit vs whole commitments | **Row level.** Each sandbox action records the plan-action row it replaces. "Partly amended" status on the commitment | §4.1–4.3, §13 |
| C4 | Loading into a non-empty sandbox mixed new work and amendments under one effective time | **Effective time per amended row** (default next half-hour). New units use their own windows. Reasons are per action. **Warning only** | §4.3, §4.4, §13, §14, D17 |
| C5 | What commit does to the sandbox row | **Confirmed:** committed units go into a new immutable commitment record. The sandbox keeps the rest | §9.7 |
| C6 | Pin figures without a comparison table | **Confirmed:** "pinned vs now" panel on day one | §9.8 |
| C7 | Two meanings of "pin" | **Confirmed:** "freeze market data" for the snapshot hold | §7.3 |
| C8 | Two meanings of "sandbox" | **Confirmed:** "manual what-if scenarios" | §10.2, D22 |
| C9 | Requirements and reserve % vs scenarios | **Policy separated from values.** Reserve % and requirement rules are global planning policy, applied to every scenario. Operator-entered requirement values are central-scenario inputs (`source = manual`). Later a generator may supply values per scenario | §2, §3, §6.1, §10.4, §13 |
| C10 | Historical mode vs one sandbox per user | **One sandbox per user per context.** Historical mode uses an **outturn** scenario (`source = actual`). Historical sandboxes never commit to the live plan | I8, §4.5, §13, D10 |
| C11 | Phase numbering | **Confirmed:** Phase 1 sandbox (1a–1c), 2 multiple drafts, 3 sharing, 4 extras | §18 |
| C12 | Where contracted and constrained values go | **Contracted = facts**: global, audited availability data alongside SR/QR services (as D9). **Constrained = manual availability overrides**: global, audited in Phase 1. Constraints noted under D21 as the first candidate for scenario-varied availability | §2, §3, §6.1, §10.4, §13, D21 |
| C13 | Requirement values for the outturn scenario | **Requirements in force at the time**, recovered from retained central-scenario versions. Shown as **unavailable** where no record exists, never invented. Complete from go-live | §4.5, §6.2, §10.4, §13 |
| C14 | Who may change planning policy | A dedicated **policy owner** role (not generic admin). Senior operators can't. Changes are versioned, take effect from a stated time (never retroactively), audited, and push a live event | §2, §3, §8, §13–§16 |

### 19.3 Still open (raised by the latest resolutions)

| # | Question | Context | Current assumption in this document |
|---|---|---|---|
| **C15** | **Retention for complete history.** "History complete from go-live" (C13) needs every central-scenario version kept, but D24 keeps only versions a commit references. Historical replay also needs past market facts, and D11 keeps snapshots for only 24 h plus referenced ones | C13, D11, D24 | Not decided. Likely: keep every central-scenario version (or at least its requirement values) from go-live, and either keep market snapshots longer or re-ingest past facts from source for replay |
| **C16** | **What "takes effect from a stated time" means for policy.** (a) A wall-clock switch-over: until the stated time every half-hour uses the old policy, and after it every half-hour uses the new one. (b) By delivery time: half-hours starting at or after the stated time use the new policy, earlier ones keep the old, and both are visible immediately | C14 | Assumes **(b)**, with the stated time no earlier than the next half-hour. Historical replay uses the policy in force at each half-hour. Needs confirming |
| **C17** | **Who may edit availability data** (contracted values, constraint overrides)? | C12, D9 | Not decided (§8 shows "?"). Likely operators with a mandatory reason, but it should be settled together with D9 |

## 20. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Calculation drift between browser and server | Different numbers on different screens | One calculation library, golden tests on both runtimes |
| Market data or scenario source limits or outages | Stale baseline | Server-side ingestion and import, `partial` status, staleness banner and alert |
| BST/UTC handling | Actions on the wrong half-hour | UTC storage, tested time helpers, clock-change tests |
| Day one without multiple drafts feels limiting | Operators compare options in their heads | Pin with "Pinned vs now". Phase 2 prioritised before sharing |
| Sandbox built as a shortcut (UI-only list or separate table) | Rewrite in Phase 2 | Sandbox is a draft row (`kind = sandbox`). Code review against §9.2 |
| Scenario seams skipped under time pressure | Redesign when scenarios arrive | Seams are in Phase 1a exit criteria (scenario passed explicitly, demand out of market data) |
| Operators surprised that Edit loads into the sandbox alongside existing work | Confusion about what a commit contains | Non-empty warning, "editing committed" marking showing each unit's effective time, D20 sign-off |
| Per-row effective times confuse operators | Changes take effect at unexpected times | Default next half-hour for every row. Effective time shown on each amended unit and in the commit dialog |
| A global reserve % change moves every operator's margin figures | Disagreement over margin figures | Communicate the change, show the policy version on charts, "policy changed" notice on every screen, policy owner role only |
| Blocking clashes frustrates operators who need a unit for several purposes | Workarounds | Reasons as a list. Edit-to-add-reason flow. Clash message names the commitment to edit |
| Effective-time warnings acknowledged by habit | Plans that can't be delivered | Warnings recorded in the audit trail and reviewed. Revisit making some hard rules after UAT |
| Loaded-unit overlay maths wrong (baseline − old + new) | Misleading dotted lines | Dedicated golden tests |
| Platform without exclusion constraints | Race conditions on commit | Make I3 support a requirement in D1 |

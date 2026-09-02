# Product wireframes

These are information and interaction contracts, not final visual styling.

## 1. Output inbox

Evidence task: decide what needs attention and why.

```text
┌ Agentic Loop Observatory ────────────────────────────────────────────────┐
│ Scope: all loops · Last 7 days · Synced 14:06:32 · 2 evidence gaps      │
├───────────────┬─────────────────────────────────────────────────────────┤
│ REVIEW        │ OUTPUTS                                                 │
│ Awaiting  12  │                                                         │
│ Needs work  3 │ Status   Output              PR      Age    Evidence    │
│ Accepted  31  │ Awaiting Retry policy        #184    2h     94% · 2 gaps│
│ Declined   4  │ Needs    Timeout handling     #181    1d     100%        │
│               │ Accepted JSON renderer        #179    2d     100%        │
│ LOOPS         │ Declined Auto-merge proposal  #173    4d     88% · 1 gap│
│ Delivery   18 │                                                         │
│ Evidence    9 │ Principal comparison: review status + readiness         │
├───────────────┴─────────────────────────────────────────────────────────┤
│ Awaiting review: 12 of 50 outputs in this scope. Prior 7 days: 9 of 44.│
└─────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Counts include denominator and active scope.
- Status always has a text label; color is redundant.
- Evidence coverage is a link to the gap register, not a decorative score.
- The default sort is review urgency, then age; users can switch to exact lookup order.

## 2. Output detail

Evidence task: determine whether this exact output version should be accepted.

```text
┌ ← Outputs   Add bounded retry policy                         Awaiting ───┐
│ Output v3 · Run 9e41 · DSL delivery-loop@0.4.0 · updated 12 minutes ago │
│ PR #184 OPEN · checks 7/8 · review requested · GitHub synced 1 min ago  │
│ [Open artifact] [Open PR] [Open in Phoenix]                            │
├─────────────────────────────────────────────────────────────────────────┤
│ REVIEW BRIEF                                                            │
│ Claim: retries are bounded, observable, and do not duplicate side effects│
│ Evidence: test report · diff summary · trace · evaluator result          │
│ Limitation: queue wait time is not instrumented                          │
├───────────────────────┬─────────────────────────────────────────────────┤
│ ACTION ITEMS          │ DECISION                                        │
│ □ Add timeout evidence│ [Accept] [Request changes] [Decline]             │
│ ✓ Validate backoff    │ Decline requires a reason. Decisions are append- │
│ □ Resolve failed check│ only and bound to output v3.                     │
├───────────────────────┴─────────────────────────────────────────────────┤
│ [Execution] [JSON evidence] [Decision history] [Telemetry coverage]     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Loop detail and declared-versus-observed flow

Evidence task: explain the path that produced the selected output and locate divergence or latency.

```text
┌ EXECUTION  Run 9e41                                  Total 12.1 s ─────┐
│ Edge legend: ━ observed  ─ declared  ╌ explicit dependency             │
│ Status: ✓ success  ! error  ○ declared/not observed  ◇ unmapped         │
│                                                                         │
│ DECLARED DSL              OBSERVED TRACE                                │
│ ┌──────┐  ┌──────┐        ┌──────┐ 42 ms                               │
│ │ plan │──│ code │        ━│ plan │━━━━━━━━┓                            │
│ └──────┘  └──────┘         └──────┘        ┃                            │
│              │                             ▼                            │
│           ┌──────┐                 ┌────────────┐ 8.4 s                 │
│           │ test │                 │ code agent │                       │
│           └──────┘                 └────┬───────┘                       │
│              │                          ├━ tool: read  85 ms             │
│           ┌────────┐                    ├━ LLM          6.8 s            │
│           │ review │                 ◇ formatter       190 ms            │
│           └────────┘                    └━ tool: patch  1.1 s            │
│              │                          ▼                            │
│           ┌────────┐              ○ test — declared, not observed       │
│           │ output │              ━ review 1.3 s ━ output 20 ms         │
│           └────────┘                                                  │
│                                                                         │
│ Finding: required `test` node has no mapped span. This is not proof that│
│ testing did not happen; instrumentation or execution evidence is absent.│
├─────────────────────────────────────────────────────────────────────────┤
│ Node selected: code agent · p50 7.9 s · this run 8.4 s · n=23 runs      │
│ Inputs [redacted] · outputs [artifact] · tokens 4,281 · status OK        │
└─────────────────────────────────────────────────────────────────────────┘
```

The graph defaults to one run. Comparison mode uses aligned small multiples for selected runs instead of overlaying many traces.

## 4. JSON evidence view

Evidence task: inspect exact structured output and understand its provenance.

```text
┌ JSON EVIDENCE  action-items.v2.json                          Valid ✓ ────┐
│ Source: output v3 · produced 13:54:08 · schema action-items@2.0          │
│ Transform: JSONPath $.items[*] · no rows omitted · refreshed 13:54:08   │
│ [Table] [Tree] [Raw] [Copy stable link] [Export]                         │
├─────────────────────────────────────────────────────────────────────────┤
│ State  Action                    Owner       Origin node   Evidence       │
│ Open   Add timeout evidence      unassigned  review        trace span ↗   │
│ Done   Validate backoff          agent:test  test          report.json ↗  │
│ Open   Resolve failed check      unassigned  output        GitHub check ↗ │
├─────────────────────────────────────────────────────────────────────────┤
│ Missing values: owner is missing for 2/3 items; shown as “Unassigned,”   │
│ not as an empty string.                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## 5. Telemetry coverage

Evidence task: determine which claims can and cannot be supported.

```text
┌ TELEMETRY COVERAGE  Run 9e41 ───────────────────────────────────────────┐
│ Required signals: 16 · observed 13 · redacted 1 · not instrumented 2   │
│                                                                         │
│ Signal              Status             Consequence          Repair      │
│ Node duration        Observed 5/5       Comparable           —           │
│ Queue wait time      Not instrumented   No wait-time claim   add span    │
│ Test node mapping    Not instrumented   Conformance unknown  add node ID │
│ Tool arguments       Redacted           Payload hidden       policy      │
│ Token usage          Observed 2/2       Cost view possible   —           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Responsive behavior

- On narrow screens, the inbox becomes a list and output detail opens as a full page.
- Loop graph, node evidence, and gap register stack in that order; labels never shrink below readable size.
- A textual execution outline is always available as an accessible equivalent to the graph.
- Essential source, status, and decision controls do not depend on hover.

## Empty, stale, and error states

- No outputs: explain how to ingest a first output and show the event contract.
- No trace linked: preserve review functionality; identify the exact missing join key.
- Phoenix unavailable: show last successful trace retrieval and keep cached evidence visible.
- GitHub unavailable: show cached PR snapshot and timestamp.
- No DSL mapping: render the observed trace alone and state that conformance cannot be assessed.
- Conflicting decision: preserve both events and require an explicit resolving event.


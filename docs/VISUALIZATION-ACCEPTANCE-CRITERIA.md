# Visualization acceptance criteria

These criteria adapt the `ptw1255/Skill-Clean-Data-Presentation` contract to this product. Apply `PASS`, `FAIL`, or `N/A` to every applicable view. Any integrity failure blocks release.

## Evidence contract required for every visualization

```text
audience: reviewer or loop operator
question: the decision or comparison the view supports
claims: what the title, annotations, and emphasis assert
measures: definitions, units, denominator, aggregation
comparison: prior run, benchmark, DSL, cohort, or threshold
scope: loop, output set, repository, and time window
source: local store, GitHub, Phoenix, artifact, and retrieval time
transformations: filters, joins, derivations, graph construction
uncertainty: missing, delayed, redacted, unmapped, or partial evidence
delivery: viewport, keyboard flow, export, accessible equivalent
```

## Blocking integrity gates

| ID | Acceptance criterion |
| --- | --- |
| V-I01 | Every value, node, edge, and status is traceable to a named source field or documented calculation. |
| V-I02 | Units, denominators, scope, aggregation, and time windows are visible or unambiguous. |
| V-I03 | Visual magnitude is proportional; duration bars and timelines use honest scales and disclose breaks. |
| V-I04 | Comparable runs, nodes, and cohorts use common definitions and scales. |
| V-I05 | Relevant prior state, target, distribution, or benchmark appears within the comparison surface. |
| V-I06 | Zero, missing, redacted, unavailable, not instrumented, not observed, and not applicable are distinct. |
| V-I07 | Derived values expose their inputs and transformation; filters and graph rules are reproducible. |
| V-I08 | Sequence, dependency, declaration, observation, and causation use distinct edge semantics. |
| V-I09 | Titles, annotations, sorting, and emphasis do not contradict or conceal the evidence. |
| V-I10 | A transformed JSON view always preserves access to exact raw data, schema, source, and truncation status. |

## Core interaction and analytical criteria

- The title answers a question or states a proportionate finding; it is not merely “Metrics” or “Dashboard.”
- The principal comparison fits within one eyespan. Cross-run comparisons use aligned small multiples or tables.
- Exact lookup uses a table or text-table. Time uses position on a common axis. Graphs are reserved for structure and flow.
- Evidence is more prominent than cards, gradients, icons, branding, and container chrome.
- Series, exceptional nodes, and important values are labeled directly when practical.
- Default sorting serves review urgency or analytical order; alphabetical order is reserved for lookup.
- Summary metrics lead to underlying evidence and never appear as isolated decorative KPIs.
- Notes, source, freshness, units, and caveats appear at the point of need.
- The same state, span kind, node type, and evidence status retain the same visual grammar across views.
- Filters disclose active scope, preserve a useful default state, and provide a clear reset.

## DAG and trace-specific criteria

- Render an edge legend in the first view.
- Use arrows only where direction has defined semantics.
- Never label a span tree as a DAG unless explicit non-tree dependencies are present.
- Distinguish `declared but not observed` from `observed failure` and `not instrumented`.
- Display unmapped observed spans; do not discard them to make the run appear conformant.
- Provide a textual execution outline with node name, kind, status, duration, and parent/dependency.
- Critical-path emphasis is allowed only when timestamps and dependency rules are complete.
- Comparison mode aligns repeated run graphs or node sequences; it does not create an unreadable overlay.

## JSON-specific criteria

- Select the default view from the evidence task and schema, not from visual novelty.
- Provide `Table`, `Tree`, and `Raw` when applicable; Raw is never hidden behind developer tools.
- Show schema validation state and validation errors beside the affected field/path.
- Preserve data types and precision. Do not stringify numbers for display and then sort lexically.
- Distinguish absent keys, `null`, empty strings, empty arrays, and zero.
- Show row/item counts and disclose filters, pagination, sampling, and truncation.
- Use color only for defined state or magnitude and pair it with text, shape, position, or line style.
- Provide copy/export of the exact source and a stable link to the selected path/view.

## Delivery criteria

- First render communicates the main result before hover or interaction.
- Essential evidence remains readable at the smallest supported viewport.
- Keyboard navigation, visible focus, semantic tables/headings, and accessible names pass verification.
- Tooltips supplement rather than contain essential values.
- Graph and chart views have concise summaries and detailed accessible equivalents.
- Light/dark mode, responsive layout, and export do not change values or hide provenance.
- Loading preserves known-good content; stale and failed refresh states are explicit.

## Required review output

```text
Clean Data Presentation Review
  result: PASS | CONDITIONAL | FAIL
  evidence task: <one sentence>
  integrity gates: <passed>/<applicable>
  core criteria: <passed>/<applicable>
  advanced criteria applied: graph | small multiples | micro/macro | none
  material changes: <what changed>
  unresolved findings: <criterion ID, evidence, repair>
  verification: <viewports, themes, keyboard, export, states>
```


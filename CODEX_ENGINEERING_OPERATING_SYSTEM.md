# Codex Engineering Operating System

> A reusable repository-level instruction set for safely turning rough ideas, architectural changes, feature requests, refactors, design reviews, bug reports, and cleanup requests into evidence-backed plans, bounded tickets, parallel implementation, regression validation, and documented outcomes.

---

# Codex Engineering Operating System

## How to Use This Document

Do not execute this entire document for every request.

Route the current task to the relevant workflow:

| Request | Workflow |
|---|---|
| IDEA / architectural suggestion | Architecture Change |
| APPLY EVERYWHERE | Semantic Migration |
| FIX | Bug Investigation |
| ADD FEATURE | Feature Delivery |
| CLEAN | Code Quality |
| DESIGN REVIEW | UI/UX Review |
| WEBMCP-ENABLE | WebMCP Integration |
| DATAFY | Data/DuckDB Workflow |
| DEPLOY + SMOKE | Release Validation |
| FINISH THE TICKETS | Ticket Execution |
| OBSERVE | Independent Regression Review |

For substantial work:
Discovery → Critique → Plan → Tickets → Canary → Implement → Integrate → Regress → Cleanup.

For trivial work:
Use the smallest safe workflow and do not create unnecessary process.

## 1. Purpose

Use this document as a standing operating contract for Codex or other coding agents working in an existing repository.

The user should be able to give short, natural prompts such as:

- “I had an idea: maybe this should use Pinia.”
- “Replace this pattern with the shared adapter and apply it everywhere.”
- “Clean this code up without changing behavior.”
- “Make the whole app feel more polished.”
- “This flow is broken; fix it everywhere the same bug exists.”
- “Add this capability and expose it through WebMCP too.”
- “Turn page data into DuckDB datasets and let me query it.”
- “Critique this implementation and improve whatever is justified.”

Do **not** treat those as blind implementation commands. Translate them into the appropriate workflow in this document.

The default objective is:

> **Understand first → prove current behavior → design the smallest correct change → validate on a representative slice → distribute bounded work → integrate → regress → document → clean up.**

---

# 2. Core Operating Principles

## 2.1 Existing behavior is a contract until explicitly changed

Before changing an existing path, identify its externally observable behavior. Preserve it unless the task explicitly requires a behavioral change.

Observable behavior may include:

- function inputs and outputs;
- public TypeScript interfaces and schemas;
- API request/response shapes;
- emitted events;
- URLs and route behavior;
- component props/events;
- Pinia/store state transitions;
- persisted browser data;
- IndexedDB/localStorage formats;
- DuckDB tables/views/query behavior;
- WebMCP tool names, inputs, outputs, and side effects;
- rendered UI states;
- loading, empty, error, and success states;
- keyboard/accessibility behavior;
- downloadable/exported formats;
- generated IDs and provenance;
- existing user data and saved workspaces.

If current behavior is not adequately tested, create **characterization tests** before the migration wherever practical.

## 2.2 “Apply everywhere” means semantically applicable everywhere

Never perform blind repository-wide search-and-replace solely because the user says:

> “all files”, “everywhere”, “replace all”, “use this throughout the app”, or similar.

Interpret the request as:

> Find every semantically applicable occurrence, classify variations, migrate the ones that should use the new pattern, preserve justified exceptions, and list anything intentionally left unchanged.

## 2.3 Prefer evolution over reconstruction

Unless rebuilding is explicitly requested or clearly necessary:

- preserve the existing application structure;
- extend existing abstractions before creating parallel systems;
- reuse existing DTOs, adapters, repositories, stores, renderers, and component conventions;
- prefer compatibility adapters over flag-day rewrites;
- avoid unnecessary dependency churn;
- minimize unrelated formatting/file movement;
- preserve git history readability.

## 2.4 Intent is more important than the suggested implementation

Treat implementation suggestions as hypotheses when appropriate.

For example:

> “I think we should use Pinia for this.”

means:

> Investigate whether Pinia is the correct repository-wide solution for this state pattern, compare it with the current architecture, propose the smallest justified migration, and retain exceptions where another solution is better.

If the proposed approach is weak, say so and implement the better solution if it still satisfies the underlying goal.

## 2.5 Evidence before abstraction

Do not introduce an abstraction because it sounds clean. Establish:

1. the duplicated or problematic pattern actually exists;
2. its variants are sufficiently similar;
3. the abstraction reduces complexity or enables a known requirement;
4. the abstraction has a stable responsibility;
5. migration cost is justified.

A useful default rule:

> Do not introduce a new generalized abstraction unless it removes/replaces at least two real implementations, protects a meaningful architectural boundary, or is required for a known upcoming capability.

## 2.6 Canary before propagation

For repository-wide changes:

1. inventory occurrences;
2. define the target contract;
3. migrate one representative vertical slice;
4. run focused tests;
5. inspect the resulting architecture and user behavior;
6. only then propagate the pattern.

## 2.7 Local-first and reversible by default

For browser/local-first applications:

- do not silently upload user data;
- preserve provenance;
- make persistence boundaries explicit;
- use adapters around IndexedDB, DuckDB-Wasm, File System Access, WebMCP, network APIs, etc.;
- keep destructive migrations reversible or versioned when practical.

## 2.8 Optimize for future agents too

A change is incomplete if future agents cannot determine why it exists.

Every nontrivial initiative should leave behind enough architectural evidence to understand:

- what problem existed;
- why this solution was selected;
- what alternatives were rejected;
- what invariants must remain true;
- what legacy paths remain;
- when compatibility code can be removed.

---

# 3. Recommended Repository Control Files

If equivalents do not already exist, create or adapt these rather than duplicating them.

```text
/
├─ AGENTS.md
├─ ARCHITECTURE_RULES.md
├─ CHANGE_LEDGER.md
├─ docs/
│  ├─ architecture/
│  ├─ decisions/
│  ├─ regressions/
│  └─ migrations/
├─ tickets/
│  ├─ active/
│  ├─ completed/
│  └─ deferred/
└─ tests/
   └─ golden-paths/
```

### `AGENTS.md`

Short operating instructions agents should read before editing.

Include:

- project commands;
- repo layout;
- architectural boundaries;
- testing requirements;
- generated-file rules;
- areas requiring extra caution;
- where decisions/tickets/regressions are recorded.

### `ARCHITECTURE_RULES.md`

Repository constitution containing long-lived invariants, for example:

- state ownership rules;
- Pinia/store conventions;
- component/data separation;
- API adapter rules;
- DTO/domain model boundaries;
- WebMCP conventions;
- local-first constraints;
- persistence abstraction;
- DuckDB ownership rules;
- block/rendering contracts;
- accessibility/browser support;
- error-handling conventions;
- provenance requirements.

### `CHANGE_LEDGER.md`

Append-only or chronologically maintained record of major initiatives.

Each entry should contain:

```text
Initiative
Date
Proposal
Problem/evidence
Decision
Affected patterns
Affected areas
Invariants
Tickets
Tests / regression evidence
Intentional behavior changes
Exceptions
Legacy paths remaining
Cleanup condition
Final outcome
```

### `tickets/`

Tickets should be small enough for a focused subagent and large enough to produce a coherent independently testable result.

### `tests/golden-paths/`

Maintain repository-level workflows that catch integration regressions.

---

# 4. Default Execution Lifecycle

Use this lifecycle for any meaningful change unless a narrower workflow below applies.

## Phase 0 — Parse the actual intent

Restate internally:

- user goal;
- suggested implementation;
- constraints;
- expected behavior;
- whether this is exploratory or directive;
- whether a repository-wide pattern is implied.

Do not ask unnecessary questions when the codebase can answer them.

## Phase 1 — Repository reconnaissance

Inspect relevant:

- architecture docs;
- package manifests;
- build/test config;
- entry points;
- route/page structure;
- stores/state;
- services/adapters;
- persistence;
- schemas/types;
- WebMCP tools;
- tests;
- existing implementations of the pattern.

Create an **occurrence map** rather than immediately editing.

For each occurrence record:

```text
location
pattern/variant
consumer(s)
data flow
dependencies
risk
migration candidate? yes/no/conditional
reason
```

## Phase 2 — Critique the proposal

Evaluate the change using:

| Dimension | Question |
|---|---|
| Correctness | Does it solve the actual problem? |
| Simplicity | Does it reduce conceptual complexity? |
| Reuse | Does it remove duplication? |
| Coupling | Does it improve ownership/boundaries? |
| Cohesion | Does each resulting module have a clearer responsibility? |
| Testability | Is the new design easier to isolate and verify? |
| Compatibility | What existing contracts could change? |
| Migration cost | How invasive is the proposal? |
| Performance | Does it alter runtime/memory/network cost? |
| Accessibility | Does it affect interaction or semantics? |
| Extensibility | Does it support known near-term capabilities? |
| Observability | Will failures become easier to inspect? |
| Security/privacy | Does it alter trust/data boundaries? |
| Local-first behavior | Does data remain where users expect? |

Classify the original proposal as one of:

- **ACCEPT** — proposed approach is justified;
- **ACCEPT WITH CHANGES** — goal is right, implementation should be adjusted;
- **LIMITED ADOPTION** — use it only in a subset of occurrences;
- **REJECT / ALTERNATIVE** — proposed implementation is inferior or unsafe; implement a better route to the same goal.

## Phase 3 — Define invariants and target contract

Before implementation, explicitly define:

- behavior that must remain unchanged;
- intentional behavior changes;
- public interfaces;
- persistence compatibility;
- schema/version expectations;
- source-of-truth ownership;
- module responsibilities;
- migration boundaries;
- non-goals.

## Phase 4 — Characterize current behavior

Where practical, add or identify tests for:

- current input/output;
- persisted state;
- key UI flows;
- critical APIs;
- WebMCP contracts;
- generated/exported artifacts;
- errors/empty states;
- representative edge cases.

For UI or workflow migrations, capture structured before-state evidence where useful:

```text
route
fixture/input
action
visible output
store state
network calls
persisted state
emitted events
WebMCP output
```

## Phase 5 — Build the migration plan and ticket graph

Break work into tickets with explicit dependencies.

Typical order:

```text
shared contract / types
        ↓
adapter or compatibility layer
        ↓
representative canary consumer
        ↓
canary regression validation
        ↓
parallel consumer migrations
        ↓
integration
        ↓
legacy cleanup
        ↓
full regression + docs
```

## Phase 6 — Canary implementation

Migrate one representative slice end-to-end.

Require:

- focused tests pass;
- behavior matches invariants;
- target abstraction is simpler in real code;
- no hidden coupling emerged;
- performance is acceptable;
- architecture still appears appropriate.

If canary evidence contradicts the design, revise the plan before propagation.

## Phase 7 — Parallel ticket execution

Use subagents where supported, but only after shared contracts stabilize.

Rules:

- non-overlapping ownership where possible;
- each subagent receives one bounded ticket;
- do not let each subagent redesign shared abstractions;
- shared-file edits belong to the integrator/coordinator unless explicitly coordinated;
- each ticket includes required tests and evidence;
- agents record deviations rather than silently inventing new patterns.

## Phase 8 — Integration

The integrator:

- resolves conflicts;
- verifies interface consistency;
- checks ticket acceptance criteria;
- reviews cross-feature behavior;
- ensures no partial migrations remain;
- ensures generated compatibility layers are still needed;
- updates the change ledger.

## Phase 9 — Adversarial regression

Do not merely prove the new code works. Attempt to prove it broke something.

Run applicable:

- typecheck;
- lint;
- unit tests;
- integration tests;
- build;
- Playwright/browser flows;
- golden-path workflows;
- saved-data reload tests;
- WebMCP tool tests;
- mobile/responsive checks;
- keyboard/accessibility checks;
- export/import round trips.

## Phase 10 — Cleanup and quarantine

Look for:

- dead imports;
- obsolete helpers;
- duplicate adapters;
- old implementations with no consumers;
- compatibility branches that can now be removed;
- stale feature flags;
- stale comments/docs;
- unreachable code;
- temporary migration scripts;
- tests only covering deleted behavior.

If deletion is not yet proven safe, **quarantine/document it** instead of guessing.

## Phase 11 — Final outcome report

Report:

```text
Original idea
Decision after review
What changed
Tickets completed
Important files/areas affected
Tests and regression evidence
Intentional behavior differences
Compatibility notes
Exceptions / not migrated
Remaining legacy code
Follow-up opportunities
```

---

# 5. Agent Roles

One agent can perform multiple roles on a small task. For large tasks, keep responsibilities distinct.

## 5.1 Coordinator / Orchestrator

Owns the initiative.

Responsibilities:

- interpret user intent;
- enforce this operating system;
- control scope;
- choose roles;
- maintain the dependency graph;
- prevent conflicting work;
- approve shared contracts;
- decide merge/integration order;
- produce final report.

Must **not** delegate architecture ownership independently to every subagent.

## 5.2 Scout / Repository Cartographer

Finds where the relevant pattern actually exists.

Produces:

- occurrence map;
- pattern variants;
- dependency graph;
- existing abstractions;
- likely edge cases;
- test coverage gaps;
- migration candidates and exceptions.

Does not perform broad implementation unless explicitly assigned afterward.

## 5.3 Critic / Architecture Reviewer

Challenges the proposal before implementation.

Looks for:

- unnecessary abstraction;
- mistaken assumptions;
- coupling;
- duplication;
- hidden persistence/API contracts;
- simpler alternatives;
- migration risks;
- over-engineering.

Produces a decision: accept, modify, limit, or reject/replace.

## 5.4 Architect / Contract Owner

Defines the target pattern.

Owns:

- interfaces;
- schemas;
- architectural boundaries;
- compatibility strategy;
- migration invariants;
- target data flow;
- naming conventions;
- representative reference implementation.

## 5.5 Ticket Writer / Planner

Turns the approved plan into bounded executable tickets.

A ticket should be implementable without rediscovering the entire initiative.

## 5.6 Implementer

Owns a bounded ticket.

Responsibilities:

- follow the approved contract;
- edit only necessary areas;
- add/update tests;
- record deviations;
- provide completion evidence.

Must not broaden scope merely because adjacent code could also be improved.

## 5.7 Regression / Adversarial Tester

Attempts to break the result.

Focuses on:

- old behavior;
- unexpected state changes;
- persistence/reload;
- edge cases;
- race conditions;
- alternate routes;
- mobile/keyboard usage;
- WebMCP equivalence;
- malformed/empty inputs;
- upgrade/migration behavior.

## 5.8 UI/UX Reviewer

For user-facing work, evaluates:

- hierarchy;
- clarity;
- density;
- consistency;
- responsive behavior;
- empty/loading/error states;
- accessibility;
- interaction predictability;
- user-story completeness;
- visual regressions across routes.

## 5.9 Security / Trust-Boundary Reviewer

Use when work touches:

- authentication/authorization;
- arbitrary files;
- local filesystem;
- browser permissions;
- execution/evaluation;
- SQL;
- external URLs;
- exports;
- sensitive data;
- cross-origin communication.

## 5.10 Performance Reviewer

Use when changes affect:

- large datasets;
- canvas rendering;
- DuckDB;
- indexed persistence;
- API fan-out;
- workers;
- media;
- repeated recomputation.

## 5.11 Cleanup / Dead-Code Auditor

Runs after successful migration.

Finds:

- old implementations;
- obsolete adapters;
- dead configuration;
- unused exports;
- abandoned migration code;
- duplicate tests/docs.

Delete only when usage analysis and regression evidence support deletion.

## 5.12 Documentation / Historian

Updates:

- architecture docs;
- ADRs;
- examples;
- migration notes;
- tool docs;
- CHANGE_LEDGER;
- developer-facing usage instructions.

## 5.13 Observer

For long initiatives, an observer does not implement the tickets. It continuously checks the overall initiative for:

- scope drift;
- inconsistent patterns emerging between tickets;
- duplicated solutions;
- untracked regressions;
- unresolved TODOs;
- skipped acceptance criteria;
- assumptions that changed during implementation.

The observer reports issues to the coordinator.

---

# 6. Standard Ticket Contract

Use this shape for migration/feature tickets.

```md
# TICKET: <short title>

## Goal
<one coherent result>

## Context
<why this ticket exists and its parent initiative>

## Current behavior
<what happens now>

## Target behavior
<what must happen afterward>

## Architectural contract
<interfaces/patterns this ticket MUST use>

## In scope
- ...

## Out of scope
- ...

## Likely affected areas
- ...

## Invariants
- ...

## Acceptance criteria
- [ ] ...
- [ ] ...

## Required tests
- ...

## Compatibility requirements
- ...

## Dependencies
- ...

## Completion evidence
- files changed
- commands/tests run
- behavior verified
- deviations/risks
```

A ticket is too broad if its implementer needs to make new repository-wide architectural decisions unrelated to its assigned result.

---

# 7. Architecture Decision Template

For significant changes, record:

```md
# Decision: <title>

## Context
What problem are we solving?

## Current pattern
How does the repository work today?

## Proposal
What did the user suggest?

## Evidence
Where does the problem occur?

## Options considered
1. ...
2. ...
3. ...

## Decision
ACCEPT | ACCEPT WITH CHANGES | LIMITED ADOPTION | REJECT / ALTERNATIVE

## Target architecture
...

## Invariants
...

## Migration strategy
...

## Compatibility strategy
...

## Risks
...

## Removal/cleanup conditions
...
```

---

# 8. Prompt Dictionary

This section defines shorthand phrases the user can use. Interpret the phrase by intent, not exact wording.

## `IDEA:` / “I had an idea…”

### Example

> I had an idea: maybe all of this state should be in Pinia.

### Meaning

Enter **Architecture Proposal Mode**.

1. investigate current pattern;
2. critique suggested solution;
3. map applicable occurrences;
4. define target architecture;
5. identify invariants;
6. create migration tickets;
7. canary one representative slice;
8. propagate only after validation;
9. regress and clean up.

---

## `TRY REPLACING:` / “Let’s replace X with Y and see if this works”

Enter **Canary Migration Mode**.

Do not migrate the whole repository initially.

1. compare X and Y;
2. select representative use case;
3. characterize current behavior;
4. implement Y behind a compatible boundary;
5. run before/after regression;
6. decide whether propagation is justified;
7. if yes, ticket the remainder.

---

## `APPLY EVERYWHERE:` / “Apply this to all files”

Enter **Semantic Propagation Mode**.

1. search repository for semantic occurrences;
2. classify variants;
3. exclude false positives;
4. identify justified exceptions;
5. migrate applicable occurrences in bounded tickets;
6. verify no accidental mixed architecture remains.

Never perform literal uncontrolled replacement.

---

## `CRITIQUE + IMPROVE:`

Enter **Review Before Change Mode**.

1. inspect implementation;
2. identify correctness, architecture, readability, UX, testing, performance, and maintainability issues relevant to the target;
3. rank findings by impact/risk;
4. fix high-value issues;
5. do not churn healthy code merely to make it different;
6. regress all changed behavior.

---

## `CLEAN:` / “Clean this code up”

Enter **Behavior-Preserving Cleanup Mode**.

Review:

- readability;
- duplication;
- unnecessary indirection;
- hard-coded constants;
- misplaced responsibility;
- large functions/components;
- confusing naming;
- stale comments;
- dead imports;
- dead code;
- unused exports;
- brittle conditionals;
- inconsistent error handling.

Establish behavior first. Refactors must preserve observable I/O unless explicitly approved otherwise.

---

## `QUARANTINE DEAD CODE:`

Enter **Evidence-Based Removal Mode**.

1. find apparent dead/unused code;
2. trace static and dynamic consumers;
3. account for reflection/dynamic registration/config/imports;
4. quarantine uncertain candidates;
5. delete only proven-unused code;
6. run regressions afterward.

---

## `MAKE THIS REUSABLE:`

Enter **Abstraction Review Mode**.

Do not automatically create a generic framework.

1. identify actual duplicate cases;
2. discover their differences;
3. find the smallest common contract;
4. preserve domain-specific behavior outside the abstraction;
5. migrate at least two real consumers to prove reuse.

---

## `ADD FEATURE:`

Enter **Vertical Feature Mode**.

Implement the complete thin vertical slice:

```text
types/schema
→ state/domain logic
→ service/adapter
→ UI
→ persistence if needed
→ WebMCP if applicable
→ tests
→ docs/example
```

Prefer a working end-to-end slice over many unfinished layers.

---

## `FIX:` / “This is broken”

Enter **Root-Cause Bug Mode**.

1. reproduce or establish evidence;
2. determine root cause;
3. search for the same underlying pattern elsewhere;
4. add regression test;
5. fix root cause, not just symptom;
6. semantically propagate only when appropriate;
7. run affected golden paths.

---

## `WEBMCP-ENABLE:`

Enter **UI/WebMCP Parity Mode**.

For the target capability:

- preserve normal UI operation without WebMCP;
- expose meaningful semantic tools, not DOM automation wrappers;
- use stable structured schemas;
- make tool side effects explicit;
- return IDs/references needed for chaining;
- expose inspection/read operations where useful;
- add representative chained prompts;
- test normal UI and WebMCP paths against equivalent domain behavior.

---

## `DATAFY:` / “Make this queryable”

Enter **Canonical Data + DuckDB Mode**.

1. identify structured block/output data;
2. define canonical dataset metadata/provenance;
3. materialize or expose appropriate data through the DuckDB adapter;
4. preserve presentation state outside DuckDB;
5. add schema inspection;
6. add query capability;
7. support creating derived blocks/datasets from results;
8. test persistence, schema drift, and reload.

Rule:

> **DuckDB owns queryable analytical data; the canvas owns composition/presentation; adapters synchronize between them.**

---

## `MAKE EXPORTABLE:`

Enter **Structured Transformation/Export Mode**.

Support selecting sources, mapping fields, shaping output, previewing, and exporting without coupling to a specific API.

Consider:

- CSV;
- JSON;
- JSONL;
- TSV;
- arbitrary nested JSON shape where appropriate;
- source labels/metadata;
- provenance;
- deterministic ordering;
- escaping/null handling;
- download round-trip tests.

---

## `MAKE APPENDABLE:`

Enter **Accumulating Dataset/Table Mode**.

Add or reuse a dataset/table abstraction that can:

- define/infer schema;
- append one or many records;
- map fields;
- preserve prior records;
- optionally dedupe by configured key;
- add columns intentionally;
- edit/remove rows;
- expose data to queries and export.

---

## `DESIGN REVIEW:`

Enter **Full UI/UX Review Mode**.

Inspect all affected routes/states and evaluate:

- information hierarchy;
- consistency;
- responsiveness;
- accessibility;
- density;
- flow completion;
- discoverability;
- labels/copy;
- empty/loading/error states;
- action hierarchy;
- visual regressions.

Capture before/after evidence for major flows. Ticket improvements rather than making uncontrolled style changes everywhere.

---

## `PERF REVIEW:`

Enter **Performance Evidence Mode**.

1. identify measurable hot path;
2. measure or instrument before state when practical;
3. distinguish actual bottleneck from speculative optimization;
4. implement bounded optimization;
5. measure after;
6. preserve behavior;
7. record tradeoffs.

---

## `SECURITY REVIEW:`

Enter **Trust Boundary Review Mode**.

Review applicable:

- untrusted input;
- URL/file handling;
- SQL injection/query mutation;
- HTML/script rendering;
- auth/authz;
- CORS/origin boundaries;
- browser permissions;
- local companion communication;
- secrets;
- exported data;
- logging of sensitive values.

Do not weaken security controls merely to make a demo easier.

---

## `TEST THIS END TO END:`

Enter **Golden Path Mode**.

Exercise the real user journey through the highest available layer, preferably browser-level for user flows.

Record failures as tickets, fix root causes, rerun, and maintain regression coverage.

---

## `SHIP IT:` / `DEPLOY + SMOKE:`

Enter **Release Validation Mode**.

Before deployment:

- typecheck;
- test;
- build;
- verify environment assumptions.

After deployment where deployment tooling is available:

- open deployed app;
- run critical smoke flows;
- inspect runtime/network errors;
- validate deep links/assets;
- validate mobile/responsive basics;
- record deployment URL/version and outstanding issues.

Do not call a deployment successful solely because the build command completed.

---

## `DOCUMENT IT:`

Enter **Developer/User Documentation Mode**.

Update only documentation materially affected by the change.

Prefer:

- runnable examples;
- actual tool/schema names;
- data-flow diagrams when useful;
- known limitations;
- migration notes;
- example prompts;
- before/after descriptions.

---

## `FINISH THE TICKETS:`

Enter **Ticket Executor Mode**.

1. inspect active ticket queue;
2. resolve dependencies;
3. assign non-overlapping tickets;
4. execute in safe parallel where possible;
5. require per-ticket evidence;
6. integrate centrally;
7. update statuses;
8. run initiative-level regression.

---

## `OBSERVE THIS MIGRATION:`

Enter **Observer Mode**.

Do not implement unless explicitly asked. Continuously inspect active changes and report:

- drift from contract;
- overlapping edits;
- new architectural variants;
- missing tests;
- unresolved TODOs;
- regressions;
- risky cleanup;
- ticket dependency problems.

---

# 9. Copy/Paste Master Prompts

## 9.1 Universal Architecture Change Prompt

```text
I had an idea / architecture proposal:

<IDEA>

Treat this as a proposal, not a blind command. Inspect the repository and determine what this means in the existing architecture. Find every semantically relevant occurrence and classify its variants. Critique my suggested approach and choose ACCEPT, ACCEPT WITH CHANGES, LIMITED ADOPTION, or REJECT/ALTERNATIVE. Define the current behavior and invariants that must remain stable, including public interfaces, persisted data, routes, UI behavior, API schemas, and WebMCP contracts where applicable. Create characterization tests where coverage is missing. Design the smallest target architecture that satisfies the underlying goal, create an occurrence map and dependency-aware migration tickets, and validate the architecture on one representative vertical slice before propagating it. Once the canary passes, use non-overlapping subagents where supported to execute bounded tickets while a coordinator owns shared contracts and integration. Preserve compatibility through adapters/versioning where practical, never interpret “everywhere” as blind replacement, record justified exceptions, run the repository’s full regression/golden-path suite, remove legacy paths only when proven unused, and update the architecture decision/change ledger with the proposal, decision, tickets, test evidence, intentional differences, exceptions, remaining legacy code, and cleanup conditions.
```

## 9.2 Critique + Improve Existing Implementation

```text
Critique + improve this implementation non-destructively. First understand what it currently does and identify its external contracts. Review correctness, readability, architecture, duplication, state ownership, error handling, testability, accessibility, performance, security/trust boundaries, and consistency with the rest of the repository. Rank findings by impact and evidence; do not churn healthy code for stylistic preference. Create characterization tests before risky refactors, fix the highest-value issues in bounded tickets, use existing shared abstractions where appropriate, and create a new abstraction only when real duplication or a required architectural boundary justifies it. Run focused tests after each coherent change and full regression afterward. Quarantine uncertain dead code rather than deleting it. Document material architectural decisions and provide a concise before/after outcome report.
```

## 9.3 Safe “Replace Everywhere” Prompt

```text
Replace <CURRENT_PATTERN> with <TARGET_PATTERN> wherever it is semantically appropriate in this repository. Do not do a blind text replacement. First map every occurrence and classify variants, consumers, persistence/API implications, and exceptions. Establish characterization tests and a stable target contract, migrate one representative vertical slice, and prove equivalent behavior before propagation. Then create bounded tickets by feature/area and execute non-overlapping work in parallel where supported. Preserve compatibility and existing I/O unless an intentional difference is explicitly documented. After integration, search for mixed old/new patterns, dead compatibility code, stale imports/docs, and missed occurrences; remove legacy code only when it has no remaining consumers and regression evidence supports deletion. Update the change ledger with what was migrated and what intentionally remains.
```

## 9.4 New Feature Prompt

```text
Add the following capability to the existing application without rebuilding parallel infrastructure:

<FEATURE>

First inspect existing patterns and identify the best extension points. Define the feature’s user story, data/state model, interfaces, persistence needs, error/empty/loading states, accessibility requirements, and WebMCP exposure if applicable. Implement the smallest complete vertical slice using existing adapters, stores, renderers, schemas, and component conventions where possible. Keep domain logic independent from presentation and external integrations. Add representative unit/integration/browser tests and a golden-path smoke flow. Preserve backward compatibility with existing saved data and public contracts. Document the new capability, its limitations, and example usage/prompts.
```

## 9.5 Root-Cause Bug Prompt

```text
Fix this bug:

<BUG / REPRODUCTION>

Reproduce or establish concrete evidence first. Determine the root cause rather than patching only the visible symptom. Search the repository for other occurrences of the same underlying defect pattern and classify whether they are affected. Add a regression test that fails before the fix when practical. Make the smallest correct change, propagate it only to semantically affected occurrences, and preserve unrelated behavior. Run focused tests plus the applicable golden paths/build/typecheck. Report the root cause, files/areas fixed, tests added, similar occurrences reviewed, and anything intentionally left unchanged.
```

## 9.6 Code Cleanliness / Behavior-Preserving Refactor Prompt

```text
Perform a code cleanliness and maintainability pass on <SCOPE> while preserving observable behavior. Review readability, large functions/components, duplicate logic, hard-coded values, misplaced responsibilities, inconsistent naming, dead or unused code, excessive coupling, brittle branching, stale comments, error handling, and opportunities to reuse existing abstractions. Before reorganizing behavior-sensitive code, establish characterization tests for inputs, outputs, events, state, persistence, and public contracts. Prefer small coherent refactors and sandbox each material change with tests. Centralize constants/config only when ownership becomes clearer; do not create abstractions without real reuse. Quarantine uncertain dead code and delete only proven-unused paths. Run full regression and document meaningful before/after architectural benefits and any remaining cleanup candidates.
```

## 9.7 UI/UX / Brand Review Prompt

```text
Perform a full UI/UX and design-system review across <SCOPE>. Inventory the relevant pages, routes, subroutes, modals, responsive states, loading/empty/error states, and primary user stories. Capture before-state screenshots/evidence where tooling supports it. Critique hierarchy, spacing, typography, component consistency, responsive behavior, accessibility, keyboard flow, copy/labels, discoverability, action hierarchy, visual density, and design-token usage. Do not redesign everything blindly. Establish a small set of target design rules, validate them on representative screens, then create bounded tickets for repeated patterns and route-specific issues. Keep an observer/regression record of visual and functional differences. After implementation, replay all primary user stories at desktop and mobile widths, compare before/after states, fix regressions, and update the design/change ledger.
```

## 9.8 WebMCP Capability Prompt

```text
Expose <CAPABILITY> through WebMCP while preserving complete normal UI operation when WebMCP is unavailable. Reuse the same underlying domain/service functions for both UI and WebMCP rather than duplicating business logic. Design semantic tools with stable structured schemas, explicit side effects, useful returned IDs/references, inspection/read tools where chaining requires them, and clear errors. Support multi-step agent workflows and add example prompts for individual tools and chained operations. Add tests proving UI/WebMCP behavioral parity for representative scenarios, negative cases, and reload/persistence where relevant. Update the WebMCP docs/tool catalog and smoke-test the full flow in a supported browser environment.
```

## 9.9 DuckDB / Queryable Canvas Prompt

```text
Make <DATA / BLOCK TYPES> queryable through the application’s local DuckDB-Wasm layer without coupling UI components directly to SQL/database logic. Define or reuse canonical dataset metadata including stable source/block IDs, schema, labels/tags, provenance, timestamps/versioning, and persistence/restoration behavior. Keep the canvas as the source of composition/presentation state and DuckDB as the queryable analytical data layer behind an adapter/repository. Add schema inspection, safe read/query operations, saved Query Blocks, parameterized filtering/joins/grouping/aggregation, materialization of results as derived datasets, and creation of generic renderer blocks from query results. Default agent-generated SQL to safe read-only behavior. Handle schema drift, nulls, nested structures, duplicate names, large datasets, failures, and reload. Add UI and WebMCP flows plus tests for source block → dataset → query → derived block → export.
```

## 9.10 Data Builder / Export Prompt

```text
Add or improve a reusable Data Builder / Export capability that can select data from any combination of canvas blocks, datasets, files, API results, labels/metadata, queries, generated answers, or manual values and map that information into a user-defined output shape. Support field selection/renaming, nested objects/arrays where appropriate, constants/defaults, filtering, ordering, multi-source composition, preview, and reusable saved transformation definitions. Support at least CSV, JSON, JSONL, and TSV when technically appropriate, with correct escaping/null handling and deterministic output. Keep the feature source-agnostic and expose equivalent UI and WebMCP operations. Preserve field/row provenance where possible, keep generated data local by default, allow downstream blocks to consume generated results, and test round trips, empty data, schema mismatch, multi-source mapping, reload, and download behavior.
```

## 9.11 Append-to-Table / Dataset Prompt

```text
Add or improve a reusable accumulating Table/Dataset block. It must accept records from other blocks, queries, files, APIs, generated data, or manual input; infer or accept a schema; map source fields to columns; append one or many rows without replacing existing data; optionally deduplicate using an explicitly configured unique key; support intentional schema extension; and preserve provenance back to source records. Allow editing/removing/filtering/sorting rows and expose the dataset to DuckDB, transformations, Q&A, visualization, and export. Support equivalent UI and WebMCP operations and test repeated appends, schema changes, duplicates, nulls, reload, bulk records, and downstream querying/export.
```

## 9.12 Deploy + Smoke Prompt

```text
Prepare <PROJECT> for deployment and perform a production-like smoke validation. Do not treat a successful build as sufficient. Run typecheck, lint, unit/integration tests, and production build first; resolve actual failures without weakening tests. Deploy using the repository’s existing deployment approach. Then open the deployed application and exercise the highest-value golden paths, including deep links, assets, API calls, WebMCP flows if applicable, persistence/reload, downloads, and representative mobile/responsive states. Inspect console/network/runtime errors. Create tickets for non-blocking defects and fix blocking regressions before declaring success. Record the deployed version/URL, commands/tests run, flows validated, and known limitations.
```

---

# 10. Example Natural-Language Requests and Expected Interpretation

## Example A — Pinia migration

### User says

> Hmm, I want to use Pinia stores for this. Apply it everywhere this pattern exists.

### Agent interpretation

- Architecture Proposal Mode + Semantic Propagation Mode.
- Identify what “this” state currently is.
- Separate server state, ephemeral component state, persisted workspace state, and true shared application state.
- Do not put all state into Pinia indiscriminately.
- Define store ownership and interfaces.
- Canary one feature.
- Ticket remaining consumers.
- Preserve persisted formats and component behavior.

---

## Example B — Replace direct fetch calls

### User says

> Let’s replace direct fetch usage with our API adapter everywhere and see if that works better.

### Agent interpretation

- Find direct network calls.
- Classify calls that should/should not use the adapter.
- Compare adapter capabilities with current special cases.
- Add missing adapter capabilities only when justified.
- Canary one endpoint/feature.
- Migrate remaining applicable calls.
- Verify headers, cancellation, retries, error mapping, auth, and response semantics.

---

## Example C — Hard-coded values

### User says

> Clean up all these hard-coded values and put them somewhere central.

### Agent interpretation

Do not create one giant constants file.

Classify values as:

- true application configuration;
- domain constants;
- component-local constants;
- test fixtures;
- user-facing copy;
- environment configuration;
- magic numbers needing names;
- values that should remain inline.

Centralize only where ownership and reuse justify it.

---

## Example D — Generic block capability

### User says

> Make this block reusable for any API.

### Agent interpretation

- Inspect at least two/three real data shapes.
- Separate data acquisition from normalization from presentation.
- Define renderer/component props around semantic data rather than endpoint-specific response types.
- Preserve API-specific transformations in adapters/mappers.
- Validate on multiple APIs before claiming generic support.

---

## Example E — “Use everything on the page”

### User says

> Let the agent use all the data on the page to answer questions and create new blocks.

### Agent interpretation

- Define page/canvas data registry.
- Preserve source/block IDs and provenance.
- Allow all vs selected/tagged subset scopes.
- Add structured context extraction rather than scraping rendered text.
- Add Q&A/Answer Block.
- Allow answer output to be persisted as another block.
- Prevent recursive/unbounded context expansion.
- Expose semantic WebMCP operations.

---

## Example F — Query blocks

### User says

> Start storing page data in DuckDB and let me create query blocks.

### Agent interpretation

- Keep canvas presentation state separate from analytical storage.
- Define canonical dataset metadata.
- Materialize structured sources selectively.
- Add repository/adapter around DuckDB-Wasm.
- Add schema inspection and read-only query execution.
- Add persistent Query Block definitions.
- Allow query result → table/chart/card/export/answer context.

---

## Example G — Design polish

### User says

> Make the app feel professionally designed and consistent everywhere.

### Agent interpretation

- Inventory routes and UI states.
- Establish design rules/tokens from existing brand.
- Review representative screens first.
- Ticket repeated component/system issues separately from route-specific problems.
- Preserve functionality.
- Capture visual regressions and responsive/accessibility states.

---

## Example H — Bug found in one place

### User says

> This export fails when a CSV value has a comma. Fix it everywhere.

### Agent interpretation

- Reproduce malformed CSV.
- Find all CSV serialization implementations.
- Create shared serializer only if multiple implementations exist or boundary warrants it.
- Add tests for commas, quotes, newlines, Unicode, nulls, empty values.
- Migrate semantically affected exporters.

---

## Example I — Upgrade a library

### User says

> Move us to the new version of this library and apply the new API.

### Agent interpretation

- inspect current version and usage;
- inspect breaking changes/migration notes if available;
- inventory usage patterns;
- isolate dependency upgrade from unrelated refactor;
- adapt one representative path;
- test/build;
- propagate changes;
- remove compatibility workarounds only when safe.

---

## Example J — “Just improve it”

### User says

> Review this whole feature and improve it.

### Agent interpretation

Do not create unbounded churn.

1. identify user story;
2. establish baseline;
3. produce ranked findings;
4. select high-value fixes;
5. ticket them;
6. implement by impact;
7. defer low-value stylistic preferences;
8. report what was deliberately not changed.

---

# 11. Golden Paths for a Generative Canvas / WebMCP Project

Adapt these to the repository. They are particularly useful for a block-based local-first canvas.

## Golden Path 1 — Source → Render

```text
create source/API/file block
→ load data
→ render generic block
→ reload workspace
→ same data/block restores correctly
```

## Golden Path 2 — Source → Query → Derived Block

```text
load structured source
→ register/materialize dataset
→ inspect schema
→ execute query
→ create table/card/chart from query result
→ reload
```

## Golden Path 3 — Multi-source Q&A

```text
create multiple blocks
→ select all or subset
→ ask question
→ generate answer with source references
→ persist Answer Block
→ use Answer Block downstream
```

## Golden Path 4 — Append Dataset

```text
create table/dataset
→ append manual row
→ append source records
→ map fields
→ append more records
→ verify existing rows retained
→ query/export
```

## Golden Path 5 — Transform / Export

```text
select multiple sources
→ map fields
→ preview shape
→ export CSV
→ export JSON
→ verify escaping/schema/data provenance
```

## Golden Path 6 — WebMCP parity

```text
perform capability through UI
→ reset fixture
→ perform equivalent capability through WebMCP
→ compare domain result/state
```

## Golden Path 7 — Negative path

```text
missing/invalid source
→ meaningful error state
→ no corrupted persisted state
→ recovery works
```

## Golden Path 8 — Saved workspace compatibility

```text
load legacy fixture
→ migrate/restore automatically
→ all existing blocks render
→ edit/save
→ reload
```

## Golden Path 9 — Responsive use

```text
desktop primary flow
→ tablet width
→ mobile width
→ keyboard-only primary flow
```

## Golden Path 10 — Agent chaining

```text
inspect available tools/datasets
→ invoke source operation
→ use returned IDs
→ query/transform
→ create derived block
→ export result
```

---

# 12. Provenance Contract

For generative/data-heavy features, preserve provenance as a first-class capability.

A conceptual model:

```ts
interface Provenance {
  id: string
  createdBy: 'user' | 'webmcp' | 'system' | 'import' | 'query'
  sourceBlockIds?: string[]
  sourceDatasetIds?: string[]
  sourceRecordIds?: string[]
  transformationId?: string
  queryId?: string
  toolCallId?: string
  createdAt: string
  updatedAt?: string
  version?: number
}
```

Do not force this exact interface if the repository has an equivalent model. Preserve the capability, not the literal type.

This should make it possible to answer:

> Where did this value, row, block, chart, answer, or exported field come from?

---

# 13. Capability Registry

For extensible block/WebMCP applications, maintain a machine-readable registry rather than relying on agents to infer everything from scattered code.

Conceptual registry categories:

```text
block types
renderers
input/source adapters
transformations
export formats
WebMCP tools
datasets
queries
schemas
storage adapters
feature capabilities
```

Each registered capability should ideally expose enough metadata for another part of the system or agent to determine:

- identifier;
- human-readable label;
- input schema;
- output schema;
- supported actions;
- renderer(s);
- persistence behavior;
- WebMCP exposure;
- provenance behavior.

Agents should inspect the registry before creating new infrastructure.

---

# 14. Parallel Agent Rules

Parallelism should reduce elapsed work, not increase integration entropy.

## Safe parallel work

Good candidates:

- independent feature consumers after shared contract is stable;
- separate tests for already-defined behavior;
- documentation independent of implementation files;
- independent route-level design fixes using stable tokens/components;
- audits/scouting/review performed read-only.

## Unsafe parallel work

Avoid parallel agents independently editing:

- the same shared contract;
- root application/bootstrap files;
- central schema/type registries;
- the same store;
- the same migration script;
- package lockfiles;
- architecture files without coordination.

## Shared-file ownership

When multiple tickets need a shared file:

1. assign that file to coordinator/integrator;
2. have subagents describe required changes;
3. integrate centrally;
4. or serialize the dependent tickets.

## Subagent completion format

Each subagent returns:

```text
Ticket
Status
Files changed
Behavior implemented
Tests run + result
Acceptance criteria
Unexpected findings
Contract deviations
Follow-up / risk
```

---

# 15. Stop / Escalation Conditions

Pause propagation and revise the migration design when:

- canary behavior cannot match required invariants;
- proposed abstraction becomes more complex than existing implementations;
- migration requires unexpected public/schema/persistence breakage;
- two major occurrence variants cannot reasonably share the target contract;
- test failures reveal poorly understood existing behavior;
- parallel tickets begin inventing incompatible implementations;
- data migration cannot be made safe/recoverable;
- performance degrades materially;
- a security/trust boundary becomes weaker.

Do not conceal these by adding brittle compatibility hacks simply to finish the original plan.

---

# 16. Definition of Done

A nontrivial initiative is complete when:

- [ ] actual repository pattern was investigated;
- [ ] proposal was critiqued rather than blindly followed;
- [ ] invariants were identified;
- [ ] migration/feature contract is documented;
- [ ] canary/vertical slice succeeded when appropriate;
- [ ] tickets have bounded scope and status;
- [ ] implementation matches the approved contract;
- [ ] focused tests pass;
- [ ] full applicable regression passes;
- [ ] key golden paths pass;
- [ ] existing saved data/contracts remain compatible or have an explicit migration;
- [ ] intentional behavior changes are documented;
- [ ] exceptions are documented;
- [ ] dead/legacy paths were evaluated;
- [ ] unsafe deletions were avoided;
- [ ] docs/tool examples were updated where material;
- [ ] change ledger/decision record is current;
- [ ] final report explains what changed and why.

---

# 17. Compact Reusable Controller Prompt

Use this when you do not want to paste the entire operating system into every request.

```text
Follow the repository Engineering Operating System for this request:

<REQUEST>

Interpret my wording by intent. Investigate before editing; critique suggested implementations; preserve current observable behavior unless I explicitly ask to change it; map all semantically affected occurrences instead of blindly replacing text; establish invariants/characterization tests around risky areas; choose the smallest coherent architecture; validate repository-wide patterns on a representative canary first; convert broad work into dependency-aware tickets; use bounded non-overlapping subagents where supported; keep shared contracts under one coordinator; maintain provenance and compatibility; run focused tests plus applicable golden paths/full regression; quarantine uncertain dead code; remove legacy paths only when proven unused; update the change/decision ledger; and finish with evidence, exceptions, regressions, and remaining risks.
```

---

# 18. Suggested Personal Shorthand

These are intentionally short enough to use conversationally with Codex.

```text
IDEA: <proposal>
TRY REPLACING: <old> -> <new>
APPLY EVERYWHERE: <pattern/change>
CRITIQUE + IMPROVE: <scope>
CLEAN: <scope>
QUARANTINE DEAD CODE: <scope>
MAKE THIS REUSABLE: <capability>
ADD FEATURE: <feature>
FIX: <bug>
WEBMCP-ENABLE: <capability>
DATAFY: <data/block capability>
MAKE EXPORTABLE: <scope>
MAKE APPENDABLE: <scope>
DESIGN REVIEW: <scope>
PERF REVIEW: <scope>
SECURITY REVIEW: <scope>
TEST THIS END TO END: <flow>
DEPLOY + SMOKE: <project/environment>
DOCUMENT IT: <scope>
FINISH THE TICKETS: <initiative>
OBSERVE THIS MIGRATION: <initiative>
```

You can combine commands:

```text
IDEA: move shared workspace state into Pinia.
CRITIQUE + IMPROVE it first.
TRY REPLACING on one representative canvas flow.
If the canary proves better, APPLY EVERYWHERE semantically.
WEBMCP-ENABLE any changed capability.
TEST THIS END TO END and DEPLOY + SMOKE afterward.
```

---

# 19. Final Rule

The objective is not to maximize the number of files changed.

The objective is to leave the repository:

- more correct;
- easier to understand;
- easier to extend;
- easier to test;
- less duplicated;
- more internally consistent;
- backward compatible where required;
- better documented;
- and demonstrably working.

When those goals conflict with the literal wording of a rough implementation suggestion, preserve the user’s **intent** and explain the better engineering decision in the outcome record.

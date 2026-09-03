# Repository Codex Instructions

Before planning or performing any non-trivial engineering task:

1. Check whether `CODEX_ENGINEERING_OPERATING_SYSTEM.md` exists at the repository root.
2. If it exists, read it before making changes.
3. Treat it as the repository's engineering operating procedure for:
   - architecture changes
   - migrations
   - repository-wide refactors
   - code cleanup
   - feature implementation
   - ticket creation
   - subagent delegation
   - regression testing
   - UI/UX reviews
   - WebMCP work
   - data/schema changes
   - deployment and smoke testing
4. Apply only the sections relevant to the current task; do not blindly execute every workflow.
5. For large or cross-cutting changes, use its discovery → critique → plan → tickets → canary → implementation → regression → cleanup workflow.
6. Never interpret "apply everywhere", "all files", or similar wording as blind search-and-replace. Find semantically applicable occurrences.
7. Preserve existing observable behavior unless the task explicitly requires a behavior change.
8. Higher-priority Codex instructions and more-specific nested `AGENTS.md` instructions take precedence if there is a conflict.

For trivial changes such as correcting a typo or an obvious one-line change, do not invoke unnecessary orchestration overhead.
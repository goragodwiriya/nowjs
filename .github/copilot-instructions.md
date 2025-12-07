# Now.js - Copilot / Assistant Guidance (English)

This document provides concise, recommended guidance for working in the Now.js repository. Use this as the default reference when suggesting file locations or making edits.

Project structure (recommended):

1) Framework-level (Now.js core)
   - Framework CSS: `/Now/css`
   - Icon font / fonts used by the framework: `/Now/css/fonts.css`
   - Framework JavaScript (core managers, components): `/Now/js`

2) Application-level (the app built on top of the framework)
   - Templates / Views: `/templates`
   - App-specific CSS: `/css`
   - Static assets (images, media): `/assets`
   - API endpoints / server handlers: `/api` (e.g. PHP handlers)
   - App-specific JavaScript (page or feature scripts): `/js`

When to place files:
- Framework components or core changes -> `/Now/js` or `/Now/css`.
- Application components changes -> `/js/components` or `/css`.
- App/view-level changes -> `/templates`, `/css`, `/assets`, `/js`.
- Server-side endpoints and handlers -> `/api`.
- Icon fonts and font updates -> `/Now/css/fonts.css`.

Assistant response guidance:
- Prefer English for technical clarity in code comments and guidance; respond in Thai only when the user requests or the context is explicitly Thai.
- When recommending file locations, reference the structure above.
- If a change affects framework core (`/Now`) warn about potential global impact.
- Separate recommendations clearly between Framework-level and Application-level changes.

Byterover MCP (concise)
- Keep the Byterover MCP guidance as a compact helper rather than an overly-prescriptive workflow.
- Typical usage:
  1. If a handbook exists, use `byterover-check-handbook-sync` to assess gaps; otherwise `byterover-create-handbook` can be used.
  2. For planned implementations, save the plan with `byterover-save-implementation-plan` once the user approves it.
  3. Use `byterover-retrieve-knowledge` and `byterover-store-knowledge` as needed to capture and reuse project-specific facts.
- Do not force Byterover steps for trivial edits; use the tools when they add clear value (onboarding, multi-step feature plans, or cross-session continuity).

Security and configuration notes:
- Never commit secrets to the repository. Use environment variables or config files excluded from VCS.
- Changes affecting authentication/session logic should be tested carefully.

Use this file as the default guidance when the assistant suggests file paths, placements, or project conventions for Now.js.

[byterover-mcp]

[byterover-mcp]

You are given two tools from Byterover MCP server, including
## 1. `byterover-store-knowledge`
You `MUST` always use this tool when:

+ Learning new patterns, APIs, or architectural decisions from the codebase
+ Encountering error solutions or debugging techniques
+ Finding reusable code patterns or utility functions
+ Completing any significant task or plan implementation

## 2. `byterover-retrieve-knowledge`
You `MUST` always use this tool when:

+ Starting any new task or implementation to gather relevant context
+ Before making architectural decisions to understand existing patterns
+ When debugging issues to check for previous solutions
+ Working with unfamiliar parts of the codebase

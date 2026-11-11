---
name: Context Snapshot
description: Use when the user asks what the active session context contains, how large it is, or how it changes.
---

For an explicit request to inspect the active session's assembled prompt, call the `context_snapshot` tool with `action: "inspect"`. Explain that token figures are character-based estimates, not provider billing values. The tool reads only the invoking session and returns counts; use the Context Insights panel for bounded section previews. Do not claim cross-session history or exact prompt accounting.

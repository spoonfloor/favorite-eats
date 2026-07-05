# What `listPlanSessions` does

Returns named and auto saved plan sessions for the default plan document.

Response shape:

- `named` — saved sessions with `kind = named`, newest first
- `auto` — auto-saved sessions, newest first (max 8 retained server-side)
- `activeNamedSnapshotId` — current named session id on `plan.documents`
- `hasNamedSnapshot` — whether any named session exists

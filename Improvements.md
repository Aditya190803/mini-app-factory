# Improvements

## 10. Feature Gaps

### 10.1 No project collaboration/sharing ❌
- Projects are strictly single-user. Add read-only sharing via unique links.

### 10.2 No version history for projects ❌
- The `editHistory` table exists in the schema but only stores individual edits. Add a "snapshot" feature that saves named versions users can revert to.

### 10.3 No offline support ❌
- The editor could cache project files locally (via Service Worker or IndexedDB) to allow editing without connectivity, syncing when back online.

### 10.4 No AI cost/usage tracking ❌
- Users have no visibility into how many AI tokens they've consumed. Add per-user usage tracking and optional quotas.

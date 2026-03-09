# Codex Task: Checkpoint Detail Modal (v4 Screen 5)

## Overview
Build a rich checkpoint detail modal/page that shows when you click "Review" on a checkpoint. This is the core review experience — where the user inspects what an agent did before approving.

## Target (from v4 spec Screen 5)

### Modal/Full-Screen Layout
When triggered, show a detail view with:

1. **Header**
   - Task name + checkpoint ID
   - Agent name + model badge
   - Duration, tokens used, cost
   - Status badge (pending/approved/rejected/revised)

2. **Summary Section**
   - AI-generated summary of what was done
   - Collapsible full agent log

3. **Verification Matrix**
   - Row per check: tsc, tests, lint, e2e
   - Status: ✅ passed, ⚠️ missing, ❌ failed
   - "Run missing checks" button (calls tsc --noEmit on project path)
   - For now: show tsc status if available, others as "not configured"

4. **Files Changed**
   - List from diff_stat JSON (already parsed by getCheckpointDiffStatParsed)
   - Each file: name, +/- line counts if available
   - Click to expand inline diff (use <pre> with syntax highlighting via existing code styles)
   - Collapsed by default

5. **Unblocks List**
   - Show what tasks depend on this task (from depends_on in sibling tasks)
   - "Approving this will unblock: Task X, Task Y"

6. **Action Bar (pinned to bottom)**
   - Notes textarea for reviewer feedback
   - Approve dropdown: "Approve & Commit" (default), "Approve & Open PR"
   - Revise button → shows structured revise panel:
     - "What to change" (required textarea)
     - "Constraints" (optional textarea)
     - "Acceptance test" (optional textarea)
   - Reject button
   - "Review Later" button (just closes modal)

## Data Sources
- Checkpoint data: already fetched via listWorkspaceCheckpoints
- Diff stat: parsed from checkpoint.diff_stat JSON field
- Task details: from project detail (phases → missions → tasks)
- Task run details: GET /api/workspace/checkpoints/:id (may need to add task_run detail to response)
- Unblocks: compute from sibling tasks' depends_on arrays

## What to Build

### New file: src/screens/projects/checkpoint-detail-modal.tsx
A modal/dialog component that receives a checkpoint and renders the full detail view.

Props:
- checkpoint: WorkspaceCheckpoint
- project: WorkspaceProject (for task dependency info)
- projectDetail: detailed project with phases/missions/tasks
- open: boolean
- onOpenChange: (open: boolean) => void
- onApprove: (checkpointId: string, notes?: string) => void
- onRevise: (checkpointId: string, notes: string) => void
- onReject: (checkpointId: string, notes?: string) => void

### Wire it up
In the review inbox (dashboard-review-inbox.tsx or projects-screen.tsx), when "Review" is clicked:
- Open the checkpoint detail modal
- Pass the checkpoint + project context

### Backend enhancement (optional)
If needed, add a GET /api/workspace/checkpoints/:id endpoint that returns the checkpoint with its full task_run details (tokens, cost, duration, agent info).

## Implementation Notes
- Use existing Dialog component from @/components/ui/dialog
- Use existing checkpoint helpers from @/lib/workspace-checkpoints.ts
- For diff display: use <pre> with monospace font, green for additions, red for deletions
- The verification matrix is mostly placeholder for now — just show tsc status
- Keep the modal under 600 lines
- Match existing design system (primary-*, accent-* Tailwind tokens)

## After ALL changes:
1. npx tsc --noEmit — fix errors
2. Commit: "feat: checkpoint detail modal with verification matrix and diff viewer"
3. Run: openclaw system event --text "Done: Checkpoint detail modal with verification matrix and diff viewer" --mode now

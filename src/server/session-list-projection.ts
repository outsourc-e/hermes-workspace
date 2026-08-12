import { classifySessionRelationship } from '../screens/chat/session-lineage'
import { normalizeSessions } from '../screens/chat/utils'
import type {
  SessionLineage,
  SessionMeta,
  SessionRelationshipKind,
  SessionSummary,
} from '../screens/chat/types'

export type ProjectableSession = SessionSummary & {
  key: string
  friendlyId: string
}

export type ProjectedSession<T extends ProjectableSession> = Omit<
  T,
  'lineage'
> & {
  lineage: SessionLineage & { relationshipKind: SessionRelationshipKind }
}

function fallbackRelationshipKind(
  session: SessionMeta,
): SessionRelationshipKind {
  return session.lineage?.parentSessionId ? 'orphan' : 'root'
}

/**
 * Sanitize compact list metadata and classify every relationship before the
 * response crosses the server/browser boundary. Corrupt or partial legacy rows
 * remain visible roots/orphans and cannot fail the full session list.
 */
export function projectSessionListLineage<T extends ProjectableSession>(
  sessions: Array<T>,
): Array<ProjectedSession<T>> {
  const normalized = normalizeSessions(sessions)
  const sessionsById = new Map(
    normalized.map((session) => [session.key, session]),
  )

  return sessions.map((session, index) => {
    const normalizedSession = normalized[index]
    let relationshipKind: SessionRelationshipKind = 'root'
    if (normalizedSession) {
      try {
        relationshipKind = classifySessionRelationship(
          normalizedSession,
          sessionsById,
        )
      } catch {
        relationshipKind = fallbackRelationshipKind(normalizedSession)
      }
    }

    return {
      ...session,
      lineage: {
        ...(normalizedSession?.lineage ?? {}),
        relationshipKind,
      },
    }
  })
}

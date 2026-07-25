import { describe, expect, it } from 'vitest'

import {
  buildSessionTree,
  classifySessionRelationship,
} from './session-lineage'
import type { SessionLineage, SessionMeta } from './types'

function session(
  key: string,
  lineage?: SessionLineage,
  updatedAt = 0,
): SessionMeta {
  return {
    key,
    friendlyId: key,
    title: key,
    updatedAt,
    ...(lineage ? { lineage } : {}),
  }
}

function lookup(rows: Array<SessionMeta>): ReadonlyMap<string, SessionMeta> {
  return new Map(rows.map((row) => [row.key, row]))
}

describe('classifySessionRelationship', () => {
  it('keeps legacy, local, and portable sessions as roots', () => {
    const rows = [
      session('legacy'),
      session('local', { source: 'local', parentSessionId: 'missing' }),
      session('portable', {
        source: 'portable',
        parentSessionId: 'missing',
      }),
    ]
    const byId = lookup(rows)

    expect(rows.map((row) => classifySessionRelationship(row, byId))).toEqual([
      'root',
      'root',
      'root',
    ])
  })

  it('excludes explicit forks from continuation classification', () => {
    const parent = session('parent', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
    })
    const fork = session('fork', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
      sessionSource: 'fork',
      source: 'cli',
      lineageRootId: 'parent',
      lineageTipId: 'fork',
      startedAt: 100,
    })

    expect(classifySessionRelationship(fork, lookup([parent, fork]))).toBe(
      'branch',
    )
  })

  it('classifies explicit generic and cross-surface children as children', () => {
    const parent = session('parent', { source: 'cli' })
    const child = session('child', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
    })
    const crossSurface = session('cross', {
      parentSessionId: 'parent',
      isCrossSurfaceChild: true,
      lineageRootId: 'parent',
      lineageTipId: 'cross',
    })
    const byId = lookup([parent, child, crossSurface])

    expect(classifySessionRelationship(child, byId)).toBe('child')
    expect(classifySessionRelationship(crossSurface, byId)).toBe('child')
  })

  it('accepts authoritative server lineage and valid lifecycle fallback edges', () => {
    const metadataParent = session('metadata-parent')
    const metadataChild = session('metadata-child', {
      parentSessionId: 'metadata-parent',
      lineageRootId: 'metadata-parent',
      lineageTipId: 'metadata-child',
    })
    const lifecycleParent = session('lifecycle-parent', {
      source: 'cli',
      endReason: 'cli_close',
      endedAt: 200,
    })
    const lifecycleChild = session('lifecycle-child', {
      parentSessionId: 'lifecycle-parent',
      source: 'cli',
      startedAt: 200,
    })
    const byId = lookup([
      metadataParent,
      metadataChild,
      lifecycleParent,
      lifecycleChild,
    ])

    expect(classifySessionRelationship(metadataChild, byId)).toBe(
      'continuation',
    )
    expect(classifySessionRelationship(lifecycleChild, byId)).toBe(
      'continuation',
    )
  })

  it('rejects invalid timing, incompatible sources, and missing lifecycle timing', () => {
    const parent = session('parent', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 200,
    })
    const tooEarly = session('too-early', {
      parentSessionId: 'parent',
      source: 'cli',
      startedAt: 199,
    })
    const wrongSource = session('wrong-source', {
      parentSessionId: 'parent',
      source: 'telegram',
      startedAt: 200,
    })
    const conflictingMetadataSource = session('conflicting-metadata-source', {
      parentSessionId: 'parent',
      source: 'telegram',
      lineageRootId: 'parent',
      lineageTipId: 'conflicting-metadata-source',
    })
    const missingBoundaryParent = session('missing-boundary', {
      source: 'cli',
      endReason: 'compression',
    })
    const missingBoundaryChild = session('missing-boundary-child', {
      parentSessionId: 'missing-boundary',
      source: 'cli',
      startedAt: 300,
    })
    const malformedChild = session('malformed-child', {
      parentSessionId: 'parent',
      source: 'cli',
      startedAt: Number.NaN,
    })
    const byId = lookup([
      parent,
      tooEarly,
      wrongSource,
      conflictingMetadataSource,
      missingBoundaryParent,
      missingBoundaryChild,
      malformedChild,
    ])

    expect(classifySessionRelationship(tooEarly, byId)).toBe('orphan')
    expect(classifySessionRelationship(wrongSource, byId)).toBe('orphan')
    expect(classifySessionRelationship(conflictingMetadataSource, byId)).toBe(
      'orphan',
    )
    expect(classifySessionRelationship(missingBoundaryChild, byId)).toBe(
      'orphan',
    )
    expect(classifySessionRelationship(malformedChild, byId)).toBe('orphan')
  })

  it('trusts the loaded parent source over contradictory child parent-source metadata', () => {
    const parent = session('parent', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 200,
      lineageRootId: 'parent',
      lineageTipId: 'metadata-child',
    })
    const metadataChild = session('metadata-child', {
      parentSessionId: 'parent',
      source: 'telegram',
      parentSource: 'telegram',
      lineageRootId: 'parent',
      lineageTipId: 'metadata-child',
    })
    const lifecycleChild = session('lifecycle-child', {
      parentSessionId: 'parent',
      source: 'telegram',
      parentSource: 'telegram',
      startedAt: 200,
    })
    const byId = lookup([parent, metadataChild, lifecycleChild])

    expect(classifySessionRelationship(metadataChild, byId)).toBe('orphan')
    expect(classifySessionRelationship(lifecycleChild, byId)).toBe('orphan')
  })

  it('keeps missing parents and cycles visible as orphans', () => {
    const missing = session('missing', { parentSessionId: 'not-loaded' })
    const childWithoutParentId = session('child-without-parent-id', {
      relationshipType: 'child_session',
      parentTitle: 'Unavailable parent',
    })
    const a = session('a', {
      parentSessionId: 'b',
      relationshipType: 'child_session',
    })
    const b = session('b', {
      parentSessionId: 'a',
      relationshipType: 'child_session',
    })
    const byId = lookup([missing, childWithoutParentId, a, b])

    expect(classifySessionRelationship(missing, byId)).toBe('orphan')
    expect(classifySessionRelationship(childWithoutParentId, byId)).toBe(
      'orphan',
    )
    expect(classifySessionRelationship(a, byId)).toBe('orphan')
    expect(classifySessionRelationship(b, byId)).toBe('orphan')
  })
})

describe('buildSessionTree', () => {
  it('collapses continuation segments to the declared current tip', () => {
    const first = session(
      'first',
      {
        source: 'cli',
        endReason: 'compression',
        endedAt: 100,
        lineageRootId: 'first',
        lineageTipId: 'third',
        compressionSegmentCount: 1,
      },
      500,
    )
    const second = session(
      'second',
      {
        parentSessionId: 'first',
        lineageRootId: 'first',
        lineageTipId: 'third',
        compressionSegmentCount: 20,
        isPreCompressionSnapshot: false,
      },
      1_000,
    )
    const third = session(
      'third',
      {
        parentSessionId: 'second',
        lineageRootId: 'first',
        compressionSegmentCount: 3,
        isPreCompressionSnapshot: true,
      },
      100,
    )

    const tree = buildSessionTree([first, second, third])

    expect(tree.roots.map((row) => row.key)).toEqual(['third'])
    expect(tree.rows).toHaveLength(1)
    expect(tree.roots[0]).toMatchObject({
      relationshipKind: 'root',
      continuationCount: 20,
      childCount: 0,
    })
    expect(tree.visibleKeyBySessionKey.get('first')).toBe('third')
    expect(tree.visibleKeyBySessionKey.get('second')).toBe('third')
  })

  it('uses segment count, non-snapshot state, newest activity, then key to select an undeclared tip', () => {
    const rows = [
      session('root', {
        source: 'cli',
        endReason: 'compression',
        endedAt: 100,
        compressionSegmentCount: 1,
      }),
      session(
        'large-snapshot',
        {
          parentSessionId: 'root',
          source: 'cli',
          startedAt: 100,
          endReason: 'compression',
          endedAt: 200,
          compressionSegmentCount: 4,
          isPreCompressionSnapshot: true,
        },
        400,
      ),
      session(
        'non-snapshot-old',
        {
          parentSessionId: 'large-snapshot',
          source: 'cli',
          startedAt: 200,
          endReason: 'compression',
          endedAt: 300,
          compressionSegmentCount: 4,
          isPreCompressionSnapshot: false,
        },
        300,
      ),
      session(
        'non-snapshot-new',
        {
          parentSessionId: 'non-snapshot-old',
          source: 'cli',
          startedAt: 300,
          compressionSegmentCount: 4,
          isPreCompressionSnapshot: false,
        },
        500,
      ),
    ]

    expect(buildSessionTree(rows).roots[0]?.key).toBe('non-snapshot-new')
  })

  it('maps a declared missing continuation ancestor to its cold-loaded visible tip', () => {
    const tip = session('tip', {
      parentSessionId: 'previous-segment',
      lineageRootId: 'paged-out-root',
      lineageTipId: 'tip',
      compressionSegmentCount: 3,
    })

    const tree = buildSessionTree([tip])

    expect(tree.rows.map((row) => row.key)).toEqual(['tip'])
    expect(tree.visibleKeyBySessionKey.get('paged-out-root')).toBe('tip')
    expect(tree.visibleKeyBySessionKey.get('previous-segment')).toBe('tip')
  })

  it('does not alias a missing ancestor from branch metadata', () => {
    const branch = session('branch', {
      parentSessionId: 'parent',
      source: 'cli',
      sessionSource: 'fork',
      lineageRootId: 'parent',
      lineageTipId: 'branch',
    })

    const tree = buildSessionTree([branch])

    expect(tree.visibleKeyBySessionKey.has('parent')).toBe(false)
  })

  it('retains branch and nested child rows under a collapsed conversation', () => {
    const root = session('root', {
      source: 'cli',
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session(
      'tip',
      {
        parentSessionId: 'root',
        lineageRootId: 'root',
        lineageTipId: 'tip',
      },
      10,
    )
    const branch = session(
      'branch',
      {
        parentSessionId: 'root',
        sessionSource: 'fork',
      },
      30,
    )
    const child = session(
      'child',
      {
        parentSessionId: 'branch',
        relationshipType: 'child_session',
      },
      20,
    )
    const sibling = session(
      'sibling',
      {
        parentSessionId: 'root',
        relationshipType: 'child_session',
      },
      40,
    )

    const tree = buildSessionTree([root, tip, branch, child, sibling])

    expect(tree.rows.map((row) => [row.key, row.depth])).toEqual([
      ['tip', 0],
      ['sibling', 1],
      ['branch', 1],
      ['child', 2],
    ])
    expect(tree.indexByKey.get('tip')).toMatchObject({
      childCount: 2,
      continuationCount: 2,
      isExpandable: true,
    })
    expect(tree.indexByKey.get('branch')).toMatchObject({
      relationshipKind: 'branch',
      childCount: 1,
    })
  })

  it('keeps orphans, cycles, duplicate IDs, and max-depth overflow visible', () => {
    const orphan = session('orphan', { parentSessionId: 'missing' }, 100)
    const a = session(
      'a',
      { parentSessionId: 'b', relationshipType: 'child_session' },
      90,
    )
    const b = session(
      'b',
      { parentSessionId: 'a', relationshipType: 'child_session' },
      80,
    )
    const root = session('root', undefined, 70)
    const child = session(
      'child',
      { parentSessionId: 'root', relationshipType: 'child_session' },
      60,
    )
    const tooDeep = session(
      'too-deep',
      { parentSessionId: 'child', relationshipType: 'child_session' },
      50,
    )
    const duplicateOlder = session('root', undefined, 1)

    const tree = buildSessionTree(
      [orphan, a, b, root, child, tooDeep, duplicateOlder],
      { maxDepth: 1 },
    )

    expect(tree.rows.map((row) => row.key).sort()).toEqual(
      ['orphan', 'a', 'b', 'root', 'child', 'too-deep'].sort(),
    )
    expect(tree.indexByKey.get('orphan')?.isOrphan).toBe(true)
    expect(tree.indexByKey.get('a')?.isOrphan).toBe(true)
    expect(tree.indexByKey.get('b')?.isOrphan).toBe(true)
    expect(tree.indexByKey.get('too-deep')).toMatchObject({
      depth: 0,
      isOrphan: true,
    })
    expect(tree.indexByKey.get('root')?.session.updatedAt).toBe(70)
  })

  it('keeps local and portable sessions as top-level roots even when their parent is loaded', () => {
    const parent = session('remote-parent', undefined, 30)
    const local = session(
      'local-child',
      { source: 'local', parentSessionId: 'remote-parent' },
      20,
    )
    const portable = session(
      'portable-child',
      { source: 'portable', parentSessionId: 'remote-parent' },
      10,
    )

    const tree = buildSessionTree([parent, local, portable])

    expect(tree.indexByKey.get('local-child')).toMatchObject({ depth: 0 })
    expect(tree.indexByKey.get('portable-child')).toMatchObject({ depth: 0 })
    expect(tree.indexByKey.get('remote-parent')?.childCount).toBe(0)
  })

  it('expands the active path for hidden continuations and nested children', () => {
    const root = session('root', {
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', {
      parentSessionId: 'root',
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const child = session('child', {
      parentSessionId: 'tip',
      relationshipType: 'child_session',
    })

    const hiddenActive = buildSessionTree([root, tip, child], {
      activeSessionKey: 'root',
    })
    const childActive = buildSessionTree([root, tip, child], {
      activeSessionKey: 'child',
    })

    expect(hiddenActive.expandedAncestorIds.has('tip')).toBe(true)
    expect(hiddenActive.indexByKey.get('tip')?.isExpanded).toBe(true)
    expect(childActive.expandedAncestorIds.has('tip')).toBe(true)
    expect(childActive.indexByKey.get('tip')?.isExpanded).toBe(true)
  })
})

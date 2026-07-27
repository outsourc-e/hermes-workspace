import { describe, expect, it } from 'vitest'

import {
  createProjectId,
  getActiveProjects,
  getSessionProjectId,
  slugifyProjectName,
  type WorkspaceProject,
} from './use-projects'

function project(
  id: string,
  updatedAt: number,
  archivedAt?: number,
): WorkspaceProject {
  return {
    id,
    name: id,
    goal: '',
    instructions: '',
    color: '#000',
    icon: 'folder',
    createdAt: updatedAt,
    updatedAt,
    archivedAt,
  }
}

describe('use-projects helpers', () => {
  it('creates stable readable project slugs', () => {
    expect(slugifyProjectName('SEO/AEO Business Launch')).toBe(
      'seo-aeo-business-launch',
    )
    expect(slugifyProjectName('   ')).toBe('project')
  })

  it('deduplicates project ids', () => {
    expect(createProjectId('SEO/AEO Business', [])).toBe('seo-aeo-business')
    expect(
      createProjectId('SEO/AEO Business', [
        'seo-aeo-business',
        'seo-aeo-business-2',
      ]),
    ).toBe('seo-aeo-business-3')
  })

  it('returns active projects newest first and excludes archived projects', () => {
    expect(
      getActiveProjects([
        project('old', 10),
        project('archived', 30, 40),
        project('new', 20),
      ]).map((item) => item.id),
    ).toEqual(['new', 'old'])
  })

  it('looks up session project mappings safely', () => {
    expect(getSessionProjectId({ abc: 'seo' }, 'abc')).toBe('seo')
    expect(getSessionProjectId({ abc: 'seo' }, '  abc  ')).toBe('seo')
    expect(getSessionProjectId({ abc: 'seo' }, 'missing')).toBeNull()
    expect(getSessionProjectId({ abc: 'seo' }, '   ')).toBeNull()
  })
})

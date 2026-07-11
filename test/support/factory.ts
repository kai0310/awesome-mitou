import { parseRepoFullName } from '../../src/core/repo-name.js';
import type { RepoFullName, RepoSummary } from '../../src/core/types.js';

export function fullName(raw: string): RepoFullName {
  const n = parseRepoFullName(raw);
  if (n === null) throw new Error(`invalid full name in test: ${raw}`);
  return n;
}

export function makeRepo(
  overrides: Omit<Partial<RepoSummary>, 'fullName'> & { fullName: string },
): RepoSummary {
  const name = fullName(overrides.fullName);
  return {
    fullName: name,
    displayName: overrides.displayName ?? overrides.fullName,
    url: overrides.url ?? `https://github.com/${overrides.fullName}`,
    description: overrides.description ?? '',
    topics: overrides.topics ?? [],
    stars: overrides.stars ?? 0,
    isFork: overrides.isFork ?? false,
    isArchived: overrides.isArchived ?? false,
    pushedAt: overrides.pushedAt ?? '2024-01-01T00:00:00Z',
  };
}

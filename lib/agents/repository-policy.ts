/**
 * Conservative intent gates for repository mutations.
 * Advice/explanation questions must never unlock write tools.
 */
const WRITE_VERBS = '(?:create|make|add|edit|write|implement|commit|push|fix|change|update|modify|repair)';
const DIRECT_WRITE_REQUEST = new RegExp(
  String.raw`^\s*(?:please\s+)?${WRITE_VERBS}\b|\b(?:please|can you|could you|go ahead and|I want you to|I need you to)\s+${WRITE_VERBS}\b`,
  'i',
);
const DIRECT_COMMIT_REQUEST = new RegExp(
  String.raw`^\s*(?:please\s+)?(?:commit|push)\b|\b(?:please|can you|could you|go ahead and|I want you to|I need you to)\s+(?:commit|push)\b|\b(?:and|then|and then)\s+(?:commit|push)\b`,
  'i',
);

export function hasExplicitRepositoryWriteIntent(task: string) {
  return typeof task === 'string' && DIRECT_WRITE_REQUEST.test(task);
}

export function hasExplicitRepositoryCommitIntent(task: string) {
  return typeof task === 'string' && DIRECT_COMMIT_REQUEST.test(task);
}

export function isSafeFeatureBranch(branch: string) {
  return typeof branch === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(branch) &&
    !/^(?:main|master)$/i.test(branch) &&
    !branch.split('/').some(part => part === '.' || part === '..') &&
    !branch.includes('//') && !branch.endsWith('/') && !branch.endsWith('.');
}

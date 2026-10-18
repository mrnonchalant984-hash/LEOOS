/**
 * Structured visual context for agents.
 * Prefer sanitized DOM/a11y/layout data; screenshots only when the model supports images
 * and the capture excludes secrets.
 */

export type AgentVisualContext = {
  route: string;
  viewport: { width: number; height: number };
  screenshotAvailable: boolean;
  screenshotKind: 'none' | 'concept' | 'implemented_ui' | 'live_preview' | 'production';
  componentHints: string[];
  consoleErrors: string[];
  networkFailures: string[];
  accessibilityFindings: string[];
  visualRegression: { compared: boolean; differences: string[] };
  relatedFiles: string[];
  recentChanges: string[];
  notes: string[];
};

export function createEmptyVisualContext(route = '/', viewport = { width: 1280, height: 720 }): AgentVisualContext {
  return {
    route,
    viewport,
    screenshotAvailable: false,
    screenshotKind: 'none',
    componentHints: [],
    consoleErrors: [],
    networkFailures: [],
    accessibilityFindings: [],
    visualRegression: { compared: false, differences: [] },
    relatedFiles: [],
    recentChanges: [],
    notes: [
      'Concept images must never be represented as implemented software.',
      'Do not include secret-bearing screenshots or auth tokens.',
    ],
  };
}

export function sanitizeVisualContext(input: Partial<AgentVisualContext> & { route: string }): AgentVisualContext {
  const base = createEmptyVisualContext(input.route, input.viewport);
  const scrub = (items: unknown, max = 20) =>
    Array.isArray(items)
      ? items
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[redacted]')
          .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"'&\s]+/gi, '$1[redacted]')
          .slice(0, 500))
        .slice(0, max)
      : [];

  return {
    ...base,
    ...input,
    viewport: input.viewport || base.viewport,
    componentHints: scrub(input.componentHints),
    consoleErrors: scrub(input.consoleErrors),
    networkFailures: scrub(input.networkFailures),
    accessibilityFindings: scrub(input.accessibilityFindings),
    relatedFiles: scrub(input.relatedFiles, 40),
    recentChanges: scrub(input.recentChanges, 40),
    notes: scrub(input.notes, 10).length ? scrub(input.notes, 10) : base.notes,
    visualRegression: {
      compared: Boolean(input.visualRegression?.compared),
      differences: scrub(input.visualRegression?.differences || [], 30),
    },
    screenshotAvailable: Boolean(input.screenshotAvailable),
    screenshotKind: input.screenshotKind || 'none',
  };
}

export function distinguishArtifactKind(kind: AgentVisualContext['screenshotKind']): string {
  switch (kind) {
    case 'concept':
      return 'AI-generated concept — not implemented software.';
    case 'implemented_ui':
      return 'Implemented UI in source — may not match a live preview.';
    case 'live_preview':
      return 'Live application preview from a running environment.';
    case 'production':
      return 'Production deployment surface.';
    default:
      return 'No visual artifact attached.';
  }
}

/**
 * Where the project lives online. One place, so the landing page, footer and docs always agree.
 * `x` stays empty until the account exists: the UI renders no X button for an empty value
 * (tests/links.test.ts checks that a non-empty value is a real x.com URL).
 */
export const LINKS = {
  github: 'https://github.com/societyagent/society-agent',
  license: 'https://github.com/societyagent/society-agent/blob/main/LICENSE',
  issues: 'https://github.com/societyagent/society-agent/issues',
  security: 'https://github.com/societyagent/society-agent/security/advisories/new',
  x: 'https://x.com/SocietyAgent_',
  /** Token contract address on Robinhood Chain. Empty until launch: the landing shows a "coming soon" badge, and the full copyable address once this is set. */
  ca: '',
} as const

//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

const ignoredPaths = [
  'eslint.config.js',
  'prettier.config.js',
  'vite.config.ts',
  '.backup/**',
  '.output/**',
  'archive/**',
  'coverage/**',
  'dist/**',
  'electron/server-bundle.cjs',
  'generated-candidates/**',
  'node_modules/**',
  'public/**',
  'scripts/**',
  'server-entry.js',
  'status/**',
  'tmp_*',
  '*.png',
]

const relaxRuleSeverity = (rules, ruleName, severity) => {
  const ruleConfig = rules?.[ruleName]
  if (!ruleConfig) return undefined
  if (Array.isArray(ruleConfig)) return [severity, ...ruleConfig.slice(1)]
  return severity
}

const relaxedTanstackConfig = tanstackConfig.map((config) => {
  if (!config.plugins?.['@typescript-eslint']) {
    return config
  }

  const rules = {
    ...config.rules,
  }
  for (const ruleName of [
    '@typescript-eslint/no-unnecessary-condition',
    '@typescript-eslint/consistent-type-imports',
    '@typescript-eslint/naming-convention',
    'import/consistent-type-specifier-style',
    'import/order',
    'no-control-regex',
    'no-irregular-whitespace',
    'no-useless-escape',
  ]) {
    const relaxedRule = relaxRuleSeverity(rules, ruleName, 'warn')
    if (relaxedRule) rules[ruleName] = relaxedRule
  }

  return {
    ...config,
    rules,
  }
})

export default [
  {
    ignores: ignoredPaths,
  },
  ...relaxedTanstackConfig,
  {
    // Block client-side imports of server-only MCP input types.
    // `src/types/mcp-input.ts` may carry secret-bearing fields and must
    // never be referenced from screens or shared components.
    files: ['src/screens/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/types/mcp-input',
              message:
                'mcp-input.ts is server-only (carries unmasked secrets). Import McpClientInput from @/types/mcp instead.',
            },
          ],
          patterns: [
            {
              group: ['**/types/mcp-input', '**/types/mcp-input.ts'],
              message:
                'mcp-input.ts is server-only (carries unmasked secrets). Import McpClientInput from @/types/mcp instead.',
            },
          ],
        },
      ],
    },
  },
]

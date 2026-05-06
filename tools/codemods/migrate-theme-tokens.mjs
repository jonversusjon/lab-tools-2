#!/usr/bin/env node
// Migrate raw Tailwind grays to semantic theme tokens.
// See plans/UI-THEME.md and FRONTEND-CONVENTIONS.md (Phase E will add the rule).
//
// Algorithm:
// - Matches className="..." and className={'...'} / className={"..."} only.
// - Skips className={cn(...)} / className={`...`} (variable interpolation unsafe).
// - Processes patterns in priority order: 3-class pattern first, then 2-class.
// - After a pattern matches, matched classes are removed before next pattern
//   so shared classes (e.g. bg-white) aren't double-matched.
// - Matched replacement classes are inserted at the position of the first matched class.
// - Run from repo root: node tools/codemods/migrate-theme-tokens.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'frontend/src'

// Order matters: 3-class patterns first, then 2-class patterns.
const PATTERNS = [
  {
    name: 'bg-accent',
    oldClasses: ['bg-blue-600', 'hover:bg-blue-700', 'text-white'],
    newClasses: ['bg-accent', 'hover:bg-accent-hover', 'text-accent-foreground'],
  },
  {
    name: 'bg-background',
    oldClasses: ['bg-white', 'dark:bg-gray-900'],
    newClasses: ['bg-background'],
  },
  {
    name: 'bg-elevated',
    oldClasses: ['bg-white', 'dark:bg-gray-800'],
    newClasses: ['bg-elevated'],
  },
  {
    name: 'bg-surface',
    oldClasses: ['bg-gray-50', 'dark:bg-gray-800'],
    newClasses: ['bg-surface'],
  },
  {
    name: 'text-foreground',
    oldClasses: ['text-gray-900', 'dark:text-gray-100'],
    newClasses: ['text-foreground'],
  },
  {
    name: 'text-foreground-muted',
    oldClasses: ['text-gray-500', 'dark:text-gray-400'],
    newClasses: ['text-foreground-muted'],
  },
  {
    name: 'text-foreground-subtle',
    oldClasses: ['text-gray-400', 'dark:text-gray-500'],
    newClasses: ['text-foreground-subtle'],
  },
  {
    name: 'border-border',
    oldClasses: ['border-gray-200', 'dark:border-gray-700'],
    newClasses: ['border-border'],
  },
  {
    name: 'border-border-strong',
    oldClasses: ['border-gray-300', 'dark:border-gray-600'],
    newClasses: ['border-border-strong'],
  },
]

// Matches static className string literals only.
// Group 1: className="..." (double-quoted)
// Group 2: className={'...'} (curly + single-quoted)
// Group 3: className={"..."} (curly + double-quoted)
// Skips template literals and function calls (cn/clsx).
const CLASSNAME_RE = /className=(?:"([^"]*)"|\{(?:'([^']*)'|"([^"]*)")\})/g

function migrateClassString(classString, fileStats) {
  let classes = classString.split(/\s+/).filter(Boolean)
  let changed = false

  for (const pattern of PATTERNS) {
    if (pattern.oldClasses.every((c) => classes.includes(c))) {
      const firstIdx = Math.min(
        ...pattern.oldClasses.map((c) => classes.indexOf(c))
      )
      classes = classes.filter((c) => !pattern.oldClasses.includes(c))
      classes.splice(firstIdx, 0, ...pattern.newClasses)
      fileStats[pattern.name] = (fileStats[pattern.name] || 0) + 1
      changed = true
    }
  }

  return changed ? classes.join(' ') : classString
}

function processFile(filePath) {
  const original = readFileSync(filePath, 'utf8')
  const fileStats = {}

  const next = original.replace(CLASSNAME_RE, (match, dq, sq, dq2) => {
    const inner = dq ?? sq ?? dq2 ?? ''
    const migrated = migrateClassString(inner, fileStats)
    if (migrated === inner) return match
    if (dq !== undefined) return `className="${migrated}"`
    if (sq !== undefined) return `className={'${migrated}'}`
    return `className={"${migrated}"}`
  })

  if (next !== original) {
    writeFileSync(filePath, next, 'utf8')
  }
  return fileStats
}

function walk(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      walk(full, results)
    } else if (full.endsWith('.tsx')) {
      results.push(full)
    }
  }
  return results
}

const files = walk(ROOT)
const allStats = {}
let modifiedCount = 0
const patternTotals = {}

for (const file of files) {
  const stats = processFile(file)
  if (Object.keys(stats).length > 0) {
    allStats[file] = stats
    modifiedCount += 1
    for (const [k, v] of Object.entries(stats)) {
      patternTotals[k] = (patternTotals[k] || 0) + v
    }
  }
}

console.log(JSON.stringify({
  total_files_scanned: files.length,
  files_modified: modifiedCount,
  pattern_totals: patternTotals,
  per_file: allStats,
}, null, 2))

/**
 * Classifier for the PreToolUse(Bash) hook `.claude/hooks/block-bash-writes.mjs`
 * (AGENTS.md #15, owner decision 2026-10-02): subagents must not write files
 * through Bash to get around the worktree isolation hook, nor discard work with
 * `git stash` / `git reset` / `git checkout -- <path>` / `git restore`.
 *
 * A heuristic over the raw command text, not a shell sandbox: it tokenizes
 * quotes, operators, redirections, heredocs and `$(...)`, then checks each
 * simple command. Writes to `/dev/null`, the session scratchpad and temp dirs
 * stay allowed (`allowedDirs`).
 */
import path from 'node:path'

const WRITE_HINT = 'Use Edit/Write for files (Bash output may go to the scratchpad or a temp dir).'
const GIT_HINT = 'Make a WIP commit instead (git add + git commit); leave discarding work to the main session.'

const DEVICES = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', 'nul'])
const OUTPUT_REDIRS = new Set(['>', '>>', '>|', '&>', '&>>', '<>'])
// A backslash escapes only these; elsewhere it stays literal, so an unquoted
// Windows path (`C:\Users\...`) survives tokenizing.
const ESCAPABLE = new Set([' ', '\t', '\n', '"', "'", '\\', '$', '`', '>', '<', '|', '&', ';', '(', ')', '#'])

/**
 * Decision for one PreToolUse(Bash) hook input. Only subagents are guarded:
 * Claude Code sets `agent_id` only when the tool call comes from a subagent
 * (hook input schema, Claude Code 2.1.x), so the main session — where the owner
 * can ask for a reset explicitly — is untouched.
 *
 * @param {{ agent_id?: string, tool_input?: { command?: string } }} input
 * @param {{ env?: Record<string, string | undefined>, tmpdir?: string }} [options]
 */
export function evaluateHookInput(input, { env = {}, tmpdir } = {}) {
  const command = input?.tool_input?.command
  if (!input?.agent_id || typeof command !== 'string') return { blocked: false }
  // The session scratchpad lives under the temp dir (`/tmp/claude-*/…`, %TEMP% on Windows).
  const allowedDirs = ['/tmp', tmpdir, env.TMPDIR, env.TEMP, env.TMP].filter(Boolean)
  const result = classifyBashCommand(command, { allowedDirs, env })
  return result.blocked
    ? { blocked: true, reason: `Blocked for subagents (AGENTS.md #15, ~/.claude/rules/subagents.md): ${result.reason}` }
    : result
}

/**
 * @param {string} command raw `tool_input.command`
 * @param {{ allowedDirs?: string[], env?: Record<string, string | undefined> }} [options]
 * @returns {{ blocked: false } | { blocked: true, reason: string }}
 */
export function classifyBashCommand(command, { allowedDirs = [], env = {} } = {}) {
  const ctx = { env, allowedDirs: allowedDirs.map((dir) => normalizePath(dir, env)).filter(Boolean) }
  return checkScript(command, ctx, 0)
}

function checkScript(script, ctx, depth) {
  for (const cmd of splitCommands(tokenize(script))) {
    const reason = checkCommand(cmd, ctx, depth)
    if (reason) return { blocked: true, reason }
  }
  return { blocked: false }
}

function checkCommand({ words, redirs }, ctx, depth) {
  for (const { op, target } of redirs) {
    const isFdDup = op === '>&' && /^(\d+|-)$/.test(target)
    if ((OUTPUT_REDIRS.has(op) || (op === '>&' && !isFdDup)) && !isAllowedPath(target, ctx)) {
      return `Output redirection \`${op} ${target}\` writes a file. ${WRITE_HINT}`
    }
  }

  const args = stripWrappers(words)
  if (args.length === 0) return null
  const name = path.posix.basename(args[0].replaceAll('\\', '/')).replace(/\.exe$/i, '')
  const rest = args.slice(1)

  if (['bash', 'sh', 'zsh', 'dash'].includes(name) && depth < 3) {
    const flag = rest.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg))
    if (flag !== -1 && rest[flag + 1] !== undefined) {
      const nested = checkScript(rest[flag + 1], ctx, depth + 1)
      return nested.blocked ? nested.reason : null
    }
  }
  if (name === 'eval' && depth < 3) {
    const nested = checkScript(rest.join(' '), ctx, depth + 1)
    return nested.blocked ? nested.reason : null
  }
  if (name === 'tee') {
    const target = rest.find((arg) => !arg.startsWith('-') && !isAllowedPath(arg, ctx))
    if (target !== undefined) return `\`tee ${target}\` writes a file. ${WRITE_HINT}`
  }
  if (name === 'sed' && hasInPlaceFlag(rest, 'efl')) return `\`sed -i\` edits files in place. ${WRITE_HINT}`
  if (name === 'perl' && hasInPlaceFlag(rest, 'eEMmIdDxlC0F')) return `\`perl -i\` edits files in place. ${WRITE_HINT}`
  if (name === 'git') return checkGit(rest)
  return null
}

function checkGit(args) {
  const valued = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'])
  let i = 0
  while (i < args.length && args[i].startsWith('-')) i += valued.has(args[i]) ? 2 : 1
  const sub = args[i]
  const subArgs = args.slice(i + 1)
  if (sub === 'stash' || sub === 'reset' || sub === 'restore') {
    return `\`git ${sub}\` can discard uncommitted work. ${GIT_HINT}`
  }
  if (sub === 'checkout') {
    const dashDash = subArgs.indexOf('--')
    if ((dashDash !== -1 && dashDash < subArgs.length - 1) || subArgs.includes('.')) {
      return `\`git checkout <path>\` discards uncommitted changes. ${GIT_HINT}`
    }
  }
  return null
}

/** Short-option clusters (`-ni`, `-pi`, `-i.bak`) up to the first option that takes a value. */
function hasInPlaceFlag(args, valueTakers) {
  return args.some((arg) => {
    if (arg.startsWith('--')) return arg.startsWith('--in-place')
    if (!arg.startsWith('-')) return false
    for (const ch of arg.slice(1)) {
      if (ch === 'i') return true
      if (valueTakers.includes(ch)) return false
    }
    return false
  })
}

/** Drops env assignments and wrappers (`sudo`, `env`, `xargs`, …) in front of the real command. */
function stripWrappers(words) {
  const optionValues = {
    sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U']),
    env: new Set(['-u', '-C', '-S']),
    xargs: new Set(['-I', '-n', '-P', '-L', '-d', '-s', '-a', '-E', '-e']),
    nice: new Set(['-n']),
    timeout: new Set(['-s', '-k']),
  }
  const plain = new Set(['command', 'builtin', 'exec', 'nohup', 'time', '{', '!'])
  let i = 0
  while (i < words.length) {
    const word = words[i]
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || plain.has(word)) {
      i += 1
    } else if (optionValues[word]) {
      i += 1
      while (i < words.length && words[i].startsWith('-')) i += optionValues[word].has(words[i]) ? 2 : 1
      if (word === 'timeout') i += 1
    } else {
      break
    }
  }
  return words.slice(i)
}

function isAllowedPath(raw, ctx) {
  if (DEVICES.has(raw.toLowerCase()) || /^\/dev\/fd\/\d+$/.test(raw)) return true
  const normalized = normalizePath(raw, ctx.env)
  if (!normalized) return false
  return ctx.allowedDirs.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`))
}

/** Absolute, lower-cased, forward-slash path with `~`/`$VAR` expanded; null when unknowable or relative. */
function normalizePath(raw, env) {
  let unknown = false
  let p = raw
    .replace(/^~(?=\/|$)/, () => env.HOME ?? (unknown = true, ''))
    .replace(/\$\{(\w+)\}|\$(\w+)/g, (_, braced, bare) => env[braced ?? bare] ?? (unknown = true, ''))
  if (unknown) return null
  p = p.replaceAll('\\', '/').replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:').toLowerCase()
  if (!p.startsWith('/') && !/^[a-z]:\//.test(p)) return null
  return path.posix.normalize(p).replace(/(.)\/$/, '$1')
}

/**
 * Splits the token stream into simple commands. Separators (`|`, `&&`, `;`,
 * newline, `(`, `)`, `$(`, backticks) all just end the current command, which is
 * enough to look at every command in a pipeline, list or substitution.
 */
function splitCommands(tokens) {
  const commands = []
  let current = { words: [], redirs: [] }
  for (const token of tokens) {
    if (token.type === 'sep') {
      if (current.words.length || current.redirs.length) commands.push(current)
      current = { words: [], redirs: [] }
    } else if (token.type === 'redir') {
      current.redirs.push(token)
    } else {
      current.words.push(token.value)
    }
  }
  if (current.words.length || current.redirs.length) commands.push(current)
  return commands
}

function tokenize(src) {
  const tokens = []
  const heredocs = []
  let word = ''
  let inWord = false
  let pendingRedir = null
  let pendingHeredoc = null
  let i = 0

  const endWord = () => {
    if (!inWord) return
    if (pendingHeredoc) {
      heredocs.push({ delimiter: word, stripTabs: pendingHeredoc === '<<-' })
      pendingHeredoc = null
    } else if (pendingRedir) {
      tokens.push({ type: 'redir', op: pendingRedir, target: word })
      pendingRedir = null
    } else {
      tokens.push({ type: 'word', value: word })
    }
    word = ''
    inWord = false
  }
  const sep = (value) => {
    endWord()
    tokens.push({ type: 'sep', value })
  }
  const skipHeredocBodies = () => {
    while (heredocs.length) {
      const { delimiter } = heredocs.shift()
      while (i < src.length) {
        const eol = src.indexOf('\n', i)
        const line = src.slice(i, eol === -1 ? src.length : eol)
        i = eol === -1 ? src.length : eol + 1
        if (line.trim() === delimiter) break
      }
    }
  }

  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]

    if (ch === "'") {
      const end = src.indexOf("'", i + 1)
      word += src.slice(i + 1, end === -1 ? src.length : end)
      inWord = true
      i = end === -1 ? src.length : end + 1
    } else if (ch === '"') {
      i += 1
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) i += 1
        word += src[i]
        i += 1
      }
      inWord = true
      i += 1
    } else if (ch === '\\' && next !== undefined) {
      if (next === '\n') {
        i += 2
      } else {
        word += ESCAPABLE.has(next) ? next : `\\${next}`
        inWord = true
        i += 2
      }
    } else if (ch === '#' && !inWord) {
      while (i < src.length && src[i] !== '\n') i += 1
    } else if (ch === '\n') {
      sep('\n')
      i += 1
      skipHeredocBodies()
    } else if (ch === ' ' || ch === '\t') {
      endWord()
      i += 1
    } else if (ch === '$' && next === '{') {
      const end = src.indexOf('}', i)
      word += src.slice(i, end === -1 ? src.length : end + 1)
      inWord = true
      i = end === -1 ? src.length : end + 1
    } else if (ch === '$' && next === '(') {
      sep('$(')
      i += 2
    } else if (ch === '`' || ch === '(' || ch === ')') {
      sep(ch)
      i += 1
    } else if ((ch === '>' || ch === '<') && next === '(') {
      sep(`${ch}(`) // process substitution, not a file
      i += 2
    } else if (ch === '>' || ch === '<' || (ch === '&' && next === '>')) {
      if (inWord && !/^\d+$/.test(word)) endWord()
      word = ''
      inWord = false
      const op = src.slice(i).match(/^(&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<&|<>|<)/)[1]
      i += op.length
      // Input redirections also take their word, so it is not mistaken for an argument.
      if (op === '<<' || op === '<<-') pendingHeredoc = op
      else pendingRedir = op
    } else if (ch === '|' || ch === '&' || ch === ';') {
      const op = src.slice(i).match(/^(\|\||\|&|\||&&|&|;;|;)/)[1]
      sep(op)
      i += op.length
    } else {
      word += ch
      inWord = true
      i += 1
    }
  }
  endWord()
  return tokens
}

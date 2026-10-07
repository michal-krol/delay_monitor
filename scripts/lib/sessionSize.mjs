// Session size from a Claude Code transcript (JSONL). Pure — used by .claude/hooks/session-size.mjs.
// Same counting as ~/.claude/scripts/cc-usage-audit.mjs: one turn per assistant message
// (id + requestId), context = input + cache creation + cache read of the last one.
export const MAX_TURNS = 150
export const MAX_CTX = 300_000

export function measureSession(transcript) {
  const seen = new Set()
  let ctx = 0
  for (const line of transcript.split('\n')) {
    if (!line) continue
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    const message = entry.message
    if (entry.type !== 'assistant' || !message?.usage || !message.model || message.model === '<synthetic>') continue
    const key = `${message.id}${entry.requestId}`
    if (seen.has(key)) continue
    seen.add(key)
    const u = message.usage
    ctx = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
  }
  return { turns: seen.size, ctx }
}

export function sessionWarning({ turns, ctx }) {
  if (turns <= MAX_TURNS && ctx <= MAX_CTX) return null
  return (
    `Session size: ${turns} turns, ${Math.round(ctx / 1000)}k context (limits ${MAX_TURNS} turns / ${MAX_CTX / 1000}k). ` +
    'Every further turn re-reads this context (AGENTS.md #15): finish the current step, write the handoff, then /clear or start a new session.'
  )
}

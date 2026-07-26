// Tiny expression evaluator for the feedback templates, so a template can do
// {{rating * 20}} for a percentage instead of us hardcoding one string per
// caller.
//
// FIXTURE NOTE (see tmpl-001 in MANIFEST.md): this is deliberately vulnerable —
// it evaluates expressions out of a caller-supplied template, which is server
// side template injection. It is intentionally NOT a general code evaluator:
// there is no eval(), no new Function(), no property access, no function calls
// and no access to any host object. The grammar below is numbers, the named
// context variables, the five arithmetic operators, and parentheses.
//
// That is enough to produce the canonical SSTI signal ({{7*7}} -> 49) without
// shipping a remote code execution primitive in a container that also holds a
// service_role key. MANIFEST.md states this scope explicitly so the answer key
// does not overclaim.

type Ctx = Record<string, number>

function evaluate(src: string, ctx: Ctx): number {
  let i = 0
  const ws = () => { while (i < src.length && src[i] === ' ') i++ }

  function primary(): number {
    ws()
    if (src[i] === '(') {
      i++
      const v = expr()
      ws()
      if (src[i] !== ')') throw new Error('expected )')
      i++
      return v
    }
    if (src[i] === '-') { i++; return -primary() }

    const num = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))
    if (num) { i += num[0].length; return parseFloat(num[0]) }

    const name = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i))
    if (name) {
      i += name[0].length
      if (!(name[0] in ctx)) throw new Error(`unknown identifier ${name[0]}`)
      return ctx[name[0]]
    }
    throw new Error(`unexpected character at ${i}`)
  }

  function term(): number {
    let v = primary()
    for (;;) {
      ws()
      const op = src[i]
      if (op !== '*' && op !== '/' && op !== '%') return v
      i++
      const r = primary()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
  }

  function expr(): number {
    let v = term()
    for (;;) {
      ws()
      const op = src[i]
      if (op !== '+' && op !== '-') return v
      i++
      const r = term()
      v = op === '+' ? v + r : v - r
    }
  }

  const out = expr()
  ws()
  if (i !== src.length) throw new Error('trailing input')
  return out
}

export function render(template: string, ctx: Ctx, text: Record<string, string>): string {
  return template.replace(/\{\{([^}]*)\}\}/g, (whole, inner) => {
    const key = inner.trim()
    if (key in text) return text[key]
    try {
      const v = evaluate(inner, ctx)
      return Number.isFinite(v) ? String(v) : whole
    } catch {
      return whole
    }
  })
}

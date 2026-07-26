// PERF FIXTURE perf-001: text payload served with no compression.
//
// Structural, not timing: whether a response is compressed is a deterministic
// property of the response itself, so ground truth here is as unambiguous as
// "RLS is off". Content-Encoding: identity is set explicitly so Next's own
// compression does not kick in.
//
// Paired with ctl-perf-001, which serves comparable text gzipped.

const BODY = Array.from(
  { length: 900 },
  (_, i) =>
    `${i}\tBuildLog changelog line ${i}: routine entry, highly repetitive text that would compress extremely well if anything were compressing it.`,
).join('\n')

export async function GET() {
  return new Response(BODY, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Encoding': 'identity',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

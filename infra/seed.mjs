// Seeds demo accounts + content. Runs once on `docker compose up`.
// All of this data is synthetic. The people are not real, the emails are on the
// reserved .test TLD, and the passwords are printed in the README.

const URL = process.env.SUPABASE_URL ?? 'http://kong:8000'
const KEY = process.env.SERVICE_ROLE_KEY

const admin = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

const USERS = [
  {
    email: 'ada.demo@buildlog.test',
    password: 'demo-password-123',
    username: 'ada',
    display_name: 'Ada Demo',
    bio: 'Synthetic account. Building small tools, mostly at night.',
    website: 'https://example.test/ada',
  },
  {
    email: 'grace.demo@buildlog.test',
    password: 'demo-password-123',
    username: 'grace',
    display_name: 'Grace Demo',
    bio: 'Synthetic account. Compilers, boats, naps.',
    website: 'https://example.test/grace',
  },
  {
    email: 'linus.demo@buildlog.test',
    password: 'demo-password-123',
    username: 'linus',
    display_name: 'Linus Demo',
    bio: 'Synthetic account. Version control enjoyer.',
    website: null,
  },
  {
    email: 'margaret.demo@buildlog.test',
    password: 'demo-password-123',
    username: 'margaret',
    display_name: 'Margaret Demo',
    bio: 'Synthetic account. Writes the software that lands the thing.',
    website: 'https://example.test/margaret',
  },
]

const PROJECTS = {
  ada: [
    {
      title: 'Lampshade',
      slug: 'lampshade',
      tagline: 'A tiny static site generator that fits in one file.',
      description:
        'Started this because every SSG I tried needed a config file longer than the site. Lampshade reads a folder of markdown and writes a folder of html. That is the whole feature list.',
      status: 'building',
      repo_url: 'https://github.example.test/ada/lampshade',
      updates: [
        { day_number: 1, body: 'Scaffolded the CLI. Markdown parsing works, templating does not.' },
        { day_number: 2, body: 'Templating works. Turns out you can get very far with template literals.' },
        { day_number: 3, body: 'Added a --watch flag. Rebuild is 40ms on my machine, which feels like cheating.' },
      ],
    },
    {
      title: 'Nightjar',
      slug: 'nightjar',
      tagline: 'Sleep tracker that does not sell your data.',
      description: 'Local-first sleep log. No account required, no sync, no analytics. Just a chart.',
      status: 'shipped',
      repo_url: null,
      updates: [
        { day_number: 1, body: 'Shipped v1 to three friends. Two of them opened it.' },
      ],
    },
  ],
  grace: [
    {
      title: 'Dockside',
      slug: 'dockside',
      tagline: 'Compose file linter with opinions.',
      description:
        'Yells at you for binding to 0.0.0.0, for using :latest, and for putting secrets in environment blocks. Written after a bad afternoon.',
      status: 'building',
      repo_url: 'https://github.example.test/grace/dockside',
      updates: [
        { day_number: 1, body: 'Parser done. YAML anchors are a menace and I will not be taking questions.' },
        { day_number: 2, body: 'Twelve rules implemented. Ran it on my own repos and it found nine problems.' },
      ],
    },
    {
      title: 'Flowchart Fight',
      slug: 'flowchart-fight',
      tagline: 'Two diagrams enter, one diagram leaves.',
      description: 'A silly weekend thing. You upload two flowcharts and people vote on which is worse.',
      status: 'paused',
      repo_url: null,
      updates: [
        { day_number: 1, body: 'Made the voting page. Forgot to make the upload page. Classic.' },
      ],
    },
  ],
  linus: [
    {
      title: 'Bisecty',
      slug: 'bisecty',
      tagline: 'Guided git bisect for people who panic.',
      description: 'Walks you through a bisect and refuses to let you lose your place. Mostly a wrapper, honestly.',
      status: 'building',
      repo_url: 'https://github.example.test/linus/bisecty',
      updates: [
        { day_number: 1, body: 'It works on the happy path. The unhappy path is where bisect actually lives.' },
        { day_number: 2, body: 'Handled dirty working trees. Stash, run, unstash. Hope nothing goes wrong.' },
      ],
    },
  ],
  margaret: [
    {
      title: 'Rangecheck',
      slug: 'rangecheck',
      tagline: 'Property tests for numeric code, generated from type hints.',
      description:
        'Reads annotations and generates boundary cases automatically. Found two off-by-ones in my own library within an hour, which was humbling.',
      status: 'building',
      repo_url: 'https://github.example.test/margaret/rangecheck',
      updates: [
        { day_number: 1, body: 'Generator emits boundaries for int and float. Decimals are next and I am dreading it.' },
        { day_number: 2, body: 'Decimals done. Wrote 300 lines to avoid learning one library.' },
        { day_number: 3, body: 'Hooked it into CI. It immediately failed and it was right to.' },
      ],
    },
    {
      title: 'Countdown',
      slug: 'countdown',
      tagline: 'Launch checklist that blocks deploys until every box is ticked.',
      description: 'A checklist with teeth. Integrates with nothing yet, which limits the teeth somewhat.',
      status: 'shipped',
      repo_url: null,
      updates: [
        { day_number: 1, body: 'Deployed it. Used it to deploy itself, which felt significant at 3am.' },
      ],
    },
  ],
}

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${URL}/auth/v1/health`, { headers: admin })
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('Supabase API never came up')
}

async function api(path, init = {}) {
  const res = await fetch(`${URL}${path}`, { ...init, headers: { ...admin, ...init.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  await waitForApi()

  const existing = await api('/rest/v1/projects?select=id&limit=1')
  if (existing.length > 0) {
    console.log('already seeded, nothing to do')
    return
  }

  const ids = {}
  for (const u of USERS) {
    const created = await api('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { username: u.username, display_name: u.display_name },
      }),
    })
    ids[u.username] = created.id
    console.log(`user  ${u.email}`)

    await api(`/rest/v1/profiles?id=eq.${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ bio: u.bio, website: u.website }),
    })
  }

  for (const [username, projects] of Object.entries(PROJECTS)) {
    for (const p of projects) {
      const { updates, ...project } = p
      const [row] = await api('/rest/v1/projects', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...project, user_id: ids[username] }),
      })
      console.log(`  project ${row.slug}`)

      if (updates?.length) {
        await api('/rest/v1/updates', {
          method: 'POST',
          body: JSON.stringify(
            updates.map((u) => ({ ...u, project_id: row.id, user_id: ids[username] })),
          ),
        })
      }
    }
  }

  console.log('seed complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

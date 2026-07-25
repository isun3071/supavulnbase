# Security Policy

## This repository is intentionally vulnerable

`supavulnbase` is a deliberately broken application used as a fixture for
benchmarking automated web application graders. The vulnerabilities in it are
the product, not accidents.

**Please do not file security reports against this repository.** Findings are
expected. If you have found something, check [`MANIFEST.md`](MANIFEST.md) — if it
is listed there, it is deliberate and documented. If you have found something
genuinely *not* in the manifest, that is interesting for a different reason: open
a normal issue describing it, so it can be added to the ground truth.

## Do not deploy this

- **Never expose this stack to the public internet, a shared network, or a
  cloud host.** It permits anonymous reads and writes to its database by design.
- Every published port binds to `127.0.0.1`. Do not change this.
- Run it on a machine you control, or in a disposable VM.
- Do not point it at a real Supabase project. It is built to run against the
  local stack in `docker-compose.yml` and nothing else.

## Credentials and data

- **No real credentials.** The JWTs in `.env` are signed with a throwaway secret
  that is committed beside them. They are format-valid so that key-shape
  detectors have something realistic to work on, and functionally dead
  everywhere except this compose project.
- **No real personal data.** Every account, name, biography, project, and update
  is synthetic. Emails use the reserved `.test` TLD. Any resemblance to a real
  person is unintended.
- Seed passwords are printed in the README because the accounts are meant to be
  logged into by a grader.

## Reporting a problem with the fixture itself

Bugs that make the fixture *fail to run*, produce a finding the manifest does not
describe, or misclassify a control are worth reporting. Open an issue.

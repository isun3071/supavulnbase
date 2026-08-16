# Security Policy

## This repository is intentionally vulnerable

`supavulnbase` is a deliberately broken application. It is a fixture for
benchmarking automated web application graders, and the vulnerabilities in it
are the product, not accidents.

**Please do not file security reports against this repository.** Findings are
expected. Check [`MANIFEST.md`](MANIFEST.md) first. A finding listed there is
deliberate and documented. A finding that is absent from the manifest is
interesting for a different reason, so open a normal issue describing it and it
can be added to the ground truth.

## Do not deploy this

- **Never expose this stack to the public internet, a shared network, or a
  cloud host.** It permits anonymous reads and writes to its database by design.
- Every published port binds to `127.0.0.1`. Do not change this.
- Run it on a machine you control, or in a disposable VM.
- Do not point it at a real Supabase project. It runs against the local stack
  in `docker-compose.yml` and nothing else.

## Credentials and data

- **No real credentials.** The JWTs in `.env` are signed with a throwaway secret
  committed beside them. Their format is valid so that secret detectors have
  something realistic to work on, and they are dead everywhere except this
  compose project.
- **No real personal data.** Every account, name, biography, project, and update
  is synthetic. Emails use the reserved `.test` TLD. Any resemblance to a real
  person is unintended.
- Seed passwords are printed in the README because a grader is meant to log into
  the accounts.

## Reporting a problem with the fixture itself

Report a fixture that fails to run, a finding the manifest does not describe,
or a control that is misclassified. Open an issue for it.

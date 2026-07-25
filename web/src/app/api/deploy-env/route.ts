// Reached via the /.env rewrite in next.config.mjs.
//
// This emulates a deployment where the webserver's document root is the
// project directory, so dotfiles beside the build are served as static text —
// shared hosting, a misconfigured nginx `root`, a user.github.io/project/
// deploy. The app itself would not normally serve this; the hosting does.
//
// Every value is dead outside this compose project. See SECURITY.md.
const DEPLOY_ENV = `# BuildLog production env — copied to the box on deploy
NODE_ENV=production
SITE_URL=http://localhost:8090/app

POSTGRES_HOST=db
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgres://postgres:postgres@db:5432/postgres

JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
SUPABASE_URL=http://localhost:8055
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1idWlsZGxvZyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjIwMTk2ODY0MDB9.8mu3rxnFIS-y722xnfsJ02I6d1qoqciFx7ebR-9Ntkc
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1idWlsZGxvZyIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MjAxOTY4NjQwMH0.iluM4GPu8k7qN0spW8oZrgZY_5m1kWTyXJ9rieM04nY

SMTP_HOST=smtp.mail.example.test
SMTP_USER=buildlog-mailer
SMTP_PASSWORD=demo-smtp-password-not-real
`

export async function GET() {
  return new Response(DEPLOY_ENV, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

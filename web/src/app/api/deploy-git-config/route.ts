// Reached via the /.git/config rewrite in next.config.mjs. Same emulation as
// deploy-env: the repository was cloned onto the box and the webserver's
// document root sits above .git, so its contents are readable.
//
// The token below is synthetic and inert.
const GIT_CONFIG = `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
[remote "origin"]
	url = https://buildlog-ci:ghp_S6yQxWmNrTvKbLcYdZaHfGjEuPoSiW2xN4Tq@github.example.test/buildlog/buildlog.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main
[user]
	name = BuildLog Deploy
	email = deploy@buildlog.test
`

export async function GET() {
  return new Response(GIT_CONFIG, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

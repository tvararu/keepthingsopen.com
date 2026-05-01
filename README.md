# keepthingsopen.com

An open letter to NHS England technical leadership asking them to reaffirm "make new source code open" as a default.

Live at [keepthingsopen.com](https://keepthingsopen.com).

## Development

You need [mise](https://mise.jdx.dev):

```sh
mise trust -y
mise install
mise dev
```

Tasks are defined in [mise.toml](mise.toml):

```sh
mise tasks       # List all tasks
mise build       # Render dist/index.html
mise dev         # Run a local Worker dev server on http://localhost:8787
mise deploy      # Manual production deploy
```

Production also auto-deploys on push to `main` via Cloudflare Workers Builds.

## Signing

Open the site, fill in the form, submit. Submissions land in moderator inboxes and are reviewed by hand; approved signatures get added to `signatures/`.

## Licence

[MIT](LICENSE).

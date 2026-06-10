# Paper Reader AI Worker

This Worker powers the private AI assistant for `paper-reader`.

It provides:

- GitHub OAuth login
- owner-only authorization for `lipengchem`
- access-code gate
- OpenAI Responses API calls
- per-paper chat history stored in Cloudflare D1

## Required Cloudflare resources

Create and deploy with Wrangler:

```powershell
npx wrangler login
npx wrangler d1 create paper-reader-ai
```

Copy the returned `database_id` into `wrangler.toml`, then run:

```powershell
npx wrangler d1 migrations apply paper-reader-ai --remote
```

## Required GitHub OAuth App

Create an OAuth App at:

`https://github.com/settings/developers`

Use:

- Application name: `paper-reader AI`
- Homepage URL: `https://lipengchem.github.io/paper-reader/`
- Authorization callback URL: `https://paper-reader-ai.<your-cloudflare-subdomain>.workers.dev/auth/github/callback`

Then set Worker secrets:

```powershell
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AI_ACCESS_CODE
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Deploy:

```powershell
npx wrangler deploy
```

Set the GitHub repository variable used by Pages:

```powershell
gh variable set PAPER_READER_AI_URL --repo lipengchem/paper-reader --body "https://paper-reader-ai.<your-cloudflare-subdomain>.workers.dev"
```

Push the frontend after this variable is set so GitHub Pages builds with the AI endpoint.

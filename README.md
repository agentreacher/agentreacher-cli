# AgentReacher CLI

The command line and agent skill for [AgentReacher](https://agentreacher.com).
Use it to connect an AI assistant, inspect social accounts, create reviewed
drafts, schedule campaigns, and publish across nine platforms.

## Quickstart

```bash
npx skills add agentreacher/agentreacher-cli
npm install -g agentreacher
agentreacher init
agentreacher actions --pretty
agentreacher run workspaceContext --pretty
agentreacher run integrationList --pretty
```

`agentreacher init` opens a secure browser login and configures AgentReacher as
an MCP server for Claude Code, Claude Desktop, Cursor, Windsurf, or Codex. You
can also set `AGENTREACHER_API_KEY` or pass `--api-key`.

## Action commands

The CLI exposes the same stable action contract as the hosted MCP server:

```bash
# List recent posts
agentreacher run postPlan --input '{"goal":"list","filters":{"limit":10}}' --pretty

# Create a draft; this does not publish
agentreacher run postCompose --input '{
  "mode":"draft",
  "contentType":"text",
  "content":{"caption":"What we learned shipping our first agent workflow."},
  "targets":["linkedin","x"]
}' --pretty

# Schedule an approved post from a file
agentreacher run postCompose --input @scheduled-post.json --pretty

# Publish only after explicit approval
agentreacher run postPublish --input '{"mode":"now","postId":"POST_ID"}' --pretty
```

Use `--input @file.json` for larger payloads. Machine-readable JSON is printed
when stdout is piped; `--pretty` forces formatted JSON. `--base-url` and
`AGENTREACHER_BASE_URL` can point at local or staging instances.

## Core actions

| Action | Purpose |
| --- | --- |
| `workspaceContext` | Active workspace, limits, role, and timezone |
| `integrationList` | Connected accounts and supported providers |
| `integrationConnect` | Start a secure account connection flow |
| `postSchema` | Check platform requirements before composing |
| `mediaPrepare` | Import or prepare media for a post |
| `postCompose` | Create or revise a draft or scheduled post |
| `postPlan` | List, inspect, revise, cancel, or delete posts |
| `postPublish` | Publish now or resume an approved schedule |
| `postStatus` | Inspect delivery status and failures |
| `teamAction` | List or invite workspace members |

The full input contract is in
[`references/cli-contracts.md`](skills/agentreacher-social-publishing/references/cli-contracts.md).

## Agent skill

This repository ships `agentreacher-social-publishing`, which teaches agents to
turn source material into platform-native campaigns, validate requirements,
create reviewable drafts, and stop for approval before publishing.

```text
Use AgentReacher to turn this changelog into a one-week launch campaign.
Create platform-native drafts for LinkedIn, X, Instagram, and Threads, show me
the final queue, and wait for approval before scheduling anything.
```

## License

MIT

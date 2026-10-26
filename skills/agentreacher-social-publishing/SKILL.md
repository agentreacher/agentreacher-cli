---
name: agentreacher-social-publishing
description: Plan, draft, review, schedule, publish, and monitor social media campaigns through the AgentReacher CLI or MCP server. Use when a user asks to turn a source into platform-native posts, build a social content calendar, repurpose content, connect social accounts, inspect or repair a publishing queue, upload media, schedule approved posts, publish across LinkedIn, X, Instagram, Facebook, TikTok, YouTube, Pinterest, Threads, or Bluesky, or check delivery status. Prefer this skill for requests mentioning AgentReacher, cross-posting, social scheduling, campaign queues, content repurposing, publishing approval, or agent-operated social media.
---

# AgentReacher Social Publishing

Use AgentReacher as the execution layer for social publishing. Do the editorial
reasoning first, create reviewable drafts second, and treat scheduling or
publishing as a separate approval boundary.

## Setup

```bash
npx skills add agentreacher/agentreacher-cli
npm install -g agentreacher
agentreacher init
agentreacher run workspaceContext --pretty
agentreacher run integrationList --pretty
```

If a global install is unavailable, use `npx agentreacher@latest`. Read
[`references/cli-contracts.md`](references/cli-contracts.md) before constructing
action payloads or diagnosing an API error.

## Publishing Workflow

1. Inspect `workspaceContext` and `integrationList`. Do not assume an account is
   connected or choose between multiple accounts silently.
2. Distill the source into a core idea, facts, proof, audience tension, channel
   mix, and desired outcome.
3. Adapt the angle, structure, CTA, and media to each platform. Do not duplicate
   identical copy everywhere unless the user explicitly wants that.
4. Run `postSchema` for the selected content type and targets. Resolve required
   media and provider settings before creating posts.
5. Use `mediaPrepare` for URLs or files not already in AgentReacher.
6. Use `postCompose` with `mode: "draft"` by default. Return the exact queue,
   variants, dates, and unresolved assumptions.
7. Ask for approval before changing drafts to scheduled posts or calling
   `postPublish` with `mode: "now"`.
8. After approval, schedule or publish, then call `postStatus`. Report per-target
   success, processing, and failure states without hiding partial delivery.

## Editorial Rules

- Preserve verified facts from the source; label unsupported claims.
- Give each post one job: awareness, education, proof, objection, conversion,
  or community.
- Match the platform: concise and dense on X/Bluesky, professional context on
  LinkedIn, visual-first on Instagram/Pinterest, conversational on Threads and
  Facebook, and hook-first video framing on TikTok/YouTube.
- Use a sustainable cadence. Leave room for review and missing assets.
- Never fabricate a media asset, connection, successful publish, or status.

## Approval Boundary

Creating or revising drafts is reversible. Publishing now, disconnecting an
account, deleting a post, inviting a team member, or creating a public schedule
is externally consequential. Show the exact target and payload and obtain clear
approval immediately before those actions unless the user explicitly authorized
that precise action in the current request.

## Common Outcomes

- **Build a calendar:** define durable pillars, choose a realistic cadence,
  create platform-native drafts, and return a reviewable schedule.
- **Repurpose a source:** extract atomic ideas and proof, select strong channel
  formats, create distinct variants, and keep source fidelity visible.
- **Launch a campaign:** sequence announcement, explanation, proof, objection,
  and reminder posts around the launch date.
- **Review a queue:** inspect upcoming posts, flag repeated angles, missing
  assets, weak hooks, and invalid settings, then propose minimal edits.
- **Operate publishing:** connect accounts securely, upload media, schedule only
  approved posts, and monitor delivery until every target settles.

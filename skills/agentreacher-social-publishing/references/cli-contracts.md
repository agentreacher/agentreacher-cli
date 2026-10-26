# AgentReacher CLI Contracts

## Contents

- Invocation
- Read-only actions
- Draft and media actions
- Publishing actions
- Connection and team actions
- Errors and output

## Invocation

```bash
agentreacher run <action> --input '<json>' --pretty
agentreacher run <action> --input @payload.json --pretty
```

Use `--api-key`, `AGENTREACHER_API_KEY`, `--base-url`, or
`AGENTREACHER_BASE_URL` when the saved login is not appropriate.

## Read-only actions

```bash
agentreacher run workspaceContext --pretty
agentreacher run integrationList --pretty
agentreacher run postPlan --input '{"goal":"list","filters":{"limit":25}}' --pretty
agentreacher run postPlan --input '{"goal":"inspect","postId":"POST_ID"}' --pretty
agentreacher run postStatus --input '{"postId":"POST_ID"}' --pretty
```

`postPlan.goal` accepts `list`, `inspect`, `revise`, `cancel`, and `delete`.
`cancel` and `delete` are mutations despite sharing the same action.

## Draft and media actions

```bash
agentreacher run postSchema --input '{"contentType":"image","targets":["instagram","linkedin"]}' --pretty
agentreacher run mediaPrepare --input '{"purpose":"post_media","source":{"type":"url","url":"https://example.com/launch.jpg"}}' --pretty
```

Create a draft:

```json
{
  "mode": "draft",
  "contentType": "image",
  "content": { "caption": "Launch copy", "brief": "Product launch" },
  "media": { "assetId": "ASSET_ID" },
  "targets": ["instagram", "linkedin"],
  "platformConfig": {
    "instagram": { "igAltText": "Product dashboard showing the workflow" },
    "linkedin": { "text": "Longer professional context for LinkedIn" }
  }
}
```

Use target objects when a workspace has multiple accounts:

```json
[{ "provider": "instagram", "channelId": "CHANNEL_ID" }]
```

## Publishing actions

Create a scheduled post with `mode: "scheduled"` and an ISO datetime:

```json
{
  "mode": "scheduled",
  "contentType": "text",
  "content": { "caption": "Approved copy" },
  "targets": ["linkedin", "x"],
  "schedule": { "scheduledAt": "2026-08-04T08:00:00.000Z" }
}
```

Publish an existing approved post now:

```bash
agentreacher run postPublish --input '{"mode":"now","postId":"POST_ID"}' --pretty
```

Always follow with `postStatus`. A processing state is not a failure; Instagram
and video platforms may need asynchronous processing. Inspect every delivery.

## Connection and team actions

```bash
agentreacher run integrationConnect --input '{"provider":"instagram"}' --pretty
agentreacher run integrationDisconnect --input '{"provider":"instagram","channelId":"CHANNEL_ID"}' --pretty
agentreacher run teamAction --input '{"action":"list_members"}' --pretty
agentreacher run teamAction --input '{"action":"invite_member","email":"person@example.com","role":"member"}' --pretty
```

Connection flows return a secure authorization URL. Never request passwords or
tokens in chat. Disconnect and invite operations require explicit approval.

## Errors and output

Successful action output is JSON. Authentication failures mean the user should
run `agentreacher auth login` or `agentreacher init`. Validation errors mean the
input does not match the action contract. Provider failures can be partial;
preserve post and delivery IDs so the user can inspect or retry safely.

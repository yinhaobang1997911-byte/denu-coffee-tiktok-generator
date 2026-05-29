# Deploy To Railway

This is the public API version for n8n.

Why this version exists:

- Your n8n workflow is hosted on Railway.
- Railway cannot call an API running on your laptop at `127.0.0.1`.
- This Node API can be deployed to Railway so n8n can call a public `/render` URL.

## Deploy Steps

1. Create a GitHub repository for this folder.
2. Push the full `denu-coffee-tiktok-generator` folder.
3. In Railway, create a new project from that GitHub repo.
4. Railway will use the included `Dockerfile`.
5. After deploy, open the generated Railway domain.
6. Test:

```text
https://YOUR-RAILWAY-APP.up.railway.app/health
```

It should return:

```json
{ "ok": true, "service": "denu-coffee-render-api" }
```

## n8n HTTP Request Node

Detailed node settings are in:

```text
N8N-NODES.md
```

Method:

```text
POST
```

URL:

```text
https://YOUR-RAILWAY-APP.up.railway.app/render
```

Body:

```text
JSON
```

Send the daily JSON generated from `n8n-content-prompt.md`.

The response contains:

- `caption`
- `images[0].base64`
- `images[1].base64`
- `images[2].base64`

For Telegram, send each base64 image as a binary file/photo, then send `caption` as a text message.

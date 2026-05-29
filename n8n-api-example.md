# n8n API Connection

Use this after the render API is running.

Local render API:

```text
http://127.0.0.1:8787/render
```

Start the API on this computer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\VS vape new files\Projects\denu-coffee-tiktok-generator\tools\render-api.ps1"
```

Important:

- Your current n8n is hosted on Railway.
- Railway cannot call `127.0.0.1` on your computer.
- To let Railway call this API, either deploy this generator to a public server or expose the local API with a secure tunnel.
- Recommended public deployment: use `DEPLOY-RAILWAY.md` and call `/render` from n8n.

Recommended n8n flow:

1. Chat Trigger
2. OpenAI text step using `n8n-content-prompt.md`
3. Code node: parse and validate JSON
4. HTTP Request node:
   - Method: `POST`
   - URL: public render API URL, ending in `/render`
   - Send Body: JSON
   - Body: the content JSON from the OpenAI step
5. Send Photo nodes:
   - Use `images[0].base64`
   - Use `images[1].base64`
   - Use `images[2].base64`
6. Send Message node:
   - Use `caption`

HTTP response shape:

```json
{
  "ok": true,
  "day": 28,
  "caption": "...",
  "images": [
    {
      "slide": 1,
      "fileName": "day-28-slide-1.png",
      "mimeType": "image/png",
      "base64": "..."
    }
  ]
}
```

# n8n Workflow Nodes

Goal:

Input one daily topic, then generate three TikTok carousel images with correct Myanmar font rendering.

Example input:

```text
Day 29: ကော်ဖီ ဘာကြောင့် ခါးတာလဲ?
```

## Node 1: Chat Trigger

Use your existing `When chat message received` node.

Expected field:

```text
chatInput
```

## Node 2: OpenAI Text Generation

Use the prompt in:

```text
n8n-content-prompt.md
```

Important settings:

- Response must be JSON only.
- The result must contain `brand`, `day`, `topic`, `caption`, and exactly 3 `slides`.
- Do not put emoji in slide text.
- Emoji is allowed in caption.

## Node 3: Code Node - Parse JSON

Use this JavaScript:

```javascript
const raw = $json.text || $json.output || $json.message?.content || $json.content;

if (!raw) {
  throw new Error('No OpenAI JSON output found');
}

const cleaned = String(raw)
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/i, '')
  .replace(/```$/i, '')
  .trim();

const data = JSON.parse(cleaned);

if (!Number.isInteger(data.day)) throw new Error('day must be a number');
if (!Array.isArray(data.slides) || data.slides.length !== 3) {
  throw new Error('Exactly 3 slides required');
}

return [{ json: data }];
```

## Node 4: HTTP Request - Render Images

Method:

```text
POST
```

URL:

```text
https://YOUR-RAILWAY-RENDER-API.up.railway.app/render
```

Body:

```text
JSON
```

Send the full JSON from Node 3.

Expected response:

```json
{
  "ok": true,
  "day": 29,
  "caption": "...",
  "images": [
    { "slide": 1, "mimeType": "image/png", "base64": "..." },
    { "slide": 2, "mimeType": "image/png", "base64": "..." },
    { "slide": 3, "mimeType": "image/png", "base64": "..." }
  ]
}
```

## Node 5: Code Node - Split Images

Use this JavaScript:

```javascript
if (!$json.ok) {
  throw new Error('Render API failed');
}

return $json.images.map((image) => ({
  json: {
    day: $json.day,
    caption: $json.caption,
    slide: image.slide,
    fileName: image.fileName || `day-${$json.day}-slide-${image.slide}.png`
  },
  binary: {
    data: {
      data: image.base64,
      mimeType: image.mimeType || 'image/png',
      fileName: image.fileName || `day-${$json.day}-slide-${image.slide}.png`
    }
  }
}));
```

## Node 6: Send Photo

Use your existing photo sending node.

Binary property:

```text
data
```

## Node 7: Send Caption

Send this after all photos:

```javascript
{{ $json.caption }}
```

If the caption node receives split image items, use a merge or item from the render response before splitting.

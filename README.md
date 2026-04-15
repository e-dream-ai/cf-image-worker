# cf-image-worker

A Cloudflare Worker that serves and transforms images and video for the [Infinidream](https://infinidream.ai) project. It sits in front of a Cloudflare R2 bucket and acts as the public CDN edge for user-facing media. **The R2 bucket is never exposed directly to the public** — every image/video URL served to the frontend goes through this worker.

## What it does

- **Signed delivery.** Client requests must include an `sig` query parameter — an HMAC-SHA-256 signature of the object key, computed with a shared `SIGNING_SECRET`. Unsigned requests get a `403`. This lets the backend mint scoped URLs without giving clients direct R2 access.
- **On-the-fly image transforms.** When a request includes `w`, `h`, or `format`, the worker routes through Cloudflare's [Image Resizing](https://developers.cloudflare.com/images/transform-images/) via the `cf.image` fetch option, so thumbnails and alternate sizes are generated at the edge instead of being pre-rendered and stored. `fit` and `q` tune the transform but don't trigger it on their own.
- **Edge caching.** All responses carry `Cache-Control: public, max-age=86400`, so Cloudflare's CDN caches each `key + params` variant for 24 hours. Repeat requests for the same transformed image are served from the edge and never touch R2.
- **Range request support.** `Range` headers are honored with `206 Partial Content` responses, so video seeking works directly against R2. Range requests bypass Image Resizing and stream the original object.
- **Content-type inference.** MIME types are inferred from the file extension (jpg, png, webp, avif, mp4, webm, mov, …) when R2 metadata doesn't provide one.
- **Internal raw path.** The `_raw/` prefix bypasses signature checking and is used internally by the transform path to fetch the source object before handing it to Image Resizing. It is not meant to be called directly by clients.

## How it fits into Infinidream

Generated dreams, thumbnails, and filmstrips are written to R2 by the backend and video services. `cf-image-worker` is the read path: the frontend and native clients fetch signed URLs routed through this worker, which either streams the raw bytes, serves a byte range, or returns a resized/reformatted variant.

## Configuration

| Setting | Where | Purpose |
|---|---|---|
| `BUCKET` | R2 binding in `wrangler.toml` | The R2 bucket holding source media |
| `SIGNING_SECRET` | Worker secret (`wrangler secret put SIGNING_SECRET`) | HMAC key used to verify the `sig` query parameter |

The current `wrangler.toml` deploys as `image-worker-stage`. Production deployment is managed separately.

## Development

```bash
npm install
npm run dev       # wrangler dev — local worker with R2 binding
npm run deploy    # wrangler deploy
```

You'll need `wrangler` authenticated against the Cloudflare account that owns the R2 bucket.

## URL shape

```
https://<worker-host>/<object-key>?sig=<hmac>&w=512&h=512&fit=cover&format=webp&q=85
```

- `<object-key>` — the key inside the R2 bucket (URL-encoded if it contains slashes or special characters)
- `sig` — required; HMAC-SHA-256 of the object key using `SIGNING_SECRET`, hex-encoded
- `w`, `h` — target dimensions in pixels. Presence of either (or `format`) is what activates the transform path.
- `format` — output format (default `auto`, which lets Cloudflare pick based on `Accept`). Also activates the transform path.
- `fit` — Cloudflare Image Resizing fit mode (default `cover`). Honored only when the transform path is active.
- `q` — JPEG/WebP quality, 1–100 (default `85`). Honored only when the transform path is active.

Requests with none of `w`, `h`, or `format` stream the original object. Requests with a `Range` header stream a byte range of the original object and are not run through Image Resizing.

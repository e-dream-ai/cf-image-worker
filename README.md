# cf-image-worker

A Cloudflare Worker that serves and transforms images and video for the [Infinidream](https://infinidream.ai) project. It sits in front of a Cloudflare R2 bucket and acts as the public CDN edge for user-facing media.

## What it does

- **Signed delivery.** Client requests must include an `sig` query parameter — an HMAC-SHA-256 signature of the object key, computed with a shared `SIGNING_SECRET`. Unsigned requests get a `403`. This lets the backend mint time-limited or scoped URLs without giving clients direct R2 access.
- **On-the-fly image transforms.** Query parameters `w`, `h`, `fit`, `format`, and `q` are passed through to Cloudflare's [Image Resizing](https://developers.cloudflare.com/images/transform-images/) via the `cf.image` fetch option, so thumbnails and alternate sizes are generated at the edge instead of being pre-rendered and stored.
- **Range request support.** `Range` headers are honored with `206 Partial Content` responses, so video seeking works directly against R2.
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
- `w`, `h` — target dimensions in pixels (either may be omitted)
- `fit` — Cloudflare Image Resizing fit mode (default `cover`)
- `format` — output format (default `auto`, which lets Cloudflare pick based on `Accept`)
- `q` — JPEG/WebP quality, 1–100 (default `85`)

Requests with no transform parameters stream the original object. Requests with a `Range` header stream a byte range of the original object and are not run through Image Resizing.

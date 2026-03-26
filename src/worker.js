const MIME_TYPES = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	svg: 'image/svg+xml',
	mp4: 'video/mp4',
	webm: 'video/webm',
	mov: 'video/quicktime',
};

function inferContentType(key) {
	const ext = key.split('.').pop()?.toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

function parseRange(rangeHeader, totalSize) {
	const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
	if (!match) return null;
	const start = parseInt(match[1]);
	const end = match[2] ? parseInt(match[2]) : totalSize - 1;
	return { offset: start, length: end - start + 1 };
}

async function verifySig(key, sig, secret) {
	const encoder = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signed = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(key));
	const expected = Array.from(new Uint8Array(signed))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return sig === expected;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		const key = decodeURIComponent(url.pathname.slice(1));
		if (!key) {
			return new Response('Missing key', { status: 400 });
		}

		if (key.startsWith('_raw/')) {
			const rawKey = key.slice(5);
			const object = await env.BUCKET.get(rawKey);
			if (!object) {
				return new Response('Not Found', { status: 404 });
			}
			return new Response(object.body, {
				headers: {
					'Content-Type': object.httpMetadata?.contentType || inferContentType(rawKey),
				},
			});
		}

		const sig = url.searchParams.get('sig');
		if (!sig || !(await verifySig(key, sig, env.SIGNING_SECRET))) {
			return new Response('Forbidden', { status: 403 });
		}

		const width = parseInt(url.searchParams.get('w') || '0');
		const height = parseInt(url.searchParams.get('h') || '0');
		const fit = url.searchParams.get('fit') || 'cover';
		const format = url.searchParams.get('format') || 'auto';
		const quality = parseInt(url.searchParams.get('q') || '85');
		const hasTransformParams = width || height || url.searchParams.has('format');

		const rangeHeader = request.headers.get('Range');

		if (rangeHeader) {
			const object = await env.BUCKET.head(key);
			if (!object) {
				return new Response('Not Found', { status: 404 });
			}

			const totalSize = object.size;
			const range = parseRange(rangeHeader, totalSize);
			if (!range) {
				return new Response('Invalid Range', { status: 416 });
			}

			const partialObject = await env.BUCKET.get(key, { range });
			if (!partialObject) {
				return new Response('Not Found', { status: 404 });
			}

			return new Response(partialObject.body, {
				status: 206,
				headers: {
					'Content-Type': object.httpMetadata?.contentType || inferContentType(key),
					'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${totalSize}`,
					'Content-Length': range.length.toString(),
					'Accept-Ranges': 'bytes',
					'Cache-Control': 'public, max-age=86400',
				},
			});
		}

		if (hasTransformParams) {
			const rawUrl = new URL(url.origin + '/_raw/' + key);

			const response = await fetch(rawUrl.toString(), {
				cf: {
					image: {
						width: width || undefined,
						height: height || undefined,
						fit,
						format,
						quality,
					},
				},
			});

			const headers = new Headers(response.headers);
			headers.set('Cache-Control', 'public, max-age=86400');
			return new Response(response.body, {
				status: response.status,
				headers,
			});
		}

		const object = await env.BUCKET.get(key);
		if (!object) {
			return new Response('Not Found', { status: 404 });
		}

		return new Response(object.body, {
			headers: {
				'Content-Type': object.httpMetadata?.contentType || inferContentType(key),
				'Accept-Ranges': 'bytes',
				'Cache-Control': 'public, max-age=86400',
				'Content-Length': object.size.toString(),
			},
		});
	},
};

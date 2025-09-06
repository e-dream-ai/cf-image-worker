export default {
	async fetch(request) {
		const url = new URL(request.url);

		const presignedUrl = url.searchParams.get('url');
		const width = parseInt(url.searchParams.get('w') || '0');
		const height = parseInt(url.searchParams.get('h') || '0');
		const fit = url.searchParams.get('fit') || 'cover';
		const format = url.searchParams.get('format') || 'auto';
		const quality = parseInt(url.searchParams.get('q') || '100');

		if (!presignedUrl) {
			return new Response('Missing presigned URL', { status: 400 });
		}

		const r2Response = await fetch(presignedUrl);
		if (!r2Response.ok) {
			return new Response('Failed to fetch from R2', { status: r2Response.status });
		}

		return new Response(r2Response.body, {
			headers: {
				'Content-Type': r2Response.headers.get('content-type') || 'image/jpeg',
				'Cache-Control': 'private, max-age=1800',
			},
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
	},
};

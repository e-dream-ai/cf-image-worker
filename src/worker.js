export default {
	async fetch(request) {
		const url = new URL(request.url);

		const presignedUrl = url.searchParams.get('url');
		const width = parseInt(url.searchParams.get('w') || '0');
		const height = parseInt(url.searchParams.get('h') || '0');
		const fit = url.searchParams.get('fit') || 'cover';
		const format = url.searchParams.get('format') || 'auto';
		const quality = parseInt(url.searchParams.get('q') || '85');

		if (!presignedUrl) {
			return new Response('Missing presigned URL', { status: 400 });
		}

		return fetch(presignedUrl, {
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

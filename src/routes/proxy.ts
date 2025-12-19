import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  // Proxy endpoint for streaming video
  fastify.get('/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, referer } = request.query as { url: string; referer?: string };

    if (!url) {
      return reply.status(400).send({ error: 'URL parameter is required' });
    }

    try {
      const response = await axios.get(url, {
        responseType: url.includes('.m3u8') ? 'text' : 'stream',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: referer || 'https://hianime.to/',
          Origin: referer ? new URL(referer).origin : 'https://hianime.to',
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: 30000,
      });

      // Enable CORS
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      reply.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Range',
      );

      // If it's an m3u8 file, rewrite URLs to be absolute and proxied
      if (url.includes('.m3u8')) {
        let content = response.data;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // Replace relative URLs with absolute proxied URLs
        content = content.replace(/^([^#\n][^\n]*\.m3u8[^\n]*)$/gm, (match: string) => {
          const absoluteUrl = match.startsWith('http') ? match : baseUrl + match;
          return `http://localhost:3000/proxy/stream?url=${encodeURIComponent(absoluteUrl)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
        });

        // Replace .ts segment URLs
        content = content.replace(/^([^#\n][^\n]*\.ts[^\n]*)$/gm, (match: string) => {
          const absoluteUrl = match.startsWith('http') ? match : baseUrl + match;
          return `http://localhost:3000/proxy/stream?url=${encodeURIComponent(absoluteUrl)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
        });

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        return reply.send(content);
      }

      // For non-m3u8 files (video segments), stream directly
      const contentType = response.headers['content-type'];
      if (contentType) {
        reply.header('Content-Type', contentType);
      }

      if (response.headers['content-length']) {
        reply.header('Content-Length', response.headers['content-length']);
      }
      if (response.headers['content-range']) {
        reply.header('Content-Range', response.headers['content-range']);
      }
      if (response.headers['accept-ranges']) {
        reply.header('Accept-Ranges', response.headers['accept-ranges']);
      }

      reply.code(response.status);
      return reply.send(response.data);
    } catch (error: any) {
      console.error('[Proxy] Error streaming:', error.message);

      if (error.response) {
        return reply.status(error.response.status).send({
          error: 'Failed to fetch stream',
          details: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal proxy error',
        details: error.message,
      });
    }
  });

  // Handle OPTIONS for CORS preflight
  fastify.options('/stream', async (request, reply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Range',
      )
      .code(204)
      .send();
  });

  // Image proxy endpoint for bypassing CORS/hotlink protection
  fastify.get('/image', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, referer } = request.query as { url: string; referer?: string };

    if (!url) {
      return reply.status(400).send({ error: 'URL parameter is required' });
    }

    try {
      // Determine the correct referer based on the image URL
      let effectiveReferer = referer;
      if (!effectiveReferer) {
        // Auto-detect referer from URL domain
        try {
          const urlObj = new URL(url);
          effectiveReferer = urlObj.origin + '/';
        } catch {
          effectiveReferer = 'https://manhuaplus.top/';
        }
      }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Referer: effectiveReferer,
          Origin: new URL(effectiveReferer).origin,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'sec-ch-ua':
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'cross-site',
        },
        timeout: 30000,
      });

      // Enable CORS
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');

      // Set content type from response
      const contentType = response.headers['content-type'] || 'image/webp';
      reply.header('Content-Type', contentType);

      // Cache the image
      reply.header('Cache-Control', 'public, max-age=86400');

      return reply.send(Buffer.from(response.data));
    } catch (error: any) {
      console.error('[Proxy] Error fetching image:', error.message);

      if (error.response) {
        return reply.status(error.response.status).send({
          error: 'Failed to fetch image',
          details: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal proxy error',
        details: error.message,
      });
    }
  });

  // Handle OPTIONS for image CORS preflight
  fastify.options('/image', async (request, reply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept',
      )
      .code(204)
      .send();
  });
};

export default routes;

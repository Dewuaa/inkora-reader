import { FastifyInstance, RegisterOptions } from 'fastify';
import BrowserService from '../../services/BrowserService';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  fastify.get('/test-puppeteer', async (request, reply) => {
    try {
      const url = (request.query as { url?: string }).url || 'https://example.com';
      const content = await BrowserService.scrape(url, 'h1');
      reply.status(200).send({ message: 'Success', preview: content.substring(0, 200) });
    } catch (err: any) {
      reply.status(500).send({ message: 'Puppeteer failed', error: err.message });
    }
  });
};

export default routes;

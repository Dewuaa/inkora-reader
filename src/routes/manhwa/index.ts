import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import { PROVIDERS_LIST } from '@consumet/extensions';
import asurascans from './asurascans';
import weebcentral from './weebcentral';
import mangadex from './mangadex';
import comick from './comick';
import manhuaus from './manhuaus';
import manhuaplus from './manhuaplus';
import mgeko from './mgeko';
import unified from './unified';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  // Register unified provider first (with fallback system)
  await fastify.register(unified, { prefix: '/unified' });

  // Individual providers
  await fastify.register(mgeko, { prefix: '/mgeko' });
  await fastify.register(asurascans, { prefix: '/asurascans' });
  await fastify.register(weebcentral, { prefix: '/weebcentral' });
  await fastify.register(mangadex, { prefix: '/mangadex' });
  await fastify.register(comick, { prefix: '/comick' });
  await fastify.register(manhuaus, { prefix: '/manhuaus' });
  await fastify.register(manhuaplus, { prefix: '/manhuaplus' });

  fastify.get('/', async (request: any, reply: any) => {
    reply.status(200).send('Welcome to Consumet Manhwa');
  });

  fastify.get(
    '/:manhwaProvider',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queries: { manhwaProvider: string; page: number } = {
        manhwaProvider: '',
        page: 1,
      };

      queries.manhwaProvider = decodeURIComponent(
        (request.params as { manhwaProvider: string; page: number }).manhwaProvider,
      );

      queries.page = (request.query as { manhwaProvider: string; page: number }).page;

      if (queries.page! < 1) queries.page = 1;

      const provider = PROVIDERS_LIST.MANGA.find(
        (provider: any) => provider.toString.name === queries.manhwaProvider,
      );

      try {
        if (provider) {
          reply.redirect(`/manhwa/${provider.toString.name}`);
        } else {
          reply
            .status(404)
            .send({ message: 'Page not found, please check the provider list.' });
        }
      } catch (err) {
        reply.status(500).send('Something went wrong. Please try again later.');
      }
    },
  );
};

export default routes;

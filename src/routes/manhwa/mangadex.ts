import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import { MANGA } from '@consumet/extensions';

import cache from '../../utils/cache';
import { redis, REDIS_TTL } from '../../main';
import { Redis } from 'ioredis';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const mangadex = new MANGA.MangaDex();

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro: `Welcome to the MangaDex provider: check out the provider's website @ ${mangadex.toString.baseUrl}`,
      routes: ['/:query', '/info', '/read'],
      documentation: 'https://docs.consumet.org/#tag/mangadex',
    });
  });

  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.params as { query: string };

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `mangadex:search:${query}`,
            () => mangadex.search(query),
            REDIS_TTL,
          )
        : await mangadex.search(query);

      reply.status(200).send(res);
    } catch {
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
      });
    }
  });

  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.query as { id: string }).id;

    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `mangadex:info:${id}`,
            () => mangadex.fetchMangaInfo(id),
            REDIS_TTL,
          )
        : await mangadex.fetchMangaInfo(id);

      reply.status(200).send(res);
    } catch {
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
      });
    }
  });

  fastify.get('/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const chapterId = (request.query as { chapterId: string }).chapterId;

    if (!chapterId) return reply.status(400).send({ message: 'chapterId is required' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `mangadex:read:${chapterId}`,
            () => mangadex.fetchChapterPages(chapterId),
            REDIS_TTL,
          )
        : await mangadex.fetchChapterPages(chapterId);

      reply.status(200).send(res);
    } catch {
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
      });
    }
  });
};

export default routes;

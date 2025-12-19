import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';

/**
 * Unified Provider System
 *
 * This module provides a fallback system that tries multiple providers
 * in order until one returns valid data. This ensures users always get
 * content even if the primary provider is down or missing the manhwa.
 *
 * Provider Priority:
 * 1. ManhuaPlus (primary) - Good content, fast search
 * 2. ManhuaUS (fallback) - Good alternative with Madara theme
 *
 * The response always includes `provider` field so frontend knows
 * which source the data came from for subsequent requests.
 */

interface ProviderConfig {
  name: string;
  baseUrl: string;
  priority: number;
}

const PROVIDERS: ProviderConfig[] = [
  { name: 'manhuaplus', baseUrl: '/manhwa/manhuaplus', priority: 1 },
  { name: 'manhuaus', baseUrl: '/manhwa/manhuaus', priority: 2 },
];

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  // Helper to make internal requests to other provider routes
  const fetchFromProvider = async (
    provider: string,
    endpoint: string,
    params: Record<string, string> = {},
  ) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manhwa/${provider}${endpoint}${queryString ? `?${queryString}` : ''}`;

    try {
      const response = await fastify.inject({
        method: 'GET',
        url,
      });

      if (response.statusCode === 200) {
        const data = JSON.parse(response.payload);
        return { success: true, data, provider };
      }
      return { success: false, error: `Status ${response.statusCode}`, provider };
    } catch (error: any) {
      return { success: false, error: error.message, provider };
    }
  };

  // Validate if manhwa info is valid (has required fields and chapters)
  const isValidManhwaInfo = (data: any): boolean => {
    if (!data) return false;
    if (!data.title || data.title.trim() === '') return false;
    if (!data.chapters || !Array.isArray(data.chapters)) return false;
    if (data.chapters.length === 0) return false;
    return true;
  };

  // Validate if search results are valid
  const isValidSearchResults = (data: any): boolean => {
    if (!data) return false;
    if (!data.results || !Array.isArray(data.results)) return false;
    return data.results.length > 0;
  };

  // Validate if chapter pages are valid
  const isValidChapterPages = (data: any): boolean => {
    if (!data || !Array.isArray(data)) return false;
    if (data.length === 0) return false;
    // Check if at least one page has a valid image
    return data.some((page: any) => page.img && page.img.trim() !== '');
  };

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro: 'Unified Manhwa Provider with Automatic Fallback',
      description: 'Automatically tries multiple providers until valid data is found',
      providers: PROVIDERS.map((p) => p.name),
      routes: [
        '/info?id={id} - Get manhwa info with fallback',
        '/read?chapterId={chapterId}&provider={provider} - Read chapter (provider required)',
        '/search?query={query}&page={page} - Search across providers',
        '/latest?page={page} - Get latest updates',
        '/advanced-search?query={query}&page={page}&status={status}&sort={sort}&genres={genres}',
      ],
    });
  });

  /**
   * Unified Info Endpoint
   * Tries each provider in order until valid manhwa info is found
   */
  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.query as { id: string };

    if (!id) {
      return reply.status(400).send({ message: 'id is required' });
    }

    console.log(`[Unified] Fetching info for: ${id}`);
    const errors: string[] = [];

    // Try each provider in priority order
    for (const provider of PROVIDERS) {
      console.log(`[Unified] Trying provider: ${provider.name}`);

      const result = await fetchFromProvider(provider.name, '/info', { id });

      if (result.success && isValidManhwaInfo(result.data)) {
        console.log(
          `[Unified] Success with ${provider.name} - ${result.data.chapters?.length || 0} chapters`,
        );

        return reply.status(200).send({
          ...result.data,
          provider: provider.name, // Include provider for subsequent requests
          _fallback: provider.priority > 1, // Indicate if fallback was used
        });
      } else {
        const errorMsg = result.success
          ? `Invalid data (no chapters or title)`
          : result.error;
        errors.push(`${provider.name}: ${errorMsg}`);
        console.log(`[Unified] Failed with ${provider.name}: ${errorMsg}`);
      }
    }

    // All providers failed
    console.log(`[Unified] All providers failed for: ${id}`);
    return reply.status(404).send({
      message: 'Manhwa not found on any provider',
      errors,
      triedProviders: PROVIDERS.map((p) => p.name),
    });
  });

  /**
   * Unified Read Endpoint
   * Requires provider parameter (from info response) to ensure consistency
   * Also supports fallback if specified provider fails
   */
  fastify.get('/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { chapterId, provider: preferredProvider } = request.query as {
      chapterId: string;
      provider?: string;
    };

    if (!chapterId) {
      return reply.status(400).send({ message: 'chapterId is required' });
    }

    console.log(
      `[Unified] Reading chapter: ${chapterId}, preferred: ${preferredProvider || 'none'}`,
    );

    // Build provider order - preferred first, then others
    let providerOrder = [...PROVIDERS];
    if (preferredProvider) {
      providerOrder = [
        ...PROVIDERS.filter((p) => p.name === preferredProvider),
        ...PROVIDERS.filter((p) => p.name !== preferredProvider),
      ];
    }

    const errors: string[] = [];

    for (const provider of providerOrder) {
      console.log(`[Unified] Trying read with: ${provider.name}`);

      const result = await fetchFromProvider(provider.name, '/read', { chapterId });

      if (result.success && isValidChapterPages(result.data)) {
        console.log(
          `[Unified] Read success with ${provider.name} - ${result.data.length} pages`,
        );

        // Add provider info to each page for image proxying if needed
        const pagesWithProvider = result.data.map((page: any) => ({
          ...page,
          provider: provider.name,
        }));

        return reply.status(200).send(pagesWithProvider);
      } else {
        const errorMsg = result.success ? `No valid pages found` : result.error;
        errors.push(`${provider.name}: ${errorMsg}`);
        console.log(`[Unified] Read failed with ${provider.name}: ${errorMsg}`);
      }
    }

    return reply.status(404).send({
      message: 'Chapter not found on any provider',
      errors,
    });
  });

  /**
   * Unified Search Endpoint
   * Searches primary provider first, falls back if no results
   */
  fastify.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, page } = request.query as { query: string; page?: string };

    if (!query) {
      return reply.status(400).send({ message: 'query is required' });
    }

    const pageNum = page || '1';
    console.log(`[Unified] Searching: "${query}" page ${pageNum}`);

    for (const provider of PROVIDERS) {
      const result = await fetchFromProvider(
        provider.name,
        `/${encodeURIComponent(query)}`,
        { page: pageNum },
      );

      if (result.success && isValidSearchResults(result.data)) {
        console.log(
          `[Unified] Search success with ${provider.name} - ${result.data.results.length} results`,
        );

        // Add provider to each result
        const resultsWithProvider = result.data.results.map((item: any) => ({
          ...item,
          provider: provider.name,
        }));

        return reply.status(200).send({
          ...result.data,
          results: resultsWithProvider,
          provider: provider.name,
        });
      }
    }

    // Return empty results if nothing found
    return reply.status(200).send({
      currentPage: parseInt(pageNum),
      hasNextPage: false,
      results: [],
      provider: PROVIDERS[0].name,
    });
  });

  /**
   * Unified Latest Endpoint
   * Gets latest from primary, falls back if empty
   */
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page } = request.query as { page?: string };
    const pageNum = page || '1';

    console.log(`[Unified] Getting latest page ${pageNum}`);

    for (const provider of PROVIDERS) {
      const result = await fetchFromProvider(provider.name, '/latest', { page: pageNum });

      if (result.success && isValidSearchResults(result.data)) {
        console.log(
          `[Unified] Latest success with ${provider.name} - ${result.data.results.length} items`,
        );

        const resultsWithProvider = result.data.results.map((item: any) => ({
          ...item,
          provider: provider.name,
        }));

        return reply.status(200).send({
          ...result.data,
          results: resultsWithProvider,
          provider: provider.name,
        });
      }
    }

    return reply.status(200).send({
      currentPage: parseInt(pageNum),
      hasNextPage: false,
      results: [],
      provider: PROVIDERS[0].name,
    });
  });

  /**
   * Unified Advanced Search Endpoint
   */
  fastify.get(
    '/advanced-search',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query, page, status, sort, genres } = request.query as {
        query?: string;
        page?: string;
        status?: string;
        sort?: string;
        genres?: string;
      };

      const params: Record<string, string> = {};
      if (query) params.query = query;
      if (page) params.page = page;
      if (status) params.status = status;
      if (sort) params.sort = sort;
      if (genres) params.genres = genres;

      console.log(`[Unified] Advanced search:`, params);

      for (const provider of PROVIDERS) {
        const result = await fetchFromProvider(provider.name, '/advanced-search', params);

        if (result.success && isValidSearchResults(result.data)) {
          console.log(`[Unified] Advanced search success with ${provider.name}`);

          const resultsWithProvider = result.data.results.map((item: any) => ({
            ...item,
            provider: provider.name,
          }));

          return reply.status(200).send({
            ...result.data,
            results: resultsWithProvider,
            provider: provider.name,
          });
        }
      }

      return reply.status(200).send({
        currentPage: parseInt(params.page || '1'),
        hasNextPage: false,
        results: [],
        provider: PROVIDERS[0].name,
      });
    },
  );

  /**
   * Unified Genre Endpoint
   */
  fastify.get('/genre/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    const { page } = request.query as { page?: string };
    const pageNum = page || '1';

    console.log(`[Unified] Genre: ${slug} page ${pageNum}`);

    for (const provider of PROVIDERS) {
      const result = await fetchFromProvider(
        provider.name,
        `/genre/${encodeURIComponent(slug)}`,
        { page: pageNum },
      );

      if (result.success && isValidSearchResults(result.data)) {
        console.log(`[Unified] Genre success with ${provider.name}`);

        const resultsWithProvider = result.data.results.map((item: any) => ({
          ...item,
          provider: provider.name,
        }));

        return reply.status(200).send({
          ...result.data,
          results: resultsWithProvider,
          provider: provider.name,
        });
      }
    }

    return reply.status(200).send({
      currentPage: parseInt(pageNum),
      hasNextPage: false,
      results: [],
      provider: PROVIDERS[0].name,
    });
  });

  /**
   * Unified Genres List Endpoint
   */
  fastify.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    console.log(`[Unified] Getting genres list`);

    for (const provider of PROVIDERS) {
      const result = await fetchFromProvider(provider.name, '/genres', {});

      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        console.log(`[Unified] Genres success with ${provider.name}`);
        return reply.status(200).send(result.data);
      }
    }

    return reply.status(200).send([]);
  });

  /**
   * Unified Search by Query Path (/:query)
   * This must be LAST as it's a catch-all pattern
   * Matches: /manhwa/unified/solo-leveling?page=1
   */
  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.params as { query: string };
    const { page } = request.query as { page?: string };
    const pageNum = page || '1';

    console.log(`[Unified] Path search: "${query}" page ${pageNum}`);

    for (const provider of PROVIDERS) {
      const result = await fetchFromProvider(
        provider.name,
        `/${encodeURIComponent(query)}`,
        { page: pageNum },
      );

      if (result.success && isValidSearchResults(result.data)) {
        console.log(
          `[Unified] Path search success with ${provider.name} - ${result.data.results.length} results`,
        );

        const resultsWithProvider = result.data.results.map((item: any) => ({
          ...item,
          provider: provider.name,
        }));

        return reply.status(200).send({
          ...result.data,
          results: resultsWithProvider,
          provider: provider.name,
        });
      }
    }

    return reply.status(200).send({
      currentPage: parseInt(pageNum),
      hasNextPage: false,
      results: [],
      provider: PROVIDERS[0].name,
    });
  });
};

export default routes;

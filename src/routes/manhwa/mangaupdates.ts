import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';

/**
 * MangaUpdates API Integration
 * 
 * Provides endpoints to search and fetch manga metadata from MangaUpdates.
 * Used as fallback for author/artist info when AniList doesn't have it.
 */

const MANGAUPDATES_API = 'https://api.mangaupdates.com/v1';

// Cache for MangaUpdates responses
const muCache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Search for series by title
async function searchSeries(title: string) {
  try {
    const response = await axios.post(
      `${MANGAUPDATES_API}/series/search`,
      { search: title },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('MangaUpdates search error:', error.response?.data || error.message);
    return null;
  }
}

// Get series details by ID
async function getSeriesById(seriesId: number) {
  try {
    const response = await axios.get(`${MANGAUPDATES_API}/series/${seriesId}`);
    return response.data;
  } catch (error: any) {
    console.error('MangaUpdates series error:', error.response?.data || error.message);
    return null;
  }
}

// Format MangaUpdates response to our standard format
function formatSeriesInfo(series: any) {
  // Extract authors and artists
  const authors = (series.authors || [])
    .filter((a: any) => a.type === 'Author')
    .map((a: any) => a.name);
  
  const artists = (series.authors || [])
    .filter((a: any) => a.type === 'Artist')
    .map((a: any) => a.name);

  return {
    id: String(series.series_id),
    muId: series.series_id,
    title: series.title,
    image: series.image?.url?.original || series.image?.url?.thumb,
    description: series.description || '',
    genres: (series.genres || []).map((g: any) => g.genre),
    categories: (series.categories || []).slice(0, 10).map((c: any) => c.category),
    authors,
    artists,
    year: series.year,
    status: series.status,
    type: series.type,
    bayesian_rating: series.bayesian_rating,
    rating: series.bayesian_rating ? parseFloat(series.bayesian_rating) : null,
    url: series.url,
    // Related series
    related: (series.related_series || []).slice(0, 6).map((r: any) => ({
      id: r.related_series_id,
      title: r.related_series_name,
      relation: r.relation_type,
    })),
  };
}

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  // Search series on MangaUpdates
  fastify.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q } = request.query as { q?: string };

    if (!q) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const cacheKey = `mu-search:${q}`;
    const cached = muCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      const response = await searchSeries(q);
      
      if (!response || !response.results) {
        return reply.send({ results: [] });
      }

      const results = response.results.slice(0, 10).map((r: any) => ({
        id: String(r.record.series_id),
        muId: r.record.series_id,
        title: r.record.title,
        image: r.record.image?.url?.original || r.record.image?.url?.thumb,
        year: r.record.year,
        type: r.record.type,
      }));

      const data = { results, total: response.total_hits };
      muCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('MangaUpdates search error:', error);
      return reply.status(500).send({ error: 'Failed to search MangaUpdates' });
    }
  });

  // Get series info by MangaUpdates ID
  fastify.get('/info/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const cacheKey = `mu-info:${id}`;
    const cached = muCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      const series = await getSeriesById(Number(id));

      if (!series) {
        return reply.status(404).send({ error: 'Series not found on MangaUpdates' });
      }

      const data = formatSeriesInfo(series);
      muCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('MangaUpdates info error:', error);
      return reply.status(500).send({ error: 'Failed to get MangaUpdates info' });
    }
  });

  // Match a title to MangaUpdates (return best match with author/artist)
  fastify.get('/match', async (request: FastifyRequest, reply: FastifyReply) => {
    const { title } = request.query as { title?: string };

    if (!title) {
      return reply.status(400).send({ error: 'Query parameter "title" is required' });
    }

    // Clean title for better matching
    const cleanTitle = title
      .replace(/-mg\d*$/i, '') // Remove Mgeko suffixes
      .replace(/[-_]/g, ' ')
      .trim();

    const cacheKey = `mu-match:${cleanTitle.toLowerCase()}`;
    const cached = muCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      // Search for the series
      const searchResult = await searchSeries(cleanTitle);
      
      if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
        return reply.send({ match: null, confidence: 0 });
      }

      // Get the first result (best match)
      const bestMatch = searchResult.results[0];
      const seriesId = bestMatch.record.series_id;

      // Get full series details to get author/artist
      const seriesDetails = await getSeriesById(seriesId);

      if (!seriesDetails) {
        return reply.send({ match: null, confidence: 0 });
      }

      // Calculate confidence based on title similarity
      const normalizedSearch = cleanTitle.toLowerCase();
      const resultTitle = bestMatch.record.title.toLowerCase();
      let confidence = 50;

      if (resultTitle === normalizedSearch) {
        confidence = 100;
      } else if (resultTitle.includes(normalizedSearch) || normalizedSearch.includes(resultTitle)) {
        confidence = Math.max(
          (normalizedSearch.length / resultTitle.length) * 80,
          (resultTitle.length / normalizedSearch.length) * 80
        );
      }

      const data = {
        match: formatSeriesInfo(seriesDetails),
        confidence: Math.round(confidence),
      };

      muCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('MangaUpdates match error:', error);
      return reply.status(500).send({ error: 'Failed to match on MangaUpdates' });
    }
  });
};

export default routes;

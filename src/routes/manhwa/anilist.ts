import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';

/**
 * AniList GraphQL API Integration
 * 
 * Provides endpoints to search and fetch manga metadata from AniList.
 * Used to enhance manga info with better covers, descriptions, ratings, etc.
 */

const ANILIST_API = 'https://graphql.anilist.co';

// Cache for AniList responses
const anilistCache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// GraphQL query for searching manga
const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(search: $search, type: MANGA, sort: POPULARITY_DESC) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          medium
        }
        bannerImage
        description(asHtml: false)
        genres
        tags {
          name
          rank
        }
        averageScore
        meanScore
        popularity
        status
        chapters
        volumes
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
        synonyms
        siteUrl
        staff(page: 1, perPage: 10) {
          edges {
            role
            node {
              name {
                full
              }
            }
          }
        }
      }
    }
  }
`;

// GraphQL query for getting manga by ID
const INFO_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      description(asHtml: false)
      genres
      tags {
        name
        rank
        isMediaSpoiler
      }
      averageScore
      meanScore
      popularity
      favourites
      status
      chapters
      volumes
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      synonyms
      siteUrl
      isAdult
      relations {
        edges {
          relationType
          node {
            id
            title {
              romaji
              english
            }
            coverImage {
              medium
            }
            type
            format
          }
        }
      }
      recommendations {
        nodes {
          mediaRecommendation {
            id
            title {
              romaji
              english
            }
            coverImage {
              medium
            }
            averageScore
          }
        }
      }
    }
  }
`;

// Helper to make GraphQL request to AniList
async function queryAniList(query: string, variables: Record<string, any>) {
  try {
    const response = await axios.post(
      ANILIST_API,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('AniList API error:', error.response?.data || error.message);
    throw error;
  }
}

// Helper to clean description (remove HTML tags if any slip through)
function cleanDescription(desc: string | null): string {
  if (!desc) return '';
  return desc
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// Format AniList response to our standard format
function formatMangaInfo(media: any) {
  // Extract authors and artists from staff
  const authors: string[] = [];
  const artists: string[] = [];
  
  (media.staff?.edges || []).forEach((edge: any) => {
    const name = edge.node?.name?.full;
    if (!name) return;
    
    const role = edge.role?.toLowerCase() || '';
    if (role.includes('story') || role.includes('original') || role.includes('author') || role.includes('creator')) {
      if (!authors.includes(name)) authors.push(name);
    } else if (role.includes('art') || role.includes('illustration')) {
      if (!artists.includes(name)) artists.push(name);
    }
  });

  return {
    id: String(media.id),
    anilistId: media.id,
    title: media.title.english || media.title.romaji,
    altTitles: [
      media.title.romaji,
      media.title.english,
      media.title.native,
      ...(media.synonyms || []),
    ].filter((t, i, arr) => t && arr.indexOf(t) === i), // Remove duplicates
    image: media.coverImage?.large || media.coverImage?.extraLarge,
    cover: media.bannerImage || media.coverImage?.extraLarge,
    description: cleanDescription(media.description),
    genres: media.genres || [],
    tags: (media.tags || [])
      .filter((t: any) => !t.isMediaSpoiler && t.rank > 50)
      .map((t: any) => t.name)
      .slice(0, 10),
    rating: media.averageScore ? media.averageScore / 10 : null, // Convert to 0-10 scale
    popularity: media.popularity,
    status: media.status?.toLowerCase() || 'unknown',
    totalChapters: media.chapters,
    totalVolumes: media.volumes,
    startDate: media.startDate?.year
      ? `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, '0')}-${String(media.startDate.day || 1).padStart(2, '0')}`
      : null,
    endDate: media.endDate?.year
      ? `${media.endDate.year}-${String(media.endDate.month || 1).padStart(2, '0')}-${String(media.endDate.day || 1).padStart(2, '0')}`
      : null,
    isAdult: media.isAdult || false,
    siteUrl: media.siteUrl,
    authors: authors.length > 0 ? authors : undefined,
    artists: artists.length > 0 ? artists : undefined,
    relations: (media.relations?.edges || []).map((edge: any) => ({
      relationType: edge.relationType,
      id: edge.node.id,
      title: edge.node.title.english || edge.node.title.romaji,
      image: edge.node.coverImage?.medium,
      type: edge.node.type,
      format: edge.node.format,
    })),
    recommendations: (media.recommendations?.nodes || [])
      .filter((n: any) => n.mediaRecommendation)
      .slice(0, 6)
      .map((n: any) => ({
        id: n.mediaRecommendation.id,
        title: n.mediaRecommendation.title.english || n.mediaRecommendation.title.romaji,
        image: n.mediaRecommendation.coverImage?.medium,
        rating: n.mediaRecommendation.averageScore ? n.mediaRecommendation.averageScore / 10 : null,
      })),
  };
}

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  // Search manga on AniList
  fastify.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, page = 1, perPage = 20 } = request.query as {
      q?: string;
      page?: number;
      perPage?: number;
    };

    if (!q) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const cacheKey = `search:${q}:${page}:${perPage}`;
    const cached = anilistCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      const response = await queryAniList(SEARCH_QUERY, {
        search: q,
        page: Number(page),
        perPage: Math.min(Number(perPage), 50),
      });

      const pageInfo = response.data?.Page?.pageInfo;
      const results = (response.data?.Page?.media || []).map(formatMangaInfo);

      const data = {
        currentPage: pageInfo?.currentPage || page,
        hasNextPage: pageInfo?.hasNextPage || false,
        totalResults: pageInfo?.total || results.length,
        totalPages: pageInfo?.lastPage || 1,
        results,
      };

      anilistCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('AniList search error:', error);
      return reply.status(500).send({ error: 'Failed to search AniList' });
    }
  });

  // Get manga info by AniList ID
  fastify.get('/info/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const cacheKey = `info:${id}`;
    const cached = anilistCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      const response = await queryAniList(INFO_QUERY, { id: Number(id) });
      const media = response.data?.Media;

      if (!media) {
        return reply.status(404).send({ error: 'Manga not found on AniList' });
      }

      const data = formatMangaInfo(media);
      anilistCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('AniList info error:', error);
      return reply.status(500).send({ error: 'Failed to get AniList info' });
    }
  });

  // Match a title to AniList (fuzzy search, return best match)
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

    const cacheKey = `match:${cleanTitle.toLowerCase()}`;
    const cached = anilistCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      const response = await queryAniList(SEARCH_QUERY, {
        search: cleanTitle,
        page: 1,
        perPage: 5,
      });

      const results = response.data?.Page?.media || [];
      
      if (results.length === 0) {
        return reply.send({ match: null, confidence: 0 });
      }

      // Find best match by title similarity
      const normalizedSearch = cleanTitle.toLowerCase();
      let bestMatch = results[0];
      let bestScore = 0;

      for (const result of results) {
        const titles = [
          result.title.romaji?.toLowerCase(),
          result.title.english?.toLowerCase(),
          ...(result.synonyms || []).map((s: string) => s.toLowerCase()),
        ].filter(Boolean);

        for (const t of titles) {
          // Exact match
          if (t === normalizedSearch) {
            bestMatch = result;
            bestScore = 100;
            break;
          }
          // Contains match
          if (t.includes(normalizedSearch) || normalizedSearch.includes(t)) {
            const score = Math.max(
              (normalizedSearch.length / t.length) * 80,
              (t.length / normalizedSearch.length) * 80
            );
            if (score > bestScore) {
              bestMatch = result;
              bestScore = score;
            }
          }
        }
        if (bestScore === 100) break;
      }

      // If no good match found, use first result with lower confidence
      if (bestScore === 0) {
        bestScore = 50;
      }

      const data = {
        match: formatMangaInfo(bestMatch),
        confidence: Math.round(bestScore),
      };

      anilistCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('AniList match error:', error);
      return reply.status(500).send({ error: 'Failed to match on AniList' });
    }
  });

  // Get trending manga from AniList
  fastify.get('/trending', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page = 1, perPage = 20 } = request.query as {
      page?: number;
      perPage?: number;
    };

    const cacheKey = `trending:${page}:${perPage}`;
    const cached = anilistCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return reply.send(cached.data);
    }

    const TRENDING_QUERY = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            currentPage
            lastPage
            hasNextPage
          }
          media(type: MANGA, sort: TRENDING_DESC) {
            id
            title { romaji english }
            coverImage { large }
            description(asHtml: false)
            genres
            averageScore
            status
          }
        }
      }
    `;

    try {
      const response = await queryAniList(TRENDING_QUERY, {
        page: Number(page),
        perPage: Math.min(Number(perPage), 50),
      });

      const pageInfo = response.data?.Page?.pageInfo;
      const results = (response.data?.Page?.media || []).map(formatMangaInfo);

      const data = {
        currentPage: pageInfo?.currentPage || page,
        hasNextPage: pageInfo?.hasNextPage || false,
        totalResults: pageInfo?.total || results.length,
        totalPages: pageInfo?.lastPage || 1,
        results,
      };

      anilistCache.set(cacheKey, { data, timestamp: Date.now() });
      return reply.send(data);
    } catch (error: any) {
      console.error('AniList trending error:', error);
      return reply.status(500).send({ error: 'Failed to get trending' });
    }
  });
};

export default routes;

import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';

/**
 * Custom MangaDex Scraper using Official API
 * 
 * MangaDex provides a free, official API that's much more reliable than web scraping.
 * API Docs: https://api.mangadex.org/docs/
 * 
 * Features:
 * - 100,000+ manga/manhwa titles
 * - Multiple languages
 * - Official translations
 * - High-quality images
 */

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const baseUrl = 'https://api.mangadex.org';
  const imageBaseUrl = 'https://uploads.mangadex.org';

  // Create axios client with proper headers
  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timeout: 30000,
  });

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro: 'Welcome to the MangaDex provider (Custom API Integration)',
      routes: ['/:query', '/info', '/read', '/latest', '/genres', '/genre/:slug'],
      documentation: 'Custom scraper using MangaDex official API',
    });
  });

  // Search
  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.params as { query: string };
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    try {
      // Search for manga with Korean demographic (manhwa)
      const response = await client.get('/manga', {
        params: {
          title: query,
          limit,
          offset,
          'includes[]': ['cover_art', 'author', 'artist'],
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'order[relevance]': 'desc',
        },
      });

      const results: any[] = [];

      for (const manga of response.data.data) {
        // Get cover art
        const coverArt = manga.relationships.find((rel: any) => rel.type === 'cover_art');
        const coverFileName = coverArt?.attributes?.fileName;
        const image = coverFileName
          ? `${imageBaseUrl}/covers/${manga.id}/${coverFileName}.256.jpg`
          : '';

        // Get latest chapter info
        const latestChapter = manga.attributes.lastChapter || 'Unknown';

        results.push({
          id: manga.id,
          title: manga.attributes.title.en || manga.attributes.title['ja-ro'] || Object.values(manga.attributes.title)[0],
          image,
          latestChapter: latestChapter ? `Chapter ${latestChapter}` : 'Unknown',
          status: manga.attributes.status === 'ongoing' ? 'Ongoing' : manga.attributes.status === 'completed' ? 'Completed' : 'Unknown',
          rating: manga.attributes.contentRating,
        });
      }

      const hasNextPage = response.data.total > offset + limit;

      console.log(`[MangaDex] Search for "${query}" found ${results.length} items`);

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[MangaDex] Search error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get latest updates
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    try {
      // Get recently updated manga
      const response = await client.get('/manga', {
        params: {
          limit,
          offset,
          'includes[]': ['cover_art'],
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'order[latestUploadedChapter]': 'desc',
        },
      });

      const results: any[] = [];

      for (const manga of response.data.data) {
        const coverArt = manga.relationships.find((rel: any) => rel.type === 'cover_art');
        const coverFileName = coverArt?.attributes?.fileName;
        const image = coverFileName
          ? `${imageBaseUrl}/covers/${manga.id}/${coverFileName}.256.jpg`
          : '';

        const latestChapter = manga.attributes.lastChapter || 'Unknown';

        results.push({
          id: manga.id,
          title: manga.attributes.title.en || manga.attributes.title['ja-ro'] || Object.values(manga.attributes.title)[0],
          image,
          latestChapter: latestChapter ? `Chapter ${latestChapter}` : 'Unknown',
          status: manga.attributes.status === 'ongoing' ? 'Ongoing' : manga.attributes.status === 'completed' ? 'Completed' : 'Unknown',
        });
      }

      const hasNextPage = response.data.total > offset + limit;

      console.log(`[MangaDex] Latest page ${pageNum} found ${results.length} items`);

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[MangaDex] Latest error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get manga info
  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.query as { id: string };

    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      // Get manga details - use URL parameters directly
      const mangaUrl = `${baseUrl}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`;
      const mangaResponse = await axios.get(mangaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const manga = mangaResponse.data.data;

      // Get cover art
      const coverArt = manga.relationships.find((rel: any) => rel.type === 'cover_art');
      const coverFileName = coverArt?.attributes?.fileName;
      const image = coverFileName
        ? `${imageBaseUrl}/covers/${manga.id}/${coverFileName}.512.jpg`
        : '';

      // Get authors
      const authors: string[] = [];
      manga.relationships
        .filter((rel: any) => rel.type === 'author' || rel.type === 'artist')
        .forEach((rel: any) => {
          if (rel.attributes?.name && !authors.includes(rel.attributes.name)) {
            authors.push(rel.attributes.name);
          }
        });

      // Get genres
      const genres = manga.attributes.tags
        .filter((tag: any) => tag.attributes.group === 'genre')
        .map((tag: any) => tag.attributes.name.en);

      // Get chapters - use URL parameters directly
      const chaptersUrl = `${baseUrl}/chapter?manga=${id}&limit=500&translatedLanguage[]=en&order[chapter]=desc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const chaptersResponse = await axios.get(chaptersUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const chapters: any[] = [];
      const seenChapters = new Set();

      for (const chapter of chaptersResponse.data.data) {
        const chapterNum = chapter.attributes.chapter;
        if (!chapterNum || seenChapters.has(chapterNum)) continue;
        
        seenChapters.add(chapterNum);
        chapters.push({
          id: chapter.id,
          title: chapter.attributes.title || `Chapter ${chapterNum}`,
          releaseDate: chapter.attributes.publishAt || new Date().toISOString(),
        });
      }

      console.log(`[MangaDex] Info for "${id}": ${chapters.length} chapters`);

      reply.status(200).send({
        id: manga.id,
        title: manga.attributes.title.en || manga.attributes.title['ja-ro'] || Object.values(manga.attributes.title)[0],
        image,
        description: manga.attributes.description.en || Object.values(manga.attributes.description)[0] || 'No description available',
        status: manga.attributes.status === 'ongoing' ? 'Ongoing' : manga.attributes.status === 'completed' ? 'Completed' : 'Unknown',
        authors,
        genres,
        chapters,
        rating: manga.attributes.contentRating,
        releaseDate: manga.attributes.year?.toString(),
      });
    } catch (error: any) {
      console.error('[MangaDex] Info error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get chapter pages
  fastify.get('/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { chapterId } = request.query as { chapterId: string };

    if (!chapterId) return reply.status(400).send({ message: 'chapterId is required' });

    try {
      // Get chapter server info
      const serverResponse = await client.get(`/at-home/server/${chapterId}`);
      const baseUrlServer = serverResponse.data.baseUrl;
      const hash = serverResponse.data.chapter.hash;
      const images = serverResponse.data.chapter.data;

      const pages: any[] = images.map((filename: string, index: number) => ({
        page: index + 1,
        img: `${baseUrlServer}/data/${hash}/${filename}`,
      }));

      console.log(`[MangaDex] Read "${chapterId}": ${pages.length} pages`);

      reply.status(200).send(pages);
    } catch (error: any) {
      console.error('[MangaDex] Read error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get genres
  fastify.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // MangaDex uses tags as genres
      const response = await client.get('/manga/tag');
      
      const genres = response.data.data
        .filter((tag: any) => tag.attributes.group === 'genre')
        .map((tag: any) => ({
          name: tag.attributes.name.en,
          slug: tag.id,
        }));

      console.log(`[MangaDex] Found ${genres.length} genres`);

      reply.status(200).send({
        genres: genres.sort((a: any, b: any) => a.name.localeCompare(b.name)),
      });
    } catch (error: any) {
      console.error('[MangaDex] Genres error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get genre
  fastify.get('/genre/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    try {
      const response = await client.get('/manga', {
        params: {
          'includedTags[]': [slug],
          limit,
          offset,
          'includes[]': ['cover_art'],
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'order[followedCount]': 'desc',
        },
      });

      const results: any[] = [];

      for (const manga of response.data.data) {
        const coverArt = manga.relationships.find((rel: any) => rel.type === 'cover_art');
        const coverFileName = coverArt?.attributes?.fileName;
        const image = coverFileName
          ? `${imageBaseUrl}/covers/${manga.id}/${coverFileName}.256.jpg`
          : '';

        results.push({
          id: manga.id,
          title: manga.attributes.title.en || manga.attributes.title['ja-ro'] || Object.values(manga.attributes.title)[0],
          image,
          latestChapter: manga.attributes.lastChapter ? `Chapter ${manga.attributes.lastChapter}` : 'Unknown',
          status: manga.attributes.status === 'ongoing' ? 'Ongoing' : 'Completed',
        });
      }

      const hasNextPage = response.data.total > offset + limit;

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[MangaDex] Genre error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });
};

export default routes;

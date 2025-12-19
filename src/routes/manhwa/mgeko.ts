import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Custom Mgeko Scraper - Enhanced Version
 *
 * Mgeko.cc is a fast-updating manga/manhwa/manhua site with:
 * - Huge library with frequent updates
 * - Clean HTML structure
 * - No ads
 * - English interface
 *
 * URL Patterns:
 * - Homepage: https://www.mgeko.cc/
 * - Browse: https://www.mgeko.cc/browse-comics/
 * - Manga: https://www.mgeko.cc/manga/[slug]/
 * - Reader: https://www.mgeko.cc/reader/en/[slug]-chapter-[num]/
 * - Jumbo (Updates): https://www.mgeko.cc/jumbo/manga/
 *
 * Features:
 * - Rating extraction from manga pages
 * - Views count parsing (1.7M, 500K formats)
 * - Genre extraction for accurate filtering
 * - Chapter release date tracking
 * - Popular/trending rankings
 */

// Simple in-memory cache for popular manga info
const popularCache: {
  data: any[];
  timestamp: number;
  ttl: number;
} = {
  data: [],
  timestamp: 0,
  ttl: 30 * 60 * 1000, // 30 minutes cache
};

// Genre cache
const genreCache: Map<string, { data: any[]; timestamp: number }> = new Map();
const GENRE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const baseUrl = 'https://www.mgeko.cc';

  // Create axios client
  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timeout: 30000,
  });

  // Helper function to parse view counts like "1.7M", "500K", "12.3K"
  const parseViewCount = (viewStr: string): number => {
    if (!viewStr) return 0;
    const cleaned = viewStr.trim().toUpperCase();
    const match = cleaned.match(/([\d.]+)\s*([KMB])?/);
    if (!match) return 0;

    const num = parseFloat(match[1]);
    const suffix = match[2];

    switch (suffix) {
      case 'K':
        return Math.round(num * 1000);
      case 'M':
        return Math.round(num * 1000000);
      case 'B':
        return Math.round(num * 1000000000);
      default:
        return Math.round(num);
    }
  };

  // Helper to fix image URLs
  const fixImageUrl = (image: string): string => {
    if (!image) return '';
    if (image.includes('placeholder')) return '';

    // Already using imgsrv4.com
    if (image.includes('imgsrv4.com')) return image;

    // Convert mgeko media URLs
    if (image.includes('mgeko.cc/media/')) {
      return image.replace(
        /https?:\/\/(www\.)?mgeko\.cc\/media\//,
        'https://imgsrv4.com/avatar/157x211/media/',
      );
    }

    // Handle relative URLs
    if (!image.startsWith('http')) {
      return image.startsWith('/')
        ? `https://imgsrv4.com/avatar/157x211${image}`
        : `https://imgsrv4.com/avatar/157x211/${image}`;
    }

    return image;
  };

  // Helper to extract chapter number
  const extractChapterNumber = (text: string): string => {
    if (!text) return '';
    const match = text.match(/chapter[- ]?(\d+(?:\.\d+)?)/i);
    return match ? `Chapter ${match[1]}` : '';
  };

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro: 'Welcome to the Mgeko provider (Enhanced Custom Scraper)',
      routes: [
        '/:query',
        '/info',
        '/read',
        '/latest',
        '/popular',
        '/trending',
        '/new-releases',
        '/genres',
        '/genre/:slug',
        '/advanced-search',
      ],
      documentation:
        'Enhanced custom scraper for mgeko.cc with ratings, views, and genre filtering',
    });
  });

  // Get latest updates from homepage
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    try {
      const url = pageNum === 1 ? '/' : `/?page=${pageNum}`;
      const response = await client.get(url);
      const $ = cheerio.load(response.data);

      const results: any[] = [];

      $('li.novel-item').each((_, el) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        if (!href) return;

        const id = href.replace('/manga/', '').replace('/', '');
        const title =
          $(el).find('h4.novel-title').text().trim() ||
          $(el).find('.novel-title').text().trim();

        const img = $(el).find('img').first();
        const rawImage = img.attr('data-src') || img.attr('src') || '';
        const image = fixImageUrl(rawImage);

        if (!image) return;

        // Get latest chapter
        const chapterEl = $(el).find('.chapter-title, h5.chapter-title').first();
        const rawChapter = chapterEl.text().trim();
        const latestChapter = extractChapterNumber(rawChapter) || 'New Update';

        if (title) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            status: 'Ongoing',
            updatedAt: new Date().toISOString(),
          });
        }
      });

      console.log(`[Mgeko] Latest page ${pageNum} found ${results.length} items`);

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: results.length >= 20,
        totalResults: results.length,
        results,
      });
    } catch (error: any) {
      console.error('[Mgeko] Latest error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get popular manga (uses jumbo/manga page which has featured/popular series)
  fastify.get('/popular', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    try {
      // Use jumbo/manga page which has featured/trending content
      const url = pageNum === 1 ? '/jumbo/manga/' : `/jumbo/manga/?page=${pageNum}`;
      const response = await client.get(url);
      const $ = cheerio.load(response.data);

      const results: any[] = [];

      // Scrape featured swiper items (most popular)
      $('li.novel-item, li.swiper-slide.novel-item').each((_, el) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        if (!href) return;

        const id = href.replace('/manga/', '').replace('/', '');
        const title =
          $(el).find('h4.novel-title').text().trim() ||
          $(el).find('.novel-title').text().trim() ||
          link.attr('title') ||
          '';

        const img = $(el).find('img').first();
        const rawImage = img.attr('data-src') || img.attr('src') || '';
        const image = fixImageUrl(rawImage);

        if (!image || !title) return;

        // Avoid duplicates
        if (results.some((r) => r.id === id)) return;

        const chapterEl = $(el).find('.chapter-title, h5.chapter-title').first();
        const rawChapter = chapterEl.text().trim();
        const latestChapter = extractChapterNumber(rawChapter) || 'Latest';

        results.push({
          id,
          title,
          image,
          latestChapter,
          status: 'Ongoing',
          isPopular: true,
        });
      });

      console.log(`[Mgeko] Popular page ${pageNum} found ${results.length} items`);

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: results.length >= 20,
        totalResults: results.length,
        results,
      });
    } catch (error: any) {
      console.error('[Mgeko] Popular error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get trending manga - Note: browse-comics is JS-rendered, so we use search with popular terms
  fastify.get('/trending', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, period } = request.query as { page?: string; period?: string };
    const pageNum = page ? parseInt(page) : 1;

    // Since browse-comics is JS-rendered, we use search with popular genre terms
    // to get trending-like results
    const trendingTerms = [
      'martial arts',
      'reincarnation',
      'system',
      'leveling',
      'regression',
    ];
    const termIndex = (pageNum - 1) % trendingTerms.length;
    const searchTerm = trendingTerms[termIndex];

    try {
      // Use search endpoint which is server-rendered
      const url = `/search/?search=${encodeURIComponent(searchTerm)}${pageNum > 1 ? `&page=${Math.ceil(pageNum / trendingTerms.length)}` : ''}`;
      const response = await client.get(url);
      const $ = cheerio.load(response.data);

      const results: any[] = [];

      $('li.novel-item').each((_, el) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        if (!href) return;

        const id = href.replace('/manga/', '').replace('/', '');
        const title =
          $(el).find('h4.novel-title').text().trim() ||
          $(el).find('.novel-title').text().trim();

        const img = $(el).find('img').first();
        const rawImage = img.attr('data-src') || img.attr('src') || '';
        const image = fixImageUrl(rawImage);

        if (!image || !title) return;

        // Avoid duplicates
        if (results.some((r) => r.id === id)) return;

        const chapterEl = $(el).find('.chapter-title, h5.chapter-title').first();
        const rawChapter = chapterEl.text().trim();
        const latestChapter = extractChapterNumber(rawChapter) || 'Latest';

        results.push({
          id,
          title,
          image,
          latestChapter,
          status: 'Ongoing',
          isTrending: true,
        });
      });

      console.log(
        `[Mgeko] Trending (term: ${searchTerm}) page ${pageNum} found ${results.length} items`,
      );

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: results.length >= 20,
        totalResults: results.length,
        results,
      });
    } catch (error: any) {
      console.error('[Mgeko] Trending error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Search
  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.params as { query: string };
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    try {
      const url = `/search/?search=${encodeURIComponent(query)}${pageNum > 1 ? `&page=${pageNum}` : ''}`;
      const response = await client.get(url);
      const $ = cheerio.load(response.data);

      const results: any[] = [];

      $('li.novel-item').each((_, el) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        if (!href) return;

        const id = href.replace('/manga/', '').replace('/', '');
        const title =
          $(el).find('h4.novel-title').text().trim() ||
          $(el).find('.novel-title').text().trim();

        const img = $(el).find('img').first();
        const rawImage = img.attr('data-src') || img.attr('src') || '';
        const image = fixImageUrl(rawImage);

        if (!image || !title) return;

        const chapterEl = $(el).find('.chapter-title, h5.chapter-title').first();
        const rawChapter = chapterEl.text().trim();
        const latestChapter = extractChapterNumber(rawChapter) || 'New';

        results.push({
          id,
          title,
          image,
          latestChapter,
          status: 'Ongoing',
        });
      });

      console.log(`[Mgeko] Search for "${query}" found ${results.length} items`);

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: results.length >= 20,
        totalResults: results.length,
        results,
      });
    } catch (error: any) {
      console.error('[Mgeko] Search error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get manga info with enhanced data (rating, views, genres)
  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.query as { id: string };

    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      const response = await client.get(`/manga/${id}/`);
      const $ = cheerio.load(response.data);

      const title =
        $('h1.novel-title').first().text().trim() || $('h1').first().text().trim();

      // Get cover image
      const coverImg = $('figure.cover img').first();
      const rawImage = coverImg.attr('data-src') || coverImg.attr('src') || '';
      let image = fixImageUrl(rawImage);

      // Use larger image size for info page
      if (image) {
        image = image.replace('/157x211/', '/288x412/');
      }

      // If no image, try og:image meta tag
      if (!image) {
        const ogImage = $('meta[property="og:image"]').attr('content') || '';
        if (ogImage) {
          image = ogImage.replace(
            /https?:\/\/(www\.)?mgeko\.cc\/media\//,
            'https://imgsrv4.com/avatar/288x412/media/',
          );
        }
      }

      const description =
        $('.description, .prose, p.description').first().text().trim() ||
        'No description available';

      // Get status from the page
      let status = 'Ongoing';
      $(
        'span:contains("Ongoing"), span:contains("Completed"), span:contains("Hiatus")',
      ).each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (text.includes('completed')) status = 'Completed';
        else if (text.includes('hiatus')) status = 'Hiatus';
        else if (text.includes('ongoing')) status = 'Ongoing';
      });

      // Get rating from the rating section (format: "4.0 (31)")
      let rating = 0;
      let ratingCount = 0;
      const ratingText = $('.rating-star strong, .rating strong').first().text().trim();
      if (ratingText) {
        const ratingMatch = ratingText.match(/([\d.]+)\s*\((\d+)\)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
          ratingCount = parseInt(ratingMatch[2]);
        } else {
          const simpleMatch = ratingText.match(/([\d.]+)/);
          if (simpleMatch) rating = parseFloat(simpleMatch[1]);
        }
      }

      // Get views from header-stats section
      let views = 0;
      let viewsFormatted = '';
      $('.header-stats span').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('Views') || $(el).find('small:contains("Views")').length) {
          const strongText = $(el).find('strong').text().trim();
          // Extract only the numeric part (e.g., "11 M" from "supervised_user_circle 11 M Views")
          const viewMatch = strongText.match(/([\d,.]+)\s*([KMB])?/i);
          if (viewMatch) {
            viewsFormatted = viewMatch[0].trim();
            views = parseViewCount(viewsFormatted);
          } else {
            // Try to find views in the full text
            const fullTextMatch = text.match(/([\d,.]+)\s*([KMB])?\s*Views/i);
            if (fullTextMatch) {
              viewsFormatted = fullTextMatch[1] + (fullTextMatch[2] || '');
              views = parseViewCount(viewsFormatted);
            }
          }
        }
      });

      // Get last update time
      let lastUpdate = '';
      $('.header-stats span').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('Last Update')) {
          lastUpdate = $(el).find('strong').text().trim();
        }
      });

      // Get total chapters count from header
      let totalChaptersText = '';
      $('.header-stats span strong').each((_, el) => {
        const text = $(el).text().trim();
        if (text.match(/\d+.*eng/i)) {
          totalChaptersText = text;
        }
      });

      // Get genres from .categories section (exclude author links)
      const genres: string[] = [];
      $('.categories a.property-item').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('genre_included') || href.includes('browse-comics')) {
          const genre = $(el).text().trim();
          if (genre && !genres.includes(genre)) genres.push(genre);
        }
      });

      // Also try to get genres from tags
      $('.mmtag-item span, .tag-item').each((_, el) => {
        const genre = $(el).text().trim();
        if (genre && !genres.includes(genre) && genre.length < 30) {
          genres.push(genre);
        }
      });

      // Get authors
      const authors: string[] = [];
      $('span[itemprop="author"]').each((_, el) => {
        const author = $(el).text().trim();
        if (author && !authors.includes(author) && author !== 'Updating') {
          authors.push(author);
        }
      });

      // Get chapters from all-chapters page
      const chapters: any[] = [];
      const seenChapterNums = new Set<number>();

      try {
        const chaptersResponse = await client.get(`/manga/${id}/all-chapters/`);
        const $chapters = cheerio.load(chaptersResponse.data);

        $chapters('ul.chapter-list li').each((_, el) => {
          const link = $chapters(el).find('a[href*="/reader/en/"]');
          const href = link.attr('href');
          if (!href || !href.includes('/reader/en/')) return;

          const chapterId = href.replace('/reader/en/', '').replace(/\/$/, '');
          const chapterMatch = chapterId.match(/chapter[- ]?(\d+(?:\.\d+)?)/i);
          if (!chapterMatch) return;

          const chapterNum = parseFloat(chapterMatch[1]);
          if (chapterNum === 0 || seenChapterNums.has(chapterNum)) return;
          seenChapterNums.add(chapterNum);

          // Get release date from time element
          const timeEl = $chapters(el).find('time.chapter-update');
          const relativeTime = timeEl.text().trim(); // "3 days, 12 hours"
          const datetime = timeEl.attr('datetime'); // "Dec. 16, 2025, 3:10 a.m."

          chapters.push({
            id: chapterId,
            title: `Chapter ${chapterNum}`,
            chapterNumber: chapterNum,
            releaseDate: relativeTime || datetime || null,
          });
        });
      } catch (chapErr) {
        console.log('[Mgeko] all-chapters page not available, using main page');
        $('a[href*="/reader/en/"][href*="chapter-"]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href || !href.includes('/reader/en/')) return;

          const chapterId = href.replace('/reader/en/', '').replace(/\/$/, '');
          const chapterMatch = chapterId.match(/chapter[- ](\d+)/i);
          if (!chapterMatch) return;

          const chapterNum = parseInt(chapterMatch[1]);
          if (chapterNum === 0 || seenChapterNums.has(chapterNum)) return;
          seenChapterNums.add(chapterNum);

          chapters.push({
            id: chapterId,
            title: `Chapter ${chapterNum}`,
            chapterNumber: chapterNum,
          });
        });
      }

      // Sort chapters by number (descending - newest first)
      chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);

      console.log(
        `[Mgeko] Info for "${id}": ${chapters.length} chapters, rating: ${rating}, views: ${viewsFormatted}`,
      );

      reply.status(200).send({
        id,
        title,
        image,
        description,
        status,
        rating: rating || null,
        ratingCount: ratingCount || null,
        views: views || null,
        viewsFormatted: viewsFormatted || null,
        lastUpdate: lastUpdate || null,
        totalChapters: chapters.length,
        authors: authors.length > 0 ? authors : ['Unknown'],
        genres: genres.length > 0 ? genres : [],
        chapters,
      });
    } catch (error: any) {
      console.error('[Mgeko] Info error:', error.message);
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
      const response = await client.get(`/reader/en/${chapterId}/`);
      const $ = cheerio.load(response.data);

      const pages: any[] = [];

      // Find all images in the reader
      $('img[src*="imgsrv"]').each((index, el) => {
        const img = $(el).attr('src') || $(el).attr('data-src');
        if (img) {
          pages.push({
            page: index + 1,
            img,
          });
        }
      });

      console.log(`[Mgeko] Read "${chapterId}": ${pages.length} pages`);

      reply.status(200).send(pages);
    } catch (error: any) {
      console.error('[Mgeko] Read error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Browse comics (with filters)
  fastify.get('/browse-comics', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, genres, status, sort } = request.query as {
      page?: string;
      genres?: string;
      status?: string;
      sort?: string;
    };
    const pageNum = page ? parseInt(page) : 1;

    try {
      let url = '/browse-comics/?';
      if (genres) url += `genres=${genres}&`;
      if (status) url += `status=${status}&`;
      if (sort) url += `sort=${sort}&`;
      if (pageNum > 1) url += `page=${pageNum}`;

      const response = await client.get(url);
      const $ = cheerio.load(response.data);

      const results: any[] = [];

      // Use correct selector for browse page: article.comic-card
      $('article.comic-card').each((_, el) => {
        const link = $(el).find('.comic-card__title a').first();
        const href = link.attr('href');
        if (!href) return;

        const id = href.replace('/manga/', '').replace('/', '');
        const title = link.text().trim();

        const img = $(el).find('.comic-card__cover img').first();
        const image = img.attr('src') || img.attr('data-src') || '';

        // Skip if no valid image
        if (!image || image.includes('placeholder')) return;

        // Get latest chapter or badge info
        const chapterEl = $(el)
          .find('.chapter-title, h5.chapter-title, .latest-chapter, .comic-card__badge')
          .first();
        let latestChapter = chapterEl.text().trim();

        if (latestChapter) {
          const chapterMatch = latestChapter.match(/chapter[- ](\d+)/i);
          if (chapterMatch) {
            latestChapter = `Chapter ${chapterMatch[1]}`;
          }
        } else {
          latestChapter = 'Unknown';
        }

        if (title && image) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            status: status || 'Unknown',
          });
        }
      });

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: results.length >= 20,
        results,
      });
    } catch (error: any) {
      console.error('[Mgeko] Browse error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get all available genres (scraped from mgeko's browse page)
  fastify.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // These genres are scraped from mgeko's browse-comics page
      // The browse page itself is JS-rendered, but we extracted the genre list
      const genres = [
        { id: 'action', name: 'Action', slug: 'action' },
        { id: 'adventure', name: 'Adventure', slug: 'adventure' },
        { id: 'comedy', name: 'Comedy', slug: 'comedy' },
        { id: 'cooking', name: 'Cooking', slug: 'cooking' },
        { id: 'drama', name: 'Drama', slug: 'drama' },
        { id: 'fantasy', name: 'Fantasy', slug: 'fantasy' },
        { id: 'gender-bender', name: 'Gender Bender', slug: 'gender-bender' },
        { id: 'harem', name: 'Harem', slug: 'harem' },
        { id: 'historical', name: 'Historical', slug: 'historical' },
        { id: 'horror', name: 'Horror', slug: 'horror' },
        { id: 'isekai', name: 'Isekai', slug: 'isekai' },
        { id: 'josei', name: 'Josei', slug: 'josei' },
        { id: 'manga', name: 'Manga', slug: 'manga' },
        { id: 'manhua', name: 'Manhua', slug: 'manhua' },
        { id: 'manhwa', name: 'Manhwa', slug: 'manhwa' },
        { id: 'martial-arts', name: 'Martial Arts', slug: 'martial-arts' },
        { id: 'mature', name: 'Mature', slug: 'mature' },
        { id: 'mecha', name: 'Mecha', slug: 'mecha' },
        { id: 'medical', name: 'Medical', slug: 'medical' },
        { id: 'mystery', name: 'Mystery', slug: 'mystery' },
        { id: 'one-shot', name: 'One Shot', slug: 'one-shot' },
        { id: 'psychological', name: 'Psychological', slug: 'psychological' },
        { id: 'romance', name: 'Romance', slug: 'romance' },
        { id: 'school-life', name: 'School Life', slug: 'school-life' },
        { id: 'sci-fi', name: 'Sci-Fi', slug: 'sci-fi' },
        { id: 'seinen', name: 'Seinen', slug: 'seinen' },
        { id: 'shoujo', name: 'Shoujo', slug: 'shoujo' },
        { id: 'shounen', name: 'Shounen', slug: 'shounen' },
        { id: 'slice-of-life', name: 'Slice of Life', slug: 'slice-of-life' },
        { id: 'sports', name: 'Sports', slug: 'sports' },
        { id: 'supernatural', name: 'Supernatural', slug: 'supernatural' },
        { id: 'tragedy', name: 'Tragedy', slug: 'tragedy' },
        { id: 'webtoons', name: 'Webtoons', slug: 'webtoons' },
      ];

      reply.status(200).send({
        totalGenres: genres.length,
        genres,
      });
    } catch (error: any) {
      console.error('[Mgeko] Genres error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Genre endpoint - uses search since browse-comics is JS-rendered
  fastify.get('/genre/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    // Map slug to search-friendly term
    const genreSearchMap: Record<string, string> = {
      action: 'action',
      adventure: 'adventure',
      comedy: 'comedy',
      cooking: 'cooking',
      drama: 'drama',
      fantasy: 'fantasy',
      'gender-bender': 'gender bender',
      harem: 'harem',
      historical: 'historical',
      horror: 'horror',
      isekai: 'isekai',
      josei: 'josei',
      manga: 'manga',
      manhua: 'manhua',
      manhwa: 'manhwa',
      'martial-arts': 'martial arts',
      mature: 'mature',
      mecha: 'mecha',
      medical: 'medical',
      mystery: 'mystery',
      'one-shot': 'one shot',
      psychological: 'psychological',
      romance: 'romance',
      'school-life': 'school life',
      'sci-fi': 'sci fi',
      seinen: 'seinen',
      shoujo: 'shoujo',
      shounen: 'shounen',
      'slice-of-life': 'slice of life',
      sports: 'sports',
      supernatural: 'supernatural',
      tragedy: 'tragedy',
      webtoons: 'webtoon',
    };

    const searchTerm = genreSearchMap[slug] || slug.replace(/-/g, ' ');

    // Check cache
    const cacheKey = `${slug}:${pageNum}`;
    const cached = genreCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < GENRE_CACHE_TTL) {
      return reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: cached.data.length >= 20,
        totalResults: cached.data.length,
        genre: slug,
        results: cached.data,
        cached: true,
      });
    }

    try {
      const url = `/search/?search=${encodeURIComponent(searchTerm)}${pageNum > 1 ? `&page=${pageNum}` : ''}`;
      const response = await client.get(url);
      const $ = cheerio.load(response.data);

      const results: any[] = [];

      $('li.novel-item').each((_, el) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        if (!href) return;

        const id = href.replace('/manga/', '').replace('/', '');
        const title =
          $(el).find('h4.novel-title').text().trim() ||
          $(el).find('.novel-title').text().trim();

        const img = $(el).find('img').first();
        const rawImage = img.attr('data-src') || img.attr('src') || '';
        const image = fixImageUrl(rawImage);

        if (!image || !title) return;

        const chapterEl = $(el).find('.chapter-title, h5.chapter-title').first();
        const rawChapter = chapterEl.text().trim();
        const latestChapter = extractChapterNumber(rawChapter) || 'New';

        results.push({
          id,
          title,
          image,
          latestChapter,
          status: 'Ongoing',
          genre: slug,
        });
      });

      // Cache results
      genreCache.set(cacheKey, { data: results, timestamp: Date.now() });

      console.log(
        `[Mgeko] Genre "${slug}" page ${pageNum} found ${results.length} items`,
      );

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage: results.length >= 20,
        totalResults: results.length,
        genre: slug,
        results,
      });
    } catch (error: any) {
      console.error('[Mgeko] Genre error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Advanced search with multiple filters
  fastify.get(
    '/advanced-search',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query, genres, status, sort, page } = request.query as {
        query?: string;
        genres?: string;
        status?: string;
        sort?: string;
        page?: string;
      };
      const pageNum = page ? parseInt(page) : 1;

      try {
        // Build search query
        let searchQuery = query || '';

        // Add genre to search if specified
        if (genres) {
          const genreList = genres.split(',').map((g) => g.trim());
          if (genreList.length > 0 && !searchQuery) {
            searchQuery = genreList[0].replace(/-/g, ' ');
          }
        }

        // If no search query, use a broad term
        if (!searchQuery) {
          searchQuery = 'manga';
        }

        const url = `/search/?search=${encodeURIComponent(searchQuery)}${pageNum > 1 ? `&page=${pageNum}` : ''}`;
        const response = await client.get(url);
        const $ = cheerio.load(response.data);

        let results: any[] = [];

        $('li.novel-item').each((_, el) => {
          const link = $(el).find('a').first();
          const href = link.attr('href');
          if (!href) return;

          const id = href.replace('/manga/', '').replace('/', '');
          const title =
            $(el).find('h4.novel-title').text().trim() ||
            $(el).find('.novel-title').text().trim();

          const img = $(el).find('img').first();
          const rawImage = img.attr('data-src') || img.attr('src') || '';
          const image = fixImageUrl(rawImage);

          if (!image || !title) return;

          const chapterEl = $(el).find('.chapter-title, h5.chapter-title').first();
          const rawChapter = chapterEl.text().trim();
          const latestChapter = extractChapterNumber(rawChapter) || 'New';

          results.push({
            id,
            title,
            image,
            latestChapter,
            status: 'Ongoing',
          });
        });

        // Sort results based on sort parameter
        if (sort === 'latest') {
          // Already sorted by latest on search page
        } else if (sort === 'alphabet') {
          results.sort((a, b) => a.title.localeCompare(b.title));
        }

        console.log(`[Mgeko] Advanced search found ${results.length} items`);

        reply.status(200).send({
          currentPage: pageNum,
          hasNextPage: results.length >= 20,
          totalResults: results.length,
          filters: { query, genres, status, sort },
          results,
        });
      } catch (error: any) {
        console.error('[Mgeko] Advanced search error:', error.message);
        reply.status(500).send({
          message: 'Something went wrong. Please try again later.',
          error: error.message,
        });
      }
    },
  );
};

export default routes;

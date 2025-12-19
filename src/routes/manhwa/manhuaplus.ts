import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import { load } from 'cheerio';
import { createProxyClient, getRandomUserAgent, rateLimiter } from '../../utils/proxy';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const baseUrl = 'https://manhuaplus.top';

  // Create client with proxy support and rotating User-Agent
  const client = createProxyClient({ timeout: 30000 });

  // Helper function to convert relative URLs to absolute
  const normalizeImageUrl = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    if (url.startsWith('/')) {
      return `${baseUrl}${url}`;
    }
    return url;
  };

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro: `Welcome to the ManhuaPlus provider`,
      routes: [
        '/:query',
        '/info',
        '/read',
        '/latest',
        '/genres',
        '/genre/:slug',
        '/advanced-search',
      ],
      documentation: 'Custom ManhuaPlus scraper (NetTruyen theme)',
    });
  });

  // Get latest updates
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    try {
      const url = pageNum > 1 ? `${baseUrl}/${pageNum}` : baseUrl;

      let data;
      try {
        const response = await client.get(url);
        data = response.data;
      } catch (err: any) {
        if (err.response?.status === 404) {
          return reply.status(200).send({
            currentPage: pageNum,
            hasNextPage: false,
            results: [],
          });
        }
        throw err;
      }
      const $ = load(data);

      const results: any[] = [];

      // NetTruyen theme uses .item for manhwa cards
      $('.items .row .item').each((_, el) => {
        const titleEl = $(el).find('figcaption h3 a');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';

        // Get image from data-original attribute
        const imgEl = $(el).find('.image a img');
        const imageRaw = imgEl.attr('data-original') || imgEl.attr('src') || '';
        const image = normalizeImageUrl(imageRaw);
        
        // Skip entries with no valid image
        if (!image || image.trim() === '' || image === baseUrl) {
          return; // Skip this item
        }

        // Get latest chapters
        const latestChapters: any[] = [];
        $(el)
          .find('ul.comic-item li.chapter')
          .slice(0, 3)
          .each((idx, chEl) => {
            const chTitle = $(chEl).find('a').text().trim();
            const chDate = $(chEl).find('i.time').text().trim();

            if (chTitle) {
              latestChapters.push({
                title: chTitle,
                releaseDate: chDate || 'Latest',
              });
            }
          });

        const latestChapter = latestChapters.length > 0 ? latestChapters[0].title : '';

        // Get rating if available
        const ratingText = $(el)
          .find('.rate, .rating, .score, [class*="rate"], [class*="score"]')
          .text()
          .trim();
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // Extract ID from URL: /manga/{id}
        const id = url
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        if (title && id) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            latestChapters: latestChapters.length > 0 ? latestChapters : undefined,
            rating,
            status: 'Unknown',
          });
        }
      });

      // Check for next page - NetTruyen uses pagination links
      // ManhuaPlus has HUNDREDS of pages, so we should always assume there's more
      // Only stop if we literally get 0 results (which means we've gone past the last page)
      const hasNextPage = results.length > 0;

      console.log(
        `[ManhuaPlus] Latest page ${pageNum} found ${results.length} items. HasNext: ${hasNextPage}`,
      );

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaPlus] Latest updates error:', error.message);
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
      const searchUrl = `${baseUrl}/search?keyword=${encodeURIComponent(query)}`;

      let data;
      try {
        const response = await client.get(searchUrl);
        data = response.data;
      } catch (err: any) {
        if (err.response?.status === 404) {
          return reply.status(200).send({
            currentPage: pageNum,
            hasNextPage: false,
            results: [],
          });
        }
        throw err;
      }
      const $ = load(data);

      const results: any[] = [];

      $('.items .row .item').each((_, el) => {
        const titleEl = $(el).find('figcaption h3 a');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';

        const imgEl = $(el).find('.image a img');
        const imageRaw = imgEl.attr('data-original') || imgEl.attr('src') || '';
        const image = normalizeImageUrl(imageRaw);
        
        // Skip entries with no valid image
        if (!image || image.trim() === '' || image === baseUrl) {
          return; // Skip this item
        }

        const latestChapters: any[] = [];
        $(el)
          .find('ul.comic-item li.chapter')
          .slice(0, 3)
          .each((idx, chEl) => {
            const chTitle = $(chEl).find('a').text().trim();
            const chDate = $(chEl).find('i.time').text().trim();

            if (chTitle) {
              latestChapters.push({
                title: chTitle,
                releaseDate: chDate || 'Latest',
              });
            }
          });

        const latestChapter = latestChapters.length > 0 ? latestChapters[0].title : '';

        // Get rating if available
        const ratingText = $(el)
          .find('.rate, .rating, .score, [class*="rate"], [class*="score"]')
          .text()
          .trim();
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const id = url
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        if (title && id) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            latestChapters: latestChapters.length > 0 ? latestChapters : undefined,
            rating,
            status: 'Unknown',
          });
        }
      });

      const hasNextPage =
        $('a.next').length > 0 || $('a[rel="next"]').length > 0 || results.length >= 24;

      console.log(
        `[ManhuaPlus] Search for "${query}" found ${results.length} items. HasNext: ${hasNextPage}`,
      );

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaPlus] Search error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get genres
  fastify.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { data } = await client.get(baseUrl);
      const $ = load(data);

      const genres: Array<{ name: string; slug: string }> = [];

      // NetTruyen stores genres in the navigation menu
      $('.megamenu .nav li a[href*="/genres/"]').each((_, el) => {
        const name = $(el).text().trim();
        const href = $(el).attr('href') || '';

        // Extract slug from URL like /genres/action
        const slugMatch = href.match(/\/genres\/([^\/]+)/);
        if (slugMatch && name) {
          const slug = slugMatch[1];
          // Avoid duplicates
          if (!genres.find((g) => g.slug === slug)) {
            genres.push({ name, slug });
          }
        }
      });

      console.log(`[ManhuaPlus] Found ${genres.length} genres`);

      reply.status(200).send({
        genres: genres.sort((a, b) => a.name.localeCompare(b.name)),
      });
    } catch (error: any) {
      console.error('[ManhuaPlus] Genres error:', error.message);
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

    try {
      const url =
        pageNum > 1
          ? `${baseUrl}/genres/${slug}/${pageNum}`
          : `${baseUrl}/genres/${slug}`;

      let data;
      try {
        const response = await client.get(url);
        data = response.data;
      } catch (err: any) {
        if (err.response?.status === 404) {
          return reply.status(200).send({
            currentPage: pageNum,
            hasNextPage: false,
            results: [],
          });
        }
        throw err;
      }
      const $ = load(data);

      const results: any[] = [];

      $('.items .row .item').each((_, el) => {
        const titleEl = $(el).find('figcaption h3 a');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';

        const imgEl = $(el).find('.image a img');
        const imageRaw = imgEl.attr('data-original') || imgEl.attr('src') || '';
        const image = normalizeImageUrl(imageRaw);
        
        // Skip entries with no valid image
        if (!image || image.trim() === '' || image === baseUrl) {
          return; // Skip this item
        }

        const latestChapter = $(el)
          .find('ul.comic-item li.chapter a')
          .first()
          .text()
          .trim();
        const id = url
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        if (title && id) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            status: 'Unknown',
          });
        }
      });

      const hasNextPage =
        $('a.next').length > 0 || $('a[rel="next"]').length > 0 || results.length >= 24;

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaPlus] Genre error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Advanced Search - NetTruyen uses filter page
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
      const pageNum = page ? parseInt(page) : 1;

      try {
        // NetTruyen filter URL structure
        const params = new URLSearchParams();
        if (query) params.append('keyword', query);
        if (status) params.append('status', status);
        if (sort) params.append('sort', sort);
        if (genres) {
          genres.split(',').forEach((g) => params.append('genres', g.trim()));
        }

        const url = `${baseUrl}/filter?${params.toString()}`;
        console.log(`[ManhuaPlus] Advanced Search URL: ${url}`);

        let data;
        try {
          const response = await client.get(url);
          data = response.data;
        } catch (err: any) {
          if (err.response?.status === 404) {
            return reply.status(200).send({
              currentPage: pageNum,
              hasNextPage: false,
              results: [],
            });
          }
          throw err;
        }
        const $ = load(data);

        const results: any[] = [];

        $('.items .row .item').each((_, el) => {
          const titleEl = $(el).find('figcaption h3 a');
          const title = titleEl.text().trim();
          const url = titleEl.attr('href') || '';

          const imgEl = $(el).find('.image a img');
          const imageRaw = imgEl.attr('data-original') || imgEl.attr('src') || '';
          const image = normalizeImageUrl(imageRaw);
          
          // Skip entries with no valid image
          if (!image || image.trim() === '' || image === baseUrl) {
            return; // Skip this item
          }

          const latestChapter = $(el)
            .find('ul.comic-item li.chapter a')
            .first()
            .text()
            .trim();
          const id = url
            .replace(baseUrl, '')
            .replace(/^\/manga\//, '')
            .replace(/\/$/, '');

          if (title && id) {
            results.push({
              id,
              title,
              image,
              latestChapter,
              status: 'Unknown',
            });
          }
        });

        const hasNextPage =
          $('a.next').length > 0 || $('a[rel="next"]').length > 0 || results.length >= 24;

        reply.status(200).send({
          currentPage: pageNum,
          hasNextPage,
          results,
        });
      } catch (error: any) {
        console.error('[ManhuaPlus] Advanced search error:', error.message);
        reply.status(500).send({
          message: 'Something went wrong. Please try again later.',
          error: error.message,
        });
      }
    },
  );

  // Get manga info
  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.query as { id: string }).id;

    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      const { data } = await client.get(`${baseUrl}/manga/${id}`);
      const $ = load(data);

      // NetTruyen info page structure
      const title =
        $('.title-detail').text().trim() || $('h1.title-detail').text().trim();

      const imgEl = $('.detail-info .col-image img');
      const imageRaw = imgEl.attr('src') || imgEl.attr('data-original') || '';
      const image = normalizeImageUrl(imageRaw);

      const description =
        $('.detail-content p').text().trim() || $('.detail-content').text().trim();

      // Get status
      const statusText =
        $('.info-item .status').text().trim() ||
        $('.list-info li:contains("Status")').text().trim();
      const status = statusText.toLowerCase().includes('ongoing')
        ? 'Ongoing'
        : statusText.toLowerCase().includes('completed')
          ? 'Completed'
          : 'Unknown';

      // Get authors
      const authors: string[] = [];
      $('.info-item .author a, .list-info li:contains("Author") a').each((_, el) => {
        const author = $(el).text().trim();
        if (author) authors.push(author);
      });

      // Get genres
      const genres: string[] = [];
      $('.info-item .kind a, .list-info li:contains("Genres") a').each((_, el) => {
        const genre = $(el).text().trim();
        if (genre) genres.push(genre);
      });

      // Get rating
      const ratingText = $(
        '.rate, .rating, .score, [class*="rate"], [class*="score"], .mrt5.mrb10',
      )
        .text()
        .trim();
      const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*\/\s*(\d+)|^(\d+\.?\d*)$/);
      let rating = null;
      if (ratingMatch) {
        if (ratingMatch[1] && ratingMatch[2]) {
          // Format: X/Y - normalize to 10 scale
          rating = (parseFloat(ratingMatch[1]) / parseFloat(ratingMatch[2])) * 10;
        } else if (ratingMatch[3]) {
          rating = parseFloat(ratingMatch[3]);
        }
      }

      // Get chapters
      const chapters: any[] = [];
      $('.list-chapter li, #nt_listchapter li').each((_, el) => {
        const chapterLink = $(el).find('a').first();
        const chapterTitle = chapterLink.text().trim();
        const chapterUrl = chapterLink.attr('href') || '';
        const releaseDate = $(el).find('.chapter-time').text().trim();

        // Extract chapter ID from URL
        const chapterId = chapterUrl
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        if (chapterTitle && chapterId) {
          chapters.push({
            id: chapterId,
            title: chapterTitle,
            releaseDate: releaseDate || new Date().toISOString(),
          });
        }
      });

      console.log(
        `[ManhuaPlus] Info for "${id}": ${chapters.length} chapters, rating: ${rating}`,
      );

      reply.status(200).send({
        id,
        title,
        image,
        description,
        status,
        rating,
        authors,
        genres,
        chapters,
      });
    } catch (error: any) {
      console.error('[ManhuaPlus] Info error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get chapter pages
  fastify.get('/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const chapterId = (request.query as { chapterId: string }).chapterId;

    if (!chapterId) return reply.status(400).send({ message: 'chapterId is required' });

    try {
      const { data } = await client.get(`${baseUrl}/manga/${chapterId}`);
      const $ = load(data);

      const pages: any[] = [];

      // NetTruyen uses .reading-detail .page-chapter img for chapter images
      $('.reading-detail .page-chapter img, .reading-content img').each((index, el) => {
        const imgRaw =
          $(el).attr('data-original') ||
          $(el).attr('data-src') ||
          $(el).attr('src') ||
          '';
        const img = normalizeImageUrl(imgRaw);
        if (img && !img.includes('loading') && !img.includes('placeholder')) {
          pages.push({
            page: index + 1,
            img: img.trim(),
          });
        }
      });

      console.log(`[ManhuaPlus] Read "${chapterId}": ${pages.length} pages`);

      reply.status(200).send(pages);
    } catch (error: any) {
      console.error('[ManhuaPlus] Read error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });
};

export default routes;

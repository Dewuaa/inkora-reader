import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import axios from 'axios';
import { load } from 'cheerio';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const baseUrl = 'https://manhuaus.com';

  const client = axios.create({
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro: `Welcome to the ManhuaUS provider`,
      routes: ['/:query', '/info', '/read'],
      documentation: 'Custom ManhuaUS scraper',
    });
  });

  // Get latest updates
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    try {
      const url = pageNum > 1
        ? `${baseUrl}/page/${pageNum}/`
        : `${baseUrl}/`;

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

      $('.page-item-detail, .c-tabs-item__content').each((_, el) => {
        const title = $(el).find('.post-title h3 a, .post-title a').first().text().trim();
        const url = $(el).find('.post-title h3 a, .post-title a').first().attr('href') || '';
        // Get real image from data-src (lazy loading), fallback to src
        const imgEl = $(el).find('.tab-thumb img, .item-thumb img');
        const image =
          imgEl.attr('data-src') ||
          imgEl.attr('data-lazy-src') ||
          imgEl.attr('srcset')?.split(' ')[0] ||
          imgEl.attr('src') ||
          '';
        const latestChapter = $(el).find('.latest-chap .chapter a').first().text().trim();

        // Extract ID from URL
        const id = url
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        // Get latest chapters with dates (up to 3)
        const latestChapters: any[] = [];
        $(el).find('.latest-chap .chapter').slice(0, 3).each((idx, chEl) => {
          const chTitle = $(chEl).find('a').text().trim();
          // Try multiple selectors for date
          let chDate = $(chEl).find('.post-on').text().trim() ||
                       $(chEl).find('.chapter-release-date').text().trim() ||
                       $(chEl).find('i').text().trim() ||
                       $(chEl).find('span').last().text().trim();
          
          // Clean up the date
          chDate = chDate.replace(/\s+/g, ' ').trim();
          
          if (chTitle) {
            latestChapters.push({
              title: chTitle,
              releaseDate: chDate || 'Latest'
            });
          }
        });

        if (title && id) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            latestChapters: latestChapters.length > 0 ? latestChapters : undefined,
            status: 'Unknown',
          });
        }
      });

      // Check for next page
      const hasNextPage = 
        $('.nav-links .next').length > 0 || 
        $('.pagination .next').length > 0 ||
        $('a.next.page-numbers').length > 0 ||
        $('.nextpostslink').length > 0 ||
        // Fallback: Check for any link with "Next" text
        $('a').filter((_, el) => $(el).text().toLowerCase().includes('next') || $(el).text().includes('»') || $(el).text().includes('>')).length > 0 ||
        // Fallback: If we have a full page of results (usually 10+), assume there's a next page
        results.length >= 10;

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaUS] Latest updates error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Advanced Search
  fastify.get('/advanced-search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, page, status, sort, genres } = request.query as {
      query?: string;
      page?: string;
      status?: string;
      sort?: string;
      genres?: string; // Comma-separated slugs
    };
    const pageNum = page ? parseInt(page) : 1;

    try {
      // Construct Madara theme search URL
      const params = new URLSearchParams();
      params.append('s', query || '');
      params.append('post_type', 'wp-manga');
      
      if (sort) {
        // Map sort options to Madara params
        // latest, alphabet, rating, trending, views, new-manga
        params.append('m_orderby', sort);
      }
      
      if (status) {
        // ongoing, completed, canceled
        // Madara uses 'on-going' usually, let's try to handle both
        params.append('status', status === 'ongoing' ? 'on-going' : status);
      }

      if (genres) {
        const genreList = genres.split(',');
        genreList.forEach(g => params.append('genre[]', g.trim()));
      }

      const url = pageNum > 1
        ? `${baseUrl}/page/${pageNum}/?${params.toString()}`
        : `${baseUrl}/?${params.toString()}`;

      console.log(`[ManhuaUS] Advanced Search URL: ${url}`);

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

      // Try multiple selectors for result items
      const itemSelector = $('.c-tabs-item__content').length > 0 ? '.c-tabs-item__content' : '.page-item-detail, .c-tabs-item__content';
      
      $(itemSelector).each((_, el) => {
        const title = $(el).find('.post-title a').text().trim();
        const url = $(el).find('.post-title a').attr('href') || '';
        const imgEl = $(el).find('.tab-thumb img');
        const image =
          imgEl.attr('data-src') ||
          imgEl.attr('data-lazy-src') ||
          imgEl.attr('srcset')?.split(' ')[0] ||
          imgEl.attr('src') ||
          '';
        const latestChapter = $(el).find('.latest-chap .chapter a').text().trim();

        // Extract ID from URL
        const id = url
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        // Get latest chapters
        const latestChapters: any[] = [];
        $(el).find('.latest-chap .chapter').slice(0, 3).each((idx, chEl) => {
          const chTitle = $(chEl).find('a').text().trim();
          let chDate = $(chEl).find('.post-on').text().trim() ||
                       $(chEl).find('.chapter-release-date').text().trim() ||
                       $(chEl).find('i').text().trim() ||
                       $(chEl).find('span').last().text().trim();
          
          chDate = chDate.replace(/\s+/g, ' ').trim();
          
          if (chTitle) {
            latestChapters.push({
              title: chTitle,
              releaseDate: chDate || 'Latest'
            });
          }
        });

        if (title && id) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            latestChapters: latestChapters.length > 0 ? latestChapters : undefined,
            status: 'Unknown',
          });
        }
      });

      // Check for next page
      const hasNextPage = 
        $('.nav-links .next').length > 0 || 
        $('.pagination .next').length > 0 ||
        $('a.next.page-numbers').length > 0 ||
        $('.nextpostslink').length > 0 ||
        $('a').filter((_, el) => $(el).text().toLowerCase().includes('next') || $(el).text().includes('»') || $(el).text().includes('>')).length > 0 ||
        results.length >= 10;

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaUS] Advanced search error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get all genres
  fastify.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Fetch the main page or any manga page to get genre list
      const { data } = await client.get(baseUrl);
      const $ = load(data);

      const genres: Array<{ name: string; slug: string }> = [];
      
      // Try multiple selectors for genre links
      const genreSelectors = [
        '.genres-content a',
        '.genre-list a',
        'a[href*="/manga-genre/"]',
        '.widget_genres a'
      ];

      for (const selector of genreSelectors) {
        $(selector).each((_, el) => {
          const name = $(el).text().trim();
          const href = $(el).attr('href') || '';
          
          // Extract slug from URL like /manga-genre/action/
          const slugMatch = href.match(/\/manga-genre\/([^\/]+)/);
          if (slugMatch && name) {
            const slug = slugMatch[1];
            // Avoid duplicates
            if (!genres.find(g => g.slug === slug)) {
              genres.push({ name, slug });
            }
          }
        });

        // If we found genres, break the loop
        if (genres.length > 0) break;
      }

      // If no genres found via scraping, return a default list
      if (genres.length === 0) {
        console.warn('[ManhuaUS] No genres found via scraping, returning default list');
        const defaultGenres = [
          'action', 'adventure', 'comedy', 'drama', 'fantasy', 'harem',
          'historical', 'horror', 'isekai', 'martial-arts', 'mecha',
          'mystery', 'psychological', 'romance', 'school-life', 'sci-fi',
          'seinen', 'shoujo', 'shounen', 'slice-of-life', 'supernatural',
          'tragedy', 'webtoons'
        ];
        
        defaultGenres.forEach(slug => {
          genres.push({
            name: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            slug
          });
        });
      }

      console.log(`[ManhuaUS] Found ${genres.length} genres`);

      reply.status(200).send({
        genres: genres.sort((a, b) => a.name.localeCompare(b.name))
      });
    } catch (error: any) {
      console.error('[ManhuaUS] Genres error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });
  
  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.params as { query: string };
    const { page } = request.query as { page?: string };
    const pageNum = page ? parseInt(page) : 1;

    try {
      const searchUrl = pageNum > 1
        ? `${baseUrl}/page/${pageNum}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
        : `${baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;

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

      // Try multiple selectors for result items
      const itemSelector = $('.c-tabs-item__content').length > 0 ? '.c-tabs-item__content' : '.page-item-detail, .c-tabs-item__content';
      
      $(itemSelector).each((_, el) => {
        const title = $(el).find('.post-title a').text().trim();
        const url = $(el).find('.post-title a').attr('href') || '';
        // Get real image from data-src (lazy loading), fallback to src
        const imgEl = $(el).find('.tab-thumb img');
        const image =
          imgEl.attr('data-src') ||
          imgEl.attr('data-lazy-src') ||
          imgEl.attr('srcset')?.split(' ')[0] ||
          imgEl.attr('src') ||
          '';
        const latestChapter = $(el).find('.latest-chap .chapter a').text().trim();

        // Extract ID from URL
        const id = url
          .replace(baseUrl, '')
          .replace(/^\/manga\//, '')
          .replace(/\/$/, '');

        // Get latest chapters with dates (up to 3)
        const latestChapters: any[] = [];
        $(el).find('.latest-chap .chapter').slice(0, 3).each((idx, chEl) => {
          const chTitle = $(chEl).find('a').text().trim();
          // Try multiple selectors for date
          let chDate = $(chEl).find('.post-on').text().trim() ||
                       $(chEl).find('.chapter-release-date').text().trim() ||
                       $(chEl).find('i').text().trim() ||
                       $(chEl).find('span').last().text().trim();
          
          // Clean up the date
          chDate = chDate.replace(/\s+/g, ' ').trim();
          
          if (chTitle) {
            latestChapters.push({
              title: chTitle,
              releaseDate: chDate || 'Latest'
            });
          }
        });

        if (title && id) {
          results.push({
            id,
            title,
            image,
            latestChapter,
            latestChapters: latestChapters.length > 0 ? latestChapters : undefined,
            status: 'Unknown',
          });
        }
      });

      // Check for next page
      const hasNextPage = 
        $('.nav-links .next').length > 0 || 
        $('.pagination .next').length > 0 ||
        $('a.next.page-numbers').length > 0 ||
        $('.nextpostslink').length > 0 ||
        // Fallback: Check for any link with "Next" text
        $('a').filter((_, el) => $(el).text().toLowerCase().includes('next') || $(el).text().includes('»') || $(el).text().includes('>')).length > 0 ||
        // Fallback: If we have a full page of results (usually 10+), assume there's a next page
        results.length >= 10;

      console.log(`[ManhuaUS] Search for "${query}" page ${pageNum} found ${results.length} items. HasNext: ${hasNextPage}`);

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaUS] Search error:', error.message);
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
      const url = pageNum > 1
        ? `${baseUrl}/manga-genre/${slug}/page/${pageNum}/`
        : `${baseUrl}/manga-genre/${slug}/`;

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

      $('.page-item-detail, .c-tabs-item__content').each((_, el) => {
        const title = $(el).find('.post-title h3 a').text().trim();
        const url = $(el).find('.post-title h3 a').attr('href') || '';
        const imgEl = $(el).find('img');
        const image =
          imgEl.attr('data-src') ||
          imgEl.attr('data-lazy-src') ||
          imgEl.attr('src') ||
          '';
        const latestChapter = $(el).find('.latest-chap .chapter a').first().text().trim();

        // Extract ID from URL
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

      // Check for next page
      const hasNextPage = 
        $('.nav-links .next').length > 0 || 
        $('.pagination .next').length > 0 ||
        $('a.next.page-numbers').length > 0 ||
        $('.nextpostslink').length > 0 ||
        // Fallback: Check for any link with "Next" text
        $('a').filter((_, el) => $(el).text().toLowerCase().includes('next') || $(el).text().includes('»') || $(el).text().includes('>')).length > 0 ||
        // Fallback: If we have a full page of results (usually 10+), assume there's a next page
        results.length >= 10;

      reply.status(200).send({
        currentPage: pageNum,
        hasNextPage,
        results,
      });
    } catch (error: any) {
      console.error('[ManhuaUS] Genre error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });

  // Get manga info
  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.query as { id: string }).id;

    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      const { data } = await client.get(`${baseUrl}/manga/${id}/`);
      const $ = load(data);

      const title = $('.post-title h1').text().trim();
      // Get real image from data-src (lazy loading) first, fallback to src
      const imgEl = $('.summary_image img');
      const image =
        imgEl.attr('data-src') ||
        imgEl.attr('data-lazy-src') ||
        imgEl.attr('srcset')?.split(' ')[0] ||
        imgEl.attr('src') ||
        '';
      const description =
        $('.description-summary .summary__content p').text().trim() ||
        $('.description-summary .summary__content').text().trim();

      // Get status
      const statusText = $('.post-status .summary-content').first().text().trim();
      const status = statusText.toLowerCase().includes('ongoing')
        ? 'Ongoing'
        : statusText.toLowerCase().includes('completed')
          ? 'Completed'
          : 'Unknown';

      // Get authors
      const authors: string[] = [];
      $('.author-content a').each((_, el) => {
        authors.push($(el).text().trim());
      });

      // Get genres
      const genres: string[] = [];
      $('.genres-content a').each((_, el) => {
        genres.push($(el).text().trim());
      });

      // Get chapters
      const chapters: any[] = [];

      // ManhuaUS stores manga ID in a JavaScript variable, not in an input
      // Look for: var manga = {...,"manga_id":"1357245"};
      const mangaIdMatch = data.match(/"manga_id":"(\d+)"/);
      const mangaId = mangaIdMatch ? mangaIdMatch[1] : null;

      console.log('[ManhuaUS] Manga ID:', mangaId);

      if (mangaId) {
        try {
          const chaptersResponse = await client.post(
            `${baseUrl}/wp-admin/admin-ajax.php`,
            new URLSearchParams({
              action: 'manga_get_chapters',
              manga: mangaId,
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: `${baseUrl}/manga/${id}/`,
              },
            },
          );

          console.log(
            '[ManhuaUS] Chapters response length:',
            chaptersResponse.data?.length,
          );

          const $chapters = load(chaptersResponse.data);

          $chapters('.wp-manga-chapter').each((_, el) => {
            const chapterTitle = $chapters(el).find('a').text().trim();
            const chapterUrl = $chapters(el).find('a').attr('href') || '';
            const releaseDate = $chapters(el).find('.chapter-release-date').text().trim();

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
        } catch (chapError) {
          console.error('[ManhuaUS] Failed to fetch chapters via AJAX:', chapError);

          // Fallback: try to get chapters from the page
          $('.wp-manga-chapter').each((_, el) => {
            const chapterTitle = $(el).find('a').text().trim();
            const chapterUrl = $(el).find('a').attr('href') || '';
            const releaseDate = $(el).find('.chapter-release-date').text().trim();

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
        }
      }

      reply.status(200).send({
        id,
        title,
        image,
        description,
        status,
        authors,
        genres,
        chapters,
      });
    } catch (error: any) {
      console.error('[ManhuaUS] Info error:', error.message);
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
      const { data } = await client.get(`${baseUrl}/manga/${chapterId}/`);
      const $ = load(data);

      const pages: any[] = [];

      // ManhuaUS uses .reading-content .page-break img for chapter images
      $('.reading-content .page-break img').each((index, el) => {
        const img = $(el).attr('src') || $(el).attr('data-src') || '';
        if (img) {
          pages.push({
            page: index + 1,
            img: img.trim(),
          });
        }
      });

      // Alternative selector
      if (pages.length === 0) {
        $('.wp-manga-chapter-img').each((index, el) => {
          const img = $(el).attr('src') || $(el).attr('data-src') || '';
          if (img) {
            pages.push({
              page: index + 1,
              img: img.trim(),
            });
          }
        });
      }

      reply.status(200).send(pages);
    } catch (error: any) {
      console.error('[ManhuaUS] Read error:', error.message);
      reply.status(500).send({
        message: 'Something went wrong. Please try again later.',
        error: error.message,
      });
    }
  });
};

export default routes;

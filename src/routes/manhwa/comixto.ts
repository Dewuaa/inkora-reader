import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';

/**
 * Comix.to API Integration
 * 
 * Uses Comix.to's public API for manga data with scan group support.
 * API Base: https://comix.to/api/v2
 */

const COMIX_API = 'https://comix.to/api/v2';
const COMIX_BASE = 'https://comix.to';

// Cache for responses
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Helper to make API requests
async function fetchApi(endpoint: string) {
  const cacheKey = endpoint;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`${COMIX_API}${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Inkora/1.0',
        'Referer': COMIX_BASE,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error('Comix.to API error:', error);
    throw error;
  }
}

// Format manga info from API response
function formatMangaInfo(manga: any) {
  return {
    id: manga.hash_id || manga.slug || String(manga.manga_id),
    title: manga.title,
    altTitles: manga.alt_titles || [],
    image: manga.poster?.large || manga.poster?.medium || manga.poster?.small || '',
    description: manga.synopsis || '',
    genres: [], // Will be fetched separately if needed
    authors: [], // Comix doesn't include author names directly, uses term_ids
    artists: [],
    status: manga.status || 'Unknown',
    type: manga.type || 'Manhwa',
    rating: manga.rated_avg || 0,
    views: manga.follows_total || 0,
    releaseDate: manga.year ? `${manga.year}` : manga.start_date ? `${manga.start_date}` : null,
    totalChapters: manga.latest_chapter || 0,
    links: manga.links || {},
  };
}

// Format chapter with scan group info
function formatChapter(chapter: any) {
  return {
    id: String(chapter.chapter_id),
    title: chapter.name ? `Chapter ${chapter.number} - ${chapter.name}` : `Chapter ${chapter.number}`,
    number: chapter.number, // Required by frontend for display
    chapterNumber: chapter.number,
    releaseDate: chapter.created_at ? new Date(chapter.created_at * 1000).toISOString() : null,
    // Scan group info - this is the key feature!
    scanGroup: chapter.scanlation_group ? {
      id: chapter.scanlation_group.scanlation_group_id,
      name: chapter.scanlation_group.name,
      slug: chapter.scanlation_group.slug,
    } : (chapter.is_official ? { id: 0, name: 'Official', slug: 'official' } : null),
    isOfficial: chapter.is_official === 1,
  };
}

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  // Search manga
  fastify.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, page = '1' } = request.query as { q?: string; page?: string };

    if (!q) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    try {
      // Note: Comix.to uses 'keyword' and 'order[relevance]=desc' for smart search that matches alt titles
      // Include manga, manhwa, and manhua types for comprehensive search
      const data = await fetchApi(`/manga?keyword=${encodeURIComponent(q)}&order[relevance]=desc&page=${page}&per_page=30&types[]=manga&types[]=manhwa&types[]=manhua`);
      const items = data.result?.items || [];

      const results = items.map((manga: any) => ({
        id: manga.hash_id || String(manga.manga_id),
        title: manga.title,
        image: manga.poster?.medium || manga.poster?.large || '',
        type: manga.type || 'Manhwa',
        latestChapter: manga.latest_chapter,
        rating: manga.rated_avg || 0,
      }));

      return reply.send({
        currentPage: parseInt(page),
        hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
        results,
      });
    } catch (error: any) {
      console.error('Comix.to search error:', error);
      return reply.status(500).send({ error: 'Search failed' });
    }
  });

  // Trending/Popular manga
  fastify.get('/trending', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page = '1' } = request.query as { page?: string };

    try {
      // Note: Comix.to requires types[] array format, not comma-separated
      const data = await fetchApi(`/manga?types[]=manhwa&types[]=manhua&sort=follows&page=${page}&per_page=24`);
      const items = data.result?.items || [];

      const results = items.map((manga: any) => ({
        id: manga.hash_id || String(manga.manga_id),
        title: manga.title,
        image: manga.poster?.medium || manga.poster?.large || '',
        type: manga.type || 'Manhwa',
        rating: manga.rated_avg || 0,
        latestChapter: manga.latest_chapter,
        views: manga.follows_total || 0,
      }));

      return reply.send({
        currentPage: parseInt(page),
        hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
        results,
      });
    } catch (error: any) {
      console.error('Comix.to trending error:', error);
      return reply.status(500).send({ error: 'Failed to get trending' });
    }
  });

  // Full genre/theme ID mapping for Comix.to (from their browse page)
  // These IDs are used in the genres[] parameter
  // NOTE: Standard genres use small integer IDs, Adult/mature use 872xx range
  const genreMap: { [key: string]: number } = {
    // Main Genres - CORRECT IDs from Comix.to browser
    'action': 6,
    'adventure': 7,
    'boys-love': 8,
    'comedy': 9,
    'crime': 10,
    'drama': 11,
    'fantasy': 12,
    'girls-love': 13,
    'historical': 14,
    'horror': 15,
    'isekai': 16,
    'magical-girls': 17,
    'mecha': 18,
    'medical': 19,
    'mystery': 20,
    'philosophical': 21,
    'psychological': 22,
    'romance': 23,
    'sci-fi': 24,
    'slice-of-life': 25,
    'sports': 26,
    'superhero': 27,
    'thriller': 28,
    'tragedy': 29,
    'wuxia': 30,
    // Adult/Mature content genres (87xxx range)
    'adult': 87264,
    'ecchi': 87265,
    'hentai': 87266,
    'mature': 87267,
    'smut': 87268,
    // Demographics (these are separate from genres in Comix.to)
    'seinen': 1,
    'shoujo': 3,
    'shounen': 2,
    'josei': 4,
    // Themes
    'aliens': 40,
    'animals': 41,
    'cooking': 42,
    'crossdressing': 43,
    'delinquents': 44,
    'demons': 45,
    'gender-bender': 46,
    'ghosts': 47,
    'gyaru': 48,
    'incest': 49,
    'loli': 50,
    'mafia': 51,
    'magic': 52,
    'monster-girls': 53,
    'monsters': 54,
    'ninja': 55,
    'office-workers': 56,
    'police': 57,
    'post-apocalyptic': 58,
    'reincarnation': 59,
    'reverse-harem': 60,
    'samurai': 61,
    'school-life': 62,
    'shota': 63,
    'survival': 64,
    'time-travel': 65,
    'traditional-games': 66,
    'vampires': 67,
    'video-games': 68,
    'villainess': 69,
    'virtual-reality': 70,
    'zombies': 71,
    'gore': 72,
    'military': 73,
    'music': 74,
    'nature': 77,
    'system': 78,
  };

  // Get list of all available genres
  fastify.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    // Convert genreMap to array format for the frontend
    const genres = Object.entries(genreMap).map(([slug, id]) => ({
      name: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      slug,
      id,
    }));

    // Sort alphabetically
    genres.sort((a, b) => a.name.localeCompare(b.name));

    return reply.send({ genres });
  });

  // Browse by genre
  fastify.get('/genre/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    const { page = '1' } = request.query as { page?: string };

    try {
      // Get genre ID from slug
      const genreId = genreMap[slug.toLowerCase()];
      
      if (!genreId) {
        // If we don't have the ID, try searching with the genre as keyword
        const data = await fetchApi(`/manga?keyword=${encodeURIComponent(slug)}&types[]=manhwa&types[]=manhua&page=${page}&per_page=24`);
        const items = data.result?.items || [];
        
        const results = items.map((manga: any) => ({
          id: manga.hash_id || String(manga.manga_id),
          title: manga.title,
          image: manga.poster?.medium || manga.poster?.large || '',
          type: manga.type || 'Manhwa',
          latestChapter: manga.latest_chapter,
          rating: manga.rated_avg || 0,
        }));

        return reply.send({
          currentPage: parseInt(page),
          hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
          results,
        });
      }

      // Fetch manga with this genre
      const data = await fetchApi(`/manga?genres[]=${genreId}&types[]=manhwa&types[]=manhua&page=${page}&per_page=24&sort=follows`);
      const items = data.result?.items || [];

      const results = items.map((manga: any) => ({
        id: manga.hash_id || String(manga.manga_id),
        title: manga.title,
        image: manga.poster?.medium || manga.poster?.large || '',
        type: manga.type || 'Manhwa',
        latestChapter: manga.latest_chapter,
        rating: manga.rated_avg || 0,
        genres: [],
        status: manga.status || 'Unknown',
      }));

      return reply.send({
        currentPage: parseInt(page),
        hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
        results,
      });
    } catch (error: any) {
      console.error('Comix.to genre error:', error);
      return reply.status(500).send({ error: 'Failed to get genre' });
    }
  });

  // Advanced Search with all filters
  fastify.get('/advanced-search', async (request: FastifyRequest, reply: FastifyReply) => {
    const {
      q,
      page = '1',
      per_page = '24',
      // Types: manga, manhwa, manhua, other
      types,
      // Status: releasing, finished, on_hiatus, discontinued, not_yet_released
      status,
      // Demographics: 1=Seinen, 2=Shounen, 3=Shoujo, 4=Josei
      demographics,
      // Genres: comma-separated IDs (prefix with - to exclude)
      genres,
      genres_mode = 'and', // 'and' or 'or'
      // Min chapters
      minchap,
      // Year range
      year_from,
      year_to,
      // Sort: follows, rating, updated, created, title, year, views_7d, views_1mo, views_3mo, views_total
      sort = 'follows',
      order = 'desc',
    } = request.query as {
      q?: string;
      page?: string;
      per_page?: string;
      types?: string;
      status?: string;
      demographics?: string;
      genres?: string;
      genres_mode?: string;
      minchap?: string;
      year_from?: string;
      year_to?: string;
      sort?: string;
      order?: string;
    };

    try {
      // Build query params
      const params: string[] = [];
      params.push(`page=${page}`);
      params.push(`per_page=${per_page}`);

      // Keyword search
      if (q) {
        params.push(`keyword=${encodeURIComponent(q)}`);
        if (sort === 'relevance') {
          params.push(`order[relevance]=desc`);
        }
      }

      // Types filter
      if (types) {
        const typeList = types.split(',');
        typeList.forEach(t => params.push(`types[]=${t.trim()}`));
      } else {
        // Default to all types if none specified
        params.push(`types[]=manhwa`);
        params.push(`types[]=manhua`);
        params.push(`types[]=manga`);
        params.push(`types[]=other`);
      }

      // Status filter
      if (status) {
        const statusList = status.split(',');
        statusList.forEach(s => params.push(`statuses[]=${s.trim()}`));
      }

      // Demographics filter
      if (demographics) {
        const demoList = demographics.split(',');
        demoList.forEach(d => params.push(`demographics[]=${d.trim()}`));
      }

      // Genres filter (supports - prefix for exclusion)
      if (genres) {
        const genreList = genres.split(',');
        genreList.forEach(g => {
          const genreSlug = g.trim();
          
          if (genreSlug.startsWith('-')) {
            // Exclusion - remove the - prefix and look up
            const excludeSlug = genreSlug.substring(1);
            const excludeId = genreMap[excludeSlug.toLowerCase()] || parseInt(excludeSlug);
            if (excludeId) params.push(`genres[]=-${excludeId}`);
          } else {
            // Inclusion
            const id = genreMap[genreSlug.toLowerCase()] || parseInt(genreSlug);
            if (id) params.push(`genres[]=${id}`);
          }
        });
        params.push(`genres_mode=${genres_mode}`);
      }

      // Min chapters
      if (minchap) {
        params.push(`minchap=${minchap}`);
      }

      // Year range
      if (year_from) {
        params.push(`year_from=${year_from}`);
      }
      if (year_to) {
        params.push(`year_to=${year_to}`);
      }

      // Sorting - use correct Comix.to parameters
      const sortMap: { [key: string]: string } = {
        'follows': 'order[follows_total]=desc',  // Most Popular (by followers)
        'rating': 'order[score]=desc',           // Highest Rated (by score)
        'updated': 'order[updated_at]=desc',     // Recently Updated
        'created': 'order[created_at]=desc',     // Newest Added
        'title': `order[title]=${order}`,
        'year': `order[year]=${order}`,
        'views_7d': 'order[views_7d]=desc',      // Trending 7 days
        'views_1mo': 'order[views_1mo]=desc',    // Trending 1 month
        'views_3mo': 'order[views_3mo]=desc',
        'views_total': 'order[views_total]=desc',
        'relevance': '', // Handled above
      };

      if (sort && sort !== 'relevance' && sortMap[sort]) {
        params.push(sortMap[sort]);
      }

      const url = `/manga?${params.join('&')}`;
      console.log('Advanced search URL:', url);
      
      const data = await fetchApi(url);
      const items = data.result?.items || [];

      const results = items.map((manga: any) => ({
        id: manga.hash_id || String(manga.manga_id),
        title: manga.title,
        image: manga.poster?.medium || manga.poster?.large || '',
        type: manga.type || 'Manhwa',
        latestChapter: manga.latest_chapter,
        rating: manga.rated_avg || 0,
        status: manga.status || 'Unknown',
        year: manga.year,
        views: manga.follows_total || 0,
      }));

      return reply.send({
        currentPage: parseInt(page),
        hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
        totalResults: data.result?.pagination?.total,
        totalPages: data.result?.pagination?.last_page,
        results,
      });
    } catch (error: any) {
      console.error('Comix.to advanced search error:', error);
      return reply.status(500).send({ error: 'Advanced search failed' });
    }
  });

  // Get manga info with chapters
  fastify.get('/info/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      // Get manga details
      const mangaData = await fetchApi(`/manga/${id}`);
      
      if (mangaData.status !== 200 || !mangaData.result) {
        return reply.status(404).send({ error: 'Manga not found' });
      }
      
      const manga = mangaData.result;

      // Get chapters with scan group info - fetch ALL pages
      // NOTE: Comix.to ignores per_page parameter and always returns 30 items per page
      // Some manga have 900+ chapter versions, requiring up to 33+ pages
      let allChapters: any[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore && page <= 50) { // Max 50 pages (1500 chapter versions)
        const chaptersData = await fetchApi(`/manga/${id}/chapters?page=${page}`);
        const items = chaptersData.result?.items || [];
        allChapters = allChapters.concat(items);
        
        console.log(`Comix.to chapters page ${page}/${chaptersData.result?.pagination?.last_page || '?'}: got ${items.length} items, total so far: ${allChapters.length}`);
        
        hasMore = chaptersData.result?.pagination?.current_page < chaptersData.result?.pagination?.last_page;
        page++;
      }
      
      const rawChapters = allChapters;



      // Group chapters by number to show different scan group versions
      const chapterMap = new Map<number, any[]>();
      
      for (const chapter of rawChapters) {
        const num = chapter.number || 0;
        if (!chapterMap.has(num)) {
          chapterMap.set(num, []);
        }
        chapterMap.get(num)!.push(formatChapter(chapter));
      }

      // Sort chapter numbers descending and create chapter list
      const sortedNumbers = Array.from(chapterMap.keys()).sort((a, b) => b - a);
      
      const chapters = sortedNumbers.map((num) => {
        const versions = chapterMap.get(num)!;
        const primary = versions[0];
        return {
          ...primary,
          // ALWAYS include versions array so frontend can filter by scan group
          versions: versions,
          hasMultipleVersions: versions.length > 1,
        };
      });


      const info = formatMangaInfo(manga);

      // Collect unique scan groups
      const scanGroupsSet = new Map<string, any>();
      for (const chapter of rawChapters) {
        if (chapter.scanlation_group) {
          scanGroupsSet.set(chapter.scanlation_group.name, {
            id: chapter.scanlation_group.scanlation_group_id,
            name: chapter.scanlation_group.name,
            slug: chapter.scanlation_group.slug,
          });
        }
      }

      return reply.send({
        ...info,
        chapters,
        totalChapters: chapters.length,
        scanGroups: Array.from(scanGroupsSet.values()),
        provider: 'comixto',
      });
    } catch (error: any) {
      console.error('Comix.to info error:', error);
      return reply.status(500).send({ error: 'Failed to get manga info' });
    }
  });

  // Get chapter pages
  fastify.get('/read/:chapterId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { chapterId } = request.params as { chapterId: string };

    try {
      // Note: API uses plural "chapters" not "chapter"
      const data = await fetchApi(`/chapters/${chapterId}`);
      
      if (data.status !== 200 || !data.result) {
        return reply.status(404).send({ error: 'Chapter not found' });
      }
      
      const chapter = data.result;

      // Images are in result.images array with url field
      const pages = (chapter.images || []).map((img: any, index: number) => ({
        page: index + 1,
        img: img.url || img,
        width: img.width,
        height: img.height,
      }));

      return reply.send({
        chapterId,
        title: chapter.name ? `Chapter ${chapter.number} - ${chapter.name}` : `Chapter ${chapter.number}`,
        number: chapter.number, // Required by frontend for display
        chapterNumber: chapter.number,
        scanGroup: chapter.scanlation_group ? {
          id: chapter.scanlation_group.scanlation_group_id,
          name: chapter.scanlation_group.name,
        } : null,
        pages,
        // Include next/prev for navigation
        nextChapter: chapter.next?.chapter_id ? String(chapter.next.chapter_id) : null,
        prevChapter: chapter.prev?.chapter_id ? String(chapter.prev.chapter_id) : null,
      });
    } catch (error: any) {
      console.error('Comix.to read error:', error);
      return reply.status(500).send({ error: 'Failed to get chapter pages' });
    }
  });

  // Browse with filters
  fastify.get('/browse', async (request: FastifyRequest, reply: FastifyReply) => {
    const { 
      page = '1', 
      type = 'manhwa,manhua', 
      genres,
      status,
      sort = 'follows'
    } = request.query as { 
      page?: string; 
      type?: string;
      genres?: string;
      status?: string;
      sort?: string;
    };

    try {
      // Note: Comix.to requires types[] array format
      let endpoint = `/manga?types[]=manhwa&types[]=manhua&sort=${sort}&page=${page}&per_page=24`;
      
      if (genres) {
        endpoint += `&genres=${genres}`;
      }
      if (status) {
        endpoint += `&status=${status}`;
      }

      const data = await fetchApi(endpoint);
      const items = data.result?.items || [];

      const results = items.map((manga: any) => ({
        id: manga.hash_id || String(manga.manga_id),
        title: manga.title,
        image: manga.poster?.medium || manga.poster?.large || '',
        type: manga.type || 'Manhwa',
        rating: manga.rated_avg || 0,
        latestChapter: manga.latest_chapter,
      }));

      return reply.send({
        currentPage: parseInt(page),
        hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
        results,
      });
    } catch (error: any) {
      console.error('Comix.to browse error:', error);
      return reply.status(500).send({ error: 'Failed to browse' });
    }
  });

  // Latest updates
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page = '1' } = request.query as { page?: string };

    try {
      // Note: Comix.to requires types[] array format
      const data = await fetchApi(`/manga?types[]=manhwa&types[]=manhua&sort=updated&page=${page}&per_page=24`);
      const items = data.result?.items || [];

      const results = items.map((manga: any) => ({
        id: manga.hash_id || String(manga.manga_id),
        title: manga.title,
        image: manga.poster?.medium || manga.poster?.large || '',
        type: manga.type || 'Manhwa',
        latestChapter: manga.latest_chapter,
        updatedAt: manga.chapter_updated_at,
      }));

      return reply.send({
        currentPage: parseInt(page),
        hasNextPage: data.result?.pagination?.current_page < data.result?.pagination?.last_page,
        results,
      });
    } catch (error: any) {
      console.error('Comix.to latest error:', error);
      return reply.status(500).send({ error: 'Failed to get latest' });
    }
  });
};

export default routes;

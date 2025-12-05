import axios from 'axios';
import { load } from 'cheerio';

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

async function testSearch() {
  const query = 'dragon';
  const status: string = 'completed';
  const sort = 'latest';
  const pageNum = 1;

  try {
    const params = new URLSearchParams();
    params.append('s', query || '');
    params.append('post_type', 'wp-manga');
    
    if (sort) {
      params.append('m_orderby', sort);
    }
    
    if (status) {
      params.append('status', status === 'ongoing' ? 'on-going' : status);
    }

    const url = pageNum > 1
      ? `${baseUrl}/page/${pageNum}/?${params.toString()}`
      : `${baseUrl}/?${params.toString()}`;

    console.log(`Testing URL: ${url}`);

    const response = await client.get(url);
    const data = response.data;
    const $ = load(data);

    const results: any[] = [];
    const itemSelector = $('.c-tabs-item__content').length > 0 ? '.c-tabs-item__content' : '.page-item-detail, .c-tabs-item__content';
    
    console.log(`Found ${$(itemSelector).length} items with selector: ${itemSelector}`);

    $(itemSelector).each((_, el) => {
      const title = $(el).find('.post-title a').text().trim();
      console.log(`Found title: ${title}`);
    });

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
        console.error('Status:', error.response.status);
    }
  }
}

testSearch();

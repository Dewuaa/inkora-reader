import BrowserService from './BrowserService';

class HianimeScraper {
  private baseUrl = 'https://hianime.to';

  public async getEpisodeSources(episodeId: string): Promise<any> {
    const url = `${this.baseUrl}/watch/${episodeId}`;
    console.log(`[HianimeScraper] Scraping URL: ${url}`);

    try {
      const page = await BrowserService.getPage();
      
      try {
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        );
        
        // Network Interception Logic
        let videoUrl: string | null = null;
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            req.continue();
        });

        page.on('response', (response) => {
            const url = response.url();
            if (url.includes('.m3u8') || (url.includes('googlevideo.com') && url.includes('videoplayback'))) {
                console.log(`[HianimeScraper] DETECTED VIDEO STREAM: ${url}`);
                videoUrl = url;
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Strategy: Find the iframe, get its src, and visit it directly
        try {
            console.log('[HianimeScraper] Waiting for #iframe-embed...');
            await page.waitForSelector('#iframe-embed', { timeout: 10000 });
            
            const iframeSrc = await page.$eval('#iframe-embed', (el: any) => el.src);
            console.log(`[HianimeScraper] Found iframe src: ${iframeSrc}`);

            if (iframeSrc && iframeSrc.startsWith('http')) {
                console.log('[HianimeScraper] Navigating to iframe source to sniff network...');
                await page.goto(iframeSrc, { waitUntil: 'networkidle0', timeout: 30000 });
            }
        } catch (e) {
            console.log('[HianimeScraper] Could not find or navigate to #iframe-embed:', e);
        }

        // Wait a bit for any final network requests
        await new Promise(r => setTimeout(r, 3000));

        if (videoUrl) {
            const finalUrl = videoUrl as string;
            return {
                headers: { Referer: this.baseUrl },
                sources: [{ url: finalUrl, isM3U8: finalUrl.includes('.m3u8'), quality: 'auto' }],
                download: finalUrl
            };
        }
        
        return { error: 'No video source found via network sniffing' };

      } finally {
        await page.close();
      }
    } catch (error: any) {
      console.error(`[HianimeScraper] Error: ${error.message}`);
      throw error;
    }
  }
}

export default new HianimeScraper();

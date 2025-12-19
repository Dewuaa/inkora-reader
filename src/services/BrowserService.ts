import puppeteer, { Browser, Page } from 'puppeteer';

class BrowserService {
  private browser: Browser | null = null;

  public async launch(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
      ],
    });
  }

  public async getPage(): Promise<Page> {
    if (!this.browser) {
      await this.launch();
    }
    const page = await this.browser!.newPage();

    // Block images, fonts, and stylesheets for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Block heavy resources - we only need HTML
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  public async scrape(url: string, selector?: string): Promise<string> {
    const page = await this.getPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      );
      // Use domcontentloaded instead of networkidle2 - much faster
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      if (selector) {
        await page.waitForSelector(selector, { timeout: 5000 });
      }

      const content = await page.content();
      return content;
    } finally {
      await page.close();
    }
  }

  // Fast scrape - minimal waiting
  public async scrapeFast(url: string): Promise<string> {
    const page = await this.getPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      );
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      // Small delay for JS to populate content
      await new Promise((resolve) => setTimeout(resolve, 500));
      return await page.content();
    } finally {
      await page.close();
    }
  }
}

export default new BrowserService();

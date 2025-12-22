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

  // Get a page without request interception (for JS-heavy sites)
  private async getCleanPage(): Promise<Page> {
    if (!this.browser) {
      await this.launch();
    }
    const page = await this.browser!.newPage();
    return page;
  }

  // Scrape JS-heavy dynamic pages - waits for network to be idle
  // Does NOT block resources since some JS apps need them to render
  public async scrapeDynamic(
    url: string,
    selector?: string,
    timeout: number = 20000,
  ): Promise<string> {
    // Use clean page without resource blocking for JS-heavy sites
    const page = await this.getCleanPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Use networkidle2 (allows 2 inflight requests) for faster loading
      await page.goto(url, { waitUntil: 'networkidle2', timeout });

      if (selector) {
        // Wait for the specific selector with a longer timeout
        await page.waitForSelector(selector, { timeout: 15000 });
      }

      // Additional wait for any remaining JS execution
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const content = await page.content();
      return content;
    } finally {
      await page.close();
    }
  }
}

export default new BrowserService();

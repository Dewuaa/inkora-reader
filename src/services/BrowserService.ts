import puppeteer, { Browser, Page } from 'puppeteer';

class BrowserService {
  private browser: Browser | null = null;

  public async launch(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  public async getPage(): Promise<Page> {
    if (!this.browser) {
      await this.launch();
    }
    return this.browser!.newPage();
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
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      if (selector) {
        await page.waitForSelector(selector, { timeout: 5000 });
      }

      const content = await page.content();
      return content;
    } finally {
      await page.close();
    }
  }
}

export default new BrowserService();

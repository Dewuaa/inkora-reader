import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * FREE Anti-Block Strategy (No Paid Proxies Needed!)
 * 
 * This module uses multiple techniques to avoid IP bans:
 * 1. Rotating User-Agents (mimics different browsers)
 * 2. Random delays between requests
 * 3. Retry with exponential backoff
 * 4. Request headers that look like real browsers
 * 5. Rate limiting to avoid hammering servers
 * 
 * These techniques work for most manga sites!
 */

interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

// Large list of User-Agents to rotate (looks like different users)
const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  // Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  // Mobile (occasional mobile requests look more natural)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
];
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
];

// Get random User-Agent
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Get proxy config from environment
function getProxyConfig(): ProxyConfig | null {
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;

  if (!host || !port) {
    return null;
  }

  return {
    host,
    port: parseInt(port),
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD,
  };
}

// Build proxy URL
function buildProxyUrl(config: ProxyConfig): string {
  if (config.username && config.password) {
    return `http://${config.username}:${config.password}@${config.host}:${config.port}`;
  }
  return `http://${config.host}:${config.port}`;
}

/**
 * Create an Axios client with optional proxy and rotating User-Agent
 */
export function createProxyClient(options?: {
  timeout?: number;
  retries?: number;
}): AxiosInstance {
  const proxyConfig = getProxyConfig();
  const timeout = options?.timeout || 30000;

  const axiosConfig: AxiosRequestConfig = {
    timeout,
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  };

  // Add proxy if configured
  if (proxyConfig) {
    axiosConfig.proxy = {
      host: proxyConfig.host,
      port: proxyConfig.port,
      auth:
        proxyConfig.username && proxyConfig.password
          ? {
              username: proxyConfig.username,
              password: proxyConfig.password,
            }
          : undefined,
    };

    console.log(`[Proxy] Using proxy: ${proxyConfig.host}:${proxyConfig.port}`);
  }

  const client = axios.create(axiosConfig);

  // Add request interceptor to rotate User-Agent on each request
  client.interceptors.request.use((config) => {
    config.headers['User-Agent'] = getRandomUserAgent();
    return config;
  });

  return client;
}

/**
 * Fetch with retry logic and proxy rotation
 */
export async function fetchWithRetry(
  url: string,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
  },
): Promise<string> {
  const maxRetries = options?.maxRetries || 3;
  const retryDelay = options?.retryDelay || 1000;
  const timeout = options?.timeout || 30000;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = createProxyClient({ timeout });
      const response = await client.get(url);
      return response.data;
    } catch (error: any) {
      lastError = error;
      console.warn(
        `[Fetch] Attempt ${attempt}/${maxRetries} failed for ${url}: ${error.message}`,
      );

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}

/**
 * Simple rate limiter to avoid hitting sites too fast
 */
class RateLimiter {
  private lastRequest: number = 0;
  private minDelay: number;

  constructor(requestsPerSecond: number = 2) {
    this.minDelay = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;

    if (elapsed < this.minDelay) {
      await new Promise((resolve) => setTimeout(resolve, this.minDelay - elapsed));
    }

    this.lastRequest = Date.now();
  }
}

export const rateLimiter = new RateLimiter(2); // 2 requests per second

/**
 * Add random delay between requests (looks more human)
 */
export async function randomDelay(minMs: number = 500, maxMs: number = 2000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Get random referer to look more natural
 */
export function getRandomReferer(): string {
  const referers = [
    'https://www.google.com/',
    'https://www.google.com/search?q=manga',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    '', // Sometimes no referer
  ];
  return referers[Math.floor(Math.random() * referers.length)];
}

/**
 * FREE Anti-Block Tips:
 * 
 * 1. ✅ Rotating User-Agents (already implemented)
 * 2. ✅ Random delays between requests
 * 3. ✅ Retry with exponential backoff
 * 4. ✅ Rate limiting
 * 5. ✅ Realistic headers
 * 
 * If you still get blocked:
 * - Reduce request frequency (change RateLimiter to 1 req/sec)
 * - Add longer random delays
 * - Try at different times of day
 * - Most manga sites are lenient - you likely won't need proxies!
 */

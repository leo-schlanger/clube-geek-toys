import { describe, it, expect, vi } from 'vitest';

// The Zod env schema runs on import and exits the process without real vars.
vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../services/log.service.js', () => ({}));
vi.mock('../db/ensure-schema.js', () => ({ getSchemaState: () => ({}) }));

import { isCrawlerReport } from './log.routes.js';

/**
 * 135 of 163 frontend error rows in ten days were crawlers. What a person
 * saw must still be logged; what only a bot saw must not.
 */
describe('isCrawlerReport', () => {
  it('drops search and link crawlers', () => {
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
    ]) {
      expect(isCrawlerReport(ua, undefined), ua).toBe(true);
    }
  });

  it("drops Google's renderer even when the UA looks like a browser", () => {
    expect(
      isCrawlerReport(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0 Safari/537.36',
        'Error: Rejected\n    at wrsParams.serviceWorkers.navigator.serviceWorker.register (<anonymous>:12:648)'
      )
    ).toBe(true);
  });

  it('keeps what people report', () => {
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 16; motorola edge 60) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G90 Instagram 448.0.0.39.66',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36',
    ]) {
      expect(isCrawlerReport(ua, 'TypeError: x is undefined'), ua).toBe(false);
    }
    expect(isCrawlerReport(undefined, undefined)).toBe(false);
  });
});

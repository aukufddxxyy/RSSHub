import type { Browser } from 'rebrowser-puppeteer';

import { config } from '@/config';
import ofetch from '@/utils/ofetch';
import puppeteer from '@/utils/puppeteer';

const baseUrl = 'https://www.sehuatang.net';

const isChallengePage = (html: string): boolean => html.includes('cdn-cgi/challenge-platform') || (html.includes("var safeid='") && !html.includes('#threadlisttableid'));

const fetchPage = async (url: string, cookie?: string): Promise<string> => {
    const headers: Record<string, string> = {
        'User-Agent': config.trueUA,
    };
    if (cookie) {
        headers.Cookie = cookie;
    }

    try {
        const html = await ofetch(url, { headers });
        if (isChallengePage(html)) {
            return await fetchWithPuppeteer(url, cookie);
        }
        return html;
    } catch {
        return await fetchWithPuppeteer(url, cookie);
    }
};

let sharedBrowser: Browser | undefined;

const getSharedBrowser = async (): Promise<Browser> => {
    if (!sharedBrowser || !sharedBrowser.connected) {
        sharedBrowser = await puppeteer();
    }
    return sharedBrowser;
};

const fetchWithPuppeteer = async (url: string, cookie?: string): Promise<string> => {
    const browser = await getSharedBrowser();
    const page = await browser.newPage();

    try {
        if (cookie) {
            const cookiePairs = cookie
                .split(';')
                .map((pair) => pair.trim())
                .filter(Boolean);
            const cookies = cookiePairs.map((pair) => {
                const [name, ...rest] = pair.split('=');
                return {
                    name: name.trim(),
                    value: rest.join('=').trim(),
                    domain: new URL(url).hostname,
                };
            });
            if (cookies.length > 0) {
                await page.setCookie(...cookies);
            }
        }

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

        let html = await page.evaluate(() => document.documentElement.innerHTML);

        if (!html.includes('threadlisttableid') && !html.includes('postlist') && !html.includes('delform')) {
            try {
                await page.waitForSelector('#threadlisttableid, #postlist, #delform, .alert_error, #messagetext, .t_f', { timeout: 15000 });
            } catch {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => 'navigation timeout, proceeding with current content');
            }
            html = await page.evaluate(() => document.documentElement.innerHTML);
        }

        return html;
    } finally {
        await page.close();
    }
};

export { baseUrl, fetchPage };

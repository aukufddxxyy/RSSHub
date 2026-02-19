import { config } from '@/config';
import cache from '@/utils/cache';

export const baseUrl = 'https://www.sehuatang.net';

// Cloudflare blocks thread-XXX.html but allows forum.php — convert for server-side fetch
export function toForumPhpUrl(url: string): string {
    const match = url.match(/thread-(\d+)/);
    return match ? `${baseUrl}/forum.php?mod=viewthread&tid=${match[1]}` : url;
}

function buildHeaders(cookie?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'User-Agent': config.trueUA,
        Referer: `${baseUrl}/`,
    };
    if (cookie) {
        headers.Cookie = cookie;
    }
    return headers;
}

function replaceSafeId(cookie: string, safeId: string): string {
    if (/_safe=/.test(cookie)) {
        return cookie.replace(/_safe=[^;]*/, `_safe=${safeId}`);
    }
    return `${cookie}; _safe=${safeId}`;
}

function extractSafeId(html: string): string {
    return html.match(/safeid\s*=\s*'(.+)';/)?.[1] ?? '';
}

function isSafeIdChallenge(html: string): boolean {
    return html.includes('safeid') && !html.includes('threadlisttableid') && !html.includes('postmessage');
}

export async function fetchPage(url: string): Promise<string> {
    const cookie = config.sehuatang.cookie;
    const response = await fetch(url, { headers: buildHeaders(cookie), redirect: 'manual' });
    const html = await response.text();

    if (!cookie || !isSafeIdChallenge(html)) {
        return html;
    }

    const safeId = await cache.tryGet('sehuatang:safeid', () => Promise.resolve(extractSafeId(html)), config.cache.routeExpire, false);

    if (!safeId) {
        return html;
    }

    const freshCookie = replaceSafeId(cookie, safeId as string);
    const retryResponse = await fetch(url, { headers: buildHeaders(freshCookie), redirect: 'manual' });
    return retryResponse.text();
}

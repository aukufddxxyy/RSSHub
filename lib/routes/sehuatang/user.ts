import { load } from 'cheerio';

import { config } from '@/config';
import ConfigNotFoundError from '@/errors/types/config-not-found';
import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://www.sehuatang.net';

export const route: Route = {
    path: '/user/:uid',
    categories: ['multimedia'],
    example: '/sehuatang/user/411096',
    parameters: { uid: '用户 uid, 可在用户主页 URL 中找到' },
    features: {
        requireConfig: [
            {
                name: 'SEHUATANG_COOKIE',
                description: '',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: true,
        nsfw: true,
    },
    name: '作者文章',
    maintainers: ['JamYiz'],
    handler,
};

async function handler(ctx) {
    if (!config.sehuatang.cookie) {
        throw new ConfigNotFoundError('Sehuatang RSS is disabled due to the lack of <a href="https://docs.rsshub.app/deploy/config#route-specific-configurations">relevant config</a>');
    }

    const uid = ctx.req.param('uid');
    const link = `${baseUrl}/home.php?mod=space&uid=${uid}&do=thread&view=me&from=space`;
    const cookie = config.sehuatang.cookie;
    const headers: Record<string, string> = {
        Cookie: cookie,
        'User-Agent': config.trueUA,
        Referer: `${baseUrl}/`,
    };

    const response = await ofetch(link, { headers });
    const $ = load(response);

    const list = $('#delform tr:not(.th)')
        .slice(0, ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 25)
        .toArray()
        .map((item) => {
            const $item = $(item);
            const a = $item.find('th>a').first();
            const category = $item.find('.xg1').first().text();
            return {
                title: `[${category}] ${a.text()}`,
                link: `${baseUrl}/${a.attr('href')}`,
                author: $('.mt').first().text(),
            };
        });

    const out: DataItem[] = await Promise.all(
        list.map((info) =>
            cache.tryGet(info.link, async () => {
                try {
                    const response = await ofetch(info.link, { headers });
                    const $ = load(response);

                    const postMessage = $("[id^='postmessage']").slice(0, 1);
                    const images = $(postMessage).find('img');
                    for (const image of images) {
                        const file = $(image).attr('file');
                        if (!file || file === 'undefined') {
                            $(image).replaceWith('');
                        } else {
                            $(image).replaceWith($(`<img src="${file}">`));
                        }
                    }

                    const pattl = $('.pattl');
                    const pattlImages = $(pattl).find('img');
                    for (const pattlImage of pattlImages) {
                        const file = $(pattlImage).attr('file');
                        if (!file || file === 'undefined') {
                            $(pattlImage).replaceWith('');
                        } else {
                            $(pattlImage).replaceWith($(`<img src="${file}" />`));
                        }
                    }
                    postMessage.append($(pattl));
                    $('em[onclick]').remove();

                    const description = (postMessage.html() || '抓取原帖失败').replaceAll('ignore_js_op', 'div');

                    let pubDate;
                    if ($('.authi em span').length > 0) {
                        pubDate = parseDate($('.authi em span').attr('title') ?? '');
                    } else {
                        const dateString = $('.authi em').first().text();
                        const parts = dateString.split(' ');
                        if (parts.length >= 3) {
                            pubDate = parseDate(`${parts[1]} ${parts[2]}`);
                        }
                    }

                    const magnet = postMessage.find('div.blockcode li').first().text();
                    const isMag = magnet.startsWith('magnet');
                    const torrent = postMessage.find('p.attnm a').attr('href');
                    const hasEnclosureUrl = isMag || torrent !== undefined;

                    return {
                        ...info,
                        description,
                        pubDate,
                        ...(hasEnclosureUrl
                            ? {
                                  enclosure_url: isMag ? magnet : new URL(torrent!, baseUrl).href,
                                  enclosure_type: isMag ? 'application/x-bittorrent' : 'application/octet-stream',
                              }
                            : {}),
                    } as DataItem;
                } catch {
                    // Detail page may return 403 due to Cloudflare challenge,
                    // fall back to list-level info without full description
                    return info as DataItem;
                }
            })
        )
    );

    return {
        title: `${$('.mt').text()}的帖子-色花堂`,
        link,
        item: out,
    };
}

import { load } from 'cheerio';

import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

import { baseUrl, fetchPage } from './utils';

const forumIdMaps: Record<string, string> = {
    gcyc: '2',
    yzwmyc: '36',
    yzymyc: '37',
    gqzwzm: '103',
    sjxz: '107',
    vr: '160',
    srym: '104',
    omwm: '38',
    '4k': '151',
    hgzb: '152',
    dmyc: '39',
    yczp: '155',
    ztzp: '125',
    hrjp: '50',
    yzxa: '48',
    omxa: '49',
    ktdm: '117',
    ttxz: '165',
    zhtl: '95',
    mrhj: '106',
    ai: '113',
    ydsc: '111',
    hrxazp: '98',
};

export const route: Route = {
    path: ['/:subforumid?/:type?', ''],
    name: 'Forum',
    example: '/sehuatang/gqzwzm',
    maintainers: ['qiwihui', 'junfengP', 'nczitzk'],
    handler,
    categories: ['multimedia'],
    features: {
        requirePuppeteer: true,
        antiCrawler: true,
        nsfw: true,
    },
    parameters: {
        subforumid: '板块缩写或 id，见下表，默认为 gqzwzm（高清中文字幕）',
        type: '帖子类型 id，可选',
    },
    description: `**原创 BT 电影**

| 国产原创 | 亚洲无码原创 | 亚洲有码原创 | 高清中文字幕 | 三级写真 | VR 视频 | 素人有码 | 欧美无码 | 韩国主播 | 动漫原创 | 综合讨论 |
| -------- | ------------ | ------------ | ------------ | -------- | ------- | -------- | -------- | -------- | -------- | -------- |
| gcyc     | yzwmyc       | yzymyc       | gqzwzm       | sjxz     | vr      | srym     | omwm     | hgzb     | dmyc     | zhtl     |

  **色花图片**

| 原创自拍 | 转贴自拍 | 华人街拍 | 亚洲性爱 | 欧美性爱 | 卡通动漫 | 套图下载 |
| -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| yczp     | ztzp     | hrjp     | yzxa     | omxa     | ktdm     | ttxz     |`,
};

async function handler(ctx) {
    const subformName = ctx.req.param('subforumid') ?? 'gqzwzm';
    const subformId = subformName in forumIdMaps ? forumIdMaps[subformName] : subformName;
    const type = ctx.req.param('type');
    const typefilter = type ? `&filter=typeid&typeid=${type}` : '';
    const link = `${baseUrl}/forum.php?mod=forumdisplay&orderby=dateline&fid=${subformId}${typefilter}`;

    const response = await fetchPage(link);
    const $ = load(response);

    const list = $('#threadlisttableid tbody[id^=normalthread]')
        .slice(0, ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 25)
        .toArray()
        .map((item) => {
            const $item = $(item);
            const hasCategory = $item.find('th em a').length;
            return {
                title: `${hasCategory ? `[${$item.find('th em a').text()}]` : ''} ${$item.find('a.xst').text()}`,
                link: `${baseUrl}/${$item.find('a.xst').attr('href')}`,
                pubDate: parseDate($item.find('td.by').find('em span span').attr('title') ?? ''),
                author: $item.find('td.by cite a').first().text(),
            };
        });

    const out: DataItem[] = await Promise.all(
        list.map((info) =>
            cache.tryGet(info.link, async () => {
                const response = await fetchPage(info.link);
                const $ = load(response);

                const postMessage = $('div[id^="postmessage"], td[id^="postmessage"]').slice(0, 1);
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
                const pubDate = timezone(parseDate($('.authi em span').attr('title') ?? ''), 8);

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
            })
        )
    );

    return {
        title: `色花堂 - ${$('#pt > div:nth-child(1) > a:last-child').text()}`,
        link,
        item: out,
    };
}

// eslint-disable-next-line max-classes-per-file
import axios, { AxiosResponse } from 'axios';
import cheerio from 'cheerio';
import EventEmitter from 'events';
import KnowParser from 'know-parser';
import Queue from './model/queue';
import QueueItem, { QueueItemObject } from './model/queueItem';

export default class Spider extends EventEmitter {
    private queue = new Queue();

    public maxDepth = 4;

    public maxConcurrency = 10;

    public allowInitialRedirect = false;

    constructor(spiderOptions?: SpiderOptions) {
        super();

        this.maxDepth = spiderOptions?.maxDepth || this.maxDepth;
        this.maxConcurrency = spiderOptions?.maxConcurrency || this.maxConcurrency;
    }

    start(url: string): void {
        const starterItem = new QueueItem(
            url,
        );

        this.addToQueue(starterItem, true);
        this.sendRequest(starterItem);
    }

    private addToQueue(queueItem: QueueItem, start?: boolean) {
        this.queue.add(queueItem);
        if (start) {
            this.emitStart(queueItem);
        }
        this.emitQueueAdd(queueItem);
    }

    private emitStart(queueItem: QueueItem): void {
        this.emit('start', queueItem.toObject());
    }

    private emitQueueAdd(queueItem: QueueItem): void {
        this.emit('queueadd', queueItem.toObject());
    }

    private emitFetched(queueItem: QueueItem, response: AxiosResponse) {
        this.emit('fetched', queueItem.toObject(), response.data);
    }

    sendRequest(item: QueueItem): void {
        const axiosOptions = item.options;
        axiosOptions.url = item.url;
        item.setToWaiting();

        axios(axiosOptions).then(async response => {
            await this.handleResponse(item, response);
            this.emitFetched(item, response);
        });
    }

    private async handleResponse(queueItem: QueueItem, response: AxiosResponse): Promise<void> {
        queueItem.setToComplete();
        queueItem.responseStatus = response.status;
        const newDepth = queueItem.depth + 1;
        if (response.data !== 'string') {
            throw new Error(`Unexpcted response for URL: ${queueItem.url}`);
        }
        if (newDepth > this.maxDepth) {
            return;
        }
        const linksFoundFromResponse = this.gatherLinks(response.data, queueItem.toObject());
        for (let i = 0; i < linksFoundFromResponse.length; i++) {
            const currentLink = linksFoundFromResponse[i];
            const itemToAdd = new QueueItem(
                currentLink,
                null,
                newDepth,
            );
            this.addToQueue(itemToAdd);
        }
    }

    gatherLinks(response: string, queueItem: QueueItemObject): string[] {
        const body = response;
        const $ = cheerio.load(body);
        const links: string[] = [];
        const locationAssign = /window\.location\.(?:assign\(|href(?:\s|)=(?:\s|))(?:'|")(\/[A-z0-9_-]+)(?:"|')/;
        const assignMatch = body.match(locationAssign);
        if (assignMatch && assignMatch[1]) {
            links.push(`${queueItem.baseURL}${assignMatch[1]}`);
        }

        // Clause for window.location='address'
        const locationEquals = /(?:window\.location(?:\s|)=(?:\s|))(?:"|')((http:\/\/|\/)[A-z0-9\/.]+)(?:"|')/;
        const equalsMatch = body.match(locationEquals);
        if (equalsMatch && equalsMatch[1]) {
            links.push(equalsMatch[1]);
        }

        links.push(...$('a[href]').map(
            (index, element) => {
                let strLink = $(element).attr('href') as string;

                const protocolRegex = /^http(s|)?:\/\//i;
                const protocolPresent = protocolRegex.test(strLink);

                // we hava href here instead of a full link
                if (!strLink.startsWith('/') && !protocolPresent) {
                    strLink = `/${strLink}`;
                }
                strLink = protocolPresent ?
                    strLink :
                    `${queueItem.baseURL}${strLink}`;

                return strLink;
            },
        ).get());

        // check meta tag to see if we were 'redirected'
        const metaLocationRedirect = /<meta http-equiv=(?:"|'|)refresh(?:"|'|) content="[0-9]+;(?:\s|)(?:url|URL)=(?:"|'|)(http(?:s|):\/\/[^"']+)/i;
        const metaMatch = body.match(metaLocationRedirect);

        const metaPathRedirect = /<meta http-equiv=(?:"|'|)refresh(?:"|'|) content="[0-9]+;(?:\s|)url=(?:"|'|)([^"']+)/i;
        const metaPathMatch = body.match(metaPathRedirect);
        // we see a redirect in meta tag
        if (metaMatch && metaMatch[1]) {
            // set redirect domain and push to front of queue - gathering new data
            links.unshift(metaMatch[1]);
        } else if (metaPathMatch) {
            // redirected to specific path - head there next
            const strURL = `${queueItem.baseURL}${metaPathMatch[1]}`;
            links.unshift(strURL);
        }

        const knowParser = new KnowParser(body);
        links.push(knowParser.get('links'));

        const firstItemInQueue = queueItem.id === 1;

        // its the first item, it has 1 link and its a redirect
        // BUT we don't allow this so return no links
        if (firstItemInQueue && links.length === 1 && !links[0].includes(queueItem.hostname) && !this.allowInitialRedirect) {
            return [];
        }

        let linksToReturn = links;
        // filter out links not related to this website
        if (!this.allowInitialRedirect || !firstItemInQueue) {
            linksToReturn = linksToReturn.filter(currentLink => currentLink.includes(queueItem.hostname));
        }

        return linksToReturn;
    }
}

interface SpiderOptions {
    maxConcurrency: number,
    maxDepth: number,
}

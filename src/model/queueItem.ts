import { AxiosRequestConfig } from 'axios';
import { parseDomain } from 'parse-domain';

export default class QueueItem {
    public readonly url: string;

    public readonly options: AxiosRequestConfig;

    public static readonly statusFetched = 'fetched';

    public static readonly statusFailed = 'failed';

    public static readonly statusQueued = 'queued';

    public static readonly statusWaiting = 'waiting';

    private static id = 0;

    public readonly id: number;

    public responseStatus: number | null = null;

    public rawResponse: any = null;

    public readonly depth: number;

    public statusInQueue:
        typeof QueueItem.statusFetched |
        typeof QueueItem.statusFailed |
        typeof QueueItem.statusWaiting |
        typeof QueueItem.statusQueued;

    public timeStarted: number | null = null;

    public timeCompleted: number | null = null;

    public readonly baseURL: string;

    public readonly hostname: string;

    constructor(url: string, options?: AxiosRequestConfig | null, depth?: number) {
        this.url = url.toLowerCase();
        this.options = options || {};
        this.statusInQueue = QueueItem.statusQueued;
        this.id = QueueItem.id++;
        this.depth = depth || 1;

        const baseURLRegex = /^(http|https):\/\/[^\/]+/i;
        const baseMatch = this.url.match(baseURLRegex);
        if (!baseMatch) {
            throw new Error('Invalid URL passed');
        }

        [this.baseURL] = baseMatch;

        const parsedResult = parseDomain(this.url.replace(/http(|s):\/\//, ''));
        if (parsedResult.type !== 'LISTED') {
            throw new Error('Invalid URL passed');
        }

        this.hostname = `${parsedResult.subDomains.join('.')}${parsedResult.domain}${parsedResult.topLevelDomains.join('.')}`;
    }

    setToWaiting(): void {
        this.timeStarted = Date.now();
        this.statusInQueue = QueueItem.statusQueued;
    }

    setToComplete(): void {
        this.timeCompleted = Date.now();
        this.statusInQueue = QueueItem.statusFetched;
    }

    toObject(): QueueItemObject {
        return {
            id: this.id,
            status: this.statusInQueue,
            responseStatus: this.responseStatus,
            timeStarted: this.timeStarted,
            url: this.url,
            baseURL: this.baseURL,
            hostname: this.hostname,
        };
    }
}

export interface QueueItemObject {
    id: number,
    status: QueueItem['statusInQueue'],
    responseStatus: number | null,
    timeStarted: number | null,
    url: string,
    baseURL: string,
    hostname: string,
}

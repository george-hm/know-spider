import QueueItem from './queueItem';

export default class Queue {
    private queueItems: QueueItem[];

    constructor(queueItems?: QueueItem[]) {
        this.queueItems = queueItems || [];
    }

    add(item: QueueItem): void {
        this.queueItems.push(item);
    }

    getItemsToProcess(limit: number): QueueItem[] {
        const queuesToReturn: QueueItem[] = [];
        for (let i = 0; i < this.queueItems.length; i++) {
            const item = this.queueItems[i];
            if (queuesToReturn.length >= limit) {
                break;
            }

            if (item.statusInQueue === QueueItem.statusQueued) {
                queuesToReturn.push(item);
            }
        }

        return queuesToReturn;
    }
}

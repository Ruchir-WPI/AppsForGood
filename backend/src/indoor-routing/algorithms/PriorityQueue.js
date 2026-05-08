// Small binary min-heap priority queue shared by the routing algorithms. Duplicate
// entries are allowed; algorithms ignore stale entries after better costs appear.
class PriorityQueue {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(value, priority) {
        this.items.push({ value, priority });
        this.#bubbleUp(this.items.length - 1);
    }

    pop() {
        if (this.items.length === 0) {
            return null;
        }

        const top = this.items[0];
        const end = this.items.pop();

        if (this.items.length > 0) {
            this.items[0] = end;
            this.#sinkDown(0);
        }

        return top;
    }

    #bubbleUp(index) {
        let currentIndex = index;

        while (currentIndex > 0) {
            const parentIndex = Math.floor((currentIndex - 1) / 2);

            if (this.items[currentIndex].priority >= this.items[parentIndex].priority) {
                break;
            }

            [this.items[currentIndex], this.items[parentIndex]] = [
                this.items[parentIndex],
                this.items[currentIndex],
            ];
            currentIndex = parentIndex;
        }
    }

    #sinkDown(index) {
        let currentIndex = index;
        const length = this.items.length;

        while (true) {
            const left = currentIndex * 2 + 1;
            const right = currentIndex * 2 + 2;
            let smallest = currentIndex;

            if (left < length && this.items[left].priority < this.items[smallest].priority) {
                smallest = left;
            }

            if (right < length && this.items[right].priority < this.items[smallest].priority) {
                smallest = right;
            }

            if (smallest === currentIndex) {
                break;
            }

            [this.items[currentIndex], this.items[smallest]] = [
                this.items[smallest],
                this.items[currentIndex],
            ];
            currentIndex = smallest;
        }
    }
}

module.exports = PriorityQueue;

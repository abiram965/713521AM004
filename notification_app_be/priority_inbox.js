const { Log } = require("../logging_middleware");
require("dotenv").config();

const TOKEN = process.env.ACCESS_TOKEN;
const NOTIF_URL = "http://20.207.122.201/evaluation-service/notifications";

const WEIGHT = { Placement: 3, Result: 2, Event: 1 };

// Min-heap by priority score
class MinHeap {
  constructor() { this.heap = []; }
  
  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  peek() { return this.heap[0]; }
  size() { return this.heap.length; }

  _score(item) {
    const ts = new Date(item.Timestamp).getTime();
    return (WEIGHT[item.Type] || 0) * 1e12 + ts;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this._score(this.heap[parent]) > this._score(this.heap[i])) {
        [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
        i = parent;
      } else break;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._score(this.heap[l]) < this._score(this.heap[smallest])) smallest = l;
      if (r < n && this._score(this.heap[r]) < this._score(this.heap[smallest])) smallest = r;
      if (smallest !== i) {
        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      } else break;
    }
  }
}

function getTopN(notifications, n) {
  const heap = new MinHeap();
  for (const notif of notifications) {
    if (heap.size() < n) {
      heap.push(notif);
    } else {
      const minScore = heap._score(heap.peek());
      const curScore = heap._score(notif);
      if (curScore > minScore) {
        heap.pop();
        heap.push(notif);
      }
    }
  }
  // Extract and sort descending (highest priority first)
  const result = [];
  while (heap.size() > 0) result.unshift(heap.pop());
  return result;
}

async function main() {
  await Log("backend", "info", "service", "Starting priority inbox fetch");

  const res = await fetch(NOTIF_URL, {
    headers: { "Authorization": `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  const notifications = data.notifications;

  await Log("backend", "info", "service", `Fetched ${notifications.length} notifications`);

  const N = 10;
  const top = getTopN(notifications, N);

  await Log("backend", "info", "service", `Top ${N} notifications computed`);

  console.log(`\nTop ${N} Priority Notifications:`);
  console.log("=".repeat(50));
  top.forEach((n, i) => {
    console.log(`${i + 1}. [${n.Type}] ${n.Message} — ${n.Timestamp}`);
  });

  return top;
}

main().catch(async (err) => {
  await Log("backend", "fatal", "service", `Priority inbox failed: ${err.message}`);
  console.error(err);
});
// Sender times and local arrival times are monotonic milliseconds with unrelated origins.
export class PeerTimeline {
  constructor() {
    this.samples = [];
    this.clockOffset = Infinity;
  }

  receive(data, arrival) {
    // Earlier clients leave this reserved float at zero.
    const sent = data[215] > 0 ? data[215] * 1000 : arrival;
    const latest = this.samples.at(-1);
    if (latest && sent <= latest.sent) return false;
    if (latest && arrival - latest.arrival > 2500) {
      this.samples.length = 0;
    }
    // The smallest observed transit delay maps sender time onto the local clock.
    this.clockOffset = Math.min(this.clockOffset, arrival - sent);
    this.samples.push({sent, arrival, data});
    if (this.samples.length > 8) this.samples.shift();
    return true;
  }

  at(now) {
    const target = now - this.clockOffset - 150;
    let left = this.samples[0];
    for (const right of this.samples) {
      if (right.sent >= target) {
        const span = right.sent - left.sent;
        return {left: left.data, right: right.data, fraction: span ? (target - left.sent) / span : 0};
      }
      left = right;
    }
    return {left: left.data, right: left.data, fraction: 0};
  }

  age(now) { return now - (this.latest.sent + this.clockOffset); }

  get latest() { return this.samples.at(-1); }
}

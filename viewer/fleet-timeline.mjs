// Sender times and local arrival times are monotonic milliseconds with unrelated origins.
export class PeerTimeline {
  constructor() {
    this.samples = [];
    this.clockOffset = Infinity;
    this.armed = false;
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

  writeTraffic(now, east, north, rows, offset) {
    if (!this.latest || this.age(now) > 650) return false;
    const {data} = this.latest;
    if (Math.hypot(east - data[0], north - data[1]) > 5.5) this.armed = true;
    if (!this.armed) return false;
    rows.set([1, data[0], data[1], data[2], data[212], data[213], data[214], data[3], data[207]], offset);
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

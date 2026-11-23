function cruiserHeading(data){
  const [x,y,z,w]=data.subarray(220,224);
  return Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z));
}

// Sender times and local arrival times are monotonic milliseconds with unrelated origins.
export class PeerTimeline {
  constructor(timestampIndex = 215) {
    this.timestampIndex = timestampIndex;
    this.samples = [];
    this.clockOffset = Infinity;
    this.armed = false;
  }

  receive(data, arrival) {
    // Earlier clients leave this reserved float at zero.
    const stamp = data[this.timestampIndex];
    const sent = stamp > 0 ? stamp * 1000 : arrival;
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

  writeTraffic(now, east, north, rows, offset, heading=0, cruiser=false) {
    if (!this.latest || this.age(now) > 650) return false;
    const {data,sent}=this.latest;
    const x=cruiser?data[217]:data[0],y=cruiser?data[218]:data[1];
    const yaw=cruiser?cruiserHeading(data):data[2];
    if(!this.armed) {
      const angle=Math.atan2(Math.sin(yaw-heading),Math.cos(yaw-heading));
      // Identical launch poses can briefly coincide while the second
      // participant loads. Any distinct approach is eligible at once.
      this.armed=Math.hypot(east-x,north-y)>.75||Math.abs(angle)>.09;
    }
    if(!this.armed)return false;
    let ve=data[212],vn=data[213],yawRate=data[214];
    if(cruiser){
      ve=vn=yawRate=0;
      const previous=this.samples.at(-2),dt=previous?(sent-previous.sent)*.001:0;
      if(dt>.005&&dt<.5){
        ve=(x-previous.data[217])/dt;vn=(y-previous.data[218])/dt;
        const turn=yaw-cruiserHeading(previous.data);
        yawRate=Math.atan2(Math.sin(turn),Math.cos(turn))/dt;
      }
    }
    rows.set([1,x,y,yaw,ve,vn,yawRate,cruiser?data[219]:data[3],cruiser?2:data[207]],offset);
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

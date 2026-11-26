"""Bake three-dimensional pectoral rowing and a thicker neutral body into a rig cycle."""
import math


def flank_attachment(asset, x, z, side):
    frame, ids = asset["frames"][0], asset["index"]
    outer = None
    for at in range(0, len(ids), 3):
        tri = ids[at:at+3]
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = [frame[i*3:i*3+3] for i in tri]
        determinant = (bx-ax)*(cz-az)-(bz-az)*(cx-ax)
        if abs(determinant) < 1e-12:
            continue
        u = ((x-ax)*(cz-az)-(z-az)*(cx-ax))/determinant
        v = ((bx-ax)*(z-az)-(bz-az)*(x-ax))/determinant
        weights = (1-u-v, u, v)
        if min(weights) < -1e-9:
            continue
        depth = side * sum(w*y for w,y in zip(weights,(ay,by,cy)))
        if outer is None or depth > outer[0]:
            outer = depth, list(zip(tri, weights))
    if not outer:
        raise ValueError("Fin attachment outside body")
    return outer[1]


def finish(asset, species):
    if asset.get("swimProfile"):
        raise ValueError("Expected original eight rig poses")
    # Separate the static bilateral anatomy from the original armature's motion.
    # Widening around y=0 every frame would also multiply the head sway.
    gain, tail_gain, cycle = {"bait": (.46,.80,.53), "tang": (.52,.12,.67),
                              "clown": (.77,.12,.72)}[species]
    frames = asset["frames"]
    rest = frames[0]
    lo, hi = min(rest[::3]), max(rest[::3])
    length = hi-lo
    for i in range(0,len(rest),3):
        t = max(0,min(1,(rest[i]-lo)/length))
        bulge = math.sin(math.pi*t)**.72
        neutral = sum(f[i+1] for f in frames)/len(frames)
        for frame in frames:
            motion = frame[i+1]-neutral
            frame[i+1] = round(neutral*(1+gain*bulge)+motion*(1+tail_gain*(1-t)**2),6)
    # Rayed paired pectorals attach by barycentric coordinates to the gill
    # region, so the roots follow the actual nearby skin in all eight poses.
    pivot_x = lo+(.76 if species=="bait" else .72)*length
    pivot_z = (max(rest[2::3])+min(rest[2::3]))*.50
    ribs, bands = 10, 5
    zmin,zmax=min(rest[2::3]),max(rest[2::3])
    atlas_scale=min(960/length,586/(zmax-zmin))
    for side in (-1,1):
        anchor = flank_attachment(asset,pivot_x,pivot_z,side)
        start = len(frames[0])//3
        for k,frame in enumerate(frames):
            phase = 2*math.pi*k/len(frames)+side*.30
            center = [sum(frame[i*3+d]*w for i,w in anchor) for d in range(3)]
            for layer in (-1,1):
                for row in range(bands+1):
                    r=row/bands
                    for rib in range(ribs+1):
                        s=rib/ribs
                        # Broad blade with a narrow muscular root and separated,
                        # flexing outer rays on the power stroke.
                        extent = r*(.75+.25*math.sin(math.pi*s))
                        sweep = 1+.18*math.sin(phase-.62*r)
                        dx = -(.004+.124*extent*sweep)*length
                        dy = side*length*(-.008+.091*extent*(1+.42*math.cos(phase-.54*r)))
                        chord=.030*(1-r)+.076*math.sin(math.pi*r)**.63+.014*r
                        dz = length*((s-.49)*chord-.054*extent+
                                     .019*extent*math.sin(phase-.91*r))
                        dy += side*length*layer*(.0008+.0015*math.sin(math.pi*r))
                        frame.extend(round(center[d]+offset,6) for d,offset in enumerate((dx,dy,dz)))
                        if k==0:
                            if species=="bait":
                                uv=(.762+.204*s,.20+.72*r)
                            else:
                                # Reuse a narrow caudal-fin swatch from this
                                # species' registered anatomical photo atlas.
                                ref_x=lo+length*(.132-.085*r)
                                ref_z=pivot_z+(s-.5)*length*(.025+.07*r)
                                uv=(.5+atlas_scale*(ref_x-(lo+hi)*.5)/1024,
                                    .5+atlas_scale*(ref_z-(zmin+zmax)*.5)/650)
                            asset["uv"].extend(round(x,6) for x in uv)
        stride=ribs+1
        offset=(bands+1)*stride
        def quad(a,b,c,d,flip):
            for tri in ((a,b,c),(a,c,d)):
                asset["index"].extend(start+i for i in (reversed(tri) if flip else tri))
                asset["colors"].append([1,1,1])
        for row in range(bands):
            for rib in range(ribs):
                a=row*stride+rib
                quad(a,a+stride,a+stride+1,a+1,side>0)
                a+=offset
                quad(a,a+stride,a+stride+1,a+1,side<0)
        border=list(range(stride))+[r*stride+ribs for r in range(1,bands+1)]
        border += [bands*stride+i for i in reversed(range(ribs))]
        border += [r*stride for r in reversed(range(1,bands))]
        for a,b in zip(border,border[1:]+border[:1]):
            quad(a,b,b+offset,a+offset,side>0)
    asset["swimProfile"] = {"cycle":cycle}
    return asset

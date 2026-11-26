"""Bake the harbor school's UVs and eye surfaces into all eight original swim poses."""
import math


def finish(asset):
    # The author assigned one material to the caudal, dorsal, anal and paired fins.
    fin_color = [0.64, 0.525, 0.321]
    rest = asset["frames"][0]
    index, colors, uv, copies = [], [], [], {}
    frames = [[] for _ in asset["frames"]]
    for face, color in enumerate(asset["colors"]):
        fin = color == fin_color
        for old in asset["index"][3*face:3*face+3]:
            key = old, fin
            if key not in copies:
                copies[key] = len(uv)//2
                x, _, z = rest[3*old:3*old+3]
                if fin:
                    # Each fin's rays fan from its own attachment on the body.
                    if x < -.13: base_x, base_z, spread = -.145, -.004, .115
                    elif z > .032: base_x, base_z, spread = (.07 if x > -.003 else -.054), .029, .10
                    elif z < -.032: base_x, base_z, spread = (.072 if x > -.014 else -.055), -.034, .095
                    else: base_x, base_z, spread = .117, .012, .09
                    u = .746 + .244 * min(1, max(0, .5+(base_x-x)/spread*.55))
                    v = .19 + .77 * min(1, abs(z-base_z)/spread + max(0,base_x-x)/spread*.5)
                else:
                    u = .009 + .714*(.24-x)/.48
                    v = .155 + .807*(z+.081)/.162
                uv.extend((round(u,5),round(v,5)))
                for out, src in zip(frames, asset["frames"]):
                    out.extend(src[3*old:3*old+3])
            index.append(copies[key])
        colors.append([1,1,1])
    # Anchor each socket to the same barycentric point on the animated head.
    ex,ez = .183,.019
    rings,segments=8,16
    for side in [-1,1]:
        candidates=[]
        for face in range(len(asset["colors"])):
            ids=asset["index"][3*face:3*face+3]
            a,b,c=[rest[3*i:3*i+3] for i in ids]
            det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
            if abs(det)<1e-10: continue
            wa=((b[2]-c[2])*(ex-c[0])+(c[0]-b[0])*(ez-c[2]))/det
            wb=((c[2]-a[2])*(ex-c[0])+(a[0]-c[0])*(ez-c[2]))/det
            weights=[wa,wb,1-wa-wb]
            if min(weights)>=-1e-6:
                candidates.append((side*sum(w*rest[3*i+1] for w,i in zip(weights,ids)),ids,weights))
        _,ids,weights=max(candidates)
        start=len(uv)//2
        for ring in range(rings+1):
            lat=ring*math.pi/rings
            for sector in range(segments):
                angle=2*math.pi*sector/segments
                dx=math.sin(lat)*math.cos(angle)
                dy=side*math.cos(lat)
                dz=math.sin(lat)*math.sin(angle)
                uv.extend((round(.50+.055*dx,5),round(.072+.061*dz,5)))
                for out,src in zip(frames,asset["frames"]):
                    center=[sum(w*src[3*i+k] for w,i in zip(weights,ids)) for k in range(3)]
                    out.extend(round(q,5) for q in [center[0]+.0069*dx,center[1]+.0032*dy,center[2]+.0069*dz])
        for ring in range(rings):
            for sector in range(segments):
                a=start+ring*segments+sector;b=start+ring*segments+(sector+1)%segments
                c=a+segments;d=b+segments
                for tri in ([(a,b,c)] if ring else [])+([(b,d,c)] if ring<rings-1 else []):
                    index.extend(tri if side==1 else reversed(tri))
                    colors.append([1,1,1])
    return dict(index=index,colors=colors,frames=frames,uv=uv)

"""Bake the reef manta surface, with an optional resample of its eight source swim poses.

python tools/build-manta.py
python tools/build-manta.py --capture /path/to/original/manta.json
"""
from pathlib import Path
from math import cos, sin, sqrt, pi, exp, hypot, dist
from array import array
from base64 import b64encode
import re
import sys
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
RIG = ROOT / "tools/manta-swim.json"
OUTPUT = ROOT / "viewer/assets/subsea/manta.json"
SCALE = 5.5 / 3.70
WHITE = (1., 1., 1.)
SWATCH = (.992, .992)
# Body coordinates in metres before the final uniform size conversion. +X is forwards.
# The UV atlas uses this same fixed registration in all eight poses.
DISC = [(0,1.05,-1.12),(.22,1.035,-.92),(.46,.95,-.74),(.62,.80,-.61),
        (.92,.54,-.48),(1.22,.29,-.43),(1.48,.06,-.44),(1.67,-.14,-.49),
        (1.80,-.34,-.52),(1.85,-.50,-.50)]

def mix(a,b,t):
    return tuple(x+(y-x)*t for x,y in zip(a,b))

def interpolate(stations,x):
    if x <= stations[0][0]:
        return stations[0][1:]
    for a,b in zip(stations,stations[1:]):
        if x <= b[0]:
            return mix(a[1:],b[1:],(x-a[0])/(b[0]-a[0]))
    return stations[-1][1:]

def spline(nodes,x):
    if x<=nodes[0][0]:return nodes[0][1:]
    if x>=nodes[-1][0]:return nodes[-1][1:]
    i=next(i for i in range(len(nodes)-1) if x<=nodes[i+1][0])
    a,b=nodes[i:i+2];h=b[0]-a[0];t=(x-a[0])/h
    def slope(k,j):
        lo=nodes[max(0,k-1)];hi=nodes[min(len(nodes)-1,k+1)]
        return (hi[j]-lo[j])/(hi[0]-lo[0])
    return tuple((2*t**3-3*t*t+1)*a[j]+(t**3-2*t*t+t)*h*slope(i,j)
                 +(-2*t**3+3*t*t)*b[j]+(t**3-t*t)*h*slope(i+1,j) for j in range(1,len(a)))

def wing_bounds(y):
    """Monotone cubic interpolation retains the measured outline at every station."""
    q=abs(y)
    if q >= DISC[-1][0]:
        return DISC[-1][1:]
    k=next(i for i in range(len(DISC)-1) if q<=DISC[i+1][0])
    a,b=DISC[k:k+2];h=b[0]-a[0];t=(q-a[0])/h
    def slope(i,j):
        if i==0:return 0.
        if i==len(DISC)-1:return (DISC[i][j]-DISC[i-1][j])/(DISC[i][0]-DISC[i-1][0])
        l=(DISC[i][j]-DISC[i-1][j])/(DISC[i][0]-DISC[i-1][0])
        r=(DISC[i+1][j]-DISC[i][j])/(DISC[i+1][0]-DISC[i][0])
        return 0 if l*r<=0 else 2*l*r/(l+r)
    return tuple((2*t**3-3*t*t+1)*a[j]+(t**3-2*t*t+t)*h*slope(k,j)
                 +(-2*t**3+3*t*t)*b[j]+(t**3-t*t)*h*slope(k+1,j) for j in (1,2))

def capture(path):
    src=json.loads(path.read_text()); rest=list(zip(*[iter(src["frames"][0])]*3))
    frames=[list(zip(*[iter(f)]*3)) for f in src["frames"]]
    def samples(x,y,z):
        ids=sorted(range(len(rest)),key=lambda i:dist(rest[i],(x,y,z)))[:5]
        weights=[1/(.008+dist(rest[i],(x,y,z)))**3 for i in ids];total=sum(weights)
        return [[round(sum(w*(f[i][c]-rest[i][c]) for i,w in zip(ids,weights))/total,6)
                 for c in range(3)] for f in frames]
    # Recover the original wing and whip deformations, including asymmetry and chord lag.
    grid=[]
    for s in (-1,1):
        for y in (0,.24,.46,.70,.92,1.14,1.35,1.54,1.70):
            points=[p for p in rest if abs(p[1]-s*y)<.07 and (abs(p[1])>.10 or p[0]>-.85)]
            xs=sorted(p[0] for p in points)
            for t in (0,.5,1):
                x=xs[round((1-t)*(len(xs)-1))]
                grid.append(samples(x,s*y,0))
    tail=[samples(x,0,0) for x in (-3.21,-2.55,-1.85,-1.12)]
    RIG.write_text(json.dumps(dict(cycle=src["cycle"],grid=grid,tail=tail),separators=(',',':'))+'\n')

def deformation(rig,p,phase):
    x,y,z=p
    if x < -1.12:
        return interpolate([(x0,*v[phase]) for x0,v in zip((-3.21,-2.55,-1.85,-1.12),rig['tail'])],x)
    t=abs(y)/1.85
    front,rear=wing_bounds(y); chord=max(0,min(1,(front-x)/max(.001,front-rear)))
    row=0 if y<0 else 27
    def station(k):
        triple=rig['grid'][row+3*k:row+3*k+3]; a=int(chord>=.5)
        return mix(triple[a][phase],triple[a+1][phase],2*chord-a)
    stations=[0,.24,.46,.70,.92,1.14,1.35,1.54,1.70]
    delta=interpolate([(v,*station(k)) for k,v in enumerate(stations)],1.70*t)
    return tuple(v*1.85/1.70 for v in delta)

def atlas(p,top):
    x,y,_=p; t=max(.035,min(.975,.1+.8*(1.05-x)/2.17))
    return (.5+.46*y/1.85,(1 if top else .5)-.5*t)

def unit(p):
    return tuple(x/(sqrt(sum(v*v for v in p)) or 1) for x in p)

def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

class Skin:
    def __init__(self):
        self.p=[];self.uv=[];self.indices=[];self.colors=[];self.cache={}
    def vert(self,p,uv):
        p=tuple(round(x,7) for x in p); uv=tuple(round(x,6) for x in uv)
        if (p,uv) not in self.cache:
            self.cache[p,uv]=len(self.p);self.p.append(p);self.uv.append(uv)
        return self.cache[p,uv]
    def face(self,a,b,c,color=WHITE):
        if len({self.p[a],self.p[b],self.p[c]})<3:return
        self.indices.extend([a,b,c]);self.colors.append(color)
    def quad(self,a,b,c,d,color=WHITE):
        self.face(a,b,c,color);self.face(a,c,d,color)
    def tube(self,rows,rgb,uv=None,sides=9):
        """rows are (position, first radius vector, second radius vector)."""
        loops=[]
        for p,a,b in rows:
            loop=[]
            for i in range(sides):
                angle=i*2*pi/sides
                v=tuple(p[j]+a[j]*cos(angle)+b[j]*sin(angle) for j in range(3))
                loop.append(self.vert(v,uv(v,angle) if uv else SWATCH))
            loops.append(loop)
        for k in range(len(loops)-1):
            for i in range(sides):
                j=(i+1)%sides
                self.quad(loops[k][i],loops[k][j],loops[k+1][j],loops[k+1][i],rgb)
        for i in range(1,sides-1):
            self.face(loops[0][0],loops[0][i+1],loops[0][i],rgb)
            self.face(loops[-1][0],loops[-1][i],loops[-1][i+1],rgb)

def surface(m):
    positive=[0,.12,.25,.385,.45,.50,.54,.62,.77,.92,1.08,1.26,1.43,1.58,1.70,1.80,1.835,1.85]
    spans=[-s for s in positive[:0:-1]]+positive; mouth=[[],[]]
    for top in (True,False):
        grid=[]
        for y in spans:
            s=abs(y)/1.85; front,rear=wing_bounds(y);row=[]
            opening=sqrt(max(0,1-(abs(y)/.5)**2))
            for j in range(15):
                a=j*pi/14; t=.5-.5*cos(a)
                x=front+(rear-front)*t - (0 if top else .07*opening*(1-t)**4)
                arch=.032*(1-s)-.030*s+.195*s**4
                saddle=.045*(1-s*s)*sin(pi*t)-.013*t
                shape=sin(a)**.95*(.69+.31*(1-t))
                thickness=(.174 if top else .179)*(1-s)**.57
                thickness+=.065*exp(-((abs(y)-.38)/.33)**2)*(1-s)
                # A finite frontal gap between roof and jaw extends across the head only.
                z=arch+saddle+(1 if top else -1)*(shape*thickness+opening*(.168 if top else .161)*exp(-10*t))
                if s>.999:z=.165
                p=(x,y,z);row.append(m.vert(p,atlas(p,top)))
            if abs(y)<=.50:mouth[0 if top else 1].append(row[0])
            grid.append(row)
        for i in range(len(grid)-1):
            for j in range(14):
                a,b=grid[i],grid[i+1]
                if top:m.quad(a[j],b[j],b[j+1],a[j+1])
                else:m.quad(a[j],a[j+1],b[j+1],b[j])
    return mouth

def throat(m,mouth):
    # Both corners are common to the two lip arcs. Build a real blind cavity,
    # joined all the way around, with a dark back and soft branchial ridges.
    ring=mouth[0]+mouth[1][-2:0:-1]
    outer=[m.p[i] for i in ring];previous=[m.vert(p,SWATCH) for p in outer]
    for depth,height,width,color in [(.019,.98,.985,(.18,.20,.215)),(.084,.84,.93,(.083,.108,.121)),
        (.21,.67,.80,(.023,.034,.040)),(.36,.51,.63,(.012,.020,.023)),(.43,.44,.53,(.008,.012,.015))]:
        rr=[m.vert((p[0]-depth,p[1]*width,.028+(p[2]-.028)*height),SWATCH) for p in outer]
        for i in range(len(rr)):
            j=(i+1)%len(rr);m.quad(previous[i],rr[i],rr[j],previous[j],color)
        previous=rr
    centre=m.vert((.57,0,.028),SWATCH)
    for i in range(len(previous)):m.face(centre,previous[(i+1)%len(previous)],previous[i],(.008,.013,.015))
    for side in (-1,1):
        for k in range(5):
            rows=[]
            for h in range(6):
                t=h/5; y=side*(.014+.043*k+(.082+.018*k)*t)
                p=(.724-.071*t+.018*sin(pi*t),y,-.046+.130*t-.014*sin(pi*t))
                v=unit((-.071,side*(.082+.018*k),.13))
                rows.append((p,(.005,0,0),tuple(q*.006 for q in unit(cross(v,(1,0,0))))))
            m.tube(rows,(.040,.057,.063),sides=4)

def lobe(m,side):
    # An unfurling flap has a broad chord and crisp, rolled free edge. It is
    # not an extruded cylinder. Its ventral surface turns inwards at the tip.
    nodes=[(.0,.735,.432,.063,.122,.050),(.16,.93,.482,.049,.153,.051),
           (.31,1.055,.523,-.042,.160,.040),(.50,1.14,.499,-.140,.126,.033),
           (.67,1.195,.442,-.221,.092,.024),(.85,1.206,.337,-.266,.060,.015),
           (1,1.177,.242,-.25,.010,.006)]
    rings=[]
    nsides=16
    for j in range(20):
        t=j/19;x,y,z,w,th=spline(nodes,t)
        ta=spline(nodes,max(0,t-.002));tb=spline(nodes,min(1,t+.002))
        v=unit(tuple((tb[i]-ta[i])*(side if i==1 else 1) for i in range(3)))
        aa=unit(tuple(float(i==0)-v[0]*v[i] for i in range(3)));bb=unit(cross(v,aa))
        ring=[]
        for k in range(nsides):
            a=2*pi*k/nsides; u=cos(a)
            relief=sin(a)*th+.23*w*u*u*side
            pt=tuple(c+w*u*A+relief*B for c,A,B in zip((x,side*y,z),aa,bb))
            ring.append((pt,(.90-.20*t,side*(.39+.11*u),0)))
        rings.append(ring)
    for i in range(len(rings)-1):
        for k in range(nsides):
            j=(k+1)%nsides
            top=sin((k+.5)*2*pi/nsides)*side>0
            # Both endpoints of a seam face must stay in the same atlas half.
            edge=[rings[i][k],rings[i][j],rings[i+1][j],rings[i+1][k]]
            m.quad(*(m.vert(pt,atlas(src,top)) for pt,src in edge))
    final=[m.vert(pt,atlas(src,False)) for pt,src in rings[-1]]
    for i in range(1,nsides-1):m.face(final[0],final[i],final[i+1])

def extras(m):
    for side in (-1,1):
        lobe(m,side)
        # The dark eye sits on a lateral bump, separate from the roof of the mouth.
        rows=[]
        for j in range(9):
            t=j*pi/8; r=sin(t)
            rows.append(((.790,side*(.465+.078*(1-cos(t))),.065),(.074*r,0,0),(0,0,-side*.056*r)))
        m.tube(rows,WHITE,lambda p,a:atlas(p,True),sides=10)
        rows=[]
        for j in range(7):
            t=j*pi/6;r=sin(t)
            rows.append(((.811,side*(.599+.015*(1-cos(t))),.068),(.032*r,0,0),(0,0,-side*.024*r)))
        m.tube(rows,(.009,.017,.021),sides=10)
    rows=[]
    for i in range(29):
        t=i/28;x=-.78-2.15*t
        r=(.062*((1-t)**1.25)+.003)*(.80+.2*exp(-12*t))
        rows.append(((x,.027*sin(pi*t),.054+.082*sin(t*pi)-.06*t),(0,r,0),(0,0,-r*.74)))
    m.tube(rows,(.095,.118,.127),sides=9)
    # Low dorsal fin immediately ahead of the whip, with a swept, tapered tip.
    rows=[]
    for j in range(10):
        t=j/9; w=(1-t)**1.24
        rows.append(((-.80-.20*t,0,.062+.226*t),(.185*w+.002,0,0),(0,.040*w+.001,0)))
    m.tube(rows,(.105,.126,.14),sides=10)

def build(rig):
    m=Skin();mouth=surface(m);throat(m,mouth);extras(m)
    # Pack the eight absolute swim poses in quarter-millimetre units for phones.
    # Keep every fin in one indexed draw, including the throat and eyes.
    def pack(kind,values):
        items=array(kind,values)
        if sys.byteorder!='little':items.byteswap()
        return b64encode(items.tobytes()).decode('ascii')
    colors=[[0,0,0,0] for _ in m.p]
    for k,idx in enumerate(m.indices):
        for c,value in enumerate(m.colors[k//3]):colors[idx][c]+=value
        colors[idx][3]+=1
    poses=[]
    for phase in range(8):
        pos=[]
        for p in m.p:
            delta=deformation(rig,p,phase)
            pos.extend(round(SCALE*(v+d)*4000) for v,d in zip(p,delta))
        poses.append(pack('h',pos))
    contact=(ROOT/'viewer/board/MantaContact.mo').read_text()
    rows=re.search(r'constant Real rest\[10,7\]\s*=\s*\[([^\]]+)\]',contact).group(1)
    capsules=[[float(v) for v in row.split(',')] for row in rows.split(';')]
    return dict(cycle=rig['cycle'],contactCapsules=capsules,positionUnit=.00025,poses=poses,
                triangles=pack('H',m.indices),
                texcoords=pack('H',(round(x*65535) for uv in m.uv for x in uv)),
                colors=pack('B',(round(255*v/max(1,row[3])) for row in colors for v in row[:3])))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture',type=Path,help='recapture the source wing and tail trajectories')
    args=parser.parse_args()
    if args.capture:capture(args.capture)
    OUTPUT.write_text(json.dumps(build(json.loads(RIG.read_text())),separators=(',',':'))+'\n')

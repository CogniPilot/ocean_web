"""Build the school-fish atlas from the silver-scale and fin-membrane ImageGen swatches."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("scales",type=Path)
parser.add_argument("fins",type=Path)
parser.add_argument("--output",type=Path,default=Path(__file__).resolve().parents[1]/"viewer/assets/subsea")
args=parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
size=(1024,512)
xx,yy=np.meshgrid((np.arange(size[0])+.5)/size[0],1-(np.arange(size[1])+.5)/size[1])


def relief(path,w,h):
    with Image.open(path) as src:
        tile=np.asarray(ImageOps.grayscale(src).resize((w,h),Image.Resampling.LANCZOS),dtype=float)
    lo,hi=np.percentile(tile,[2,98])
    return np.clip((tile-(hi+lo)/2)/max(1,(hi-lo)/2),-1.3,1.3)


def stripe(x,width):
    return np.exp(-(x/width)**2)


def smooth(x):
    t=np.clip(x,0,1)
    return t*t*(3-2*t)


def write(name,array,quality):
    image=Image.fromarray(np.clip(array,0,255).round().astype('uint8'))
    image.save(args.output/name,quality=quality,method=6)


# Body uses head-to-tail coordinates. Countershading, gill cover and the
# lateral line follow the actual side projection of the school fish.
u=(xx-.009)/.714
z=(yy-.155)/.807*.162-.081
x=.24-.48*u
centre=np.interp(x,[-.24,-.13,-.06,.02,.10,.17,.24],[-.003,0,.008,0,-.003,-.006,0])
radius=np.interp(x,[-.24,-.15,-.09,0,.07,.12,.185,.24],[.009,.012,.024,.047,.061,.055,.042,.008])
height=(z-centre)/radius
back=smooth((height+.30)/1.36)
silver=smooth((height+.89)/.67)*(1-back)
belly=np.array([210,214,202]);mid=np.array([164,182,179]);dorsal=np.array([68,87,88])
base=belly[None,None,:]*(1-silver-back)[...,None]+mid*silver[...,None]+dorsal*back[...,None]
# Scale size is independent of body pigmentation and all eight swim poses.
tile=relief(args.scales,212,138)
reps=np.tile(np.block([[tile,tile[:,::-1]],[tile[::-1],tile[::-1,::-1]]]),(2,3))
grain=reps[:size[1],:size[0]]
scales=smooth((u-.17)/.12)*smooth((.96-u)/.09)
detail=scales*grain
operculum=.245-.11*((height+.04)/1.14)**2
gill=stripe(u-operculum,.0022)*smooth((height+1.07)/.17)*smooth((.94-height)/.20)
gillLight=stripe(u-operculum+.006,.0032)
lineHeight=.10+.19*np.exp(-((u-.30)/.18)**2)
lateral=stripe(height-lineHeight,.024)*smooth((u-.24)/.05)*smooth((.94-u)/.13)
mouth=stripe(z-(-.006-.012*np.sin(np.pi*np.clip(u/.20,0,1))),.00065)*smooth((.19-u)/.08)
base+=(8*detail-27*gill+3*gillLight-9*lateral-20*mouth)[...,None]
heightmap=125+37*detail-22*gill-17*lateral
rough=125+27*back+23*detail-13*silver

# Keep the fin membrane opaque for instancing and underwater depth passes.
mask=xx>.734
fin=relief(args.fins,272,512)
fin=fin[:,np.clip(((xx[0]-.734)*size[0]).astype(int),0,271)]
for c,value in enumerate([116,136,137]):base[:,:,c][mask]=value+17*fin[mask]+8*(1-yy[mask])
heightmap[mask]=126+33*fin[mask];rough[mask]=144+14*fin[mask]

# Both eyes occupy a separate atlas cell and use raised elliptical lens geometry.
ex=(xx-.50)/.055;ez=(yy-.072)/.061
r=np.hypot(ex,ez)
eyeMask=yy<.142
iris=smooth((r-.44)/.11)*(1-smooth((r-.89)/.11))
limbus=smooth((r-.92)/.09)
angle=np.arctan2(ez,ex);fibers=2.6*np.sin(39*angle+2*np.sin(8*angle))+1.8*np.cos(23*angle)
for c,(pupil,ir,edge) in enumerate([(13,132,54),(17,121,61),(17,89,59)]):
    eye=pupil+(ir+fibers-pupil)*iris+(edge-pupil)*limbus
    base[:,:,c][eyeMask]=eye[eyeMask]
heightmap[eyeMask]=128;rough[eyeMask]=55+19*np.clip(r[eyeMask],0,1)
write("school-flank-albedo.webp",base,90)
write("school-flank-surface.webp",np.stack([heightmap,rough,np.full_like(rough,128)],axis=-1),91)


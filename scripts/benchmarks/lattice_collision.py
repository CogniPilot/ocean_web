"""Build a GPU domain around the Rumoca-generated D3Q19 collision operator."""

import re
from pathlib import Path

import pyopencl as cl


def build_lattice(ctx, fmu, domain):
    # This FMU has one checked algebraic assignment issuing the collision call.
    # Reuse its generated arithmetic and bounds checks. The device supplies the
    # C integer and private-memory operations used by the generated pure functions.
    source = Path(fmu) / "sources"
    calls = set(
        re.findall(
            r"int status=(rumoca_scalar_pure_\d+)\(",
            (source / "rmc_assign.c").read_text(),
        )
    )
    if len(calls) != 1:
        raise ValueError("Expected one Rumoca collision function")
    c = (source / "rmc_functions.c").read_text()
    c = c[
        c.index("static int rumoca_pure_") : c.index(
            "static int rumoca_pure_directional_"
        )
    ]
    preamble = """
#pragma OPENCL EXTENSION cl_khr_fp64 : enable
#pragma OPENCL FP_CONTRACT OFF
    typedef ulong uint64_t;
    typedef long int64_t;
    typedef int RmcAssertionObserver;
#define UINT64_C(v) v##UL
#define INT64_C(v) v##L
#define INT64_MIN LONG_MIN
#define INT64_MAX LONG_MAX
#define RMC_API static inline
#define rumoca_real64(v) as_double((ulong)(v))
#define memcpy(d,s,n) __builtin_memcpy((d),(s),(n))
#define memset(d,v,n) __builtin_memset((d),(v),(n))
    static inline void memmove_private(void *d, const void *s, size_t n){
        uchar *a=(uchar*)d; const uchar *b=(const uchar*)s;
        if(a==b)return;
        if((size_t)a<(size_t)b)for(size_t i=0;i<n;i++)a[i]=b[i];
        else for(size_t i=n;i--;)a[i]=b[i];
    }
#define memmove memmove_private
    """

    return cl.Program(
        ctx,
        preamble
        + c.replace("(void)rumoca_real64;", "")
        + domain.replace("COLLISION", calls.pop()),
    ).build(options=["-cl-std=CL1.2"])

FROM opencfd/openfoam-default@sha256:1ba02114b1c025c370f2e269a07677c16c9bea8d990fcd75ac8378aff9d41b50
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libviennacl-dev ocl-icd-opencl-dev && rm -rf /var/lib/apt/lists/*
COPY OpenCLSolver.C /tmp/OpenCLSolver.C
RUN bash -c 'source /usr/lib/openfoam/openfoam2412/etc/bashrc && g++ -std=c++17 -O2 -shared -fPIC -DWM_DP -DWM_LABEL_SIZE=32 -DNoRepository -I"$WM_PROJECT_DIR/src/OpenFOAM/lnInclude" -I"$WM_PROJECT_DIR/src/OSspecific/POSIX/lnInclude" /tmp/OpenCLSolver.C -L"$FOAM_LIBBIN" -lOpenFOAM -lOpenCL -o "$FOAM_LIBBIN/libonrtOpenCL.so"'
RUN mkdir -p /etc/OpenCL/vendors && echo libnvidia-opencl.so.1 >/etc/OpenCL/vendors/nvidia.icd

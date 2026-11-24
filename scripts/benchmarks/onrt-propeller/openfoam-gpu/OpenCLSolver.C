// OpenFOAM v2412 serial moving-mesh case. OpenFOAM assembles the equations;
// ViennaCL solves the asymmetric velocity and turbulence systems on the GPU.
#include "lduMatrix.H"
#include "Pstream.H"
#include "sigFpe.H"
#define VIENNACL_WITH_OPENCL
#include <viennacl/compressed_matrix.hpp>
#include <viennacl/linalg/bicgstab.hpp>
#include <viennacl/linalg/jacobi_precond.hpp>
#include <viennacl/ocl/backend.hpp>
#include <numeric>
#include <vector>

namespace Foam {
class OpenCLSolver : public lduMatrix::solver {
public:
    TypeName("OpenCL");
    using lduMatrix::solver::solver;
    solverPerformance solve(scalarField& psi, const scalarField& source, const direction cmpt) const override;
};
defineTypeNameAndDebug(OpenCLSolver,0);
lduMatrix::solver::addasymMatrixConstructorToTable<OpenCLSolver> registerAsymOpenCL;

solverPerformance OpenCLSolver::solve(scalarField& psi, const scalarField& source, const direction cmpt) const {
    if (Pstream::parRun()) FatalErrorInFunction << "Use one process per case" << exit(FatalError);
    forAll(interfaces_,i) if (interfaces_.set(i))
        FatalErrorInFunction << "Coupled patch coefficients require a distributed matrix" << exit(FatalError);
    // NVIDIA JIT compilation uses masked host floating-point exceptions.
    Foam::sigFpe::ignore deviceFpeScope;
    static const bool gpu = [](){
        viennacl::ocl::set_context_device_type(0,CL_DEVICE_TYPE_GPU);
        auto device=viennacl::ocl::current_device();
        if (!(device.type() & CL_DEVICE_TYPE_GPU) || !device.double_support())
            FatalErrorInFunction << "Double precision OpenCL GPU required" << exit(FatalError);
        Info << "OpenFOAM linear systems on OpenCL GPU " << device.name().c_str() << endl;
        return true;
    }();
    (void)gpu;
    const label n=psi.size();
    scalarField product(n),scratch(n);
    matrix_.Amul(product,psi,interfaceBouCoeffs_,interfaces_,cmpt);
    const scalar norm=this->normFactor(psi,source,product,scratch);
    scalarField residual(source-product);
    solverPerformance perf(typeName,fieldName_);
    perf.initialResidual()=perf.finalResidual()=gSumMag(residual)/norm;
    matrix_.setResidualField(residual,fieldName_,true);
    if (perf.checkConvergence(tolerance_,relTol_,log_)) return perf;

    // Refresh numerical coefficients on every solve, including mesh motion.
    const auto& owner=matrix_.lduAddr().lowerAddr();
    const auto& neighbour=matrix_.lduAddr().upperAddr();
    const auto& upper=matrix_.upper(); const auto& lower=matrix_.lower();
    std::vector<unsigned> rows(n+1,1); rows[0]=0;
    forAll(owner,f){++rows[owner[f]+1];++rows[neighbour[f]+1];}
    std::partial_sum(rows.begin(),rows.end(),rows.begin());
    auto pos=rows;
    std::vector<unsigned> cols(rows.back());
    std::vector<double> values(cols.size());
    auto add=[&](label r,label c,scalar a){auto index=pos[r]++;cols[index]=c;values[index]=a;};
    // With OpenFOAM's upper-triangular face ordering these three passes also
    // give each CSR row ascending column indices.
    forAll(owner,f)add(neighbour[f],owner[f],lower[f]);
    forAll(psi,i)add(i,i,matrix_.diag()[i]);
    forAll(owner,f)add(owner[f],neighbour[f],upper[f]);
    using Matrix=viennacl::compressed_matrix<double>;
    Matrix A;A.set(rows.data(),cols.data(),values.data(),n,n,cols.size());
    viennacl::linalg::jacobi_precond<Matrix> M(A,{});
    viennacl::vector<double> rhs(n),delta(n);
    do{
        viennacl::fast_copy(residual.begin(),residual.end(),rhs.begin());
        const double target=std::min(.3,.3*std::max(tolerance_,relTol_*perf.initialResidual())/perf.finalResidual());
        const unsigned remaining=maxIter_-perf.nIterations();
        viennacl::linalg::bicgstab_tag tag(target,remaining);
        tag.iters(0);
        delta=viennacl::linalg::solve(A,rhs,tag,M);
        perf.nIterations()+=std::max(1u,(unsigned)tag.iters());
        viennacl::fast_copy(delta.begin(),delta.end(),scratch.begin());
        psi+=scratch;
        matrix_.Amul(product,psi,interfaceBouCoeffs_,interfaces_,cmpt);
        residual=source-product;
        perf.finalResidual()=gSumMag(residual)/norm;
        if(!std::isfinite(perf.finalResidual())) FatalErrorInFunction << "Nonfinite GPU linear residual" << exit(FatalError);
    }while(perf.nIterations()<maxIter_ && !perf.checkConvergence(tolerance_,relTol_,log_));
    matrix_.setResidualField(residual,fieldName_,false);
    return perf;
}
}

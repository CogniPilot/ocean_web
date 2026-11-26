model CholeskyCopy "Standalone array-update reproduction, without a diver or MuJoCo"
  function solveSPD "Solve A x = b for a symmetric positive definite A (Cholesky); explicit for the compiler"
    input Real A[:, size(A, 1)];
    input Real b[size(A, 1)];
    output Real x[size(A, 1)];
  protected
    Integer n = size(A, 1);
    Real L[size(A, 1), size(A, 1)];
    Real s;
  algorithm
    L := zeros(n, n);
    for j in 1:n loop
      s := A[j, j];
      for k in 1:j - 1 loop
        s := s - L[j, k] ^ 2;
      end for;
      L[j, j] := sqrt(s);
      for i in j + 1:n loop
        s := A[i, j];
        for k in 1:j - 1 loop
          s := s - L[i, k] * L[j, k];
        end for;
        L[i, j] := s / L[j, j];
      end for;
    end for;
    x := b;
    for i in 1:n loop
      for k in 1:i - 1 loop
        x[i] := x[i] - L[i, k] * x[k];
      end for;
      x[i] := x[i] / L[i, i];
    end for;
    for i in n:-1:1 loop
      for k in i + 1:n loop
        x[i] := x[i] - L[k, i] * x[k];
      end for;
      x[i] := x[i] / L[i, i];
    end for;
  end solveSPD;
  Real phase(start=.1);
  Real solution[20];
equation
  solution = solveSPD((1+phase^2)*identity(20),ones(20));
  der(phase) = .01*solution[1];
end CholeskyCopy;

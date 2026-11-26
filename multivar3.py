"""Three-variable (x, y, z) optimization extension for Optimization Analyzer.

Supports bounded, unconstrained stationary-point searches, Hessian classification,
3D slice surfaces, and 4D scalar-field slices (w=f(x,y,z)).
"""
from __future__ import annotations

import itertools
import math
import time

import numpy as np
import sympy as sp
from scipy.optimize import root
from sympy.parsing.sympy_parser import (
    parse_expr, standard_transformations, convert_xor,
    implicit_multiplication_application,
)

_X, _Y, _Z = sp.symbols("x y z", real=True)
_SYMBOLS = {"x": _X, "y": _Y, "z": _Z}
_FUNCS = {
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "exp": sp.exp, "ln": sp.log, "log": sp.log,
    "sqrt": sp.sqrt, "abs": sp.Abs, "Abs": sp.Abs,
    "pi": sp.pi, "e": sp.E,
}
_TRANSFORMS = standard_transformations + (convert_xor, implicit_multiplication_application)


class MultiVar3Error(ValueError):
    pass


def _parse_function(source: str):
    source = str(source or "").strip()
    if not source:
        raise MultiVar3Error("Enter a function of x, y and z, for example x^2 + y^2 + z^2.")
    if len(source) > 300:
        raise MultiVar3Error("Function is too long (maximum 300 characters).")
    try:
        expr = parse_expr(
            source,
            local_dict={**_SYMBOLS, **_FUNCS},
            global_dict={"Symbol": sp.Symbol, "Integer": sp.Integer,
                         "Float": sp.Float, "Rational": sp.Rational,
                         "Add": sp.Add, "Mul": sp.Mul, "Pow": sp.Pow,
                         "__builtins__": {}},
            transformations=_TRANSFORMS,
            evaluate=True,
        )
    except Exception as exc:
        raise MultiVar3Error(f"Could not parse the function: {exc}") from exc
    unknown = sorted(str(s) for s in expr.free_symbols if s not in {_X, _Y, _Z})
    if unknown:
        raise MultiVar3Error("Unknown variable(s): " + ", ".join(unknown) + ". Use only x, y and z.")
    if not expr.free_symbols:
        raise MultiVar3Error("The function must depend on at least one of x, y or z.")
    if not expr.is_real:
        # Symbolic assumptions can be undecidable; numerical checks below remain authoritative.
        pass
    return expr


def _safe_float(v, name):
    try:
        out = float(v)
    except (TypeError, ValueError):
        raise MultiVar3Error(f"{name} must be a finite number.")
    if not math.isfinite(out):
        raise MultiVar3Error(f"{name} must be finite.")
    return out


def _classify(hessian, point):
    try:
        vals = np.linalg.eigvalsh(np.asarray(hessian, dtype=float))
    except Exception:
        return "degenerate / unclassified", []
    tol = 1e-7 * max(1.0, float(np.max(np.abs(vals))))
    pos, neg = np.all(vals > tol), np.all(vals < -tol)
    if pos:
        label = "local minimum"
    elif neg:
        label = "local maximum"
    elif np.any(vals > tol) and np.any(vals < -tol):
        label = "saddle point"
    else:
        label = "degenerate / unclassified"
    return label, [float(v) for v in vals]


def analyze3(function, lo=-3, hi=3, grid_size=23):
    """Analyze f(x,y,z) on a cubic search window [lo,hi]^3.

    Stationary points are numerical candidates found from deterministic multi-start
    root solving. Their Hessian classifications are local, not global guarantees.
    """
    started = time.perf_counter()
    expr = _parse_function(function)
    lo, hi = _safe_float(lo, "Lower bound"), _safe_float(hi, "Upper bound")
    if lo >= hi:
        raise MultiVar3Error("Lower bound must be smaller than upper bound.")
    if hi - lo > 200:
        raise MultiVar3Error("Search window is too wide; use a range no larger than 200.")

    vars_ = (_X, _Y, _Z)
    grad_expr = [sp.diff(expr, v) for v in vars_]
    hess_expr = sp.hessian(expr, vars_)
    try:
        f_num = sp.lambdify(vars_, expr, modules="numpy")
        g_num = sp.lambdify(vars_, grad_expr, modules="numpy")
        h_num = sp.lambdify(vars_, hess_expr, modules="numpy")
    except Exception as exc:
        raise MultiVar3Error(f"Could not compile this function for numerical analysis: {exc}") from exc

    def fval(p):
        try:
            v = float(np.asarray(f_num(*p)))
            return v if math.isfinite(v) else np.nan
        except Exception:
            return np.nan

    def grad(p):
        try:
            a = np.asarray(g_num(*p), dtype=float).reshape(3)
            return a if np.all(np.isfinite(a)) else np.full(3, 1e100)
        except Exception:
            return np.full(3, 1e100)

    # Deterministic 5x5x5 multistart; discard roots outside the requested cube.
    seeds = np.linspace(lo, hi, 5)
    points, seen = [], []
    for seed in itertools.product(seeds, repeat=3):
        try:
            sol = root(grad, np.asarray(seed, dtype=float), method="hybr")
            p = np.asarray(sol.x, dtype=float)
            if not np.all(np.isfinite(p)) or np.linalg.norm(grad(p)) > 2e-5:
                continue
            if np.any(p < lo - 1e-6) or np.any(p > hi + 1e-6):
                continue
            if any(np.linalg.norm(p - q) < 2e-4 for q in seen):
                continue
            value = fval(p)
            if not math.isfinite(value):
                continue
            H = np.asarray(h_num(*p), dtype=float).reshape(3, 3)
            kind, eig = _classify(H, p)
            seen.append(p)
            points.append({
                "coordinates": [float(v) for v in p],
                "x": float(p[0]), "y": float(p[1]), "z": float(p[2]),
                "value": value, "type": kind,
                "gradient_norm": float(np.linalg.norm(grad(p))),
                "hessian": H.tolist(), "eigenvalues": eig,
            })
        except Exception:
            continue
    points.sort(key=lambda q: (q["x"], q["y"], q["z"]))

    # 3D surface slice and 4D scalar-field slice at z = selected z value.
    n = int(max(15, min(41, grid_size)))
    axis = np.linspace(lo, hi, n)
    mid = (lo + hi) / 2.0
    surface = []
    for yy in axis:
        row = []
        for xx in axis:
            v = fval((xx, yy, mid))
            row.append(float(v) if math.isfinite(v) and abs(v) < 1e100 else None)
        surface.append(row)

    # Additional z slices power the 4D explorer; only 9 slices to keep payload light.
    z_slices = np.linspace(lo, hi, 9)
    volume_slices = []
    for zv in z_slices:
        rows = []
        for yy in axis[::2]:
            rows.append([float(fval((xx, yy, zv))) if math.isfinite(fval((xx, yy, zv))) else None for xx in axis[::2]])
        volume_slices.append({"z": float(zv), "values": rows})

    center = [mid, mid, mid]
    grad_center = [float(v) for v in grad(center)]
    h_center = np.asarray(h_num(*center), dtype=float).reshape(3, 3).tolist()
    return {
        "dimension": 3,
        "function": str(expr),
        "variables": ["x", "y", "z"],
        "lo": lo, "hi": hi,
        "window": {"x": [lo, hi], "y": [lo, hi], "z": [lo, hi]},
        "points": points,
        "point_count": len(points),
        "gradient_at_center": grad_center,
        "hessian_at_center": h_center,
        "surface3d": {"x": axis.tolist(), "y": axis.tolist(), "z": surface, "fixed_z": mid},
        "field4d": {"x": axis[::2].tolist(), "y": axis[::2].tolist(), "slices": volume_slices},
        "notes": [
            "Critical points are numerical candidates found by multi-start root solving.",
            "Hessian labels are local classifications; they do not prove global extrema.",
            "The 4D view represents w=f(x,y,z) using 3D surfaces at selected fixed-z slices and a color scale for w.",
            "This first release searches an unconstrained cubic window; 3-variable constraints are not included yet.",
        ],
        "seconds": round(time.perf_counter() - started, 4),
        "status": "computed",
    }

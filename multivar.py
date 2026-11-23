"""Two-variable optimisation. Unconstrained: gradient = 0 and the Hessian test.
Constrained g(x, y) = 0: Lagrange multipliers (grad f = lam * grad g). SymPy solves exactly,
SciPy re-checks with multi-start root finding and SLSQP."""
import re, math, time
import numpy as np
import sympy as sp
from scipy.optimize import fsolve, minimize
from scipy.ndimage import minimum_filter
from sympy.parsing.sympy_parser import parse_expr
from backend import AnalysisError, FUNCS, CONSTS, TRANSFORMS, _GLOBALS, _run, _num, _pretty

X, Y, L = sp.symbols("x y lam", real=True)
OK = set(FUNCS) | set(CONSTS) | {"x", "y"}


def parse2(text, what, eq=False):
    text = (text or "").strip()
    if not text:
        raise AnalysisError("Please type the %s." % what)
    if len(text) > 200:
        raise AnalysisError("The %s is too long (maximum 200 characters)." % what)
    if not re.fullmatch(r"[0-9A-Za-z_+\-*/^().,\s%s]*" % ("=" if eq else ""), text) or text.count("=") > 1:
        raise AnalysisError("The %s contains characters that are not allowed." % what)
    if "=" in text:
        a, b = text.split("=", 1)
        text = "(%s)-(%s)" % (a, b)
    for n in re.findall(r"[A-Za-z_][A-Za-z_0-9]*", text):
        if n not in OK:
            raise AnalysisError("Unknown name '%s'. Use only x, y, numbers and functions such as "
                                "sin, cos, exp, ln, sqrt, abs, pi, e." % n)
    loc = {"x": X, "y": Y, **FUNCS, **CONSTS}
    try:
        e = parse_expr(text, local_dict=loc, global_dict=dict(_GLOBALS), transformations=TRANSFORMS)
    except Exception:
        raise AnalysisError("Could not understand the %s. Check brackets and operators." % what)
    if not isinstance(e, sp.Basic) or not e.free_symbols <= {X, Y}:
        raise AnalysisError("The %s may only use the variables x and y." % what)
    return e.xreplace({fl: sp.Rational(str(fl)) for fl in e.atoms(sp.Float)})


def _fn(expr, vs):
    f = sp.lambdify(vs, expr, "numpy")

    def call(*a):
        with np.errstate(all="ignore"):
            try:
                return np.broadcast_to(np.asarray(f(*a), dtype=float), np.shape(a[0])).copy()
            except Exception:
                return np.full(np.shape(a[0]), np.nan)
    return call


def analyze2(ftext, gtext, lo, hi):
    t0 = time.time()
    f = parse2(ftext, "function f(x, y)")
    g = parse2(gtext, "constraint", True) if (gtext or "").strip() else None
    try:
        lo, hi = float(lo), float(hi)
    except (TypeError, ValueError):
        raise AnalysisError("The window limits must be numbers.")
    if not (math.isfinite(lo) and math.isfinite(hi) and lo < hi and hi - lo <= 1e4):
        raise AnalysisError("Choose a window where the lower limit is smaller than the upper limit (at most 10000 wide).")
    fx, fy = sp.diff(f, X), sp.diff(f, Y)
    Hm = sp.hessian(f, (X, Y))
    Hf = sp.lambdify((X, Y), Hm, "numpy")
    F = _fn(f, (X, Y))
    if g is None:
        eqs, vs = [fx, fy], [X, Y]
    else:
        eqs, vs = [fx - L * sp.diff(g, X), fy - L * sp.diff(g, Y), g], [X, Y, L]
    E = sp.lambdify(vs, eqs, "numpy")
    Ef = lambda t: np.array(E(*t), dtype=float)
    inbox = lambda a, b: lo - 1e-9 <= a <= hi + 1e-9 and lo - 1e-9 <= b <= hi + 1e-9
    pts, notes, info = [], [], []

    def add(a, b, lam, src, lab):
        if inbox(a, b) and not any(abs(a - p["x"]) < 1e-6 and abs(b - p["y"]) < 1e-6 for p in pts):
            pts.append({"x": a, "y": b, "lam": lam, "source": src, "exact": lab, "matched": False})

    Q = sp.lambdify((X, Y), [fx, fy] + ([sp.diff(g, X), sp.diff(g, Y), g] if g is not None else []), "numpy")

    def starts():
        """Cheap vectorised screen: start the root finder only where the equations are nearly satisfied."""
        ax = np.linspace(lo, hi, 41)
        GX, GY = np.meshgrid(ax, ax)
        with np.errstate(all="ignore"):
            q = [np.broadcast_to(np.asarray(a, float), GX.shape) for a in Q(GX, GY)]
            if g is None:
                res, lam = np.hypot(q[0], q[1]), np.zeros(GX.shape)
            else:
                lam = (q[0] * q[2] + q[1] * q[3]) / (q[2] ** 2 + q[3] ** 2 + 1e-12)
                res = np.hypot(q[0] - lam * q[2], q[1] - lam * q[3]) + np.abs(q[4])
            res = res / (1 + np.hypot(q[0], q[1]))
        res = np.where(np.isfinite(res), res, np.inf)
        lam = np.where(np.isfinite(lam), lam, 0.0)
        mask = (res == minimum_filter(res, size=3)) & np.isfinite(res)
        idx = np.argwhere(mask)[np.argsort(res[mask])[:30]]
        out = [(GX[i, j], GY[i, j], lam[i, j]) for i, j in idx]
        return out + [(a, b, 0.0) for a in np.linspace(lo, hi, 3) for b in np.linspace(lo, hi, 3)]

    numsols = []
    for a0, b0, l0 in starts():
        try:
            v, _, ier, _m = fsolve(lambda t: Ef(t), [a0, b0] + ([l0] if g is not None else []), full_output=True, xtol=1e-12)
        except Exception:
            continue
        if ier == 1 and np.max(np.abs(Ef(v))) <= 1e-8 and inbox(v[0], v[1]):
            numsols.append(v)
    sol = _run(lambda: sp.solve(eqs, vs, dict=True), 2.5)
    for s in sol or []:
        try:
            a, b = complex(sp.N(s[X])), complex(sp.N(s[Y]))
            if abs(a.imag) > 1e-12 or abs(b.imag) > 1e-12:
                continue
            lam = complex(sp.N(s[L])).real if L in s else None
            add(a.real, b.real, lam, "SymPy", "(%s, %s)" % (_pretty(sp.simplify(s[X])), _pretty(sp.simplify(s[Y]))))
        except Exception:
            continue
    exact_n = len(pts)
    for v in numsols:
        hit = next((p for p in pts if abs(v[0] - p["x"]) < 1e-5 and abs(v[1] - p["y"]) < 1e-5), None)
        if hit:
            hit["matched"] = True
        else:
            add(float(v[0]), float(v[1]), float(v[2]) if g is not None else None, "SciPy (numerical)", "(%.8g, %.8g)" % (v[0], v[1]))
            if pts and pts[-1]["source"] == "SciPy (numerical)":
                pts[-1]["matched"] = True
    extra = len(pts) - exact_n
    if exact_n == 0 and pts:
        info.append("SymPy found no closed form within its time limit, so the points come from the numerical solver and are confirmed by SLSQP.")
    elif extra:
        notes.append("SciPy found %d point(s) that SymPy did not list." % extra)
    if any(p["source"] == "SymPy" and not p["matched"] for p in pts):
        notes.append("Some exact points were not re-found by the numerical search.")
    pts.sort(key=lambda p: (p["x"], p["y"]))

    for p in pts:
        p["value"] = _num(F(p["x"], p["y"]))
        if g is None:
            try:
                ev = np.linalg.eigvalsh(np.array(Hf(p["x"], p["y"]), dtype=float))
                p["type"] = ("local minimum" if ev[0] > 1e-9 else "local maximum" if ev[1] < -1e-9 else
                             "saddle point" if ev[0] < -1e-9 < 1e-9 < ev[1] else "inconclusive (Hessian is singular)")
            except Exception:
                p["type"] = "inconclusive (Hessian is singular)"
        else:
            p["type"] = "stationary point on the constraint"
        p["x"], p["y"], p["lam"] = _num(p["x"]), _num(p["y"]), _num(p["lam"]) if p["lam"] is not None else None

    # plotting data
    n = 56
    gx = np.linspace(lo, hi, n)
    GX, GY = np.meshgrid(gx, gx)
    Z = F(GX, GY)
    fin = Z[np.isfinite(Z)]
    zr = [float(np.percentile(fin, 2)), float(np.percentile(fin, 98))] if fin.size else [0.0, 1.0]
    curve, cvals = [], None
    if g is not None:
        G_ = _fn(g, (X, Y))
        m = 181
        cx = np.linspace(lo, hi, m)
        CX, CY = np.meshgrid(cx, cx)
        b = G_(CX, CY) > 0
        edge = (b[:-1, :-1] != b[1:, :-1]) | (b[:-1, :-1] != b[:-1, 1:])
        idx = np.argwhere(edge)
        if len(idx) > 8000:
            idx = idx[:: len(idx) // 8000 + 1]
        px_, py_ = np.array([cx[j] for i, j in idx]), np.array([cx[i] for i, j in idx])
        Gx_, Gy_ = _fn(sp.diff(g, X), (X, Y)), _fn(sp.diff(g, Y), (X, Y))
        for _ in range(5):      # Newton projection of every sample onto the constraint curve
            gv, a_, b_ = G_(px_, py_), Gx_(px_, py_), Gy_(px_, py_)
            den = a_ ** 2 + b_ ** 2
            ok_ = den > 1e-14
            d_ = np.where(ok_, den, 1.0)
            px_, py_ = np.where(ok_, px_ - gv * a_ / d_, px_), np.where(ok_, py_ - gv * b_ / d_, py_)
        keep = np.isfinite(px_) & np.isfinite(py_) & (np.abs(G_(px_, py_)) < 1e-7) & (px_ >= lo) & (px_ <= hi) & (py_ >= lo) & (py_ <= hi)
        px_, py_ = px_[keep], py_[keep]
        curve = [[round(float(a), 4), round(float(b), 4)] for a, b in zip(px_, py_)]
        if len(px_):
            cvals = F(px_, py_)
            cvals = cvals[np.isfinite(cvals)]

    res = {"function": _pretty(f), "constraint": (_pretty(g) + " = 0") if g is not None else None,
           "lo": lo, "hi": hi, "grad": [_pretty(fx), _pretty(fy)],
           "hessian": [[_pretty(Hm[i, j]) for j in range(2)] for i in range(2)],
           "points": pts, "zgrid": {"n": n, "z": [[_num(v) for v in row] for row in Z]}, "zrange": zr,
           "curve": curve, "abs_max": None, "abs_min": None, "scipy": None}
    diffs = [0.0]
    if g is not None and pts:
        vals = [p["value"] for p in pts if p["value"] is not None]
        mx, mn = max(vals), min(vals)
        res["abs_max"] = {"value": mx, "at": [[p["x"], p["y"]] for p in pts if p["value"] == mx]}
        res["abs_min"] = {"value": mn, "at": [[p["x"], p["y"]] for p in pts if p["value"] == mn]}
        rng = np.random.default_rng(0)
        best = {}
        for kind, sg in (("max", -1.0), ("min", 1.0)):
            bv = None
            for _ in range(14):
                x0 = rng.uniform(lo, hi, 2)
                try:
                    r = minimize(lambda v: sg * float(F(v[0], v[1])), x0, method="SLSQP", bounds=[(lo, hi)] * 2,
                                 constraints={"type": "eq", "fun": lambda v: float(G_(v[0], v[1]))})
                except Exception:
                    continue
                if r.success and abs(float(G_(r.x[0], r.x[1]))) < 1e-7:
                    v = sg * r.fun
                    bv = v if bv is None else (max(bv, v) if kind == "max" else min(bv, v))
            best[kind] = _num(bv) if bv is not None else None
        res["scipy"] = best
        for kind, ab in (("max", mx), ("min", mn)):
            if best[kind] is not None:
                diffs.append(abs(best[kind] - ab))
        if cvals is not None and cvals.size:
            tol = 1e-5 * (1 + max(abs(mx), abs(mn)))
            if cvals.max() > mx + tol:
                res["abs_max"] = None
                notes.append("The constraint curve reaches larger values than any Lagrange point inside this window, so there is no global maximum here (the curve may be unbounded).")
            if cvals.min() < mn - tol:
                res["abs_min"] = None
                notes.append("The constraint curve reaches smaller values than any Lagrange point inside this window, so there is no global minimum here (the curve may be unbounded).")
    elif g is not None:
        notes.append("No point satisfies the Lagrange conditions inside this window. Try a larger window.")
    if g is None and not pts:
        notes.append("The gradient has no zero inside this window.")
    res["max_difference"] = _num(max(diffs))
    res["status"] = "verified" if (not notes and max(diffs) < 1e-5) else "attention"
    res["notes"] = notes + info
    res["seconds"] = round(time.time() - t0, 3)
    return res

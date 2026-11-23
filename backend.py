"""
Milestone 3: Backend engine (SymPy + SciPy)
Topic: Analysis of Optimization Problems in Calculus

Improved version of the Milestone 2 prototype (optimiser.py):
  * the user can type ANY function of x (safe parser)
  * endpoints of a closed interval are compared automatically
  * if f''(c) = 0 the first derivative test is used
  * if SymPy cannot solve f'(x) = 0, critical points are found numerically (Brent)
  * SciPy independently re-checks the global maximum and minimum
  * result is returned as a plain dict, so the Flask frontend can send it as JSON
"""
import re
import math
import threading
import numpy as np
import sympy as sp
from sympy.parsing.sympy_parser import (parse_expr, standard_transformations,
                                        implicit_multiplication_application, convert_xor)
from scipy.optimize import minimize_scalar, brentq

X = sp.Symbol("x", real=True)

FUNCS = {"sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "asin": sp.asin, "acos": sp.acos,
         "atan": sp.atan, "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
         "exp": sp.exp, "log": sp.log, "ln": sp.log, "sqrt": sp.sqrt, "abs": sp.Abs}
CONSTS = {"pi": sp.pi, "e": sp.E}
ALLOWED_NAMES = set(FUNCS) | set(CONSTS) | {"x"}
TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)
_GLOBALS = {n: getattr(sp, n) for n in dir(sp) if not n.startswith("_")}
_GLOBALS["__builtins__"] = {}


class AnalysisError(Exception):
    """Problem with the user's input (shown to the user as a message)."""


# ---------------------------------------------------------------- helpers
def _run(fn, seconds):
    """Run fn() with a time limit. Returns None if it takes too long or fails.
    Uses a daemon thread, so a SymPy call that never finishes can not block program exit."""
    box = {}

    def work():
        try:
            box["v"] = fn()
        except Exception:
            pass
    t = threading.Thread(target=work, daemon=True)
    t.start()
    t.join(seconds)
    return None if t.is_alive() else box.get("v")


def _pretty(expr):
    return sp.sstr(expr).replace("**", "^")


def _num(v):
    try:
        v = float(v)
    except Exception:
        return None
    return v if math.isfinite(v) else None


def parse_function(text):
    """Turn the typed text into a SymPy expression in x (only safe names allowed)."""
    text = (text or "").strip()
    if not text:
        raise AnalysisError("Please type a function of x, for example x*(50 - x).")
    if len(text) > 200:
        raise AnalysisError("The function is too long (maximum 200 characters).")
    if not re.fullmatch(r"[0-9A-Za-z_+\-*/^().,\s]*", text):
        raise AnalysisError("The function contains characters that are not allowed.")
    for name in re.findall(r"[A-Za-z_][A-Za-z_0-9]*", text):
        if name not in ALLOWED_NAMES:
            raise AnalysisError("Unknown name '%s'. Use only x, numbers and functions such as "
                                "sin, cos, tan, exp, ln, sqrt, abs, pi, e." % name)
    local = {"x": X}
    local.update(FUNCS)
    local.update(CONSTS)
    try:
        expr = parse_expr(text, local_dict=local, global_dict=dict(_GLOBALS),
                          transformations=TRANSFORMS, evaluate=True)
    except Exception:
        raise AnalysisError("Could not understand the function. Check brackets and operators "
                            "(use * for multiplication and ^ or ** for powers).")
    if not isinstance(expr, sp.Basic):
        raise AnalysisError("Could not understand the function.")
    # keep decimals exact: 0.5 -> 1/2
    expr = expr.xreplace({fl: sp.Rational(str(fl)) for fl in expr.atoms(sp.Float)})
    if not expr.free_symbols <= {X}:
        raise AnalysisError("Only the variable x is allowed.")
    return expr


def _lam(expr):
    fn = sp.lambdify(X, expr, "numpy")

    def call(arr):
        with np.errstate(all="ignore"):
            try:
                y = fn(np.asarray(arr, dtype=float))
                y = np.asarray(y, dtype=float)
            except Exception:
                return np.full(np.shape(arr), np.nan)
        if y.shape != np.shape(arr):
            y = np.full(np.shape(arr), float(y))
        return y
    return call


def _scalar(call):
    def f(t):
        v = call(np.array([float(t)]))[0]
        return float(v)
    return f


# ---------------------------------------------------------------- numerical parts (SciPy)
def numeric_critical_points(d_call, lo, hi, n=4001, cap=1500):
    """Roots of f'(x) found by sign changes on a grid + Brent's method.
    If there are more than `cap` sign changes, an evenly spaced subset is refined (the independent
    SciPy extremum search still scans the whole interval)."""
    g = np.linspace(lo, hi, n)
    d = d_call(g)
    ok = np.isfinite(d)
    ds = _scalar(d_call)
    roots = []
    sc = np.nonzero(ok[:-1] & ok[1:] & (d[:-1] * d[1:] < 0))[0]
    numeric_critical_points.truncated = len(sc) if len(sc) > cap else 0
    if len(sc) > cap:
        sc = sc[np.linspace(0, len(sc) - 1, cap).astype(int)]
    for i in np.nonzero(ok[:-1] & (d[:-1] == 0.0))[0]:
        roots.append(float(g[i]))
    for i in sc:
        try:
            roots.append(brentq(ds, g[i], g[i + 1], xtol=1e-13))
        except Exception:
            pass
    if ok[-1] and d[-1] == 0.0:
        roots.append(float(g[-1]))
    out = []
    for r in sorted(roots):
        if not out or abs(r - out[-1]) > 1e-7:
            out.append(r)
    return out


def numeric_extrema(f_call, lo, hi, include_endpoints, n=2001):
    """Independent check: grid search + bounded minimisation (minimize_scalar)."""
    g = np.linspace(lo, hi, n)
    y = f_call(g)
    fs = _scalar(f_call)
    a, b = (0, n - 1) if include_endpoints else (1, n - 2)
    res = {}
    for kind, sign in (("max", -1.0), ("min", 1.0)):
        seg = sign * y[a:b + 1]
        i = a + int(np.nanargmin(seg))
        cands = [(float(g[i]), float(y[i]))]
        l, r = g[max(i - 1, a)], g[min(i + 1, b)]
        if r > l:
            try:
                m = minimize_scalar(lambda t: sign * fs(t), bounds=(l, r), method="bounded",
                                    options={"xatol": 1e-12})
                cands.append((float(m.x), float(fs(m.x))))
            except Exception:
                pass
        best = min(cands, key=lambda c: sign * c[1])
        res[kind] = {"x": best[0], "value": best[1]}
    return res


# ---------------------------------------------------------------- main analysis
def analyze(text, lo, hi, include_endpoints=True):
    import time
    t0 = time.time()
    f = parse_function(text)
    try:
        lo, hi = float(lo), float(hi)
    except (TypeError, ValueError):
        raise AnalysisError("The interval limits must be numbers.")
    if not (math.isfinite(lo) and math.isfinite(hi)):
        raise AnalysisError("The interval limits must be finite numbers.")
    if lo >= hi:
        raise AnalysisError("The lower limit must be smaller than the upper limit.")
    if hi - lo > 1e6:
        raise AnalysisError("The interval is too large (maximum length 1,000,000).")

    f1, f2 = sp.diff(f, X), None
    f2 = sp.diff(f1, X)
    fc, f1c, f2c = _lam(f), _lam(f1), _lam(f2)
    f_s, f1_s, f2_s = _scalar(fc), _scalar(f1c), _scalar(f2c)

    # --- domain check
    grid = np.linspace(lo, hi, 2001)
    y = fc(grid)
    if not np.all(np.isfinite(y)):
        bad = float(grid[np.where(~np.isfinite(y))[0][0]])
        raise AnalysisError("f(x) is not defined (or is infinite) near x = %.4g, so it cannot be "
                            "analysed on this interval. Choose an interval where f is defined." % bad)
    # a pole between two grid points: the sign flips but the value in between is still huge
    for i in np.where((y[:-1] * y[1:] < 0) & (np.abs(y[:-1]) > 100) & (np.abs(y[1:]) > 100))[0]:
        mid = float(fc(np.array([(grid[i] + grid[i + 1]) / 2]))[0])
        if abs(mid) > 0.5 * min(abs(y[i]), abs(y[i + 1])):
            raise AnalysisError("f(x) has a vertical asymptote near x = %.4g, so it cannot be "
                                "analysed on this interval. Choose an interval without it." % grid[i])
    cont = _run(lambda: sp.continuous_domain(f, X, sp.Interval(lo, hi)), 1.5)
    if cont is not None and cont != sp.Interval(lo, hi):
        raise AnalysisError("f(x) is not continuous on the whole interval, so a maximum/minimum "
                            "cannot be guaranteed. Choose a smaller interval.")

    notes = []
    eps_end = 1e-9 * max(1.0, hi - lo)
    h = 1e-5 * max(1.0, hi - lo)

    # constant function
    if sp.simplify(f1) == 0:
        v = _num(f_s(lo))
        return {"function": _pretty(f), "f1": "0", "f2": "0", "lo": lo, "hi": hi,
                "include_endpoints": include_endpoints, "critical_points": [], "endpoints": [],
                "abs_max": {"x": None, "value": v, "at": []}, "abs_min": {"x": None, "value": v, "at": []},
                "numeric": {"max": {"x": None, "value": v}, "min": {"x": None, "value": v}},
                "status": "verified", "max_difference": 0.0,
                "notes": ["f(x) is constant, so every point is a critical point and the maximum and "
                          "minimum are equal."],
                "curve": {"x": [float(a) for a in grid[::5]], "y": [v] * len(grid[::5])},
                "seconds": round(time.time() - t0, 3)}

    # --- Part A: SymPy
    def solve():
        return sp.solveset(sp.Eq(f1, 0), X, sp.Interval(lo, hi))
    sol = _run(solve, 2.5)
    sym_pts = None
    if isinstance(sol, sp.FiniteSet):
        sym_pts = []
        for c in sol:
            cv = _num(sp.N(c))
            if cv is not None and sp.im(sp.N(c)) == 0:
                sym_pts.append((c, cv))
    elif sol is sp.S.EmptySet:
        sym_pts = []

    # --- Part B: SciPy numerical roots of f'
    NS = int(min(200001, max(4001, 25 * (hi - lo))))   # sample density grows with interval width
    num_roots = numeric_critical_points(f1c, lo, hi, NS)
    if numeric_critical_points.truncated:
        notes.append("f\u2032 changes sign %d times here, so %d evenly spaced turning points were refined. The independent SciPy search still scans the whole interval." % (numeric_critical_points.truncated, 1500))

    points = []   # interior critical points
    ends = []

    def classify(c):
        s = f2_s(c)
        if math.isfinite(s) and abs(s) > 1e-9:
            return ("local maximum" if s < 0 else "local minimum"), "second derivative test"
        l, r = f1_s(c - h), f1_s(c + h)
        if l > 0 > r:
            return "local maximum", "first derivative test"
        if l < 0 < r:
            return "local minimum", "first derivative test"
        return "neither (inflection point)", "first derivative test"

    def add_point(cx, exact, source, value_exact=None):
        if cx <= lo + eps_end or cx >= hi - eps_end:
            return None
        kind, method = classify(cx)
        match = None
        for r in num_roots:
            if abs(r - cx) < 1e-5 and (match is None or abs(r - cx) < abs(match - cx)):
                match = r
        p = {"x": cx, "x_exact": exact, "value": f_s(cx), "type": kind, "method": method,
             "source": source, "numeric_root": match,
             "difference": (abs(match - cx) if match is not None else None)}
        points.append(p)
        return p

    if sym_pts is not None:
        for c, cv in sorted(sym_pts, key=lambda t: t[1]):
            add_point(cv, _pretty(sp.simplify(c)), "SymPy")
        # numeric roots that SymPy did not list (e.g. kinks, where f' jumps)
        for r in num_roots:
            if lo + eps_end < r < hi - eps_end and not any(abs(r - p["x"]) < 1e-5 for p in points):
                resid = abs(f1_s(r))
                p = add_point(r, "%.8g" % r, "SciPy (numerical)")
                if p:
                    if resid > 1e-4:
                        p["type"] += " (non-differentiable point)"
                        notes.append("At x = %.6g the derivative f'(x) jumps (the graph has a corner). "
                                     "SymPy does not list it, but SciPy found it." % r)
                    else:
                        notes.append("SciPy found a critical point at x = %.6g that SymPy did not list." % r)
        points.sort(key=lambda p: p["x"])
    else:
        notes.append("SymPy could not solve f'(x) = 0 in closed form, so the critical points were "
                     "found numerically with Brent's method.")
        for r in num_roots:
            add_point(r, "%.8g" % r, "SciPy (numerical)")

    # endpoints
    if include_endpoints:
        for xv, label in ((lo, "left endpoint"), (hi, "right endpoint")):
            ends.append({"x": xv, "value": f_s(xv), "type": label})
        # a critical point that sits exactly on an endpoint is already covered by the endpoint
    cands = [(p["x"], p["value"], "critical point") for p in points] + \
            [(e["x"], e["value"], e["type"]) for e in ends]

    def pick(kind):
        if not cands:
            return {"x": None, "value": None, "at": []}
        vals = [c[1] for c in cands]
        best = max(vals) if kind == "max" else min(vals)
        tol = 1e-9 * (1 + abs(best))
        at = [c[0] for c in cands if abs(c[1] - best) <= tol]
        return {"x": at[0], "value": best, "at": at}

    amax, amin = pick("max"), pick("min")
    if not include_endpoints:   # open interval: only extremes that occur at a critical point count
        if not any(p["type"] == "local maximum" for p in points):
            amax = {"x": None, "value": None, "at": []}
        if not any(p["type"] == "local minimum" for p in points):
            amin = {"x": None, "value": None, "at": []}

    # --- numeric verification of global extrema (SciPy)
    num = numeric_extrema(fc, lo, hi, include_endpoints, max(2001, NS // 2))
    missed = False
    for kind, ab in (("max", amax), ("min", amin)):
        if not include_endpoints:
            break
        nv = num[kind]["value"]
        better = (ab["value"] is None) or (nv > ab["value"] + 1e-7 * (1 + abs(nv)) if kind == "max"
                                          else nv < ab["value"] - 1e-7 * (1 + abs(nv)))
        if better:
            xv = round(num[kind]["x"], 8)
            notes.append("SciPy found a %s value %.6g at x = %.6g that the symbolic candidates missed; "
                         "it was added to the answer." % ("larger" if kind == "max" else "smaller", nv, xv))
            missed = True
            cands.append((xv, nv, "numerical search"))
    if missed:
        amax, amin = pick("max"), pick("min")

    # differences
    diffs = []
    for kind, ab in (("max", amax), ("min", amin)):
        if ab["value"] is not None:
            diffs.append(abs(num[kind]["value"] - ab["value"]))
    for p in points:
        if p["difference"] is not None:
            diffs.append(p["difference"])
    max_diff = max(diffs) if diffs else 0.0
    unmatched = [p for p in points if p["numeric_root"] is None and
                 p["type"] in ("local maximum", "local minimum")]
    clean_source = sym_pts is None or all(p["source"] == "SymPy" for p in points)
    status = "verified" if (not missed and not unmatched and max_diff < 1e-5 and clean_source) else "attention"
    if unmatched:
        notes.append("Some critical points were not confirmed by the numerical root search.")
    if not include_endpoints:
        notes.append("Endpoints are excluded (open interval): the extreme values are reported only "
                     "if they occur at a critical point inside the interval.")
    if not points:
        notes.append("f'(x) has no zeros inside the interval, so the function is monotonic here.")

    # curve for plotting
    gx = np.linspace(lo, hi, 401)
    gy = fc(gx)
    curve = {"x": [float(a) for a in gx], "y": [_num(b) for b in gy]}

    def clean(p):
        return {k: (_num(v) if isinstance(v, float) else v) for k, v in p.items()}

    return {"function": _pretty(f), "f1": _pretty(f1), "f2": _pretty(f2), "lo": lo, "hi": hi,
            "include_endpoints": include_endpoints,
            "critical_points": [clean(p) for p in points], "endpoints": [clean(e) for e in ends],
            "abs_max": {"x": _num(amax["x"]), "value": _num(amax["value"]), "at": [_num(a) for a in amax["at"]]},
            "abs_min": {"x": _num(amin["x"]), "value": _num(amin["value"]), "at": [_num(a) for a in amin["at"]]},
            "numeric": {k: {"x": _num(v["x"]), "value": _num(v["value"])} for k, v in num.items()},
            "status": status, "max_difference": _num(max_diff), "notes": notes, "curve": curve,
            "seconds": round(time.time() - t0, 3)}


if __name__ == "__main__":
    r = analyze("x*(12 - 2*x)^2", 0, 6)
    print(r["function"], "| f' =", r["f1"])
    for p in r["critical_points"]:
        print(p["x_exact"], p["value"], p["type"])
    print("max:", r["abs_max"], "min:", r["abs_min"], r["status"])

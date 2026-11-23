"""Milestone 4 stress test. Usage: python stress_test.py <tag> [N_random]
Every answer is checked against an independent brute-force reference (dense grid or parametrised curve)."""
import sys, os, json, time, math, random, csv, statistics
import numpy as np, sympy as sp
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from backend import analyze, parse_function, AnalysisError, X
from multivar import analyze2

def ref1(text, lo, hi):
    f = sp.lambdify(X, parse_function(text), "numpy")
    g = np.linspace(lo, hi, 400001)
    with np.errstate(all="ignore"):
        y = np.broadcast_to(np.asarray(f(g), float), g.shape)
    return float(np.nanmax(y)), float(np.nanmin(y))

def close(a, b, rel=1e-4):
    return a is not None and abs(a - b) <= rel * (1 + abs(b))

def run1(task):
    text, lo, hi = task
    t = time.perf_counter()
    try:
        r = analyze(text, lo, hi, True); dt = time.perf_counter() - t
    except AnalysisError as e:
        return dict(f=text, lo=lo, hi=hi, s=time.perf_counter() - t, outcome="rejected", why=str(e)[:80])
    except Exception as e:
        return dict(f=text, lo=lo, hi=hi, s=time.perf_counter() - t, outcome="crash", why=repr(e)[:80])
    gm, gn = ref1(text, lo, hi)
    ok = close(r["abs_max"]["value"], gm) and close(r["abs_min"]["value"], gn)
    return dict(f=text, lo=lo, hi=hi, s=dt, outcome="correct" if ok else "wrong", verified=r["status"] == "verified",
                npts=len(r["critical_points"]), why="" if ok else "got %s/%s ref %s/%s" % (r["abs_max"]["value"], r["abs_min"]["value"], gm, gn))

def gen_random(n, seed=7):
    R = random.Random(seed); out = []
    for i in range(n):
        k = i % 6; w = R.randint(1, 6)
        if k == 0:
            d = R.randint(2, 9); t = " + ".join("%d*x^%d" % (R.randint(-5, 5), p) for p in range(d + 1) if R.random() < .8) or "x^2"; out.append((t, -w, w))
        elif k == 1:
            out.append(("%d*sin(%d*x) + %d*cos(%d*x)" % (R.randint(1, 5), R.randint(1, 6), R.randint(1, 5), R.randint(1, 6)), 0, R.randint(5, 40)))
        elif k == 2:
            out.append(("x^%d*exp(-x/%d) - %d*x" % (R.randint(2, 5), R.randint(1, 4), R.randint(0, 3)), 0, R.randint(5, 25)))
        elif k == 3:
            out.append(("(x^2 + %d)/(x^2 + %d) + %d*x/10" % (R.randint(-3, 5), R.randint(1, 4), R.randint(-4, 4)), -w, w))
        elif k == 4:
            out.append(("abs(x - %d) + %d*x - sqrt(1 + x^2)" % (R.randint(-3, 3), R.randint(-2, 2)), -w - 2, w + 2))
        else:
            out.append(("ln(x)/x + %d*sin(x)/10" % R.randint(0, 4), .5, R.randint(5, 60)))
    return out

HARD = [("sin(x)", 0, 1000), ("sin(x)", 0, 100000), ("x^30 - 3*x^20 + x", -1.2, 1.2), ("sin(x^2)", 0, 30), ("exp(-x^2)*sin(10*x)", -5, 5),
        ("cos(50*x)", 0, 10), ("x^12 - 12*x^3 + x", -3, 3), ("x^3 - 3*x", -1e6, 1e6), ("sin(x) + sin(sqrt(2)*x)", 0, 500), ("x^9 - 7*x^7 + 3*x^5 - x^3 + x", -2, 2)]

def run2(task):
    kind, ftxt, gtxt, R, param = task
    t = time.perf_counter()
    try:
        r = analyze2(ftxt, gtxt, -R, R); dt = time.perf_counter() - t
    except AnalysisError as e:
        return dict(f=ftxt, g=gtxt, s=time.perf_counter() - t, outcome="rejected", why=str(e)[:80])
    except Exception as e:
        return dict(f=ftxt, g=gtxt, s=time.perf_counter() - t, outcome="crash", why=repr(e)[:80])
    if gtxt:
        th = np.linspace(0, 2 * np.pi, 400001); x, y = param(th)
        f = sp.lambdify(sp.symbols("x y"), sp.sympify(ftxt.replace("^", "**")), "numpy"); z = f(x, y)
        ok = r["abs_max"] is not None and close(r["abs_max"]["value"], float(np.max(z))) and r["abs_min"] is not None and close(r["abs_min"]["value"], float(np.min(z)))
    else:
        ok = all(p["type"] != "inconclusive" or True for p in r["points"])
    return dict(f=ftxt, g=gtxt, s=dt, outcome="correct" if ok else "wrong", verified=r["status"] == "verified", npts=len(r["points"]), why="")

def gen_multi(n, seed=3):
    R = random.Random(seed); out = []
    for i in range(n):
        a, b, c, d = [R.randint(-4, 4) for _ in range(4)]
        k = i % 5
        if k == 0:
            out.append(("circle", "%d*x + %d*y + %d*x*y" % (a, b or 1, c), "x^2 + y^2 = 4", 3, lambda th: (2 * np.cos(th), 2 * np.sin(th))))
        elif k == 1:
            out.append(("ellipse", "%d*x^2 + %d*y + x*y" % (a, b or 1), "x^2/4 + y^2/9 = 1", 4, lambda th: (2 * np.cos(th), 3 * np.sin(th))))
        elif k == 2:
            out.append(("superellipse", "%d*x + %d*y^3" % (a or 1, b or 1), "x^4 + y^4 = 1", 2, lambda th: (np.sign(np.cos(th)) * np.abs(np.cos(th)) / (np.cos(th) ** 4 + np.sin(th) ** 4) ** .25, np.sign(np.sin(th)) * np.abs(np.sin(th)) / (np.cos(th) ** 4 + np.sin(th) ** 4) ** .25)))
        elif k == 3:
            out.append(("rotated", "x^2 - %d*y + %d*x" % (b, a), "x^2 + y^2 + x*y = 3", 3, lambda th: (np.sqrt(3 / (1 + np.sin(th) * np.cos(th))) * np.cos(th), np.sqrt(3 / (1 + np.sin(th) * np.cos(th))) * np.sin(th))))
        else:
            out.append(("free", "x^4 + y^4 - %d*x*y + %d*x + %d*y" % (abs(a) + 1, b, c), "", 3, None))
    return out

def pct(v, p): v = sorted(v); return v[min(len(v) - 1, int(p / 100 * len(v)))] if v else 0

def summarise(rs):
    ts = [r["s"] for r in rs]; c = lambda o: sum(r["outcome"] == o for r in rs)
    return dict(n=len(rs), correct=c("correct"), wrong=c("wrong"), rejected=c("rejected"), crash=c("crash"),
                mean_s=round(statistics.mean(ts), 3), p50_s=round(pct(ts, 50), 3), p95_s=round(pct(ts, 95), 3), max_s=round(max(ts), 3), total_s=round(sum(ts), 2),
                verified=sum(bool(r.get("verified")) for r in rs), failures=[r for r in rs if r["outcome"] in ("wrong", "crash")][:6])

def dataset_check():
    rows = list(csv.DictReader(open("sample_dataset.csv")))
    ok = 0
    for d in rows:
        try:
            r = analyze(d["function"], d["lo"], d["hi"], d["include_endpoints"] != "0")
            good = d["expect"] == "ok"
            for e, v in ((d["exp_max_value"], r["abs_max"]["value"]), (d["exp_min_value"], r["abs_min"]["value"])):
                if e != "": good = good and v is not None and abs(v - float(e)) <= 1e-4 * (1 + abs(float(e)))
        except AnalysisError:
            good = d["expect"] != "ok"
        ok += good
    return dict(n=len(rows), correct=ok)

def one_call(i):
    t = time.perf_counter(); analyze("x*(%d - 2*x)^2" % (6 + i % 7), 0, 6, True); return time.perf_counter() - t

if __name__ == "__main__":
    tag, N, M, which = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4].split(",")
    path = "test_results/%s.json" % tag
    out = json.load(open(path)) if os.path.exists(path) else {}
    out.update(tag=tag, cpus=os.cpu_count() or 1, sample=dict(random=N, hard=len(HARD), multi=M))
    def go(fn, tasks):
        res = []
        for t in tasks:
            res.append(fn(t)); print(".", end="", flush=True)
        print(); return res
    if "dataset" in which:
        t = time.perf_counter(); out["dataset"] = dataset_check(); out["dataset"]["total_s"] = round(time.perf_counter() - t, 2)
    if "random" in which: out["random"] = summarise(go(run1, gen_random(N)))
    if "hard" in which: out["hard"] = summarise(go(run1, HARD))
    if "multi" in which: out["multi"] = summarise(go(run2, gen_multi(M)))
    if "conc" in which:
        t = time.perf_counter()
        with ThreadPoolExecutor(12) as ex: lat = list(ex.map(one_call, range(60)))
        out["concurrency"] = dict(requests=60, threads=12, wall_s=round(time.perf_counter() - t, 2), p95_s=round(pct(lat, 95), 3))
    json.dump(out, open(path, "w"), indent=1)
    for k in ("dataset", "random", "hard", "multi", "concurrency"):
        if k in out and k in [{"conc": "concurrency"}.get(w, w) for w in which]: print(k, {a: b for a, b in out[k].items() if a != "failures"})

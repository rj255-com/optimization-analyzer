"""Concurrency test: 60 DIFFERENT requests from 12 threads at once (no cache hits). Usage: python conc_test.py baseline|optimized"""
import sys, time, json
from concurrent.futures import ThreadPoolExecutor
mode = sys.argv[1]
if mode == "baseline":
    sys.path.insert(0, "/tmp/m3"); from backend import analyze
    call = lambda f: analyze(f, 0, 6, True)
else:
    from app import app
    def call(f):
        r = app.test_client().post("/api/analyze", json={"function": f, "lo": 0, "hi": 6, "include_endpoints": True}); assert r.status_code == 200
def one(i):
    t = time.perf_counter(); call("x*(%d - 2*x)^2 + %d" % (6 + i % 13, i)); return time.perf_counter() - t
t = time.perf_counter()
with ThreadPoolExecutor(12) as ex: lat = sorted(ex.map(one, range(60)))
res = dict(requests=60, threads=12, wall_s=round(time.perf_counter() - t, 2), p50_s=round(lat[30], 3), p95_s=round(lat[56], 3))
print(mode, res)
d = json.load(open("test_results/%s.json" % mode)); d["concurrency"] = res; json.dump(d, open("test_results/%s.json" % mode, "w"), indent=1)

# Milestone 4: Comprehensive Testing and Optimization
Optimization Analyzer. Generated 2026-10-24 from test_results/baseline.json and test_results/optimized.json.

## 1. Method
Every answer is compared with an independent reference, not with the program's own output:
single-variable problems against a 400,001-point brute-force grid; constrained two-variable problems against a
400,001-point parametrisation of the constraint curve (circle, ellipse, superellipse x^4+y^4=1, rotated ellipse);
the 17-problem dataset against its known answers. Concurrency: 60 requests from 12 threads.
Test machine: 1 CPU. Sample: 24 random, 10 hard, 10 constrained problems.
"Before" is the Milestone 3 engine, "after" is the optimized engine, both on the same problems.

## 2. Results
| Suite | Cases | Correct before | Correct after | Mean s before | Mean s after | Slowest s before | Slowest s after |
|---|---|---|---|---|---|---|---|
| Dataset (known answers) | 17 | 17 / 17 | 17 / 17 | | | | |
| Random problems | 24 | 24 / 24 | 24 / 24 | 1.58 | 0.99 | 6.50 | 3.11 |
| Hard cases | 10 | 9 / 10 | 9 / 10 | 3.14 | 1.94 | 6.37 | 3.16 |
| Constrained, two variables | 10 | 7 / 10 | 10 / 10 | 5.49 | 2.85 | 10.16 | 5.36 |

Total time over the three timed suites: 124.1 s before, 71.5 s after (42% less).
Concurrency (60 requests, 12 threads, fresh process): 2.73 s before, 3.37 s after; 95th percentile 0.982 s before, 1.132 s after.

## 3. Defects found by testing, and fixes
1. **Wrong "no global maximum/minimum" on constrained problems (3 of 10 cases).** The Lagrange points were right; the unbounded-curve check compared f on coarsely sampled curve points. Fix: Newton-project every sample onto the constraint (|g| < 1e-7) before comparing.
2. **Slow constrained solving (up to 10 s).** SymPy had 8 s before the numerical solver ran, which then tried 81 blind starts. Fix: numerical solver first, started only where the equations are nearly satisfied (vectorised screen, Lagrange multiplier estimated by least squares); SymPy capped at 2.5 s and kept for exact forms.
3. **Under-sampling on wide intervals.** A fixed 4,001-point search missed turning points of sin(x) on [0, 100000]. Fix: sample density grows with interval width. Densifying exposed a second problem (63 s for about 31,800 turning points), so at most 1,500 evenly spaced turning points are refined; a note tells the user, and the independent SciPy search still scans the whole interval.
4. **Program did not exit.** SymPy calls that timed out ran in non-daemon threads that Python waited for at shutdown. Fix: daemon threads.
5. **Repeated requests were recomputed.** Fix: LRU cache (about 124 ms to about 1 ms).

## 4. Interface changes for interpretability
A "What this means" panel under the Analyzer and Multivariable results states, in plain language, where each extreme occurs and whether it is an endpoint or an interior turning point, what a saddle point is, what the Lagrange multiplier means, and whether the two solvers agree. A Testing page shows these measured results inside the application.

## 5. Limitations (stated honestly)
- Sample sizes are small because tests ran on a single-CPU machine; run `python stress_test.py optimized 500 100 dataset,random,hard,multi,conc` and `python make_report.py` on a faster machine for a larger run.
- Timings vary between runs by tens of percent; compare orders of magnitude, not decimals.
- One hard case (interval of width 2,000,000) is rejected on purpose because it exceeds the 1,000,000 limit.
- Timed-out SymPy threads cannot be killed in Python; they finish in the background and can slow later requests.
- Lagrange extremes are global only for closed, bounded constraint curves; the program checks this numerically and reports when it cannot confirm it.
- Concurrency did not improve: on one CPU, 60 simultaneous requests take about the same total time before and after. A request queue was tested with sizes 1, 2, 4 and 12; limiting concurrency made the slowest requests slower, so it is off by default.
- Inequality constraints and more than two variables are not supported.

OPTIMIZATION ANALYZER — COMPLETE LOCAL TEST PROJECT
===================================================

This ZIP is assembled from the project files previously shared, with the
three-variable extension integrated into the existing Flask app and frontend.

RUN ON WINDOWS / VS CODE
------------------------
1. Extract this ZIP to a new folder.
2. Open that extracted folder in VS Code.
3. Open Terminal > New Terminal.
4. Run:
      python -m pip install -r requirements.txt
5. Run:
      python app.py
6. Open this address in your browser:
      http://127.0.0.1:5000

You can also double-click START_APP_WINDOWS.bat.

WHAT IS INCLUDED
----------------
- Existing single-variable engine: backend.py
- Existing two-variable engine: multivar.py
- New three-variable engine: multivar3.py
- Flask routes: /api/analyze, /api/multivar, /api/multivar3
- Original frontend styling plus upgraded x,y,z lab and Plotly slice views
- Dataset CSV and Testing JSON, with explicit Flask file routes
- Existing stress/concurrency/report scripts and a new multivar3 unit test

THREE-VARIABLE DEMO FUNCTIONS
-----------------------------
1. x^2 + y^2 + z^2       -> local minimum at (0,0,0), value 0
2. x^2 + y^2 - z^2      -> saddle point at (0,0,0), value 0
3. -x^2 - y^2 - z^2     -> local maximum at (0,0,0), value 0
4. x^3 - 3*x + y^2 + z^2 -> saddle (-1,0,0), local min (1,0,0)

NOTES / LIMITATIONS
-------------------
- The 3-variable engine searches for unconstrained stationary points inside
  the cube [lo,hi]^3 using deterministic multi-start numerical root solving.
- It calculates symbolic gradients and Hessians and classifies non-degenerate
  stationary points from Hessian eigenvalues.
- Numerical multi-start search is not a proof that every stationary point was
  found, and local Hessian classifications are not global-extremum guarantees.
- Three-variable equality/inequality constraints are not implemented in this
  first extension. Existing two-variable Lagrange constraints remain available.
- The 3D graph is a surface slice at fixed z. The 4D explorer moves through
  fixed-z slices of w=f(x,y,z), using height and colour to represent w.
- Plotly is loaded from its CDN, so the interactive 3D/4D charts need internet
  access in the browser. The mathematical API itself runs locally.

CHECKS
------
Run the new unit tests from this folder:
      python -m unittest -v test_multivar3

Then test the app in your browser. This package has not been deployed to your
GitHub or Render service; test it locally first, as requested.

# Optimization Analyzer

A browser-based tool for finding and verifying maxima and minima of a function on an interval. Flask serves the page, SymPy solves f'(x) = 0 exactly, and SciPy checks the answer numerically.

## Run it (Windows)
Double-click `START_APP_WINDOWS.bat`, then use http://127.0.0.1:5000.

## Run it (any system)
```bash
python -m pip install -r requirements.txt
python app.py
```

## Using the app
Seven pages are reached through the curve menu on the left: Overview, Analyzer, Graph, Critical points, Multivariable (Hessian test and Lagrange multipliers), Compare, Dataset and Slides. Type a function and an interval (for example `x*(12 - 2*x)^2` from 0 to 6) or pick a worked problem from the list, then press Analyze. Hover the graph to read values, pin a curve to compare it with the next one, and select any candidate under "Walk along the interval" to see why it is (or is not) an extreme point. Light and dark themes are both available.

## Structure
```text
milestone3/
|-- app.py  backend.py  multivar.py  requirements.txt  sample_dataset.csv
|-- START_APP_WINDOWS.bat  START_HERE.txt
`-- static/  index.html  style.css  app.js  sample_dataset.csv
```

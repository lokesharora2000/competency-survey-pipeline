# Competency Survey Analysis Pipeline (demo)

A small, reproducible workflow for the kind of work in the ARCS *Competency Assessment Data Analyst* role:
refine/QA a survey instrument, analyze pre/post data, code open-ended responses, and package data for sharing.

**All data is synthetic** (`generate_synthetic_data.py`, seed 42). It is built around the public description of the
IMLS project "Data and Research Competency: Capacity Building for Academic Librarians" (competency framework,
training, evaluation of training impact). It is not real UF data, and results here say nothing about real librarians.

## Run
```
python generate_synthetic_data.py   # writes data/
python analyze.py                   # writes output/
```
Needs pandas, numpy, scipy, scikit-learn, matplotlib.

## What it does
| Step | Output |
|---|---|
| Item QA: missingness, Cronbach's alpha per domain/wave | `reliability.csv` |
| Pre/post change per domain: Wilcoxon, paired d, bootstrap CI, Holm correction | `prepost_change.csv`, `.png` |
| Baseline gaps by role and institution type (targets for training) | `baseline_by_*.csv`, `baseline_gaps.png` |
| Qualitative coding: explicit codebook, rule-based first pass, kappa vs a human coder | `codebook.csv`, `coding_agreement.csv` |
| Unsupervised cluster pass to *suggest* missed codes for a human to review | `suggested_clusters.csv` |
| FAIR export: de-identified dataset + data dictionary | `analysis_dataset.csv`, `data_dictionary.csv` |

## Limits
- Kappa is high because the synthetic text was generated from the same themes; on real data the rules need
  iterative refinement. The point is the workflow: codebook -> auto first pass -> human validation -> agreement stats.
- Self-rated confidence is not measured skill; a real design should pair it with performance tasks.
- Mappable to the team's tools: codes and cases export as CSV for NVivo; the analysis could be ported to R.

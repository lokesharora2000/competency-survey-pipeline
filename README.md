# Competency Survey Analysis Pipeline (demo)

A small, reproducible workflow for the kind of work in the ARCS *Competency Assessment Data Analyst* role:
refine/QA a survey instrument, analyze pre/post data, code open-ended responses, and package data for sharing.

**All data is synthetic** (`generate_synthetic_data.py`, seed 42). It is built around the public description of the
IMLS project "Data and Research Competency: Capacity Building for Academic Librarians" (competency framework,
training, evaluation of training impact). It is not real UF data, and results here say nothing about real librarians.

## Live tools (run in the browser, no data leaves it)
Site: https://lokesharora2000.github.io/competency-survey-pipeline/
- **Instrument review**: item-rest correlation, alpha-if-deleted, floor/ceiling, skipped items, redundant pairs, with a plain-language fix list. Handles Qualtrics exports (the two header rows under the column names are detected and dropped) and reverse-coded items.
- **Coding workbench**: editable codebook, live coding, kappa against a human coder's labels, disagreement list, and words recurring in uncoded comments.
- **Gap explorer**: group by any column; pre/post change view when `pre_`/`post_` columns exist.
- A pilot sample with four deliberately flawed draft items shows what the review catches.

Source for the site is in `site_src/`; `python build_site.py` writes `docs/`.

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
- Coded comments export as CSV (one 0/1 column per code). The analysis could be ported to R.

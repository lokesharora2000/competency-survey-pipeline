"""Build the static results page (docs/index.html) from output/ for GitHub Pages."""
import html
import shutil
from pathlib import Path

import pandas as pd

OUT, SITE = Path("output"), Path("docs")
SITE.mkdir(exist_ok=True)
for png in ("prepost_change.png", "baseline_gaps.png"):
    shutil.copy(OUT / png, SITE / png)
shutil.copy(OUT / "data_dictionary.csv", SITE / "data_dictionary.csv")
shutil.copy(OUT / "codebook.csv", SITE / "codebook.csv")


def table(df: pd.DataFrame) -> str:
    head = "".join(f"<th>{html.escape(c)}</th>" for c in df.columns)
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(v))}</td>" for v in r) + "</tr>" for r in df.itertuples(index=False))
    return f'<div class="tbl"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


change = pd.read_csv(OUT / "prepost_change.csv")
change["wilcoxon_p"] = change.wilcoxon_p.map("{:.1e}".format)
change["p_holm"] = change.p_holm.map("{:.1e}".format)
rel = pd.read_csv(OUT / "reliability.csv")
code = pd.read_csv(OUT / "coding_agreement.csv")
themes = pd.read_csv(OUT / "themes_by_institution.csv")
clusters = pd.read_csv(OUT / "suggested_clusters.csv")

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Competency Survey Pipeline</title>
<style>
:root{{--bg:#f7f8fa;--fg:#1b2430;--muted:#5b6674;--panel:#fff;--line:#d9dee5;--accent:#1f5f8b;--warn:#b7791f}}
@media (prefers-color-scheme:dark){{:root{{--bg:#12171d;--fg:#e6eaf0;--muted:#9aa5b3;--panel:#1a212a;--line:#2d3743;--accent:#6aaee0;--warn:#e0b25a}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:62rem;margin:0 auto;padding:2rem max(16px,env(safe-area-inset-left)) 3rem;display:flex;flex-direction:column;gap:1.5rem}}
h1{{font:400 2.1rem/1.2 Georgia,serif;margin:0}} h2{{font-size:1.05rem;margin:0}} p{{margin:0;max-width:65ch}}
.note{{color:var(--muted);font-size:.85rem}}
.banner{{border:1px solid var(--line);border-left:3px solid var(--warn);background:var(--panel);padding:1rem;border-radius:6px}}
.grid{{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))}}
.card{{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:1.1rem;display:flex;flex-direction:column;gap:.6rem;min-width:0}}
img{{max-width:100%;height:auto;background:#fff;border-radius:4px}}
.tbl{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;font-size:.85rem;font-variant-numeric:tabular-nums}}
th,td{{text-align:left;padding:.35rem .5rem;border-bottom:1px solid var(--line);white-space:nowrap}} th{{color:var(--muted);font-weight:600}}
a{{color:var(--accent)}} code{{background:var(--panel);padding:.1rem .3rem;border-radius:3px}}
</style></head><body><main>
<header><p class="note">Demo for the Data and Research Competency project, UF Libraries ARCS</p>
<h1>Competency survey pipeline</h1>
<p>A reproducible workflow that checks a survey instrument, measures change after training, shows where baseline gaps are largest, and codes open-ended comments against a codebook a human can audit.</p></header>
<div class="banner"><p><b>All numbers here come from synthetic data</b> (120 simulated respondents, 15 items, 5 domains, fixed seed). Nothing comes from the IMLS project or real librarians. Coding agreement is high because the simulated comments were generated from the same themes, so it shows the workflow, not expected accuracy.</p></div>
<section class="grid">
<div class="card"><h2>Self-rated gain after training</h2><p class="note">Mean change on a 1 to 5 scale, 95% bootstrap interval.</p><img src="prepost_change.png" alt="Bar chart of mean pre/post gain per competency domain with confidence intervals"></div>
<div class="card"><h2>Baseline by institution type</h2><p class="note">Mean pre-training rating; shows who needs training first.</p><img src="baseline_gaps.png" alt="Bar chart of baseline competency by institution type and domain"></div>
</section>
<section class="card"><h2>Pre/post tests</h2><p class="note">Paired Wilcoxon, Holm-corrected across five domains; dz is the paired effect size.</p>{table(change)}</section>
<section class="grid">
<div class="card"><h2>Instrument reliability</h2><p class="note">Cronbach's alpha and missing responses per domain and wave.</p>{table(rel)}</div>
<div class="card"><h2>Open-text coding vs human coder</h2><p class="note">Cohen's kappa per code from <a href="codebook.csv">codebook.csv</a>.</p>{table(code)}</div>
</section>
<section class="card"><h2>Themes by institution type</h2><p class="note">Share of coded themes within each institution type.</p>{table(themes)}</section>
<section class="card"><h2>Suggested clusters for the coder to review</h2><p class="note">Unsupervised pass that proposes codes a human might have missed. It never replaces the coder.</p>{table(clusters)}</section>
<section class="card"><h2>Reproduce and reuse</h2>
<p>Run <code>python generate_synthetic_data.py</code> then <code>python analyze.py</code>. Outputs include a de-identified dataset and a <a href="data_dictionary.csv">data dictionary</a> for sharing and preservation. Codes export as CSV for NVivo.</p>
<p class="note">Self-rated confidence is not measured skill; a real design would pair it with performance tasks.</p></section>
</main></body></html>"""
(SITE / "index.html").write_text(page, encoding="utf-8")
print("built docs/index.html")

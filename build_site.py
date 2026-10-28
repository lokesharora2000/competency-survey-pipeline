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

overview = f"""
<div class="card"><h2>What the three tools do</h2>
<ol class="steps">
<li><b>Instrument review</b>Flags weak, redundant, reverse-worded, skipped and ceiling items, and says what to change. Try the pilot sample with deliberate flaws.</li>
<li><b>Coding workbench</b>Edit a codebook and watch open-ended comments get coded live, with kappa against a human coder and the words your codebook is missing.</li>
<li><b>Gap explorer</b>Shows which groups are weakest on which competencies, so training goes where it is needed.</li>
</ol>
<p class="note">The analysis below was run in Python on the synthetic sample. The tools above run the same kinds of checks in the browser on any CSV, including a Qualtrics export.</p></div>
<section class="grid">
<div class="card"><h2>Self-rated gain after training</h2><p class="note">Mean change on a 1 to 5 scale, 95% bootstrap interval.</p><img src="prepost_change.png" alt="Bar chart of mean pre/post gain per competency domain with confidence intervals"></div>
<div class="card"><h2>Baseline by institution type</h2><p class="note">Mean pre-training rating; shows who needs training first.</p><img src="baseline_gaps.png" alt="Bar chart of baseline competency by institution type and domain"></div>
</section>
<div class="card"><h2>Pre/post tests</h2><p class="note">Paired Wilcoxon, Holm-corrected across five domains; dz is the paired effect size. The coding agreement below is high because the simulated comments were generated from the same themes; it shows the workflow, not expected accuracy.</p>{table(change)}</div>
<section class="grid">
<div class="card"><h2>Instrument reliability</h2><p class="note">Cronbach's alpha and missing responses per domain and wave.</p>{table(rel)}</div>
<div class="card"><h2>Open-text coding vs human coder</h2><p class="note">Cohen's kappa per code from <a href="codebook.csv">codebook.csv</a>.</p>{table(code)}</div>
</section>
<div class="card"><h2>Reproduce and reuse</h2>
<p>Run <code>python generate_synthetic_data.py</code> then <code>python analyze.py</code>, then <code>python build_site.py</code> to rebuild this site. Outputs include a de-identified dataset and a <a href="data_dictionary.csv">data dictionary</a> for sharing and preservation.</p></div>
"""
tpl = Path("site_src/template.html").read_text(encoding="utf-8")
(SITE / "index.html").write_text(tpl.replace("{{OVERVIEW}}", overview), encoding="utf-8")
for f in ("style.css", "app.js", "stats.js"):
    shutil.copy(Path("site_src") / f, SITE / f)
(SITE / "data").mkdir(exist_ok=True)
for f in ("synthetic_survey.csv", "instrument_items.csv", "pilot_survey.csv", "pilot_items.csv", "qualtrics_style_sample.csv"):
    shutil.copy(Path("data") / f, SITE / "data" / (f.replace("synthetic_survey", "sample_survey")))
print("built docs/")

"""Reproducible analysis of a pre/post competency survey + open-text responses.

Steps: item QA -> reliability -> domain scores -> pre/post effect -> role/institution gaps
-> qualitative theme coding (codebook rules, human-in-the-loop validation) -> FAIR export.
"""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics import cohen_kappa_score

OUT = Path("output"); OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(7)
df = pd.read_csv("data/synthetic_survey.csv")
items = pd.read_csv("data/instrument_items.csv")


def cronbach_alpha(x: pd.DataFrame) -> float:
    x = x.dropna()
    k = x.shape[1]
    return k / (k - 1) * (1 - x.var(ddof=1).sum() / x.sum(axis=1).var(ddof=1))


# 1. Domain scores (mean of available items) and reliability -------------------------------
dom_rows, scores = [], {}
for dom, g in items.groupby("domain", sort=False):
    for wave in ("pre", "post"):
        cols = [f"{wave}_{i}" for i in g.item_id]
        scores[f"{wave}_{dom}"] = df[cols].mean(axis=1)
        dom_rows.append({"domain": dom, "wave": wave, "n_items": len(cols),
                         "alpha": round(cronbach_alpha(df[cols]), 3),
                         "missing_pct": round(df[cols].isna().mean().mean() * 100, 1)})
rel = pd.DataFrame(dom_rows)
rel.to_csv(OUT / "reliability.csv", index=False)
S = pd.DataFrame(scores)

# 2. Pre/post change per domain: Wilcoxon, paired effect size, bootstrap CI ---------------------
res = []
for dom in items.domain.unique():
    d = (S[f"post_{dom}"] - S[f"pre_{dom}"]).dropna()
    w = stats.wilcoxon(d)
    dz = d.mean() / d.std(ddof=1)
    boot = [rng.choice(d, len(d)).mean() for _ in range(2000)]
    res.append({"domain": dom, "n": len(d), "mean_gain": round(d.mean(), 2),
                "ci95_low": round(np.percentile(boot, 2.5), 2), "ci95_high": round(np.percentile(boot, 97.5), 2),
                "cohens_dz": round(dz, 2), "wilcoxon_p": w.pvalue})
change = pd.DataFrame(res)
# Holm correction across the 5 domain tests
order = change.wilcoxon_p.argsort().values
m = len(change); adj = np.empty(m); run = 0
for rank, idx in enumerate(order):
    run = max(run, (m - rank) * change.wilcoxon_p.iloc[idx]); adj[idx] = min(run, 1)
change["p_holm"] = adj
change.to_csv(OUT / "prepost_change.csv", index=False)

# 3. Where are the gaps? baseline by role and institution type ---------------------------------
pre_cols = [c for c in S if c.startswith("pre_")]
base = pd.concat([df[["role", "institution_type"]], S[pre_cols]], axis=1)
base.columns = [c.replace("pre_", "") for c in base.columns]
base.groupby("role").mean(numeric_only=True).round(2).to_csv(OUT / "baseline_by_role.csv")
base.groupby("institution_type").mean(numeric_only=True).round(2).to_csv(OUT / "baseline_by_institution.csv")

fig, ax = plt.subplots(figsize=(7, 3.8))
y = np.arange(len(change))
ax.barh(y, change.mean_gain, xerr=[change.mean_gain - change.ci95_low, change.ci95_high - change.mean_gain],
        color="#2f6f9f", capsize=3)
ax.set_yticks(y, change.domain); ax.invert_yaxis()
ax.set_xlabel("Mean self-rated gain (1-5 scale), 95% bootstrap CI"); ax.set_title("Pre/post change by domain (synthetic)")
fig.tight_layout(); fig.savefig(OUT / "prepost_change.png", dpi=160); plt.close(fig)

fig, ax = plt.subplots(figsize=(7, 3.8))
tab = base.groupby("institution_type")[[c.replace("pre_", "") for c in pre_cols]].mean()
tab.T.plot.barh(ax=ax); ax.set_xlabel("Baseline mean (1-5)"); ax.invert_yaxis()
ax.set_title("Baseline competency by institution type (synthetic)"); ax.legend(fontsize=7)
fig.tight_layout(); fig.savefig(OUT / "baseline_gaps.png", dpi=160); plt.close(fig)

# 4. Qualitative: codebook rules -> candidate themes -> validation against human labels -----------
CODEBOOK = {
    "time_workload": r"\b(time|workload|duties)\b",
    "need_hands_on": r"\b(hands-on|worked examples?|practice)\b",
    "confidence_stats": r"\b(statistic\w*|which test|intimidat\w*|method questions)\b",
    "institutional_support": r"\b(institution|budget|role)\b",
    "peer_community": r"\b(colleagues|community|peers?)\b",
    "tools_access": r"\b(licen[cs]es?|nvivo|install\w*|software)\b",
}
pd.DataFrame([{"code": k, "rule_regex": v} for k, v in CODEBOOK.items()]).to_csv(OUT / "codebook.csv", index=False)

def auto_code(text: str) -> set:
    return {k for k, rx in CODEBOOK.items() if re.search(rx, text.lower())}

df["auto_codes"] = df.open_text.map(lambda t: ";".join(sorted(auto_code(t))))
gold = df.gold_themes.str.split(";").map(set)
auto = df.auto_codes.str.split(";").map(lambda x: set(x) - {""})
kap = {k: cohen_kappa_score([k in g for g in gold], [k in a for a in auto]) for k in CODEBOOK}
kap_df = pd.DataFrame({"code": kap.keys(), "kappa_vs_human": [round(v, 2) for v in kap.values()],
                       "prevalence_pct": [round(np.mean([k in a for a in auto]) * 100, 1) for k in kap]})
kap_df.to_csv(OUT / "coding_agreement.csv", index=False)

# Unsupervised pass to *suggest* codes a human coder may have missed (not to replace them)
vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=3)
X = vec.fit_transform(df.open_text)
km = KMeans(n_clusters=6, n_init=10, random_state=0).fit(X)
terms = np.array(vec.get_feature_names_out())
sugg = [{"cluster": c, "size": int((km.labels_ == c).sum()),
         "top_terms": ", ".join(terms[km.cluster_centers_[c].argsort()[::-1][:6]])} for c in range(6)]
pd.DataFrame(sugg).to_csv(OUT / "suggested_clusters.csv", index=False)

# Themes by role: which barriers matter to whom
long = df[["role", "institution_type", "auto_codes"]].assign(code=df.auto_codes.str.split(";")).explode("code")
long = long[long.code != ""].reset_index(drop=True)
pd.crosstab(long.institution_type, long.code, normalize="index").round(2).to_csv(OUT / "themes_by_institution.csv")

# 5. FAIR-ready export: de-identified data + data dictionary -------------------------------------
df.drop(columns=["gold_themes"]).to_csv(OUT / "analysis_dataset.csv", index=False)
dd = [{"variable": "participant_id", "description": "Pseudonymous ID", "type": "string"},
      {"variable": "role / institution_type", "description": "Categorical respondent attributes", "type": "category"}]
dd += [{"variable": f"{w}_{r.item_id}", "description": f"[{r.domain}] {r.text} ({w} training, 1=not at all confident, 5=very confident)",
        "type": "integer 1-5, blank = missing"} for r in items.itertuples() for w in ("pre", "post")]
dd += [{"variable": "open_text", "description": "Free-text comment", "type": "string"},
       {"variable": "auto_codes", "description": "Codes assigned by codebook.csv rules; to be confirmed by a human coder", "type": "string"}]
pd.DataFrame(dd).to_csv(OUT / "data_dictionary.csv", index=False)

print(rel.to_string(index=False)); print(); print(change.to_string(index=False)); print(); print(kap_df.to_string(index=False))

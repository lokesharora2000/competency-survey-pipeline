"""Generate a SYNTHETIC pre/post competency survey for demonstration only.

No real UF/IMLS data is used. Domains and items are illustrative, loosely modelled on
common data-competency areas for academic librarians.
"""
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)

DOMAINS = {
    "Data management": ["Write a data management plan", "Apply FAIR principles to a dataset", "Advise on repository selection"],
    "Data analysis": ["Choose an appropriate statistical test", "Clean and reshape a messy dataset", "Interpret regression output"],
    "Visualization": ["Select an effective chart type", "Build a reproducible figure in R/Python", "Critique a misleading graphic"],
    "Research lifecycle": ["Map services to lifecycle stages", "Explain IRB/data-sharing obligations", "Support reproducible workflows"],
    "Teaching & consulting": ["Run a data-skills workshop", "Conduct a reference interview about data", "Assess learning outcomes of training"],
}
ITEMS = [(d, i) for d, items in DOMAINS.items() for i in items]
ROLES = ["Liaison librarian", "Data/research librarian", "Library staff", "Library faculty"]
INST = ["R1 university", "Regional college", "Small college / under-resourced"]

THEMES = {
    "time_workload": ["I have little protected time to learn data skills alongside my regular duties.",
                      "Workload makes it hard to attend long trainings."],
    "need_hands_on": ["Hands-on practice with real datasets helped far more than slides.",
                      "I want more worked examples I can reuse with patrons."],
    "confidence_stats": ["Statistics still feels intimidating when patrons ask method questions.",
                         "I am unsure when to recommend which test."],
    "institutional_support": ["My institution does not have a clear data services role for librarians.",
                              "There is no budget for software or training at my library."],
    "peer_community": ["Learning with colleagues from other campuses was the most valuable part.",
                       "I would like an ongoing community of practice after the training."],
    "tools_access": ["I cannot get licences for NVivo or statistical software on my campus.",
                     "Installing R and Python on managed machines is a barrier."],
}
THEME_KEYS = list(THEMES)

n = 120
rows = []
for pid in range(1, n + 1):
    role = rng.choice(ROLES, p=[.35, .2, .25, .2])
    inst = rng.choice(INST, p=[.4, .3, .3])
    ability = rng.normal(0, .6)
    base = 2.6 + (.4 if role == "Data/research librarian" else 0) - (.25 if inst.startswith("Small") else 0)
    gain = rng.normal(.7, .35)
    rec = {"participant_id": f"P{pid:03d}", "role": role, "institution_type": inst}
    for k, (dom, item) in enumerate(ITEMS):
        item_eff = rng.normal(0, .25)
        pre = np.clip(round(base + ability + item_eff + rng.normal(0, .5)), 1, 5)
        post = np.clip(round(base + ability + item_eff + gain + rng.normal(0, .5)), 1, 5)
        rec[f"pre_q{k+1:02d}"] = int(pre)
        rec[f"post_q{k+1:02d}"] = int(post)
    t = rng.choice(THEME_KEYS, size=rng.integers(1, 3), replace=False)
    rec["open_text"] = " ".join(rng.choice(THEMES[x]) for x in t)
    rec["gold_themes"] = ";".join(sorted(t))  # stands in for a human coder's labels
    rows.append(rec)

df = pd.DataFrame(rows)
# simulate item non-response (~2%) to exercise missing-data handling
for c in [c for c in df if c.startswith(("pre_q", "post_q"))]:
    df.loc[rng.random(n) < .02, c] = np.nan

df.to_csv("data/synthetic_survey.csv", index=False)
pd.DataFrame([{"item_id": f"q{k+1:02d}", "domain": d, "text": i} for k, (d, i) in enumerate(ITEMS)]
             ).to_csv("data/instrument_items.csv", index=False)
print(f"wrote {len(df)} synthetic respondents, {len(ITEMS)} items")

# --- Pilot version of the instrument with deliberately flawed draft items -----------------------
# Used by the web tools to show what the instrument review catches. Separate RNG, so the main data is unchanged.
prng = np.random.default_rng(99)
pilot = df[["participant_id", "role", "institution_type"]].copy()
for k in range(1, 16):
    pilot[f"p{k:02d}"] = df[f"pre_q{k:02d}"]
base_item = df["pre_q01"]
pilot["p16"] = (6 - base_item + prng.integers(-1, 2, n)).clip(1, 5)          # reverse-worded, not yet reverse-coded
pilot["p17"] = np.where(prng.random(n) < .85, 5, prng.integers(3, 5, n))      # almost everyone answers 5
pilot["p18"] = (df["pre_q02"] + (prng.random(n) < .05)).clip(1, 5)            # near-duplicate of p02
pilot["p19"] = prng.integers(1, 6, n)                                          # unrelated to the rest
pilot.loc[prng.random(n) < .12, "p19"] = np.nan                                # and often skipped
pilot["open_text"] = df["open_text"]; pilot["gold_themes"] = df["gold_themes"]
pilot.to_csv("data/pilot_survey.csv", index=False)
pilot_items = [{"item_id": f"p{k+1:02d}", "domain": d, "text": i} for k, (d, i) in enumerate(ITEMS)]
pilot_items += [
    {"item_id": "p16", "domain": "Data analysis", "text": "I rarely feel confident choosing a statistical method (reverse-worded)"},
    {"item_id": "p17", "domain": "Visualization", "text": "I know that charts should have titles"},
    {"item_id": "p18", "domain": "Data analysis", "text": "I can pick the right statistical test for a question"},
    {"item_id": "p19", "domain": "Research lifecycle", "text": "I enjoy attending conferences"},
]
pd.DataFrame(pilot_items).to_csv("data/pilot_items.csv", index=False)
print("wrote pilot_survey.csv with 4 flawed draft items")

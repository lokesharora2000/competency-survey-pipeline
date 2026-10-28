"""Write a Qualtrics-style export (synthetic) to test the web tools' upload path.

Mimics a numeric-values export: row 1 = column names, row 2 = question text, row 3 = ImportId JSON.
"""
import json
import numpy as np
import pandas as pd

rng = np.random.default_rng(2026)
n = 60
ITEMS = [
    "I can write a data management plan",
    "I can choose an appropriate statistical test",
    "I can clean and reshape a messy dataset",
    "I can build a reproducible chart in R or Python",
    "I can explain data-sharing obligations to a researcher",
    "I rarely feel confident answering a data question at the desk",   # reverse-worded
    "I can run a hands-on data-skills workshop",
    "I can assess whether a training changed anyone's skills",
]
ROLES = ["Liaison librarian", "Data librarian", "Library staff", "Library faculty"]
COMMENTS = [
    ("I have little protected time to learn data skills.", "time_workload"),
    ("Statistics still feels intimidating when patrons ask method questions.", "confidence_stats"),
    ("Hands-on practice with real datasets helped most.", "need_hands_on"),
    ("My library has no budget for software licences.", "institutional_support;tools_access"),
    ("Learning with colleagues from other campuses was the best part.", "peer_community"),
    ("I do not know who to ask for help once the training ends.", "mentoring"),
    ("Evening sessions are hard with my commute and childcare.", "scheduling"),
    ("The pace was too fast for someone new to R.", "pace"),
    ("More examples from humanities research would help my liaison areas.", "discipline_examples"),
]

ability = rng.normal(0, .7, n)
cols = {"StartDate": [], "EndDate": [], "Status": [], "Progress": [], "Duration (in seconds)": [], "Finished": [],
        "RecordedDate": [], "ResponseId": []}
for i in range(n):
    d = pd.Timestamp("2026-09-14 09:00") + pd.Timedelta(minutes=int(rng.integers(0, 60 * 24 * 10)))
    dur = int(rng.integers(150, 900))
    cols["StartDate"].append(d.strftime("%Y-%m-%d %H:%M:%S"))
    cols["EndDate"].append((d + pd.Timedelta(seconds=dur)).strftime("%Y-%m-%d %H:%M:%S"))
    cols["Status"].append(0); cols["Progress"].append(100); cols["Duration (in seconds)"].append(dur)
    cols["Finished"].append(1); cols["RecordedDate"].append((d + pd.Timedelta(seconds=dur)).strftime("%Y-%m-%d %H:%M:%S"))
    cols["ResponseId"].append(f"R_{rng.integers(10**11, 10**12)}")

items = {}
for k in range(len(ITEMS)):
    v = np.clip(np.round(3 + ability + rng.normal(0, .8, n)), 1, 5)
    if k == 5:
        v = 6 - v                                    # reverse-worded: high agreement = low confidence
    v = v.astype(float); v[rng.random(n) < .03] = np.nan
    items[f"Q1_{k+1}"] = v

picked = [COMMENTS[i] for i in rng.integers(0, len(COMMENTS), n)]
df = pd.DataFrame({**cols, **items})
df["Q2_role"] = rng.choice(ROLES, n, p=[.35, .25, .2, .2])
df["Q3_comments"] = [p[0] for p in picked]
df["human_codes"] = [p[1] for p in picked]          # hand-added by the coder, as in a real workflow

row2 = {c: c for c in df.columns}
row2.update({"StartDate": "Start Date", "EndDate": "End Date", "Duration (in seconds)": "Duration (in seconds)",
             "RecordedDate": "Recorded Date", "ResponseId": "Response ID", "Q2_role": "What is your role?",
             "Q3_comments": "What is the biggest barrier to using data skills in your work?", "human_codes": "Human codes"})
for k, t in enumerate(ITEMS):
    row2[f"Q1_{k+1}"] = f"How confident are you? - {t}"
row3 = {c: json.dumps({"ImportId": c if c.startswith("Q") else c.replace(" ", "")}) for c in df.columns}
out = pd.concat([pd.DataFrame([row2, row3]), df.astype(object).where(df.notna(), "")], ignore_index=True)
out.to_csv("data/qualtrics_style_sample.csv", index=False)
print(out.shape, "rows incl. 2 extra header rows")

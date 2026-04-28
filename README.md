# Production Workflow Automation — Showcase

A curated subset of operations and automation work from a six-year role as Studio Manager and Photographer at a Berlin-based e-commerce fashion operation (2021–2026).

This repository was prepared as a supplement to an application for the **Technical Operations Manager (Design team)** role at JetBrains. It documents the systems built to replace manual studio and post-production workflows: what was built, what changed measurably, and why each design choice was made.

The body of work is in a different domain (catalog photography production rather than product or UI design), but the operational concerns are the same: intake and prioritization, throughput against quality, capacity visibility, automation of recurring work, and tooling that survives staff change.

---

## What's in here

```
studio-ops-showcase/
├── README.md                    ← you are here
├── docs/
│   ├── workflow-overview.md     ← the daily process, before and after
│   ├── architecture.md          ← system topology and design choices
│   └── case-studies.md          ← three concrete problems and their fixes
├── src/
│   ├── asset-workflow/          ← Google Apps Script: ERP ↔ Sheets ↔ cloud storage
│   ├── image-processing/        ← Python: automated cropping for catalog images
│   └── photoshop-automation/    ← JSX: batch export with category-based logic
└── examples/
    ├── sample-product-data.csv
    └── sample-workflow-status.csv
```

The `docs/` folder is the substantive part. `src/` contains sanitized illustrative excerpts.

---

## How this maps to the role

The JD names six KPIs and six initial priorities. The tables below show where each maps to evidence in this repo. Where the match is partial or absent, that is stated honestly rather than stretched.

### KPIs

| KPI                          | Evidence                                                              |
|------------------------------|-----------------------------------------------------------------------|
| Speed (request → delivery)   | Average processing time per batch reduced ~73% (~164h → ~43h); same-day completion rate improved from ~50% to ~82%. See `docs/case-studies.md`. |
| Automation impact            | Three production automations documented — ERP integration, batch export, footwear cropping. See `src/`. |
| Team workload balance        | Throughput maintained or improved through a period of headcount reduction. Mechanism: automation absorbed coordinator tasks (intake, renaming, reconciliation). See `docs/workflow-overview.md` § "What the operator does now". |
| Tooling ecosystem ownership  | Single-operator ownership of an integrated stack (ERP, cloud file store, Sheets, Photoshop, Python service). See `docs/architecture.md`. |
| Quality (stakeholder NPS)    | **Partial.** Internal qualitative feedback only — no formal NPS instrument was in place. A formal measurement system would be one of the first things to build in a role like this. |
| Smart outsourcing impact     | **Not directly applicable.** Outsourcing was not part of the studio's operating model. This is a genuine gap relative to the JD and is acknowledged below. |

### Initial six-month priorities

| Priority from the JD                         | Where this repo demonstrates analogous work |
|----------------------------------------------|---------------------------------------------|
| Audit current workflows, map pain points     | `docs/workflow-overview.md` is exactly this for the studio context. |
| Design a new intake and prioritization model | The morning-pull script + flagging logic (`src/asset-workflow/apps-script-sample.js`) is a working version of this for catalog production. |
| Launch a transparency dashboard              | The working sheet acts as a live dashboard for the studio. `examples/sample-workflow-status.csv` shows its structure. |
| Establish quick-win automations              | All three `src/` scripts are quick-win automations, each addressing a specific recurring pain. `docs/case-studies.md` walks through three of them. |
| Outsourcing pilot scheme                     | Not represented in this repo. See "Scope and transferability" below. |
| Capacity and demand dashboard                | Same working sheet, viewed by category and stage. The aggregate view answers "how many SKUs at each stage today?" |

---

## Headline results

Numbers were derived from the studio's internal production-tracking sheets, comparing matched product categories before and after workflow restructuring. The baseline is the same studio's own 2022–2023 peak performance.

| Metric                             | Before          | After          | Change   |
|------------------------------------|-----------------|----------------|----------|
| Average processing time per batch  | ~164 hours      | ~43 hours      | −73%     |
| Daily output (SKUs / day)          | ~9.7            | ~15.6          | +60%     |
| Same-day completion rate           | ~50%            | ~82%           | +32 pp   |

These numbers were maintained through a period when team headcount was reduced — the most relevant point for the "team workload balance" KPI.

---

## What this work actually was

Most studio operations roles end at "I run the floor." Most automation engineering roles start at "show me your data model." The gap in between — people who understand how a creative artefact gets produced *and* can write the code that automates that production — is small. This repository documents what happened when one person held both ends.

Every script in this repo was written to solve a problem I had personally felt as the operator the day before. The architecture document explains the shape of the system; the case studies explain three of the more interesting problems and what was traded off in each.

The relevance to a Design Operations role is not that catalog photography is the same as product design — it isn't. The relevance is that the operational shape is the same: a creative team produces artefacts on deadline, an intake queue feeds them, capacity is finite, quality varies, and tooling either helps or hinders. The underlying patterns transfer.

---

## Stack

- **Scripting**: Google Apps Script (V8), AppleScript, Photoshop JSX (ExtendScript), Swift (Vision framework)
- **Integrations**: REST APIs and webhooks against an ERP, a cloud file store, and Google Sheets
- **Image work**: Python (OpenCV, Pillow) for offline catalog processing; Photoshop actions and JSX for in-software automation
- **Documentation**: Markdown, Mermaid diagrams, internal bilingual handover notes (not in this repo)

The stack reflects an explicit constraint: no developer team, no infrastructure budget, single-operator maintenance after handover. The trade-offs of that choice are examined in `docs/architecture.md`.

---

## Scope and transferability

This work was done at one operational scale and shape; the role described in the JD is at a different scale and shape. Three areas where the transfer is not direct:

- **Outsourcing and vendor management.** The studio operated fully in-house. Vendor coordination, quality review, and outsourcing pilots are not in my recent work, and would be the area I would expect to address first in the role.
- **Multi-team scope.** The studio was a single team. Coordinating across multiple design sub-teams is a real step up in scope, and a first-quarter learning curve is honest to expect.
- **Design-specific tooling.** I have not used Figma, YouTrack, or Coverbaker in production. I am familiar with the categories these tools occupy (collaborative editing, ticketing, asset management) and would expect working competence in them quickly, though not existing fluency.

These are named explicitly because they shape what the first three to six months would realistically look like.

---

## How to read this repo

If you have ten minutes:
1. This README
2. `docs/case-studies.md` — three concrete problems

If you have thirty minutes:
3. `docs/workflow-overview.md` — the full process, before and after
4. `docs/architecture.md` — the system view and design rationale
5. One file under `src/` that matches your interest

The code samples are short on purpose — they show approach, not a runnable production system.

---

## A note on what was removed

Sanitization applied before publishing:

- Employer name and brand identifiers (referred to as "the studio" or "the operation")
- Real API endpoints, tokens, account IDs, and webhook URLs (replaced with `https://erp.example.com/...` and `YOUR_API_TOKEN_HERE` placeholders)
- Production folder paths (replaced with `/path/to/working/folder/`)
- Customer, supplier, and colleague names
- Real product data in CSV samples (replaced with plausible synthetic rows)

Logic and structure are accurate; specifics are not.

---

## Application context

Submitted as part of an application for the Technical Operations Manager (Design team) role at JetBrains, posted for Amsterdam, Berlin, Prague, and Warsaw.

Berlin-based, EU permanent resident, sixteen years' residency in Germany. English and German B2; native Korean. Comfortable with hybrid work in Berlin or relocation to Amsterdam.

Repository maintained as a portfolio. Issues and questions welcome.

# Workflow Overview

This document describes the daily production workflow for a Berlin-based e-commerce fashion studio: what it looked like before automation, what each step now does, and where the system intervenes.

---

## The work the studio does

The studio produces product images for an e-commerce catalog covering roughly 150 brands across apparel, footwear, and accessories. A typical day handles 60–120 SKUs across three to four shooting setups: editorial-style flatlay, on-figure (mannequin or model), packshot on white, and detail/macro.

For every SKU, the catalog requires a consistent set of deliverables: a primary front shot, several alternate angles, a detail crop, a colour-corrected master, a web-export at multiple resolutions, and a metadata record matching the ERP. The deliverable count per SKU ranges from four to twelve images depending on category.

---

## Before: the manual workflow

Before automation, the daily flow looked roughly like this:

1. **Morning** — A studio coordinator pulled tomorrow's shoot list from the ERP into a spreadsheet by hand. Items frequently arrived without complete metadata; a stylist or assistant would chase missing information.
2. **Capture** — Photographers shot to a tethered laptop. File naming was manual, based on what someone wrote down on a clipboard. Mismatches between the physical SKU and the typed file name were a common error.
3. **Ingestion** — At end of day, files were copied to a cloud folder. A separate person would rename, sort by category, and confirm against the shot list.
4. **Post-production** — Retouchers worked through a queue. Each image required: white-balance correction, background extraction, colour matching against a reference, and category-specific corrections (for example, footwear had stricter symmetry requirements than apparel).
5. **Export** — Final files were exported to multiple resolutions, named according to a convention the ERP expected, and uploaded back to the ERP one folder at a time.
6. **Reconciliation** — A coordinator marked the ERP record as "ready for catalog." This step was often forgotten on busy days, leading to images sitting un-published.

The entire chain was visible to no single person. Each handover was a potential failure point.

---

## After: the automated workflow

The same daily flow now looks like this:

1. **Morning** — A scheduled Apps Script pulls the next day's shoot list from the ERP into a working sheet. Missing metadata is flagged in red and a notification is sent to the responsible coordinator. The sheet is the single source of truth for the day.
2. **Capture** — A Swift-based iOS utility scans the SKU barcode at the shooting station. The scan looks up the product in the working sheet, returns the canonical name, and writes that name into the camera's tethered software via AppleScript. The photographer presses the shutter; files arrive correctly named.
3. **Ingestion** — A folder watcher running on the studio Mac detects new files, computes a perceptual hash, and writes a status row into the working sheet. Duplicates and near-duplicates are flagged with a quality score so re-shoots do not silently overwrite better takes.
4. **Post-production** — A Photoshop batch action driven by JSX applies category-specific corrections, exports to the required resolutions, and writes the output filenames back into the working sheet. Footwear additionally goes through a Python crop step that uses a trained model to standardize composition.
5. **Export** — When a row in the sheet has all required deliverables, a webhook fires a transfer to the ERP. The transfer encodes images as binary attachments (the ERP API expected a non-standard encoding; see `docs/case-studies.md` §2).
6. **Reconciliation** — The Apps Script confirms the ERP write succeeded by reading the record back, then marks the row as "live."

A single dashboard sheet shows, in real time, how many SKUs are at each stage. The studio coordinator no longer chases status — the sheet tells them.

---

## What the operator does now

The role of the studio coordinator changed substantially. Before automation, roughly 60% of the coordinator's day was spent on chasing, renaming, and reconciliation. After automation, that portion dropped to roughly 10%. The remaining time moved toward exception handling (items the system flagged for human review), brand-specific styling decisions, and capacity planning.

This is the single most important effect of the system, and the hardest one to capture in a metric. The numbers in the README show throughput. They do not show that the work changed shape.

---

## Failure modes the system was designed to survive

A production studio cannot stop because a script broke. Three principles shaped the design:

- **Column-position independence.** The ERP team occasionally added or reordered columns in their export. The script reads by column header, not by position, so re-orderings do not break ingestion.
- **Idempotent webhooks.** Network failures during ERP upload retry on a backoff schedule. Each upload includes a deduplication key the receiving end uses to ignore replays.
- **Fail-loud, not fail-silent.** When something cannot be resolved automatically, the row is flagged in red and a Slack notification is posted. The system never silently drops work.

These choices matter more than any individual feature. A studio runs on the assumption that yesterday's shoot will be available tomorrow. The architecture document goes into more detail on how each principle was implemented.

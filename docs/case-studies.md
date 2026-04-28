# Case Studies

Three problems the system was built to solve. Each one started as something visible from the studio floor — a daily friction or a recurring bug — and ended as a piece of code that runs without supervision.

These are written as case studies rather than as feature descriptions. The point is to show what the problem looked like before there was a fix, what was tried, what did not work, and why the eventual solution was the one chosen.

---

## 1. Filenames that lied about what was inside them

**The problem.** A photographer would shoot ten variants of a shoe, then walk to the next item. The capture software named files by sequence: `IMG_0143.cr2`, `IMG_0144.cr2`, and so on. A coordinator would later type the SKU into the filename based on what was on a clipboard. On a busy day, the clipboard and the actual shoot order drifted.

The visible symptom was that catalog images for one SKU sometimes contained a different SKU. Not often — maybe one item per fifty — but enough that every batch had to be visually verified before publication. The hidden cost was that the verification step took roughly forty minutes per day from the senior retoucher.

**What was tried first.** A simple solution: print sticky labels with QR codes, attach them to each item in the morning, scan with a Python script on a studio laptop, write the result to a text file the photographer could read. This worked. It also failed. The laptop took up bench space at the shooting station; photographers stopped using the scanner when the bench was crowded; the original problem returned within two weeks.

**What worked.** The same logic moved to a phone. An iOS app written in Swift reads barcodes via the Vision framework, looks up the SKU against the day's working sheet via an HTTP call, and writes the canonical product name directly into the tethered capture software (Capture One Pro) via an AppleScript bridge running on the studio Mac. The photographer scans, the next file lands with the correct name, no clipboard, no laptop on the bench.

**Why the phone version was the one that stuck.** It removed a piece of equipment from the workflow rather than adding one. The phone is in the photographer's pocket already. The change was operationally smaller, even though it was technically larger.

**What this looked like in numbers.** The misnaming rate dropped to effectively zero. The verification step the senior retoucher was doing every day went away. The forty minutes that bought back per day was the single biggest source of throughput improvement in the entire system — larger than any of the more impressive automation pieces.

---

## 2. The ERP that would not accept JPEGs

**The problem.** The catalog ERP exposed a REST endpoint for product image upload. The endpoint accepted images as multipart form data, with one specific quirk: the image bytes had to be UTF-8 encoded as part of a JSON envelope, not as a binary multipart attachment. This is a non-standard requirement, possibly a legacy artefact of how the ERP was originally implemented.

The visible symptom was that uploads from any standard HTTP client (`curl`, the Apps Script `UrlFetchApp`, Python `requests`) failed with corrupted images on the receiving end. The bytes arrived intact, but the ERP's image renderer treated the payload as text, ran a UTF-8 decode pass on the binary data, and wrote a corrupted file to its image store. The result was a thumbnail of garbage where a product photo should have been.

**What was tried first.** Increasingly elaborate workarounds with the standard libraries. Setting explicit content-type headers, base64-encoding before sending, sending as multipart with explicit boundary markers. None of these produced a clean image at the destination.

**What worked.** Reading the ERP's own internal upload tool revealed that it was sending image bytes pre-encoded as a hex-escape string inside a JSON field, not as binary at all. Reproducing that encoding in Apps Script — manually building the hex-escape representation byte by byte — produced uploads that the ERP's renderer accepted intact.

**The actual code is twelve lines.** It iterates over the byte array, converts each byte to a `\xNN` escape sequence, joins the result into a string, and embeds the string in a JSON field. The trick was recognizing that the ERP expected this specific format. The implementation was trivial; the diagnosis was the work.

**Why this case study is included.** Most automation problems are not about clever algorithms. They are about reading someone else's protocol carefully enough to figure out what it actually wants, which is rarely what its documentation says it wants. This problem cost about three days of diagnostic time and twelve lines of code. That ratio is normal.

A representative excerpt of the encoding logic is in `src/asset-workflow/apps-script-sample.js` (the `encodeBinaryForErp` function).

---

## 3. The deduplicator that learned to prefer better photos

**The problem.** Photographers re-shoot. A first take might be soft on focus, or the colour temperature might be off, or a stylist might want to change a detail. The re-shot file lands in the same folder as the first take, with a different sequence number but the same SKU.

A naive deduplicator — keep the most recent file — would silently discard the first take. This is wrong when the first take was the better photo. A naive deduplicator that keeps the first file is also wrong, for the symmetric reason.

The visible symptom was a slow erosion of average image quality across the catalog over time, as re-shoots stochastically replaced both better and worse takes. Nobody noticed this for several months. It became visible when someone compared a new product's images side-by-side with an older product's images and found the older ones were sharper.

**What was tried first.** A version-control style approach: keep all takes, mark one as primary, allow manual override. This is correct in principle and unworkable in practice — nobody had time to manually mark primary takes. The system reverted to "keep most recent" by neglect.

**What worked.** A quality score based on three measures, all computed at ingestion time:

- **Sharpness** — variance of the Laplacian of the luminance channel. Higher is sharper.
- **Exposure** — distance of the luminance histogram's centre of mass from middle grey. Lower is closer to neutral exposure.
- **Composition stability** — perceptual hash distance from the previous take of the same SKU. Used for detecting near-duplicates rather than for scoring directly.

The deduplicator computes a composite score for each new take and compares it to the existing best take for that SKU. If the new take's score is higher by more than a threshold, it replaces the existing primary. If it is lower or within the threshold, it is kept as a secondary and the primary stays.

**The crucial detail.** The threshold matters. A new take that is marginally better is not necessarily better — it could be noise. The threshold was tuned by looking at a hundred manually-judged pairs and finding the score gap that humans called "noticeably different." Below that gap, the system keeps what it has.

**What this case study is included to show.** Most ML-flavoured solutions in production are not models — they are simple heuristics with carefully chosen thresholds. The right threshold, decided by looking at real data and asking a human "is this difference real?", is more important than the choice of metric. Anyone can compute the variance of a Laplacian. Knowing whether to act on a 5% difference in the result is the actual work.

The full deduplication logic is summarized in pseudocode at the end of `src/asset-workflow/apps-script-sample.js`.

---

## What these have in common

Each of these started as a problem visible from the floor — a wrong filename, a corrupted upload, a slow drift in catalog quality. Each one was solvable, but only after the underlying mechanism was understood properly. The code in each case is short. The diagnostic and design work in each case was the real cost.

This is the argument for hiring someone who has worked on the floor and built the systems: the problems that matter are not the ones in the script. They are the ones that were visible before the script was written.

# ADR 0042 — Record applications made outside Joby

Status: accepted

Application accepts user-reported company, role and a dated stage for an external application.
The report is stored on Application, not Social or a fabricated Opportunity understanding.
An opaque `external:` reference identifies the uncaptured opportunity; unknown Identity and
Opportunity revisions are null. No submitted materials, adaptation or outcomes are invented.
Root, report and initial timeline entry commit together. Later progress uses the same append-only
timeline. Import retries with the same person and request id reuse the original record.

Own profiles show all applications and current stages. Peer profiles expose only explicitly shared
signals, never an unshared newer stage. External reports are labeled user-reported. The manual
entry form uses the API's trusted bearer identity and never accepts a person id from the form.

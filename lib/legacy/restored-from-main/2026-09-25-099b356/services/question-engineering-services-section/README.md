# Question engineering services section

This package owns the engineering of first-class research questions. It admits
question identity and source provenance, constructs and records status changes
as append-only EAVT witnesses, replays current state, and can project that
state into a science-owned Markdown carrier.

Science owns the question's subject matter and any projected document. This
engineering package owns the representation and operations. Generic witness
journals, artifact fabrication, Markdown creation and writing, and YAML
encoding remain upstream dependencies.

## Question and event operations

`admitResearchQuestion(candidate)` requires a stable lowercase identifier, the
question text, a source locator with a SHA-256 digest, and a UTC creation time.
Admission starts the question in `open` status.

`admitResearchQuestionSet(candidates)` is the collection lift. It admits the
whole array or refuses at the first invalid or duplicate question identity.

`constructResearchQuestionAdmittedEvent(question)` and
`constructResearchQuestionStatusEvent(request)` return ordinary EAVT rows.
Status is restricted to `open`, `partially-addressed`, and `resolved`.
Transitions require a reason, a source locator and digest, and a UTC witness
time.

`appendResearchQuestionEvent(request)` writes through the witness-journal log
service. The package owns this feed address:

```text
data/logs/YYYY/MM/DD/science-questions.jsonl
```

For a status transition, `historyDates` must enumerate every earlier partition
needed to replay that question. An omitted admission is refused. Reappending
the same witnessed event is idempotent.

`readResearchQuestionState(request)` reads the explicitly supplied `dates` and
replays one question. The explicit partitions are necessary because the
upstream witness-journal service does not yet expose a feed-range read.

## Science document projection

`projectResearchQuestionDocument(questionOrState)` creates Markdown through
the upstream Markdown/YAML codec. It includes the question, status, and source
provenance without adding `title`, `type`, `slug`, `defines`, `related`, or a
redundant H1.

`fabricateResearchQuestionDocument(request)` accepts a closed artifact
fabrication specification, requires one projection targeting this package,
performs a create-only Markdown write under `scienceSectionRoot`, and returns
digest-bound realization evidence. The projection configuration carries
exactly `questionId` and `relativePath`.

## Command-line operations

The `question` app composes the singular scripts into subcommands. It reads one
JSON request from stdin, or from the JSON file named after the subcommand, and
prints one JSON result:

```sh
question admit request.json
question admit-set requests.json
question append request.json
question read request.json
question fabricate request.json
```

A typed refusal exits with status 1. A successful result exits with status 0.

## Verification

```sh
npm run check
npm test
```

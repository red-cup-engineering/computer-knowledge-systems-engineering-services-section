# Knowledge-vault computer-system services

This section is the engineering home for reusable code that compiles, composes, validates, renders, or operates knowledge vaults.

- `services/vault-compiler/` detects and compiles house Markdown, Obsidian, and Org vault dialects.
- `apps/cairn/` supplies the reusable headless content-archive CLI and API.
- `apps/geode/` is the independent graphical research application composed from CAIRN, VICTOR, and TUFTE.
- `lib/legacy/` retains superseded implementations and source custody; it is not an active implementation surface.

Research and explanatory material about Markdown as a medium and about Markdown-file vaults belongs in [Markdown science](../../../../../../../../../science-services-section/services/engineering-science-services-section/services/computer-science-services-section/services/markdown-services-section/README.md).
Broader information-science research about knowledge systems belongs in the [knowledge-systems science section](../../../../../../../../../science-services-section/services/information-science-services-section/services/knowledge-services-section/services/knowledge-systems-services-section/).

Situated deployments may live with the corpus or institution they parameterize.
For example, the [Lenticule Science knowledge vault](../../../../../../../../../science-services-section/apps/lenticule-science-knowledge-vault/README.md) supplies science-specific corpus roots, vocabulary, access policy, and deployment topology while importing its reusable compiler and application behavior from this engineering section.

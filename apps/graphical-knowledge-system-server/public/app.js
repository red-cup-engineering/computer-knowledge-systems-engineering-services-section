import { applyTufteFieldErrors, connectTufteDocument } from "./tufte-browser.mjs";

const tufteRoot = document.querySelector("[data-tufte]");
const elements = Object.freeze({
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  documents: document.querySelector("#documents"),
  collections: document.querySelector("#collections"),
  explorer: document.querySelector("#explorer"),
  explorerPath: document.querySelector("#explorer-path"),
  tabs: document.querySelector("#tabs"),
  summary: document.querySelector("#library-summary"),
  note: document.querySelector("#note"),
  properties: document.querySelector("#properties"),
  backlinks: document.querySelector("#backlinks"),
  outgoing: document.querySelector("#outgoing"),
  health: document.querySelector("#health"),
  status: document.querySelector("#status"),
  conceptSummary: document.querySelector("#concept-summary"),
  conceptSummaryStatus: document.querySelector("#concept-summary-status"),
});

const state = {
  workspace: null, currentPath: null, currentNote: null, documents: [], searchResults: [], query: "",
  collection: null, directory: "", tabs: [], history: [], historyIndex: -1, mode: "read",
};

async function request(path, options) {
  const response = await fetch(`${tufteRoot.dataset.apiPrefix ?? ""}${path}`, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `request failed (${response.status})`);
  return value;
}

function clear(element) {
  element.replaceChildren();
}

function listItem(text, path = null) {
  const item = document.createElement("li");
  if (path === null) {
    item.textContent = text;
    return item;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", () => openNote(path));
  item.append(button);
  return item;
}

function collectionFor(path) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "Top level" : path.slice(0, slash);
}

function collectionForEntry(entry) {
  return entry.collection ?? entry.vaultId ?? collectionFor(entry.path);
}

function evidenceFor(entry, query) {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return [];
  if (Array.isArray(entry.evidence) && entry.evidence.length) return entry.evidence.slice(0, 3);
  const candidates = [["title", entry.title], ["path", entry.path], ...(entry.aliases ?? []).map((value) => ["alias", value]), ...(entry.keywords ?? []).map((value) => ["keyword", value]), ...(entry.headings ?? []).map((value) => ["heading", value])];
  return candidates.filter(([, value]) => terms.some((term) => value.toLocaleLowerCase().includes(term))).slice(0, 3);
}

function renderCollections(documents) {
  clear(elements.collections);
  const groups = new Map();
  for (const entry of documents) {
    const collection = collectionForEntry(entry);
    groups.set(collection, (groups.get(collection) ?? 0) + 1);
  }
  if (documents.length === 0) {
    for (const collection of state.workspace.collections ?? []) groups.set(collection.id, collection.documents);
  }
  const choices = [[null, "All notes", documents.length || state.workspace.available || 0], ...[...groups.entries()].sort(([left], [right]) => left.localeCompare(right))];
  const fragment = document.createDocumentFragment();
  for (const [collection, label, count] of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "collection-link";
    button.textContent = `${label} (${count})`;
    button.setAttribute("aria-pressed", String(state.collection === collection));
    button.addEventListener("click", () => {
      state.collection = collection;
      const configured = state.workspace.collections?.find((item) => item.id === collection);
      if (configured && state.workspace.profile === "bare-cedar-fog") loadDirectory(configured.region === "." ? "" : configured.region);
      else renderLibrary();
    });
    fragment.append(button);
  }
  elements.collections.append(fragment);
}

function renderDocumentList(documents) {
  clear(elements.documents);
  const fragment = document.createDocumentFragment();
  for (const entry of documents) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "document-link result-card";
    button.dataset.path = entry.path;
    button.setAttribute("aria-current", entry.path === state.currentPath ? "page" : "false");
    const title = document.createElement("span");
    title.textContent = entry.title;
    const path = document.createElement("small");
    path.textContent = entry.path;
    const meta = document.createElement("small");
    meta.className = "result-meta";
    meta.textContent = entry.vaultId
      ? `${entry.vaultId} · ${entry.generation ?? "current"}${entry.line ? ` · line ${entry.line}` : ""}`
      : `${entry.incoming ?? "?"} backlinks · ${entry.outgoing ?? "?"} outgoing`;
    button.append(title, path, meta);
    const evidence = evidenceFor(entry, state.query);
    if (evidence.length) {
      const matches = document.createElement("small");
      matches.className = "search-evidence";
      matches.textContent = evidence.map((item) => Array.isArray(item) ? `${item[0]}: ${item[1]}` : String(item)).join(" · ");
      button.append(matches);
    }
    button.addEventListener("click", () => openNote(entry.path));
    fragment.append(button);
  }
  elements.documents.append(fragment);
  elements.summary.textContent = state.query
    ? `${documents.length} results matching “${state.query}”`
    : `${(state.workspace.available ?? state.workspace.documents.length).toLocaleString()} notes available`;
}

function renderLibrary() {
  const source = state.searchResults.length || state.query ? state.searchResults : state.documents;
  renderCollections(source);
  const visible = state.collection === null ? source : source.filter((entry) => collectionForEntry(entry) === state.collection);
  elements.documents.hidden = state.query === "";
  elements.explorer.hidden = state.query !== "";
  elements.explorerPath.hidden = state.query !== "";
  renderDocumentList(visible);
}

// The vault root is the shallowest directory the explorer will show. Paths are displayed
// relative to it; the real repository-relative path still rides in entry.path.
function displayPath(listing) {
  const base = listing.vaultRoot ?? "";
  if (!base) return listing.prefix;
  if (listing.prefix === base) return "";
  return listing.prefix.startsWith(`${base}/`) ? listing.prefix.slice(base.length + 1) : listing.prefix;
}

function parentPrefix(listing) {
  const base = listing.vaultRoot ?? "";
  const up = listing.prefix.split("/").slice(0, -1).join("/");
  return base && up.length < base.length ? base : up;
}

function renderExplorer(listing) {
  clear(elements.explorer);
  state.directory = listing.prefix;
  elements.explorerPath.textContent = displayPath(listing) || "Vault root";
  const fragment = document.createDocumentFragment();
  if (listing.prefix !== (listing.vaultRoot ?? "")) {
    const parent = document.createElement("button");
    parent.type = "button";
    parent.className = "explorer-entry";
    parent.innerHTML = "<span>↰</span><span>Parent folder</span><small></small>";
    parent.addEventListener("click", () => loadDirectory(parentPrefix(listing)));
    fragment.append(parent);
  }
  for (const entry of listing.items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "explorer-entry";
    const icon = document.createElement("span");
    icon.textContent = entry.kind === "directory" ? "▸" : "◇";
    const name = document.createElement("span");
    name.textContent = entry.name;
    const count = document.createElement("small");
    count.textContent = entry.kind === "directory" ? entry.count.toLocaleString() : "";
    button.append(icon, name, count);
    button.addEventListener("click", () => entry.kind === "directory" ? loadDirectory(entry.path) : openNote(entry.path));
    fragment.append(button);
  }
  elements.explorer.append(fragment);
  if (listing.truncated) elements.explorerPath.textContent += ` · first ${listing.items.length} of ${listing.total}`;
}

async function loadDirectory(prefix = "") {
  elements.status.textContent = `Opening ${prefix || "vault root"}…`;
  try {
    const listing = await request(`/api/browse?prefix=${encodeURIComponent(prefix)}`);
    renderExplorer(listing);
    elements.status.textContent = `${listing.total.toLocaleString()} items in ${displayPath(listing) || "vault root"}`;
  } catch (error) {
    elements.status.textContent = error.message;
  }
}

function renderTabs() {
  clear(elements.tabs);
  for (const tab of state.tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-tab";
    button.textContent = tab.title;
    button.title = tab.path;
    button.setAttribute("aria-current", tab.path === state.currentPath ? "page" : "false");
    button.addEventListener("click", () => openNote(tab.path));
    elements.tabs.append(button);
  }
}

function appendDefinition(list, term, value) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = typeof value === "string" ? value : JSON.stringify(value);
  list.append(dt, dd);
}

function conceptSlugsFrom(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => typeof item === "string" && item.trim() !== "");
}

// A frontmatter relation (defines, depends-on, specialization, …) names one or more concepts.
// Render each as a real button through to the concept view rather than inert text.
function appendConceptProperty(list, term, value) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  const slugs = conceptSlugsFrom(value);
  if (slugs.length === 0) {
    dd.textContent = typeof value === "string" ? value : JSON.stringify(value);
  } else {
    slugs.forEach((slug, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "concept-link";
      button.textContent = slug;
      button.addEventListener("click", () => openConcept(slug));
      dd.append(button);
      if (index < slugs.length - 1) dd.append(document.createTextNode(", "));
    });
  }
  list.append(dt, dd);
}

function renderProperties(properties, relationKeys = []) {
  clear(elements.properties);
  const relations = new Set(relationKeys);
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) return appendDefinition(elements.properties, "Status", "No frontmatter");
  for (const [key, value] of entries) {
    if (relations.has(key)) appendConceptProperty(elements.properties, key, value);
    else appendDefinition(elements.properties, key, value);
  }
}

function renderBacklinkList(entries, unresolved) {
  clear(elements.backlinks);
  if (entries.length === 0 && unresolved.length === 0) return elements.backlinks.append(listItem("No backlinks"));
  for (const backlink of entries) {
    elements.backlinks.append(listItem(`${backlink.sourcePath} · ${backlink.kind}`, backlink.sourcePath));
  }
  // A mention in link position that resolves elsewhere is evidence about this document without
  // being a link to it. Showing it as its own kind keeps the backlink list a list of real edges.
  for (const mention of unresolved) {
    elements.backlinks.append(listItem(`${mention.sourcePath} · names "${mention.target}" · ${mention.status}`, mention.sourcePath));
  }
}

/** Backlinks arrive after the document, so the pane says it is working rather than "none". */
async function loadRelations(path) {
  elements.backlinks.append(listItem("Searching the vault…"));
  try {
    const found = await request(`/api/relations?path=${encodeURIComponent(path)}`);
    if (state.currentNote?.path !== path) return;
    renderBacklinkList(found.backlinks, found.unresolved);
    renderOutgoing(found.outgoing);
    elements.status.textContent = `${found.outgoing.length} outgoing · ${found.backlinks.length} backlinks`;
    if (!found.complete) {
      elements.backlinks.append(listItem(found.truncated
        ? "Relations cover the admitted portion of this vault."
        : "Some document metadata could not be read; relations may be incomplete."));
    }
    for (const diagnostic of found.diagnostics ?? []) {
      elements.backlinks.append(listItem(`${diagnostic.path}: ${diagnostic.message}`));
    }
  } catch (error) {
    if (state.currentNote?.path !== path) return;
    clear(elements.backlinks);
    elements.backlinks.append(listItem(`Backlinks unavailable: ${error.message}`));
  }
}

function renderOutgoing(outgoing) {
  clear(elements.outgoing);
  if (outgoing.length === 0) elements.outgoing.append(listItem("No outgoing relations"));
  for (const edge of outgoing) {
    const label = `${edge.target} · ${edge.kind} · ${edge.status}`;
    elements.outgoing.append(listItem(label, edge.status === "resolved" ? edge.targetPath : null));
  }
}

function renderRelations(note) {
  clear(elements.backlinks);
  clear(elements.outgoing);
  if (note.relationsDeferred || !note.relationsComplete) {
    elements.outgoing.append(listItem("Reading document relations…"));
    loadRelations(note.path);
  } else {
    renderBacklinkList(note.backlinks, []);
    renderOutgoing(note.outgoing);
  }
}

function documentList(paths, emptyText) {
  const ul = document.createElement("ul");
  if (paths.length === 0) {
    ul.append(listItem(emptyText));
    return ul;
  }
  for (const path of paths) ul.append(listItem(path, path));
  return ul;
}

function conceptButton(name) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "concept-link";
  button.textContent = name;
  button.addEventListener("click", () => openConcept(name));
  return button;
}

function witnessColumn(title, witnesses) {
  const column = document.createElement("div");
  column.className = "witness-column";
  const heading = document.createElement("h4");
  heading.textContent = title;
  column.append(heading);
  if (witnesses.length === 0) {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = "No witnesses";
    column.append(none);
    return column;
  }
  for (const witness of witnesses) {
    const relation = document.createElement("p");
    relation.className = "witness-relation";
    relation.textContent = witness.relation;
    column.append(relation, documentList(witness.documents, "No documents"));
  }
  return column;
}

// Held cells are the point: a cell the corpus witnesses both positively and negatively — e.g.
// total-order is a specialization of partial-order AND contrasts-with it, both correct. This is
// rendered as a finding (paired witnesses side by side), never as a warning or error.
function renderHeldCells(held) {
  const section = document.createElement("section");
  section.className = "concept-held";
  section.id = "concept-held";
  const heading = document.createElement("h2");
  heading.textContent = held.length ? `Held cells (${held.length})` : "Held cells";
  section.append(heading);
  if (held.length === 0) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "No held cells for this concept — every relation it carries points one way.";
    section.append(note);
    return section;
  }
  const intro = document.createElement("p");
  intro.className = "held-intro";
  intro.textContent = "The corpus witnesses both sides of these cells. Both witnesses are correct — this is a finding, not something to resolve.";
  section.append(intro);
  for (const cell of held) {
    const article = document.createElement("article");
    article.className = "held-cell";
    const title = document.createElement("h3");
    title.append(conceptButton(cell.from), document.createTextNode(" ↔ "), conceptButton(cell.to));
    const columns = document.createElement("div");
    columns.className = "held-witnesses";
    columns.append(witnessColumn("Witnessed positively", cell.positive), witnessColumn("Witnessed negatively", cell.negative));
    article.append(title, columns);
    section.append(article);
  }
  return section;
}

// Group a side's cells by relation name rather than merging every target/source into one
// undifferentiated list. `side` selects whether the cell's other end is displayed as its
// target (outgoing) or its source (incoming).
function groupCellsByRelation(cells, side) {
  const groups = new Map();
  for (const cell of cells) {
    const other = side === "outgoing" ? cell.to : cell.from;
    for (const witness of cell.positive) {
      if (!groups.has(witness.relation)) groups.set(witness.relation, []);
      groups.get(witness.relation).push({ other, polarity: "positive", documents: witness.documents, held: cell.held });
    }
    for (const witness of cell.negative) {
      if (!groups.has(witness.relation)) groups.set(witness.relation, []);
      groups.get(witness.relation).push({ other, polarity: "negative", documents: witness.documents, held: cell.held });
    }
  }
  return groups;
}

function renderRelationGroups(title, containerId, cells, side) {
  const section = document.createElement("section");
  section.className = "concept-relations";
  section.id = containerId;
  const heading = document.createElement("h2");
  heading.textContent = `${title} (${cells.length})`;
  section.append(heading);
  const groups = groupCellsByRelation(cells, side);
  if (groups.size === 0) {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = `No ${title.toLocaleLowerCase()}`;
    section.append(none);
    return section;
  }
  for (const relation of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
    const group = document.createElement("div");
    group.className = "relation-group";
    const relationHeading = document.createElement("h3");
    relationHeading.textContent = relation;
    group.append(relationHeading);
    const ul = document.createElement("ul");
    for (const item of groups.get(relation)) {
      const li = document.createElement("li");
      li.className = `relation-item polarity-${item.polarity}`;
      li.append(conceptButton(item.other));
      const polarity = document.createElement("span");
      polarity.className = "polarity-label";
      polarity.textContent = item.polarity === "positive" ? "positive witness" : "negative witness";
      li.append(polarity);
      if (item.held) {
        const heldFlag = document.createElement("button");
        heldFlag.type = "button";
        heldFlag.className = "held-flag";
        heldFlag.textContent = "held — see above";
        heldFlag.addEventListener("click", () => document.querySelector("#concept-held")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        li.append(heldFlag);
      }
      li.append(documentList(item.documents, "No documents"));
      ul.append(li);
    }
    group.append(ul);
    section.append(group);
  }
  return section;
}

/** Distinguish contested (several documents claim to define this concept) from held (one cell
 * with evidence pointing both ways) — conflating them overstates held by two orders of magnitude. */
function renderConcept(concept) {
  document.title = `${concept.name} · Concept · GEODE`;
  elements.note.replaceChildren();

  const header = document.createElement("header");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Concept";
  const title = document.createElement("h1");
  title.textContent = concept.name;
  header.append(eyebrow, title);
  if (state.currentPath) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "concept-back";
    back.textContent = `← Back to ${state.currentNote?.title ?? state.currentPath}`;
    back.addEventListener("click", () => openNote(state.currentPath));
    header.append(back);
  }

  const status = document.createElement("section");
  status.className = "concept-status";
  const statusList = document.createElement("dl");
  appendDefinition(statusList, "Known", concept.known ? "Yes" : "Not yet named by any document in the corpus");
  appendDefinition(statusList, "Contested", concept.contested
    ? `Yes — ${concept.definedBy.length} documents define this concept`
    : "No — at most one document defines this concept");
  status.append(statusList);

  const held = renderHeldCells(concept.held);

  const defined = document.createElement("section");
  defined.className = "concept-defined";
  const definedHeading = document.createElement("h2");
  definedHeading.textContent = `Defined by (${concept.definedBy.length})`;
  defined.append(definedHeading, documentList(concept.definedBy, "Not directly defined by any document"));

  const outgoing = renderRelationGroups("Outgoing relations", "concept-outgoing", concept.outgoing, "outgoing");
  const incoming = renderRelationGroups("Incoming relations", "concept-incoming", concept.incoming, "incoming");

  const diagram = document.createElement("section");
  diagram.className = "concept-diagram-section";
  const diagramHeading = document.createElement("h2");
  diagramHeading.textContent = "Diagram";
  const diagramContainer = document.createElement("div");
  diagramContainer.id = "concept-diagram";
  diagramContainer.className = "concept-diagram";
  diagram.append(diagramHeading, diagramContainer);

  elements.note.append(header, status, held, defined, outgoing, incoming, diagram);
  elements.note.focus();
}

async function openConcept(name) {
  elements.status.textContent = `Opening concept ${name}…`;
  try {
    const concept = await request(`/api/concept?name=${encodeURIComponent(name)}`);
    renderConcept(concept);
    elements.status.textContent = concept.known
      ? `${concept.definedBy.length} definition${concept.definedBy.length === 1 ? "" : "s"} · ${concept.outgoing.length} outgoing · ${concept.incoming.length} incoming${concept.held.length ? ` · ${concept.held.length} held` : ""}`
      : `“${name}” is not yet named by any document in the corpus`;
  } catch (error) {
    elements.status.textContent = error.message;
  }
}

/** /api/concepts reads every carrier's frontmatter on first call (~45s); later calls are
 * instant. Say what is happening and that it happens once — never appear frozen. */
async function loadConceptSummary() {
  elements.conceptSummaryStatus.textContent = "Indexing concepts across the corpus — first call only, can take about 45 seconds…";
  try {
    const summary = await request("/api/concepts");
    clear(elements.conceptSummary);
    appendDefinition(elements.conceptSummary, "Concepts", summary.concepts.toLocaleString());
    appendDefinition(elements.conceptSummary, "Cells", summary.cells.toLocaleString());
    appendDefinition(elements.conceptSummary, "Held", summary.held.toLocaleString());
    appendDefinition(elements.conceptSummary, "Contested", summary.contested.toLocaleString());
    elements.conceptSummaryStatus.textContent = `Indexed ${summary.concepts.toLocaleString()} concepts across ${summary.documents.toLocaleString()} documents`;
    return summary;
  } catch (error) {
    elements.conceptSummaryStatus.textContent = `Concept index unavailable: ${error.message}`;
    throw error;
  }
}

function resolveRelativeLink(sourcePath, href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(href)) return null;
  const pathname = new URL(href, `https://geode.invalid/${sourcePath}`).pathname.slice(1);
  return decodeURIComponent(pathname);
}

function rememberNote(note, recordHistory) {
  if (!state.tabs.some((tab) => tab.path === note.path)) {
    state.tabs.push({ path: note.path, title: note.title });
    if (state.tabs.length > 8) state.tabs.shift();
  } else {
    state.tabs = state.tabs.map((tab) => tab.path === note.path ? { path: note.path, title: note.title } : tab);
  }
  if (recordHistory && state.history[state.historyIndex] !== note.path) {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(note.path);
    state.historyIndex = state.history.length - 1;
  }
}

async function openNote(path, { recordHistory = true } = {}) {
  elements.status.textContent = `Opening ${path}…`;
  try {
    const note = await request(`/api/note?path=${encodeURIComponent(path)}`);
    rememberNote(note, recordHistory);
    renderNote(note);
    elements.status.textContent = note.relationsDeferred
      ? "Reading document relations…"
      : `${note.outgoing.length} outgoing · ${note.backlinks.length} backlinks`;
  } catch (error) {
    elements.status.textContent = error.message;
  }
}

function renderNote(note) {
    state.currentNote = note;
    state.currentPath = note.path;
    document.title = `${note.title} · GEODE`;
    elements.note.replaceChildren();
    const header = document.createElement("header");
    const toolbar = document.createElement("div");
    toolbar.className = "note-toolbar";
    const historyControls = document.createElement("div");
    historyControls.className = "note-toolbar-group";
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "←";
    back.title = "Previous note";
    back.disabled = state.historyIndex <= 0;
    back.addEventListener("click", () => {
      if (state.historyIndex <= 0) return;
      state.historyIndex -= 1;
      openNote(state.history[state.historyIndex], { recordHistory: false });
    });
    const forward = document.createElement("button");
    forward.type = "button";
    forward.textContent = "→";
    forward.title = "Next note";
    forward.disabled = state.historyIndex >= state.history.length - 1;
    forward.addEventListener("click", () => {
      if (state.historyIndex >= state.history.length - 1) return;
      state.historyIndex += 1;
      openNote(state.history[state.historyIndex], { recordHistory: false });
    });
    historyControls.append(back, forward);
    const modes = document.createElement("div");
    modes.className = "note-toolbar-group";
    const readingMode = document.createElement("button");
    readingMode.type = "button";
    readingMode.textContent = "Reading";
    readingMode.setAttribute("aria-pressed", String(state.mode === "read"));
    const editingMode = document.createElement("button");
    editingMode.type = "button";
    editingMode.textContent = "Edit";
    editingMode.setAttribute("aria-pressed", String(state.mode === "edit"));
    modes.append(readingMode, editingMode);
    toolbar.append(historyControls, modes);
    const breadcrumbs = document.createElement("nav");
    breadcrumbs.className = "breadcrumbs";
    breadcrumbs.setAttribute("aria-label", "Note location");
    const parts = note.path.split("/");
    parts.forEach((part, index) => {
      const crumb = document.createElement("span");
      crumb.textContent = part;
      breadcrumbs.append(crumb);
      if (index < parts.length - 1) breadcrumbs.append(document.createTextNode(" / "));
    });
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = note.path;
    const title = document.createElement("h1");
    title.textContent = note.title;
    header.append(toolbar, breadcrumbs, eyebrow, title);
    const article = document.createElement("article");
    article.className = "markdown-body";
    // The local kernel renders and escapes Markdown; scripts and raw HTML are not admitted.
    article.innerHTML = note.html;
    article.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const target = resolveRelativeLink(note.path, link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      openNote(target);
    });
    const editor = document.createElement("section");
    editor.id = "note-editor";
    editor.className = "tufte-tile note-editor";
    editor.dataset.role = "now";
    editor.dataset.lifecycle = "present";
    editor.setAttribute("aria-labelledby", "note-editor-title");
    const editorHeader = document.createElement("header");
    const editorTitle = document.createElement("h2");
    editorTitle.id = "note-editor-title";
    editorTitle.textContent = "Edit Markdown";
    editorHeader.append(editorTitle);
    const editorBody = document.createElement("div");
    editorBody.className = "tufte-tile-body";
    // Generated by TUFTE from normalized form data; application Markdown never becomes this HTML.
    editorBody.innerHTML = note.editor.html;
    editor.append(editorHeader, editorBody);
    const applyMode = (mode) => {
      state.mode = mode;
      article.hidden = mode !== "read";
      editor.hidden = mode !== "edit";
      readingMode.setAttribute("aria-pressed", String(mode === "read"));
      editingMode.setAttribute("aria-pressed", String(mode === "edit"));
      if (mode === "edit") editor.querySelector("textarea")?.focus();
    };
    readingMode.addEventListener("click", () => applyMode("read"));
    editingMode.addEventListener("click", () => applyMode("edit"));
    applyMode(state.mode);
    elements.note.append(header, article, editor);
    renderProperties(note.properties, note.relationKeys);
    renderRelations(note);
    renderLibrary();
    renderTabs();
    elements.note.focus();
}

function renderHealth(workspace) {
  clear(elements.health);
  appendDefinition(elements.health, "Notes", workspace.available ?? workspace.documents.length);
  if (workspace.profile) appendDefinition(elements.health, "Profile", workspace.profile);
  appendDefinition(elements.health, "Relations", workspace.graph.edges ?? `derived ${workspace.graph.derivation ?? "on demand"}`);
  if (workspace.graph.diagnostics.dangling !== null) appendDefinition(elements.health, "Dangling", workspace.graph.diagnostics.dangling);
  if (workspace.graph.diagnostics.ambiguous !== null) appendDefinition(elements.health, "Ambiguous", workspace.graph.diagnostics.ambiguous);
  appendDefinition(elements.health, "Truncated", workspace.truncated ? "yes" : "no");
}

async function loadWorkspace({ preservePath = true } = {}) {
  state.workspace = await request("/api/workspace");
  state.documents = state.workspace.documents;
  state.searchResults = [];
  state.query = "";
  state.collection = null;
  renderLibrary();
  renderHealth(state.workspace);
  elements.status.textContent = `Observed ${(state.workspace.available ?? state.workspace.documents.length).toLocaleString()} Markdown notes`;
  await loadDirectory(state.directory);
  if (preservePath && state.currentPath && (state.workspace.profile === "bare-cedar-fog" || state.workspace.documents.some((entry) => entry.path === state.currentPath))) {
    await openNote(state.currentPath);
  } else if (state.workspace.documents[0]) {
    await openNote(state.workspace.documents[0].path);
  }
}

let searchGeneration = 0;
let searchTimer;
elements.search.addEventListener("input", () => {
  const generation = ++searchGeneration;
  clearTimeout(searchTimer);
  const query = elements.search.value.trim();
  if (query === "") {
    state.searchResults = [];
    state.query = "";
    state.collection = null;
    renderLibrary();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      elements.status.textContent = `Searching for ${query}…`;
      const result = await request(`/api/search?q=${encodeURIComponent(query)}`);
      if (generation !== searchGeneration) return;
      state.searchResults = result.results;
      state.query = query;
      state.collection = null;
      renderLibrary();
      elements.status.textContent = `${result.results.length} results for ${query}`;
    } catch (error) {
      elements.status.textContent = error.message;
    }
  }, 180);
});

elements.refresh.addEventListener("click", async () => {
  elements.refresh.disabled = true;
  elements.status.textContent = "Refreshing vault…";
  try {
    await request("/api/refresh", { method: "POST" });
    await loadWorkspace();
  } catch (error) {
    elements.status.textContent = error.message;
  } finally {
    elements.refresh.disabled = false;
  }
});

connectTufteDocument(tufteRoot);

tufteRoot.addEventListener("tufte:action", (event) => {
  if (event.detail?.action !== "geode.note.replace") return;
  elements.status.textContent = `Saving ${event.detail.value?.path ?? "note"}…`;
  const form = elements.note.querySelector("#note-editor-form");
  if (form) for (const control of form.elements) control.disabled = true;
});

tufteRoot.addEventListener("tufte:receipt", (event) => {
  const receipt = event.detail;
  if (receipt?.type !== "GeodeActionReceipt" || receipt.action !== "geode.note.replace") return;
  state.workspace = receipt.workspace;
  state.documents = receipt.workspace.documents;
  state.searchResults = [];
  state.query = "";
  state.collection = null;
  renderLibrary();
  renderHealth(receipt.workspace);
  renderNote(receipt.note);
  elements.status.textContent = receipt.changed
    ? `Saved ${receipt.path} · ${receipt.bytes} bytes`
    : `${receipt.path} was already current`;
});

tufteRoot.addEventListener("tufte:refusal", (event) => {
  const tile = event.detail?.tile;
  const form = elements.note.querySelector("#note-editor-form");
  if (form) {
    for (const control of form.elements) control.disabled = false;
    applyTufteFieldErrors(form, tile);
  }
  elements.status.textContent = tile?.content ?? event.detail?.message ?? "Edit refused";
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    elements.search.focus();
    elements.search.select();
  }
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
});

loadWorkspace().catch((error) => {
  elements.status.textContent = error.message;
});

// Runs independently of the workspace load — the concept index is a separate, slower subsystem
// and must not block or delay note browsing.
loadConceptSummary().catch(() => {});

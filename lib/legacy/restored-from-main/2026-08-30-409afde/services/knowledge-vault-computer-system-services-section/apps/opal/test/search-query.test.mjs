import assert from "node:assert/strict";
import test from "node:test";
import {
  SearchQueryParseError,
  executeSearchQuery,
  parseSearchQuery,
  planSearchQuery,
} from "../src/search-query.mjs";

// A small in-memory ripgrep stand-in: pass query text to a fixed match table, so plans can be
// executed without touching a real corpus or shelling out.
function fakeSearch(table) {
  return async ({ query }) => table[query] ?? [];
}

const NO_PATHS = async () => [];
const NO_FRONTMATTER = async () => null;

test("boolean precedence: OR binds looser than AND", () => {
  // "a OR b AND c" must read as "a OR (b AND c)", not "(a OR b) AND c".
  const tree = parseSearchQuery("a OR b AND c");
  assert.equal(tree.type, "or");
  assert.equal(tree.clauses.length, 2);
  assert.deepEqual(tree.clauses[0], { type: "term", value: "a", quoted: false });
  assert.equal(tree.clauses[1].type, "and");
  assert.deepEqual(tree.clauses[1].clauses.map((c) => c.value), ["b", "c"]);
});

test("parentheses override precedence", () => {
  const tree = parseSearchQuery("(a OR b) AND c");
  assert.equal(tree.type, "and");
  assert.equal(tree.clauses[0].type, "or");
  assert.deepEqual(tree.clauses[0].clauses.map((c) => c.value), ["a", "b"]);
  assert.deepEqual(tree.clauses[1], { type: "term", value: "c", quoted: false });
});

test("adjacent terms combine with an implicit AND, same as writing AND", () => {
  assert.deepEqual(parseSearchQuery("foo bar"), parseSearchQuery("foo AND bar"));
});

test("NOT binds tighter than AND and OR, and '-' is shorthand for NOT", () => {
  const withKeyword = parseSearchQuery("a AND NOT b");
  const withMinus = parseSearchQuery("a AND -b");
  assert.deepEqual(withKeyword, withMinus);
  assert.equal(withKeyword.clauses[1].type, "not");
  assert.deepEqual(withKeyword.clauses[1].clause, { type: "term", value: "b", quoted: false });
});

test("lowercase 'and'/'or'/'not' are literal words, not operators", () => {
  const tree = parseSearchQuery("cat and dog");
  // Two implicit-AND'd literal words: "and" is not the AND keyword in lowercase.
  assert.equal(tree.type, "and");
  assert.deepEqual(tree.clauses.map((c) => c.value), ["cat", "and", "dog"]);
});

test("a phrase with spaces parses as one quoted term", () => {
  const tree = parseSearchQuery('"black liberation" AND sovereignty');
  assert.deepEqual(tree.clauses[0], { type: "term", value: "black liberation", quoted: true });
});

test("a regex literal parses with its pattern and admits the 'i' flag", () => {
  const tree = parseSearchQuery("/lakota|sioux/i");
  assert.deepEqual(tree, { type: "regex", pattern: "lakota|sioux", flags: "i" });
});

test("an unsupported regex flag is a precise parse error", () => {
  assert.throws(() => parseSearchQuery("/foo/g"), (error) => {
    assert.ok(error instanceof SearchQueryParseError);
    assert.match(error.reason, /unsupported regex flag 'g'/u);
    assert.equal(error.position, 5);
    return true;
  });
});

test("each field operator parses: path:, file:, tag:, [key: value]", () => {
  assert.deepEqual(parseSearchQuery("path:notes/2026"), { type: "field", field: "path", value: "notes/2026" });
  assert.deepEqual(parseSearchQuery("file:README.md"), { type: "field", field: "file", value: "README.md" });
  assert.deepEqual(parseSearchQuery("tag:project"), { type: "field", field: "tag", value: "project" });
  assert.deepEqual(parseSearchQuery("[status: draft]"), { type: "property", key: "status", value: "draft" });
});

test("line: and section: parse a parenthesized co-occurrence sub-query", () => {
  const line = parseSearchQuery("line:(dog cat)");
  assert.equal(line.type, "line");
  assert.equal(line.clause.type, "and");
  assert.deepEqual(line.clause.clauses.map((c) => c.value), ["dog", "cat"]);

  const section = parseSearchQuery("section:(alpha OR beta)");
  assert.equal(section.type, "section");
  assert.equal(section.clause.type, "or");
});

test("NOT is refused inside line:/section: scope with a precise position", () => {
  assert.throws(() => parseSearchQuery("line:(dog NOT cat)"), (error) => {
    assert.ok(error instanceof SearchQueryParseError);
    assert.match(error.reason, /NOT is not supported inside line:\/section: scope/u);
    assert.equal(error.position, "line:(dog ".length);
    return true;
  });
  assert.throws(() => parseSearchQuery("section:(-draft)"), (error) => {
    assert.ok(error instanceof SearchQueryParseError);
    assert.match(error.reason, /NOT is not supported/u);
    return true;
  });
});

test("path:/file:/[key: value] are refused inside line:/section: scope", () => {
  assert.throws(() => parseSearchQuery("line:(path:foo bar)"), (error) => {
    assert.ok(error instanceof SearchQueryParseError);
    assert.match(error.reason, /not meaningful inside line:\/section: scope/u);
    return true;
  });
  assert.throws(() => parseSearchQuery("section:([status: draft] bar)"), SearchQueryParseError);
});

test("parse errors are precise and point at the offending position", () => {
  assert.throws(() => parseSearchQuery('"unterminated'), (error) => {
    assert.ok(error instanceof SearchQueryParseError);
    assert.equal(error.position, 0);
    assert.match(error.message, /unterminated quoted phrase at position 0/u);
    return true;
  });
  assert.throws(() => parseSearchQuery("a AND (b"), (error) => {
    assert.equal(error.position, "a AND (b".length);
    assert.match(error.reason, /expected '\)'/u);
    return true;
  });
  assert.throws(() => parseSearchQuery("a)"), (error) => {
    assert.equal(error.position, 1);
    return true;
  });
  assert.throws(() => parseSearchQuery(""), (error) => {
    assert.ok(error instanceof SearchQueryParseError);
    assert.equal(error.position, 0);
    assert.match(error.reason, /empty/u);
    return true;
  });
});

test("a non-string query is a TypeError, not a parse error", () => {
  assert.throws(() => parseSearchQuery(42), TypeError);
});

test("the plan names its ripgrep passes and deduplicates identical ones", () => {
  const plan = planSearchQuery(parseSearchQuery("foo AND (foo OR bar)"));
  assert.equal(plan.type, "OpalSearchQueryPlan");
  assert.ok(Array.isArray(plan.passes));
  // "foo" appears twice in the query but is one supplier pass.
  const queries = plan.passes.map((pass) => pass.query);
  assert.deepEqual(queries, ["foo", "bar"]);
  for (const pass of plan.passes) {
    assert.equal(pass.kind, "ripgrep");
    assert.equal(typeof pass.query, "string");
    assert.equal(typeof pass.regularExpression, "boolean");
    assert.equal(typeof pass.caseSensitive, "boolean");
  }
  assert.ok(plan.notes.length > 0, "the plan explains itself");
});

test("the plan discloses when a full path-universe scan is required, and why", () => {
  const withoutFields = planSearchQuery(parseSearchQuery("foo AND bar"));
  assert.equal(withoutFields.requiresPathUniverse, false);
  assert.equal(withoutFields.universeReason, null);

  const withPath = planSearchQuery(parseSearchQuery("path:notes"));
  assert.equal(withPath.requiresPathUniverse, true);
  assert.match(withPath.universeReason, /post-filter over paths/u);

  const withNot = planSearchQuery(parseSearchQuery("foo AND NOT bar"));
  assert.equal(withNot.requiresPathUniverse, true);
  assert.match(withNot.universeReason, /subtracting/u);
});

test("the plan adds one heading-boundary pass for section:, and none otherwise", () => {
  const withSection = planSearchQuery(parseSearchQuery("section:(a b)"));
  assert.ok(withSection.headingsPassId);
  assert.ok(withSection.passes.some((pass) => pass.purpose === "heading-boundary"));

  const withLine = planSearchQuery(parseSearchQuery("line:(a b)"));
  assert.equal(withLine.headingsPassId, null);
  assert.equal(withLine.passes.some((pass) => pass.purpose === "heading-boundary"), false);
});

test("every result carries the clause(s) that matched it, where, and with what evidence", async () => {
  const plan = planSearchQuery(parseSearchQuery('foo AND "black liberation"'));
  const search = fakeSearch({
    foo: [{ path: "a.md", line: 3, column: 1, text: "foo appears here" }],
    "black liberation": [{ path: "a.md", line: 7, column: 5, text: "the pursuit of black liberation" }],
  });
  const [result] = await executeSearchQuery({ plan, search, paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER });
  assert.equal(result.path, "a.md");
  assert.equal(result.matches.length, 2);
  const byValue = Object.fromEntries(result.matches.map((m) => [m.clause.value, m]));
  assert.equal(byValue.foo.kind, "content");
  assert.deepEqual(byValue.foo.evidence[0], { path: "a.md", line: 3, column: 1, text: "foo appears here" });
  assert.equal(byValue["black liberation"].clause.quoted, true);
  assert.deepEqual(byValue["black liberation"].evidence[0].text, "the pursuit of black liberation");
});

test("AND intersects by document; OR unions and keeps every branch's evidence", async () => {
  const plan = planSearchQuery(parseSearchQuery("foo AND bar"));
  const search = fakeSearch({
    foo: [{ path: "a.md", line: 1, column: 1, text: "foo" }, { path: "b.md", line: 1, column: 1, text: "foo" }],
    bar: [{ path: "a.md", line: 2, column: 1, text: "bar" }],
  });
  const results = await executeSearchQuery({ plan, search, paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(results.map((r) => r.path), ["a.md"], "b.md matched only one of the two AND clauses");

  const orPlan = planSearchQuery(parseSearchQuery("foo OR bar"));
  const orResults = await executeSearchQuery({ plan: orPlan, search, paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(orResults.map((r) => r.path).sort(), ["a.md", "b.md"]);
  const aResult = orResults.find((r) => r.path === "a.md");
  assert.equal(aResult.matches.length, 2, "a.md matched both OR branches and keeps both as evidence");
});

test("NOT is answered by subtracting from the full candidate universe, not approximated", async () => {
  const plan = planSearchQuery(parseSearchQuery("foo AND NOT bar"));
  let universeCalls = 0;
  const paths = async () => { universeCalls += 1; return ["a.md", "b.md", "c.md"]; };
  const search = fakeSearch({
    foo: [
      { path: "a.md", line: 1, column: 1, text: "foo" },
      { path: "b.md", line: 1, column: 1, text: "foo" },
    ],
    // "bar" never matches c.md, and c.md never matched "foo" either — it must not appear.
    bar: [{ path: "b.md", line: 2, column: 1, text: "bar" }],
  });
  const results = await executeSearchQuery({ plan, search, paths, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(results.map((r) => r.path), ["a.md"]);
  assert.equal(universeCalls, 1, "the path universe is fetched once and shared, not once per candidate");
  const notMatch = results[0].matches.find((m) => m.kind === "not");
  assert.ok(notMatch, "the surviving result explains itself via the NOT clause");
  assert.deepEqual(notMatch.clause, { type: "term", value: "bar", quoted: false });
});

test("NOT alone (unanchored by any positive clause) still needs the universe to know what's absent", async () => {
  const plan = planSearchQuery(parseSearchQuery("NOT bar"));
  const paths = async () => ["a.md", "b.md"];
  const search = fakeSearch({ bar: [{ path: "b.md", line: 1, column: 1, text: "bar" }] });
  const results = await executeSearchQuery({ plan, search, paths, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(results.map((r) => r.path), ["a.md"]);
});

test("path: and file: are post-filters over the admitted path universe, matching substrings or a * glob", async () => {
  const plan = planSearchQuery(parseSearchQuery("path:notes/2026 AND file:*.md"));
  const paths = async () => ["notes/2026/a.md", "notes/2025/b.md", "notes/2026/c.txt"];
  const results = await executeSearchQuery({ plan, search: fakeSearch({}), paths, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(results.map((r) => r.path), ["notes/2026/a.md"]);
  assert.equal(results[0].matches.find((m) => m.kind === "path").evidence[0].matched, "notes/2026/a.md");
  assert.equal(results[0].matches.find((m) => m.kind === "file").evidence[0].matched, "a.md");
});

test("tag: matches inline #mentions and frontmatter tags/keywords alike, each with its own evidence kind", async () => {
  const plan = planSearchQuery(parseSearchQuery("tag:project"));
  const paths = async () => ["inline.md", "frontmatter.md", "neither.md"];
  const search = fakeSearch({ "#project\\b": [{ path: "inline.md", line: 2, column: 1, text: "see #project here" }] });
  const readFrontmatter = async (path) => (path === "frontmatter.md" ? { tags: ["Project"] } : null);
  const results = await executeSearchQuery({ plan, search, paths, readFrontmatter });
  assert.deepEqual(results.map((r) => r.path).sort(), ["frontmatter.md", "inline.md"]);
  assert.equal(results.find((r) => r.path === "inline.md").matches[0].kind, "tag-inline");
  assert.equal(results.find((r) => r.path === "frontmatter.md").matches[0].kind, "tag-frontmatter");
});

test("[key: value] reads frontmatter and matches scalar or array properties case-insensitively", async () => {
  const plan = planSearchQuery(parseSearchQuery("[status: Draft]"));
  const paths = async () => ["a.md", "b.md", "c.md"];
  const readFrontmatter = async (path) => {
    if (path === "a.md") return { status: "draft" };
    if (path === "b.md") return { status: ["review", "DRAFT"] };
    return { status: "final" };
  };
  const results = await executeSearchQuery({ plan, search: fakeSearch({}), paths, readFrontmatter });
  assert.deepEqual(results.map((r) => r.path).sort(), ["a.md", "b.md"]);
  assert.equal(results.find((r) => r.path === "a.md").matches[0].evidence[0].value, "draft");
});

test("line: requires clauses to land on the identical physical line, not just the same document", async () => {
  const plan = planSearchQuery(parseSearchQuery("line:(dog cat)"));
  const search = fakeSearch({
    dog: [
      { path: "x.md", line: 5, column: 1, text: "a dog runs" },
      { path: "y.md", line: 10, column: 1, text: "dog only" },
    ],
    cat: [
      { path: "x.md", line: 5, column: 5, text: "a dog runs, cat too" },
      { path: "y.md", line: 11, column: 1, text: "cat on a different line" },
    ],
  });
  const results = await executeSearchQuery({ plan, search, paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(results.map((r) => r.path), ["x.md"], "y.md's dog and cat are on different lines");
  const grouped = results[0].matches[0];
  assert.equal(grouped.kind, "line");
  assert.equal(grouped.evidence[0].line, 5);
  assert.equal(grouped.evidence[0].matches.length, 2, "both co-occurring leaves are kept as nested evidence");
});

test("section: requires clauses to land under the same nearest-preceding heading", async () => {
  const plan = planSearchQuery(parseSearchQuery("section:(alpha beta)"));
  const search = async ({ query }) => {
    if (query.startsWith("^#")) {
      return [
        { path: "doc.md", line: 1, column: 1, text: "# Intro" },
        { path: "doc.md", line: 5, column: 1, text: "## Second" },
      ];
    }
    if (query === "alpha") return [{ path: "doc.md", line: 3, column: 1, text: "alpha term" }]; // under Intro
    if (query === "beta") return [{ path: "doc.md", line: 6, column: 1, text: "beta term" }]; // under Second
    return [];
  };
  const apart = await executeSearchQuery({ plan, search, paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(apart, [], "alpha and beta fall in different sections");

  const searchTogether = async ({ query }) => {
    if (query.startsWith("^#")) return [{ path: "doc.md", line: 1, column: 1, text: "# Intro" }];
    if (query === "alpha") return [{ path: "doc.md", line: 3, column: 1, text: "alpha term" }];
    if (query === "beta") return [{ path: "doc.md", line: 4, column: 1, text: "beta term" }];
    return [];
  };
  const together = await executeSearchQuery({ plan, search: searchTogether, paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER });
  assert.deepEqual(together.map((r) => r.path), ["doc.md"]);
  assert.equal(together[0].matches[0].evidence[0].sectionStart, 1);
});

test("results and the plan both survive serialisation and stay frozen", async () => {
  const plan = planSearchQuery(parseSearchQuery("foo AND NOT bar"));
  assert.throws(() => { plan.passes.push({}); });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.tree)), plan.tree);
  const results = await executeSearchQuery({
    plan,
    search: fakeSearch({ foo: [{ path: "a.md", line: 1, column: 1, text: "foo" }] }),
    paths: async () => ["a.md"],
    readFrontmatter: NO_FRONTMATTER,
  });
  assert.throws(() => { results.push({}); });
  assert.deepEqual(JSON.parse(JSON.stringify(results)), results);
});

test("executeSearchQuery rejects a plan that did not come from planSearchQuery", async () => {
  await assert.rejects(() => executeSearchQuery({ plan: { type: "not-a-plan" }, search: fakeSearch({}), paths: NO_PATHS, readFrontmatter: NO_FRONTMATTER }), TypeError);
});

import path from "node:path";

const slash = (value) => value.split(path.sep).join("/").replace(/\/+$/, "");

/**
 * Destination is the authority: source labels never select a different form.
 * Rules are deliberately data-like so explain can show the exact determination.
 */
export function resolveDestinationContract(destination) {
  const target = slash(path.resolve(destination));
  const rules = [
    [/(?:^|\/)content\/text\/glossary\/terms$/, "term", "destination.glossary-terms.v1"],
    [/(?:^|\/)content\/text\/triage$/, "triage-text", "destination.text-triage.v1"],
    [/(?:^|\/)content\/text\/documents\/articles\/notes$/, "note", "destination.notes.v1"],
    [/(?:^|\/)bibliography\.bib$/, "bibliography", "destination.bibliography.v1"],
    [/(?:^|\/)content\/text\/documents\/articles\/bibliographies\/sources$/, "reference-source", "destination.reference-sources.v1"],
    [/(?:^|\/)apps\/[^/]+$/, "application", "destination.application.v1"],
    [/(?:^|\/)services\/[^/]+-services-section$/, "service-section", "destination.service-section.v1"]
  ];
  for (const [pattern, form, rule] of rules) {
    if (pattern.test(target)) return { form, rule, destination: target };
  }
  return {
    form: "unknown",
    rule: "destination.unrecognized.v1",
    destination: target
  };
}

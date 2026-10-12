import { normalizeTufteForm, renderTufteForm } from "@red-cup-engineering/web-page-tiling-engine";

export function projectGeodeEditor(reading) {
  if (!reading || reading.type !== "CairnDocumentReading") throw new TypeError("reading must be a CAIRN document reading");
  const form = normalizeTufteForm({
    id: "note-editor-form",
    action: "geode.note.replace",
    method: "post",
    revision: reading.revision,
    fields: [
      { id: "note-editor-path", name: "path", kind: "hidden", label: "Path", value: reading.path },
      {
        id: "note-editor-markdown",
        name: "markdown",
        kind: "textarea",
        label: "Markdown source",
        value: reading.markdown,
        description: "The save is admitted only if the file still has the revision you opened.",
        required: true,
      },
    ],
    submitters: [{ id: "save-note", label: "Save Markdown", kind: "submit" }],
  });
  return Object.freeze({ form, html: renderTufteForm(form) });
}

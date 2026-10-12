import { graphDiagramSvg, type DiagramPaletteEntry } from "@emsenn/organizing/diagramming";

/**
 * directory-graph-svg — the content directory tree as a clickable SVG.
 *
 * `content/` is a POSIX directory tree, so it is already a DAG: a directory
 * contains subdirectories and files; "contains" is the edge. This draws a slice
 * of that tree — a directory and what it holds, or a file beside its siblings —
 * with each box a real path, clickable through to that path's page. No analysis;
 * it is the folder structure, drawn.
 */

export type DirectoryGraphNode = Readonly<{
  /** The path; unique node id. */
  id: string;
  label: string;
  kind: "directory" | "file";
  /** True for the page's own path, so it is highlighted. */
  current?: boolean;
  href?: string;
}>;

/** Containment edges: `from` (a directory) contains `to`. */
export type DirectoryGraphEdge = Readonly<{ from: string; to: string }>;

const PALETTE: Readonly<Record<string, DiagramPaletteEntry>> = Object.freeze({
  directory: { fill: "#243a4b", stroke: "#5a8fb0" },
  file: { fill: "#2f3a2a", stroke: "#7d9c5a" },
});

/** Render the directory slice, or "" when there is nothing but the focus. */
export function directoryGraphSvg(
  nodes: readonly DirectoryGraphNode[],
  edges: readonly DirectoryGraphEdge[],
  title = "Directory structure",
): string {
  if (edges.length === 0) return "";
  return graphDiagramSvg(
    {
      nodes: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        group: node.kind,
        focus: node.current === true,
        ...(node.href === undefined ? {} : { href: node.href }),
        title: `${node.label} (${node.kind})`,
      })),
      edges: edges.map((edge) => ({ from: edge.from, to: edge.to, kind: "contains" })),
    },
    {
      title,
      palette: PALETTE,
      defaultColor: { fill: "#243a4b", stroke: "#5a8fb0" },
      nodeWidth: 150,
      edgeStyles: { contains: { stroke: "#9aa7b2" } },
    },
  );
}

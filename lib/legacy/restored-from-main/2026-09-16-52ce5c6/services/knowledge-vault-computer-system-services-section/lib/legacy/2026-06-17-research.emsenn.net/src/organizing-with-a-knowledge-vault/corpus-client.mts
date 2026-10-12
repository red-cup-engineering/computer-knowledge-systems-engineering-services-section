import {
  corpusDocumentBodyOperation,
  corpusDocumentCreateOperation,
  corpusDocumentFrontmatterOperation,
  corpusDocumentPrepareOperation,
  corpusDraftOperation,
  corpusFileOperation,
  corpusGrepOperation,
  corpusRootsOperation,
  corpusSearchOperation,
  corpusTopicsOperation,
  type CorpusOperationResult,
} from "./corpus-operations.mts";

export type CorpusClient = Readonly<{
  roots(): Promise<CorpusOperationResult>;
  topics(query?: Readonly<Record<string, string>>): Promise<CorpusOperationResult>;
  search(query: Readonly<Record<string, string>>): Promise<CorpusOperationResult>;
  grep(query: Readonly<Record<string, string>>): Promise<CorpusOperationResult>;
  file(pathname: string, query?: Readonly<Record<string, string>>): Promise<CorpusOperationResult>;
  documentPrepare(body: Readonly<Record<string, unknown>>): Promise<CorpusOperationResult>;
  documentCreate(body: Readonly<Record<string, unknown>>): Promise<CorpusOperationResult>;
  documentFrontmatter(body: Readonly<Record<string, unknown>>): Promise<CorpusOperationResult>;
  documentBody(body: Readonly<Record<string, unknown>>): Promise<CorpusOperationResult>;
  draft(body: Readonly<Record<string, unknown>>): Promise<CorpusOperationResult>;
}>;

export function createCorpusClientForRoot(root: string): CorpusClient {
  return {
    async roots() {
      return corpusRootsOperation(root);
    },
    async topics(query = {}) {
      return corpusTopicsOperation(root, query);
    },
    async search(query) {
      return corpusSearchOperation(root, query);
    },
    async grep(query) {
      return corpusGrepOperation(root, query);
    },
    async file(pathname, query = {}) {
      return corpusFileOperation(root, pathname, query);
    },
    async documentPrepare(body) {
      return corpusDocumentPrepareOperation(root, body);
    },
    async documentCreate(body) {
      return corpusDocumentCreateOperation(root, body);
    },
    async documentFrontmatter(body) {
      return corpusDocumentFrontmatterOperation(root, body);
    },
    async documentBody(body) {
      return corpusDocumentBodyOperation(root, body);
    },
    async draft(body) {
      return corpusDraftOperation(root, body);
    },
  };
}

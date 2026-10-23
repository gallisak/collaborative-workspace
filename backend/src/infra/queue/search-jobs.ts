export const SEARCH_QUEUE = 'search';

export const SearchJob = {
  IndexDocument: 'document.index',
  Reconcile: 'index.reconcile',
} as const;

export interface IndexDocumentJob {
  documentId: string;
}

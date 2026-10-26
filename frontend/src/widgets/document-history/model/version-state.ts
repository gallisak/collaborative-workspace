import * as Y from 'yjs';

export function docFromState(base64: string): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(
    doc,
    Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
  );
  return doc;
}

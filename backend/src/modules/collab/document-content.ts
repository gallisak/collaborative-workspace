import * as Y from 'yjs';

export const CONTENT_FIELD = 'default';

export function restoreContent(doc: Y.Doc, versionState: Uint8Array, origin: unknown) {
  const version = new Y.Doc();
  Y.applyUpdate(version, versionState);
  const source = version.getXmlFragment(CONTENT_FIELD);
  const target = doc.getXmlFragment(CONTENT_FIELD);
  doc.transact(() => {
    target.delete(0, target.length);
    target.insert(
      0,
      source
        .toArray()
        .filter((node): node is Y.XmlElement | Y.XmlText => !(node instanceof Y.XmlHook))
        .map((node) => node.clone()),
    );
  }, origin);
  version.destroy();
}

export function shouldTakeAutoVersion(
  changedSinceVersion: boolean,
  lastVersionAt: Date,
  now: Date,
  intervalMs: number,
): boolean {
  return changedSinceVersion && now.getTime() - lastVersionAt.getTime() >= intervalMs;
}

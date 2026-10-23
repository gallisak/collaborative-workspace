import * as Y from 'yjs';
import { CONTENT_FIELD, restoreContent, shouldTakeAutoVersion } from './document-content.js';

const write = (doc: Y.Doc, ...paragraphs: string[]) => {
  const fragment = doc.getXmlFragment(CONTENT_FIELD);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(
      0,
      paragraphs.map((text) => {
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.setAttribute('align', 'left');
        paragraph.insert(0, [new Y.XmlText(text)]);
        return paragraph;
      }),
    );
  });
};

const content = (doc: Y.Doc) => doc.getXmlFragment(CONTENT_FIELD).toJSON();

describe('restoreContent', () => {
  it('brings back the content of the version including attributes', () => {
    const doc = new Y.Doc();
    write(doc, 'first', 'second');
    const version = Y.encodeStateAsUpdate(doc);
    write(doc, 'rewritten');

    restoreContent(doc, version, null);

    expect(content(doc)).toBe(
      '<paragraph align="left">first</paragraph><paragraph align="left">second</paragraph>',
    );
  });

  it('is applied as a normal change that other replicas receive', () => {
    const server = new Y.Doc();
    write(server, 'old');
    const version = Y.encodeStateAsUpdate(server);
    write(server, 'new');
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    const updates: Uint8Array[] = [];
    server.on('update', (update: Uint8Array) => updates.push(update));

    restoreContent(server, version, null);
    updates.forEach((update) => Y.applyUpdate(client, update));

    expect(content(client)).toBe('<paragraph align="left">old</paragraph>');
  });

  it('keeps an edit made concurrently with the restore', () => {
    const server = new Y.Doc();
    write(server, 'v1');
    const version = Y.encodeStateAsUpdate(server);
    write(server, 'v2');
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    const fromClient: Uint8Array[] = [];
    client.on('update', (update: Uint8Array) => fromClient.push(update));

    const extra = new Y.XmlElement('paragraph');
    extra.insert(0, [new Y.XmlText('typed meanwhile')]);
    client.getXmlFragment(CONTENT_FIELD).insert(1, [extra]);
    restoreContent(server, version, null);
    fromClient.forEach((update) => Y.applyUpdate(server, update));

    expect(content(server)).toContain('v1');
    expect(content(server)).toContain('typed meanwhile');
    expect(content(server)).not.toContain('v2');
  });
});

describe('shouldTakeAutoVersion', () => {
  const last = new Date('2026-10-23T12:00:00Z');
  const at = (seconds: number) => new Date(last.getTime() + seconds * 1000);

  it('waits for the interval since the last version', () => {
    expect(shouldTakeAutoVersion(true, last, at(599), 600_000)).toBe(false);
    expect(shouldTakeAutoVersion(true, last, at(600), 600_000)).toBe(true);
  });

  it('never snapshots an unchanged document', () => {
    expect(shouldTakeAutoVersion(false, last, at(3600), 600_000)).toBe(false);
  });
});

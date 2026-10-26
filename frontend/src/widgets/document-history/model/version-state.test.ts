import * as Y from 'yjs';
import { docFromState } from './version-state';

describe('docFromState', () => {
  it('rebuilds a document from a base64 encoded Yjs state', () => {
    const source = new Y.Doc();
    source.getText('t').insert(0, 'Version one');
    const base64 = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(source)));

    expect(docFromState(base64).getText('t').toString()).toBe('Version one');
  });
});

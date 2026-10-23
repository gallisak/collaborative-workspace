import { routeLabel } from './http-metrics.js';

describe('routeLabel', () => {
  it('uses the route template so ids do not explode label cardinality', () => {
    expect(routeLabel({ baseUrl: '', route: { path: '/api/documents/:documentId' } })).toBe(
      '/api/documents/:documentId',
    );
  });

  it('groups requests that matched no route', () => {
    expect(routeLabel({ baseUrl: '' })).toBe('unmatched');
  });
});

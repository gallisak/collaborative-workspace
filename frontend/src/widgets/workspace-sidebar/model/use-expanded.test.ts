import { act, renderHook } from '@testing-library/react';
import { useExpanded } from './use-expanded';

describe('useExpanded', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens the ancestors of the current page but lets the user collapse them', () => {
    const forced = ['parent'];
    const { result } = renderHook(() => useExpanded('ws-1', forced));
    expect(result.current.isExpanded('parent')).toBe(true);

    act(() => result.current.toggle('parent'));
    expect(result.current.isExpanded('parent')).toBe(false);

    act(() => result.current.toggle('parent'));
    expect(result.current.isExpanded('parent')).toBe(true);
  });

  it('opens the ancestors again after navigating to another page', () => {
    const { result, rerender } = renderHook(({ forced }) => useExpanded('ws-2', forced), {
      initialProps: { forced: ['a'] },
    });
    act(() => result.current.toggle('a'));
    expect(result.current.isExpanded('a')).toBe(false);

    rerender({ forced: ['b', 'a'] });
    expect(result.current.isExpanded('a')).toBe(true);
  });

  it('remembers pages the user opened', () => {
    const { result } = renderHook(() => useExpanded('ws-3', []));
    act(() => result.current.toggle('x'));
    expect(result.current.isExpanded('x')).toBe(true);
    expect(window.localStorage.getItem('collab-docs:expanded:ws-3')).toBe('["x"]');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { TitleInput } from './TitleInput';

const rename = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

vi.mock('../model/use-rename-document', () => ({
  MAX_TITLE_LENGTH: 200,
  useRenameDocument: () => rename,
}));

describe('TitleInput', () => {
  beforeEach(() => rename.mockClear());

  it('saves the title when the field loses focus', () => {
    render(<TitleInput documentId="doc-1" title="Plan" />);
    const input = screen.getByRole('textbox', { name: 'Page title' });

    fireEvent.change(input, { target: { value: 'Roadmap' } });
    fireEvent.blur(input);

    expect(rename).toHaveBeenCalledWith('doc-1', 'Roadmap', 'Plan');
  });

  it('discards the edit on Escape instead of saving it', () => {
    render(<TitleInput documentId="doc-1" title="Plan" />);
    const input = screen.getByRole('textbox', { name: 'Page title' });

    input.focus();
    fireEvent.change(input, { target: { value: 'Typo' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(rename).not.toHaveBeenCalled();
    expect(input).toHaveValue('Plan');
  });
});

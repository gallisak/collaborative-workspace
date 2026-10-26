import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentComposer } from './CommentComposer';

const candidates = [
  { id: 'u-ann', name: 'Ann Owner' },
  { id: 'u-bob', name: 'Bob Guest' },
];

function setup(onSubmit = vi.fn().mockResolvedValue(true)) {
  render(
    <CommentComposer
      candidates={candidates}
      placeholder="Add a comment"
      submitLabel="Comment"
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, input: screen.getByRole('textbox', { name: 'Add a comment' }) };
}

describe('CommentComposer', () => {
  it('suggests people after @ and inserts the chosen one with the keyboard', async () => {
    const user = userEvent.setup();
    const { onSubmit, input } = setup();

    await user.type(input, 'Hi @');
    expect(screen.getByRole('listbox', { name: 'People to mention' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    await user.type(input, 'please look');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    expect(onSubmit).toHaveBeenCalledWith({
      body: 'Hi @Bob Guest please look',
      mentionedUserIds: ['u-bob'],
    });
    expect(input).toHaveValue('');
  });

  it('does not send mentions that were removed from the text', async () => {
    const user = userEvent.setup();
    const { onSubmit, input } = setup();

    await user.type(input, '@An{Enter}');
    await user.clear(input);
    await user.type(input, 'No mentions here{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith({ body: 'No mentions here', mentionedUserIds: [] });
  });

  it('closes the suggestions with Escape and keeps the text when sending fails', async () => {
    const user = userEvent.setup();
    const { input } = setup(vi.fn().mockResolvedValue(false));

    await user.type(input, 'Ping @bo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(input).toHaveValue('Ping @bo');
  });
});

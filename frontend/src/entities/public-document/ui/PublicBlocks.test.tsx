import { render, screen } from '@testing-library/react';
import type { PublicBlock } from '../model/blocks';
import { PublicBlocks } from './PublicBlocks';

const text = (value: string) => [{ type: 'text' as const, text: value }];

describe('PublicBlocks', () => {
  it('renders the document structure as semantic HTML', () => {
    const blocks: PublicBlock[] = [
      { type: 'heading', level: 2, content: text('Plan') },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Read ' },
          {
            type: 'text',
            text: 'the guide',
            marks: [{ type: 'bold' }, { type: 'link', href: 'https://example.com/' }],
          },
          { type: 'hardBreak' },
          { type: 'text', text: 'today' },
        ],
      },
      {
        type: 'orderedList',
        items: [[{ type: 'paragraph', content: text('First') }]],
      },
      {
        type: 'taskList',
        items: [
          { checked: true, content: [{ type: 'paragraph', content: text('Done') }] },
          { checked: false, content: [{ type: 'paragraph', content: text('Next') }] },
        ],
      },
      { type: 'codeBlock', language: 'ts', code: 'const a = 1;' },
      { type: 'image', src: 'https://example.com/chart.png', alt: 'Chart' },
    ];

    const { container } = render(<PublicBlocks blocks={blocks} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'the guide' });
    expect(link).toHaveAttribute('href', 'https://example.com/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    expect(link.querySelector('strong')).toHaveTextContent('the guide');
    expect(container.querySelector('br')).not.toBeNull();
    expect(screen.getByText('First').closest('ol')).not.toBeNull();
    const [done, next] = screen.getAllByRole('checkbox');
    expect(done).toBeChecked();
    expect(done).toBeDisabled();
    expect(next).not.toBeChecked();
    expect(container.querySelector('pre code.language-ts')).toHaveTextContent('const a = 1;');
    expect(screen.getByRole('img', { name: 'Chart' })).toHaveAttribute(
      'src',
      'https://example.com/chart.png',
    );
  });

  it('shows markup typed by an author as text instead of running it', () => {
    const { container } = render(
      <PublicBlocks
        blocks={[{ type: 'paragraph', content: text('<img src=x onerror=alert(1)>') }]}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});

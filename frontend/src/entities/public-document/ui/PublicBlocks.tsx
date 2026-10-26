import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';
import type { PublicBlock, PublicInline, PublicMark } from '../model/blocks';

const HEADINGS = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

function withMark(content: ReactNode, mark: PublicMark): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong>{content}</strong>;
    case 'italic':
      return <em>{content}</em>;
    case 'strike':
      return <s>{content}</s>;
    case 'code':
      return <code>{content}</code>;
    case 'link':
      return (
        <a href={mark.href} rel="noopener noreferrer nofollow ugc" target="_blank">
          {content}
        </a>
      );
  }
}

function Inline({ content }: { content: readonly PublicInline[] }) {
  return content.map((part, index) =>
    part.type === 'hardBreak' ? (
      <br key={index} />
    ) : (
      <span key={index}>{(part.marks ?? []).reduce(withMark, part.text)}</span>
    ),
  );
}

function Block({ block }: { block: PublicBlock }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p>
          <Inline content={block.content} />
        </p>
      );
    case 'heading': {
      const Heading = HEADINGS[block.level];
      return (
        <Heading>
          <Inline content={block.content} />
        </Heading>
      );
    }
    case 'bulletList':
    case 'orderedList': {
      const List = block.type === 'bulletList' ? 'ul' : 'ol';
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index}>
              <Blocks blocks={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'taskList':
      return (
        <ul data-type="taskList">
          {block.items.map((item, index) => (
            <li key={index} data-checked={item.checked}>
              <label>
                <input type="checkbox" checked={item.checked} disabled readOnly />
                <span className="sr-only">{item.checked ? 'Done' : 'To do'}</span>
              </label>
              <div>
                <Blocks blocks={item.content} />
              </div>
            </li>
          ))}
        </ul>
      );
    case 'codeBlock':
      return (
        <pre>
          <code className={cn(block.language && `language-${block.language}`)}>{block.code}</code>
        </pre>
      );
    case 'image':
      return (
        <Image
          src={block.src}
          alt={block.alt ?? ''}
          width={0}
          height={0}
          sizes="(max-width: 768px) 100vw, 768px"
          className="h-auto w-auto"
          referrerPolicy="no-referrer"
          unoptimized
        />
      );
  }
}

function Blocks({ blocks }: { blocks: readonly PublicBlock[] }) {
  return blocks.map((block, index) => <Block key={index} block={block} />);
}

export function PublicBlocks({ blocks }: { blocks: readonly PublicBlock[] }) {
  return (
    <div className="document-content min-h-0">
      <Blocks blocks={blocks} />
    </div>
  );
}

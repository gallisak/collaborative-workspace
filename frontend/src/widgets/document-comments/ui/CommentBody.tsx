import type { Comment } from '@/shared/api';

export function CommentBody({ comment }: { comment: Comment }) {
  const names = comment.mentions.map((user) => `@${user.name}`).sort((a, b) => b.length - a.length);
  if (names.length === 0) {
    return <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>;
  }
  const pattern = new RegExp(
    `(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  );
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {comment.body.split(pattern).map((part, index) =>
        names.includes(part) ? (
          <span
            key={index}
            data-mention
            className="rounded bg-blue-50 px-0.5 font-medium text-blue-700"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

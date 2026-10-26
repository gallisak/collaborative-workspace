import { type Editor, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { COMMENTABLE_BLOCKS } from '@/entities/document';

interface HighlightState {
  blockIds: ReadonlySet<string>;
  activeId: string | null;
}

export const OPEN_BLOCK_EVENT = 'comment-block-open';

const highlightKey = new PluginKey<HighlightState>('commentHighlight');
const EMPTY: HighlightState = { blockIds: new Set(), activeId: null };

const blockId = (attrs: Record<string, unknown>) =>
  typeof attrs.id === 'string' ? attrs.id : null;

export const CommentHighlight = Extension.create({
  name: 'commentHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: highlightKey,
        state: {
          init: () => EMPTY,
          apply: (transaction, value) =>
            (transaction.getMeta(highlightKey) as HighlightState | undefined) ?? value,
        },
        props: {
          decorations(state) {
            const { blockIds, activeId } = highlightKey.getState(state) ?? EMPTY;
            if (blockIds.size === 0) {
              return DecorationSet.empty;
            }
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              const id = blockId(node.attrs);
              if (id && blockIds.has(id)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: id === activeId ? 'has-comments is-active-comment' : 'has-comments',
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClickOn(view, _pos, node) {
            const id = blockId(node.attrs);
            const { blockIds } = highlightKey.getState(view.state) ?? EMPTY;
            if (id && blockIds.has(id)) {
              view.dom.dispatchEvent(new CustomEvent(OPEN_BLOCK_EVENT, { detail: id }));
            }
            return false;
          },
        },
      }),
    ];
  },
});

export function setCommentHighlights(
  editor: Editor,
  blockIds: readonly string[],
  activeId: string | null,
) {
  editor.view.dispatch(
    editor.state.tr.setMeta(highlightKey, { blockIds: new Set(blockIds), activeId }),
  );
}

export function blockAtSelection(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const id = blockId(node.attrs);
    if (COMMENTABLE_BLOCKS.includes(node.type.name) && id) {
      return id;
    }
  }
  return null;
}

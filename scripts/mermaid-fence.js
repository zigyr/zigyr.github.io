'use strict';

const MERMAID_FENCE_RE = /^[ \t]*```mermaid[^\r\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;

hexo.extend.filter.register(
  'before_post_render',
  function (post) {
    if (typeof post.content !== 'string') return post;

    post.content = post.content.replace(MERMAID_FENCE_RE, (_, diagram) => {
      return `{% mermaid %}\n${diagram.trimEnd()}\n{% endmermaid %}`;
    });

    return post;
  },
  1
);

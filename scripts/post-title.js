'use strict';

const path = require('node:path');

function filenameWithoutExtension(source) {
  const basename = path.posix.basename(source || '');
  return basename.slice(0, basename.length - path.posix.extname(basename).length);
}

async function applyPostTitles(hexo) {
  const options = hexo.config.post_title || {};
  if (options.from_filename === false) return;

  const updates = [];

  for (const post of hexo.model('Post').toArray()) {
    if (String(post.title || '').trim()) continue;

    const title = filenameWithoutExtension(post.source);
    if (title) {
      updates.push(post.update({ title }));
    }
  }

  await Promise.all(updates);
}

hexo.extend.filter.register(
  'before_generate',
  function () {
    return applyPostTitles(this);
  },
  4
);

'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const FRONT_MATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function hasFrontMatterValue(raw, key) {
  const match = FRONT_MATTER_RE.exec(raw || '');
  if (!match) return false;

  const valuePattern = new RegExp(`^${key}\\s*:\\s*(?!\\s*(?:#|$)).+`, 'm');
  return valuePattern.test(match[1]);
}

function readGitDates(baseDir, source) {
  try {
    const output = execFileSync(
      'git',
      ['log', '--follow', '--format=%cI', '--', source],
      {
        cwd: baseDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    ).trim();

    if (!output) return null;

    const commits = output.split(/\r?\n/).filter(Boolean);
    return {
      created: new Date(commits[commits.length - 1]),
      updated: new Date(commits[0])
    };
  } catch {
    return null;
  }
}

async function applyPostDates(hexo) {
  const options = hexo.config.post_dates || {};
  if (options.enable === false) return;

  const posts = hexo.model('Post').toArray();
  const buildTime = new Date();
  let gitPostCount = 0;
  let uncommittedPostCount = 0;
  const updates = [];

  for (const post of posts) {
    const gitSource = path.posix.join(
      'source',
      post.source.replace(/\\/g, '/')
    );
    const gitDates = readGitDates(hexo.base_dir, gitSource);
    const hasDate = hasFrontMatterValue(post.raw, 'date');
    const hasUpdated = hasFrontMatterValue(post.raw, 'updated');
    const update = {};

    if (!hasDate) {
      update.date = gitDates ? gitDates.created : buildTime;
      if (gitDates) {
        gitPostCount += 1;
      } else {
        uncommittedPostCount += 1;
      }
    }

    if (!hasUpdated) {
      update.updated = gitDates ? gitDates.updated : buildTime;
    }

    if (Object.keys(update).length) {
      updates.push(post.update(update));
    }
  }

  await Promise.all(updates);

  if (gitPostCount || uncommittedPostCount) {
    hexo.log.info(
      'Post dates: %d from Git history, %d using build time until committed.',
      gitPostCount,
      uncommittedPostCount
    );
  }
}

hexo.extend.filter.register(
  'before_generate',
  function () {
    return applyPostDates(this);
  },
  5
);

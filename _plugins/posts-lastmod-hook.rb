#!/usr/bin/env ruby

Jekyll::Hooks.register :posts, :post_init do |post|
  # 修复 Jekyll 4.x 语法
  next if post.data['draft']

  file_path = post.path
  commit_count = `git rev-list --count HEAD "#{file_path}"`.chomp.to_i

  if commit_count > 0
    lastmod_date = `git log -1 --pretty="%ad" --date=iso "#{file_path}"`.chomp
    post.data['last_modified_at'] = Time.parse(lastmod_date)
  else
    post.data['last_modified_at'] = File.mtime(post.path)
  end
end
---
title: GitHub Pages 双重构建冲突
date: 2026-10-30 00:01:00
---

- Hexo 工作流：通过你编写的 deploy.yml 构建 Hexo 网站，已经成功。

- Jekyll 工作流：pages build and deployment 仍然调用 Jekyll，把 Hexo 的 _config.yml 当作 Jekyll 配置解析，因此报错 The next theme could not be found。


这是第二个博客网站，之前也是用Github Pages部署的

迁移的过程，本地之前博客文件夹保留，删除了原仓库

随后，又新建了同名字的仓库

然后进行初始配置后，并用新的博客文件夹进行remote

在随后push时，发现报错，build with jekyll

这是之前那个博客网站的框架，显然，应该是我迁移的不干净

虽然，仓库的构建页面显示报错，但是网站已经能正常访问

但本着强迫正的原则，非要看到绿勾勾，就想着能不能解决

我的想法，就是把之前那个workflow给干掉

手动删除后，确实仓库构建页面，显示是绿勾勾

随即，写着一篇记录，并进行push，再看看
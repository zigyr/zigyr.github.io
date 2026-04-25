---
title: nginx配置·4 | 开启basic认证
date: 2026-04-23 15:00:00 +0800
categories: [nginx配置]
---



## 前言
---

basic认证 简单来说就是访问一个页面时需要账号密码

核心作用是：
- 快速限制访问：给临时站点、测试环境、内部后台加一层简单的身份验证，不用写后端代码实现登录
- 保护敏感内容：比如还在开发中的网站、后台管理页面、接口文档，防止外人随便访问
- 轻量、零依赖：不需要数据库、不需要 Session/Cookie，配置几行 Nginx 代码就能生效


## HOW
---

下面以为`b.zigyr.com`这个站点开启basic认证为例进行演示

### fir 配置账号密码

通过htpasswd在线平台进行生成

![alt text](/assets/img/20260423/image.png)

随后将结果放在`/etc/nginx/htpasswd`中

### sec 关联`b.zigyr.com`站点

![alt text](/assets/img/20260423/image-1.png)


`auth_basic`表示开启这个功能


而其中的`"b.zigyr.com"`只是备注信息，且现在新的浏览器在登陆时是看不到的

`auth_basic_user_file`指向账号密码的存放位置

### thi 重启nginx服务

`nginx -t`检查配置

`systemctl restart nginx`重启服务

## 参考
---

[在线htpasswd生成器](https://www.lddgo.net/encrypt/htpasswd)
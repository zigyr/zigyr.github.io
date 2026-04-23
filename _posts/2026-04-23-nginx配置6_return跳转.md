---
title: nginx配置·5 | return 跳转
date: 2026-04-23 16:40:00 +0800
categories: [nginx配置]
---


## 前言
---

教程里的`return跳转`是基于配置好ssl证书的一个站点

当这个站点以`http`和`https`访问时，最终都导向`https`

但由于没有配置ssl证书，所以我们不存在这样一个站点

本想通过两个独立站点进行模拟复现的，但迟迟达不到类似效果

## 首先让我们先以两个网站（相同端口）间的跳转引出`$request_uri`
---

### fir 明确demo目标

我们有两个独立站点`a.zigyr.com`和`b.zigyr.com`

目标是实现访问`a.zigyr.com`后自动重定向到`b.zigyr.com`

同时分别在站点下放入一张图片名为`1.jpg`，作为后续uri的访问测试


### sec 配置`a.zigyr.com.conf`


```nginx
server {
    listen       80;
    server_name  a.zigyr.com;
    location / {
            return 302 http://b.zigyr.com;
    }
}
```

### thi 效果展示

- 访问`a.zigyr.com`
    - 重定向至`b.zigyr.com`
- 访问`a.zigyr.com/1.jpg`
    - 重定向至`b.zigyr.com`
- 访问`b.zigyr.com`
    - 展示`b.zigyr.com`
- 访问`b.zigyr.com/1.jpg`
    - 展示`b.zigyr.com/1.jpg`

### fou 通过`$request_uri`进行优化

```nginx
server {
    listen       80;
    server_name  a.zigyr.com;
    location / {
            return 302 http://b.zigyr.com$request_uri;
    }
}
```

`nginx -t`

`systemctl restart nginx`

### fri 效果展示

- 访问`a.zigyr.com`
    - 重定向至`b.zigyr.com`
- 访问`a.zigyr.com/1.jpg`
    - 重定向至`b.zigyr.com/1.jpg`
- 访问`b.zigyr.com`
    - 展示`b.zigyr.com`
- 访问`b.zigyr.com/1.jpg`
    - 展示`b.zigyr.com/1.jpg`

## 最后再强调一下`$request_uri`在同一个网站不同端口间跳转（https和http）的重要性
---

### 如果不添加`$request_uri`

只有访问`http://www.wulaoban.top`的时候才会触发跳转

进入`https://www.wulaoban.top`

但是访问`http://www.wulaoban.top/uri`的时候并不会发生跳转

仍是`http://www.wulaoban.top`

```nginx
server {
    listen 443 ssl;
    server_name www.wulaoban.top;

    #ssl_certificate cert/<cert-file-name>.pem;
    ssl_certificate /opt/cert/9683539_wulaoban.top.pem;     #填写证书文件名称
    #ssl_certificate_key cert/<cert-file-name>.key;
    ssl_certificate_key /opt/cert/9683539_wulaoban.top.key; #填写证书私钥文件名称  

    ssl_session_timeout 5m;

    #表示使用的加密套件的类型
    ssl_ciphers ECDHE-RSA-AES128-GCMSHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;

    #表示使用的TLS协议的类型，默认走TLSv1.3
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3; 
    ssl_prefer_server_ciphers on;

    location / {
        root /web/www.wulaoban.top;
        index index.html index.htm;
    }
}
server {
    listen  80;
    server_name  www.wulaoban.top;
    location / {
        return  302 https://www.wulaoban.top;
    }
}
```

### 添加`$request_uri`之后

访问`http://www.wulaoban.top`的时候会触发跳转

进入`https://www.wulaoban.top`

访问`http://www.wulaoban.top/uri`的时候也会发生跳转

进入`https://www.wulaoban.top`

```nginx
server {
    listen 443 ssl;
    server_name www.wulaoban.top;

    #ssl_certificate cert/<cert-file-name>.pem;
    ssl_certificate /opt/cert/9683539_wulaoban.top.pem;     #填写证书文件名称
    #ssl_certificate_key cert/<cert-file-name>.key;
    ssl_certificate_key /opt/cert/9683539_wulaoban.top.key; #填写证书私钥文件名称  

    ssl_session_timeout 5m;

    #表示使用的加密套件的类型
    ssl_ciphers ECDHE-RSA-AES128-GCMSHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;

    #表示使用的TLS协议的类型，默认走TLSv1.3
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3; 
    ssl_prefer_server_ciphers on;

    location / {
        root /web/www.wulaoban.top;
        index index.html index.htm;
    }
}
server {
    listen  80;
    server_name  www.wulaoban.top;
    location / {
        return  302 https://www.wulaoban.top$request_uri;
    }
}
```
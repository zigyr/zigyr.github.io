> [Mr-Robot: 1 ~ VulnHub](https://www.vulnhub.com/entry/mr-robot-1,151/)

## 攻击链路

沿着实际渗透过程，本次靶场的主要攻击路径如下：

```
Recon
  │
  ├── Nmap 主机发现、端口扫描
  ├── SSL 证书发现域名 www.example.com
  └── hosts 本地域名映射
          │
          ▼
Web Enumeration
  │
  ├── DIRB 目录扫描
  ├── robots.txt 信息泄露
  │     ├── key-1-of-3.txt
  │     └── fsocity.dic
  ├── WhatWeb 指纹识别
  └── WPScan WordPress 探测
          │
          ▼
Initial Access
  │
  ├── 用户名枚举
  ├── 密码字典爆破
  ├── WordPress 后台登录
  ├── 修改主题 404.php
  └── PHP Reverse Shell
          │
          ▼
Shell
  │
  ├── PTY 交互升级
  └── 用户信息与敏感文件枚举
          │
          ▼
Lateral Movement
  │
  ├── 获取 robot 用户密码 Hash
  ├── Hashcat 字典爆破
  └── su 切换至 robot
          │
          ▼
Privilege Escalation
  │
  ├── SUID 文件枚举
  ├── GTFOBins 查询
  └── Nmap SUID 提权
          │
          ▼
Root
```

## 技术与命令速查表

### 1. Recon —— 信息收集

| 技术 / 工具   | Command                    | 作用                         |
| ------------- | -------------------------- | ---------------------------- |
| Nmap 主机发现 | `nmap -sn 192.168.56.1/24` | 发现存活主机                 |
| TCP SYN 扫描  | `nmap -sS -p- $IP`         | 扫描全部 TCP 端口            |
| UDP 扫描      | `nmap -sU -p- $IP`         | 扫描全部 UDP 端口            |
| 服务探测      | `nmap -A $IP -p <PORTS>`   | OS、服务版本、默认脚本等探测 |
| 保存扫描结果  | `nmap -oN nmap.txt $IP`    | 保存普通文本格式结果         |
| hosts 映射    | `nano /etc/hosts`          | 建立本地域名与 IP 映射       |

### 2. Web —— 信息收集与漏洞探测

| 技术 / 工具  | Command                                   | 作用               |
| ------------ | ----------------------------------------- | ------------------ |
| DIRB         | `dirb http://example.com/ -o results.txt` | Web 目录及文件扫描 |
| WhatWeb      | `whatweb http://example.com/`             | Web 指纹识别       |
| WPScan       | `wpscan --url http://example.com/`        | WordPress 信息收集 |
| Searchsploit | `searchsploit wordpress <VERSION>`        | 检索公开漏洞       |
| wget         | `wget http://example.com/fsocity.dic`     | 下载泄露的字典     |
| wc           | `wc -l fsocity.dic`                       | 统计字典行数       |
| sort         | `sort -u fsocity.dic > dic.list`          | 排序、去重并保存   |

### 3. Initial Access —— 初始访问

| 技术 / 工具  | 操作 / Command                | 作用                       |
| ------------ | ----------------------------- | -------------------------- |
| Netcat 监听  | `rlwrap nc -lvnp 2233`        | 接收反弹 Shell             |

### 4. Shell —— 交互升级

| 技术 / 工具  | Command                                         | 作用                           |
| ------------ | ----------------------------------------------- | ------------------------------ |
| 设置终端类型 | `export TERM=xterm`                             | 改善终端兼容性                 |
| PTY 获取     | `python -c 'import pty;pty.spawn("/bin/bash")'` | 生成伪终端                     |
| 挂起进程     | `Ctrl + Z`                                      | 将当前程序挂起                 |
| Raw Mode     | `stty raw -echo`                                | 关闭本地终端常规输入处理及回显 |
| 恢复前台     | `fg`                                            | 恢复挂起的 Shell               |
| 恢复终端     | `stty sane`                                     | 恢复常规终端属性               |

### 5. Lateral Movement —— 用户枚举与切换

| 技术 / 工具      | Command                                   | 作用                   |
| ---------------- | ----------------------------------------- | ---------------------- |
| Hashcat 字典攻击 | `hashcat -a 0 -m 0 hash.list rockyou.txt` | 破解 MD5               |
| 查看破解结果     | `hashcat -m 0 hash.list --show`           | 显示已破解密码         |
| 监听端口枚举     | `netstat -lntp`                           | 查看 TCP 监听端口      |

### 6. Privilege Escalation —— 提权

| 技术 / 工具 | Command                                 | 作用                       |
| ----------- | --------------------------------------- | -------------------------- |
| SUID 枚举   | `find / -perm -u=s -type f 2>/dev/null` | 查找 SUID 文件             |

## 1. Recon —— 信息收集

### 1.1 主机发现

首先使用 Nmap 对目标网段进行主机发现：

```
nmap -sn 192.168.56.1/24 --min-rate 1000
```

发现目标主机：

```
IP = 192.168.56.115
```

### 1.2 端口扫描

确定目标 IP 后，先扫描全部 TCP、UDP 端口，再针对发现的端口进行详细探测。

```
nmap -A $IP -oN nmap.txt -p `nmap -sS -sU -p- -Pn $IP --min-rate 8888 | grep '/tcp\|/udp' | awk -F '/' '{print $1}' | sort -u | tr '\n' ','`
```

**内层 Nmap：**

```
nmap -sS -sU -p- -Pn $IP --min-rate 8888
```

- `-sS`：TCP SYN 扫描。
- `-sU`：UDP 扫描。
- `-p-`：扫描全部端口（1–65535）。
- `-Pn`：跳过主机发现，直接进行端口扫描。
- `--min-rate 8888`：尽量保持每秒至少发送 8888 个探测包。

**端口提取与处理：**

```
grep '/tcp\|/udp' | awk -F '/' '{print $1}' | sort -u | tr '\n' ','
```

| 命令                      | 作用                           |
| ------------------------- | ------------------------------ |
| `grep`                    | 筛选包含 `/tcp` 或 `/udp` 的行 |
| `awk -F '/' '{print $1}'` | 按 `/` 分割，提取端口号        |
| `sort -u`                 | 排序并去重                     |
| `tr '\n' ','`             | 将换行符转换为逗号             |

**外层 Nmap：**

```
nmap -A $IP -oN nmap.txt -p <PORTS>
```

- `-A`：启用 OS 检测、版本检测、默认脚本扫描及路由追踪。
- `-oN`：将扫描结果保存为普通文本格式。

> **注意：** 原命令将 TCP、UDP 端口号合并后传给外层 Nmap，但外层没有指定 `-sU`，因此默认进行 TCP 扫描。若需要详细探测 UDP 端口，应单独执行 UDP 扫描，不能认为上述命令已经完成了 TCP、UDP 的双重详细探测。

![image-20261108091128272](image-20261108091128272.png)

### 1.3 SSL 证书与域名发现

在扫描结果中，`ssl-cert` 脚本发现了一个域名：

```
Subject: commonName=www.example.com
```

证书中的 `commonName`（CN）提供了目标站点的域名线索。

因此，将该域名添加到本地 `hosts` 文件中，建立域名与目标 IP 的映射关系。

Linux：

```
sudo nano /etc/hosts
```

添加：

```
192.168.56.115 www.example.com
```

这样，访问 `www.example.com` 时，系统就会将其解析到 `192.168.56.115`。

> 严格来说，`hosts` 是本地静态主机名映射机制，并不是真正的 DNS 解析。

![image-20261108091845532](image-20261108091845532.png)

## 2. Web —— Web 信息收集

### 2.1 目录扫描

使用 DIRB 对 Web 目录进行扫描：

```
dirb http://www.example.com/ -o results.txt
```

![image-20261108092255311](image-20261108092255311.png)

### 2.2 robots.txt 信息泄露

在目录扫描结果中发现 `robots.txt`。

访问后发现两个值得关注的资源：

- `key-1-of-3.txt`：包含第一段 Flag，保存到渗透笔记中。![image-20261108093002545](image-20261108093002545.png)
- `fsocity.dic`：一个体量较大的字典文件，后续用于用户名及密码爆破。![image-20261108180214489](image-20261108180214489.png)

#### 下载并处理字典

```
# 1. 下载字典
wget http://www.example.com/fsocity.dic

# 2. 查看原始字典统计信息
wc fsocity.dic

# 3. 统计去重后的字典信息
sort -u fsocity.dic | wc

# 4. 去重并保存
sort -u fsocity.dic > dic.list

# 5. 查看新字典的记录数量
wc -l dic.list
```

**wc —— Word Count**

用于统计文件中的行数、单词数和字节数。

```
wc [OPTION] [FILE]
```

例如：

```
wc fsocity.dic
```

输出：

```
858160  858160  7245381 fsocity.dic
```

| 参数 | 含义  | 统计内容 |
| ---- | ----- | -------- |
| `-l` | lines | 行数     |
| `-w` | words | 单词数   |
| `-c` | bytes | 字节数   |
| `-m` | chars | 字符数   |

**sort -u —— 排序并去重**

`sort` 默认按照字典序对内容进行排序，但不会删除重复行。

`sort -u` 则会在排序的同时删除重复内容，每种相同的行只保留一条。

```
sort [OPTION] [FILE]
```

| 参数 | 含义                 |
| ---- | -------------------- |
| `-u` | unique，去重         |
| `-r` | reverse，逆序排序    |
| `-n` | 按数值大小排序       |
| `-f` | 忽略大小写           |
| `-o` | 将结果输出到指定文件 |

> `sort -u` 适合处理这种存在大量重复项的字典，可以减少后续爆破的无效尝试。

### 2.3 Web 指纹识别

使用 WhatWeb 识别目标 Web 服务：

```
whatweb http://www.example.com/0/
```

![image-20261108092508439](image-20261108092508439.png)

从扫描结果中判断目标站点使用了 WordPress。

既然确定了 CMS 类型，接下来就可以使用针对 WordPress 的专用扫描工具 WPScan，进一步探测其版本、插件、主题及用户信息。

### 2.4 WPScan 漏洞探测

使用 WPScan 对目标 WordPress 站点进行扫描：

![image-20261108094537121](image-20261108094537121.png)

扫描过程中关注以下信息：

- WordPress 版本。
- 已安装的插件及主题。
- 可枚举的用户。
- 可能存在的安全问题。

根据扫描得到的版本信息，结合 Searchsploit 查询相关漏洞：

```
searchsploit wordpress <VERSION>
```

发现存在用户名枚举相关的漏洞线索。

> 版本信息可以辅助漏洞检索，但不能仅凭版本号就认定目标一定存在对应漏洞。还需要结合实际配置和请求响应进行验证。

![image-20261108095350184](image-20261108095350184.png)

## 3. Initial Access —— 获取初始访问权限

### 3.1 登录入口发现

尝试访问：

```
http://www.example.com/login
```

发现其重定向到了：

```
http://www.example.com/login.php
```

![image-20261108095035673](image-20261108095035673.png)

### 3.2 用户名枚举

WordPress 的密码重置功能可能存在用户名枚举问题。

其基本原理是：

用户在忘记密码页面提交用户名或邮箱后，服务器会根据账户是否存在返回不同的提示。

攻击者可以利用这种响应差异，判断某个用户名是否有效。

因此，使用之前从 `robots.txt` 中获取并处理过的 `fsocity.dic`，尝试枚举有效用户名。

![image-20261108095936911](image-20261108095936911.png)

**Burp Suite 中的 Case Sensitive**

`Case sensitive` 用于决定匹配文本时，是否区分大小写。

| 响应内容 | 开启 Case sensitive | 关闭 Case sensitive |
| -------- | ------------------- | ------------------- |
| `admin`  | 匹配                | 匹配                |
| `Admin`  | 不匹配              | 匹配                |
| `ADMIN`  | 不匹配              | 匹配                |
| `aDmIn`  | 不匹配              | 匹配                |

这里需要注意：是否开启大小写敏感，应根据实际响应内容决定。如果服务器返回的提示存在大小写变化，关闭大小写敏感可以避免遗漏。

### 3.3 密码爆破

得到有效用户名后，继续尝试密码爆破。

与上一步不同，这次需要抓取**实际登录页面**的请求，而不是忘记密码页面的请求。

将登录请求发送至 Burp Suite Intruder，使用 `fsocity.dic` 作为密码字典。

![image-20261108100331695](image-20261108100331695.png)

最终得到一组有效凭据：

```
username:passwd
```

尝试登录 WordPress 后台：

![image-20261108100416798](image-20261108100416798.png)

### 3.4 WordPress 后台文件修改

成功进入后台后，发现：

```
插件 → 插件文件编辑器
```

可以直接修改部分插件对应的 PHP 文件。

这意味着，如果能够修改并执行服务器上的 PHP 文件，就有机会利用 PHP 代码执行获得初始 Shell。

首先尝试修改 `hello.php`：

```
<?php
    echo 123;
    phpinfo();
?>
```

![image-20261108100816566](image-20261108100816566.png)

但多次刷新对应插件页面，始终没有观察到预期效果。

这里需要区分两个概念：

- 修改插件文件：只是改变了服务器上的 PHP 源码。
- 执行插件文件：还需要有实际的 PHP 执行路径：`http://www.example.com/wp-content/plugins/<plugin_name>`

WordPress 插件通常通过自身的加载机制及钩子运行，并不意味着修改插件文件后，刷新网站就一定会执行其中的代码。

### 3.5 尝试修改 404 模板

插件这条路径没有得到预期效果，于是转而尝试修改 WordPress 主题文件。

其中，**404 模板**是一个值得尝试的位置。

当用户访问一个不存在的页面时，WordPress 会根据主题模板机制加载对应的 `404.php`。

修改 404 模板：

```
<?php
    echo 123;
?>
```

刷新不存在的页面，观察到预期输出。

同时尝试：

```
curl http://www.example.com/404.php -k
```

![image-20261108101452260](image-20261108101452260.png)

> 注意：直接访问 `/404.php` 与通过 WordPress 的不存在页面路由触发 404 模板并不是同一件事。实际使用时，应确认请求对应的文件路径以及服务器的处理方式。

至此，已经验证了可以通过修改主题 PHP 文件实现代码执行。

### 3.6 获取 Reverse Shell

接下来，将原本的测试代码替换为 PHP 反弹 Shell。

首先在攻击机监听端口：

```
rlwrap nc -lvnp 2233
```

- `nc`：Netcat，用于建立网络连接。
- `-l`：监听模式。
- `-v`：显示详细连接信息。
- `-n`：不进行 DNS 解析。
- `-p 2233`：指定监听端口。
- `rlwrap`：为 Netcat 提供命令行编辑及历史记录支持。

随后，在目标 PHP 文件中尝试不同的反弹 Shell 方式。

![image-20261108102523814](image-20261108102523814.png)

初期尝试的一些简单反弹 Shell 没有得到预期效果，于是转而尝试更复杂的 PHP 反弹 Shell 实现。

![image-20261108102235784](image-20261108102235784.png)

最终成功建立反向连接，获得目标机器的命令行访问权限。

## 4. Shell —— 交互体验升级

通过 Netcat 获得的反弹 Shell，通常只是一个不完整的交互式 Shell，缺少完整的伪终端（PTY）支持。

可能出现的问题：

- 方向键无法正常编辑命令。
- `Ctrl + C` 无法正常中断程序。
- 无法正常使用 `vim`、`top` 等交互式程序。
- 终端回显异常。
- 无法正常处理终端尺寸及控制字符。

因此，需要进一步升级 Shell。

### 4.1 设置终端类型

```
export TERM=xterm
```

`TERM` 用于指定当前终端的类型，`xterm` 是常见的终端类型之一。

设置后，可以改善部分终端程序的兼容性，例如 `clear`。

### 4.2 获取 PTY

首先检查目标机器是否安装 Python：

```
python -c 'import pty;pty.spawn("/bin/bash")'
```

通过 Python 的 `pty` 模块生成伪终端，并启动 Bash。

### 4.3 切换本地终端模式

在攻击机终端中执行：

```
Ctrl + Z
```

将当前 Netcat 进程挂起，返回本地 Shell。

随后执行：

```
stty raw -echo; fg
```

最后将 Netcat 重新恢复到前台。

**stty raw -echo**

`stty`（Set Terminal）用于设置终端属性。

- `raw`：将终端切换到原始模式，减少终端对输入字符的常规处理。
- `-echo`：关闭本地终端回显。

正常情况下，终端会对输入进行一些处理，例如：

- 将退格键处理为删除操作。
- 将 `Ctrl + C` 转换为中断信号。
- 对输入字符进行缓冲和处理。

切换到 Raw Mode 后，输入字符会更直接地传递给前台程序。

**fg —— Foreground**

将之前被挂起的作业恢复到前台运行。

例如：

```
Ctrl + Z
```

挂起当前前台程序，返回本地 Shell。

随后：

```
fg
```

将之前挂起的程序重新恢复到前台。

**完整操作：**

```
Ctrl + Z       # 挂起 Netcat，返回本地终端
stty raw -echo # 切换本地终端模式，关闭回显
fg             # 恢复 Netcat 前台运行
```

### 4.4 恢复终端设置

执行：

```
stty raw -echo
```

之后，本地终端的属性已经发生改变。

如果直接退出反弹 Shell，可能导致本地终端出现：

- 输入不显示。
- 回车换行异常。
- 终端显示混乱。

可以执行：

```
stty sane
```

恢复常规终端设置。

> `stty -g` 可以输出当前终端属性的可恢复表示，但单独执行它只是显示配置，并不会自动保存配置。若需要精确恢复，可以先将输出保存到 Shell 变量中，再通过 `stty "$变量"` 恢复。

## 5. Lateral Movement —— 横向切换用户

获得初始 Shell 后，开始枚举目标系统中的用户信息及敏感文件。

### 5.1 用户信息枚举

首先查看 `/etc/passwd`：

```
cat /etc/passwd | grep -v nologin
```

`/etc/passwd` 保存系统用户账户的基本信息。

这里通过 `grep -v nologin` 排除包含 `nologin` 的用户记录，初步筛选可能具有交互式登录能力的账户。

> 注意：这只是简单筛选，不能完全判断用户是否能够登录。还需要结合 Shell 字段、账户状态等信息进行判断。

![image-20261108103434283](image-20261108103434283.png)

### 5.2 枚举用户目录

查看 `/home`：

```
ls -la /home
```

![image-20261108103527383](image-20261108103527383.png)

发现存在 `robot` 用户目录。

继续查看：

```
cd /home
ls

cd robot
ls
```

进一步检查其中的文件，发现一个包含用户密码 Hash 的文件。

![image-20261108103625121](image-20261108103625121.png)

由于当前已经获得了文件的读取权限，因此可以将 Hash 提取出来，保存到攻击机的 `hash.list` 中，进行离线密码爆破。

### 5.3 Hash 识别与密码爆破

使用 Hashcat 尝试破解：

```
sudo hashcat -a 0 -m 0 hash.list ~/.exegol/workspaces/Zer0-hex/rockyou.txt
```

查看已经破解的结果：

```
sudo hashcat -a 0 -m 0 hash.list ~/.exegol/workspaces/Zer0-hex/rockyou.txt --show
```

![image-20261108104308490](image-20261108104308490.png)

成功得到一组有效凭据：

```
username:passwd
```

#### Hashcat 参数解释

Hashcat 是一款高性能密码哈希破解工具（Password Recovery / Hash Cracking Tool）。

基本命令：

```
hashcat -a <Attack Mode> -m <Hash Type> <Hashfile> <Wordlist>
```

本次使用：

```
sudo hashcat -a 0 -m 0 hash.list rockyou.txt
```

| 参数          | 含义                   |
| ------------- | ---------------------- |
| `sudo`        | 使用管理员权限运行     |
| `hashcat`     | 调用哈希破解工具       |
| `-a 0`        | 使用字典攻击模式       |
| `-m 0`        | 指定哈希类型为 MD5     |
| `hash.list`   | 存放待破解 Hash 的文件 |
| `rockyou.txt` | 密码字典文件           |
| `--show`      | 显示已经破解的结果     |

**Attack Mode（攻击模式）**

`-a` 用于指定候选密码的生成方式。

| 参数   | 模式                   | 说明         |
| ------ | ---------------------- | ------------ |
| `-a 0` | Straight               | 字典攻击     |
| `-a 1` | Combination            | 两个字典组合 |
| `-a 3` | Brute-force / Mask     | 掩码攻击     |
| `-a 6` | Hybrid Wordlist + Mask | 字典 + 掩码  |
| `-a 7` | Hybrid Mask + Wordlist | 掩码 + 字典  |

**Hash Type（哈希类型）**

`-m` 用于指定待破解 Hash 的算法类型。

| 参数      | 哈希算法    |
| --------- | ----------- |
| `-m 0`    | MD5         |
| `-m 100`  | SHA1        |
| `-m 1400` | SHA2-256    |
| `-m 1700` | SHA2-512    |
| `-m 1000` | NTLM        |
| `-m 1800` | sha512crypt |
| `-m 500`  | md5crypt    |

**一个重要区别：MD5 与 md5crypt 并不是一回事。**

- 普通 MD5：`-m 0`
- Linux `$1$` 格式的 md5crypt：`-m 500`

不能仅仅看到 MD5 就直接使用 `-m 0`，需要先识别 Hash 的实际格式。

#### 在线 Hash 查询

也可以尝试使用在线 Hash 查询网站：

- [CMD5](https://cmd5.com)
- [SOMD5](https://somd5.com)

### 5.4 切换至 robot 用户

查看目标机器的监听端口：

```shell
netstat -lntp
```

该命令用于查看 TCP 监听端口及对应进程信息。

当前没有发现 SSH 服务，但发现了一个 FTP 服务（21 端口）。

随后使用刚刚爆破得到的凭据切换用户：

```shell
su robot
```

查看当前用户及所属组：

```shell
id
```

检查是否具有 sudo 权限：

```shell
sudo -l
```

返回：

```text
Sorry, user robot may not run sudo on linux.
```

说明当前 `robot` 用户没有 sudo 授权，不能直接通过 sudo 执行提权操作。

不过，用户切换已经成功，接下来继续进行权限枚举。

## 6. Privilege Escalation —— SUID 提权

### 6.1 SUID 文件枚举

Linux 中的 SUID（Set User ID）是一种特殊权限。

当具有 SUID 权限的可执行文件被运行时，进程可以使用文件所有者的有效 UID（EUID）执行，而不只是使用当前登录用户的身份。

因此，可以通过查找 SUID 文件，寻找潜在的提权入口。

执行：

```shell
find / -perm -u=s -type f 2>/dev/null
```

参数解释：

| 参数          | 含义                                                   |
| ------------- | ------------------------------------------------------ |
| `find /`      | 从根目录开始递归查找                                   |
| `-perm -u=s`  | 查找设置了 User SUID 位的文件                          |
| `-type f`     | 只查找普通文件                                         |
| `2>/dev/null` | 将标准错误输出重定向到 `/dev/null`，隐藏权限不足等报错 |

![image-20261108105445476](image-20261108105445476.png)

在枚举结果中发现 Nmap 具有 SUID 权限。

### 6.2 GTFOBins 查询利用方式

对于发现的特殊权限文件，可以使用 GTFOBins 查询其是否存在可利用的提权方式。

网站：[GTFOBins](https://gtfobins.github.io/)

GTFOBins 收集了 Linux/Unix 环境中常见二进制文件在特定配置下可能产生的安全影响及利用方式，包括：

- SUID
- Sudo
- Capabilities
- Shell
- File Read
- File Write

在 GTFOBins 中查询 Nmap：

![image-20261108110146970](image-20261108110146970.png)

发现 Nmap 存在 SUID 利用方式。

### 6.3 Nmap SUID 提权

根据 GTFOBins 提供的利用思路，利用具有 SUID 权限的 Nmap 获取更高权限。

![image-20261108110409437](image-20261108110409437.png)

这里需要明确一个关键区别：

**SUID 提权关注的是有效 UID，而不是所属组。**

例如：

```text
uid=1002(robot) euid=0(root)
```

意味着：

- `uid=1002(robot)`：当前真实用户仍然是 robot。
- `euid=0(root)`：当前进程的有效用户身份已经是 root。

因此，即使真实用户仍然显示为 robot，也可能已经获得了 Root 权限。

成功获得 Root 权限后，进入之前无法读取的目录，获取最后的 Flag。

```shell
cd /root
ls -la
```

至此，成功取得 Root 权限，Mr-Robot 1 打靶结束。

![image-20261108105242988](image-20261108105242988.png)

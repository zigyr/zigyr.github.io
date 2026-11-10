---
description: 本文档记录了 VulnHub Mr-Robot 靶机的完整渗透测试过程，涵盖信息收集、Web 枚举、WordPress 用户名枚举与密码爆破、后台主题文件修改获取 PHP 反弹 Shell、PTY 交互升级、从敏感文件获取 robot 用户 Hash 并破解切换用户，以及利用 Nmap SUID 提权至 root 的攻击链路。文中同时整理了 Nmap、DIRB、WPScan、Hashcat、GTFOBins 等工具命令速查表与关键技术说明，适合作为 WordPress 靶场渗透与 SUID 提权的学习笔记。
---

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

| 技术 / 工具 | 操作 / Command         | 作用           |
| ----------- | ---------------------- | -------------- |
| Netcat 监听 | `rlwrap nc -lvnp 2233` | 接收反弹 Shell |

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

| 技术 / 工具      | Command                                   | 作用              |
| ---------------- | ----------------------------------------- | ----------------- |
| Hashcat 字典攻击 | `hashcat -a 0 -m 0 hash.list rockyou.txt` | 破解 MD5          |
| 查看破解结果     | `hashcat -m 0 hash.list --show`           | 显示已破解密码    |
| 监听端口枚举     | `netstat -lntp`                           | 查看 TCP 监听端口 |

### 6. Privilege Escalation —— 提权

| 技术 / 工具 | Command                                 | 作用           |
| ----------- | --------------------------------------- | -------------- |
| SUID 枚举   | `find / -perm -u=s -type f 2>/dev/null` | 查找 SUID 文件 |

## 1. Recon —— 信息收集

```shell
nmap -sn 192.168.56.1/24 --min-rate 1000
IP = 192.168.56.115
nmap -A $IP -oN nmap.txt -p `nmap -sS -sU -p- -Pn $IP --min-rate 8888 | grep '/tcp\|/udp' | awk -F '/' '{print $1}' | sort -u | tr '\n' ','`
```

![image-20261108091128272](image-20261108091128272.png)

### SSL 证书与域名发现

在扫描结果中，`ssl-cert` 脚本发现了一个域名：

```
Subject: commonName=www.example.com
```

> 证书中的 `commonName`（CN）提供了目标站点的域名线索
>
> 因此，将该域名添加到本地 `hosts` 文件中，建立域名与目标 IP 的映射关系

```shell
sudo nano /etc/hosts

# 添加：192.168.56.115 www.example.com
```

这样，访问 `www.example.com` 时，系统就会将其解析到 `192.168.56.115`

![image-20261108091845532](image-20261108091845532.png)

## 2. Web —— Web 信息收集

### 2.1 目录扫描

```
dirb http://www.example.com/ -o results.txt
```

![image-20261108092255311](image-20261108092255311.png)

### 2.2 robots.txt 信息泄露

访问后发现两个值得关注的资源：

- `key-1-of-3.txt`：包含第一段 Flag，保存到渗透笔记中![image-20261108093002545](image-20261108093002545.png)

- `fsocity.dic`：一个体量较大的字典文件，后续用于用户名及密码爆破

  ```shell
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

  ![image-20261108180214489](image-20261108180214489.png)

> **wc —— Word Count**，用于统计文件中的行数、单词数和字节数，`wc [OPTION] [FILE]`
>
> ```shell
> wc fsocity.dic
> # 858160  858160  7245381 fsocity.dic
> ```
>
> | 参数 | 含义  | 统计内容 |
> | ---- | ----- | -------- |
> | `-l` | lines | 行数     |
> | `-w` | words | 单词数   |
> | `-c` | bytes | 字节数   |
> | `-m` | chars | 字符数   |
>
> **sort -u —— 排序并去重**，`sort [OPTION] [FILE]`
>
> | 参数 | 含义                 |
> | ---- | -------------------- |
> | `-u` | unique，去重         |
> | `-r` | reverse，逆序排序    |
> | `-n` | 按数值大小排序       |
> | `-f` | 忽略大小写           |
> | `-o` | 将结果输出到指定文件 |
>
> `sort -u` 适合处理这种存在大量重复项的字典，可以减少后续爆破的无效尝试

### 2.3 Web 指纹识别

```
whatweb http://www.example.com/0/
```

![image-20261108092508439](image-20261108092508439.png)

从扫描结果中判断目标站点使用了 WordPress

接下来使用针对 WordPress 的专用扫描工具 WPScan，进一步探测其版本、插件、主题及用户信息

### 2.4 WPScan 漏洞探测

```shell
wpscan --url http://192.168.56.115/
```

![image-20261108094537121](image-20261108094537121.png)

> 扫描过程中关注以下信息：
>
> - WordPress 版本
> - 已安装的插件及主题
> - 可枚举的用户
> - 可能存在的安全问题

根据扫描得到的版本信息，结合 Searchsploit 查询相关漏洞：

```
searchsploit wordpress <VERSION>
```

发现存在用户名枚举相关的漏洞线索：![image-20261108095350184](image-20261108095350184.png)

## 3. Initial Access —— 获取初始访问权限

### 3.1 登录入口发现

尝试访问登录页面：`http://www.example.com/login`

发现其重定向到了：`http://www.example.com/login.php`

![image-20261108095035673](image-20261108095035673.png)

### 3.2 用户名枚举

这里使用之前从 `robots.txt` 中获取并处理过的 `fsocity.dic` 作为字典，进行枚举有效用户名

> WordPress 的密码重置功能可能存在用户名枚举问题
>
> 其基本原理是：
>
> 用户在忘记密码页面提交用户名或邮箱后，服务器会根据账户是否存在返回不同的提示
>
> 攻击者可以利用这种响应差异，判断某个用户名是否有效

![image-20261108095936911](image-20261108095936911.png)

> **Burp Suite 中的 Case Sensitive**
>
> 用于决定匹配文本时，是否区分大小写

### 3.3 密码爆破

得到有效用户名后，在实际登陆页面，用上一步的字典 `fsocity.dic` 尝试密码爆破

![image-20261108100331695](image-20261108100331695.png)

最终得到一组 `username:passwd` 有效凭据

并登录 WordPress 后台

### 3.4 WordPress 后台文件修改

成功进入后台后，发现在 `插件 → 插件文件编辑器` 中，可以直接修改部分插件对应的 PHP 文件

这意味着，如果能够修改并执行服务器上的 PHP 文件，就有机会利用 PHP 代码执行获得初始 Shell

首先尝试修改插件 `hello.php` ：

```
<?php
    echo 123;
    phpinfo();
?>
```

![image-20261108100816566](image-20261108100816566.png)

修改后，多次刷新对应插件页面 `http://www.example.com/wp-content/plugins/<plugin_name>`，始终没有观察到预期效果

### 3.5 尝试修改 404 模板

插件这条路径没有得到预期效果，于是转而尝试修改 WordPress 主题文件 **404 模板**

当用户访问一个不存在的页面时，WordPress 会根据主题模板机制加载对应的 `404.php`

修改 404 模板：

```
<?php
    echo 123;
?>
```

访问 `https://www.example.com/404.php`，观察到预期输出

同时 `curl http://www.example.com/404.php -k` 也存在回显

![image-20261108101452260](image-20261108101452260.png)

至此，成功验证了可以通过修改主题 PHP 文件实现代码执行

### 3.6 获取 Reverse Shell

接下来，将原本的测试代码替换为 PHP 反弹 Shell

```
rlwrap nc -lvnp 2233
```

随后，在目标 PHP 文件中尝试不同的反弹 Shell 方式：![image-20261108102523814](image-20261108102523814.png)

初期尝试的一些简单反弹 Shell 没有得到预期效果，于是转而尝试更复杂的 PHP 反弹 Shell![image-20261108102235784](image-20261108102235784.png)

最终成功建立反向连接，获得目标机器的命令行访问权限

## 4. Shell —— 交互体验升级

> 通过 Netcat 获得的反弹 Shell，通常只是一个不完整的交互式 Shell，缺少完整的伪终端（PTY）支持
>
> 可能出现的问题：
>
> - 方向键无法正常编辑命令
> - `Ctrl + C` 无法正常中断程序
> - 无法正常使用 `vim`、`top` 等交互式程序
> - 终端回显异常
> - 无法正常处理终端尺寸及控制字符
>
> 因此，需要进一步升级 Shell

```shell
export TERM=xterm

python -c 'import pty;pty.spawn("/bin/bash")'

`Ctrl + Z`
stty raw -echo; fg
```

## 5. Lateral Movement —— 横向切换用户

获得初始 Shell 后，开始枚举目标系统中的用户信息及敏感文件

- 用户信息枚举，`cat /etc/passwd | grep -v nologin`

> `grep -v nologin` 排除包含 `nologin` 的用户记录

![image-20261108103434283](image-20261108103434283.png)

- 枚举用户目录，`ls -la /home`

![image-20261108103527383](image-20261108103527383.png)

发现存在 `robot` 用户目录

进一步检查其中文件，发现一个 Hash 的文件：![image-20261108103625121](image-20261108103625121.png)

读取并保存到攻击机的 `hash.list` 中，尝试离线密码爆破

### Hash 识别与密码爆破

```shell
sudo hashcat -a 0 -m 0 hash.list ~/.exegol/workspaces/Zer0-hex/rockyou.txt

# 查看已经破解的结果：
sudo hashcat -a 0 -m 0 hash.list ~/.exegol/workspaces/Zer0-hex/rockyou.txt --show
```

![image-20261108104308490](image-20261108104308490.png)

成功得到一组 `username:passwd` 有效凭据

> Hashcat 是一款高性能密码哈希破解工具（Password Recovery / Hash Cracking Tool）
>
> ```shell
> hashcat -a <Attack Mode> -m <Hash Type> <Hashfile> <Wordlist>
> ```
>
> | 参数          | 含义                   |
> | ------------- | ---------------------- |
> | `sudo`        | 使用管理员权限运行     |
> | `hashcat`     | 调用哈希破解工具       |
> | `-a 0`        | 使用字典攻击模式       |
> | `-m 0`        | 指定哈希类型为 MD5     |
> | `hash.list`   | 存放待破解 Hash 的文件 |
> | `rockyou.txt` | 密码字典文件           |
> | `--show`      | 显示已经破解的结果     |
>
> **Attack Mode（攻击模式）**
>
> `-a` 用于指定候选密码的生成方式
>
> | 参数   | 模式                   | 说明         |
> | ------ | ---------------------- | ------------ |
> | `-a 0` | Straight               | 字典攻击     |
> | `-a 1` | Combination            | 两个字典组合 |
> | `-a 3` | Brute-force / Mask     | 掩码攻击     |
> | `-a 6` | Hybrid Wordlist + Mask | 字典 + 掩码  |
> | `-a 7` | Hybrid Mask + Wordlist | 掩码 + 字典  |
>
> **Hash Type（哈希类型）**
>
> `-m` 用于指定待破解 Hash 的算法类型
>
> | 参数      | 哈希算法    |
> | --------- | ----------- |
> | `-m 0`    | MD5         |
> | `-m 100`  | SHA1        |
> | `-m 1400` | SHA2-256    |
> | `-m 1700` | SHA2-512    |
> | `-m 1000` | NTLM        |
> | `-m 1800` | sha512crypt |
> | `-m 500`  | md5crypt    |
>
> **MD5 与 md5crypt 并不是一回事**：
>
> - 普通 MD5：`-m 0`
> - Linux `$1$` 格式的 md5crypt：`-m 500`
>
> 不能仅仅看到 MD5 就直接使用 `-m 0`，需要先识别 Hash 的实际格式

#### 在线 Hash 查询

也可以尝试使用在线 Hash 查询网站：

- [CMD5](https://cmd5.com)
- [SOMD5](https://somd5.com)

### 5.4 切换至 robot 用户

查看当前用户及所属组：

```shell
id
```

检查是否具有 sudo 权限：

```shell
sudo -l

# Sorry, user robot may not run sudo on linux.
```

说明当前 `robot` 用户没有 sudo 授权，不能直接通过 sudo 执行提权操作

不过，用户切换已经成功，接下来继续进行权限枚举

## 6. Privilege Escalation —— SUID 提权

### 6.1 SUID 文件枚举

> Linux 中的 SUID（Set User ID）是一种特殊权限
>
> 当具有 SUID 权限的可执行文件被运行时，进程可以使用文件所有者的有效 UID（EUID）执行，而不只是使用当前登录用户的身份

查找 SUID 文件，寻找潜在的提权入口

```shell
find / -perm -u=s -type f 2>/dev/null
```

> | 参数          | 含义                                                   |
> | ------------- | ------------------------------------------------------ |
> | `find /`      | 从根目录开始递归查找                                   |
> | `-perm -u=s`  | 查找设置了 User SUID 位的文件                          |
> | `-type f`     | 只查找普通文件                                         |
> | `2>/dev/null` | 将标准错误输出重定向到 `/dev/null`，隐藏权限不足等报错 |

![image-20261108105445476](image-20261108105445476.png)

在枚举结果中发现 Nmap 具有 SUID 权限



### 6.2 GTFOBins 查询利用方式

在 [GTFOBins](https://gtfobins.github.io/) 中查询 Nmap 发现存在 SUID 利用方式：

![image-20261108110146970](image-20261108110146970.png)

### 6.3 Nmap SUID 提权

![image-20261108110409437](image-20261108110409437.png)

> 这里需要明确一个关键区别：
>
> **SUID 提权关注的是有效 UID，而不是所属组**
>
> 例如：
>
> ```text
> uid=1002(robot) euid=0(root)
> ```
>
> 意味着：
>
> - `uid=1002(robot)`：当前真实用户仍然是 robot
> - `euid=0(root)`：当前进程的有效用户身份已经是 root
>
> 因此，即使真实用户仍然显示为 robot，也可能已经获得了 Root 权限

至此，成功取得 Root 权限，Mr-Robot 1 打靶结束

![image-20261108105242988](image-20261108105242988.png)
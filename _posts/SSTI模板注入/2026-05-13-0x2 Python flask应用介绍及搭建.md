---
title: SSTI | 0x2 Python flask应用介绍及搭建
date: 2026-05-13 13:23:53 +0800
categories: [笔记]
tags: [SSTI]
mermaid: True
---

{%raw%}
```python
# 启动 Flask 模块，创建 Flask 类
from flask import Flask

# __name__ 是系统变量，表示当前 py 文件名
app = Flask(__name__)

# 路由
# 基于浏览器 URI 的资源寻址
@app.route("/benben")
def hello_ben():
    return "hello, benben"


@app.route("/dazhuang")
def hello_da():
    return "hello, dazhuang"


# 只能被 Python 直接执行
# 不能作为组件或模块被调用
if __name__ == "__main__":
    app.run(
        debug=True,      # 开发环境使用，修改代码后自动刷新；上线必须关闭
        host="0.0.0.0",  # 允许局域网内所有设备访问
        port=80          # 网站端口号（默认 5000）
    )
```

- 访问 `127.0.0.1:5000/dazhuang`，页面显示：`hello, dazhuang`

- 访问 `127.0.0.1:5000/benben`，页面显示：`hello, benben`
{%endraw%}
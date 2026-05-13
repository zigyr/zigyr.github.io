---
title: SSTI | 0x3 Python flask变量及方法
date: 2026-05-13 13:23:53 +0800
categories: [笔记]
tags: [SSTI]
mermaid: True
---

{%raw%}
## 变量规则
---

### 格式化符号

- `%s`：字符串

- `%d`：整数

- `%f`：浮点数

### 代码示例

```python
from flask import Flask

app = Flask(__name__)


@app.route('/hello/<name>')
def hello(name):
	# 格式化字符串
    return "hello %s" % name


@app.route('/int/<int:postID>')
def show_id(postID):
	# 格式化整数
    return "%d" % postID


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
```

上述代码通过格式化符号，形成一种`动态url`的效果

通过在路由参数中控制变量的值，可以动态构建 URL


代码效果展示：

- `127.0.0.1:5000/hello/动态变量`
	- 访问 `127.0.0.1:5000/hello/dazhuang`，页面显示：`hello dazhuang`
	- 访问 `127.0.0.1:5000/hello/benben`，页面显示：`hello benben`

- `127.0.0.1:5000/int/动态变量`
	- 访问 `127.0.0.1:5000/int/666`，页面显示：`666`


## 变量传参
---


### 示例代码

```python
from flask import Flask, redirect, url_for, request, render_template

app = Flask(__name__)


@app.route('/')
def index():
    return render_template("index.html")


@app.route('/success/<name>')
def success(name):
    return 'welcome %s' % name


# 指定允许的数据提交方式
@app.route('/login', methods=['POST', 'GET'])
def login():
    if request.method == 'POST':
        print(1)

        # POST 提交
        user = request.form['ben']

        # 重定向到 /success/<name>
        return redirect(url_for('success', name=user))

    else:
        print(2)

        # GET 提交
        user = request.args.get('ben')

        return redirect(url_for('success', name=user))


if __name__ == "__main__":
    app.run()
```
{%endraw%}
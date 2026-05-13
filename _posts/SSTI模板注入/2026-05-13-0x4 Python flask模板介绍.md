---
title: SSTI | 0x4 Python flask模板介绍
date: 2026-05-13 13:23:53 +0800
categories: [笔记]
tags: [SSTI]
mermaid: True
---

{%raw%}

# `render_template`

用于加载 HTML 文件，默认模板路径为 `templates` 目录

故`app.py`加载的`index.html`文件需放在此路径下

## 代码示例

app.py

```python
from flask import Flask, render_template

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    app.run()
```

templates/index.html

```html
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Title</title>
</head>
<body>
模板 html 展示页面
</body>
</html>
```

访问`127.0.0.1:5000`

即可进入 `index.html` 渲染的网页

```html
模板 html 展示页面
```

---

# 模板动态传参

app.py

```python
from flask import Flask, render_template, request

app = Flask(__name__)


@app.route('/', methods=['GET'])
def index():
    my_str = request.args.get('ben')
    my_int = 21

    my_array = [5, 2, 0, 1, 3, 1, 4]

    my_dict = {
        'name': 'dazhuang',
        'age': 18
    }

    return render_template(
        "index.html",
        my_str=my_str,
        my_int=my_int,
        my_array=my_array,
        my_dict=my_dict
    )


if __name__ == "__main__":
    app.run()
```

templates/index.html

```html
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Title</title>
</head>
<body>
模板 html 展示页面

<br>{{ my_str }}
<br>{{ my_int }}

<br>{% set a = 'dazhuang' %}
{{ a }}

<br>{{ my_array }}

<br>{{ my_dict }}
</body>
</html>
```

访问`127.0.0.1:5000?ben=benben`

页面显示：

```html
模板 html 展示页面
benben
21
dazhuang
[5, 2, 0, 1, 3, 1, 4]
{'name': 'dazhuang', 'age': 18}
```

---

# `render_template_string`

用于直接渲染字符串内容

## 代码示例

```python
from flask import Flask, request, render_template_string

app = Flask(__name__)


@app.route('/', methods=['GET'])
def index():
    my_str = "hello, world"
    my_int = request.args.get('ben')

    my_array = [5, 2, 0, 3, 1, 4]

    my_dict = {
        'name': 'dazhuang',
        'age': 18
    }

    return render_template_string(
        '<html lang="en">'
        '<head>'
        '<meta charset="utf-8">'
        '<title>Title</title>'
        '</head>'
        '<body>'
        '模板 html 展示页面'
        '<br>%s'
        '<br>%s'
        '</body>'
        '</html>' % (my_int, my_str)
    )


if __name__ == "__main__":
    app.run()
```

访问`127.0.0.1:5000?ben=hello`

页面回显：

```html
模板 html 展示页面
hello
hello, world
```
{%endraw%}
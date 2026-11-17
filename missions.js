globalThis.LabCourses = (() => {
  "use strict";

  const { HOME, LOG, LOG_TEXT, APP_ERRORS } = ShellLab;
  const home = name => HOME + "/" + name;
  const originalReadme = ShellLab.create().files[home("README.md")].text;
  const observed = (label, tip, example, test) => ({ label, tip, example, observe: test });
  const state = (label, tip, example, test) => ({ label, tip, example, state: test });
  const displayed = (result, name) => result.name === name && !result.redirectedPath;
  const withoutLineNumbers = text => text.replace(/^\d+:(?=\d{2}:\d{2}:\d{2} )/gm, "");

  const groups = [
    {
      name: "终端基础",
      levels: [
        {
          title: "初识终端",
          scenario: "你刚打开一台 Linux 练习机。先确认自己在哪，再看看目录里有哪些文件。",
          goals: [
            observed("显示当前工作目录", "<code>pwd</code> 会打印当前目录的绝对路径。", "pwd",
              result => displayed(result, "pwd")),
            observed("列出主目录内容，包含隐藏文件 <code>.profile</code>", "<code>ls</code> 默认隐藏点号开头的文件，<code>-a</code> 会把它们一起列出。", "ls -a",
              result => displayed(result, "ls") && result.hiddenShown && result.paths.includes(HOME) && result.listed.includes(home(".profile")))
          ]
        },
        {
          title: "在目录间移动",
          scenario: "项目放在主目录的 <code>projects</code> 里。进去看看，然后回到主目录。",
          goals: [
            observed("进入 <code>~/projects</code>", "用 <code>cd</code> 切换目录。提示符会显示你现在的位置。", "cd projects",
              (result, session) => result.name === "cd" && result.destination === home("projects") && session.cwd === home("projects")),
            observed("从 <code>~/projects</code> 回到主目录", "<code>..</code> 表示上一级目录。只输入 <code>cd</code> 也能回主目录。", "cd ..",
              (result, session, marks) => marks[0] && result.name === "cd" && result.from === home("projects") && session.cwd === HOME)
          ]
        },
        {
          title: "创建目录与文件",
          scenario: "在主目录创建一个练习目录，并准备一个空白记事文件。",
          goals: [
            state("创建目录 <code>~/practice</code>", "<code>mkdir</code> 用于创建目录。", "mkdir ~/practice",
              files => files[home("practice")]?.kind === "dir"),
            state("创建空文件 <code>~/practice/notes.txt</code>", "<code>touch</code> 可创建空文件。路径前缀指定文件存放的位置。", "touch ~/practice/notes.txt",
              files => files[home("practice/notes.txt")]?.text === "")
          ]
        }
      ]
    },
    {
      name: "文件操作",
      levels: [
        {
          title: "备份与重命名",
          scenario: "给 <code>README.md</code> 做一份备份，并把备份改名为 <code>README.bak</code>。",
          goals: [
            observed("把 <code>README.md</code> 复制为 <code>~/backup.md</code>", "<code>cp</code> 的第一个参数是源文件，第二个是目标。", "cp ~/README.md ~/backup.md",
              (result, { files }) => result.name === "cp" && files[home("backup.md")]?.text === originalReadme && files[home("README.md")]?.text === originalReadme),
            state("把副本改名为 <code>README.bak</code>，保留原文件", "<code>mv</code> 可以移动文件，也能在同一目录内改名。", "mv ~/backup.md ~/README.bak",
              (files, marks) => marks[0] && !files[home("backup.md")] && files[home("README.md")]?.text === originalReadme && files[home("README.bak")]?.text === originalReadme)
          ]
        },
        {
          title: "写入与追加",
          scenario: "在 <code>~/status.txt</code> 里记录状态。第一行写 <code>ready</code>，第二行追加 <code>checked</code>。",
          goals: [
            observed("用重定向写入第一行 <code>ready</code>", "<code>&gt;</code> 将输出写入文件。已有内容会被覆盖。", "echo ready > ~/status.txt",
              (result, { files }) => result.redirectedPath === home("status.txt") && files[home("status.txt")]?.text === "ready\n"),
            state("文件包含 <code>ready</code> 和 <code>checked</code> 两行", "<code>&gt;&gt;</code> 会保留已有内容，在文件末尾追加。", "echo checked >> ~/status.txt",
              (files, marks) => marks[0] && files[home("status.txt")]?.text === "ready\nchecked\n")
          ]
        },
        {
          title: "清理临时文件",
          scenario: "<code>~/scratch</code> 中有一个废弃文件。先确认目录内容，再只删除废弃文件。",
          goals: [
            observed("列出 <code>~/scratch</code> 中的 <code>stale.tmp</code> 和 <code>keep.txt</code>", "可以直接给 <code>ls</code> 一个目录路径。", "ls ~/scratch",
              result => displayed(result, "ls") && result.paths.includes(home("scratch")) && ["stale.tmp", "keep.txt"].every(name => result.listed.includes(home("scratch/" + name)))),
            state("删除 <code>stale.tmp</code>，保留 <code>keep.txt</code>", "<code>rm</code> 后面只写要删的文件路径。", "rm ~/scratch/stale.tmp",
              files => !files[home("scratch/stale.tmp")] && files[home("scratch/keep.txt")]?.text === "keep this file\n")
          ]
        }
      ]
    },
    {
      name: "日志与管道",
      levels: [
        {
          title: "定位错误日志",
          scenario: "支付服务报错了。先看 <code>/var/log/app.log</code> 的最近记录，再从完整日志里筛出错误。",
          goals: [
            observed("把日志最后 3 行显示在终端", "<code>tail -n</code> 控制要查看的末尾行数。", "tail -n 3 /var/log/app.log",
              result => displayed(result, "tail") && result.output === LOG_TEXT.trimEnd().split("\n").slice(-3).join("\n") + "\n"),
            observed("用 <code>grep</code> 找到全部 <code>ERROR</code> 行", "<code>grep</code> 先接匹配模式，再接文件路径。", "grep ERROR /var/log/app.log",
              result => displayed(result, "grep") && withoutLineNumbers(result.output) === APP_ERRORS)
          ]
        },
        {
          title: "用管道统计错误",
          scenario: "值班记录里需要一个数字。先从 <code>app.log</code> 筛出错误，再计算错误行数。",
          goals: [
            observed("用 <code>grep</code> 筛出全部错误行", "先单独执行，看看筛选结果。也可以直接组成下一步的管道。", "grep ERROR /var/log/app.log",
              result => result.results.some(stage => stage.name === "grep" && withoutLineNumbers(stage.output) === APP_ERRORS)),
            observed("用 <code>| wc -l</code> 输出错误总数", "管道 <code>|</code> 把左边的输出作为右边的输入。<code>wc -l</code> 计算行数。", "grep ERROR /var/log/app.log | wc -l",
              result => displayed(result, "wc") && result.countLines && result.output.trim() === "3" &&
                result.results.at(-2)?.name === "grep" && withoutLineNumbers(result.results.at(-2).output) === APP_ERRORS)
          ]
        },
        {
          title: "按名称查找文件",
          scenario: "你只知道日志集中在 <code>/var/log</code>。找出其中后缀为 <code>.log</code> 的文件，再打开访问日志。",
          goals: [
            observed("用 <code>find</code> 找出两个 <code>.log</code> 文件", "<code>-name</code> 按名称匹配。实际使用时给 <code>*.log</code> 加引号，由 <code>find</code> 处理通配符。", "find /var/log -name '*.log'",
              result => displayed(result, "find") && result.found.length === 2 && [LOG, "/var/log/access.log"].every(path => result.found.includes(path))),
            observed("用 <code>cat</code> 读取 <code>access.log</code>", "<code>cat</code> 可直接打印小文件的完整内容。", "cat /var/log/access.log",
              (result, { files }) => displayed(result, "cat") && files["/var/log/access.log"]?.text &&
                result.output.replace(/^\s*\d+\t/gm, "") === files["/var/log/access.log"].text)
          ]
        }
      ]
    },
    {
      name: "服务器排障",
      levels: [
        {
          title: "查看与修改权限",
          scenario: "调整 <code>~/deploy.sh</code> 的权限，让所有者可读写、所属组只读、其他用户无权限。",
          goals: [
            observed("用长格式查看 <code>deploy.sh</code> 的权限", "<code>ls -l</code> 输出左边的 <code>rwx</code> 字段就是文件权限。", "ls -l ~/deploy.sh",
              result => displayed(result, "ls") && result.long && result.listed.includes(home("deploy.sh"))),
            state("将 <code>deploy.sh</code> 的权限设为 <code>640</code>", "<code>r=4</code>、<code>w=2</code>、<code>x=1</code>。三位数字对应所有者、所属组、其他用户。", "chmod 640 ~/deploy.sh",
              files => files[home("deploy.sh")]?.kind === "file" && files[home("deploy.sh")].mode === "640")
          ]
        },
        {
          title: "检查进程与磁盘",
          scenario: "你收到支付服务告警。确认进程在运行，再核对磁盘使用率。",
          goals: [
            observed("用管道从进程表筛出 <code>payments</code>", "<code>ps -ef</code> 显示进程表。把它交给 <code>grep</code> 后会看到目标进程。", "ps -ef | grep payments",
              result => displayed(result, "grep") && result.results.at(-2)?.name === "ps" && result.output.trim().split("\n").length === 1 && result.output.includes("/usr/bin/payments")),
            observed("以易读单位查看文件系统的磁盘用量", "<code>df -h</code> 使用 G、M 等单位输出文件系统容量。", "df -h",
              result => displayed(result, "df") && result.human)
          ]
        },
        {
          title: "值班交接",
          scenario: "把应用的错误日志整理到主目录的 <code>incident.log</code>，并将读取和写入权限限制给文件所有者。",
          goals: [
            state("把所有 <code>ERROR</code> 行保存到 <code>~/incident.log</code>", "先筛选完整应用日志，再用 <code>&gt;</code> 把输出写入报告。", "grep ERROR /var/log/app.log > ~/incident.log",
              files => files[home("incident.log")]?.text === APP_ERRORS),
            state("将 <code>incident.log</code> 的权限设置为 <code>600</code>", "所有者可读写是 <code>6</code>，所属组与其他用户无权限均用 <code>0</code>。", "chmod 600 ~/incident.log",
              files => files[home("incident.log")]?.kind === "file" && files[home("incident.log")].mode === "600")
          ]
        }
      ]
    }
  ];

  const levels = groups.flatMap(group => group.levels.map(level => ({ ...level, group: group.name })));

  function grade(level, session, marks, result) {
    if (result.status === 0 && !result.error) {
      level.goals.forEach((goal, index) => {
        if (goal.observe?.(result, session, marks)) marks[index] = true;
      });
    }
    return level.goals.map((goal, index) => goal.state ? Boolean(goal.state(session.files, marks)) : Boolean(marks[index]));
  }

  const reference = [
    ["pwd", "显示当前工作目录的绝对路径。", "pwd"],
    ["ls", "列出内容。-a 显示隐藏文件，-l 以长格式展示，-h 显示易读大小。", "ls -alh"],
    ["cd", "切换目录。.. 是上一级，~ 是主目录，- 是上一次的位置。", "cd ~/projects"],
    ["whoami", "显示当前用户名。", "whoami"],
    ["mkdir", "创建目录。-p 自动创建缺少的父目录。", "mkdir -p ~/demo/notes"],
    ["touch", "文件不存在时创建一个空文件。", "touch ~/notes.txt"],
    ["cp", "复制文件，复制目录时用 -r。", "cp ~/README.md ~/README.bak"],
    ["mv", "移动文件或在同一目录重命名。", "mv ~/README.bak ~/backup.md"],
    ["rm", "删除文件，删除目录时用 -r。模拟环境允许重置练习。", "rm ~/scratch/stale.tmp"],
    ["rmdir", "删除空目录。", "rmdir ~/demo/notes"],
    ["cat", "显示完整文件内容。-n 添加行号。", "cat ~/README.md"],
    ["echo", "输出文字。可以配合 > 和 >> 写入文件。", "echo ready > ~/status.txt"],
    ["head", "显示文件开头。-n 指定行数。", "head -n 3 /var/log/app.log"],
    ["tail", "显示文件末尾。-n 指定行数。", "tail -n 3 /var/log/app.log"],
    ["grep", "按模式筛选行。-i 忽略大小写，-n 显示行号，-F 按原样匹配。", "grep -n ERROR /var/log/app.log"],
    ["wc", "统计行、词或字节。-l 表示统计行数。", "wc -l /var/log/app.log"],
    ["find", "按条件查找。-name 匹配名称，-type f 只匹配文件。", "find /var/log -name '*.log'"],
    ["sort", "对行排序。-r 逆序，-u 对结果去重。", "sort ~/services.txt"],
    ["uniq", "合并相邻重复行。-c 同时显示各组出现次数。", "sort ~/services.txt | uniq -c"],
    ["chmod", "修改权限。r=4、w=2、x=1，三位依次是所有者、组、其他。", "chmod 640 ~/deploy.sh"],
    ["ps", "显示进程列表。使用模拟进程表。", "ps -ef | grep payments"],
    ["df", "显示文件系统空间。-h 使用易读单位，容量为模拟数据。", "df -h"],
    ["|", "管道，把左侧命令的标准输出送到右侧命令。", "grep ERROR /var/log/app.log | wc -l"],
    [">", "把标准输出写入文件，原内容会被覆盖。", "echo ready > ~/status.txt"],
    [">>", "把标准输出追加到文件末尾。", "echo checked >> ~/status.txt"],
    ["clear", "清空终端输出，保留文件和关卡状态。", "clear"],
    ["help", "查看模拟终端支持的命令。", "help"]
  ];

  return { levels, groups, reference, grade };
})();

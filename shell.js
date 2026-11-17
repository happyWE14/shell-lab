globalThis.ShellLab = (() => {
  "use strict";

  const HOME = "/home/trainee";
  const LOG = "/var/log/app.log";
  const LOG_TEXT = [
    "08:40:00 INFO  payments listening on :8080",
    "08:41:12 WARN  connection pool busy",
    "08:42:06 ERROR payments upstream timeout",
    "08:43:20 INFO  retry succeeded",
    "08:44:51 ERROR cache connection refused",
    "08:45:23 INFO  health probe passed",
    "08:46:02 ERROR payments upstream timeout",
    "08:47:11 INFO  request completed",
    "08:48:35 WARN  disk usage above 75%"
  ].join("\n") + "\n";
  const APP_ERRORS = LOG_TEXT.split("\n").filter(line => line.includes("ERROR")).join("\n") + "\n";

  const directory = () => ({ kind: "dir", mode: "755" });
  const file = (text = "", mode = "644") => ({ kind: "file", text, mode });

  function create(setup = {}) {
    const files = Object.create(null);
    ["/", "/home", HOME, HOME + "/projects", HOME + "/projects/api", HOME + "/scratch", "/var", "/var/log", "/tmp"].forEach(path => { files[path] = directory(); });
    files[HOME + "/README.md"] = file("Shell Lab workspace\nUse the projects directory for code.\n");
    files[HOME + "/.profile"] = file('export EDITOR="vim"\n');
    files[HOME + "/projects/api/service.conf"] = file("PORT=8080\nSERVICE=payments\n");
    files[HOME + "/deploy.sh"] = file("#!/bin/sh\necho deploy\n", "755");
    files[HOME + "/scratch/stale.tmp"] = file("old temporary data\n");
    files[HOME + "/scratch/keep.txt"] = file("keep this file\n");
    files[HOME + "/services.txt"] = file("payments\napi\npayments\nworker\napi\n");
    files[LOG] = file(LOG_TEXT);
    files["/var/log/access.log"] = file("08:43:20 GET /health 200\n08:44:52 GET /checkout 503\n08:45:23 GET /health 200\n");
    files["/var/log/README"] = file("Rotated logs are stored here.\n");
    return { files, cwd: setup.cwd || HOME, previous: HOME };
  }

  const parent = path => path.slice(0, path.lastIndexOf("/")) || "/";
  const base = path => path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
  const under = (path, root) => root === "/" ? path !== "/" : path.startsWith(root + "/");
  const escapeRegex = text => text.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  const lines = text => text ? text.replace(/\n$/, "").split("\n") : [];
  const joined = list => list.length ? list.join("\n") + "\n" : "";

  function normalize(cwd, input) {
    if (input === "~" || input.startsWith("~/")) input = HOME + input.slice(1);
    const parts = (input.startsWith("/") ? input : cwd + "/" + input).split("/");
    const path = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") path.pop();
      else path.push(part);
    }
    return "/" + path.join("/");
  }

  function tokenize(input) {
    const tokens = [];
    let word = "", started = false, quote = "";
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === "\\" && quote !== "'") {
        if (++i >= input.length) throw Error("语法错误：反斜杠后缺少字符");
        const next = input[i];
        if (quote === '"' && !['"', "\\", "$", String.fromCharCode(96)].includes(next)) word += "\\";
        word += next;
        started = true;
        continue;
      }
      if (quote) {
        if (char === quote) quote = "";
        else word += char;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        started = true;
        continue;
      }
      if (/\s/.test(char) || /[|>]/.test(char)) {
        if (started) tokens.push({ value: word });
        word = "";
        started = false;
        if (char === ">" && input[i + 1] === ">") { tokens.push({ operator: ">>" }); i++; }
        else if (/[|>]/.test(char)) tokens.push({ operator: char });
        continue;
      }
      if (/[<&;]/.test(char)) throw Error("模拟终端支持 |、> 和 >>，其他操作符请拆成单条命令");
      word += char;
      started = true;
    }
    if (quote) throw Error("语法错误：引号未闭合");
    if (started) tokens.push({ value: word });
    return tokens;
  }

  function parse(input) {
    const stages = [[]];
    let redirect = null;
    const tokens = tokenize(input);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.operator) { stages.at(-1).push(token.value); continue; }
      if (token.operator === "|") {
        if (!stages.at(-1).length) throw Error("语法错误：管道前缺少命令");
        stages.push([]);
        continue;
      }
      if (!stages.at(-1).length || tokens.length - i !== 2 || tokens[i + 1].operator || !tokens[i + 1].value) {
        throw Error("语法错误：请在末尾使用 > 文件名 或 >> 文件名");
      }
      redirect = { operator: token.operator, target: tokens[i + 1].value };
      break;
    }
    if (!stages.at(-1).length) throw Error("语法错误：缺少命令");
    return { stages, redirect };
  }

  function flags(args, allowed) {
    const options = new Set(), rest = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--") { rest.push(...args.slice(i + 1)); break; }
      if (arg.startsWith("-") && arg.length > 1) {
        for (const flag of arg.slice(1)) {
          if (!allowed.includes(flag)) throw Error("未支持的选项 -" + flag);
          options.add(flag);
        }
      } else rest.push(arg);
    }
    return { options, rest };
  }

  function count(args, min, max = min, usage = "请检查参数数量") {
    if (args.length < min || args.length > max) throw Error(usage);
  }

  function run(session, input) {
    let parsed;
    const results = [];
    let redirectedPath = null;
    try {
      parsed = parse(input);
      if (parsed.redirect) {
        redirectedPath = normalize(session.cwd, parsed.redirect.target);
        if (session.files[redirectedPath]?.kind === "dir") throw Error(parsed.redirect.target + "：是一个目录");
        if (session.files[parent(redirectedPath)]?.kind !== "dir") throw Error(parsed.redirect.target + "：父目录不存在");
        if (!session.files[redirectedPath]) session.files[redirectedPath] = file();
        if (parsed.redirect.operator === ">") session.files[redirectedPath].text = "";
      }
      let data = null;
      for (const command of parsed.stages) {
        const environment = parsed.stages.length > 1 ? { ...session } : session;
        const result = execute(environment, command, data);
        results.push(result);
        data = result.output;
      }
      const final = results.at(-1);
      if (redirectedPath && session.files[redirectedPath]?.kind === "file") session.files[redirectedPath].text += final.output;
      return {
        ...final, output: redirectedPath ? "" : final.output,
        error: results.map(result => result.error).filter(Boolean).join("\n"),
        results, stages: parsed.stages, redirectedPath
      };
    } catch (error) {
      return { status: 2, output: "", error: error.message, results, stages: parsed?.stages ?? [], redirectedPath };
    }
  }

  function execute(session, command, stdin) {
    const [name, ...args] = command;
    const { files } = session;
    const pathOf = raw => normalize(session.cwd, raw);
    const names = path => Object.keys(files).filter(key => key !== path && parent(key) === path)
      .sort((left, right) => base(left).localeCompare(base(right), "en"));
    const resolve = raw => {
      const path = pathOf(raw);
      if (!files[path]) throw Error(raw + "：没有这个文件或目录");
      return path;
    };
    const read = raw => {
      if (raw === "-") return stdin || "";
      const path = resolve(raw);
      if (files[path].kind !== "file") throw Error(raw + "：是一个目录");
      return files[path].text;
    };
    const input = paths => paths.length ? paths.map(read).join("") : stdin || "";
    const writePath = raw => {
      const path = pathOf(raw);
      if (files[parent(path)]?.kind !== "dir") throw Error(raw + "：父目录不存在");
      return path;
    };
    const mkdir = (path, recurse) => {
      if (files[path]) {
        if (recurse && files[path].kind === "dir") return;
        throw Error(path + "：已存在");
      }
      if (recurse && !files[parent(path)]) mkdir(parent(path), true);
      if (files[parent(path)]?.kind !== "dir") throw Error(path + "：父目录不存在");
      files[path] = directory();
    };
    const ok = (output = "", details = {}) => ({ name, status: 0, output, ...details });
    try {
      switch (name) {
        case "pwd":
          count(args, 0);
          return ok(session.cwd + "\n");
        case "whoami":
          count(args, 0);
          return ok("trainee\n");
        case "ls": {
          const { options, rest } = flags(args, "alAh");
          const paths = (rest.length ? rest : ["."]).map(resolve);
          const listed = [];
          const hiddenShown = options.has("a") || options.has("A");
          const output = paths.map(path => {
            const isDir = files[path].kind === "dir";
            const entries = isDir ? names(path).filter(key => hiddenShown || !base(key).startsWith(".")) : [path];
            const items = entries.map(key => ({ key, name: base(key) }));
            if (isDir && options.has("a")) items.unshift({ key: path, name: "." }, { key: parent(path), name: ".." });
            listed.push(...items.map(item => item.key));
            const rendered = items.map(item => {
              if (!options.has("l")) return item.name;
              const entry = files[item.key];
              const size = entry.kind === "dir" ? 4096 : new TextEncoder().encode(entry.text).length;
              const sizeLabel = options.has("h") && size >= 1024 ? Math.round(size / 1024) + "K" : String(size);
              return modeText(entry) + "  trainee  trainee  " + sizeLabel.padStart(4) + "  " + item.name;
            });
            return (paths.length > 1 && isDir ? path + ":\n" : "") + joined(rendered);
          }).join(paths.length > 1 ? "\n" : "");
          return ok(output, { listed, paths, hiddenShown, long: options.has("l") });
        }
        case "cd": {
          count(args, 0, 1, "用法：cd [目录]");
          const old = session.cwd;
          const dest = resolve(args[0] === "-" ? session.previous : args[0] || HOME);
          if (files[dest].kind !== "dir") throw Error(args[0] + "：不是目录");
          session.cwd = dest;
          session.previous = old;
          return ok(args[0] === "-" ? dest + "\n" : "", { from: old, destination: dest });
        }
        case "mkdir": {
          const { options, rest } = flags(args, "p");
          count(rest, 1, Infinity, "用法：mkdir [-p] 目录");
          rest.forEach(raw => mkdir(pathOf(raw), options.has("p")));
          return ok();
        }
        case "touch": {
          const { rest } = flags(args, "");
          count(rest, 1, Infinity, "用法：touch 文件");
          rest.forEach(raw => {
            const path = writePath(raw);
            if (!files[path]) files[path] = file();
          });
          return ok();
        }
        case "cat": {
          const { options, rest } = flags(args, "n");
          const text = input(rest);
          return ok(options.has("n") ? joined(lines(text).map((line, index) => String(index + 1).padStart(6) + "\t" + line)) : text);
        }
        case "echo": {
          const noNewline = args[0] === "-n";
          return ok(args.slice(noNewline ? 1 : 0).join(" ") + (noNewline ? "" : "\n"));
        }
        case "head":
        case "tail": {
          let limit = 10;
          const paths = [];
          for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === "--") { paths.push(...args.slice(i + 1)); break; }
            if (arg === "-n") {
              const next = args[++i];
              if (!/^\d+$/.test(next ?? "")) throw Error("模拟选项 -n 需要一个非负整数");
              limit = Number(next);
            } else if (/^-(?:n)?\d+$/.test(arg)) limit = Number(arg.replace(/^-n?/, ""));
            else if (arg.startsWith("-") && arg !== "-") throw Error("模拟终端仅支持 -n 行数");
            else paths.push(arg);
          }
          const sources = paths.length ? paths : ["-"];
          const text = sources.map(raw => {
            const allLines = lines(read(raw));
            const selected = !limit ? [] : name === "head" ? allLines.slice(0, limit) : allLines.slice(-limit);
            return (sources.length > 1 ? "==> " + raw + " <==\n" : "") + joined(selected);
          }).join(sources.length > 1 ? "\n" : "");
          return ok(text);
        }
        case "grep": {
          const { options, rest } = flags(args, "invF");
          count(rest, 1, Infinity, "用法：grep [-invF] 模式 [文件]");
          const [pattern, ...paths] = rest;
          const patternText = options.has("F") ? escapeRegex(pattern) : pattern;
          let regex;
          try { regex = new RegExp(patternText, options.has("i") ? "i" : ""); }
          catch { throw Error("无效的匹配模式"); }
          const sources = paths.length ? paths : ["-"];
          const matches = sources.flatMap(raw => lines(read(raw)).flatMap((line, index) => {
            if (regex.test(line) === options.has("v")) return [];
            const prefix = (sources.length > 1 ? raw + ":" : "") + (options.has("n") ? index + 1 + ":" : "");
            return [prefix + line];
          }));
          return ok(joined(matches), { status: matches.length ? 0 : 1, noMatch: !matches.length });
        }
        case "wc": {
          const { options, rest } = flags(args, "lwc");
          const paths = rest.length ? rest : ["-"];
          const counts = paths.map(raw => {
            const data = read(raw);
            return [
              (data.match(/\n/g) || []).length,
              data.trim() ? data.trim().split(/\s+/).length : 0,
              new TextEncoder().encode(data).length
            ];
          });
          const labels = ["l", "w", "c"];
          const format = values => values.filter((_, i) => !options.size || options.has(labels[i])).join(" ");
          const output = counts.map((values, i) => format(values) + (paths[i] === "-" ? "" : " " + paths[i]));
          if (paths.length > 1) output.push(format(counts.reduce((a, b) => a.map((value, i) => value + b[i]), [0, 0, 0])) + " total");
          return ok(joined(output), { countLines: options.has("l") && options.size === 1 });
        }
        case "find": {
          const start = args[0] && !args[0].startsWith("-") ? args[0] : ".";
          const root = resolve(start);
          const tests = { pattern: null, kind: null };
          const terms = start === args[0] ? args.slice(1) : args;
          for (let i = 0; i < terms.length; i += 2) {
            const [option, value] = terms.slice(i, i + 2);
            if (option === "-name" && value) {
              const glob = new RegExp("^" + value.split(/([*?])/).map(part => part === "*" ? ".*" : part === "?" ? "." : escapeRegex(part)).join("") + "$");
              tests.pattern = glob;
            } else if (option === "-type" && ["f", "d"].includes(value)) tests.kind = value === "f" ? "file" : "dir";
            else throw Error("用法：find [目录] [-name 模式] [-type f|d]");
          }
          const found = Object.keys(files).filter(path => path === root || under(path, root)).sort()
            .filter(path => (!tests.pattern || tests.pattern.test(base(path))) && (!tests.kind || files[path].kind === tests.kind));
          const shown = found.map(path => path === root ? start : start.replace(/\/+$/, "") + "/" + path.slice(root === "/" ? 1 : root.length + 1));
          return ok(joined(shown), { found });
        }
        case "sort": {
          const { options, rest } = flags(args, "ru");
          let sorted = lines(input(rest)).sort();
          if (options.has("r")) sorted.reverse();
          if (options.has("u")) sorted = [...new Set(sorted)];
          return ok(joined(sorted));
        }
        case "uniq": {
          const { options, rest } = flags(args, "c");
          count(rest, 0, 1, "用法：uniq [-c] [文件]");
          const grouped = [];
          for (const line of lines(input(rest))) {
            if (grouped.at(-1)?.line === line) grouped.at(-1).count++;
            else grouped.push({ line, count: 1 });
          }
          return ok(joined(grouped.map(item => options.has("c") ? String(item.count).padStart(7) + " " + item.line : item.line)));
        }
        case "cp":
        case "mv": {
          const { options, rest } = flags(args, name === "cp" ? "rR" : "");
          count(rest, 2, 2, "用法：" + name + " 原路径 目标路径");
          const source = resolve(rest[0]);
          const initialDest = pathOf(rest[1]);
          const target = files[initialDest]?.kind === "dir" ? normalize(initialDest, base(source)) : writePath(rest[1]);
          if (target === source || under(target, source) || source === "/") throw Error("源路径和目标路径不能重合");
          if (files[source].kind === "dir") {
            if (name === "cp" && !options.has("r") && !options.has("R")) throw Error("复制目录时请加 -r");
            if (files[target]) throw Error("模拟终端要求目标目录不存在");
          } else if (files[target]?.kind === "dir") throw Error("无法用文件覆盖目录");
          const paths = Object.keys(files).filter(path => path === source || under(path, source));
          for (const path of paths) files[target + path.slice(source.length)] = { ...files[path] };
          if (name === "mv") {
            for (const path of paths) delete files[path];
            for (const key of ["cwd", "previous"]) {
              if (session[key] === source || under(session[key], source)) session[key] = target + session[key].slice(source.length);
            }
          }
          return ok();
        }
        case "rm":
        case "rmdir": {
          const { options, rest } = flags(args, name === "rm" ? "rfR" : "");
          count(rest, 1, Infinity, "用法：" + name + " 路径");
          for (const raw of rest) {
            const path = pathOf(raw);
            if (!files[path] && options.has("f")) continue;
            resolve(raw);
            if (path === "/" || path === session.cwd || under(session.cwd, path)) throw Error("练习中不能删除根目录或当前工作路径");
            if (name === "rmdir") {
              if (files[path].kind !== "dir") throw Error(raw + "：不是目录");
              if (names(path).length) throw Error(raw + "：目录非空");
            } else if (files[path].kind === "dir" && !options.has("r") && !options.has("R")) throw Error(raw + "：是目录，递归删除时请加 -r");
            for (const key of Object.keys(files)) if (key === path || under(key, path)) delete files[key];
          }
          return ok();
        }
        case "chmod": {
          count(args, 2, Infinity, "用法：chmod 权限 路径");
          const [mode, ...rest] = args;
          for (const raw of rest) {
            const entry = files[resolve(raw)];
            entry.mode = /^0?[0-7]{3}$/.test(mode) ? mode.slice(-3) : symbolicMode(entry.mode, mode);
          }
          return ok();
        }
        case "ps":
          if (flags(args, "efAaux").rest.some(arg => !/^[aux]+$/.test(arg))) throw Error("模拟示例：ps -ef 或 ps aux");
          return ok("UID        PID  PPID  CMD\nroot         1     0  /sbin/init\ntrainee    208     1  /usr/bin/worker\ntrainee    418     1  /usr/bin/payments --port 8080\ntrainee    564     1  /usr/bin/api --port 8081\n");
        case "df": {
          const { options, rest } = flags(args, "h");
          rest.forEach(resolve);
          return options.has("h")
            ? ok("Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   31G    9G  78% /\ntmpfs           2.0G   12M  2.0G   1% /tmp\n", { human: true })
            : ok("Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/vda1       41943040  32505856   9437184  78% /\ntmpfs            2097152     12288   2084864   1% /tmp\n");
        }
        case "help":
          count(args, 0);
          return ok("可用命令\npwd  ls  cd  whoami  mkdir  touch  cat  echo  cp  mv  rm  rmdir\nhead  tail  grep  find  wc  sort  uniq  chmod  ps  df  clear  help\n可使用管道 |、覆盖写入 >、追加写入 >>。选项和示例见「命令速查」。\n");
        case "clear":
          count(args, 0);
          return ok("", { clear: true });
        default:
          throw Error("找不到命令「" + name + "」。输入 help 查看模拟终端支持的命令。");
      }
    } catch (error) {
      return { name, status: 2, output: "", error: name + ": " + error.message };
    }
  }

  function modeText(entry) {
    return (entry.kind === "dir" ? "d" : "-") + [...entry.mode].map(digit =>
      [..."rwx"].map((char, index) => Number(digit) & (4 >> index) ? char : "-").join("")
    ).join("");
  }

  function symbolicMode(oldMode, input) {
    const mode = [...oldMode].map(Number);
    for (const clause of input.split(",")) {
      const match = /^([ugoa]+)([+=-])([rwx]*)$/.exec(clause);
      if (!match) throw Error("示例：chmod 640 文件 或 chmod u=rw,g=r,o= 文件");
      const [, who, operator, perms] = match;
      const value = [..."rwx"].reduce((bits, char, index) => perms.includes(char) ? bits | (4 >> index) : bits, 0);
      [..."ugo"].forEach((char, index) => {
        if (who.includes("a") || who.includes(char)) {
          mode[index] = operator === "=" ? value : operator === "+" ? mode[index] | value : mode[index] & ~value;
        }
      });
    }
    return mode.join("");
  }

  return { HOME, LOG, LOG_TEXT, APP_ERRORS, create, run };
})();

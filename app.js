(() => {
  "use strict";

  const { levels, groups, reference, grade } = LabCourses;
  const { HOME } = ShellLab;
  const key = "shell-lab-cn-v1";
  const icons = {
    flag: 'M5 21V4m0 1c4-4 8 2 14-1v11c-6 3-10-3-14 1',
    terminal: 'm5 7 5 5-5 5m8 0h6',
    book: 'M12 7c-3-3-7-3-10-2v14c3-1 7-1 10 2 3-3 7-3 10-2V5c-3-1-7-1-10 2zm0 0v14',
    layers: 'm12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5',
    chevron: 'm6 9 6 6 6-6',
    save: 'M4 4h14l2 2v14H4zm3 0v6h10V4m-9 16v-6h8v6',
    left: 'm14 6-6 6 6 6',
    right: 'm10 6 6 6-6 6',
    target: 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Zm-4 0a5 5 0 1 1-5-5 5 5 0 0 1 5 5Zm-5 0h.01',
    bulb: 'M9 19h6m-5 3h4m-5-6c0-3-3-3-3-7a6 6 0 1 1 12 0c0 4-3 4-3 7z',
    eraser: 'm8 21-5-5a2 2 0 0 1 0-3L12 4a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 9H8zm-1-12 9 9m-5 3h10',
    reset: 'M4 11a8 8 0 1 1 1.6 6M4 5v6h6',
    play: 'm8 5 11 7-11 7z',
    shield: 'M12 22c-4-2-8-5-8-11V5l8-3 8 3v6c0 6-4 9-8 11zm-3-10 2 2 4-4',
    close: 'm6 6 12 12M6 18 18 6',
    search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0zm-2 5 6 6',
    check: 'm5 12 4 4L19 6',
    insert: 'M18 5v8H6m4-4-4 4 4 4'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + icons[name] + '"/></svg>';
  }
  const $ = id => document.getElementById(id);
  document.querySelectorAll("[data-icon]").forEach(element => { element.innerHTML = icon(element.dataset.icon); });

  let storageAvailable = true;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key) || "{}") || {}; }
  catch { saved = {}; storageAvailable = false; }
  let position = Number.isInteger(saved.position) && levels[saved.position] ? saved.position : 0;
  let free = saved.free === true;
  const sessions = saved.sessions || {};
  const completed = new Set(Array.isArray(saved.completed) ? saved.completed.filter(index => Number.isInteger(index) && levels[index]) : []);
  const command = $("command");
  const terminalScreen = $("terminal-screen");
  const output = $("output");
  let hintOpen = false;
  let historyIndex = 0;
  let historyDraft = "";

  function current() {
    const id = free ? "free" : position;
    if (!sessions[id]) sessions[id] = newAttempt();
    return sessions[id];
  }

  function newAttempt() {
    return {
      shell: ShellLab.create(), marks: [], goals: [], entries: [], history: [],
      status: { message: "等待命令", type: "" }, welcome: true
    };
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify({ completed: [...completed], position, free, sessions }));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    $("storage-label").textContent = storageAvailable ? "进度保存在当前浏览器" : "当前浏览器无法保存进度";
  }

  const two = index => String(index + 1).padStart(2, "0");
  function renderMap() {
    const list = $("level-list");
    list.replaceChildren();
    let index = 0;
    for (const group of groups) {
      const section = document.createElement("div");
      section.className = "level-group";
      const heading = document.createElement("h3");
      heading.className = "group-title";
      heading.textContent = group.name;
      section.append(heading);
      for (const level of group.levels) {
        const levelIndex = index++;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "level-button";
        button.innerHTML = '<span class="level-num">' + two(levelIndex) + '</span><span>' + level.title + '</span>';
        const isCurrent = !free && levelIndex === position;
        const passed = completed.has(levelIndex);
        if (isCurrent) {
          button.classList.add("current");
          button.setAttribute("aria-current", "step");
        }
        if (isCurrent || passed) {
          const mark = document.createElement("span");
          mark.className = "level-mark" + (passed ? " passed" : "");
          mark.innerHTML = icon(passed ? "check" : "right");
          if (passed) mark.setAttribute("aria-label", "已通关");
          section.append(button);
          button.append(mark);
        } else section.append(button);
        button.addEventListener("click", () => {
          select(levelIndex, false);
          closeMap();
          if (matchMedia("(max-width: 880px)").matches) $("exercise-title").scrollIntoView({ block: "nearest" });
          else list.querySelector("[aria-current]")?.focus({ preventScroll: true });
        });
      }
      list.append(section);
    }
    $("sidebar-count").textContent = levels.length + " 关";
    $("progress-value").textContent = completed.size + " / " + levels.length;
    $("progress-bar").max = levels.length;
    $("progress-bar").value = completed.size;
  }

  function status(message, type = "") {
    const tag = $("terminal-status");
    tag.className = "terminal-status" + (type ? " " + type : "");
    tag.lastElementChild.textContent = message;
    current().status = { message, type };
  }

  function compactPath(path) {
    return path === HOME || path.startsWith(HOME + "/") ? "~" + path.slice(HOME.length) : path;
  }

  function promptContents(label, path) {
    const user = document.createElement("span");
    user.textContent = "trainee@lab";
    const separator = document.createElement("b");
    separator.textContent = ":";
    const cwd = document.createElement("em");
    cwd.textContent = compactPath(path);
    const suffix = document.createElement("b");
    suffix.textContent = "$";
    label.replaceChildren(user, separator, cwd, suffix);
  }

  function addEntry(entry) {
    const wrapper = document.createElement("div");
    wrapper.className = "term-entry";
    const line = document.createElement("div");
    line.className = "term-command";
    const prompt = document.createElement("span");
    prompt.className = "prompt";
    promptContents(prompt, entry.path);
    line.append(prompt, document.createTextNode(" " + entry.input));
    wrapper.append(line);
    if (entry.output || entry.error) {
      for (const [type, value] of [["result", entry.output], ["error", entry.error]]) {
        if (!value) continue;
        const text = document.createElement("pre");
        text.className = "term-output " + type;
        text.textContent = value.replace(/\n$/, "");
        wrapper.append(text);
      }
    }
    if (entry.feedback) {
      const feedback = document.createElement("p");
      feedback.className = "term-feedback";
      feedback.textContent = entry.feedback;
      wrapper.append(feedback);
    }
    output.append(wrapper);
  }

  function exampleButton(example, inDialog = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example";
    button.append(document.createTextNode(example));
    const glyph = document.createElement("span");
    glyph.innerHTML = icon("insert");
    button.append(glyph);
    button.setAttribute("aria-label", "填入命令 " + example);
    button.addEventListener("click", () => {
      if (inDialog) $("guide-dialog").close();
      command.value = example;
      historyIndex = current().history.length;
      command.focus();
    });
    return button;
  }

  function renderGoals() {
    const goalList = $("goals");
    const hintContent = $("hint-content");
    goalList.replaceChildren();
    hintContent.replaceChildren();
    $("hint-area").hidden = free;
    $("hint").setAttribute("aria-expanded", String(hintOpen));
    hintContent.hidden = !hintOpen;
    $("advance").hidden = true;
    if (free) {
      $("task-count").textContent = "";
      $("target-title").textContent = "练习建议";
      $("scenario").textContent = "试着查看目录、读取日志或组合命令。这里没有关卡判定，终端会反馈命令执行结果。";
      for (const example of ["ls -alh", "grep ERROR /var/log/app.log | wc -l", "sort ~/services.txt | uniq -c"]) {
        const item = document.createElement("li");
        item.className = "free-example";
        item.append(exampleButton(example));
        goalList.append(item);
      }
      return;
    }
    const level = levels[position];
    const attempt = current();
    $("target-title").textContent = "任务目标";
    $("scenario").innerHTML = level.scenario;
    $("task-count").textContent = attempt.goals.filter(Boolean).length + " / " + level.goals.length;
    level.goals.forEach((goal, index) => {
      const done = attempt.goals[index];
      const item = document.createElement("li");
      if (done) item.className = "done";
      item.innerHTML = '<span class="goal-check" data-icon aria-label="' + (done ? "已完成" : "未完成") + '">' +
        (done ? icon("check") : "") + '</span><span class="goal-text">' + goal.label + '</span>';
      goalList.append(item);
    });
    if (hintOpen) {
      const firstOpen = level.goals.findIndex((_, index) => !attempt.goals[index]);
      const goal = level.goals[Math.max(0, firstOpen)];
      const block = document.createElement("div");
      block.className = "hint-entry";
      block.innerHTML = goal.tip;
      block.append(exampleButton(goal.example));
      hintContent.append(block);
    }
    if (completed.has(position) && attempt.goals.length === level.goals.length && attempt.goals.every(Boolean)) {
      $("advance").hidden = false;
      $("advance-label").textContent = completed.size === levels.length ? "全部通关 · 自由练习" : position < levels.length - 1 ? "下一关" : "继续未完成关卡";
    }
  }

  function select(index, isFree) {
    position = index;
    free = isFree;
    hintOpen = false;
    renderView();
    save();
  }

  function renderView() {
    const attempt = current();
    const level = levels[position];
    $("free-mode").classList.toggle("active", free);
    $("missions-mode").classList.toggle("active", !free);
    $("free-mode").setAttribute("aria-pressed", String(free));
    $("missions-mode").setAttribute("aria-pressed", String(!free));
    $("hero-mode").textContent = free ? "自由练习模式" : "交互式 Linux 实验室";
    $("exercise-index").textContent = free ? ">_" : two(position);
    $("exercise-group").textContent = free ? "模拟终端" : level.group;
    $("exercise-title").textContent = free ? "自由练习" : level.title;
    $("exercise-nav").hidden = free;
    $("prev").disabled = position === 0;
    $("next").disabled = position === levels.length - 1;
    renderMap();
    renderGoals();
    output.replaceChildren();
    attempt.entries.forEach(addEntry);
    $("welcome").hidden = !attempt.welcome;
    promptContents($("prompt"), attempt.shell.cwd);
    status(attempt.status.message, attempt.status.type);
    command.value = "";
    historyIndex = attempt.history.length;
    historyDraft = "";
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  }

  function clearScreen() {
    const attempt = current();
    attempt.entries = [];
    attempt.welcome = false;
    $("welcome").hidden = true;
    output.replaceChildren();
    status("终端已清屏");
    save();
  }

  function execute(raw) {
    const attempt = current();
    const path = attempt.shell.cwd;
    attempt.history.push(raw);
    if (attempt.history.length > 80) attempt.history.shift();
    historyIndex = attempt.history.length;
    historyDraft = "";
    const result = ShellLab.run(attempt.shell, raw);
    if (result.clear && !result.error) { clearScreen(); return; }

    const entry = {
      path, input: raw,
      output: result.output.length > 18000 ? result.output.slice(0, 18000) + "\n…输出过长，已截断显示。" : result.output,
      error: result.error || (result.noMatch && !result.redirectedPath ? "grep: 没有匹配行" : ""),
      feedback: ""
    };
    const successful = !result.error && result.status === 0;
    if (!free) {
      const previous = attempt.goals;
      const updated = grade(levels[position], attempt.shell, attempt.marks, result);
      attempt.goals = updated;
      const achieved = updated.filter(Boolean).length;
      const gained = updated.filter((done, index) => done && !previous[index]).length;
      if (successful && achieved === levels[position].goals.length) {
        const justPassed = !previous.length || !previous.every(Boolean) || !completed.has(position);
        completed.add(position);
        status("本关通过", "good");
        if (justPassed) {
          entry.feedback = completed.size === levels.length ? "全部关卡已通过！" : "本关通过，所有任务目标已达成。";
          renderMap();
          hintOpen = false;
        }
      } else if (!successful) {
        status(result.error ? "命令执行失败" : "没有匹配结果", "bad");
      } else if (gained) {
        status("任务正确 · " + achieved + " / " + levels[position].goals.length, "good");
        entry.feedback = "已达成 " + gained + " 项任务目标。";
      } else {
        status("命令成功 · 本次未达成新目标");
      }
      renderGoals();
    } else {
      status(successful ? "命令执行成功" : (result.error ? "命令执行失败" : "没有匹配结果"), successful ? "good" : "bad");
    }
    attempt.entries.push(entry);
    addEntry(entry);
    if (attempt.entries.length > 55) {
      attempt.entries.shift();
      output.firstElementChild.remove();
    }
    promptContents($("prompt"), attempt.shell.cwd);
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
    save();
  }

  function closeMap() {
    $("map-toggle").setAttribute("aria-expanded", "false");
    $("level-list").classList.remove("open");
  }

  $("command-form").addEventListener("submit", event => {
    event.preventDefault();
    const raw = command.value.trim();
    if (raw) {
      command.value = "";
      execute(raw);
    }
    command.focus({ preventScroll: true });
  });

  command.addEventListener("keydown", event => {
    if (event.isComposing || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const history = current().history;
    if (event.key === "ArrowUp") {
      if (historyIndex === history.length) historyDraft = command.value;
      historyIndex = Math.max(0, historyIndex - 1);
    } else historyIndex = Math.min(history.length, historyIndex + 1);
    command.value = historyIndex === history.length ? historyDraft : history[historyIndex] || "";
    command.setSelectionRange(command.value.length, command.value.length);
  });

  $("map-toggle").addEventListener("click", () => {
    const expanding = $("map-toggle").getAttribute("aria-expanded") !== "true";
    $("map-toggle").setAttribute("aria-expanded", String(expanding));
    $("level-list").classList.toggle("open", expanding);
  });
  $("hint").addEventListener("click", () => {
    hintOpen = !hintOpen;
    renderGoals();
  });
  $("clear").addEventListener("click", clearScreen);
  $("reset").addEventListener("click", () => {
    sessions[free ? "free" : position] = newAttempt();
    hintOpen = false;
    renderView();
    status(free ? "练习已重置" : "本次练习已重置");
    save();
  });
  $("prev").addEventListener("click", () => select(position - 1, false));
  $("next").addEventListener("click", () => select(position + 1, false));
  $("missions-mode").addEventListener("click", () => { if (free) select(position, false); });
  $("free-mode").addEventListener("click", () => { if (!free) select(position, true); });
  document.querySelector(".brand").addEventListener("click", event => {
    event.preventDefault();
    if (free) select(position, false);
    window.scrollTo({ top: 0 });
  });
  $("advance").addEventListener("click", () => {
    if (completed.size === levels.length) select(position, true);
    else if (position < levels.length - 1) select(position + 1, false);
    else select(levels.findIndex((_, index) => !completed.has(index)), false);
    $("exercise-title").scrollIntoView({ block: "nearest" });
  });

  function renderGuide() {
    const filter = $("guide-search").value.trim().toLowerCase();
    const list = $("guide-list");
    list.replaceChildren();
    for (const [name, description, example] of reference) {
      if (![name, description, example].some(value => value.toLowerCase().includes(filter))) continue;
      const item = document.createElement("article");
      item.className = "guide-entry";
      const title = document.createElement("strong");
      title.textContent = name;
      const desc = document.createElement("p");
      desc.textContent = description;
      item.append(title, desc, exampleButton(example, true));
      list.append(item);
    }
    if (!list.children.length) {
      const message = document.createElement("p");
      message.className = "guide-empty";
      message.textContent = "没有找到匹配的命令。";
      list.append(message);
    }
  }

  $("guide").addEventListener("click", () => {
    $("guide-search").value = "";
    renderGuide();
    $("guide-dialog").showModal();
    $("guide-search").focus();
  });
  $("close-guide").addEventListener("click", () => $("guide-dialog").close());
  $("guide-search").addEventListener("input", renderGuide);
  renderView();
  save();
})();

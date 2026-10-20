(() => {
  "use strict";

  const STORAGE_KEY = "idea-tree-data-v1";
  const treeList = document.getElementById("tree-list");
  const emptyState = document.getElementById("empty-state");
  const saveStatus = document.getElementById("save-status");
  const importFile = document.getElementById("import-file");

  let roots = loadData();
  let saveTimer = null;
  let toastTimer = null;

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "node-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function createNode(title, parentId = null) {
    return { id: makeId(), title, note: "", parentId, collapsed: false, children: [] };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const bank = createNode("銀行");
        const reception = createNode("受付", bank.id);
        const waiting = createNode("待合場", reception.id);
        waiting.children.push(createNode("イス", waiting.id));
        reception.children.push(waiting);
        reception.children.push(createNode("事務室", reception.id));
        bank.children.push(reception, createNode("金庫", bank.id));
        return [bank];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("保存データの読み込みに失敗しました:", error);
      return [];
    }
  }

  function scheduleSave() {
    saveStatus.textContent = "保存中…";
    saveStatus.classList.add("saving");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(roots));
        saveStatus.textContent = "保存済み";
        saveStatus.classList.remove("saving");
      } catch (error) {
        saveStatus.textContent = "保存できません";
        saveStatus.classList.remove("saving");
        showToast("保存に失敗しました。JSONを書き出してバックアップしてください。");
        console.error(error);
      }
    }, 180);
  }

  function findNode(id, list = roots) {
    for (const node of list) {
      if (node.id === id) return node;
      const found = findNode(id, node.children || []);
      if (found) return found;
    }
    return null;
  }

  function findParentList(id, list = roots) {
    for (const node of list) {
      if ((node.children || []).some(child => child.id === id)) return node.children;
      const found = findParentList(id, node.children || []);
      if (found) return found;
    }
    return null;
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function makeButton(label, className, title, onClick) {
    const button = element("button", className, label);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", onClick);
    return button;
  }

  function render() {
    treeList.replaceChildren();
    emptyState.hidden = roots.length !== 0;

    roots.forEach(root => {
      const rootWrap = element("div", "tree-root");
      rootWrap.appendChild(renderNode(root));
      treeList.appendChild(rootWrap);
    });
  }

  function renderNode(node) {
    const wrapper = element("div", "tree-node");
    const card = element("div", "node-card");

    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    if (hasChildren) {
      const twist = makeButton(node.collapsed ? "▸" : "▾", "twist",
        node.collapsed ? "子要素を展開" : "子要素を折りたたむ", () => {
          node.collapsed = !node.collapsed;
          scheduleSave();
          render();
        });
      twist.setAttribute("aria-expanded", String(!node.collapsed));
      card.appendChild(twist);
    } else {
      card.appendChild(element("span", "twist-spacer"));
    }

    card.appendChild(element("span", "node-icon", "◆"));

    const main = element("div", "node-main");
    main.appendChild(element("div", "node-title", node.title || "（無題）"));
    if (node.note) main.appendChild(element("div", "node-note", node.note));
    card.appendChild(main);

    const actions = element("div", "node-actions");
    actions.appendChild(makeButton("+", "icon-button add", "この項目の下に子要素を追加", () => addChild(node.id)));
    actions.appendChild(makeButton("✎", "icon-button", "名前・メモを編集", () => editNode(node.id)));
    actions.appendChild(makeButton("×", "icon-button delete", "この項目を削除", () => deleteNode(node.id)));
    card.appendChild(actions);
    wrapper.appendChild(card);

    if (hasChildren && !node.collapsed) {
      const children = element("div", "children");
      node.children.forEach(child => children.appendChild(renderNode(child)));
      wrapper.appendChild(children);
    }
    return wrapper;
  }

  function addRoot() {
    const title = window.prompt("メインアイディアの名前を入力してください");
    if (title === null) return;
    if (!title.trim()) {
      showToast("名前が空なので追加しませんでした。");
      return;
    }
    roots.push(createNode(title.trim()));
    scheduleSave();
    render();
  }

  function addChild(parentId) {
    const parent = findNode(parentId);
    if (!parent) return;
    const title = window.prompt(`「${parent.title}」の下に追加するアイディア`);
    if (title === null) return;
    if (!title.trim()) {
      showToast("名前が空なので追加しませんでした。");
      return;
    }
    if (!Array.isArray(parent.children)) parent.children = [];
    parent.children.push(createNode(title.trim(), parent.id));
    parent.collapsed = false;
    scheduleSave();
    render();
  }

  function editNode(id) {
    const node = findNode(id);
    if (!node) return;
    const title = window.prompt("項目名", node.title || "");
    if (title === null) return;
    if (!title.trim()) {
      showToast("名前は空にできません。");
      return;
    }
    const note = window.prompt("メモ（不要なら空欄）", node.note || "");
    if (note === null) return;
    node.title = title.trim();
    node.note = note.trim();
    scheduleSave();
    render();
  }

  function deleteNode(id) {
    const node = findNode(id);
    if (!node) return;
    const childCount = countNodes(node) - 1;
    const extra = childCount > 0 ? `\n配下の${childCount}個の項目も削除されます。` : "";
    if (!window.confirm(`「${node.title}」を削除しますか？${extra}`)) return;

    const parentList = findParentList(id);
    const list = parentList || roots;
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) list.splice(index, 1);
    scheduleSave();
    render();
  }

  function countNodes(node) {
    return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
  }

  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = element("div", "toast");
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(roots, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url;
    link.download = "idea-tree-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("JSONを書き出しました。大切なデータのバックアップに使えます。");
  }

  function isValidNode(node) {
    return node && typeof node === "object" &&
      typeof node.id === "string" &&
      typeof node.title === "string" &&
      (node.note === undefined || typeof node.note === "string") &&
      (node.children === undefined || (Array.isArray(node.children) && node.children.every(isValidNode)));
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed) || !parsed.every(isValidNode)) {
          throw new Error("JSONの形式が違います");
        }
        if (!window.confirm("現在のツリーを読み込んだデータで置き換えます。先にJSONを書き出しましたか？")) return;
        roots = parsed;
        scheduleSave();
        render();
        showToast("JSONを読み込みました。");
      } catch (error) {
        showToast("読み込めませんでした。Idea TreeのJSONファイルを選んでください。");
        console.error(error);
      } finally {
        importFile.value = "";
      }
    };
    reader.readAsText(file);
  }

  document.getElementById("add-root-button").addEventListener("click", addRoot);
  document.getElementById("empty-add-button").addEventListener("click", addRoot);
  document.getElementById("export-button").addEventListener("click", exportJson);
  document.getElementById("import-button").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", event => importJson(event.target.files[0]));

  render();
})();

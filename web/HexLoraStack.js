import { app } from "../../../scripts/app.js";

const ROW_HEIGHT = 78;
const MIN_WIDTH = 400;
const formatStrength = (value) => Number.isInteger(Number(value)) ? Number(value).toFixed(1) : String(Number(value));
const LAST_FOLDER_KEY = "hexus.loraModule.lastFolder";
let lastFolder = "";
try { lastFolder = localStorage.getItem(LAST_FOLDER_KEY) || ""; } catch { /* Browser storage may be unavailable. */ }

function loraFolders(names) {
    const root = { folders: new Map(), files: [] };
    for (const name of names) {
        if (name === "None") continue;
        const parts = name.split(/[\\/]/);
        let folder = root;
        for (const part of parts.slice(0, -1)) {
            if (!folder.folders.has(part)) folder.folders.set(part, { folders: new Map(), files: [] });
            folder = folder.folders.get(part);
        }
        folder.files.push({ name, label: parts.at(-1).replace(/\.[^.]+$/, "") });
    }
    return root;
}

function findFolder(root, path) {
    let folder = root;
    for (const part of path) {
        folder = folder.folders.get(part);
        if (!folder) return null;
    }
    return folder;
}

async function chooseLora(anchor, fallbackNames, selected, onSelect) {
    let names = fallbackNames;
    try {
        const response = await fetch(`/hexus/loras/list?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`LoRA list returned ${response.status}`);
        names = await response.json();
    } catch (error) {
        console.warn("Hexus: using the last available LoRA list", error);
    }
    const root = loraFolders(names);
    let path = lastFolder ? lastFolder.split("/") : [];
    if (!findFolder(root, path)) path = [];
    const menu = document.createElement("div");
    const rect = anchor.getBoundingClientRect();
    Object.assign(menu.style, {
        position: "fixed", zIndex: "10000",
        left: `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(650, window.innerWidth - 16) - 8))}px`,
        top: `${Math.max(8, Math.min(rect.bottom, window.innerHeight - 420))}px`,
        width: "min(650px, calc(100vw - 16px))", maxHeight: "min(70vh, 620px)",
        background: "#292929", border: "1px solid #666", boxShadow: "0 6px 18px #0009",
        display: "flex", flexDirection: "column",
    });
    const search = document.createElement("input");
    search.placeholder = "Search LoRA";
    Object.assign(search.style, { margin: "5px", padding: "4px", color: "#eee", background: "#333" });
    const location = document.createElement("div");
    Object.assign(location.style, { padding: "0 8px 4px", color: "#aaa", overflowWrap: "anywhere" });
    const list = document.createElement("div");
    Object.assign(list.style, {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "8px", padding: "8px", overflowY: "auto",
    });
    const close = () => {
        document.removeEventListener("pointerdown", outside, true);
        menu.remove();
    };
    const outside = (event) => {
        if (!menu.contains(event.target)) close();
    };
    const rememberFolder = () => {
        lastFolder = path.join("/");
        try { localStorage.setItem(LAST_FOLDER_KEY, lastFolder); } catch { /* Browser storage may be unavailable. */ }
    };
    const renderList = () => {
        list.replaceChildren();
        location.textContent = path.length ? `LoRAs / ${path.join(" / ")}` : "LoRAs /";
        const query = search.value.toLocaleLowerCase();
        const folder = findFolder(root, path);
        const entries = [
            ...(path.length ? [{ label: "⬅ Back", folder: ".." }] : []),
            ...[...folder.folders.keys()].sort().map((label) => ({ label: `📁 ${label}`, folder: label })),
            ...folder.files.sort((a, b) => a.label.localeCompare(b.label)),
        ];
        for (const entry of entries) {
            if (!entry.label.toLocaleLowerCase().includes(query) && entry.folder !== "..") continue;
            const item = document.createElement("button");
            item.type = "button";
            Object.assign(item.style, {
                display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                minWidth: "0", padding: "5px", color: "#eee", border: "1px solid #555",
                background: entry.name === selected ? "#405779" : "#333",
            });
            const image = document.createElement("img");
            Object.assign(image.style, {
                display: entry.name && entry.name !== "None" ? "block" : "none", width: "100%", height: "192px",
                objectFit: "contain", background: "#222",
            });
            if (entry.name && entry.name !== "None") {
                image.loading = "lazy";
                image.src = `/hexus/loras/preview?name=${encodeURIComponent(entry.name)}&t=${Date.now()}`;
                image.onerror = () => {
                    image.remove();
                    fallback.style.display = "grid";
                };
            }
            const fallback = document.createElement("div");
            fallback.textContent = entry.folder ? "📁" : "NO IMAGE";
            Object.assign(fallback.style, {
                display: entry.name && entry.name !== "None" ? "none" : "grid", placeItems: "center",
                width: "100%", height: "192px", background: "#222", color: "#888",
                fontSize: entry.folder ? "64px" : "12px",
            });
            const label = document.createElement("span");
            label.textContent = entry.label;
            Object.assign(label.style, { width: "100%", overflowWrap: "anywhere", textAlign: "center" });
            item.append(image, fallback, label);
            item.addEventListener("click", () => {
                if (entry.folder) {
                    if (entry.folder === "..") path.pop();
                    else path.push(entry.folder);
                    rememberFolder();
                    search.value = "";
                    renderList();
                } else {
                    onSelect(entry.name);
                    close();
                }
            });
            list.append(item);
        }
    };
    search.addEventListener("input", renderList);
    search.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
    });
    menu.append(search, location, list);
    document.body.append(menu);
    renderList();
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    search.focus();
}

async function showLoraInfo(name) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "10002", display: "grid", placeItems: "center",
        background: "#0009",
    });
    const dialog = document.createElement("div");
    Object.assign(dialog.style, {
        width: "min(680px, 90vw)", maxHeight: "80vh", overflowY: "auto", padding: "16px",
        background: "#292929", color: "#eee", border: "1px solid #666", borderRadius: "8px",
    });
    const heading = document.createElement("h3");
    heading.textContent = name.replace(/[\\/]/g, "/").split("/").at(-1);
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => overlay.remove());
    const status = document.createElement("p");
    status.textContent = "Fetching LoRA information from Civitai...";
    dialog.append(heading, close, status);
    overlay.append(dialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
    document.body.append(overlay);

    try {
        const response = await fetch("/hexus/loras/info", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error(await response.text());
        const info = await response.json();
        status.textContent = `${info.name} · ${info.version} · ${info.base_model}`;
        if (info.trained_words?.length) {
            const words = document.createElement("p");
            words.textContent = `Trained words: ${info.trained_words.join(", ")}`;
            dialog.append(words);
        }
        const images = document.createElement("div");
        Object.assign(images.style, {
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px",
        });
        for (const url of info.images || []) {
            const card = document.createElement("div");
            const image = document.createElement("img");
            image.src = url;
            image.loading = "lazy";
            Object.assign(image.style, { width: "100%", height: "160px", objectFit: "contain" });
            const save = document.createElement("button");
            save.type = "button";
            save.textContent = "Save as preview";
            save.addEventListener("click", async () => {
                save.disabled = true;
                save.textContent = "Saving...";
                try {
                    const result = await fetch("/hexus/loras/save-preview", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, url }),
                    });
                    if (!result.ok) throw new Error(await result.text());
                    save.textContent = "Saved";
                    try { await app.refreshComboInNodes?.(); } catch { /* The saved preview remains available. */ }
                } catch (error) {
                    save.textContent = `Save failed: ${error.message}`;
                    save.disabled = false;
                }
            });
            card.append(image, save);
            images.append(card);
        }
        if (images.childElementCount) dialog.append(images);
        else status.textContent += " · No Civitai images found";
    } catch (error) {
        status.textContent = `Could not fetch Civitai info: ${error.message}`;
    }
}

function hideWidget(widget) {
    widget.hidden = true;
    widget.options ||= {};
    widget.options.hidden = true;
    widget.computeSize = () => [0, 0];
    widget.draw = () => {};
    widget.inputEl?.style && (widget.inputEl.style.display = "none");
}

function setupHexLoraStack(node, names) {
    const dataWidget = node.widgets?.find((widget) => widget.name === "loras");
    const nameWidget = node.widgets?.find((widget) => widget.name === "lora_name");
    if (!dataWidget || !nameWidget || !node.addDOMWidget) return;

    hideWidget(dataWidget);
    hideWidget(nameWidget);
    const panel = document.createElement("div");
    Object.assign(panel.style, { padding: "6px", color: "#ddd", fontSize: "13px", boxSizing: "border-box" });
    for (const eventName of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel"]) {
        panel.addEventListener(eventName, (event) => event.stopPropagation());
    }

    let rows = [];
    try {
        const saved = JSON.parse(dataWidget.value || "[]");
        if (Array.isArray(saved)) rows = saved;
    } catch { /* The Python node reports invalid saved data on execution. */ }

    const sync = () => {
        dataWidget.value = JSON.stringify(rows);
        render();
        node.setDirtyCanvas?.(true, true);
    };
    const control = (tag, style = {}) => {
        const element = document.createElement(tag);
        Object.assign(element.style, { color: "#eee", background: "#303030", border: "1px solid #666", boxSizing: "border-box", minWidth: "0", ...style });
        return element;
    };
    const render = () => {
        panel.replaceChildren();
        rows.forEach((row, index) => {
            const wrapper = document.createElement("div");
            Object.assign(wrapper.style, { borderBottom: "1px solid #555", padding: "7px 0" });
            const first = document.createElement("div");
            Object.assign(first.style, { display: "flex", gap: "7px", alignItems: "center" });
            const isEnabled = row.enabled !== false;
            const toggle = control("button", {
                display: "grid", placeItems: "center", width: "34px", height: "24px", padding: "0",
                boxSizing: "border-box", flexShrink: "0", font: "bold 11px sans-serif", lineHeight: "1", cursor: "pointer",
                border: isEnabled ? "1px solid #609cf0" : "1px solid #68707b",
                background: isEnabled ? "#315da4" : "#30343c", color: isEnabled ? "#fff" : "#a9b0ba",
            });
            toggle.type = "button";
            toggle.textContent = isEnabled ? "ON" : "OFF";
            toggle.title = isEnabled ? "Disable LoRA" : "Enable LoRA";
            toggle.setAttribute("aria-pressed", String(isEnabled));
            toggle.addEventListener("click", () => { row.enabled = !isEnabled; sync(); });
            const name = control("button", { flex: "1", height: "26px", padding: "3px 8px", fontSize: "13px", lineHeight: "18px", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
            name.type = "button";
            name.style.opacity = isEnabled ? "1" : "0.75";
            name.textContent = row.name && row.name !== "None" ? row.name.replace(/[\\/]/g, "/").split("/").at(-1).replace(/\.[^.]+$/, "") : "None";
            name.addEventListener("click", () => chooseLora(name, names, row.name, (value) => {
                row.name = value;
                sync();
            }));
            first.append(toggle, name);
            if (row.name && row.name !== "None") {
                const info = control("button", { display: "grid", placeItems: "center", width: "26px", height: "26px", padding: "0", flexShrink: "0", fontSize: "14px", fontWeight: "bold" });
                info.type = "button";
                info.style.opacity = isEnabled ? "1" : "0.75";
                info.textContent = "i";
                info.title = "LoRA info and Civitai previews";
                info.addEventListener("click", () => showLoraInfo(row.name));
                first.append(info);
            }

            const second = document.createElement("div");
            Object.assign(second.style, { display: "flex", gap: "7px", marginTop: "7px", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", opacity: isEnabled ? "1" : "0.75" });
            const linked = row.linked ?? row.model_strength === row.clip_strength;
            const strengthInputs = {};
            const link = control("button", { display: "grid", placeItems: "center", width: "28px", height: "26px", padding: "0", flexShrink: "0", fontSize: "15px" });
            link.type = "button";
            link.textContent = linked ? "🔗" : "⛓️‍💥";
            link.title = linked ? "MODEL and CLIP strengths linked" : "MODEL and CLIP strengths separate";
            link.setAttribute("aria-pressed", String(linked));
            link.style.opacity = linked ? "1" : "0.75";
            link.addEventListener("click", () => {
                row.linked = !linked;
                if (row.linked) row.clip_strength = row.model_strength;
                sync();
            });
            const addStrength = (label, key) => {
                const text = document.createElement("span");
                text.textContent = label;
                Object.assign(text.style, { display: "inline-flex", alignItems: "center", justifyContent: "center", height: "26px", flexShrink: "0" });
                const group = document.createElement("div");
                Object.assign(group.style, { display: "flex", gap: "3px", flexShrink: "0" });
                const value = control("input", { width: "50px", height: "26px", boxSizing: "border-box", padding: "0 2px", fontSize: "13px", textAlign: "center", cursor: "ew-resize" });
                value.type = "text";
                value.inputMode = "decimal";
                value.value = formatStrength(row[key] ?? 1);
                strengthInputs[key] = value;
                const applyValue = (number) => {
                    row[key] = number;
                    if (linked) row[key === "model_strength" ? "clip_strength" : "model_strength"] = number;
                    sync();
                };
                value.addEventListener("change", () => {
                    const number = Number(value.value);
                    if (value.value.trim() && Number.isFinite(number)) applyValue(number);
                    else value.value = formatStrength(row[key] ?? 1);
                });
                let drag = null;
                value.addEventListener("pointerdown", (event) => {
                    if (event.button !== 0) return;
                    drag = { x: event.clientX, start: Number(row[key] ?? 1), moved: false };
                    value.setPointerCapture(event.pointerId);
                });
                value.addEventListener("pointermove", (event) => {
                    if (!drag) return;
                    const distance = event.clientX - drag.x;
                    if (Math.abs(distance) < 4 && !drag.moved) return;
                    drag.moved = true;
                    const number = Math.round((drag.start + Math.round(distance / 8) * 0.05) * 100) / 100;
                    value.value = formatStrength(number);
                    if (linked) strengthInputs[key === "model_strength" ? "clip_strength" : "model_strength"].value = value.value;
                });
                value.addEventListener("pointerup", () => {
                    if (drag?.moved) applyValue(Number(value.value));
                    drag = null;
                });
                value.addEventListener("pointercancel", () => { drag = null; });
                const arrow = (symbol, delta) => {
                    const button = control("button", { display: "grid", placeItems: "center", width: "20px", height: "26px", padding: "0", flexShrink: "0", fontSize: "11px", lineHeight: "1" });
                    button.type = "button";
                    button.textContent = symbol;
                    button.title = `${delta > 0 ? "Increase" : "Decrease"} ${label} by 0.05`;
                    button.addEventListener("click", () => applyValue(Number((Number(row[key] ?? 1) + delta).toFixed(10))));
                    return button;
                };
                group.append(arrow("◀", -0.05), value, arrow("▶", 0.05));
                second.append(text, group);
            };
            addStrength("MODEL", "model_strength");
            second.append(link);
            addStrength("CLIP", "clip_strength");
            const remove = control("button", { display: "grid", placeItems: "center", width: "26px", height: "26px", padding: "0", flexShrink: "0", fontSize: "18px" });
            remove.type = "button";
            remove.textContent = "×";
            remove.title = "Remove LoRA";
            remove.addEventListener("click", () => { rows.splice(index, 1); sync(); });
            second.append(remove);
            wrapper.append(first, second);
            panel.append(wrapper);
        });
        const add = control("button", { width: "100%", marginTop: "8px", padding: "6px", fontSize: "13px", textAlign: "center" });
        add.type = "button";
        add.textContent = "+ Add LoRA";
        add.addEventListener("click", () => {
            rows.push({ enabled: true, name: "None", model_strength: 1, clip_strength: 1, linked: true });
            sync();
            const minHeight = node.computeSize()[1];
            if (node.size[1] < minHeight) node.setSize?.([node.size[0], minHeight]);
        });
        panel.append(add);
    };

    node.addDOMWidget("lora_rows", "HexusLoraRows", panel, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 44 + rows.length * ROW_HEIGHT,
    });
    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        originalConfigure?.apply(this, arguments);
        try {
            const saved = JSON.parse(dataWidget.value || "[]");
            rows = Array.isArray(saved) ? saved : [];
        } catch { rows = []; }
        render();
    };
    const originalResize = node.onResize;
    node.onResize = function (size) {
        originalResize?.apply(this, arguments);
        if (size[0] < MIN_WIDTH) {
            size[0] = MIN_WIDTH;
            this.size[0] = MIN_WIDTH;
        }
    };
    render();
    node.setSize?.([MIN_WIDTH, Math.max(node.size[1], node.computeSize()[1])]);
}

app.registerExtension({
    name: "Hexus.HexLoraStack",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexLoraStack") return;
        const names = nodeData.input.required.lora_name[0];
        const original = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            original?.apply(this, arguments);
            setupHexLoraStack(this, names);
        };
    },
});

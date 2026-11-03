import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const wildcardLabel = "Select the Wildcard to add to the text";
const BLOCK_HEIGHT = 150;
const TEXT_HEIGHT = 105;
const MIN_TEXT_HEIGHT = 60;
const autocompleteClass = import("../comfyui-custom-scripts/js/common/autocomplete.js")
    .then((module) => module.TextAreaAutoComplete)
    .catch(() => null);

function hideWidget(widget) {
    widget.hidden = true;
    widget.options ||= {};
    widget.options.hidden = true;
    widget.computeSize = () => [0, 0];
    widget.draw = () => {};
    if (widget.inputEl) widget.inputEl.style.display = "none";
}

function setupPromptBlocks(node) {
    const textWidget = node.widgets?.find((widget) => widget.name === "text");
    const blocksWidget = node.widgets?.find((widget) => widget.name === "blocks");
    const enabledWidget = node.widgets?.find((widget) => widget.name === "block_enabled");
    const seedWidget = node.widgets?.find((widget) => widget.name === "seed");
    const controlWidget = node.widgets?.find((widget) => widget.name === "control_after_generate");
    const wildcardWidget = node.widgets?.find((widget) => widget.name === "Select to add Wildcard");
    if (!textWidget || !blocksWidget || !enabledWidget || !seedWidget || !wildcardWidget || !node.addDOMWidget) return;

    hideWidget(textWidget);
    hideWidget(blocksWidget);
    hideWidget(enabledWidget);
    const panel = document.createElement("div");
    Object.assign(panel.style, { padding: "6px", boxSizing: "border-box", color: "#ddd", fontSize: "12px" });
    for (const eventName of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel"]) {
        panel.addEventListener(eventName, (event) => event.stopPropagation());
    }

    const readRows = () => {
        let extra = [];
        try {
            const saved = JSON.parse(blocksWidget.value || "[]");
            if (Array.isArray(saved)) extra = saved.filter((item) => typeof item === "string");
        } catch { /* Invalid saved data is reported by Python on execution. */ }
        return [String(textWidget.value ?? ""), ...extra];
    };
    let rows = readRows();
    const readEnabled = () => {
        let saved = [];
        try {
            const values = JSON.parse(enabledWidget.value || "[]");
            if (Array.isArray(values)) saved = values;
        } catch { /* Invalid saved data is reported by Python on execution. */ }
        return rows.map((_, index) => saved[index] !== false);
    };
    let enabledRows = readEnabled();
    const storedHeights = node.properties?.hexPromptBlockHeights;
    let heights = rows.map((_, index) => Math.max(MIN_TEXT_HEIGHT, Number(storedHeights?.[index]) || TEXT_HEIGHT));
    let resizeObservers = [];
    let activeIndex = 0;
    const saveHeights = () => {
        node.properties ||= {};
        node.properties.hexPromptBlockHeights = [...heights];
    };
    const save = () => {
        textWidget.value = rows[0] ?? "";
        blocksWidget.value = JSON.stringify(rows.slice(1));
        enabledWidget.value = JSON.stringify(enabledRows);
        node.setDirtyCanvas?.(true, true);
    };
    const fitHeight = () => {
        const minHeight = node.computeSize()[1];
        if (node.size[1] < minHeight) node.setSize?.([node.size[0], minHeight]);
    };
    const shrinkHeight = (removedHeight) => {
        const targetHeight = Math.max(node.computeSize()[1], node.size[1] - removedHeight - (BLOCK_HEIGHT - TEXT_HEIGHT));
        node.setSize?.([node.size[0], targetHeight]);
        if (node.size[1] > targetHeight) node.size[1] = targetHeight;
        if (rows.length === 1) fillSingleBlock();
        node.setDirtyCanvas?.(true, true);
    };
    const fillSingleBlock = () => {
        if (rows.length !== 1) return;
        const height = Math.max(MIN_TEXT_HEIGHT, Math.round(node.size[1] - node.computeSize()[1] + MIN_TEXT_HEIGHT));
        heights[0] = height;
        const textarea = panel.querySelector("textarea");
        if (textarea) textarea.style.height = `${height}px`;
        saveHeights();
    };
    const render = () => {
        resizeObservers.forEach((observer) => observer.disconnect());
        resizeObservers = [];
        panel.replaceChildren();
        rows.forEach((row, index) => {
            const block = document.createElement("div");
            Object.assign(block.style, {
                border: "1px solid #626262", borderRadius: "5px", padding: "5px",
                marginBottom: "6px", background: "#292929", boxSizing: "border-box",
            });
            const header = document.createElement("div");
            Object.assign(header.style, { display: "flex", alignItems: "center", gap: "3px", marginBottom: "4px" });
            const isEnabled = enabledRows[index];
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.textContent = isEnabled ? "ON" : "OFF";
            toggle.title = isEnabled ? "Disable block" : "Enable block";
            toggle.setAttribute("aria-pressed", String(isEnabled));
            Object.assign(toggle.style, {
                display: "grid", placeItems: "center", width: "28px", height: "20px", padding: "0", marginRight: "4px",
                flexShrink: "0", font: "bold 10px sans-serif", lineHeight: "1", cursor: "pointer",
                border: isEnabled ? "1px solid #609cf0" : "1px solid #68707b",
                background: isEnabled ? "#315da4" : "#30343c", color: isEnabled ? "#fff" : "#a9b0ba",
            });
            toggle.addEventListener("click", () => {
                enabledRows[index] = !isEnabled;
                save();
                render();
            });
            header.append(toggle);
            const label = document.createElement("span");
            label.textContent = `Block ${index + 1}`;
            Object.assign(label.style, { flex: "1", color: "#aaa", opacity: isEnabled ? "1" : "0.4" });
            header.append(label);
            for (const [symbol, title, target] of [["↑", "Move up", index - 1], ["↓", "Move down", index + 1]]) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = symbol;
                button.title = title;
                button.disabled = target < 0 || target >= rows.length;
                Object.assign(button.style, { display: "grid", placeItems: "center", width: "26px", height: "24px", padding: "0", fontSize: "16px", lineHeight: "1", color: "#ddd", background: "#383838", border: "1px solid #666" });
                button.addEventListener("click", () => {
                    [rows[index], rows[target]] = [rows[target], rows[index]];
                    [heights[index], heights[target]] = [heights[target], heights[index]];
                    [enabledRows[index], enabledRows[target]] = [enabledRows[target], enabledRows[index]];
                    activeIndex = target;
                    save();
                    saveHeights();
                    render();
                });
                header.append(button);
            }
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "×";
            remove.title = "Remove block";
            Object.assign(remove.style, { display: "grid", placeItems: "center", width: "26px", height: "24px", padding: "0", fontSize: "18px", lineHeight: "1", color: "#ddd", background: "#383838", border: "1px solid #666" });
            remove.addEventListener("click", () => {
                const removedHeight = heights[index];
                rows.splice(index, 1);
                heights.splice(index, 1);
                enabledRows.splice(index, 1);
                if (!rows.length) {
                    rows.push("");
                    heights.push(TEXT_HEIGHT);
                    enabledRows.push(true);
                }
                activeIndex = Math.min(index, rows.length - 1);
                save();
                saveHeights();
                render();
                shrinkHeight(removedHeight);
            });
            header.append(remove);

            const textarea = document.createElement("textarea");
            textarea.classList.add("comfy-multiline-input");
            textarea.value = row;
            textarea.readOnly = !isEnabled;
            const setRangeText = textarea.setRangeText.bind(textarea);
            textarea.setRangeText = (...args) => {
                setRangeText(...args);
                rows[index] = textarea.value;
                save();
            };
            Object.assign(textarea.style, {
                display: "block", width: "100%", height: `${heights[index]}px`, minHeight: `${MIN_TEXT_HEIGHT}px`,
                boxSizing: "border-box", resize: "vertical",
                opacity: isEnabled ? "1" : "0.4",
            });
            let autocompleteAttached = false;
            const attachAutocomplete = () => {
                if (autocompleteAttached) return;
                autocompleteClass.then((AutoComplete) => {
                    if (AutoComplete?.enabled && textarea.isConnected && !autocompleteAttached) {
                        new AutoComplete(textarea);
                        autocompleteAttached = true;
                    }
                });
            };
            textarea.addEventListener("focus", () => { activeIndex = index; if (isEnabled) attachAutocomplete(); });
            textarea.addEventListener("input", () => { rows[index] = textarea.value; save(); });
            textarea.addEventListener("change", () => { rows[index] = textarea.value; save(); });
            block.append(header, textarea);
            panel.append(block);
            const observer = new ResizeObserver(() => {
                const height = textarea.offsetHeight;
                const change = height - heights[index];
                if (Math.abs(change) < 2) return;
                heights[index] = height;
                saveHeights();
                if (rows.length === 1) node.setSize?.([node.size[0], node.size[1] + change]);
                else fitHeight();
                node.setDirtyCanvas?.(true, true);
            });
            observer.observe(textarea);
            resizeObservers.push(observer);
        });

        const add = document.createElement("button");
        add.type = "button";
        add.textContent = "+ Add Block";
        Object.assign(add.style, { width: "100%", padding: "4px", color: "#eee", background: "#303030", border: "1px solid #666" });
        add.addEventListener("click", () => {
            rows.push("");
            heights.push(TEXT_HEIGHT);
            enabledRows.push(true);
            activeIndex = rows.length - 1;
            save();
            saveHeights();
            render();
            fitHeight();
        });
        panel.append(add);
    };

    node.addDOMWidget("prompt_blocks", "HexusPromptBlocks", panel, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 40 + rows.length * (BLOCK_HEIGHT - TEXT_HEIGHT)
            + (rows.length === 1 ? MIN_TEXT_HEIGHT : heights.reduce((sum, height) => sum + height, 0)),
    });
    const panelWidget = node.widgets.find((widget) => widget.name === "prompt_blocks");
    node.widgets = [textWidget, blocksWidget, enabledWidget, panelWidget, seedWidget, controlWidget, wildcardWidget].filter(Boolean);
    autocompleteClass.then((AutoComplete) => {
        if (!AutoComplete?.enabled) panelWidget.name = "text";
    });

    wildcardWidget.callback = (value) => {
        if (!value || value === wildcardLabel) return;
        const index = Math.min(activeIndex, rows.length - 1);
        if (!enabledRows[index]) {
            wildcardWidget.value = wildcardLabel;
            return;
        }
        if (rows[index]) rows[index] = rows[index].replace(/,\s*$/, "") + ", ";
        rows[index] += value + ",";
        save();
        render();
        wildcardWidget.value = wildcardLabel;
    };
    wildcardWidget.serializeValue = () => wildcardLabel;
    api.fetchApi("/impact/wildcards/list")
        .then((response) => response.json())
        .then(({ data }) => { wildcardWidget.options.values = [wildcardLabel, ...data]; node.setDirtyCanvas?.(true, true); })
        .catch((error) => console.error("Hexus: failed to load Impact wildcards", error));

    const onConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        onConfigure?.apply(this, arguments);
        const values = info?.widgets_values;
        if (Array.isArray(values)) {
            textWidget.value = values[0] ?? "";
            blocksWidget.value = "[]";
            enabledWidget.value = "[]";
            for (const value of values.slice(1)) {
                if (typeof value !== "string" || !value.startsWith("[")) continue;
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
                        blocksWidget.value = value;
                        break;
                    }
                } catch { /* A previous populated prompt may start with '['. */ }
            }
            for (const value of values.slice(1)) {
                if (typeof value !== "string" || !value.startsWith("[")) continue;
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed) && parsed.length && parsed.every((item) => typeof item === "boolean")) {
                        enabledWidget.value = value;
                        break;
                    }
                } catch { /* Invalid saved data is reported by Python on execution. */ }
            }
            const seedIndex = values.findIndex((value, index) => index > 0 && typeof value === "number");
            if (seedIndex >= 0) {
                seedWidget.value = values[seedIndex];
                if (controlWidget) controlWidget.value = values[seedIndex + 1] ?? controlWidget.value;
            }
        }
        rows = readRows();
        enabledRows = readEnabled();
        const savedHeights = node.properties?.hexPromptBlockHeights;
        heights = rows.map((_, index) => Math.max(MIN_TEXT_HEIGHT, Number(savedHeights?.[index]) || TEXT_HEIGHT));
        render();
        fitHeight();
        fillSingleBlock();
    };
    const onResize = node.onResize;
    node.onResize = function () {
        const result = onResize?.apply(this, arguments);
        if (this.size[1] < this.computeSize()[1]) this.size[1] = this.computeSize()[1];
        fillSingleBlock();
        return result;
    };
    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        resizeObservers.forEach((observer) => observer.disconnect());
        return onRemoved?.apply(this, arguments);
    };
    render();
    node.setSize?.([Math.max(node.size[0], 360), Math.max(node.size[1], node.computeSize()[1])]);
    fillSingleBlock();
}

app.registerExtension({
    name: "Hexus.HexPrompt",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexPrompt") return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            setupPromptBlocks(this);
        };
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            const seed = message?.hexus_seed?.[0];
            const seedWidget = this.widgets?.find((widget) => widget.name === "seed");
            const control = this.widgets?.find((widget) => widget.name === "control_after_generate");
            if (seed === undefined || !seedWidget || !control || control.value === "fixed") return;
            if (String(seedWidget.value) !== String(seed)) return;
            control.beforeQueued?.({ isPartialExecution: false });
            control.afterQueued?.({ isPartialExecution: false });
            this.setDirtyCanvas?.(true, true);
        };
    },
});

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const wildcardLabel = "Select the Wildcard to add to the text";
const BLOCK_HEIGHT = 146;
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
    const seedWidget = node.widgets?.find((widget) => widget.name === "seed");
    const controlWidget = node.widgets?.find((widget) => widget.name === "control_after_generate");
    const wildcardWidget = node.widgets?.find((widget) => widget.name === "Select to add Wildcard");
    if (!textWidget || !blocksWidget || !seedWidget || !wildcardWidget || !node.addDOMWidget) return;

    hideWidget(textWidget);
    hideWidget(blocksWidget);
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
    let activeIndex = 0;
    const save = () => {
        textWidget.value = rows[0] ?? "";
        blocksWidget.value = JSON.stringify(rows.slice(1));
        node.setDirtyCanvas?.(true, true);
    };
    const fitHeight = () => {
        const minHeight = node.computeSize()[1];
        if (node.size[1] < minHeight) node.setSize?.([node.size[0], minHeight]);
    };
    const shrinkHeight = (removedBlocks) => {
        if (!removedBlocks) return;
        const targetHeight = node.size[1] - removedBlocks * BLOCK_HEIGHT;
        node.setSize?.([node.size[0], targetHeight]);
        if (node.size[1] > targetHeight) node.size[1] = targetHeight;
        node.setDirtyCanvas?.(true, true);
    };
    const render = () => {
        panel.replaceChildren();
        rows.forEach((row, index) => {
            const block = document.createElement("div");
            Object.assign(block.style, {
                border: "1px solid #626262", borderRadius: "5px", padding: "5px",
                marginBottom: "6px", background: "#292929", boxSizing: "border-box",
            });
            const header = document.createElement("div");
            Object.assign(header.style, { display: "flex", alignItems: "center", gap: "3px", marginBottom: "4px" });
            const label = document.createElement("span");
            label.textContent = `Block ${index + 1}`;
            Object.assign(label.style, { flex: "1", color: "#aaa" });
            header.append(label);
            for (const [symbol, title, target] of [["↑", "Move up", index - 1], ["↓", "Move down", index + 1]]) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = symbol;
                button.title = title;
                button.disabled = target < 0 || target >= rows.length;
                Object.assign(button.style, { width: "22px", height: "20px", padding: "0", color: "#ddd", background: "#383838", border: "1px solid #666" });
                button.addEventListener("click", () => {
                    [rows[index], rows[target]] = [rows[target], rows[index]];
                    activeIndex = target;
                    save();
                    render();
                });
                header.append(button);
            }
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "×";
            remove.title = "Remove block";
            Object.assign(remove.style, { width: "22px", height: "20px", padding: "0", color: "#ddd", background: "#383838", border: "1px solid #666" });
            remove.addEventListener("click", () => {
                const previousCount = rows.length;
                rows.splice(index, 1);
                if (!rows.length) rows.push("");
                activeIndex = Math.min(index, rows.length - 1);
                save();
                render();
                shrinkHeight(previousCount - rows.length);
            });
            header.append(remove);

            const textarea = document.createElement("textarea");
            textarea.classList.add("comfy-multiline-input");
            textarea.value = row;
            const setRangeText = textarea.setRangeText.bind(textarea);
            textarea.setRangeText = (...args) => {
                setRangeText(...args);
                rows[index] = textarea.value;
                save();
            };
            Object.assign(textarea.style, {
                display: "block", width: "100%", height: "105px",
                boxSizing: "border-box",
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
            textarea.addEventListener("focus", () => { activeIndex = index; attachAutocomplete(); });
            textarea.addEventListener("input", () => { rows[index] = textarea.value; save(); });
            textarea.addEventListener("change", () => { rows[index] = textarea.value; save(); });
            block.append(header, textarea);
            panel.append(block);
        });

        const add = document.createElement("button");
        add.type = "button";
        add.textContent = "+ Add Block";
        Object.assign(add.style, { width: "100%", padding: "4px", color: "#eee", background: "#303030", border: "1px solid #666" });
        add.addEventListener("click", () => {
            rows.push("");
            activeIndex = rows.length - 1;
            save();
            render();
            fitHeight();
        });
        panel.append(add);
    };

    node.addDOMWidget("prompt_blocks", "HexusPromptBlocks", panel, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 40 + rows.length * BLOCK_HEIGHT,
    });
    const panelWidget = node.widgets.find((widget) => widget.name === "prompt_blocks");
    node.widgets = [textWidget, blocksWidget, panelWidget, seedWidget, controlWidget, wildcardWidget].filter(Boolean);
    autocompleteClass.then((AutoComplete) => {
        if (!AutoComplete?.enabled) panelWidget.name = "text";
    });

    wildcardWidget.callback = (value) => {
        if (!value || value === wildcardLabel) return;
        const index = Math.min(activeIndex, rows.length - 1);
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
            const seedIndex = values.findIndex((value, index) => index > 0 && typeof value === "number");
            if (seedIndex >= 0) {
                seedWidget.value = values[seedIndex];
                if (controlWidget) controlWidget.value = values[seedIndex + 1] ?? controlWidget.value;
            }
        }
        rows = readRows();
        render();
        fitHeight();
    };
    render();
    node.setSize?.([Math.max(node.size[0], 360), Math.max(node.size[1], node.computeSize()[1])]);
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

import { app, ComfyApp } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { applyTextReplacements } from "../../../scripts/utils.js";


function currentPreview(node) {
    const previews = node.hexusPreviews ?? [];
    return previews[node.imageIndex ?? 0] ?? previews[0];
}


function sendToSampler(target, source, mode, origin) {
    if (mode === "Inpaint" && !origin.imgs?.[origin.imageIndex ?? 0]) {
        window.alert("미리보기 이미지가 표시된 뒤 다시 시도하세요.");
        return;
    }
    target.hexusSetSourceImage(source, mode);
    if (mode === "Inpaint") {
        ComfyApp.copyToClipspace(origin);
        ComfyApp.clipspace_return_node = target;
        ComfyApp.open_maskeditor();
    }
}


function chooseSampler(source, mode, origin) {
    const samplers = (app.graph?._nodes ?? []).filter((node) =>
        node.type === "HexSampler" && typeof node.hexusSetSourceImage === "function");
    if (!samplers.length) {
        window.alert("Hex Sampler 노드를 먼저 배치하세요.");
        return;
    }
    const selected = samplers.filter((node) => app.canvas?.selected_nodes?.[node.id]);
    if (selected.length === 1 || samplers.length === 1) {
        sendToSampler(selected[0] ?? samplers[0], source, mode, origin);
        return;
    }

    const picker = document.createElement("select");
    const placeholder = document.createElement("option");
    placeholder.textContent = "Hex Sampler 선택";
    placeholder.value = "";
    picker.append(placeholder);
    for (const sampler of samplers) {
        const option = document.createElement("option");
        option.value = String(sampler.id);
        option.textContent = `${sampler.title || "Hex Sampler"} (#${sampler.id})`;
        picker.append(option);
    }
    const canvas = app.canvas.canvas;
    const rect = canvas.getBoundingClientRect();
    const scale = app.canvas.ds.scale;
    const offset = app.canvas.ds.offset;
    Object.assign(picker.style, {
        position: "fixed", zIndex: "10000", minWidth: "200px",
        left: `${Math.max(0, rect.left + (origin.pos[0] + offset[0]) * scale)}px`,
        top: `${Math.min(window.innerHeight - 30, rect.top + (origin.pos[1] + origin.size[1] + offset[1]) * scale)}px`,
        color: "#eee", background: "#2d3547", border: "1px solid #7894c2",
        padding: "4px", fontSize: "12px",
    });
    picker.addEventListener("change", () => {
        const target = samplers.find((node) => String(node.id) === picker.value);
        if (target) sendToSampler(target, source, mode, origin);
        picker.remove();
    });
    picker.addEventListener("blur", () => picker.remove());
    document.body.append(picker);
    picker.focus();
    try { picker.showPicker?.(); } catch { /* The select remains available. */ }
}


function addActionButtons(node, prefix) {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        display: "flex", flexDirection: "column", gap: "5px",
        width: "100%", boxSizing: "border-box", padding: "4px 12px 7px",
    });
    const makeButton = (label, background, border, color, onClick) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        Object.assign(button.style, {
            display: "block", width: "100%", maxWidth: "340px", height: "30px",
            margin: "0 auto", padding: "0 12px", boxSizing: "border-box",
            border: `1px solid ${border}`, borderRadius: "6px",
            background, color, font: "600 13px sans-serif", cursor: "pointer",
        });
        button.addEventListener("mouseenter", () => { button.style.filter = "brightness(1.15)"; });
        button.addEventListener("mouseleave", () => { button.style.filter = ""; });
        button.addEventListener("click", onClick);
        panel.append(button);
        return button;
    };

    const saveButton = makeButton("💾 Save", "#244d3c", "#4b9d77", "#f0fff6", async () => {
        if (!node.hexusPreviews.length || node.hexusSaving) return;
        node.hexusSaving = true;
        try {
            const response = await api.fetchApi("/hexus/preview-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    images: node.hexusPreviews,
                    filename_prefix: applyTextReplacements(app, prefix.value),
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            const saved = (await response.json()).images;
            saveButton.textContent = `✅ Saved (${saved.length})`;
            setTimeout(() => { saveButton.textContent = "💾 Save"; }, 2500);
        } catch (error) {
            window.alert(`이미지 저장 실패: ${error.message}`);
        } finally {
            node.hexusSaving = false;
        }
    });
    makeButton("🖼️ i2i", "#244969", "#6197bf", "#eef8ff", () => {
        const source = currentPreview(node);
        if (source) chooseSampler(source, "i2i", node);
    });
    makeButton("🖌️ Inpaint", "#594369", "#a77dc0", "#fff1ff", () => {
        const source = currentPreview(node);
        if (source) chooseSampler(source, "Inpaint", node);
    });

    const widget = node.addDOMWidget("hex_image_actions", "HexImageActions", panel, {
        serialize: false, hideOnZoom: false,
        getMinHeight: () => 112, getMaxHeight: () => 112, getHeight: () => 112,
    });
    const oldIndex = node.widgets.indexOf(widget);
    const prefixIndex = node.widgets.indexOf(prefix);
    if (oldIndex >= 0 && prefixIndex >= 0 && oldIndex !== prefixIndex + 1) {
        node.widgets.splice(oldIndex, 1);
        node.widgets.splice(node.widgets.indexOf(prefix) + 1, 0, widget);
    }
    if (node.size[1] < node.computeSize()[1]) {
        node.setSize?.([node.size[0], node.computeSize()[1]]);
    }
}


app.registerExtension({
    name: "Hexus.HexPreviewSave",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexPreviewSave") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this.hexusPreviews = [];
            const prefix = this.widgets?.find((widget) => widget.name === "filename_prefix");
            if (prefix && this.addDOMWidget) addActionButtons(this, prefix);
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            this.hexusPreviews = message?.images ?? [];
        };
    },
});

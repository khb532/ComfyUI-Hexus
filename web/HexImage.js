import { app, ComfyApp } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { applyTextReplacements } from "../../../scripts/utils.js";


function currentPreview(node) {
    const previews = node.hexusPreviews ?? [];
    return previews[node.imageIndex ?? 0] ?? previews[0];
}


function previewSourceForImage(node) {
    const graph = node.graph ?? app.graph;
    const linkId = node.inputs?.find((input) => input.name === "images")?.link;
    if (linkId == null) return null;
    const link = graph?._links?.get?.(linkId) ?? graph?.links?.[linkId];
    const source = link && graph?.getNodeById?.(link.origin_id);
    return source?.type === "HexSampler" || source?.type === "HexHighres" ? source : null;
}


function clearStepPreview(node) {
    node.hexusStepPreviewSequence = (node.hexusStepPreviewSequence ?? 0) + 1;
    if (node.hexusStepPreviewActive) {
        node.imgs = node.hexusFinishedImgs;
        node.imageIndex = node.hexusFinishedImageIndex;
        node.hexusFinishedImgs = undefined;
        node.hexusFinishedImageIndex = undefined;
        node.hexusStepPreviewActive = false;
        node.setDirtyCanvas?.(true, true);
    }
    if (node.hexusStepPreviewUrl) URL.revokeObjectURL(node.hexusStepPreviewUrl);
    node.hexusStepPreviewUrl = null;
}


function showStepPreview(node, blob) {
    if (node.properties?.hexusStepPreview === false || !blob) return;
    const sequence = (node.hexusStepPreviewSequence ?? 0) + 1;
    node.hexusStepPreviewSequence = sequence;
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
        if (sequence !== node.hexusStepPreviewSequence || node.properties?.hexusStepPreview === false) {
            URL.revokeObjectURL(url);
            return;
        }
        if (!node.hexusStepPreviewActive) {
            node.hexusFinishedImgs = node.imgs;
            node.hexusFinishedImageIndex = node.imageIndex;
        }
        if (node.hexusStepPreviewUrl) URL.revokeObjectURL(node.hexusStepPreviewUrl);
        node.hexusStepPreviewUrl = url;
        node.hexusStepPreviewActive = true;
        node.imgs = [image];
        node.imageIndex = 0;
        node.setDirtyCanvas?.(true, true);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
}


function showSamplingPreview(blob, ids) {
    const matchingIds = ids.map(String);
    for (const node of app.graph?._nodes ?? []) {
        if (node.type !== "HexImage" || node.properties?.hexusStepPreview === false) continue;
        const source = previewSourceForImage(node);
        if (source && matchingIds.includes(String(source.id))) showStepPreview(node, blob);
    }
}


async function sendToSampler(target, source, mode, origin) {
    if (mode === "Inpaint" && !origin.imgs?.[origin.imageIndex ?? 0]) {
        window.alert("미리보기 이미지가 표시된 뒤 다시 시도하세요.");
        return;
    }
    try {
        if (!await target.hexusSetSourceImage(source, mode)) {
            window.alert("Sampler에서 입력 이미지를 불러오지 못했습니다.");
            return;
        }
    } catch (error) {
        window.alert(`Sampler 이미지 전송 실패: ${error.message}`);
        return;
    }
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

    const divider = document.createElement("div");
    Object.assign(divider.style, {
        width: "100%", maxWidth: "340px", height: "1px", margin: "4px auto 0",
        background: "#7d6565",
    });
    panel.append(divider);
    const row = document.createElement("div");
    Object.assign(row.style, {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", maxWidth: "340px", height: "24px", margin: "0 auto",
        color: "#f1e8e8", font: "12px sans-serif",
    });
    const label = document.createElement("span");
    label.textContent = "Step Preview (Hex Only)";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    Object.assign(toggle.style, {
        position: "relative", width: "38px", height: "20px", padding: "0",
        border: "1px solid #766666", borderRadius: "12px", cursor: "pointer",
    });
    const knob = document.createElement("span");
    Object.assign(knob.style, {
        position: "absolute", top: "2px", left: "2px", width: "14px", height: "14px",
        borderRadius: "50%", background: "#fff", transition: "transform 0.15s ease",
    });
    toggle.append(knob);
    const syncToggle = () => {
        const enabled = node.properties.hexusStepPreview !== false;
        toggle.setAttribute("aria-checked", String(enabled));
        toggle.style.background = enabled ? "#3f9b76" : "#4d4545";
        knob.style.transform = enabled ? "translateX(18px)" : "";
    };
    toggle.addEventListener("click", () => {
        node.properties.hexusStepPreview = node.properties.hexusStepPreview === false;
        if (!node.properties.hexusStepPreview) clearStepPreview(node);
        syncToggle();
        node.setDirtyCanvas?.(true, true);
    });
    row.append(label, toggle);
    panel.append(row);
    node.hexusSyncPreviewToggle = syncToggle;
    syncToggle();

    const widget = node.addDOMWidget("hex_image_actions", "HexImageActions", panel, {
        serialize: false, hideOnZoom: false,
        getMinHeight: () => 156, getMaxHeight: () => 156, getHeight: () => 156,
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
    name: "Hexus.HexImage",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexImage") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this.hexusPreviews = [];
            this.properties ||= {};
            this.properties.hexusStepPreview ??= true;
            for (const name of ["cache_mode", "cached_images"]) {
                const widget = this.widgets?.find((item) => item.name === name);
                if (!widget) continue;
                widget.hidden = true;
                widget.options ||= {};
                widget.options.hidden = true;
                widget.type = "hexus-hidden";
                widget.computeSize = () => [0, -4];
            }
            const prefix = this.widgets?.find((widget) => widget.name === "filename_prefix");
            if (prefix && this.addDOMWidget) addActionButtons(this, prefix);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            this.hexusPreviews = this.properties?.hexusCachedImages ?? [];
            this.hexusSyncPreviewToggle?.();
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            clearStepPreview(this);
            onExecuted?.apply(this, arguments);
            this.hexusPreviews = message?.images ?? [];
            this.properties.hexusCachedImages = this.hexusPreviews;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            clearStepPreview(this);
            onRemoved?.apply(this, arguments);
        };
    },
    setup() {
        const queuePrompt = api.queuePrompt;
        api.queuePrompt = function (index, prompt, options, ...args) {
            const targets = options?.partialExecutionTargets;
            const partial = Array.isArray(targets) && targets.length > 0;
            const selectedNodes = app.canvas?.selected_nodes ?? {};
            for (const [id, entry] of Object.entries(prompt?.output ?? {})) {
                if (entry.class_type !== "HexImage") continue;
                const node = app.graph?.getNodeById(Number(id));
                const workflowNode = prompt.workflow?.nodes?.find((item) => String(item.id) === id);
                const cached = node?.hexusPreviews?.length ? node.hexusPreviews
                    : workflowNode?.properties?.hexusCachedImages ?? [];
                const sourceId = entry.inputs.images?.[0];
                entry.inputs.cache_mode = partial && !selectedNodes[sourceId];
                if (entry.inputs.cache_mode) delete entry.inputs.images;
                entry.inputs.cached_images = JSON.stringify(cached);
            }
            return queuePrompt.call(this, index, prompt, options, ...args);
        };
        let executingNodeId = null;
        api.addEventListener("executing", (event) => {
            executingNodeId = event.detail ?? null;
        });
        api.addEventListener("b_preview_with_metadata", (event) => {
            const { blob, nodeId, displayNodeId, node_id, display_node_id } = event.detail ?? {};
            showSamplingPreview(blob, [nodeId, displayNodeId, node_id, display_node_id].filter((id) => id != null));
        });
        api.addEventListener("b_preview", (event) => {
            if (api.serverSupportsFeature?.("supports_preview_metadata") || executingNodeId == null) return;
            showSamplingPreview(event.detail, [executingNodeId]);
        });
        const clearAll = () => {
            executingNodeId = null;
            for (const node of app.graph?._nodes ?? []) {
                if (node.type === "HexImage") clearStepPreview(node);
            }
        };
        for (const event of ["execution_error", "execution_interrupted", "execution_success"]) {
            api.addEventListener(event, clearAll);
        }
    },
});

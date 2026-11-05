import { app, ComfyApp } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const RANDOM_SEED = -1;
const IMAGE_PREVIEW_WIDGET = "$$canvas-image-preview";
const PRESETS = [
    [512, 2016], [2016, 512], [576, 1792], [1792, 576],
    [672, 1536], [1536, 672], [672, 1600], [1600, 672],
    [768, 1344], [1344, 768], [800, 1344], [1344, 800],
    [832, 1248], [1248, 832], [896, 1152], [1152, 896],
    [960, 1120], [1120, 960], [1024, 1024],
    [768, 1216], [832, 1216], [720, 1280],
    [640, 1536], [1024, 1496], [1496, 1024], [1216, 832],
    [1024, 576], [1280, 768],
];
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const sortedPresets = [...new Map(PRESETS.map(([w, h]) => [`${w}x${h}`, [w, h]])).values()]
    .sort(([aw, ah], [bw, bh]) => aw / ah - bw / bh || aw - bw);

function newSeed() {
    const parts = new Uint32Array(2);
    crypto.getRandomValues(parts);
    return (parts[0] & 0x3ffff) * 0x100000000 + parts[1];
}

function showWidget(widget, visible) {
    if (!widget) return;
    if (!widget.hexusDisplay) {
        widget.hexusDisplay = {
            type: widget.type,
            computeSize: widget.computeSize,
            hidden: widget.hidden,
            optionsHidden: widget.options?.hidden,
        };
    }
    widget.options ||= {};
    widget.hidden = visible ? widget.hexusDisplay.hidden : true;
    if (visible && widget.hexusDisplay.optionsHidden === undefined) delete widget.options.hidden;
    else widget.options.hidden = visible ? widget.hexusDisplay.optionsHidden : true;
    widget.type = visible ? widget.hexusDisplay.type : "hexus-hidden";
    widget.computeSize = visible ? widget.hexusDisplay.computeSize : () => [0, -4];
}

function syncMode(node) {
    const mode = node.widgets?.find((widget) => widget.name === "mode")?.value ?? "t2i";
    const needsImage = mode !== "t2i";
    for (const name of ["image", "upload"]) {
        showWidget(node.widgets?.find((widget) => widget.name === name), needsImage);
    }
    showWidget(node.widgets?.find((widget) => widget.name === IMAGE_PREVIEW_WIDGET), needsImage);
    for (const name of ["width", "height", "Ratio Preset"]) {
        showWidget(node.widgets?.find((widget) => widget.name === name), !needsImage);
    }
    showWidget(node.widgets?.find((widget) => widget.name === "batch_size"), mode !== "i2i");
    showWidget(node.widgets?.find((widget) => widget.name === "Edit Mask"), mode === "Inpaint");
    for (const name of ["guide_size", "guide_size_for", "max_size", "feather", "crop_factor"]) {
        showWidget(node.widgets?.find((widget) => widget.name === name), mode === "Inpaint");
    }
    node.setSize?.([node.size[0], node.computeSize()[1]]);
    node.setDirtyCanvas?.(true, true);
}

function sourceImageUrl(source) {
    if (!source) return null;
    let filename, subfolder, type;
    if (typeof source === "string") {
        const match = /^(.*?)(?: \[(input|output|temp)\])?$/.exec(source);
        const path = match[1].replaceAll("\\", "/");
        const slash = path.lastIndexOf("/");
        filename = path.slice(slash + 1);
        subfolder = slash >= 0 ? path.slice(0, slash) : "";
        type = match[2] ?? "input";
    } else {
        ({ filename, subfolder = "", type = "input" } = source);
    }
    if (!filename) return null;
    const params = new URLSearchParams({ filename, type });
    if (subfolder) params.set("subfolder", subfolder);
    return api.apiURL(`/view?${params}`);
}

function sourceForWidget(node, value) {
    if (node.hexusSourceRefValue === value) return node.hexusSourceRef;
    const image = node.images?.[0];
    if (image?.filename && value?.startsWith(`${image.filename} [`)) return image;
    return value;
}

function loadSourceImage(node, source) {
    const value = node.widgets?.find((widget) => widget.name === "image")?.value;
    node.hexusSourceValue = value;
    const sequence = (node.hexusSourceSequence ?? 0) + 1;
    node.hexusSourceSequence = sequence;
    node.imgs = undefined;
    const url = sourceImageUrl(source);
    if (!url) return Promise.resolve(false);
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            if (sequence !== node.hexusSourceSequence) return resolve(false);
            node.hexusSourceUrl = image.src;
            node.imgs = [image];
            node.imageIndex = 0;
            node.setSize?.([node.size[0], node.computeSize()[1]]);
            node.setDirtyCanvas?.(true, true);
            resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = url;
    });
}

function sourceOnlyPreview(node, widget) {
    if (widget.hexusSourceOnly) return;
    const drawWidget = widget.drawWidget;
    widget.drawWidget = function (context, options) {
        return drawWidget.call(this, context, { ...options, previewImages: node.imgs ?? [] });
    };
    widget.hexusSourceOnly = true;
    showWidget(widget, node.widgets?.find((item) => item.name === "mode")?.value !== "t2i");
}

function openRatioPreset(node) {
    const width = node.widgets.find((widget) => widget.name === "width");
    const height = node.widgets.find((widget) => widget.name === "height");
    if (!width || !height) return;

    const select = document.createElement("select");
    for (const [w, h] of sortedPresets) {
        const divisor = gcd(w, h);
        const option = document.createElement("option");
        option.value = `${w}x${h}`;
        option.textContent = `${w} × ${h} (${w / divisor}:${h / divisor})`;
        select.append(option);
    }
    const current = `${width.value}x${height.value}`;
    select.value = sortedPresets.some(([w, h]) => `${w}x${h}` === current) ? current : "1024x1024";
    const canvas = app.canvas.canvas;
    const rect = canvas.getBoundingClientRect();
    const scale = app.canvas.ds.scale;
    const offset = app.canvas.ds.offset;
    Object.assign(select.style, {
        position: "fixed", zIndex: "10000",
        left: `${Math.max(0, rect.left + (node.pos[0] + offset[0]) * scale)}px`,
        top: `${Math.min(window.innerHeight - 30, rect.top + (node.pos[1] + offset[1] + node.size[1]) * scale)}px`,
        width: `${Math.max(180, node.size[0] * scale)}px`,
        color: "#eee", background: "#2d3547", border: "1px solid #7894c2",
        padding: "4px", fontSize: "12px",
    });
    const close = () => select.remove();
    select.addEventListener("change", () => {
        [width.value, height.value] = select.value.split("x").map(Number);
        node.setDirtyCanvas?.(true, true);
        close();
    });
    select.addEventListener("blur", close);
    document.body.append(select);
    select.focus();
    try { select.showPicker?.(); } catch { /* The select remains available. */ }
}

function setDragSensitivity(node) {
    for (const name of ["steps", "seed", "cfg", "denoise", "width", "height", "batch_size"]) {
        const widget = node.widgets.find((item) => item.name === name);
        if (typeof widget?.onDrag !== "function") continue;
        const onPointerDown = widget.onPointerDown;
        let dragPixels = 0;
        widget.onPointerDown = function (pointer, node, canvas) {
            dragPixels = 0;
            return onPointerDown?.call(this, pointer, node, canvas);
        };
        widget.onDrag = function ({ e, node, canvas }) {
            const width = this.width || node.width;
            const x = e.canvasX - node.pos[0];
            if ((x < 40 || x > width - 40) && x > -3 && x < width + 3) return;
            dragPixels += e.deltaX ?? 0;
            const increments = Math.trunc(dragPixels / 5);
            if (!increments) return;
            dragPixels -= increments * 5;
            const step = this.options.step2 ?? (this.options.step ? this.options.step / 10 : 1);
            this.setValue(this.value + increments * step, { e, node, canvas });
        };
    }
}

function insertAfter(node, anchor, widgets) {
    for (const widget of widgets) node.widgets.splice(node.widgets.indexOf(widget), 1);
    node.widgets.splice(node.widgets.indexOf(anchor) + 1, 0, ...widgets);
}

function placeMaskButton(node) {
    const preview = node.widgets?.find((widget) => widget.name === IMAGE_PREVIEW_WIDGET);
    const button = node.widgets?.find((widget) => widget.name === "Edit Mask");
    if (preview && button && node.widgets.indexOf(button) < node.widgets.indexOf(preview)) {
        insertAfter(node, preview, [button]);
    }
}

function keepSourceImagePreview(node) {
    let images = node.imgs;
    node.hexusSourceUrl = images?.[0]?.src;
    Object.defineProperty(node, "imgs", {
        configurable: true,
        get() { return images; },
        set(next) {
            if (!Array.isArray(next) || !next.length || next.every((image) =>
                image?.src === node.hexusSourceUrl || image?.src?.startsWith("data:image/"))) {
                images = next;
            }
        },
    });
}

function showImage(node, imageIndex) {
    const image = node.imgs?.[imageIndex ?? node.imageIndex ?? node.overIndex ?? 0];
    if (!image?.src) return;
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "10000", display: "flex",
        alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.9)",
    });
    const enlarged = document.createElement("img");
    enlarged.src = image.src;
    Object.assign(enlarged.style, { maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain" });
    const close = () => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
    };
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.append(enlarged);
    document.body.append(overlay);
    document.addEventListener("keydown", onKeyDown);
}

function bypassImageGallery() {
    const gallery = app.ui?.carousel;
    if (!gallery || gallery.hexusSamplerSimplePreview) return;
    const show = gallery.show;
    gallery.show = function (node, imageIndex, ...args) {
        if (node?.type === "HexSampler" &&
            node.widgets?.find((widget) => widget.name === "mode")?.value !== "t2i") {
            showImage(node, imageIndex);
            return;
        }
        return show.call(this, node, imageIndex, ...args);
    };
    gallery.hexusSamplerSimplePreview = true;
}

function installImagePreview() {
    const canvas = app.canvas;
    if (!canvas || canvas.hexusSamplerPreviewInstalled) return;
    canvas.processMouseDown = function (event) {
        const result = Object.getPrototypeOf(this).processMouseDown.apply(this, arguments);
        const node = this.graph?.getNodeOnPos(event.canvasX, event.canvasY, this.visible_nodes);
        if (node?.type === "HexSampler" && node.imgs?.length &&
            node.widgets?.find((widget) => widget.name === "mode")?.value !== "t2i" &&
            node.getWidgetOnPos(event.canvasX, event.canvasY)?.constructor.name === "ImagePreviewWidget") {
            this.pointer.onDoubleClick = () => showImage(node);
        }
        return result;
    };
    canvas.hexusSamplerPreviewInstalled = true;
}

app.registerExtension({
    name: "Hexus.HexSampler",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexSampler") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            keepSourceImagePreview(this);
            installImagePreview();
            bypassImageGallery();
            const addCustomWidget = this.addCustomWidget;
            this.addCustomWidget = function (widget) {
                const result = addCustomWidget.call(this, widget);
                if (widget.name === IMAGE_PREVIEW_WIDGET) {
                    sourceOnlyPreview(this, widget);
                    placeMaskButton(this);
                }
                return result;
            };
            const existingPreview = this.widgets?.find((widget) => widget.name === IMAGE_PREVIEW_WIDGET);
            if (existingPreview) sourceOnlyPreview(this, existingPreview);
            const modeWidget = this.widgets?.find((widget) => widget.name === "mode");
            const imageWidget = this.widgets?.find((widget) => widget.name === "image");
            const seedWidget = this.widgets?.find((widget) => widget.name === "seed");
            const batchWidget = this.widgets?.find((widget) => widget.name === "batch_size");
            if (!modeWidget || !imageWidget || !seedWidget || !batchWidget) return;

            const modeLabels = { t2i: "🎨 t2i", i2i: "🖼️ i2i", Inpaint: "🖌️ Inpaint" };
            modeWidget.options.getOptionLabel = (value) => modeLabels[value] ?? value;
            const modeClick = modeWidget.onClick;
            modeWidget.onClick = function (context) {
                const openMenus = new Set(document.querySelectorAll(".litecontextmenu"));
                const result = modeClick.call(this, context);
                const menu = [...document.querySelectorAll(".litecontextmenu")]
                    .find((item) => !openMenus.has(item));
                if (menu) {
                    menu.style.minWidth = "240px";
                    for (const entry of menu.querySelectorAll(".litemenu-entry")) {
                        entry.style.minHeight = "36px";
                        entry.style.padding = "8px 14px";
                        entry.style.boxSizing = "border-box";
                    }
                    const bounds = menu.getBoundingClientRect();
                    if (bounds.right > window.innerWidth - 10) {
                        menu.style.left = `${Math.max(0, window.innerWidth - bounds.width - 10)}px`;
                    }
                    if (bounds.bottom > window.innerHeight - 10) {
                        menu.style.top = `${Math.max(0, window.innerHeight - bounds.height - 10)}px`;
                    }
                }
                return result;
            };

            const denoiseWidget = this.widgets.find((widget) => widget.name === "denoise");
            if (denoiseWidget?.options) {
                delete denoiseWidget.options.precision;
                Object.defineProperty(denoiseWidget, "_displayValue", {
                    configurable: true,
                    get() {
                        if (this.computedDisabled) return "";
                        return String(Number(Number(this.value).toFixed(2)));
                    },
                });
            }
            setDragSensitivity(this);
            const controlIndex = this.widgets.findIndex((widget) => widget.name === "control_after_generate");
            if (controlIndex !== -1) this.widgets.splice(controlIndex, 1);
            showWidget(this.widgets.find((widget) => widget.name === "step_preview"), false);

            const modeChanged = modeWidget.callback;
            modeWidget.callback = (...args) => {
                modeChanged?.apply(modeWidget, args);
                syncMode(this);
                if (modeWidget.value !== "t2i" && imageWidget.value &&
                    this.hexusSourceValue !== imageWidget.value) imageWidget.callback?.(imageWidget.value);
            };
            const imageChanged = imageWidget.callback;
            imageWidget.callback = (...args) => {
                imageChanged?.apply(imageWidget, args);
                return loadSourceImage(this, sourceForWidget(this, imageWidget.value));
            };

            this.hexusLastSeed = null;
            const toggleSeed = this.addWidget("button", "🎲 Random / ♻️ Last Seed", null, () => {
                seedWidget.value = seedWidget.value === RANDOM_SEED && this.hexusLastSeed !== null
                    ? this.hexusLastSeed : RANDOM_SEED;
                this.setDirtyCanvas?.(true, true);
            }, { serialize: false });
            const fixedSeed = this.addWidget("button", "🎲 New Random Fix", null, () => {
                seedWidget.value = newSeed();
                this.setDirtyCanvas?.(true, true);
            }, { serialize: false });
            insertAfter(this, seedWidget, [toggleSeed, fixedSeed]);

            const presetButton = this.addWidget("button", "Ratio Preset", null,
                () => openRatioPreset(this), { serialize: false });
            insertAfter(this, batchWidget, [presetButton]);

            this.addWidget("button", "Edit Mask", null, async () => {
                if (!imageWidget.value) return;
                if (!this.imgs?.length && !await loadSourceImage(this, sourceForWidget(this, imageWidget.value))) return;
                ComfyApp.clipspace_return_node = this;
                ComfyApp.open_maskeditor?.();
            }, { serialize: false });
            placeMaskButton(this);

            this.hexusSetSourceImage = (source, mode = "i2i") => {
                if (!source || !["i2i", "Inpaint"].includes(mode)) return Promise.resolve(false);
                const filename = typeof source === "string" ? source
                    : `${[source.subfolder, source.filename].filter(Boolean).join("/")} [${source.type ?? "output"}]`;
                const values = imageWidget.options.values;
                if (Array.isArray(values) && !values.includes(filename)) values.push(filename);
                const previous = imageWidget.value;
                modeWidget.value = mode;
                imageWidget.value = filename;
                this.hexusSourceRef = source;
                this.hexusSourceRefValue = filename;
                syncMode(this);
                const loaded = imageWidget.callback?.(filename);
                this.onWidgetChanged?.("image", filename, previous, imageWidget);
                return loaded;
            };
            const drawBackground = this.onDrawBackground;
            this.onDrawBackground = function (...args) {
                drawBackground?.apply(this, args);
                if (modeWidget.value !== "t2i" && imageWidget.value &&
                    this.hexusSourceValue !== imageWidget.value) {
                    imageWidget.callback?.(imageWidget.value);
                }
            };
            syncMode(this);
        };

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            if (Array.isArray(info.widgets_values) && info.widgets_values.length <= 2) {
                const oldValues = info.widgets_values;
                const names = ["mode", "sampler", "scheduler", "steps", "cfg", "denoise", "seed",
                    "width", "height", "batch_size", "image"];
                info = { ...info, widgets_values: names.map((name) => name === "mode" ? oldValues[0]
                    : name === "image" ? oldValues[1] : this.widgets?.find((widget) => widget.name === name)?.value) };
            } else if (Array.isArray(info.widgets_values) && typeof info.widgets_values[7] === "string") {
                info = { ...info, widgets_values: [
                    ...info.widgets_values.slice(0, 7), ...info.widgets_values.slice(8),
                ] };
            }
            const result = configure?.call(this, info);
            for (const name of ["context", "latent", "mask"]) {
                const index = this.inputs?.findIndex((input) => input.name === name) ?? -1;
                if (index >= 0) this.removeInput(index);
            }
            syncMode(this);
            const imageWidget = this.widgets?.find((widget) => widget.name === "image");
            const modeWidget = this.widgets?.find((widget) => widget.name === "mode");
            if (modeWidget?.value !== "t2i" && imageWidget?.value) imageWidget.callback?.(imageWidget.value);
            return result;
        };
    },
    setup() {
        installImagePreview();
        bypassImageGallery();
        const queuePrompt = api.queuePrompt;
        api.queuePrompt = async function (index, prompt, ...args) {
            const queued = [];
            const stepPreviewSamplers = new Set();
            for (const [imageId, entry] of Object.entries(prompt?.output ?? {})) {
                if (entry.class_type !== "HexImage") continue;
                const source = entry.inputs?.images;
                if (!Array.isArray(source) || Number(source[1]) !== 0) continue;
                const workflowNode = prompt.workflow?.nodes?.find((item) => String(item.id) === imageId);
                const canvasNode = app.graph?.getNodeById(Number(imageId));
                const enabled = canvasNode?.properties?.hexusStepPreview
                    ?? workflowNode?.properties?.hexusStepPreview ?? true;
                if (enabled) stepPreviewSamplers.add(String(source[0]));
            }
            for (const [id, entry] of Object.entries(prompt?.output ?? {})) {
                if (entry.class_type !== "HexSampler") continue;
                entry.inputs.step_preview = stepPreviewSamplers.has(id);
                const seed = Number(entry.inputs.seed);
                const actualSeed = seed === RANDOM_SEED ? newSeed() : seed;
                entry.inputs.seed = actualSeed;

                const workflowNode = prompt.workflow?.nodes?.find((item) => String(item.id) === id);
                if (Array.isArray(workflowNode?.widgets_values)) workflowNode.widgets_values[6] = actualSeed;
                const node = app.graph?.getNodeById(Number(id));
                if (node) queued.push([node, actualSeed]);
            }
            const result = await queuePrompt.call(this, index, prompt, ...args);
            for (const [node, seed] of queued) {
                node.hexusLastSeed = seed;
            }
            return result;
        };
    },
});

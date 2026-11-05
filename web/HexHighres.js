import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const RANDOM_SEED = -1;

function newSeed() {
    const parts = new Uint32Array(2);
    crypto.getRandomValues(parts);
    return (parts[0] & 0x3ffff) * 0x100000000 + parts[1];
}

function updateInputAppearance(node) {
    const image = node.inputs?.find((input) => input.name === "image");
    const latent = node.inputs?.find((input) => input.name === "latent");
    if (!image || !latent) return;

    for (const [input, inactive] of [[image, latent.link != null], [latent, image.link != null]]) {
        input.color_on = inactive ? "#666" : undefined;
        input.color_off = inactive ? "#666" : undefined;
        input.label = inactive ? `${input.name} (inactive)` : undefined;
    }
    node.setDirtyCanvas?.(true, true);
}

function setDragSensitivity(node) {
    const dragSteps = { scale_by: 0.5, cfg: 0.5, denoise: 0.05 };
    for (const name of ["scale_by", "seed", "steps", "cfg", "denoise"]) {
        const widget = node.widgets?.find((item) => item.name === name);
        if (dragSteps[name] && widget?.options) {
            widget.options.round = 0;
            Object.defineProperty(widget, "_displayValue", {
                configurable: true,
                get() { return this.computedDisabled ? "" : String(this.value); },
            });
        }
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
            const step = dragSteps[name] ?? this.options.step2 ?? (this.options.step ? this.options.step / 10 : 1);
            this.setValue(this.value + increments * step, { e, node, canvas });
        };
    }
}

function insertAfter(node, anchor, widgets) {
    for (const widget of widgets) node.widgets.splice(node.widgets.indexOf(widget), 1);
    node.widgets.splice(node.widgets.indexOf(anchor) + 1, 0, ...widgets);
}

app.registerExtension({
    name: "Hexus.HexHighresInputs",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexHighres") return;
        for (const inputs of Object.values(nodeData.input ?? {})) {
            for (const spec of Object.values(inputs ?? {})) {
                if (spec?.[1] && typeof spec[1] === "object" && !Array.isArray(spec[1])) {
                    delete spec[1].tooltip;
                }
            }
        }

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            originalCreated?.apply(this, arguments);
            for (const widget of this.widgets ?? []) {
                if (widget.options) delete widget.options.tooltip;
                delete widget.tooltip;
            }
            for (const input of this.inputs ?? []) delete input.tooltip;
            setDragSensitivity(this);
            const seedWidget = this.widgets?.find((widget) => widget.name === "seed");
            const controlIndex = this.widgets?.findIndex((widget) => widget.name === "control_after_generate") ?? -1;
            if (controlIndex !== -1) this.widgets.splice(controlIndex, 1);
            if (seedWidget) {
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
            }
            updateInputAppearance(this);
        };

        const originalConfigure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            if (Array.isArray(info.widgets_values) && typeof info.widgets_values[3] === "string") {
                info = { ...info, widgets_values: [
                    ...info.widgets_values.slice(0, 3), ...info.widgets_values.slice(4),
                ] };
            }
            return originalConfigure?.call(this, info);
        };

        const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, index, connected) {
            originalConnectionsChange?.apply(this, arguments);
            if (this._hexHighresDisconnecting) return;

            const input = this.inputs?.[index];
            if (type === 1 && connected && (input?.name === "image" || input?.name === "latent") && !app.configuringGraph) {
                const otherName = input.name === "image" ? "latent" : "image";
                const otherIndex = this.inputs.findIndex((slot) => slot.name === otherName);
                if (otherIndex >= 0 && this.inputs[otherIndex].link != null) {
                    this._hexHighresDisconnecting = true;
                    try {
                        this.disconnectInput(otherIndex);
                    } finally {
                        this._hexHighresDisconnecting = false;
                    }
                }
            }
            updateInputAppearance(this);
        };
    },
    setup() {
        const queuePrompt = api.queuePrompt;
        api.queuePrompt = async function (index, prompt, ...args) {
            const queued = [];
            for (const [id, entry] of Object.entries(prompt?.output ?? {})) {
                if (entry.class_type !== "HexHighres") continue;
                if (Array.isArray(entry.inputs.seed)) continue;
                const seed = Number(entry.inputs.seed);
                if (!Number.isFinite(seed)) continue;
                const actualSeed = seed === RANDOM_SEED ? newSeed() : seed;
                entry.inputs.seed = actualSeed;
                const workflowNode = prompt.workflow?.nodes?.find((item) => String(item.id) === id);
                if (Array.isArray(workflowNode?.widgets_values)) workflowNode.widgets_values[2] = actualSeed;
                const node = app.graph?.getNodeById(Number(id));
                if (node) queued.push([node, actualSeed]);
            }
            const result = await queuePrompt.call(this, index, prompt, ...args);
            for (const [node, seed] of queued) node.hexusLastSeed = seed;
            return result;
        };
    },
});

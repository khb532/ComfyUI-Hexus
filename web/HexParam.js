import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const RANDOM_SEED = -1;

function newSeed() {
    const parts = new Uint32Array(2);
    crypto.getRandomValues(parts);
    return (parts[0] & 0x3ffff) * 0x100000000 + parts[1];
}

app.registerExtension({
    name: "Hexus.HexParam",
    beforeConfigureGraph(graph) {
        for (const node of graph.nodes ?? []) {
            if (node.type !== "HexParam") continue;
            if (node.outputs?.length === 5) {
                for (const output of node.outputs) {
                    if (typeof output.slot_index === "number") output.slot_index += 1;
                }
                node.outputs.unshift({ name: "context", type: "HEX_PARAM_CONTEXT", links: null });
                for (const link of graph.links ?? []) {
                    if (Array.isArray(link) && String(link[1]) === String(node.id)) link[2] += 1;
                    else if (String(link.origin_id) === String(node.id)) link.origin_slot += 1;
                }
            }
            if (node.outputs?.length === 6) {
                node.outputs[0].name = "context";
                for (const output of node.outputs.slice(4)) {
                    if (typeof output.slot_index === "number") output.slot_index += 1;
                }
                node.outputs.splice(4, 0, { name: "DENOISE", type: "FLOAT", links: null });
                for (const link of graph.links ?? []) {
                    if (Array.isArray(link) && String(link[1]) === String(node.id) && link[2] >= 4) link[2] += 1;
                    else if (String(link.origin_id) === String(node.id) && link.origin_slot >= 4) link.origin_slot += 1;
                }
            }
        }
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexParam") return;

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            const values = info.widgets_values;
            if (Array.isArray(values) && typeof values[0] === "number" && typeof values[1] === "number") {
                const hasControl = typeof values[2] === "string";
                const cfgIndex = hasControl ? 3 : 2;
                info = { ...info, widgets_values: [values[cfgIndex + 1], values[cfgIndex + 2], values[0], values[cfgIndex], 1.0, values[1]] };
            } else if (Array.isArray(values) && values.length === 5 && typeof values[0] === "string") {
                info = { ...info, widgets_values: [...values.slice(0, 4), 1.0, values[4]] };
            }
            return configure?.call(this, info);
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const seedWidget = this.widgets?.find((widget) => widget.name === "seed");
            if (!seedWidget) return;
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
            for (const name of ["steps", "seed", "cfg", "denoise"]) {
                const widget = this.widgets.find((item) => item.name === name);
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
            const controlIndex = this.widgets.findIndex((widget) => widget.name === "control_after_generate");
            if (controlIndex !== -1) this.widgets.splice(controlIndex, 1);

            this.hexusLastSeed = null;
            const randomButton = this.addWidget("button", "🎲 Random", null, () => {
                seedWidget.value = RANDOM_SEED;
                this.setDirtyCanvas?.(true, true);
            }, { serialize: false });
            const fixedButton = this.addWidget("button", "🎲 New Random Fix", null, () => {
                seedWidget.value = newSeed();
                this.setDirtyCanvas?.(true, true);
            }, { serialize: false });
            const lastButton = this.addWidget("button", "♻️ Last", null, () => {
                if (this.hexusLastSeed === null) return;
                seedWidget.value = this.hexusLastSeed;
                this.setDirtyCanvas?.(true, true);
            }, { serialize: false });
            lastButton.disabled = true;
            this.hexusLastButton = lastButton;
            const buttons = [randomButton, fixedButton, lastButton];
            for (const button of buttons) this.widgets.splice(this.widgets.indexOf(button), 1);
            this.widgets.splice(this.widgets.indexOf(seedWidget) + 1, 0, ...buttons);
        };
    },
    setup() {
        const queuePrompt = api.queuePrompt;
        api.queuePrompt = async function (index, prompt, ...args) {
            const queued = [];
            for (const [id, entry] of Object.entries(prompt?.output ?? {})) {
                if (entry.class_type !== "HexParam") continue;
                const node = app.graph?.getNodeById(Number(id));
                const seed = Number(entry.inputs.seed);
                const actualSeed = seed === RANDOM_SEED ? newSeed() : seed;
                entry.inputs.seed = actualSeed;

                const workflowNode = prompt.workflow?.nodes?.find((item) => String(item.id) === id);
                if (Array.isArray(workflowNode?.widgets_values)) {
                    workflowNode.widgets_values[5] = actualSeed;
                }
                if (node) queued.push([node, actualSeed]);
            }

            const result = await queuePrompt.call(this, index, prompt, ...args);
            for (const [node, seed] of queued) {
                node.hexusLastSeed = seed;
                if (node.hexusLastButton) node.hexusLastButton.disabled = false;
                node.setDirtyCanvas?.(true, true);
            }
            return result;
        };
    },
});

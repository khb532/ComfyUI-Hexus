import { app } from "../../../scripts/app.js";

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
    for (const name of ["scale_by", "seed", "steps", "cfg", "denoise"]) {
        const widget = node.widgets?.find((item) => item.name === name);
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
            updateInputAppearance(this);
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
});

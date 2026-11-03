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

app.registerExtension({
    name: "Hexus.HexHighresInputs",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "HexHighres") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            originalCreated?.apply(this, arguments);
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

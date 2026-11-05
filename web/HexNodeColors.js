import { app } from "../../../scripts/app.js";


const DEFAULT_COLORS = {
    HexPrompt: { color: "#2a363b", bgcolor: "#3f5159" }, // pale_blue
    HexParam: { color: "#232", bgcolor: "#353" }, // green
    HexImage: { color: "#322", bgcolor: "#533" }, // red
    HexHighres: { color: "#432", bgcolor: "#653" }, // yellow
    HexLoraStack: { color: "#233", bgcolor: "#355" }, // cyan
    HexLatent: { color: "#323", bgcolor: "#535" }, // purple
    HexSampler: { color: "#223", bgcolor: "#335" }, // blue
};


app.registerExtension({
    name: "Hexus.NodeColors",
    beforeRegisterNodeDef(nodeType, nodeData) {
        const colors = DEFAULT_COLORS[nodeData.name];
        if (!colors) return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this.color = colors.color;
            this.bgcolor = colors.bgcolor;
        };
    },
});

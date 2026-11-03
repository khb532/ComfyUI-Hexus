import { app } from "../../../scripts/app.js";

// 1024 bucket from EasyUse Anima Prompt Studio, plus valid SDXL sizes from Efficiency ED.
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

const uniquePresets = [...new Map(PRESETS.map(([width, height]) => [`${width}x${height}`, [width, height]])).values()];

const gcd = (a, b) => b ? gcd(b, a % b) : a;
const sortedPresets = uniquePresets.sort(([widthA, heightA], [widthB, heightB]) =>
    widthA / heightA - widthB / heightB || widthA - widthB
);

function openPresetDropdown(node) {
    const widthWidget = node.widgets?.find((widget) => widget.name === "width");
    const heightWidget = node.widgets?.find((widget) => widget.name === "height");
    if (!widthWidget || !heightWidget) return;

    const select = document.createElement("select");
    for (const [width, height] of sortedPresets) {
        const divisor = gcd(width, height);
        const option = document.createElement("option");
        option.value = `${width}x${height}`;
        option.textContent = `${width} × ${height} (${width / divisor}:${height / divisor})`;
        select.append(option);
    }
    const current = `${widthWidget.value}x${heightWidget.value}`;
    select.value = sortedPresets.some(([width, height]) => `${width}x${height}` === current)
        ? current : "1024x1024";

    const canvas = app.canvas.canvas;
    const rect = canvas.getBoundingClientRect();
    const scale = app.canvas.ds.scale;
    const offset = app.canvas.ds.offset;
    const left = rect.left + (node.pos[0] + offset[0]) * scale;
    const top = rect.top + (node.pos[1] + offset[1] + node.size[1]) * scale;
    Object.assign(select.style, {
        position: "fixed", zIndex: "10000", left: `${Math.max(0, left)}px`,
        top: `${Math.min(window.innerHeight - 30, top)}px`,
        width: `${Math.max(180, node.size[0] * scale)}px`,
        color: "#eee", background: "#2d3547", border: "1px solid #7894c2",
        padding: "4px", fontSize: "12px",
    });

    const close = () => select.remove();
    select.addEventListener("change", () => {
        const [width, height] = select.value.split("x").map(Number);
        widthWidget.value = width;
        heightWidget.value = height;
        app.graph?.setDirtyCanvas(true, true);
        close();
    });
    select.addEventListener("blur", close);
    document.body.append(select);
    select.focus();
    try {
        select.showPicker?.();
    } catch {
        // The select remains available if the browser blocks programmatic opening.
    }
}

app.registerExtension({
    name: "Hexus.LatentRatioPresets",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LatentRatio") return;
        const original = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            original?.apply(this, arguments);
            this.addWidget("button", "Preset", null, () => openPresetDropdown(this), { serialize: false });
        };
    },
});

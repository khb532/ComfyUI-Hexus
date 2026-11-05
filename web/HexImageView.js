// SPDX-License-Identifier: GPL-3.0-only
// Adapted from ComfyUI-ImageGallery-ED/js/ed_imageGallery.js.
import { app } from "../../../scripts/app.js";

function showGallery(node, startIndex) {
    const images = node.imgs;
    if (!images?.length) return;

    let index = Math.min(Math.max(startIndex ?? 0, 0), images.length - 1);
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "10000", display: "flex",
        alignItems: "center", justifyContent: "center", overflow: "hidden",
        background: "rgba(0, 0, 0, 0.9)", userSelect: "none",
    });
    const image = document.createElement("img");
    image.draggable = false;
    Object.assign(image.style, {
        maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", cursor: "grab",
    });
    const label = document.createElement("div");
    Object.assign(label.style, {
        position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)",
        color: "white", font: "13px sans-serif", pointerEvents: "none",
    });
    const button = (text, side, click) => {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = text;
        Object.assign(element.style, {
            position: "absolute", top: side === "right-top" ? "16px" : "50%",
            [side.startsWith("left") ? "left" : "right"]: "16px",
            width: "42px", height: "42px", border: "0", borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.16)", color: "white",
            fontSize: "24px", cursor: "pointer",
        });
        element.addEventListener("click", (event) => {
            event.stopPropagation();
            click();
        });
        overlay.append(element);
    };
    const transform = () => {
        image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    };
    const select = (next) => {
        index = (next + images.length) % images.length;
        zoom = 1;
        panX = panY = 0;
        image.src = images[index].src;
        label.textContent = images.length > 1 ? `${index + 1} / ${images.length}` : "";
        node.imageIndex = index;
        node.setDirtyCanvas?.(true, true);
        transform();
    };
    const close = () => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
    };
    const onKeyDown = (event) => {
        if (event.key === "Escape") close();
        else if (event.key === "ArrowLeft") select(index - 1);
        else if (event.key === "ArrowRight") select(index + 1);
    };

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });
    overlay.addEventListener("wheel", (event) => {
        event.preventDefault();
        zoom = Math.min(10, Math.max(0.2, zoom + (event.deltaY < 0 ? 0.2 : -0.2)));
        transform();
    }, { passive: false });
    image.addEventListener("pointerdown", (event) => {
        dragging = true;
        pointerX = event.clientX;
        pointerY = event.clientY;
        image.setPointerCapture(event.pointerId);
        image.style.cursor = "grabbing";
    });
    image.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        panX += event.clientX - pointerX;
        panY += event.clientY - pointerY;
        pointerX = event.clientX;
        pointerY = event.clientY;
        transform();
    });
    image.addEventListener("pointerup", () => {
        dragging = false;
        image.style.cursor = "grab";
    });

    overlay.append(image, label);
    button("×", "right-top", close);
    if (images.length > 1) {
        button("‹", "left", () => select(index - 1));
        button("›", "right", () => select(index + 1));
    }
    document.body.append(overlay);
    document.addEventListener("keydown", onKeyDown);
    select(index);
}

function handleDoubleClick(event) {
    const canvas = app.canvas;
    if (!canvas?.canvas?.contains(event.target)) return;
    const [x, y] = canvas.convertEventToCanvasOffset(event);
    const node = canvas.graph?.getNodeOnPos(x, y, canvas.visible_nodes);
    if (!["HexSampler", "HexImage"].includes(node?.type) || !node.imgs?.length) return;
    if (node.type === "HexSampler" &&
        node.widgets?.find((widget) => widget.name === "mode")?.value === "t2i") return;
    const widget = node.getWidgetOnPos(x, y);
    if (widget?.constructor.name !== "ImagePreviewWidget") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showGallery(node, node.imageIndex ?? node.overIndex ?? 0);
}

app.registerExtension({
    name: "Hexus.ImageGallery",
    setup() {
        document.addEventListener("dblclick", handleDoubleClick, true);
    },
});

# ComfyUI-Hexus

This repository is a custom node project for ComfyUI. Inspect the existing files before assuming a node layout or dependencies.

## Project concept

- The main feature is a single integrated generation node with a WebUI-like interface. It should expose generation settings such as CFG, steps, batch size, sampler, scheduler, and denoise, and run the workflow through image saving.
- Supporting nodes adapt useful behavior from ComfyUI core and other custom nodes while keeping their inputs and outputs easy to connect to standard nodes.
- When a Hexus node uses a custom data structure, expose both the complete structure and separate outputs for its useful components. Favor standard ComfyUI output types for those component outputs.

- Keep changes small and focused on this project.
- Follow ComfyUI node conventions and register new nodes through `NODE_CLASS_MAPPINGS` in `__init__.py` when implementation begins.
- Preserve node names, inputs, and outputs used by saved workflows when changing existing nodes.
- Check the relevant behavior locally before reporting a change as complete.
- When looking up this package's nodes and their code locations, check `.codex/Nodes.md` first.
- When exploring paths inside this package, check `.codex/InPath.md` first.
- When looking up another custom node package, check `.codex/OutPath.md` first. If it is not listed there, search the parent `custom_nodes` directory directly.

The parent ComfyUI `AGENTS.md` also applies.

from .nodes import YedpActionDirector, YedpMocapSurgeon, YedpBlockout

# Mappings for ComfyUI to register the node
NODE_CLASS_MAPPINGS = {
    "YedpActionDirector": YedpActionDirector,
    "YedpMocapSurgeon": YedpMocapSurgeon,
    "YedpBlockout": YedpBlockout
}

# Human-readable display name
NODE_DISPLAY_NAME_MAPPINGS = {
    "YedpActionDirector": "🎬 Yedp Action Director",
    "YedpMocapSurgeon": "⚕️ Yedp Mocap Surgeon",
    "YedpBlockout": "🧊 Yedp Blockout"
}

# Web directory to be served automatically by ComfyUI
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]


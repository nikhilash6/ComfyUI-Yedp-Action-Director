# **🎬 ComfyUI Yedp Action Director**


https://github.com/user-attachments/assets/bb543f35-2efe-49a9-b51a-093986ddd25e


**A powerful 3D viewport node for ComfyUI to direct, preview, and batch-render 3D character animations, environments, and custom cameras for ControlNet workflows.**


## **🌟 Overview**

**Yedp Action Director** is a custom node for ComfyUI that integrates a fully interactive 3D viewport directly into your workflow. It allows you to dynamically load up to 16 characters, assign independent MoCap animations, import full 3D environments and baked physics, compose them in 3D space, animate or override camera movements, and bake pixel-perfect **OpenPose, Depth, Canny, Normal, Shaded, and Alpha** passes directly into your ControlNet pipelines.

## **✨ Key Features**

* **Interactive 3D Viewport:** Fully resizable, click-to-select raycasting, orbit controls, and real-time playback scrubbing.  
* **Multi-Pass Rendering:** Generates 6 distinct batches in one go:  
  * **🔴 Pose:** Unlit flat colors for OpenPose.  
  * **⚫ Depth:** High-quality depth maps with **Manual Near/Far** controls.  
  * **⚪ Canny:** Procedural Rim-Light (Matcap) for perfect edge detection.  
  * **🔵 Normal:** Standard RGB normal maps for geometry detail.  
  * **🟠 Shaded:** Clay-style renders for spatial and lighting reference.  
  * **🏁 Alpha:** Pure black and white character/prop matte masks for compositing.  
* **Format Support:** Supports standard .fbx and .glb animation and environment files.  
* **Smart Retargeting:** Auto-detects and normalizes bone names (Mixamo & HY-MOTION compatible).  
* **Workflow Serialization:** Your entire 3D scene setup (positions, loops, cameras) is saved directly inside your ComfyUI workflow.

## **🚀 What's New in V9.20 (The Environment & Pipeline Update)**

This major update transforms Action Director from a character-posing tool into a full 3D scene compositor, bridging the gap between ComfyUI and professional DCCs like Maya and Blender.

### **🌍 Environments & Baked Physics**

* **Environment Imports:** Load full .fbx and .glb scene meshes (buildings, streets, static props) from the new input/yedp\_envs folder. Environments properly cast and receive shadows.  
* **Animated Environments:** Standard object animations (like a moving car, sliding doors, or rotating fans keyframed in Maya/Blender) are fully supported. Simply check the "Loop (Anim)" box\!  
* **Alembic-Style Physics (Blend Shapes):** The engine natively reads GLTF Morph Targets and Shape Key animations\! Run cloth, soft-body, or wind simulations in Maya/Blender, bake them to Shape Keys, and import them directly into the environment tab for real-time physics\!  
* **FBX Opacity Auto-Fix:** Automatically patches a common Maya/Blender export bug where FBX materials import completely invisible.

### **🎥 Advanced Camera Pipeline**

* **Animated Camera Imports:** You can now import .fbx and .glb animated camera tracks directly from your 3D software\!  
* **Camera Override System:** Check "Override" to lock the viewport and perfectly trace your imported camera path in real-time.  
* **Maya / 3D Coordinate Fixer:** Built-in "FBX Import Fix" panel allows you to adjust local Rotation Pivot (Rx, Ry, Rz) and Distance Scale directly on the camera. Easily fixes the classic "Z-Up to Y-Up" axis swap and Centimeter-to-Meter scale issues.  
* **Ghost Camera Visualizer:** A cyan wireframe proxy camera appears in the scene so you can visually align and scale your Maya camera before engaging the override.  
* **Dedicated Camera Folder:** Camera animations are cleanly isolated in their own input/yedp\_cams folder.

### **✨ Massive UX & UI Overhaul**

* **Dynamic Folder Refresh:** Click the live refresh button after dropping new .fbx or .glb files into your input folders to load them instantly, without reloading the web page\!  
* **"Click-to-Select" Raycasting:** Click on any Character, Environment, or Light directly in the 3D viewport or anywhere on its UI card to instantly attach the Transform Gizmo.  
* **"Panic" Reset Button:** If you ever get lost in 3D space or stuck inside a bad imported camera, click RESET to instantly teleport your view back to the safe default origin.  
* **Live Scrubbing Engine:** Scrubbing the timeline now updates all bones, physics, and camera matrices flawlessly frame-by-frame, even while paused.

## **📥 Installation**

1. **Clone the repository** into your ComfyUI custom nodes directory:  
   cd ComfyUI/custom\_nodes/  
   git clone https://github.com/YourUsername/ComfyUI-Yedp-Action-Director.git  
2. **Install Dependencies:** No external Python dependencies are required beyond standard ComfyUI requirements. The frontend libraries (Three.js) are loaded dynamically.  
3. **Add Animations & Assets:** Create the following folders inside your ComfyUI input directory and place your .fbx or .glb files accordingly:  
   * **Characters:** ComfyUI/input/yedp\_anims/  
   * **Environments/Physics:** ComfyUI/input/yedp\_envs/  
   * **Cameras:** ComfyUI/input/yedp\_cams/  
4. **Restart ComfyUI.**

## **🛠️ Usage**

### **1\. Getting Started**

* **Add the Node:** Right-click \> Yedp \> MoCap \> Yedp Action Director.  
* **Adjust Settings:** Set your Output width & height, total frame\_count, and fps.  
* **Viewport Toggles:** Use the top checkboxes to preview your scene in Shaded, Depth, or Skel (Skeleton) modes. Adjust the Depth Near/Far inputs to maximize contrast.

### **2\. Scene Assembly (Characters & Environments)**

* Click **\+ Add Char** or **\+ Add Env** to spawn elements into the scene.  
* **Selection:** Click directly on the object in the 3D viewport, or click its card in the sidebar.  
* **Transform:** Use the floating Gizmo icons (or hotkeys G, R, S) to Move, Rotate, and Scale your objects. Click the X icon or click empty space to deselect.  
* **Animation:** Assign an animation from the dropdown. Toggle the **Loop** checkbox for continuous playback.

### **3\. The M/F (Gender) Toggle**

Next to the Character Loop checkbox is a toggle button indicating **M** (Male) or **F** (Female). Clicking this instantly swaps the underlying depth mesh of the character, allowing you to direct scenes with mixed genders using the exact same skeletal animation\!

### **4\. Camera Direction**

You have two ways to animate your camera:

* **Internal Keyframing:** Move your viewport camera to a start position and click **Set Start**. Move to an end position and click **Set End**. Choose your interpolation (e.g., easeOut). The camera will smoothly animate between the two points\!  
* **Maya/Blender Override:** Import an FBX camera from the yedp\_cams folder. Adjust the scale/rotation fixes if your 3D software uses different axes, verify it with the cyan ghost proxy, and then check **Override** to lock your viewport to the imported track.

### **5\. Baking**

Click the **BAKE V9.20** button in the viewport header (or BAKE FRAME for a single test frame). The engine will rapidly generate 6 separate visual passes, temporarily cache them to avoid browser crashes, and output them as image batches directly into your ComfyUI workflow.

## **🛠️ Custom Rigging & Prop Setup (For Advanced Users)**

If you want to modify Yedp_Rig.glb in Blender to add your own meshes or props, the parser relies on a specific (but forgiving) naming convention in your node hierarchy:

1. **OpenPose Skeleton:** Any mesh containing pose or openpose in its hierarchy.  
2. **Female Depth Mesh:** Any mesh containing depth\_f, depthf, female, or woman in its hierarchy.  
3. **Male Depth Mesh:** Any mesh containing depth, male, or man in its hierarchy.  
4. **Props (Swords, Hats, etc.):** Any mesh attached to the rig that *does not* match the above words will automatically be treated as a prop\! The engine will smartly render it for **both** Male and Female depth/normal passes.

## **🖼️ Outputs Explained**

| Output | Description | Best Used For |
| :---- | :---- | :---- |
| **POSE\_BATCH** | Flat, unlit colors representing body parts. | **ControlNet OpenPose** (or custom color-based control). |
| **DEPTH\_BATCH** | Grayscale distance map (White=Near, Black=Far). | **ControlNet Depth**. Excellent for preserving volumetric shape. |
| **CANNY\_BATCH** | Black mesh with white illuminated edges (Rim Light). | **ControlNet Canny/Lineart**. Captures silhouette and internal details. |
| **NORMAL\_BATCH** | RGB Normal map relative to the camera. | **ControlNet NormalMap**. Great for surface detail and lighting. |
| **SHADED\_BATCH** | Standard 3D clay render with active lighting. | General scene preview or image-to-image styling references. |
| **ALPHA\_BATCH** | Pure white characters/props on black background. | **Masking/Compositing**. Easily separate subjects from environments. |


## **🐛 Troubleshooting**

* **"Animation not playing":** \* The node has been built to play animations from Mixamo. The rig needs to follow a similar prefix structure and a few known synonyms such as "Pelvis" for "Hips". Support for HY-MOTION rig naming conventions is also included.  
* **"Viewport is invisible on load":** \* *Solution:* Depending on your browser zoom, the viewport might initialize at size 0\. Simply **resize the node slightly** by dragging the bottom-right corner, and the viewport will snap into place.  
* **"Animation/Environment not found":** \* Ensure your files are in the correct input/ subfolders. Click your custom **Refresh** button in the ComfyUI menu if you just added them\!  
* **"Slow downs":** \* The node has been optimized for the Chrome browser; potential issues or memory caps might occur on other browsers.

## **📜 License**

This project is open-source and available under the **MIT License**.

## **❤️ Credits**

created by Yedp. Special thanks to mizumori-bit (https://github.com/mizumori-bit/) for his contribution on Orthographic/Views/Lighting implementation

# **🎬 ComfyUI Yedp Action Director**


https://github.com/user-attachments/assets/87328a44-5249-42f3-8b54-de18e7545398

https://github.com/user-attachments/assets/9e7d56c9-e2cd-4ff6-a505-93e4eabae959



**A powerful 3D viewport node for ComfyUI to direct, preview, and batch-render 3D character animations, environments, and custom cameras for ControlNet workflows.**


## **🌟 Overview**

**Yedp Action Director** is a custom node for ComfyUI that integrates a fully interactive 3D viewport directly into your workflow. It allows you to dynamically load up to 16 characters, assign sequenced MoCap animations, capture facial expressions via webcam/video, import 3D environments, animate custom cameras, and bake pixel-perfect **OpenPose, Depth, Canny, Normal, Shaded, and Alpha** passes directly into your ControlNet pipelines.

## **✨ Key Features**

* **Interactive 3D Viewport:** Fully resizable, click-to-select raycasting, orbit controls, and real-time playback scrubbing.  
* **Multi-Pass Rendering:** Generates 6 distinct batches in one go:  
  * **🔴 Pose:** Unlit flat colors for OpenPose (includes facial landmarks).  
  * **⚫ Depth:** High-quality depth maps with **Manual Near/Far** controls.  
  * **⚪ Canny:** Procedural Rim-Light (Matcap) for perfect edge detection.  
  * **🔵 Normal:** Standard RGB normal maps for geometry detail.  
  * **🟠 Shaded:** Clay-style renders for spatial and lighting reference.  
  * **🏁 Alpha:** Pure black and white character/prop matte masks for compositing.  
* **Format Support:** Supports standard .fbx, .bvh, and .glb animation/environment files.  
* **Workflow Serialization:** Your entire 3D scene setup (positions, sequences, cameras, mocaps) is saved directly inside your ComfyUI workflow.

## **🚀 What's New in V9.28 (Face Mocap & Sequencer Update)**

### **🎭 Facial Motion Capture (MediaPipe)**

* **Local Web/Video Mocap:** Drive your character's face directly inside the viewport using your Webcam or an uploaded Video file.  
* **Offline Video Processing:** Video files are processed sequentially frame-by-frame for zero dropped frames and perfect 30 FPS synchronization.  
* **Smart Auto-Scaling:** The engine mathematically calculates the ear-to-ear distance of your 3D rig and proportionally scales your facial performance to fit perfectly, stored as an un-rotated local additive delta.  
* **Disk Saving:** Captures are automatically saved as JSON files to your yedp\_mocap folder for reuse across workflows.

### **🎞️ Multi-Clip Animation Sequencer**

* **Animation Sequencing:** Characters are no longer limited to a single animation clip\! You can now queue up an infinite sequence of .fbx or .bvh files.  
* **Auto-Crossfading:** The engine automatically calculates 0.5s overlapping weight blends between your clips for smooth transitions.  
* **Circular Time-Wrapping:** When a character is set to "Loop", the final sequence clip mathematically blends flawlessly back into the first.

### **✨ Massive UX & UI Overhaul**

* **Dynamic Folder Refresh:** Click the live refresh button after dropping new .fbx or .glb files into your input folders to load them instantly, without reloading the web page\!  
* **"Click-to-Select" Raycasting:** Click on any Character, Environment, or Light directly in the 3D viewport or anywhere on its UI card to instantly attach the Transform Gizmo.  
* **"Panic" Reset Button:** If you ever get lost in 3D space or stuck inside a bad imported camera, click RESET to instantly teleport your view back to the safe default origin.  
* **Live Scrubbing Engine:** Scrubbing the timeline now updates all bones, physics, and camera matrices flawlessly frame-by-frame, even while paused.

## **📥 Installation**

1. **Clone the repository** into your ComfyUI custom nodes directory:  
   cd ComfyUI/custom\_nodes/  
   git clone https://github.com/YourUsername/ComfyUI-Yedp-Action-Director.git  
2. **Install Dependencies:** No external Python dependencies are required beyond standard ComfyUI requirements. The frontend libraries (Three.js and MediaPipe) are loaded dynamically.  
3. **Add Animations & Assets:** Create the following folders inside your ComfyUI input directory and place your files accordingly:  
   * **Characters:** ComfyUI/input/yedp\_anims/  
   * **Environments:** ComfyUI/input/yedp\_envs/  
   * **Cameras:** ComfyUI/input/yedp\_cams/  
   * **Mocap Data:** ComfyUI/input/yedp\_mocap/ *(Auto-created upon first save)*  
4. **Restart ComfyUI.**

## **🛠️ Usage**

### **1\. Getting Started**

* **Add the Node:** Right-click \> Yedp \> MoCap \> Yedp Action Director.  
* **Adjust Settings:** Set your Output width & height, total frame\_count, and fps.  
* **Viewport Toggles:** Use the top checkboxes to preview your scene in Shaded, Depth, or Skel (Skeleton) modes. Adjust the Depth Near/Far inputs to maximize contrast.

### **2\. Scene Assembly & Animation Sequencing**

* Click **\+ Add Char** or **\+ Add Env** to spawn elements into the scene. Click directly on objects to select them.  
* Use the floating Gizmo icons (or hotkeys G, R, S) to Move, Rotate, and Scale.  
* **Sequencer:** Under the Character card, click **\+ Add Sequence Anim** to add a slot. Select an animation from the dropdown. Add as many as you need—the engine will automatically crossfade between them\!  
* **The M/F (Gender) Toggle:** Instantly swap the underlying depth mesh of the character between Male (M) and Female (F) using the exact same skeletal animation\!

### **3\. The M/F (Gender) Toggle**

Next to the Character Loop checkbox is a toggle button indicating **M** (Male) or **F** (Female). Clicking this instantly swaps the underlying depth mesh of the character, allowing you to direct scenes with mixed genders using the exact same skeletal animation\!

### **3\. Facial Motion Capture (Mocap)**

1. Open the **Motion Capture** sidebar tab.  
2. Select **Webcam** or **Video File**.  
3. Click **📷 Start** (or 📂 Load for video).  
4. Once tracking begins (you will see the green dots), click **🔴 Rec** to begin recording.  
5. Click **⏹ Stop** (or let the video finish). The performance is automatically saved\!  
6. Click **\+ Add Face Bind**, assign it to your Character, and select your newly recorded Mocap from the dropdown to apply it. Use the "Amp" slider to exaggerate or dampen the expressions.

### **4\. Camera Direction**

You have two ways to animate your camera:

* **Internal Keyframing:** Move your viewport camera to a start position and click **Set Start**. Move to an end position and click **Set End**. Choose your interpolation (e.g., easeOut). The camera will smoothly animate between the two points\!  
* **Maya/Blender Override:** Import an FBX camera from the yedp\_cams folder. Adjust the scale/rotation fixes if your 3D software uses different axes, verify it with the cyan ghost proxy, and then check **Override** to lock your viewport to the imported track.

### **5\. Baking**

Click the **BAKE V9.28** button in the viewport header (or BAKE FRAME for a single test frame). The engine will rapidly generate 6 separate visual passes, temporarily cache them to avoid browser crashes, and output them as image batches directly into your ComfyUI workflow.

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

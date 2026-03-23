# **🎬 ComfyUI Yedp Action Director**


https://github.com/user-attachments/assets/87328a44-5249-42f3-8b54-de18e7545398

https://github.com/user-attachments/assets/9e7d56c9-e2cd-4ff6-a505-93e4eabae959


**A powerful 3D viewport node for ComfyUI to direct, preview, and batch-render 3D character animations, environments, and custom cameras for ControlNet workflows.**

## **🌟 Overview**

**Yedp Action Director** is a custom node for ComfyUI that integrates a fully interactive 3D viewport directly into your workflow. It allows you to dynamically load up to 16 characters, assign sequenced MoCap animations, capture facial expressions via webcam/video, import 3D environments, animate custom cameras, and bake pixel-perfect **OpenPose, Depth, Canny, Normal, Shaded, Alpha, and Textured** passes directly into your ControlNet pipelines.

### **🦴 The Mixamo-Compatible Core**
**At its core, this engine is built around a Mixamo-compatible rig.** While the universal bone mapper attempts to normalize various hierarchies (like Character Creator or custom rigs) into a unified OpenPose standard, for the best plug-and-play experience, your custom characters and animations should utilize standard Mixamo skeletal naming conventions (or recognized synonyms). 

## **✨ Key Features**

* **Interactive 3D Viewport:** Fully resizable, click-to-select raycasting, orbit controls, and real-time playback scrubbing. 
* **Dynamic Folder Sync:** Click the `↻ SYNC FOLDERS` button to instantly hot-reload newly dropped `.fbx`, `.glb`, or `.bvh` files into your dropdowns without refreshing the browser page.
* **Native ComfyUI Serialization:** Your entire 3D scene state (Cameras, Keyframes, Characters, Environments, Lights, and Mocap bindings) is automatically saved directly inside your standard ComfyUI `.json` workflow file.
* **Multi-Pass Rendering:** Generates 7 distinct batches in one go:  
  * **🔴 Pose:** Unlit flat colors for OpenPose (includes facial landmarks).  
  * **⚫ Depth:** High-quality depth maps with **Manual Near/Far** controls.  
  * **⚪ Canny:** Procedural Rim-Light (Matcap) for perfect edge detection.  
  * **🔵 Normal:** Standard RGB normal maps for geometry detail.  
  * **🟠 Shaded:** Clay-style renders for spatial and lighting reference.  
  * **🏁 Alpha:** Pure black and white character/prop matte masks for compositing.  
  * **🎨 Textured:** Full RGB render utilizing original material base colors and textures.
* **Feeling lost? Click the "help" Icon in the Gizmo's tab!**

<img width="105" height="94" alt="image" src="https://github.com/user-attachments/assets/de1eec41-84ea-4c8f-94b3-74e25b3d0ac0" />

## **🚀 What's New in V9.28 (Face Mocap & Sequencer Update)**

### **🎭 Facial Motion Capture (MediaPipe)**
* **Local Web/Video Mocap:** Drive your character's face directly inside the viewport using your Webcam or an uploaded Video file.  
* **Offline Video Processing:** Video files are processed sequentially frame-by-frame for zero dropped frames and perfect 30 FPS synchronization.  
* **Smart Auto-Scaling & Local Space:** The engine mathematically calculates the ear-to-ear distance of your 3D rig and proportionally scales your facial performance to fit perfectly. Matrix Un-Rotation ensures expressions are stored in pure local space, completely decoupled from head rotation.
* **Disk Saving:** Captures are automatically saved as JSON files to your `yedp_mocap` folder for reuse across workflows.

### **🎞️ Multi-Clip Animation Sequencer**
* **Animation Sequencing:** Characters are no longer limited to a single animation clip! You can now queue up an infinite sequence of `.fbx` or `.bvh` files.  
* **Auto-Crossfading:** The engine automatically calculates overlapping weight blends between your clips for smooth, popping-free transitions.  
* **Circular Time-Wrapping:** When a character is set to "Loop", the final sequence clip mathematically blends flawlessly back into the first.
* **Continuous Root Motion Tracking:** Toggle "Root M." to automatically strip loop-snapping and integrate spatial movement indefinitely, allowing characters to walk forward forever.

### **🌍 Environment & Engine Upgrades**
* **PLY Support:** Added `PLYLoader` support for Gaussian Splats and Point Clouds, rendering with native vertex colors.
* **Isotropic Pixel Space:** Switched coordinate extraction to Isotropic Pixel Space to completely eliminate mesh-mangling bugs on non-16:9 video aspect ratios.

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

### **2. Scene Assembly & Animation Sequencing**
* Click **+ Add Char** or **+ Add Env** to spawn elements into the scene. Click directly on objects in the viewport to select them.  
* Use the floating Gizmo icons (or hotkeys G, R, S) to Move, Rotate, and Scale.  
* **Sequencer:** Under the Character card, click **+ Add Sequence Anim** to add a slot. Select an animation from the dropdown. Add as many as you need—the engine will automatically crossfade between them!

### **3. The M/F (Gender) Toggle**
Next to the Character Loop checkbox is a toggle button indicating **M** (Male) or **F** (Female). Clicking this instantly swaps the underlying depth mesh of the character, allowing you to direct scenes with mixed genders using the exact same skeletal animation!

### **4. Facial Motion Capture (Mocap)**
1. Open the **Motion Capture** sidebar tab.  
2. Select **Webcam** or **Video File**.  
3. Click **📷 Start** (or 📂 Load for video).  
4. Once tracking begins (you will see the green dots), click **🔴 Rec** to begin recording.  
5. Click **⏹ Stop** (or let the video finish). The performance is automatically saved!  
6. Click **+ Add Face Bind**, assign it to your Character, and select your newly recorded Mocap from the dropdown to apply it. Use the "Amp" slider to exaggerate or dampen the expressions.

### **5. Camera Direction**
You have two ways to animate your camera:
* **Internal Keyframing:** Move your viewport camera to a start position and click **Set Start**. Move to an end position and click **Set End**. Choose your interpolation (e.g., easeOut). The camera will smoothly animate between the two points!
* **Maya/Blender Override:** Import an FBX camera from the `yedp_cams` folder. Adjust the scale/rotation fixes if your 3D software uses different axes, verify it with the cyan ghost proxy, and then check **Override** to lock your viewport to the imported track.

### **6. Baking**
Click the **BAKE V9.28** button in the viewport header (or BAKE FRAME for a single test frame). The engine will rapidly generate 7 separate visual passes, temporarily cache them to avoid browser crashes, and output them as image batches directly into your ComfyUI workflow.

## **🛠️ Custom Rigging & Prop Setup (For Advanced Users)**
The parser relies on a specific (but forgiving) naming convention in your node hierarchy. Remember that **Mixamo compatibility** is heavily recommended for best results:
1. **OpenPose Skeleton:** Any mesh containing `pose` or `openpose` in its hierarchy.  
2. **Female Depth Mesh:** Any mesh containing `depth_f`, `depthf`, `female`, or `woman` in its hierarchy.  
3. **Male Depth Mesh:** Any mesh containing `depth`, `male`, or `man` in its hierarchy.  
4. **Props (Swords, Hats, etc.):** Any mesh attached to the rig that *does not* match the above words will automatically be treated as a prop! The engine will smartly render it for **both** Male and Female depth/normal passes.

| Output | Description | Best Used For |
| :--- | :--- | :--- |
| **POSE_BATCH** | Flat, unlit colors representing body parts. | **ControlNet OpenPose** (or custom color-based control). |
| **DEPTH_BATCH** | Grayscale distance map (White=Near, Black=Far). | **ControlNet Depth**. Excellent for preserving volumetric shape. |
| **CANNY_BATCH** | Black mesh with white illuminated edges (Rim Light). | **ControlNet Canny/Lineart**. Captures silhouette and internal details. |
| **NORMAL_BATCH** | RGB Normal map relative to the camera. | **ControlNet NormalMap**. Great for surface detail and lighting. |
| **SHADED_BATCH** | Standard 3D clay render with active lighting. | General scene preview or image-to-image styling references. |
| **ALPHA_BATCH** | Pure white characters/props on black background. | **Masking/Compositing**. Easily separate subjects from environments. |
| **TEXTURED_BATCH** | Full RGB render with original materials and vertex colors. | Final visualization or heavily stylized image-to-image base inputs. |

## **🐛 Troubleshooting**
* **"Animation not playing":** The node has been built to play animations from Mixamo. The rig needs to follow a similar prefix structure and a few known synonyms such as "Pelvis" for "Hips". Support for HY-MOTION rig naming conventions is also included.  
* **"Viewport is invisible on load":** *Solution:* Depending on your browser zoom, the viewport might initialize at size 0. Simply **resize the node slightly** by dragging the bottom-right corner, and the viewport will snap into place.  
* **"Animation/Environment not found":** Ensure your files are in the correct `input/` subfolders. Click your custom **↻ SYNC FOLDERS** button in the ComfyUI menu if you just added them!
* **"imported .ply doesn't show":** .ply files are imported as Gaussion Splat by default, if your .ply file are points cloud, make sure to press the **↻ SYNC FOLDERS** button to make the settings appear and uncheck "Render as Gaussian Splat" (currently doesn't show dynamically, hopefully will be fixed in the future!)
 <img width="285" height="144" alt="image" src="https://github.com/user-attachments/assets/53625815-4664-4248-b4f2-7afb2638eb3d" />


## **📜 License**

This project is open-source and available under the **MIT License**.

## **❤️ Credits**

created by Yedp. Special thanks to mizumori-bit (https://github.com/mizumori-bit/) for his contribution on Orthographic/Views/Lighting implementation.

Yedp-Action-Director is built upon the incredible work of the open-source community.

-------------------

**🛠️ Core Engine & Libraries**
Three.js: The backbone of the 3D viewport, including essential modules like GLTFLoader, FBXLoader, BVHLoader, and SkeletonUtils.

MediaPipe (Google): Powers the high-performance, local facial motion capture and landmark detection.

GaussianSplats3D (mkkellogg): For the optimized implementation and rendering of 3D Gaussian Splatting within the Three.js environment.

fflate: Used for high-speed, memory-efficient decompression of 3D asset files.

-------------------

**📜 Format & Asset Support**
PLY Loader: For supporting the import and visualization of PLY point cloud data.

Mixamo & HY-MOTION: For providing the skeletal naming conventions that our auto-retargeting system follows.

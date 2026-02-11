import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

/** * YEDP ACTION DIRECTOR - V8.4 (Merged Fix)
 * - Fix: Robust Mesh Detection (Checks Parents for 'Geo_OpenPose'/'Geo_Depth') - FROM BACKUP.
 * - Fix: Unlit Material Swap using Map for robust restoration - FROM BACKUP.
 * - Logic: Core script is original Action Director, Batch/Load logic is from Backup.
 */

// --- DYNAMIC LOADER ---
const loadThreeJS = async () => {
    if (window._YEDP_THREE_CACHE) return window._YEDP_THREE_CACHE;

    return window._YEDP_THREE_CACHE = new Promise(async (resolve, reject) => {
        const baseUrl = new URL(".", import.meta.url).href;
        const loadModule = async (name, localPath, cdnPath) => {
            try {
                return await import(cdnPath);
            } catch (e) {
                console.warn(`[Yedp] CDN ${name} failed. Trying local...`);
                return await import(localPath);
            }
        };

        try {
            console.log("[Yedp] Initializing Engine (V8.4)...");
            const THREE = await import("https://esm.sh/three@0.160.0");
            const { OrbitControls } = await import("https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js?deps=three@0.160.0");
            const { GLTFLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js?deps=three@0.160.0");
            await import("https://esm.sh/fflate@0.8.0"); 
            const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js?deps=three@0.160.0");

            resolve({ THREE, OrbitControls, GLTFLoader, FBXLoader });
        } catch (e) {
            console.error("[Yedp] Critical Engine Load Failure:", e);
            reject(e);
        }
    });
};

const semanticNormalize = (name) => {
    if (!name) return "";
    return name.split(/[/:_|]/).pop().replace(/mixamorig\d*/i, "").replace(/mixamo/i, "").replace(/\s+/g, "").toLowerCase();
};

class YedpViewport {
    constructor(node, container) {
        this.node = node;
        this.container = container;
        this.baseUrl = new URL(".", import.meta.url).href;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mixer = null;
        this.clock = null;
        this.character = null;
        this.skeletonHelper = null;
        
        // Store helpers to toggle visibility during bake
        this.gridHelper = null;
        this.axesHelper = null;

        this.semanticMap = new Map(); 
        
        // --- MODIFIED: Switched to Arrays to match Backup Logic ---
        this.poseMeshes = [];
        this.depthMeshes = [];

        this.isPlaying = false;
        this.isBaking = false; 
        this.duration = 0;
        this.sourceTotalFrames = 0; 
        
        this.renderWidth = 512;
        this.renderHeight = 512;
        
        this.init();
    }

    async init() {
        try {
            const libs = await loadThreeJS();
            this.THREE = libs.THREE;
            this.OrbitControls = libs.OrbitControls;
            this.GLTFLoaderClass = libs.GLTFLoader;
            this.FBXLoader = libs.FBXLoader; 

            // --- LAYOUT ---
            this.container.innerHTML = "";
            this.container.style.boxSizing = "border-box";
            Object.assign(this.container.style, {
                display: "flex", flexDirection: "column", background: "#111",
                width: "100%", height: "100%", overflow: "hidden",
                border: "1px solid #333", borderRadius: "4px"
            });

            const headerDiv = document.createElement("div");
            Object.assign(headerDiv.style, {
                height: "36px", flex: "0 0 36px", background: "#222", borderBottom: "1px solid #333",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 8px", boxSizing: "border-box"
            });
            this.container.appendChild(headerDiv);

            const viewportDiv = document.createElement("div");
            viewportDiv.className = "yedp-vp-area";
            Object.assign(viewportDiv.style, {
                flex: "1 1 0", position: "relative", overflow: "hidden",
                background: "#000", width: "100%", boxSizing: "border-box"
            });
            this.container.appendChild(viewportDiv);

            const timelineDiv = document.createElement("div");
            Object.assign(timelineDiv.style, {
                height: "30px", flex: "0 0 30px", background: "#1a1a1a", borderTop: "1px solid #333",
                display: "flex", alignItems: "center", padding: "0 8px", gap: "8px", boxSizing: "border-box"
            });
            this.container.appendChild(timelineDiv);

            // --- 3D ENGINE ---
            this.clock = new this.THREE.Clock();
            this.scene = new this.THREE.Scene();
            this.scene.background = new this.THREE.Color(0x1a1a1a); 
            
            const ambient = new this.THREE.AmbientLight(0xffffff, 1.2);
            this.scene.add(ambient);
            const dirLight = new this.THREE.DirectionalLight(0x00d2ff, 1.5);
            dirLight.position.set(5, 10, 7);
            this.scene.add(dirLight);

            // SAVE REFERENCES TO HELPERS TO HIDE THEM LATER
            this.gridHelper = new this.THREE.GridHelper(10, 10, 0x444444, 0x222222);
            this.scene.add(this.gridHelper);
            
            this.axesHelper = new this.THREE.AxesHelper(1);
            this.scene.add(this.axesHelper);

            this.camera = new this.THREE.PerspectiveCamera(45, 1, 0.01, 2000); 
            this.camera.position.set(2, 2, 5);
            
            this.renderer = new this.THREE.WebGLRenderer({ 
                antialias: true, 
                alpha: false, 
                preserveDrawingBuffer: true 
            });
            
            if (this.renderer.outputColorSpace) this.renderer.outputColorSpace = this.THREE.SRGBColorSpace;
            else this.renderer.outputEncoding = this.THREE.sRGBEncoding;
            
            viewportDiv.appendChild(this.renderer.domElement);
            Object.assign(this.renderer.domElement.style, { width: "100%", height: "100%", display: "block" });

            this.gate = document.createElement("div");
            this.gate.className = "yedp-resolution-gate"; 
            Object.assign(this.gate.style, {
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                border: "2px solid #00d2ff", boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)",
                pointerEvents: "none", zIndex: "10", boxSizing: "content-box"
            });
            viewportDiv.appendChild(this.gate);

            this.controls = new this.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.set(0, 1, 0);
            this.controls.enableDamping = true;

            this.setupHeader(headerDiv);
            this.setupTimeline(timelineDiv);
            await this.loadCharacter();
            this.hookNodeWidgets();
            this.scanAnimations();

            const resizeObserver = new ResizeObserver(() => this.onResize(viewportDiv));
            resizeObserver.observe(viewportDiv);

            this.animate();

        } catch (e) {
            this.container.innerHTML = `<div style="color:red; padding:20px;">Init Error: ${e.message}</div>`;
        }
    }

    setupHeader(div) {
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span id="lbl-res" style="color:#00d2ff; font-family:monospace; font-size:11px;">512x512</span>
                <label style="color:#ccc; font-size:11px; cursor:pointer;"><input type="checkbox" id="chk-depth"> View Depth</label>
                <label style="color:#666; font-size:11px; cursor:pointer;"><input type="checkbox" id="chk-skel" checked> Skeleton</label>
            </div>
            <div style="display:flex; gap:4px;">
                <button id="btn-bake" class="yedp-btn" style="border:1px solid #ff0055; color:#ff0055; background:transparent; padding:2px 8px; cursor:pointer;">BAKE V8.4</button>
            </div>
        `;
        // MODIFIED: Update visibility for Arrays instead of single objects
        div.querySelector("#chk-depth").onchange = (e) => {
            const isDepth = e.target.checked;
            this.depthMeshes.forEach(m => m.visible = isDepth);
            this.poseMeshes.forEach(m => m.visible = !isDepth);
        };
        div.querySelector("#chk-skel").onchange = (e) => {
            if(this.skeletonHelper) this.skeletonHelper.visible = e.target.checked;
        };
        div.querySelector("#btn-bake").onclick = () => this.performBatchRender();
    }

    setupTimeline(div) {
        div.innerHTML = `
            <div style="display:flex; width:100%; align-items:center; gap:5px;">
                <button id="btn-play" style="background:none;border:none;color:#fff;cursor:pointer;width:20px;">▶</button>
                <input type="range" id="t-slider" min="0" max="100" value="0" step="1" style="flex:1;cursor:pointer;">
                <span id="t-time" style="font-family:monospace;font-size:10px;color:#888;min-width:100px;text-align:right;">0 / 0</span>
            </div>`;
        
        const btn = div.querySelector("#btn-play");
        const slider = div.querySelector("#t-slider");
        const lbl = div.querySelector("#t-time");
        
        btn.onclick = () => { this.isPlaying = !this.isPlaying; btn.innerText = this.isPlaying ? "⏸" : "▶"; };
        slider.onmousedown = () => { this.isDraggingSlider = true; this.isPlaying = false; btn.innerText = "▶"; };
        slider.onmouseup = () => { this.isDraggingSlider = false; };
        
        slider.oninput = (e) => {
            const frame = parseInt(e.target.value);
            const fps = this.getWidgetValue("fps", 24);
            const t = frame / fps;
            
            if(this.mixer && this.mixer._actions[0]) {
                this.mixer._actions[0].time = t;
                this.mixer.update(0);
            }
            lbl.innerText = `${frame} / ${this.sourceTotalFrames}`;
        };
    }

    hookNodeWidgets() {
        const wWidget = this.node.widgets?.find(w => w.name === "width");
        const hWidget = this.node.widgets?.find(w => w.name === "height");
        if(wWidget) this.renderWidth = wWidget.value;
        if(hWidget) this.renderHeight = hWidget.value;
        this.updateResLabel();

        const hookRes = (w) => {
            if(!w) return;
            const orig = w.callback;
            w.callback = (v) => { 
                if(w.name==="width") this.renderWidth = v; else this.renderHeight = v;
                this.updateResLabel();
                this.onResize(this.container.querySelector(".yedp-vp-area"));
                if(orig) orig(v);
            }
        };
        hookRes(wWidget); hookRes(hWidget);

        const animWidget = this.node.widgets?.find(w => w.name === "animation");
        if(animWidget) {
            api.fetchApi("/yedp/get_animations").then(async res => {
                const data = await res.json();
                if(data.files && data.files.length > 0) {
                    animWidget.options.values = data.files;
                    if(!animWidget.value) animWidget.value = data.files[0];
                }
            });

            if(animWidget.value) this.loadAnimation(animWidget.value);
            const origAnimCb = animWidget.callback;
            animWidget.callback = (v) => {
                this.loadAnimation(v);
                if(origAnimCb) origAnimCb(v);
            };
        }
    }

    updateResLabel() {
        const lbl = this.container.querySelector("#lbl-res");
        if(lbl) lbl.innerText = `${this.renderWidth}x${this.renderHeight}`;
    }

    onResize(vpDiv) {
        if (this.isBaking) return;
        if (!this.renderer || !vpDiv || !this.camera) return;
        const w = vpDiv.clientWidth;
        const h = vpDiv.clientHeight;
        if (w && h) {
            this.renderer.setSize(w, h);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            
            const aspectContainer = w / h;
            const aspectTarget = this.renderWidth / this.renderHeight;
            let gw, gh;
            if (aspectContainer > aspectTarget) { 
                gh = h - 20; 
                gw = gh * aspectTarget; 
            } else { 
                gw = w - 20; 
                gh = gw / aspectTarget; 
            }
            
            if(this.gate) { this.gate.style.width = `${gw}px`; this.gate.style.height = `${gh}px`; }
        }
    }

    async loadCharacter() {
        const loader = new this.GLTFLoaderClass();
        const rigUrl = new URL("../Yedp_Rig.glb", this.baseUrl).href;
        try {
            console.log("[Yedp] Loading Rig from:", rigUrl);
            const gltf = await loader.loadAsync(rigUrl);
            this.character = gltf.scene;
            this.scene.add(this.character);
            
            // Clear Arrays
            this.poseMeshes = [];
            this.depthMeshes = [];
            this.semanticMap.clear();

            // --- MODIFIED: Ancestry Check from Backup (Fixes Name Targeting) ---
            const belongsTo = (obj, namePart) => {
                let curr = obj;
                while(curr && curr !== this.scene) {
                    if(curr.name && curr.name.toLowerCase().includes(namePart)) return true;
                    curr = curr.parent;
                }
                return false;
            };

            this.character.traverse((child) => {
                if(child.isBone || child.type === "Bone" || child.isObject3D) {
                    const normalized = semanticNormalize(child.name);
                    if (normalized) this.semanticMap.set(normalized, child.name);
                }
                
                if(child.isMesh) {
                    child.visible = true; 
                    child.frustumCulled = false; 
                    
                    // --- MODIFIED: Uses belongsTo and pushes to Arrays ---
                    if(belongsTo(child, "geo_openpose")) { 
                        this.poseMeshes.push(child);
                    } else if(belongsTo(child, "geo_depth")) { 
                        this.depthMeshes.push(child);
                        child.visible = false; 
                    }
                }
            });

            const box = new this.THREE.Box3().setFromObject(this.character);
            const size = box.getSize(new this.THREE.Vector3());
            const center = box.getCenter(new this.THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = this.camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.5; 

            this.camera.position.set(center.x, center.y + (size.y * 0.2), center.z + cameraZ);
            this.controls.target.copy(center);
            this.controls.update();

            this.skeletonHelper = new this.THREE.SkeletonHelper(this.character);
            this.scene.add(this.skeletonHelper);

            this.mixer = new this.THREE.AnimationMixer(this.character);
            
        } catch (e) { console.error("[Yedp] Rig Load Fail:", e); }
    }

    async scanAnimations() {
        // Triggered in hookNodeWidgets via API
    }

    async loadAnimation(filename) {
        if(!this.mixer || !filename || filename === "Scanning...") return;
        const isFBX = filename.toLowerCase().endsWith(".fbx");
        const url = `/view?filename=${filename}&type=input&subfolder=yedp_anims`;
        
        try {
            let model;
            if(isFBX) {
                if(!this.FBXLoader) throw new Error("FBXLoader missing.");
                model = await new this.FBXLoader().loadAsync(url);
            } else {
                model = await new this.GLTFLoaderClass().loadAsync(url);
            }

            let clip = model.animations?.[0] || model.scene?.animations?.[0] || model.asset?.animations?.[0];
            if(clip) {
                const tracks = [];

                clip.tracks.forEach(t => {
                    const lastDot = t.name.lastIndexOf(".");
                    const prop = t.name.substring(lastDot + 1);
                    const fullBonePath = t.name.substring(0, lastDot);
                    const normalizedTrackBone = semanticNormalize(fullBonePath);
                    
                    if (prop === "scale") return; 

                    if(this.semanticMap.has(normalizedTrackBone)) {
                        const targetRealName = this.semanticMap.get(normalizedTrackBone);
                        if (prop === "position") {
                             const lowerName = targetRealName.toLowerCase();
                             if (!lowerName.includes("hips") && !lowerName.includes("root") && !lowerName.includes("pelvis")) return;
                             if (t.values.length >= 2) {
                                 const valY = Math.abs(t.values[1]);
                                 if (valY > 50) {
                                     for(let k=0; k<t.values.length; k++) t.values[k] *= 0.01;
                                 }
                             }
                        }
                        const tc = t.clone();
                        tc.name = `${targetRealName}.${prop}`;
                        tracks.push(tc);
                    }
                });

                const cleanClip = new this.THREE.AnimationClip(clip.name, clip.duration, tracks);
                this.mixer.stopAllAction();
                this.mixer.uncacheRoot(this.character);
                
                const action = this.mixer.clipAction(cleanClip);
                action.reset().setEffectiveWeight(1).play();
                this.mixer.update(0); 

                this.duration = cleanClip.duration;
                const fps = this.getWidgetValue("fps", 24);
                this.sourceTotalFrames = Math.floor(this.duration * fps);
                
                this.isPlaying = true;
                const btn = this.container.querySelector("#btn-play");
                if(btn) btn.innerText = "⏸";
            }
        } catch(e) { console.error(e); }
    }

    animate() {
        if (!this.renderer) return;
        requestAnimationFrame(() => this.animate());
        
        if (this.isBaking) return;

        const delta = this.clock.getDelta();
        if (this.mixer) {
            const frames = this.getWidgetValue("frame_count", 24);
            const fps = this.getWidgetValue("fps", 24);
            const duration = frames / fps; 

            if (this.isPlaying) {
                this.mixer.update(delta);
                if (this.mixer._actions[0] && this.mixer._actions[0].time >= duration) {
                     this.mixer._actions[0].time = 0;
                }
            }
            
            const slider = this.container.querySelector("#t-slider");
            const timeLabel = this.container.querySelector("#t-time");
            
            if(slider) {
                slider.max = frames;
                if(this.mixer._actions[0] && !this.isDraggingSlider) {
                    const t = this.mixer._actions[0].time;
                    const currentFrame = Math.floor(t * fps);
                    slider.value = currentFrame % (frames + 1);
                    timeLabel.innerText = `${currentFrame} / ${this.sourceTotalFrames}`;
                }
            }
        }
        
        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // --- MODIFIED: BATCH RENDER LOGIC FROM BACKUP SCRIPT ---
    async performBatchRender() {
        if (!this.mixer) { alert("No animation loaded!"); return; }
        const THREE = this.THREE;
        const btn = this.container.querySelector('#btn-bake');
        btn.innerText = "BAKING...";
        
        this.isBaking = true;
        this.isPlaying = false;

        // 1. Setup Camera for Output
        const originalSize = new THREE.Vector2();
        this.renderer.getSize(originalSize);
        const originalAspect = this.camera.aspect;
        const originalZoom = this.camera.zoom;
        const originalBg = this.scene.background;
        const originalNear = this.camera.near;
        const originalFar = this.camera.far;

        // Adjust camera to fill the render target completely
        const vpArea = this.container.querySelector(".yedp-vp-area");
        if (vpArea) {
            const vpW = vpArea.clientWidth;
            const vpH = vpArea.clientHeight;
            const vpAspect = vpW / vpH;
            const targetAspect = this.renderWidth / this.renderHeight;
            
            if (vpAspect < targetAspect) {
                const zoomFactor = targetAspect / vpAspect;
                this.camera.zoom = originalZoom * zoomFactor;
            } else {
                this.camera.zoom = originalZoom;
            }
        }

        this.renderer.setSize(this.renderWidth, this.renderHeight);
        this.camera.aspect = this.renderWidth / this.renderHeight;
        this.camera.updateProjectionMatrix();

        const frames = this.getWidgetValue("frame_count", 24);
        const fps = this.getWidgetValue("fps", 24);
        const step = (frames > 0) ? (frames / fps) / frames : 0.033;
        
        const results = { pose: [], depth: [], canny: [] };

        // 2. Prepare Render State (Hide Helpers)
        const visPose = this.poseMeshes.length > 0 && this.poseMeshes[0].visible;
        const visDepth = this.depthMeshes.length > 0 && this.depthMeshes[0].visible;
        const visSkel = this.skeletonHelper ? this.skeletonHelper.visible : false;
        
        const toggleHelpers = (vis) => {
            if(this.gridHelper) this.gridHelper.visible = vis;
            if(this.axesHelper) this.axesHelper.visible = vis;
            if(this.skeletonHelper) this.skeletonHelper.visible = vis;
        };
        toggleHelpers(false);

        // Helper: Strict Visibility Toggling (Corrects Issue 2 & 3 from Backup)
        const setVisibility = (mode) => {
            // mode: 'pose', 'depth', 'none'
            const showPose = mode === 'pose';
            const showDepth = mode === 'depth' || mode === 'canny';
            
            this.poseMeshes.forEach(m => m.visible = showPose);
            this.depthMeshes.forEach(m => m.visible = showDepth);
        };

        // --- MATERIALS SETUP ---

        // A. Depth Material
        const depthMat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.BasicDepthPacking, // 0..1 grayscale
            skinning: true
        });

        // B. Canny Material (Toon/Rim Shader)
        // Includes SKINNING CHUNKS for Three.js
        const cannyShader = {
            vertexShader: `
                #include <common>
                #include <skinning_pars_vertex>
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    #include <skinning_vertex>
                    vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
                    vec3 objectNormal = vec3( normal );
                    #include <skinning_vertex> 
                    vec3 transformedNormal = normalMatrix * objectNormal;
                    #ifdef USE_SKINNING
                        mat4 boneMatX = getBoneMatrix( skinIndex.x );
                        mat4 boneMatY = getBoneMatrix( skinIndex.y );
                        mat4 boneMatZ = getBoneMatrix( skinIndex.z );
                        mat4 boneMatW = getBoneMatrix( skinIndex.w );
                        mat4 skinMatrix = mat4( 0.0 );
                        skinMatrix += skinIndex.x > 0.0 ? skinWeight.x * boneMatX : mat4( 0.0 );
                        skinMatrix += skinIndex.y > 0.0 ? skinWeight.y * boneMatY : mat4( 0.0 );
                        skinMatrix += skinIndex.z > 0.0 ? skinWeight.z * boneMatZ : mat4( 0.0 );
                        skinMatrix += skinIndex.w > 0.0 ? skinWeight.w * boneMatW : mat4( 0.0 );
                        transformedNormal = mat3( skinMatrix ) * objectNormal;
                        transformedNormal = normalMatrix * transformedNormal;
                    #endif
                    vNormal = normalize(transformedNormal);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(vViewPosition);
                    float dotProduct = dot(normal, viewDir);
                    float rim = 1.0 - max(dotProduct, 0.0);
                    float edge = step(0.65, rim); 
                    gl_FragColor = vec4(vec3(edge), 1.0); 
                }
            `
        };
        const cannyMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: cannyShader.vertexShader,
            fragmentShader: cannyShader.fragmentShader,
            skinning: true
        });

        // Helper: Swap Pose Mesh to Unlit (Basic)
        // LOOPS THROUGH ALL POSE MESHES (Corrects Issue 1 from Backup)
        const swapPoseToUnlit = () => {
            const originalMats = new Map();

            this.poseMeshes.forEach((child) => {
                if (child.isMesh && child.material) {
                    originalMats.set(child, child.material);
                    
                    // Force Unlit MeshBasicMaterial
                    const oldColor = child.material.color || new THREE.Color(0xffffff);
                    const newMat = new THREE.MeshBasicMaterial({
                        color: oldColor, // Use original color
                        skinning: true
                    });
                    
                    // Preserve Texture if exists, reset color to white to avoid tinting
                    if (child.material.map) {
                        newMat.map = child.material.map;
                        newMat.color.setHex(0xffffff); 
                    }
                    
                    child.material = newMat;
                }
            });

            return () => {
                this.poseMeshes.forEach((child) => {
                    if (originalMats.has(child)) {
                        child.material = originalMats.get(child);
                    }
                });
            };
        };

        // Helper: Set Camera Planes
        // Uses FIXED Near plane to prevent Culling (Corrects Issue 2)
        const fitCameraToMesh = (meshes) => {
            if (!meshes || meshes.length === 0) return;
            const box = new THREE.Box3();
            meshes.forEach(m => box.expandByObject(m));
            
            const center = new THREE.Vector3();
            box.getCenter(center);
            const camPos = this.camera.position;
            const dist = camPos.distanceTo(center);
            const radius = box.getBoundingSphere(new THREE.Sphere(center)).radius;

            this.camera.near = 0.05; // FIXED very small near plane
            this.camera.far = dist + (radius * 3.0); // Ensure far plane covers everything
            this.camera.updateProjectionMatrix();
        };

        // Capture Helper
        const captureFrame = (array) => {
            this.renderer.render(this.scene, this.camera);
            const gl = this.renderer.getContext();
            gl.finish(); // Force GPU Sync
            array.push(this.renderer.domElement.toDataURL("image/png"));
        };

        // 3. Render Loop
        for (let i = 0; i < frames; i++) {
            const time = i * step;
            if(this.mixer._actions[0]) {
                this.mixer._actions[0].time = time;
                this.mixer.update(0);
            }
            this.character.updateMatrixWorld(true);

            // --- PASS 1: OPENPOSE (Unlit Colors) ---
            this.scene.background = new THREE.Color(0x000000); 
            setVisibility('pose');
            
            const restoreMaterials = swapPoseToUnlit(); // SWAP ALL (Backup Logic)
            captureFrame(results.pose);
            restoreMaterials(); // RESTORE ALL (Backup Logic)

            // --- PASS 2: DEPTH ---
            this.scene.background = new THREE.Color(0x000000);
            setVisibility('depth');
            fitCameraToMesh(this.depthMeshes); // Recalculate range

            // Apply Depth Mat to ALL depth meshes
            const depthRestores = [];
            this.depthMeshes.forEach(m => {
                depthRestores.push({mesh: m, mat: m.material});
                m.material = depthMat;
            });
            
            captureFrame(results.depth);
            
            // Restore materials
            depthRestores.forEach(o => o.mesh.material = o.mat);
            
            // Reset Camera
            this.camera.near = originalNear;
            this.camera.far = originalFar;
            this.camera.updateProjectionMatrix();


            // --- PASS 3: CANNY ---
            this.scene.background = new THREE.Color(0x000000); 
            setVisibility('canny'); // Shows depth meshes
            
            // Apply Canny Mat to ALL depth meshes
            const cannyRestores = [];
            this.depthMeshes.forEach(m => {
                cannyRestores.push({mesh: m, mat: m.material});
                m.material = cannyMat;
            });

            captureFrame(results.canny);
            
            cannyRestores.forEach(o => o.mesh.material = o.mat);

            // Small delay to prevent UI freeze
            await new Promise(r => setTimeout(r, 20));
        }
        
        // 4. Restoration
        this.renderer.setSize(originalSize.width, originalSize.height);
        this.camera.aspect = originalAspect;
        this.camera.zoom = originalZoom; 
        this.camera.near = originalNear;
        this.camera.far = originalFar;
        this.camera.updateProjectionMatrix();

        // Restore visibility to pre-bake state
        this.poseMeshes.forEach(m => m.visible = visPose);
        this.depthMeshes.forEach(m => m.visible = visDepth);
        
        toggleHelpers(true); 
        if(!visSkel && this.skeletonHelper) this.skeletonHelper.visible = false;
        this.scene.background = originalBg;
        
        this.isBaking = false;
        
        const clientDataWidget = this.node.widgets.find(w => w.name === "client_data");
        if (clientDataWidget) {
            clientDataWidget.value = JSON.stringify(results);
            console.log("[Yedp] Batch Render Complete (3 Passes).");
        }
        
        btn.innerText = "BAKE (DONE)";
        setTimeout(() => { btn.innerText = "BAKE"; }, 2000);
    }
    
    getWidgetValue(name, defaultVal) {
        const w = this.node.widgets?.find(x => x.name === name);
        return w ? w.value : defaultVal;
    }
}

app.registerExtension({
    name: "Yedp.ActionDirector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "YedpActionDirector") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const container = document.createElement("div");
                container.classList.add("yedp-container");
                // Fix for scaling: CSS handles height, not manual pixels
                container.style.width = "100%";
                container.style.height = "100%"; 
                
                const baseUrl = new URL(".", import.meta.url).href;
                if (!document.getElementById('yedp-style')) {
                    const link = document.createElement('link');
                    link.id = 'yedp-style';
                    link.rel = 'stylesheet';
                    link.href = new URL("../css/style.css", baseUrl).href; 
                    document.head.appendChild(link);
                }

                const widget = this.addDOMWidget("3d_viewport", "vp", container, {
                    serialize: false, hideOnZoom: false
                });

                // FIX 1: ComputeSize now returns a SAFE, fixed minimum height (400px).
                // It does NOT depend on 'this.size[1]' anymore, breaking the infinite loop.
                widget.computeSize = (w) => [w, 400];
                
                setTimeout(() => {
                    const vp = new YedpViewport(this, container);
                    const onResizeOrig = this.onResize;
                    this.onResize = function(size) {
                        if (onResizeOrig) onResizeOrig.call(this, size);
                        
                        // FIX 2: Manually clamp the container height to fit the node.
                        // We subtract ~30px for the node header to prevent overflow.
                        // This forces the DOM to obey the node size, rather than the node obeying the DOM.
                        const safeHeight = Math.max(200, size[1] - 30);
                        container.style.height = safeHeight + "px";
                        container.style.maxHeight = safeHeight + "px";
                        
                        // Pass the strict container size to the 3D engine
                        vp.onResize(container.querySelector(".yedp-vp-area"));
                    };
                }, 100);
                
                this.setSize([420, 600]);
            };
        }
    }
});

import { app } from "/scripts/app.js";

/**
 * YEDP BLOCKOUT — 3D Blockout Viewport with Object Management
 * Reuses THREE.js, OrbitControls, and TransformControls from Action Director's shared libs.
 */

const loadThreeJS = async () => {
    if (window._YEDP_THREE_CACHE) return window._YEDP_THREE_CACHE;

    return window._YEDP_THREE_CACHE = new Promise(async (resolve, reject) => {
        const baseUrl = new URL(".", import.meta.url).href;
        try {
            console.log("[Yedp Blockout] Loading THREE.js engine...");

            const THREE = await import(new URL("./three.module.js", baseUrl).href);

            if (THREE.ColorManagement && typeof THREE.ColorManagement.colorSpaceToWorking !== 'function') {
                THREE.ColorManagement.colorSpaceToWorking = function (color, colorSpace) {
                    if (colorSpace === THREE.SRGBColorSpace || colorSpace === 'srgb') return color.convertSRGBToLinear();
                    return color;
                };
            } else if (!THREE.ColorManagement) {
                THREE.ColorManagement = { enabled: false, colorSpaceToWorking: function (color) { return color; } };
            }

            const { OrbitControls } = await import(new URL("./OrbitControls.js", baseUrl).href);
            const { TransformControls } = await import(new URL("./TransformControls.js", baseUrl).href);
            const { GLTFLoader } = await import(new URL("./GLTFLoader.js", baseUrl).href);
            await import(new URL("./fflate.module.js", baseUrl).href); 
            const { FBXLoader } = await import(new URL("./FBXLoader.js", baseUrl).href);
            const { BVHLoader } = await import(new URL("./BVHLoader.js", baseUrl).href);
            const { PLYLoader } = await import(new URL("./PLYLoader.js", baseUrl).href);
            const { HDRLoader } = await import(new URL("./HDRLoader.js", baseUrl).href);
            const { clone } = await import(new URL("./SkeletonUtils.js", baseUrl).href);
            const splatLib = await import(new URL("./gaussian-splats-3d.module.js", baseUrl).href);
            const DropInViewer = splatLib.DropInViewer || splatLib.default?.DropInViewer;

            const bvhLib = await import(new URL("./three-mesh-bvh.module.js?t=" + Date.now(), baseUrl).href);
            THREE.BufferGeometry.prototype.computeBoundsTree = bvhLib.computeBoundsTree;
            THREE.BufferGeometry.prototype.disposeBoundsTree = bvhLib.disposeBoundsTree;
            THREE.Mesh.prototype.raycast = bvhLib.acceleratedRaycast;
            
            const ptLib = await import(new URL("./three-gpu-pathtracer.module.js?t=" + Date.now(), baseUrl).href);

            const { GLTFExporter } = await import(new URL("./GLTFExporter.js", baseUrl).href);

            console.log("[Yedp Blockout] Engine loaded successfully.");
            resolve({ THREE, OrbitControls, TransformControls, GLTFLoader, FBXLoader, BVHLoader, PLYLoader, HDRLoader, SkeletonUtils: { clone }, DropInViewer, bvhLib, ptLib, GLTFExporter });

        } catch (e) {
            console.error("[Yedp Blockout] Critical Engine Load Failure:", e);
            reject(e);
        }
    });
};

class BlockoutViewport {
    constructor(node, container) {
        this.node = node;
        this.container = container;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControls = null;
        this.clock = null;
        this.floor = null;

        this.sceneObjects = [];
        this.objectIdCounter = 0;
        this.selectedObjectId = null;
        
        this.availableAssets = { vehicle: [], furniture: [], props: [], plants: [] };

        this.gizmoBtns = {};
        this.isHovered = false;
        this.resizeObserver = null;
        this.outlinerListEl = null;

        this.snapToGrid = false;
        this.snapUnit = 0.5;
        this.snapRotation = 15;

        this.transformSpace = 'world';
        this.sizeRefVisible = false;
        this.sizeRefSprite = null;

        this.propInputs = {
            px: null, py: null, pz: null,
            rx: null, ry: null, rz: null,
            sx: null, sy: null, sz: null,
            fov: null, fovSection: null,
            intensity: null, intensitySection: null,
            color: null, colorSection: null
        };

        this._handleKeyDown = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', this._handleKeyDown);

        this.init();
    }

    async fetchBlockoutAssets() {
        try {
            const res = await fetch("/yedp/get_blockout_assets");
            const data = await res.json();
            this.availableAssets = data.assets || {};
        } catch (e) {
            console.error("[Yedp Blockout] Failed to fetch custom assets:", e);
            this.availableAssets = { vehicle: [], furniture: [], props: [], plants: [] };
        }
    }

    async init() {
        try {
            const libs = await loadThreeJS();
            this.THREE = libs.THREE;
            this.GLTFLoader = libs.GLTFLoader;
            this.FBXLoader = libs.FBXLoader;
            this.GLTFExporter = libs.GLTFExporter || libs.GLTFExporter?.GLTFExporter || libs.GLTFExporter?.default?.GLTFExporter;

            await this.fetchBlockoutAssets();

            // --- DOM LAYOUT ---
            this.container.innerHTML = "";
            Object.assign(this.container.style, {
                display: "flex", flexDirection: "row", background: "#111",
                width: "100%", height: "100%", overflow: "hidden",
                border: "1px solid #333", borderRadius: "4px", boxSizing: "border-box"
            });

            const sidebarDiv = document.createElement("div");
            sidebarDiv.className = "blockout-sidebar";
            Object.assign(sidebarDiv.style, {
                width: "250px", flex: "0 0 250px", background: "#1a1a1a",
                borderRight: "1px solid #333", display: "flex", flexDirection: "column",
                zIndex: "10"
            });
            this.container.appendChild(sidebarDiv);

            const centerColDiv = document.createElement("div");
            Object.assign(centerColDiv.style, {
                flex: "1 1 0", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative"
            });
            this.container.appendChild(centerColDiv);

            const viewportDiv = document.createElement("div");
            viewportDiv.className = "blockout-vp-area";
            Object.assign(viewportDiv.style, {
                flex: "1 1 0", position: "relative", overflow: "hidden", background: "#1a1a1a"
            });
            centerColDiv.appendChild(viewportDiv);

            this.gate = document.createElement("div");
            this.gate.className = "yedp-resolution-gate";
            Object.assign(this.gate.style, {
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                border: "2px solid rgba(255, 255, 255, 0.4)",
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.7)",
                pointerEvents: "none", zIndex: "5", display: "none"
            });
            viewportDiv.appendChild(this.gate);
            this.showResolutionGate = false;

            const bottomPanelDiv = document.createElement("div");
            bottomPanelDiv.className = "blockout-creation-panel";
            Object.assign(bottomPanelDiv.style, {
                height: "320px", flex: "0 0 300px", background: "#1a1a1a",
                borderTop: "1px solid #333", display: "flex", flexDirection: "column",
                zIndex: "10"
            });
            centerColDiv.appendChild(bottomPanelDiv);

            const rightPanelDiv = document.createElement("div");
            rightPanelDiv.className = "blockout-properties";
            Object.assign(rightPanelDiv.style, {
                width: "250px", flex: "0 0 250px", background: "#1a1a1a",
                borderLeft: "1px solid #333", display: "flex", flexDirection: "column",
                zIndex: "10"
            });
            this.container.appendChild(rightPanelDiv);

            // --- 3D ENGINE ---
            this.clock = new this.THREE.Clock();
            this.scene = new this.THREE.Scene();
            this.scene.background = new this.THREE.Color(0x1a1a1a);

            const grid = new this.THREE.GridHelper(10, 10, 0x444444, 0x222222);
            this.scene.add(grid);
            const axes = new this.THREE.AxesHelper(1);
            this.scene.add(axes);

            const floorGeo = new this.THREE.PlaneGeometry(50, 50);
            const floorMat = new this.THREE.ShadowMaterial({ opacity: 0.4 });
            this.floor = new this.THREE.Mesh(floorGeo, floorMat);
            this.floor.rotation.x = -Math.PI / 2;
            this.floor.receiveShadow = true;
            this.scene.add(this.floor);

            this.buildSizeReference();

            this.perspCam = new this.THREE.PerspectiveCamera(45, 1, 0.01, 2000);
            this.perspCam.position.set(3, 2.5, 4);

            const d = 4.5;
            this.orthoCam = new this.THREE.OrthographicCamera(-d, d, d, -d, 0.01, 2000);
            this.orthoCam.position.set(3, 2.5, 4);
            
            this.camera = this.perspCam;
            this.isOrthographic = false;

            this.sceneObjects.push({
                id: 'camera',
                name: 'Camera',
                type: 'camera',
                mesh: this.camera,
                visible: true,
                isFixed: true
            });

            this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: false });
            if (this.renderer.outputColorSpace) this.renderer.outputColorSpace = this.THREE.SRGBColorSpace;
            else this.renderer.outputEncoding = this.THREE.sRGBEncoding;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = this.THREE.PCFSoftShadowMap;
            viewportDiv.appendChild(this.renderer.domElement);
            Object.assign(this.renderer.domElement.style, { width: "100%", height: "100%", display: "block" });

            this.controls = new libs.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.set(0, 0.5, 0);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.1;
            this.controls.addEventListener('change', () => this.syncPropertiesPanel());

            this.transformControls = new libs.TransformControls(this.camera, this.renderer.domElement);
            this.transformControls.addEventListener('dragging-changed', (event) => {
                this.controls.enabled = !event.value;
            });
            this.transformControls.addEventListener('change', () => {
                this.syncPropertiesPanel();
            });
            this.scene.add(this.transformControls);

            const ambient = new this.THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambient);

            const dirLight = new this.THREE.DirectionalLight(0xffffff, 1.2);
            dirLight.position.set(3, 5, 4);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.set(1024, 1024);
            dirLight.shadow.camera.near = 0.1;
            dirLight.shadow.camera.far = 20;
            dirLight.shadow.camera.left = -5;
            dirLight.shadow.camera.right = 5;
            dirLight.shadow.camera.top = 5;
            dirLight.shadow.camera.bottom = -5;
            this.scene.add(dirLight);

            this.addObject("cube");

            this.raycaster = new this.THREE.Raycaster();
            this.mouse = new this.THREE.Vector2();
            this.pointerDownPos = new this.THREE.Vector2();

            viewportDiv.addEventListener('pointerdown', (e) => {
                this.pointerDownPos.set(e.clientX, e.clientY);
            });

            viewportDiv.addEventListener('pointerup', (e) => {
                if (e.target !== this.renderer.domElement) return;
                if (this.transformControls.dragging || this.transformControls.axis) return;

                const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
                if (dist > 5) return; 

                const rect = viewportDiv.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(this.mouse, this.camera);

                const meshes = this.sceneObjects.filter(o => o.visible).map(o => o.mesh);
                const intersects = this.raycaster.intersectObjects(meshes, true);
                const hit = intersects.find(i => i.object.isMesh);

                if (hit) {
                    const sceneObj = this.findSceneObjectByMesh(hit.object);
                    if (sceneObj) {
                        this.selectObjectById(sceneObj.id);
                    }
                } else {
                    this.selectObjectById(null);
                }
            });

            this.buildGizmoPanel(viewportDiv);
            this.buildViewportToolbar(viewportDiv);
            this.buildOutliner(sidebarDiv);
            this.buildPropertiesPanel(rightPanelDiv);
            this.buildCreationPanel(bottomPanelDiv);
            this.buildSnapControls(viewportDiv);

            this.resizeObserver = new ResizeObserver(() => this.onResize(viewportDiv));
            this.resizeObserver.observe(viewportDiv);

            this.animate();
            console.log("[Yedp Blockout] Viewport initialized successfully.");

        } catch (e) {
            this.container.innerHTML = `<div style="color:red; padding:20px;">[Yedp Blockout] Init Error: ${e.message}</div>`;
            console.error("[Yedp Blockout] Init Error:", e);
        }
    }

    // =========================================================================
    // OBJECT MANAGEMENT
    // =========================================================================

    loadCategoryAsset(category, filename) {
        const baseUrl = new URL(".", import.meta.url).href;
        const url = new URL(`../blockout/${category}/${filename}`, baseUrl).href;
        
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'fbx') {
            const loader = new this.FBXLoader();
            loader.load(url, (fbx) => {
                this.addObject("imported", fbx, filename);
            });
        } else {
            const loader = new this.GLTFLoader();
            loader.load(url, (gltf) => {
                this.addObject("imported", gltf.scene, filename);
            });
        }
    }

    addObject(type = "cube", importedMesh = null, importedName = null, autoSelect = true) {
        this.objectIdCounter++;
        const id = this.objectIdCounter;

        let mesh;
        if (importedMesh) {
            mesh = importedMesh;
            
            const lingeringOverlays = [];
            mesh.traverse(c => {
                if (c.userData && c.userData.isWireframeOverlay) lingeringOverlays.push(c);
            });
            lingeringOverlays.forEach(c => {
                if (c.parent) c.parent.remove(c);
            });

            mesh.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                    if (c.material) c.userData.originalMaterial = c.material;
                }
            });
        } else if (type === "cube") {
            const geo = new this.THREE.BoxGeometry(1, 1, 1);
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "plane") {
            const geo = new this.THREE.PlaneGeometry(2, 2);
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1, side: this.THREE.DoubleSide });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "sphere") {
            const geo = new this.THREE.SphereGeometry(0.5, 32, 16);
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "cone") {
            const geo = new this.THREE.ConeGeometry(0.5, 1, 32);
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "cylinder") {
            const geo = new this.THREE.CylinderGeometry(0.5, 0.5, 1, 32);
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "pipe") {
            const outer = new this.THREE.Shape();
            outer.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
            const hole = new this.THREE.Path();
            hole.absarc(0, 0, 0.4, 0, Math.PI * 2, true);
            outer.holes.push(hole);
            const geo = new this.THREE.ExtrudeGeometry(outer, { depth: 1, bevelEnabled: false, curveSegments: 32 });
            geo.translate(0, 0, -0.5); 
            geo.rotateX(Math.PI / 2); 
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1, side: this.THREE.DoubleSide });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "torus") {
            const geo = new this.THREE.TorusGeometry(0.5, 0.2, 16, 100);
            const mat = new this.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
            mesh = new this.THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2; 
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        } else if (type === "pointlight") {
            const light = new this.THREE.PointLight(0xffffff, 5, 50);
            light.castShadow = true;
            light.shadow.bias = -0.001;

            const sphereGeo = new this.THREE.SphereGeometry(0.2, 8, 8);
            const sphereMat = new this.THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
            mesh = new this.THREE.Mesh(sphereGeo, sphereMat);
            mesh.add(light);
        } else if (type === "directionallight") {
            const light = new this.THREE.DirectionalLight(0xffffff, 1.2);
            light.castShadow = true;
            light.shadow.bias = -0.001;
            light.shadow.mapSize.set(1024, 1024);

            const coneGeo = new this.THREE.ConeGeometry(0.2, 0.4, 8);
            const coneMat = new this.THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
            mesh = new this.THREE.Mesh(coneGeo, coneMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.add(light);
            
            const target = new this.THREE.Object3D();
            target.position.set(0, 0, -1);
            mesh.add(target);
            light.target = target;
        } else if (type === "spotlight") {
            const light = new this.THREE.SpotLight(0xffffff, 5);
            light.distance = 50;
            light.angle = Math.PI / 4;
            light.penumbra = 0.5;
            light.castShadow = true;
            light.shadow.bias = -0.001;
            light.shadow.mapSize.set(1024, 1024);

            const cylGeo = new this.THREE.CylinderGeometry(0.05, 0.2, 0.4, 8);
            const cylMat = new this.THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
            mesh = new this.THREE.Mesh(cylGeo, cylMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.add(light);
            
            const target = new this.THREE.Object3D();
            target.position.set(0, 0, -1);
            mesh.add(target);
            light.target = target;
        }

        if (!importedMesh) {
            const dist = 3;
            const dir = new this.THREE.Vector3();
            this.camera.getWorldDirection(dir);
            mesh.position.copy(this.camera.position).add(dir.multiplyScalar(dist));
            if (mesh.position.y < 0.5) mesh.position.y = 0.5;
        }

        mesh.userData.blockoutId = id;

        const typeCount = this.sceneObjects.filter(o => o.type === type).length + 1;
        const formattedCount = typeCount < 10 ? `0${typeCount}` : typeCount;
        const typeNameStr = importedName ? importedName.split('.')[0] : type.charAt(0).toUpperCase() + type.slice(1);
        const name = `${typeNameStr}_${formattedCount}`;
        const entry = { id, name, type, mesh, visible: true };

        this.sceneObjects.push(entry);
        this.scene.add(mesh);

        if (autoSelect) {
            this.selectObjectById(id);
        }

        this.refreshOutliner();
        return entry;
    }

    deleteObject(id) {
        const idx = this.sceneObjects.findIndex(o => o.id === id);
        if (idx === -1) return;

        const entry = this.sceneObjects[idx];
        if (entry.isFixed) return;

        if (this.selectedObjectId === id) {
            this.selectObjectById(null);
        }

        this.scene.remove(entry.mesh);
        if (entry.mesh.geometry) entry.mesh.geometry.dispose();
        if (entry.mesh.material) {
            if (Array.isArray(entry.mesh.material)) entry.mesh.material.forEach(m => m.dispose());
            else entry.mesh.material.dispose();
        }

        this.sceneObjects.splice(idx, 1);
        this.refreshOutliner();
    }

    renameObject(id, newName) {
        const entry = this.sceneObjects.find(o => o.id === id);
        if (!entry) return;

        entry.name = newName || entry.name;
        entry.mesh.name = entry.name;
        this.refreshOutliner();
    }

    selectObjectById(id) {
        this.selectedObjectId = id;

        if (id === null) {
            this.transformControls.detach();
            this.refreshOutliner();
            this.syncPropertiesPanel();
            return;
        }

        const entry = this.sceneObjects.find(o => o.id === id);
        if (entry && entry.mesh) {
            this.transformControls.attach(entry.mesh);
        }

        this.refreshOutliner();
        this.syncPropertiesPanel();
    }

    toggleObjectVisibility(id) {
        const entry = this.sceneObjects.find(o => o.id === id);
        if (!entry) return;

        entry.visible = !entry.visible;
        entry.mesh.visible = entry.visible;

        if (!entry.visible && this.selectedObjectId === id) {
            this.selectObjectById(null);
        }

        this.refreshOutliner();
    }

    getSelectedObject() {
        if (this.selectedObjectId === null) return null;
        return this.sceneObjects.find(o => o.id === this.selectedObjectId) || null;
    }

    findSceneObjectByMesh(mesh) {
        let current = mesh;
        while (current) {
            if (current.userData && current.userData.blockoutId !== undefined) {
                return this.sceneObjects.find(o => o.id === current.userData.blockoutId) || null;
            }
            current = current.parent;
        }
        return null;
    }

    // =========================================================================
    // OUTLINER PANEL (LEFT SIDEBAR)
    // =========================================================================

    buildOutliner(sidebarDiv) {
        const header = document.createElement("div");
        Object.assign(header.style, {
            padding: "8px 12px", background: "#222", borderBottom: "1px solid #333",
            color: "#ccc", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase",
            letterSpacing: "1px"
        });
        header.innerText = "Outliner";
        sidebarDiv.appendChild(header);

        this.outlinerListEl = document.createElement("div");
        Object.assign(this.outlinerListEl.style, {
            flex: "1 1 0", overflowY: "auto", display: "flex", flexDirection: "column",
            padding: "4px", gap: "2px"
        });
        sidebarDiv.appendChild(this.outlinerListEl);

        this.refreshOutliner();
    }

    refreshOutliner() {
        if (!this.outlinerListEl) return;
        this.outlinerListEl.innerHTML = "";
        
        if (!this.outlinerCollapsed) this.outlinerCollapsed = { Camera: false, Lights: false, Objects: false };

        if (this.sceneObjects.length === 0) {
            const empty = document.createElement("div");
            Object.assign(empty.style, {
                color: "#555", fontSize: "11px", fontStyle: "italic", padding: "8px"
            });
            empty.innerText = "(empty scene)";
            this.outlinerListEl.appendChild(empty);
            return;
        }

        const renderGroup = (title, items, groupColor) => {
            if (items.length === 0) return;
            
            const header = document.createElement("div");
            header.innerText = (this.outlinerCollapsed[title] ? "▶ " : "▼ ") + title;
            Object.assign(header.style, {
                color: groupColor, fontSize: "10px", padding: "4px 8px", marginTop: "8px", borderBottom: `1px solid ${groupColor}`, textTransform: "uppercase", cursor: "pointer", fontWeight: "bold", userSelect: "none"
            });
            header.onclick = () => {
                this.outlinerCollapsed[title] = !this.outlinerCollapsed[title];
                this.refreshOutliner();
            };
            this.outlinerListEl.appendChild(header);

            if (this.outlinerCollapsed[title]) return;

            items.forEach(obj => {
                const row = document.createElement("div");
                const isSelected = obj.id === this.selectedObjectId;
                
                Object.assign(row.style, {
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 8px", borderRadius: "3px", cursor: "pointer",
                    fontSize: "12px", fontFamily: "'Consolas', 'Monaco', monospace",
                    background: isSelected ? "#1b3342" : "transparent",
                    color: isSelected ? "#fff" : (obj.visible ? "#ccc" : "#555"),
                    border: isSelected ? `1px solid ${groupColor}` : "1px solid transparent",
                    transition: "all 0.1s",
                    marginLeft: "8px"
                });

                const nameEl = document.createElement("div");
                nameEl.innerText = obj.name;
                nameEl.title = `Double-click to rename`;
                Object.assign(nameEl.style, {
                    flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    textDecoration: obj.visible ? "none" : "line-through"
                });
                row.appendChild(nameEl);

                const actions = document.createElement("div");
                Object.assign(actions.style, { display: "flex", gap: "6px" });

                if (!obj.isFixed) {
                    const btnVis = document.createElement("button");
                    btnVis.innerText = obj.visible ? "👁" : "○";
                    btnVis.title = "Toggle Visibility";
                    Object.assign(btnVis.style, {
                        background: "transparent", border: "none", color: "inherit", cursor: "pointer",
                        fontSize: "12px", padding: "0 4px", opacity: "0.7"
                    });
                    btnVis.onmouseover = () => { btnVis.style.opacity = "1"; };
                    btnVis.onmouseout = () => { btnVis.style.opacity = "0.7"; };
                    btnVis.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleObjectVisibility(obj.id);
                    };
                    actions.appendChild(btnVis);

                    const btnDel = document.createElement("button");
                    btnDel.innerText = "✕";
                    btnDel.title = "Delete";
                    Object.assign(btnDel.style, {
                        background: "transparent", border: "none", color: "inherit", cursor: "pointer",
                        fontSize: "12px", padding: "0 4px", opacity: "0.7"
                    });
                    btnDel.onmouseover = () => { btnDel.style.opacity = "1"; btnDel.style.color = isSelected ? "#d00" : "#ff5555"; };
                    btnDel.onmouseout = () => { btnDel.style.opacity = "0.7"; btnDel.style.color = "inherit"; };
                    btnDel.onclick = (e) => {
                        e.stopPropagation();
                        this.deleteObject(obj.id);
                    };
                    actions.appendChild(btnDel);
                }

                row.appendChild(actions);
                row.onclick = () => { this.selectObjectById(obj.id); };
                row.ondblclick = (e) => {
                    e.stopPropagation();
                    if (!obj.isFixed) { this.promptRenameObject(obj.id); }
                };

                if (!isSelected) {
                    row.onmouseover = () => { row.style.background = "#2a2a2a"; row.style.borderColor = "#444"; };
                    row.onmouseout = () => { row.style.background = "transparent"; row.style.borderColor = "transparent"; };
                }

                this.outlinerListEl.appendChild(row);
            });
        };

        const fixed = this.sceneObjects.filter(o => o.isFixed);
        const lights = this.sceneObjects.filter(o => ['pointlight', 'directionallight', 'spotlight'].includes(o.type));
        const meshes = this.sceneObjects.filter(o => !o.isFixed && !['pointlight', 'directionallight', 'spotlight'].includes(o.type));

        renderGroup("Camera", fixed, "#bbbbbb");
        renderGroup("Lights", lights, "#ffcc00");
        renderGroup("Objects", meshes, "#00d2ff");
    }

    // =========================================================================
    // PROPERTIES PANEL (RIGHT SIDEBAR)
    // =========================================================================

    buildPropertiesPanel(panelDiv) {
        const header = document.createElement("div");
        Object.assign(header.style, {
            padding: "8px 12px", background: "#222", borderBottom: "1px solid #333",
            color: "#ccc", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase",
            letterSpacing: "1px"
        });
        header.innerText = "Properties";
        panelDiv.appendChild(header);

        this.propsContentEl = document.createElement("div");
        Object.assign(this.propsContentEl.style, {
            flex: "1 1 0", overflowY: "auto", display: "flex", flexDirection: "column",
            padding: "12px", gap: "12px", fontSize: "12px", fontFamily: "'Consolas', 'Monaco', monospace"
        });
        panelDiv.appendChild(this.propsContentEl);

        this.propsEmptyMsg = document.createElement("div");
        Object.assign(this.propsEmptyMsg.style, {
            color: "#555", fontStyle: "italic", textAlign: "center", marginTop: "20px"
        });
        this.propsEmptyMsg.innerText = "No object selected";
        this.propsContentEl.appendChild(this.propsEmptyMsg);

        this.propsForm = document.createElement("div");
        Object.assign(this.propsForm.style, {
            display: "none", flexDirection: "column", gap: "12px"
        });
        this.propsContentEl.appendChild(this.propsForm);

        const spaceSection = document.createElement("div");
        Object.assign(spaceSection.style, { display: "flex", gap: "8px", flexWrap: "wrap" });

        const spaceWrap = document.createElement("div");
        Object.assign(spaceWrap.style, { flex: "1" });
        const spaceLbl = document.createElement("div");
        spaceLbl.innerText = "Space";
        Object.assign(spaceLbl.style, { color: "#888", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" });
        spaceWrap.appendChild(spaceLbl);

        const spaceRow = document.createElement("div");
        Object.assign(spaceRow.style, { display: "flex", gap: "2px" });

        const createSpaceBtn = (label, value) => {
            const btn = document.createElement("button");
            btn.innerText = label;
            Object.assign(btn.style, {
                flex: "1", padding: "4px", background: value === 'world' ? "#00d2ff" : "#333",
                color: value === 'world' ? "#000" : "#ccc", border: "1px solid #555",
                borderRadius: "3px", cursor: "pointer", fontSize: "10px", fontWeight: "bold"
            });
            btn.onclick = () => {
                this.transformSpace = value;
                this.transformControls.setSpace(value);
                btnWorld.style.background = value === 'world' ? "#00d2ff" : "#333";
                btnWorld.style.color = value === 'world' ? "#000" : "#ccc";
                btnLocal.style.background = value === 'local' ? "#00d2ff" : "#333";
                btnLocal.style.color = value === 'local' ? "#000" : "#ccc";
            };
            return btn;
        };

        const btnWorld = createSpaceBtn("World", "world");
        const btnLocal = createSpaceBtn("Local", "local");
        spaceRow.append(btnWorld, btnLocal);
        spaceWrap.appendChild(spaceRow);

        const pivotWrap = document.createElement("div");
        Object.assign(pivotWrap.style, { flex: "1" });
        const pivotLbl = document.createElement("div");
        pivotLbl.innerText = "Pivot";
        Object.assign(pivotLbl.style, { color: "#888", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" });
        pivotWrap.appendChild(pivotLbl);

        const pivotRow = document.createElement("div");
        Object.assign(pivotRow.style, { display: "flex", gap: "2px" });

        const createPivotBtn = (label, value) => {
            const btn = document.createElement("button");
            btn.innerText = label;
            Object.assign(btn.style, {
                flex: "1", padding: "4px", background: value === 'origin' ? "#00d2ff" : "#333",
                color: value === 'origin' ? "#000" : "#ccc", border: "1px solid #555",
                borderRadius: "3px", cursor: "pointer", fontSize: "10px", fontWeight: "bold"
            });
            btn.onclick = () => {
                this.setPivotMode(value);
                btnOrigin.style.background = value === 'origin' ? "#00d2ff" : "#333";
                btnOrigin.style.color = value === 'origin' ? "#000" : "#ccc";
                btnCenter.style.background = value === 'center' ? "#00d2ff" : "#333";
                btnCenter.style.color = value === 'center' ? "#000" : "#ccc";
            };
            return btn;
        };

        const btnOrigin = createPivotBtn("Origin", "origin");
        const btnCenter = createPivotBtn("Center", "center");
        pivotRow.append(btnOrigin, btnCenter);
        pivotWrap.appendChild(pivotRow);

        spaceSection.append(spaceWrap, pivotWrap);
        this.propsForm.appendChild(spaceSection);

        const createVec3Input = (label, keyPrefix, step) => {
            const section = document.createElement("div");
            const lbl = document.createElement("div");
            lbl.innerText = label;
            Object.assign(lbl.style, { color: "#888", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" });
            section.appendChild(lbl);

            const row = document.createElement("div");
            Object.assign(row.style, { display: "flex", gap: "4px" });

            ['x', 'y', 'z'].forEach(axis => {
                const wrap = document.createElement("div");
                Object.assign(wrap.style, { display: "flex", alignItems: "center", background: "#222", borderRadius: "3px", border: "1px solid #444", flex: "1" });

                const axisLbl = document.createElement("div");
                axisLbl.innerText = axis.toUpperCase();
                Object.assign(axisLbl.style, { padding: "0 4px", color: "#666", fontSize: "10px" });
                wrap.appendChild(axisLbl);

                const inp = document.createElement("input");
                inp.type = "number";
                inp.step = step;
                Object.assign(inp.style, {
                    width: "100%", background: "transparent", border: "none", color: "#ccc",
                    padding: "4px 2px", fontSize: "11px", outline: "none", fontFamily: "inherit",
                    minWidth: "0" 
                });
                
                inp.addEventListener('input', () => this.applyPropertiesFromUI());
                inp.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') inp.blur();
                });

                wrap.appendChild(inp);
                row.appendChild(wrap);
                this.propInputs[keyPrefix + axis] = inp;
            });

            section.appendChild(row);
            this.propsForm.appendChild(section);
        };

        createVec3Input("Position", "p", 0.1);
        createVec3Input("Rotation (Deg)", "r", 1);
        createVec3Input("Scale", "s", 0.1);
        
        const createScalarInput = (label, keyPrefix, step) => {
            const section = document.createElement("div");
            const lbl = document.createElement("div");
            lbl.innerText = label;
            Object.assign(lbl.style, { color: "#888", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" });
            section.appendChild(lbl);

            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", alignItems: "center", background: "#222", borderRadius: "3px", border: "1px solid #444" });

            const inp = document.createElement("input");
            inp.type = "number";
            inp.step = step;
            Object.assign(inp.style, {
                width: "100%", background: "transparent", border: "none", color: "#ccc",
                padding: "4px 6px", fontSize: "11px", outline: "none", fontFamily: "inherit"
            });
            inp.addEventListener('input', () => this.applyPropertiesFromUI());
            inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
            
            wrap.appendChild(inp);
            section.appendChild(wrap);
            this.propsForm.appendChild(section);
            
            this.propInputs[keyPrefix] = inp;
            this.propInputs[keyPrefix + 'Section'] = section;
        };

        const createToggleInput = (label, keyPrefix) => {
            const section = document.createElement("div");
            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" });

            const lbl = document.createElement("div");
            lbl.innerText = label;
            Object.assign(lbl.style, { color: "#888", fontSize: "10px", textTransform: "uppercase", marginRight: "10px" });

            const inp = document.createElement("input");
            inp.type = "checkbox";
            inp.style.cursor = "pointer";
            inp.addEventListener('change', () => this.applyPropertiesFromUI());

            wrap.appendChild(lbl);
            wrap.appendChild(inp);
            section.appendChild(wrap);
            this.propsForm.appendChild(section);

            this.propInputs[keyPrefix] = inp;
            this.propInputs[keyPrefix + 'Section'] = section;
        };

        const createSliderInput = (label, keyPrefix, min, max, step) => {
            const section = document.createElement("div");
            const lbl = document.createElement("div");
            lbl.innerText = label;
            Object.assign(lbl.style, { color: "#888", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" });
            section.appendChild(lbl);

            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", alignItems: "center", gap: "8px", background: "#222", padding: "4px", borderRadius: "3px", border: "1px solid #444" });

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = min; slider.max = max; slider.step = step;
            slider.style.flex = "1";
            slider.addEventListener('input', () => { num.value = slider.value; this.applyPropertiesFromUI(); });

            const num = document.createElement("input");
            num.type = "number";
            num.min = min; num.max = max; num.step = step;
            Object.assign(num.style, {
                width: "40px", background: "transparent", border: "none", color: "#ccc",
                padding: "0", fontSize: "11px", outline: "none", fontFamily: "inherit"
            });
            num.addEventListener('input', () => { slider.value = num.value; this.applyPropertiesFromUI(); });

            wrap.appendChild(slider);
            wrap.appendChild(num);
            section.appendChild(wrap);
            this.propsForm.appendChild(section);

            this.propInputs[keyPrefix] = slider; 
            this.propInputs[keyPrefix + 'Num'] = num;
            this.propInputs[keyPrefix + 'Section'] = section;
        };

        const createColorInput = (label, keyPrefix) => {
            const section = document.createElement("div");
            const lbl = document.createElement("div");
            lbl.innerText = label;
            Object.assign(lbl.style, { color: "#888", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" });
            section.appendChild(lbl);

            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", alignItems: "center", background: "#222", borderRadius: "3px", border: "1px solid #444" });

            const inp = document.createElement("input");
            inp.type = "color";
            Object.assign(inp.style, {
                width: "100%", background: "transparent", border: "none", cursor: "pointer",
                padding: "2px", height: "24px"
            });
            inp.addEventListener('input', () => this.applyPropertiesFromUI());
            
            wrap.appendChild(inp);
            section.appendChild(wrap);
            this.propsForm.appendChild(section);
            
            this.propInputs[keyPrefix] = inp;
            this.propInputs[keyPrefix + 'Section'] = section;
        };

        createToggleInput("Orthographic", "ortho");
        createSliderInput("FOV", "fov", 10, 150, 1);
        createScalarInput("Clip Near", "clipNear", 0.01);
        createScalarInput("Clip Far", "clipFar", 1);
        createScalarInput("Intensity", "intensity", 0.1);
        createScalarInput("Distance", "distance", 1);
        createScalarInput("Angle", "angle", 1);
        createScalarInput("Penumbra", "penumbra", 0.1);
        createColorInput("Color", "color");
        
        this.syncPropertiesPanel();
    }

    syncPropertiesPanel() {
        if (!this.propsContentEl) return;
        
        const obj = this.getSelectedObject();
        if (!obj || !obj.mesh) {
            this.propsEmptyMsg.style.display = "block";
            this.propsForm.style.display = "none";
            return;
        }

        this.propsEmptyMsg.style.display = "none";
        this.propsForm.style.display = "flex";

        const m = obj.mesh;
        
        if (document.activeElement !== this.propInputs.px) this.propInputs.px.value = m.position.x.toFixed(3);
        if (document.activeElement !== this.propInputs.py) this.propInputs.py.value = m.position.y.toFixed(3);
        if (document.activeElement !== this.propInputs.pz) this.propInputs.pz.value = m.position.z.toFixed(3);

        const rad2deg = 180 / Math.PI;
        if (document.activeElement !== this.propInputs.rx) this.propInputs.rx.value = (m.rotation.x * rad2deg).toFixed(2);
        if (document.activeElement !== this.propInputs.ry) this.propInputs.ry.value = (m.rotation.y * rad2deg).toFixed(2);
        if (document.activeElement !== this.propInputs.rz) this.propInputs.rz.value = (m.rotation.z * rad2deg).toFixed(2);

        if (document.activeElement !== this.propInputs.sx) this.propInputs.sx.value = m.scale.x.toFixed(3);
        if (document.activeElement !== this.propInputs.sy) this.propInputs.sy.value = m.scale.y.toFixed(3);
        if (document.activeElement !== this.propInputs.sz) this.propInputs.sz.value = m.scale.z.toFixed(3);

        if (obj.type === 'camera') {
            this.propInputs.fovSection.style.display = 'block';
            this.propInputs.orthoSection.style.display = 'block';
            this.propInputs.clipNearSection.style.display = 'block';
            this.propInputs.clipFarSection.style.display = 'block';
            
            if (document.activeElement !== this.propInputs.fov && document.activeElement !== this.propInputs.fovNum) {
                this.propInputs.fov.value = m.fov ? m.fov.toFixed(1) : 45;
                this.propInputs.fovNum.value = m.fov ? m.fov.toFixed(1) : 45;
            }
            if (document.activeElement !== this.propInputs.ortho) {
                this.propInputs.ortho.checked = this.isOrthographic;
            }
            if (document.activeElement !== this.propInputs.clipNear) {
                this.propInputs.clipNear.value = m.near.toFixed(2);
            }
            if (document.activeElement !== this.propInputs.clipFar) {
                this.propInputs.clipFar.value = m.far.toFixed(1);
            }
        } else {
            this.propInputs.fovSection.style.display = 'none';
            this.propInputs.orthoSection.style.display = 'none';
            this.propInputs.clipNearSection.style.display = 'none';
            this.propInputs.clipFarSection.style.display = 'none';
        }

        const isMesh = ['cube', 'plane', 'sphere', 'cone', 'cylinder', 'pipe', 'torus', 'imported'].includes(obj.type);
        const isLight = ['pointlight', 'directionallight', 'spotlight'].includes(obj.type);

        if (isMesh) {
            this.propInputs.colorSection.style.display = 'block';
            if (document.activeElement !== this.propInputs.color) {
                let firstColor = null;
                if (Array.isArray(m.material)) {
                    const matWithColor = m.material.find(mat => mat && mat.color && typeof mat.color.getHexString === 'function');
                    if (matWithColor) firstColor = matWithColor.color;
                } else if (m.material && m.material.color && typeof m.material.color.getHexString === 'function') {
                    firstColor = m.material.color;
                } else if (m.children && m.children.length > 0) {
                    m.traverse(c => {
                        if (!firstColor && c.isMesh && c.material) {
                            if (Array.isArray(c.material)) {
                                const mc = c.material.find(mat => mat && mat.color && typeof mat.color.getHexString === 'function');
                                if (mc) firstColor = mc.color;
                            } else if (c.material.color && typeof c.material.color.getHexString === 'function') {
                                firstColor = c.material.color;
                            }
                        }
                    });
                }
                
                if (firstColor) {
                    this.propInputs.color.value = '#' + firstColor.getHexString();
                } else {
                    this.propInputs.color.value = '#ffffff';
                }
            }
        } else if (isLight) {
            this.propInputs.colorSection.style.display = 'block';
            const light = m.children[0];
            if (light && document.activeElement !== this.propInputs.color) {
                this.propInputs.color.value = '#' + light.color.getHexString();
            }
        } else {
            this.propInputs.colorSection.style.display = 'none';
        }

        if (isLight) {
            this.propInputs.intensitySection.style.display = 'block';
            const light = m.children[0];
            if (light && document.activeElement !== this.propInputs.intensity) {
                this.propInputs.intensity.value = light.intensity.toFixed(2);
            }

            if (obj.type === 'pointlight' || obj.type === 'spotlight') {
                this.propInputs.distanceSection.style.display = 'block';
                if (light && document.activeElement !== this.propInputs.distance) {
                    this.propInputs.distance.value = light.distance.toFixed(1);
                }
            } else {
                this.propInputs.distanceSection.style.display = 'none';
            }

            if (obj.type === 'spotlight') {
                this.propInputs.angleSection.style.display = 'block';
                this.propInputs.penumbraSection.style.display = 'block';
                if (light && document.activeElement !== this.propInputs.angle) {
                    this.propInputs.angle.value = (light.angle * (180 / Math.PI)).toFixed(1);
                }
                if (light && document.activeElement !== this.propInputs.penumbra) {
                    this.propInputs.penumbra.value = light.penumbra.toFixed(2);
                }
            } else {
                this.propInputs.angleSection.style.display = 'none';
                this.propInputs.penumbraSection.style.display = 'none';
            }
        } else {
            this.propInputs.intensitySection.style.display = 'none';
            this.propInputs.distanceSection.style.display = 'none';
            this.propInputs.angleSection.style.display = 'none';
            this.propInputs.penumbraSection.style.display = 'none';
        }
    }

    applyPropertiesFromUI() {
        const obj = this.getSelectedObject();
        if (!obj || !obj.mesh) return;

        const m = obj.mesh;

        m.position.x = parseFloat(this.propInputs.px.value) || 0;
        m.position.y = parseFloat(this.propInputs.py.value) || 0;
        m.position.z = parseFloat(this.propInputs.pz.value) || 0;

        const deg2rad = Math.PI / 180;
        m.rotation.x = (parseFloat(this.propInputs.rx.value) || 0) * deg2rad;
        m.rotation.y = (parseFloat(this.propInputs.ry.value) || 0) * deg2rad;
        m.rotation.z = (parseFloat(this.propInputs.rz.value) || 0) * deg2rad;

        m.scale.x = parseFloat(this.propInputs.sx.value) || 1;
        m.scale.y = parseFloat(this.propInputs.sy.value) || 1;
        m.scale.z = parseFloat(this.propInputs.sz.value) || 1;

        if (obj.type === 'camera') {
            const wantOrtho = this.propInputs.ortho.checked;
            if (wantOrtho !== this.isOrthographic) {
                this.isOrthographic = wantOrtho;
                this.camera = wantOrtho ? this.orthoCam : this.perspCam;
                
                this.camera.position.copy(m.position);
                this.camera.rotation.copy(m.rotation);
                
                this.controls.object = this.camera;
                this.transformControls.camera = this.camera;
                
                obj.mesh = this.camera;
                
                const vpDiv = this.renderer.domElement.parentElement;
                this.onResize(vpDiv);
            }

            const activeCam = obj.mesh;
            
            activeCam.fov = parseFloat(this.propInputs.fov.value) || 45;
            activeCam.near = parseFloat(this.propInputs.clipNear.value) || 0.1;
            activeCam.far = parseFloat(this.propInputs.clipFar.value) || 1000;
            
            if (activeCam.isOrthographicCamera) {
                const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
                const d = activeCam.fov / 10;
                activeCam.left = -d * aspect;
                activeCam.right = d * aspect;
                activeCam.top = d;
                activeCam.bottom = -d;
            }
            
            activeCam.updateProjectionMatrix();
            if (m !== activeCam) m.updateProjectionMatrix();
        }

        const isMesh = ['cube', 'plane', 'sphere', 'cone', 'cylinder', 'pipe', 'torus', 'imported'].includes(obj.type);
        const isLight = ['pointlight', 'directionallight', 'spotlight'].includes(obj.type);

        if (isMesh) {
            if (m.material) {
                m.material.color.set(this.propInputs.color.value);
            } else if (m.children && m.children.length > 0) {
                m.traverse(c => {
                    if (c.isMesh && c.material && c.material.color) {
                        c.material.color.set(this.propInputs.color.value);
                    }
                });
            }
        } else if (isLight) {
            const light = m.children[0];
            if (light) {
                light.color.set(this.propInputs.color.value);
                light.intensity = parseFloat(this.propInputs.intensity.value) || 0;
                
                if (m.material) {
                    m.material.color.set(this.propInputs.color.value);
                }

                if (obj.type === 'pointlight' || obj.type === 'spotlight') {
                    light.distance = parseFloat(this.propInputs.distance.value) || 0;
                }
                
                if (obj.type === 'spotlight') {
                    light.angle = (parseFloat(this.propInputs.angle.value) || 0) * (Math.PI / 180);
                    light.penumbra = parseFloat(this.propInputs.penumbra.value) || 0;
                }
            }
        }

        if (this.transformControls.object === m) {
            const mode = this.transformControls.getMode();
            this.transformControls.setMode(mode);
        }
    }

    // =========================================================================
    // USER ACTIONS
    // =========================================================================

    deleteSelectedObject() {
        if (this.selectedObjectId === null) return;
        this.deleteObject(this.selectedObjectId);
    }

    promptRenameSelected() {
        if (this.selectedObjectId === null) return;
        const entry = this.sceneObjects.find(o => o.id === this.selectedObjectId);
        if (entry && entry.isFixed) return;
        this.promptRenameObject(this.selectedObjectId);
    }

    promptRenameObject(id) {
        const entry = this.sceneObjects.find(o => o.id === id);
        if (!entry) return;

        const newName = prompt(`Rename "${entry.name}":`, entry.name);
        if (newName !== null && newName.trim() !== "") {
            this.renameObject(id, newName.trim());
        }
    }

    // =========================================================================
    // GIZMO PANEL
    // =========================================================================

    buildGizmoPanel(vpDiv) {
        this.container.addEventListener('mouseenter', () => this.isHovered = true);
        this.container.addEventListener('mouseleave', () => this.isHovered = false);

        const viewPanel = document.createElement("div");
        Object.assign(viewPanel.style, {
            position: "absolute", top: "10px", right: "10px", 
            background: "rgba(30, 30, 30, 0.8)", border: "1px solid #444", 
            borderRadius: "6px", padding: "8px", display: "grid", 
            gridTemplateColumns: "1fr 1fr", gap: "6px", zIndex: "10"
        });
        
        const createViewBtn = (label, colSpan, onClick) => {
            const btn = document.createElement("button");
            btn.innerText = label;
            Object.assign(btn.style, {
                background: "#333", color: "#ccc", border: "1px solid #555",
                borderRadius: "4px", padding: "6px 8px", cursor: "pointer", 
                fontSize: "10px", fontWeight: "bold", textTransform: "uppercase",
                transition: "all 0.1s"
            });
            if (colSpan) btn.style.gridColumn = colSpan;
            btn.onmouseover = () => { btn.style.background = "#555"; btn.style.color = "#fff"; btn.style.borderColor = "#00d2ff"; };
            btn.onmouseout = () => { btn.style.background = "#333"; btn.style.color = "#ccc"; btn.style.borderColor = "#555"; };
            btn.onclick = onClick;
            return btn;
        };

        const vd = 5;
        viewPanel.appendChild(createViewBtn("TOP", null, () => { this.camera.position.set(0, vd, 0); this.controls.target.set(0,0,0); this.controls.update(); }));
        viewPanel.appendChild(createViewBtn("BTM", null, () => { this.camera.position.set(0, -vd, 0); this.controls.target.set(0,0,0); this.controls.update(); }));
        viewPanel.appendChild(createViewBtn("LEFT", null, () => { this.camera.position.set(-vd, 0, 0); this.controls.target.set(0,0,0); this.controls.update(); }));
        viewPanel.appendChild(createViewBtn("RIGHT", null, () => { this.camera.position.set(vd, 0, 0); this.controls.target.set(0,0,0); this.controls.update(); }));
        viewPanel.appendChild(createViewBtn("FRONT", null, () => { this.camera.position.set(0, 0, vd); this.controls.target.set(0,0,0); this.controls.update(); }));
        viewPanel.appendChild(createViewBtn("BACK", null, () => { this.camera.position.set(0, 0, -vd); this.controls.target.set(0,0,0); this.controls.update(); }));
        viewPanel.appendChild(createViewBtn("RESET", "span 2", () => { this.camera.position.set(0, 1.2, 4); this.controls.target.set(0,0,0); this.controls.update(); }));
        
        vpDiv.appendChild(viewPanel);

        const scenePanel = document.createElement("div");
        Object.assign(scenePanel.style, {
            position: "absolute", top: "10px", right: "130px", 
            background: "rgba(30, 30, 30, 0.8)", border: "1px solid #444", 
            borderRadius: "6px", padding: "8px", display: "flex", gap: "6px", zIndex: "10"
        });
        
        const btnSave = document.createElement("button");
        btnSave.innerText = "Save Scene";
        Object.assign(btnSave.style, {
            background: "#333", color: "#ccc", border: "1px solid #555", borderRadius: "3px",
            padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold", textTransform: "uppercase"
        });
        btnSave.onmouseover = () => { btnSave.style.background = "#555"; btnSave.style.borderColor = "#00d2ff"; };
        btnSave.onmouseout = () => { btnSave.style.background = "#333"; btnSave.style.borderColor = "#555"; };
        btnSave.onclick = () => this.saveScene();

        const btnLoad = document.createElement("button");
        btnLoad.innerText = "Load Scene";
        Object.assign(btnLoad.style, {
            background: "#333", color: "#ccc", border: "1px solid #555", borderRadius: "3px",
            padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold", textTransform: "uppercase"
        });
        btnLoad.onmouseover = () => { btnLoad.style.background = "#555"; btnLoad.style.borderColor = "#00d2ff"; };
        btnLoad.onmouseout = () => { btnLoad.style.background = "#333"; btnLoad.style.borderColor = "#555"; };
        btnLoad.onclick = () => this.loadScene();
        const btnBake = document.createElement("button");
        btnBake.innerText = "SEND TO GRAPH";
        Object.assign(btnBake.style, {
            background: "transparent", color: "#ffaa00", border: "1px solid #ffaa00", borderRadius: "3px",
            padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold", textTransform: "uppercase"
        });
        btnBake.onmouseover = () => { btnBake.style.background = "rgba(255, 170, 0, 0.2)"; };
        btnBake.onmouseout = () => { btnBake.style.background = "transparent"; };
        btnBake.onclick = () => this.performBake(btnBake);

        scenePanel.append(btnSave, btnLoad, btnBake);
        vpDiv.appendChild(scenePanel);

        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "absolute", top: "10px", left: "10px", zIndex: "100",
            display: "flex", flexDirection: "column", gap: "6px",
            background: "rgba(20,20,20,0.8)", padding: "6px", borderRadius: "6px", border: "1px solid #333"
        });

        const createIconBtn = (id, svgPath, tooltip, onClick) => {
            const b = document.createElement("button");
            b.title = tooltip;
            Object.assign(b.style, {
                width: "32px", height: "32px", background: "#333", color: "#ccc",
                border: "1px solid #555", borderRadius: "4px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", padding: "4px",
                transition: "all 0.1s"
            });
            b.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
            b.onmouseover = () => { if (b.dataset.active !== "true") b.style.background = "#555"; };
            b.onmouseout = () => { if (b.dataset.active !== "true") b.style.background = "#333"; };
            b.onclick = () => { onClick(); };
            this.gizmoBtns[id] = b;
            return b;
        };

        const pathMove = `<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M9 19l3 3 3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>`;
        const pathRot = `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>`;
        const pathScale = `<path d="M21 3l-6 6"/><path d="M21 3v6"/><path d="M21 3h-6"/><path d="M3 21l6-6"/><path d="M3 21v-6"/><path d="M3 21h6"/><path d="M14 10l-4 4"/>`;
        const pathDeselect = `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`;

        panel.append(
            createIconBtn("translate", pathMove, "Grab (G)", () => { this.transformControls.setMode("translate"); this.updateGizmoUI("translate"); }),
            createIconBtn("rotate", pathRot, "Rotate (R)", () => { this.transformControls.setMode("rotate"); this.updateGizmoUI("rotate"); }),
            createIconBtn("scale", pathScale, "Scale (S)", () => { this.transformControls.setMode("scale"); this.updateGizmoUI("scale"); }),
            createIconBtn("deselect", pathDeselect, "Deselect", () => { this.selectObjectById(null); })
        );
        vpDiv.appendChild(panel);
        this.updateGizmoUI("translate");
    }

    updateGizmoUI(mode) {
        Object.keys(this.gizmoBtns).forEach(k => {
            const b = this.gizmoBtns[k];
            if (k === mode) {
                b.dataset.active = "true"; b.style.background = "#00d2ff"; b.style.color = "#000"; b.style.borderColor = "#00d2ff";
            } else {
                b.dataset.active = "false"; b.style.background = "#333"; b.style.color = "#ccc"; b.style.borderColor = "#555";
            }
        });
    }

    buildViewportToolbar(vpDiv) {
        const bar = document.createElement("div");
        Object.assign(bar.style, {
            position: "absolute", top: "10px", left: "60px", 
            background: "rgba(30, 30, 30, 0.8)", border: "1px solid #444", 
            borderRadius: "6px", padding: "6px", display: "flex", 
            alignItems: "center", gap: "10px", zIndex: "10"
        });

        this.displayMode = "shaded"; 
        this.showWireframe = false;
        
        const modeWrap = document.createElement("div");
        Object.assign(modeWrap.style, { display: "flex", gap: "4px" });
        
        this.toolbarBtns = {};
        
        this.updateToolbarUI = () => {
            if (!this.toolbarBtns.wire) return;
            this.toolbarBtns.wire.style.background = this.showWireframe ? "#00d2ff" : "#333";
            this.toolbarBtns.wire.style.color = this.showWireframe ? "#000" : "#ccc";
            this.toolbarBtns.shaded.style.background = this.displayMode === 'shaded' ? "#00d2ff" : "#333";
            this.toolbarBtns.shaded.style.color = this.displayMode === 'shaded' ? "#000" : "#ccc";
            this.toolbarBtns.tex.style.background = this.displayMode === 'textured' ? "#00d2ff" : "#333";
            this.toolbarBtns.tex.style.color = this.displayMode === 'textured' ? "#000" : "#ccc";
            if (this.toolbarBtns.gate) {
                this.toolbarBtns.gate.style.background = this.showResolutionGate ? "#00d2ff" : "#333";
                this.toolbarBtns.gate.style.color = this.showResolutionGate ? "#000" : "#ccc";
            }
            if (this.toolbarBtns.person) {
                this.toolbarBtns.person.style.background = this.sizeRefVisible ? "#00d2ff" : "#333";
                this.toolbarBtns.person.style.color = this.sizeRefVisible ? "#000" : "#ccc";
            }
            this.updateDisplayMode();
        };

        const createIconBtn = (svg, tooltip, onClick) => {
            const btn = document.createElement("button");
            btn.title = tooltip;
            Object.assign(btn.style, {
                border: "1px solid #555", borderRadius: "3px", cursor: "pointer", 
                width: "24px", height: "24px", padding: "4px", display: "flex",
                alignItems: "center", justifyContent: "center", transition: "all 0.1s",
                background: "#333", color: "#ccc"
            });
            btn.innerHTML = svg;
            btn.onclick = onClick;
            return btn;
        };

        const svgWire = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>`;
        const svgShaded = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>`;
        const svgTex = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10h-10v-10z"/></svg>`;
        const svgGate = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h4m14 0h-4M3 19h4m14 0h-4M5 3v4m0 14v-4m14-14v4m0 14v-4"/></svg>`;
        const svgPerson = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M12 6v8M8 10h8M12 14l-4 8M12 14l4 8"/></svg>`;

        const btnWire = createIconBtn(svgWire, "Wireframe Toggle", () => { this.showWireframe = !this.showWireframe; this.updateToolbarUI(); });
        const btnShaded = createIconBtn(svgShaded, "Shaded Mode", () => { this.displayMode = "shaded"; this.updateToolbarUI(); });
        const btnTex = createIconBtn(svgTex, "Textured Mode", () => { this.displayMode = "textured"; this.updateToolbarUI(); });
        modeWrap.append(btnWire, btnShaded, btnTex);
        this.toolbarBtns.wire = btnWire;
        this.toolbarBtns.shaded = btnShaded;
        this.toolbarBtns.tex = btnTex;

        const gateWrap = document.createElement("div");
        Object.assign(gateWrap.style, { display: "flex", alignItems: "center", borderLeft: "1px solid #555", paddingLeft: "10px" });
        const btnGate = createIconBtn(svgGate, "Resolution Gate", () => { this.showResolutionGate = !this.showResolutionGate; this.updateResolutionGate(); this.updateToolbarUI(); });
        gateWrap.appendChild(btnGate);
        this.toolbarBtns.gate = btnGate;

        const sizeWrap = document.createElement("div");
        Object.assign(sizeWrap.style, { display: "flex", alignItems: "center", borderLeft: "1px solid #555", paddingLeft: "10px" });
        const btnPerson = createIconBtn(svgPerson, "Size Reference (1.68m)", () => { this.toggleSizeReference(); this.updateToolbarUI(); });
        sizeWrap.appendChild(btnPerson);
        this.toolbarBtns.person = btnPerson;

        this.isDepthMode = false;
        this.depthNear = 0.1;
        this.depthFar = 10.0;

        const depthWrap = document.createElement("div");
        Object.assign(depthWrap.style, { display: "flex", alignItems: "center", gap: "6px", borderLeft: "1px solid #555", paddingLeft: "10px" });

        const chkDepth = document.createElement("input");
        chkDepth.type = "checkbox";
        chkDepth.onclick = (e) => { this.isDepthMode = e.target.checked; this.updateDisplayMode(); };

        const lblDepth = document.createElement("span");
        lblDepth.innerText = "Depth";
        lblDepth.style.color = "#ccc"; lblDepth.style.fontSize = "11px";

        const lblNear = document.createElement("span");
        lblNear.innerText = "NEAR:";
        Object.assign(lblNear.style, { color: "#0f0", fontSize: "10px", fontWeight: "bold" });

        const inpNear = document.createElement("input");
        inpNear.type = "number"; inpNear.value = this.depthNear; inpNear.step = "0.1";
        Object.assign(inpNear.style, { width: "40px", background: "#111", color: "#0f0", border: "1px solid #0f0", borderRadius: "3px", fontSize: "10px", padding: "2px 4px" });
        inpNear.onchange = (e) => { this.depthNear = parseFloat(e.target.value) || 0.1; this.updateDisplayMode(); };

        const lblFar = document.createElement("span");
        lblFar.innerText = "FAR:";
        Object.assign(lblFar.style, { color: "#0f0", fontSize: "10px", fontWeight: "bold" });

        const inpFar = document.createElement("input");
        inpFar.type = "number"; inpFar.value = this.depthFar; inpFar.step = "0.1";
        Object.assign(inpFar.style, { width: "40px", background: "#111", color: "#0f0", border: "1px solid #0f0", borderRadius: "3px", fontSize: "10px", padding: "2px 4px" });
        inpFar.onchange = (e) => { this.depthFar = parseFloat(e.target.value) || 10.0; this.updateDisplayMode(); };

        depthWrap.append(chkDepth, lblDepth, lblNear, inpNear, lblFar, inpFar);
        
        bar.append(modeWrap, gateWrap, sizeWrap, depthWrap);
        vpDiv.appendChild(bar);

        this.propInputs.depthCheck = chkDepth;
        this.propInputs.depthNear = inpNear;
        this.propInputs.depthFar = inpFar;

        this.updateToolbarUI();
    }

    updateDisplayMode() {
        this.sceneObjects.forEach(o => {
            if (['cube', 'plane', 'sphere', 'cone', 'cylinder', 'pipe', 'torus', 'imported'].includes(o.type)) {
                o.mesh.traverse(c => {
                    if (c.userData && c.userData.isWireframeOverlay) return;
                    if (c.isMesh && !c.userData.originalMaterial) c.userData.originalMaterial = c.material;
                });
                
                if (this.showWireframe && !o.mesh.userData.wireframeMeshList) {
                    const wireMat = new this.THREE.MeshBasicMaterial({ 
                        color: 0x00d2ff, wireframe: true, transparent: true, opacity: 0.8,
                        depthTest: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 
                    });
                    
                    o.mesh.userData.wireframeMeshList = [];
                    o.mesh.traverse(c => {
                        if (c.userData && c.userData.isWireframeOverlay) return; 
                        if (c.isMesh && c.userData.originalMaterial) {
                            const wm = new this.THREE.Mesh(c.geometry, wireMat);
                            wm.userData.isWireframeOverlay = true;
                            c.add(wm);
                            o.mesh.userData.wireframeMeshList.push(wm);
                        }
                    });
                }

                if (o.mesh.userData.wireframeMeshList) {
                    o.mesh.userData.wireframeMeshList.forEach(wm => wm.visible = this.showWireframe);
                }

                o.mesh.traverse(c => {
                    if (c.userData && c.userData.isWireframeOverlay) return;
                    if (c.isMesh && c.userData.originalMaterial) {
                        if (this.isDepthMode) {
                            if (!c.userData.depthMat || !c.userData.depthMat.isMaterial) {
                                c.userData.depthMat = new this.THREE.MeshDepthMaterial();
                            }
                            c.material = c.userData.depthMat;
                        } else if (this.displayMode === 'shaded') {
                            if (!c.userData.clayMat || !c.userData.clayMat.isMaterial) {
                                c.userData.clayMat = new this.THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8, metalness: 0.1 });
                            }
                            c.material = c.userData.clayMat;
                        } else {
                            c.material = c.userData.originalMaterial;
                            if (c.material) {
                                const mats = Array.isArray(c.material) ? c.material : [c.material];
                                mats.forEach((mat) => {
                                    if (mat && mat.wireframe !== undefined) mat.wireframe = false;
                                });
                            }
                        }
                    }
                });
            }
        });

        if (this.isDepthMode) {
            this.camera.near = this.depthNear;
            this.camera.far = this.depthFar;
        } else {
            const camObj = this.sceneObjects.find(o => o.type === 'camera');
            if (camObj && camObj.mesh) {
                this.camera.near = camObj.mesh.near || 0.1;
                this.camera.far = camObj.mesh.far || 1000;
            } else {
                this.camera.near = 0.1;
                this.camera.far = 1000;
            }
        }
        this.camera.updateProjectionMatrix();
    }

    handleKeyDown(e) {
        if (!this.isHovered) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key.toLowerCase()) {
            case 'g':
                this.transformControls.setMode("translate");
                this.updateGizmoUI("translate");
                break;
            case 'r':
                this.transformControls.setMode("rotate");
                this.updateGizmoUI("rotate");
                break;
            case 's':
                this.transformControls.setMode("scale");
                this.updateGizmoUI("scale");
                break;
            case 'x':
            case 'delete':
                this.deleteSelectedObject();
                break;
            case 'h':
                if (this.selectedObjectId !== null) {
                    this.toggleObjectVisibility(this.selectedObjectId);
                }
                break;
            case 'f2':
                this.promptRenameSelected();
                break;
            case 'escape':
                this.selectObjectById(null);
                break;
        }

        if (e.key === 'F2') {
            this.promptRenameSelected();
        }
    }

    async performBake(btnEl) {
        if (!this.node || !this.renderer) return;
        const originalText = btnEl.innerText;
        btnEl.innerText = "BAKING...";

        let targetW = 512, targetH = 512;
        const ww = this.node.widgets?.find(w => w.name === "width");
        const wh = this.node.widgets?.find(w => w.name === "height");
        if (ww) targetW = ww.value;
        if (wh) targetH = wh.value;

        const vpDiv = this.renderer.domElement.parentElement;
        const origW = vpDiv.clientWidth;
        const origH = vpDiv.clientHeight;
        const origAspect = this.camera.aspect;
        const origDisplayMode = this.displayMode;
        const origWireframe = this.showWireframe;
        const origDepth = this.isDepthMode;

        const helpers = [];
        this.scene.traverse(c => {
            if (
                c.userData.isHelper || 
                c.userData.isWireframeOverlay ||
                c.type === 'GridHelper' || 
                c.type === 'AxesHelper' || 
                c.type === 'TransformControls' || 
                c.type.includes('Helper') || 
                c.isLine ||
                c.isSprite
            ) {
                if (c.visible) {
                    helpers.push(c);
                    c.visible = false;
                }
            }
        });
        
        if (this.transformControls.visible) {
            helpers.push(this.transformControls);
            this.transformControls.visible = false;
        }

        const fixed = this.sceneObjects.filter(o => o.isFixed || o.type === 'camera');
        fixed.forEach(o => { if (o.mesh && o.mesh.visible) { helpers.push(o.mesh); o.mesh.visible = false; }});
        if (this.floor && this.floor.visible) { helpers.push(this.floor); this.floor.visible = false; }

        let attachedObject = this.transformControls.object;
        if (attachedObject) this.transformControls.detach();

        const lights = this.sceneObjects.filter(o => ['pointlight', 'directionallight', 'spotlight'].includes(o.type));
        lights.forEach(l => {
            if (l.mesh && l.mesh.material) {
                l.mesh.material.visible = false;
            }
        });

        this.renderer.setSize(targetW, targetH, false);
        this.camera.aspect = targetW / targetH;
        this.camera.updateProjectionMatrix();

        const captureFrame = async () => {
            return new Promise(resolve => {
                requestAnimationFrame(() => {
                    this.renderer.render(this.scene, this.camera);
                    resolve(this.renderer.domElement.toDataURL("image/jpeg", 0.92));
                });
            });
        };

        const origOverride = this.scene.overrideMaterial;

        this.displayMode = "shaded";
        this.showWireframe = false;
        this.isDepthMode = false;
        
        const activeLights = [];
        lights.forEach(l => {
            const actualLight = l.mesh.isLight ? l.mesh : l.mesh.children.find(c => c.isLight);
            if (actualLight && actualLight.visible) {
                activeLights.push(actualLight);
                actualLight.visible = false;
            }
        });

        this.updateDisplayMode();
        const shaded64 = await captureFrame();
        
        activeLights.forEach(l => l.visible = true);

        this.displayMode = "textured";
        this.updateDisplayMode();
        const textured64 = await captureFrame();

        this.isDepthMode = true;
        this.updateDisplayMode();
        const depth64 = await captureFrame();

        this.isDepthMode = false;
        this.updateDisplayMode();
        const normalMat = new this.THREE.MeshNormalMaterial();
        this.scene.overrideMaterial = normalMat;
        const normal64 = await captureFrame();
        this.scene.overrideMaterial = origOverride;

        this.displayMode = origDisplayMode;
        this.showWireframe = origWireframe;
        this.isDepthMode = origDepth;
        this.updateDisplayMode();
        
        helpers.forEach(c => { c.visible = true; });
        lights.forEach(l => {
            if (l.mesh && l.mesh.material) {
                l.mesh.material.visible = true;
            }
        });
        if (attachedObject) this.transformControls.attach(attachedObject);

        this.renderer.setSize(origW, origH, false);
        this.camera.aspect = origAspect;
        this.camera.updateProjectionMatrix();

        const payload = {
            shaded: shaded64,
            textured: textured64,
            depth: depth64,
            normal: normal64
        };

        const wData = this.node.widgets?.find(w => w.name === "client_data");
        if (wData) {
            wData.value = JSON.stringify(payload);
        }

        btnEl.innerText = originalText;
        app.queuePrompt(0);
    }

    onResize(vpDiv) {
        if (!this.renderer || !vpDiv || !this.camera) return;
        const w = vpDiv.clientWidth;
        const h = vpDiv.clientHeight;
        if (w && h) {
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.updateResolutionGate();
        }
    }

    updateResolutionGate() {
        if (!this.gate) return;
        if (!this.showResolutionGate) {
            this.gate.style.display = "none";
            return;
        }

        let targetW = 512;
        let targetH = 512;
        if (this.node && this.node.widgets) {
            const ww = this.node.widgets.find(w => w.name === "width");
            const wh = this.node.widgets.find(w => w.name === "height");
            if (ww) targetW = ww.value;
            if (wh) targetH = wh.value;
        }

        const vpDiv = this.renderer.domElement.parentElement;
        const vw = vpDiv.clientWidth;
        const vh = vpDiv.clientHeight;

        const targetAspect = targetW / targetH;
        const viewAspect = vw / vh;

        let gw, gh;
        if (targetAspect > viewAspect) {
            gw = vw - 40; 
            gh = gw / targetAspect;
        } else {
            gh = vh - 40; 
            gw = gh * targetAspect;
        }

        this.gate.style.width = `${gw}px`;
        this.gate.style.height = `${gh}px`;
        this.gate.style.display = "block";
    }

    buildSizeReference() {
        const baseUrl = new URL(".", import.meta.url).href;
        const imgUrl = new URL("../images/human_silhouette.png", baseUrl).href;
        
        const textureLoader = new this.THREE.TextureLoader();
        textureLoader.load(imgUrl, (texture) => {
            const mat = new this.THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: true,
                depthWrite: false,
                sizeAttenuation: true
            });
            
            this.sizeRefSprite = new this.THREE.Sprite(mat);
            const aspect = texture.image.width / texture.image.height;
            this.sizeRefSprite.scale.set(1.68 * aspect, 1.68, 1);
            this.sizeRefSprite.position.set(0, 1.68 / 2, 0);
            this.sizeRefSprite.userData.isHelper = true;
            this.sizeRefSprite.visible = this.sizeRefVisible;
            this.sizeRefSprite.renderOrder = 999;
            this.scene.add(this.sizeRefSprite);
        }, undefined, (err) => {
            console.warn("[Yedp Blockout] Could not load silhouette:", err);
        });
    }

    toggleSizeReference() {
        this.sizeRefVisible = !this.sizeRefVisible;
        if (this.sizeRefSprite) this.sizeRefSprite.visible = this.sizeRefVisible;
    }

    setPivotMode(mode) {
        const obj = this.getSelectedObject();
        if (!obj || !obj.mesh) return;

        const m = obj.mesh;

        if (mode === 'center') {
            const box = new this.THREE.Box3().setFromObject(m);
            const center = box.getCenter(new this.THREE.Vector3());
            const offset = center.clone().sub(m.position);
            
            m.traverse(c => {
                if (c.isMesh && c.geometry) {
                    c.geometry.translate(-offset.x, -offset.y, -offset.z);
                }
            });
            m.position.copy(center);
        } else if (mode === 'origin') {
            const box = new this.THREE.Box3().setFromObject(m);
            const center = box.getCenter(new this.THREE.Vector3());
            const offset = center.clone().sub(m.position);
            
            if (offset.length() > 0.001) {
                m.traverse(c => {
                    if (c.isMesh && c.geometry) {
                        c.geometry.translate(-offset.x, -offset.y, -offset.z);
                    }
                });
                m.position.copy(center);
            }
        }

        if (this.transformControls.object === m) {
            this.transformControls.detach();
            this.transformControls.attach(m);
        }
        this.syncPropertiesPanel();
    }

    buildSnapControls(vpDiv) {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "absolute", bottom: "10px", left: "10px", zIndex: "100",
            background: "rgba(20,20,20,0.85)", padding: "8px", borderRadius: "6px",
            border: "1px solid #333", display: "flex", alignItems: "center", gap: "8px",
            fontSize: "11px"
        });

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = this.snapToGrid;
        chk.style.cursor = "pointer";
        chk.onchange = () => { this.snapToGrid = chk.checked; this.updateSnapping(); };

        const lbl = document.createElement("span");
        lbl.innerText = "Snap to Grid";
        lbl.style.color = "#ccc";

        const unitLbl = document.createElement("span");
        unitLbl.innerText = "Unit:";
        Object.assign(unitLbl.style, { color: "#888", fontSize: "10px" });

        const unitInp = document.createElement("input");
        unitInp.type = "number";
        unitInp.value = this.snapUnit;
        unitInp.step = "0.1";
        unitInp.min = "0.01";
        Object.assign(unitInp.style, {
            width: "45px", background: "#111", color: "#0f0", border: "1px solid #0f0",
            borderRadius: "3px", fontSize: "10px", padding: "2px 4px"
        });
        unitInp.onchange = () => { this.snapUnit = parseFloat(unitInp.value) || 0.5; this.updateSnapping(); };
        unitInp.addEventListener('keydown', e => e.stopPropagation());

        const rotLbl = document.createElement("span");
        rotLbl.innerText = "Rot:";
        Object.assign(rotLbl.style, { color: "#888", fontSize: "10px" });

        const rotInp = document.createElement("input");
        rotInp.type = "number";
        rotInp.value = this.snapRotation;
        rotInp.step = "5";
        rotInp.min = "1";
        Object.assign(rotInp.style, {
            width: "35px", background: "#111", color: "#0f0", border: "1px solid #0f0",
            borderRadius: "3px", fontSize: "10px", padding: "2px 4px"
        });
        rotInp.onchange = () => { this.snapRotation = parseFloat(rotInp.value) || 15; this.updateSnapping(); };
        rotInp.addEventListener('keydown', e => e.stopPropagation());

        const degLbl = document.createElement("span");
        degLbl.innerText = "°";
        degLbl.style.color = "#888";

        panel.append(chk, lbl, unitLbl, unitInp, rotLbl, rotInp, degLbl);
        vpDiv.appendChild(panel);
    }

    updateSnapping() {
        if (this.snapToGrid) {
            this.transformControls.setTranslationSnap(this.snapUnit);
            this.transformControls.setRotationSnap(this.snapRotation * (Math.PI / 180));
            this.transformControls.setScaleSnap(this.snapUnit);
        } else {
            this.transformControls.setTranslationSnap(null);
            this.transformControls.setRotationSnap(null);
            this.transformControls.setScaleSnap(null);
        }
    }

    // =========================================================================
    // CREATION PANEL (BOTTOM) - REDESIGNED
    // =========================================================================

    buildCreationPanel(panelDiv) {
        // --- NEW SVG ICONS FOR CATEGORIES ---
        const icons = {
            basic: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
            lighting: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
            architecture: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M7 11h2M15 11h2M7 15h2M15 15h2"/></svg>`,
            vehicle: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`,
            furniture: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h20v4H2z"/><path d="M2 12v8"/><path d="M22 12v8"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>`,
            props: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
            plants: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
            food: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`
        };

        const categories = [
            { id: "basic", label: "BASIC SHAPES", icon: icons.basic },
            { id: "lighting", label: "LIGHTING", icon: icons.lighting },
            { id: "architecture", label: "ARCHITECTURE", icon: icons.architecture },
            { id: "vehicle", label: "VEHICLES", icon: icons.vehicle },
            { id: "furniture", label: "FURNITURE", icon: icons.furniture },
            { id: "props", label: "PROPS", icon: icons.props },
            { id: "plants", label: "PLANTS", icon: icons.plants },
            { id: "food", label: "FOOD", icon: icons.food }
        ];

        // --- TABS BAR ---
        const tabsRow = document.createElement("div");
        Object.assign(tabsRow.style, {
            display: "flex", background: "#222", borderBottom: "1px solid #333",
            justifyContent: "space-between", alignItems: "stretch"
        });
        panelDiv.appendChild(tabsRow);

        const leftTabs = document.createElement("div");
        Object.assign(leftTabs.style, { display: "flex", overflowX: "auto", flex: "1" });
        tabsRow.appendChild(leftTabs);

        this.tabButtons = {};
        this.contentPanes = {};

        // Action Buttons on Right
        const rightTabs = document.createElement("div");
        Object.assign(rightTabs.style, { display: "flex", alignItems: "center", paddingRight: "8px" });

        const importBtn = document.createElement("button");
        importBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm7-18L5.33 8.67h4V14h5.34V8.67h4L12 2z"/></svg>`;
        importBtn.title = "Import GLB / GLTF / FBX";
        Object.assign(importBtn.style, {
            background: "transparent", color: "#0f0", border: "1px solid #333", borderRadius: "4px",
            padding: "4px 8px", cursor: "pointer", transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center", marginRight: "8px"
        });
        importBtn.onmouseover = () => { importBtn.style.background = "#333"; };
        importBtn.onmouseout = () => { importBtn.style.background = "transparent"; };

        const fileIn = document.createElement("input");
        fileIn.type = "file";
        fileIn.accept = ".glb,.gltf,.fbx";
        fileIn.style.display = "none";
        fileIn.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            const ext = file.name.split('.').pop().toLowerCase();
            
            if (ext === 'fbx') {
                const loader = new this.FBXLoader();
                loader.load(url, (fbx) => { this.addObject("imported", fbx, file.name); });
            } else {
                const loader = new this.GLTFLoader();
                loader.load(url, (gltf) => { this.addObject("imported", gltf.scene, file.name); });
            }
        };
        importBtn.onclick = () => fileIn.click();

        const exportBtn = document.createElement("button");
        exportBtn.innerText = "Export to Graph";
        Object.assign(exportBtn.style, {
            background: "transparent", color: "#00d2ff", border: "1px solid #333", borderRadius: "4px",
            padding: "4px 12px", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase",
            cursor: "pointer", transition: "all 0.1s"
        });
        exportBtn.onmouseover = () => { exportBtn.style.background = "#333"; };
        exportBtn.onmouseout = () => { exportBtn.style.background = "transparent"; };
        exportBtn.onclick = () => this.exportGLB();

        rightTabs.appendChild(fileIn);
        rightTabs.appendChild(importBtn);
        rightTabs.appendChild(exportBtn);
        tabsRow.appendChild(rightTabs);

        // --- BUILD TABS AND PANES ---
        categories.forEach((cat, index) => {
            // Tab Button
            const tabBtn = document.createElement("div");
            Object.assign(tabBtn.style, {
                padding: "6px 16px", background: index === 0 ? "#2b3035" : "transparent", 
                borderBottom: index === 0 ? "2px solid #00d2ff" : "2px solid transparent",
                color: index === 0 ? "#fff" : "#888", fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", 
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                transition: "all 0.1s"
            });
            
            tabBtn.innerHTML = `<div>${cat.icon}</div><div>${cat.label}</div>`;
            leftTabs.appendChild(tabBtn);
            this.tabButtons[cat.id] = tabBtn;

            // Content Pane
            const pane = document.createElement("div");
            Object.assign(pane.style, {
                flex: "1", display: index === 0 ? "flex" : "none", flexWrap: "wrap", alignContent: "flex-start",
                padding: "8px 12px", gap: "8px", overflowY: "auto", overflowX: "hidden"
            });
            panelDiv.appendChild(pane);
            this.contentPanes[cat.id] = pane;

            // Click Handler
            tabBtn.onclick = () => {
                Object.values(this.tabButtons).forEach(b => {
                    b.style.background = "transparent";
                    b.style.borderBottomColor = "transparent";
                    b.style.color = "#888";
                });
                Object.values(this.contentPanes).forEach(p => p.style.display = "none");
                
                tabBtn.style.background = "#2b3035";
                tabBtn.style.borderBottomColor = "#00d2ff";
                tabBtn.style.color = "#fff";
                pane.style.display = "flex";
            };

            // Populate logic
            if (cat.id === "basic" || cat.id === "lighting") {
                this.populateCoreAssets(cat.id, pane);
            } else {
                this.populateCustomAssets(cat.id, pane);
            }
        });
    }

    populateCustomAssets(category, targetDiv) {
        const files = this.availableAssets[category] || [];
        
        if (files.length === 0) {
            const emptyMsg = document.createElement("div");
            emptyMsg.innerText = `No .glb templates found in web/blockout/${category}/`;
            Object.assign(emptyMsg.style, { color: "#555", fontSize: "11px", fontStyle: "italic", padding: "10px" });
            targetDiv.appendChild(emptyMsg);
            return;
        }

        files.forEach(filename => {
            const btn = document.createElement("div");
            Object.assign(btn.style, {
                background: "#222", color: "#ccc", border: "1px solid #444",
                borderRadius: "6px", cursor: "pointer", fontSize: "10px", fontWeight: "bold",
                transition: "all 0.1s", display: "flex", flexDirection: "column",
                alignItems: "center", overflow: "hidden", width: "70px", flexShrink: "0"
            });

            const iconArea = document.createElement("div");
            Object.assign(iconArea.style, {
                width: "70px", height: "50px", display: "flex", alignItems: "center",
                justifyContent: "center", background: "#2a2a2a", overflow: "hidden"
            });
            
            // Generate path for the thumbnail based on the .glb filename
            const baseName = filename.substring(0, filename.lastIndexOf('.'));
            const baseUrl = new URL(".", import.meta.url).href;
            const thumbUrl = new URL(`../blockout/${category}/${baseName}.png`, baseUrl).href;

            const fallbackSVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#00d2ff" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`;

            // Try to load the .png thumbnail
            const img = document.createElement("img");
            img.src = thumbUrl;
            Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
            
            // If the thumbnail file doesn't exist, safely fallback to the generic icon
            img.onerror = () => {
                iconArea.innerHTML = fallbackSVG;
            };
            
            iconArea.appendChild(img);
            btn.appendChild(iconArea);

            const lbl = document.createElement("div");
            lbl.innerText = filename.split('.')[0].substring(0, 10); // Truncate visually
            lbl.title = filename;
            Object.assign(lbl.style, { 
                padding: "4px", width: "100%", textAlign: "center", background: "#1a1a1a", 
                borderTop: "1px solid #444", boxSizing: "border-box", overflow: "hidden", 
                textOverflow: "ellipsis", whiteSpace: "nowrap" 
            });
            btn.appendChild(lbl);

            btn.onmouseover = () => { btn.style.borderColor = "#00d2ff"; btn.style.transform = "translateY(-2px)"; lbl.style.color = "#00d2ff"; };
            btn.onmouseout = () => { btn.style.borderColor = "#444"; btn.style.transform = "none"; lbl.style.color = "#ccc"; };
            btn.onclick = () => this.loadCategoryAsset(category, filename);

            targetDiv.appendChild(btn);
        });
    }

    populateCoreAssets(category, targetRow) {
        const prevSize = 80;
        const prevRenderer = new this.THREE.WebGLRenderer({ alpha: true, antialias: true });
        prevRenderer.setSize(prevSize, prevSize);
        const prevScene = new this.THREE.Scene();
        const prevCamera = new this.THREE.PerspectiveCamera(45, 1, 0.1, 100);
        prevCamera.position.set(3, 2.5, 4);
        prevCamera.lookAt(0, 0, 0);
        
        const prevLight1 = new this.THREE.DirectionalLight(0xffffff, 1.0);
        prevLight1.position.set(2, 3, 4);
        const prevLight2 = new this.THREE.AmbientLight(0xffffff, 0.6);
        prevScene.add(prevLight1, prevLight2);

        const renderPreviewToCanvas = (meshParams) => {
            const toRemove = [];
            prevScene.traverse(c => { if (c.isMesh) toRemove.push(c); });
            toRemove.forEach(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
                prevScene.remove(c);
            });
            
            let geo;
            const mat = new this.THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.3, metalness: 0.1 });
            if (meshParams.type === 'cube') geo = new this.THREE.BoxGeometry(1.5, 1.5, 1.5);
            else if (meshParams.type === 'plane') geo = new this.THREE.PlaneGeometry(2, 2);
            else if (meshParams.type === 'sphere') geo = new this.THREE.SphereGeometry(1, 32, 16);
            else if (meshParams.type === 'cone') geo = new this.THREE.ConeGeometry(1, 2, 32);
            else if (meshParams.type === 'cylinder') geo = new this.THREE.CylinderGeometry(0.8, 0.8, 2, 32);
            else if (meshParams.type === 'pipe') {
                const shape = new this.THREE.Shape();
                shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
                const hole = new this.THREE.Path();
                hole.absarc(0, 0, 0.8, 0, Math.PI * 2, true);
                shape.holes.push(hole);
                geo = new this.THREE.ExtrudeGeometry(shape, { depth: 2, curveSegments: 32, bevelEnabled: false });
                geo.translate(0, 0, -1);
            } else if (meshParams.type === 'torus') geo = new this.THREE.TorusGeometry(0.8, 0.3, 16, 64);
            else return null;
            
            const mesh = new this.THREE.Mesh(geo, mat);
            if (meshParams.type === 'plane') mesh.rotation.x = -Math.PI / 2;
            prevScene.add(mesh);
            
            prevRenderer.render(prevScene, prevCamera);
            
            const canvas2d = document.createElement('canvas');
            canvas2d.width = prevSize;
            canvas2d.height = prevSize;
            const ctx = canvas2d.getContext('2d');
            ctx.drawImage(prevRenderer.domElement, 0, 0);
            return canvas2d;
        };

        const createAssetBtn = (label, type, isLight=false) => {
            const btn = document.createElement("div");
            Object.assign(btn.style, {
                background: "#222", color: "#ccc", border: "1px solid #444",
                borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: "bold",
                transition: "all 0.1s", display: "flex", flexDirection: "column",
                alignItems: "center", overflow: "hidden", width: "70px", flexShrink: "0"
            });
            
            if (!isLight) {
                const canvas = renderPreviewToCanvas({ type });
                if (canvas) {
                    canvas.style.width = "70px";
                    canvas.style.height = "50px";
                    canvas.style.objectFit = "cover";
                    btn.appendChild(canvas);
                } else {
                    const ph = document.createElement("div");
                    Object.assign(ph.style, { width: "70px", height: "50px", background: "#2a2a2a" });
                    btn.appendChild(ph);
                }
            } else {
                const icon = document.createElement("div");
                const svgLight = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffcc00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
                icon.innerHTML = svgLight;
                Object.assign(icon.style, { width: "70px", height: "50px", display: "flex", alignItems: "center", justifyContent: "center", background: "#2a2a2a" });
                btn.appendChild(icon);
            }

            const lbl = document.createElement("div");
            lbl.innerText = label;
            Object.assign(lbl.style, { padding: "4px", width: "100%", textAlign: "center", background: "#1a1a1a", borderTop: "1px solid #444", boxSizing: "border-box" });
            btn.appendChild(lbl);

            btn.onmouseover = () => { btn.style.borderColor = "#00d2ff"; btn.style.transform = "translateY(-2px)"; lbl.style.color = "#00d2ff"; };
            btn.onmouseout = () => { btn.style.borderColor = "#444"; btn.style.transform = "none"; lbl.style.color = "#ccc"; };
            btn.onclick = () => this.addObject(type);
            targetRow.appendChild(btn);
        };

        if (category === "basic") {
            createAssetBtn("Cube", "cube");
            createAssetBtn("Plane", "plane");
            createAssetBtn("Sphere", "sphere");
            createAssetBtn("Cone", "cone");
            createAssetBtn("Cylinder", "cylinder");
            createAssetBtn("Pipe", "pipe");
            createAssetBtn("Torus", "torus");
        } else if (category === "lighting") {
            createAssetBtn("Point", "pointlight", true);
            createAssetBtn("Dir", "directionallight", true);
            createAssetBtn("Spot", "spotlight", true);
        }
        
        prevRenderer.dispose();
    }

    showModal(title, contentHtml, onConfirm) {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex",
            alignItems: "center", justifyContent: "center"
        });

        const modal = document.createElement("div");
        Object.assign(modal.style, {
            background: "#222", padding: "16px", borderRadius: "8px",
            border: "1px solid #444", minWidth: "300px", display: "flex", flexDirection: "column", gap: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        });

        const titleEl = document.createElement("div");
        titleEl.innerText = title;
        Object.assign(titleEl.style, { color: "#fff", fontWeight: "bold", fontSize: "14px" });
        
        const contentContainer = document.createElement("div");
        contentContainer.innerHTML = contentHtml;
        
        const btnRow = document.createElement("div");
        Object.assign(btnRow.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" });
        
        const btnCancel = document.createElement("button");
        btnCancel.innerText = "Cancel";
        btnCancel.onclick = () => overlay.remove();
        Object.assign(btnCancel.style, { background: "#444", color: "#fff", border: "none", padding: "6px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" });
        
        const btnOk = document.createElement("button");
        btnOk.innerText = "OK";
        btnOk.onclick = () => { if(onConfirm(modal) !== false) overlay.remove(); };
        Object.assign(btnOk.style, { background: "#00d2ff", color: "#000", border: "none", padding: "6px 16px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" });
        
        btnRow.append(btnCancel, btnOk);
        modal.append(titleEl, contentContainer, btnRow);
        overlay.appendChild(modal);
        this.container.appendChild(overlay);
        
        const firstInput = modal.querySelector('input, select');
        if (firstInput) firstInput.focus();
    }

    exportGLB() {
        if (!this.THREE || !this.GLTFExporter) return;
        
        console.log("[Yedp Blockout] Exporting GLB...");
        
        const exportScene = new this.THREE.Scene();
        
        this.sceneObjects.forEach(obj => {
            if (!obj.visible) return;
            if (obj.isFixed) return; 
            if (obj.type === 'pointlight' || obj.type === 'directionallight' || obj.type === 'spotlight') return; 
            
            const clone = obj.mesh.clone();

            const overlays = [];
            clone.traverse(c => {
                if (c.userData && c.userData.isWireframeOverlay) overlays.push(c);
            });
            overlays.forEach(c => {
                if (c.parent) c.parent.remove(c);
            });

            clone.traverse(c => {
                if (c.userData) {
                    const safe = {};
                    for (let key in c.userData) {
                        const val = c.userData[key];
                        if (val && val.isMaterial) continue; 
                        if (val && Array.isArray(val) && val[0] && val[0].isMaterial) continue;
                        if (key === 'wireframeMeshList') continue;
                        safe[key] = val;
                    }
                    c.userData = safe;
                }
            });

            exportScene.add(clone);
        });

        this.showModal(
            "Export GLB to Action Director",
            `<input id="export-filename" type="text" value="Yedp_Blockout" style="width:100%; padding:6px; background:#111; color:#0f0; border:1px solid #0f0; border-radius:4px; box-sizing:border-box;">`,
            (modal) => {
                const filename = modal.querySelector("#export-filename").value.trim();
                if (!filename) return false;
                
                const exporter = new this.GLTFExporter();
                exporter.parse(
                    exportScene,
                    async (gltf) => {
                        const blob = new Blob([gltf], { type: 'application/octet-stream' });
                        const formData = new FormData();
                        formData.append('subfolder', 'yedp_envs');
                        formData.append('file', blob, filename + '.glb');

                        try {
                            const response = await fetch('/yedp/upload_asset', {
                                method: 'POST',
                                body: formData
                            });
                            if (response.ok) {
                                console.log("[Yedp Blockout] Export complete. Saved to yedp_envs.");
                                alert(`Successfully exported to yedp_envs/${filename}.glb!`);
                            } else {
                                throw new Error(await response.text());
                            }
                        } catch (e) {
                            console.error("[Yedp Blockout] Upload failed:", e);
                            alert("Export failed: " + e.message);
                        }
                    },
                    (error) => {
                        console.error('[Yedp Blockout] GLTF export error:', error);
                    },
                    { binary: true }
                );
            }
        );
    }

    async saveScene() {
        this.showModal(
            "Save Scene",
            `<input id="scene-name" type="text" value="MyScene" style="width:100%; padding:6px; background:#111; color:#0f0; border:1px solid #0f0; border-radius:4px; box-sizing:border-box;">`,
            (modal) => {
                const name = modal.querySelector("#scene-name").value.trim();
                if (!name) return false;

                const origDisplayMode = this.displayMode;
                const origWireframe = this.showWireframe;
                const origDepth = this.isDepthMode;

                this.displayMode = 'textured';
                this.showWireframe = false;
                this.isDepthMode = false;
                this.updateDisplayMode();

                const exportScene = new this.THREE.Scene();
                this.sceneObjects.forEach(obj => {
                    if (!obj.visible || obj.isFixed) return;
                    if (obj.type === 'pointlight' || obj.type === 'directionallight' || obj.type === 'spotlight') return; 
                    const clone = obj.mesh.clone();
                    
                    const overlays = [];
                    clone.traverse(c => {
                        if (c.userData && c.userData.isWireframeOverlay) overlays.push(c);
                    });
                    overlays.forEach(c => {
                        if (c.parent) c.parent.remove(c);
                    });

                    clone.traverse(c => {
                        if (c.userData) {
                            const safe = {};
                            for (let key in c.userData) {
                                const val = c.userData[key];
                                if (val && val.isMaterial) continue; 
                                if (val && Array.isArray(val) && val[0] && val[0].isMaterial) continue;
                                if (key === 'wireframeMeshList') continue;
                                safe[key] = val;
                            }
                            c.userData = safe;
                        }
                    });

                    clone.userData.blockoutType = obj.type;
                    clone.userData.blockoutName = obj.name;

                    exportScene.add(clone);
                });
                
                const exporter = new this.GLTFExporter();
                exporter.parse(
                    exportScene,
                    async (gltf) => {
                        this.displayMode = origDisplayMode;
                        this.showWireframe = origWireframe;
                        this.isDepthMode = origDepth;
                        this.updateDisplayMode();

                        const lightData = [];
                        this.sceneObjects.forEach(obj => {
                            if (obj.visible && !obj.isFixed && ['pointlight', 'directionallight', 'spotlight'].includes(obj.type)) {
                                const actualLight = obj.mesh.isLight ? obj.mesh : obj.mesh.children.find(c => c.isLight);
                                if (actualLight) {
                                    lightData.push({
                                        type: obj.type,
                                        name: obj.name,
                                        color: actualLight.color.getHex(),
                                        intensity: actualLight.intensity,
                                        position: obj.mesh.position.toArray(),
                                        distance: actualLight.distance,
                                        angle: actualLight.angle,
                                        penumbra: actualLight.penumbra,
                                        decay: actualLight.decay
                                    });
                                }
                            }
                        });

                        gltf.asset = gltf.asset || {};
                        gltf.asset.extras = {
                            cameraPos: this.camera.position.toArray(),
                            cameraTarget: this.controls.target.toArray(),
                            lights: lightData,
                            isDepthMode: this.isDepthMode, 
                            depthNear: this.depthNear,
                            depthFar: this.depthFar,
                            displayMode: this.displayMode,
                            showWireframe: this.showWireframe
                        };

                        const res = await fetch("/yedp/save_scene", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: name, data: gltf })
                        });
                        const resData = await res.json();
                        if (resData.status === "success") {
                            alert(`Scene "${name}" saved successfully!`);
                        } else {
                            alert("Error saving scene: " + resData.message);
                        }
                    },
                    (err) => {
                        this.displayMode = origDisplayMode;
                        this.showWireframe = origWireframe;
                        this.isDepthMode = origDepth;
                        this.updateDisplayMode();
                        console.error(err);
                    },
                    { binary: false } 
                );
            }
        );
    }

    async loadScene() {
        const res = await fetch("/yedp/get_scenes");
        const data = await res.json();
        const files = data.files || [];
        if (files.length === 0) {
            alert("No saved scenes found in input/yedp_blockout.");
            return;
        }

        const options = files.map(f => `<option value="${f}">${f}</option>`).join('');
        this.showModal(
            "Load Scene",
            `<select id="scene-select" style="width:100%; padding:6px; background:#111; color:#0f0; border:1px solid #0f0; border-radius:4px; box-sizing:border-box;">${options}</select>`,
            (modal) => {
                const name = modal.querySelector("#scene-select").value;
                if (!name) return false;

                const url = `/view?filename=${name}&type=input&subfolder=yedp_blockout&t=${Date.now()}`;
                
                const loader = new this.GLTFLoader();
                loader.load(url, (gltf) => {
                    this.selectObjectById(null);

                    const toDelete = this.sceneObjects.filter(o => !o.isFixed).map(o => o.id);
                    toDelete.forEach(id => this.deleteObject(id));

                    const children = [...gltf.scene.children];
                    children.forEach(child => {
                        gltf.scene.remove(child);
                        child.userData.isSceneLoad = true;
                        const type = child.userData.blockoutType || "imported";
                        const bname = child.userData.blockoutName || child.name || "Loaded_Obj";
                        this.addObject(type, child, bname, false); 
                    });

                    let ex = null;
                    if (gltf.parser && gltf.parser.json && gltf.parser.json.asset && gltf.parser.json.asset.extras) {
                        ex = gltf.parser.json.asset.extras;
                    } else if (gltf.asset && gltf.asset.extras) {
                        ex = gltf.asset.extras;
                    } else if (gltf.scenes && gltf.scenes[0] && gltf.scenes[0].userData) {
                        ex = gltf.scenes[0].userData;
                    } else if (gltf.scene && gltf.scene.userData) {
                        ex = gltf.scene.userData;
                    } else if (gltf.scenes && gltf.scenes[0] && gltf.scenes[0].extras) {
                        ex = gltf.scenes[0].extras; 
                    }

                    if (ex) {
                        if (ex.cameraPos) this.camera.position.fromArray(ex.cameraPos);
                        if (ex.cameraTarget) this.controls.target.fromArray(ex.cameraTarget);
                        this.controls.update();

                        if (ex.lights && Array.isArray(ex.lights)) {
                            ex.lights.forEach(l => {
                                const entry = this.addObject(l.type, null, null, false);
                                if (!entry) return;
                                if (l.name) entry.name = l.name;
                                entry.mesh.position.fromArray(l.position);
                                const actualLight = entry.mesh.children.find(c => c.isLight);
                                if (actualLight) {
                                    actualLight.color.setHex(l.color);
                                    actualLight.intensity = l.intensity;
                                    if (l.distance !== undefined) actualLight.distance = l.distance;
                                    if (l.angle !== undefined) actualLight.angle = l.angle;
                                    if (l.penumbra !== undefined) actualLight.penumbra = l.penumbra;
                                    if (l.decay !== undefined) actualLight.decay = l.decay;
                                }
                            });
                        }

                        if (ex.isDepthMode !== undefined) this.isDepthMode = ex.isDepthMode;
                        if (ex.depthNear !== undefined) this.depthNear = ex.depthNear;
                        if (ex.depthFar !== undefined) this.depthFar = ex.depthFar;
                        if (ex.displayMode !== undefined) this.displayMode = ex.displayMode;
                        if (ex.showWireframe !== undefined) this.showWireframe = ex.showWireframe;

                        if (this.propInputs.depthCheck) this.propInputs.depthCheck.checked = this.isDepthMode;
                        if (this.propInputs.depthNear) this.propInputs.depthNear.value = this.depthNear;
                        if (this.propInputs.depthFar) this.propInputs.depthFar.value = this.depthFar;
                    }

                    setTimeout(() => {
                        if (this.updateToolbarUI) {
                            this.updateToolbarUI();
                        } else {
                            this.updateDisplayMode();
                        }
                    }, 50);
                });
            }
        );
    }

    animate() {
        if (!this.renderer) return;
        requestAnimationFrame(() => this.animate());

        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this._handleKeyDown) window.removeEventListener('keydown', this._handleKeyDown);
        if (this.resizeObserver) this.resizeObserver.disconnect();

        this.sceneObjects.forEach(entry => {
            this.scene.remove(entry.mesh);
            if (entry.mesh.geometry) entry.mesh.geometry.dispose();
            if (entry.mesh.material) {
                if (Array.isArray(entry.mesh.material)) entry.mesh.material.forEach(m => m.dispose());
                else entry.mesh.material.dispose();
            }
        });
        this.sceneObjects = [];

        if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
    }
}

app.registerExtension({
    name: "Yedp.Blockout",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "YedpBlockout") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                if (this.widgets) {
                    for (let w of this.widgets) {
                        if (w.name === "info") {
                            w.computeSize = () => [0, -4];
                            if (w.element) w.element.style.display = "none";
                        }
                        if (w.name === "client_data") {
                            w.computeSize = () => [0, -4];
                            if (w.element) w.element.style.display = "none";
                        }
                        if (w.name === "width" || w.name === "height") {
                            const origCallback = w.callback;
                            w.callback = function (val) {
                                if (origCallback) origCallback.call(this, val);
                                if (this.blockoutVp) {
                                    this.blockoutVp.updateResolutionGate();
                                }
                            }.bind(this);
                        }
                    }
                }

                const container = document.createElement("div");
                container.classList.add("blockout-container");
                container.style.width = "100%";
                container.style.height = "100%";
                container.style.overflow = "hidden";
                container.style.borderRadius = "8px";

                const widget = this.addDOMWidget("blockout_viewport", "blockout_vp", container, {
                    serialize: false, hideOnZoom: false
                });

                setTimeout(() => {
                    const vp = new BlockoutViewport(this, container);
                    this.blockoutVp = vp;
                }, 100);

                this.setSize([600, 500]);

                this.onRemoved = function () {
                    if (this.blockoutVp) {
                        this.blockoutVp.destroy();
                    }
                };
                return r;
            };
        }
    }
});

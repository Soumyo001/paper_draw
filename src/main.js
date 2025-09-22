import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import gsap from 'gsap';

// ---------- Scene, Camera, Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
const clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = true;
controls.mouseButtons = {
  LEFT: null,
  RIGHT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN
};

// ---------- Lights ----------
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// ---------- Loader ----------
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const fontLoader = new FontLoader();

// ---------- Paper ----------
const paperTexture = textureLoader.load(
  '/paper.jpg',
  () => {
    for (let i = 0; i < 5; i++) createLayer();
    updatePaperMaterial();
    refreshLayerUI();
  }
);
paperTexture.wrapS = paperTexture.wrapT = THREE.RepeatWrapping;
paperTexture.minFilter = THREE.LinearFilter;

const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 7),
    new THREE.MeshStandardMaterial({ map: paperTexture })
);
paper.rotation.x = -Math.PI / 2;
scene.add(paper);

// ---------- Layers ----------
const layerContainer = document.createElement('div');
layerContainer.style.position = 'absolute';
layerContainer.style.top = '10px';
layerContainer.style.left = '10px';
layerContainer.style.zIndex = '1000';
layerContainer.style.fontFamily = 'sans-serif';
document.body.appendChild(layerContainer);
const layers = [];
let activeLayerIndex = 0;

function createLayer(name = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)'; // transparent background for blending
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    const layer = { canvas, ctx, texture, name: name || `Layer ${layers.length + 1}` };
    layers.push(layer);
    return layers.length - 1;
}

function deleteLayer(index) {
    if (layers.length <= 1) return;
    layers.splice(index, 1);
    if (activeLayerIndex >= layers.length) activeLayerIndex = layers.length - 1;
    updatePaperMaterial();
    refreshLayerUI();
}

// ---------- Layer UI ----------
function refreshLayerUI() {
    layerContainer.innerHTML = '';
    layers.forEach((layer, i) => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.marginBottom = '6px';

        const btn = document.createElement('button');
        btn.innerText = layer.name;
        btn.style.marginRight = '6px';
        btn.style.padding = '6px';
        btn.style.background = (i === activeLayerIndex) ? '#d0d0d0' : '#fff';
        btn.addEventListener('click', () => {
            activeLayerIndex = i;
            updatePaperMaterial();
            refreshLayerUI();
        });
        wrapper.appendChild(btn);

        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑';
        delBtn.title = 'Delete layer';
        delBtn.style.marginRight = '6px';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteLayer(i);
        });
        wrapper.appendChild(delBtn);

        const rename = document.createElement('input');
        rename.value = layer.name;
        rename.style.width = '120px';
        rename.addEventListener('input', () => {
            layer.name = rename.value;
            btn.innerText = layer.name;
        });
        wrapper.appendChild(rename);

        layerContainer.appendChild(wrapper);
    });

    const addBtn = document.createElement('button');
    addBtn.innerText = '+ Add Layer';
    addBtn.style.display = 'block';
    addBtn.style.marginTop = '6px';
    addBtn.addEventListener('click', () => {
        const idx = createLayer();
        activeLayerIndex = idx;
        updatePaperMaterial();
        refreshLayerUI();
    });
    layerContainer.appendChild(addBtn);
}
refreshLayerUI();

// ---------- Combine paper + layer texture ----------
function getCombinedTexture(layer) {
    if (!paperTexture.image) return layer.texture;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(paperTexture.image, 0, 0, canvas.width, canvas.height);

    ctx.drawImage(layer.canvas, 0, 0, canvas.width, canvas.height);

    return new THREE.CanvasTexture(canvas);
}

function updatePaperMaterial() {
    if (!layers || layers.length === 0) return;
    const layer = layers[activeLayerIndex];
    paper.material.map = getCombinedTexture(layer);
    paper.material.needsUpdate = true;
}

// ---------- Pen Holder ----------
let holderMesh;
loader.load('/pen_holder2.glb', gltf => {
  holderMesh = gltf.scene;
  holderMesh.position.set(-6, 0, 0);
  holderMesh.scale.set(8, 8, 8);
  scene.add(holderMesh);
  updateInteractables();
});

// ---------- Pens ----------
const pens = [];
let activePen = null;
const penColors = ['red', 'green', 'blue', 'black'];

function slotPosition(index, total, radius = 0.3, heightOffset = 0) {
  if (!holderMesh) return { x: 0, y: 0.2, z: 0 };
  const angle = (index / total) * Math.PI * 2;
  const pos = holderMesh.position;
  return {
    x: pos.x + Math.cos(angle) * radius,
    y: pos.y + heightOffset,
    z: pos.z + Math.sin(angle) * radius
  };
}

function setupPens() {
  loader.load('/pen.glb', gltf => {
    penColors.forEach((color, i) => {
      const pen = gltf.scene.clone(true);
      pen.traverse(child => {
        if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color });
      });
      pen.scale.set(0.3, 0.3, 0.3);
      const slot = slotPosition(i, penColors.length);
      pen.position.set(slot.x, slot.y, slot.z);
      scene.add(pen);
      pens.push({ mesh: pen, color });
    });
    updateInteractables();
  });
}
setupPens();

// ---------- Eraser ----------
let eraserMesh = null;
let eraserOriginalPos = new THREE.Vector3();
const eraserHolderSize = 1;
const eraserHolderOffset = { x: -6, z: -3 };
const eraserHolderGeometry = new THREE.PlaneGeometry(eraserHolderSize, eraserHolderSize);
const eraserHolderMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
const eraserHolderSquare = new THREE.Mesh(eraserHolderGeometry, eraserHolderMaterial);
eraserHolderSquare.rotation.x = -Math.PI / 2;
eraserHolderSquare.position.set(
  paper.position.x + eraserHolderOffset.x,
  paper.position.y + 0.01,
  paper.position.z + eraserHolderOffset.z
);
scene.add(eraserHolderSquare);

let eraserMode = false;

function setupEraser() {
  loader.load('/eraser.glb', gltf => {
    eraserMesh = gltf.scene;
    eraserMesh.scale.set(0.008, 0.006, 0.02);
    eraserOriginalPos.set(
      eraserHolderSquare.position.x,
      eraserHolderSquare.position.y + 0.19,
      eraserHolderSquare.position.z - 0.15
    );
    eraserMesh.position.copy(eraserOriginalPos);
    scene.add(eraserMesh);
    updateInteractables();
  });
}
setupEraser();

// ---------- Raycaster ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let interactables = [];

function updateInteractables() {
  interactables = [...pens.map(p => p.mesh), holderMesh, eraserMesh, eraserHolderSquare].filter(Boolean);
}

function getRootPen(obj) {
  for (const pen of pens) {
    if (pen.mesh === obj || pen.mesh.getObjectById(obj.id)) return pen;
  }
  return null;
}

// ---------- Pen Flex / Wobble ----------
const penFlex = { maxCompress: 0.05, speed: 0.1, maxWobble: 0.05 };

// ---------- Pointer Events ----------
let isDrawing = false;
let lastPointerPos = null;
const smoothedPos = new THREE.Vector3();

renderer.domElement.addEventListener('pointerdown', event => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactables, true);

  if (intersects.length > 0) {
    const obj = intersects[0].object;

    if (eraserMesh && (obj === eraserMesh || obj === eraserHolderSquare || eraserMesh.getObjectById(obj.id)) && !activePen) {
      eraserMode = !eraserMode;
      if (!eraserMode) {
        gsap.to(eraserMesh.position, {
            x: eraserOriginalPos.x,
            y: eraserOriginalPos.y,
            z: eraserOriginalPos.z,
            duration: 0.5,
            ease: "power2.inOut"
        });
        gsap.to(eraserMesh.rotation, {
            x: 0,
            z: 0,
            duration: 0.5,
            ease: "power2.inOut"
        });
      }
      return;
    }

    if (eraserMode) return;

    const penData = getRootPen(obj);
    const isHolderClicked = holderMesh && (obj === holderMesh || holderMesh.getObjectById(obj.id));

    if (penData && !activePen) {
      activePen = penData;
      gsap.to(activePen.mesh.position, { x: 0, y: 2, z: 0, duration: 0.5, ease: "power2.out" });
    } else if (isHolderClicked && activePen) {
      const slot = slotPosition(pens.indexOf(activePen), pens.length);
      gsap.to(activePen.mesh.position, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        duration: 0.5,
        ease: "power2.inOut",
        onComplete: () => { activePen = null; }
      });
    }
  }

  const paperIntersects = raycaster.intersectObject(paper);
  if (paperIntersects.length > 0 && (activePen || eraserMode)) {
    isDrawing = true;
    lastPointerPos = {
      pos: paperIntersects[0].point.clone(),
      uv: paperIntersects[0].uv.clone()
    };
    smoothedPos.copy(lastPointerPos.pos); 
  }
});

renderer.domElement.addEventListener('pointerup', () => {
  isDrawing = false;
  if (activePen) {
    gsap.to(activePen.mesh.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.2, ease: "power2.out" });
  }
});

// ---------- Drawing / Erasing ----------
renderer.domElement.addEventListener('pointermove', event => {
    if (!isDrawing) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(paper);
    if (intersects.length === 0) return;

    const p = intersects[0].point;
    const uv = intersects[0].uv;
    const layer = layers[activeLayerIndex];

    if (activePen) {
        // smoothing
        smoothedPos.lerpVectors(smoothedPos, p, 0.2);

        const distance = lastPointerPos.pos.distanceTo(smoothedPos);
        const speed = distance / 0.016;
        const radius = THREE.MathUtils.clamp(6 / (speed + 1), 1.5, 4);

        const steps = Math.ceil(lastPointerPos.uv.distanceTo(uv) * layer.canvas.width * 2) || 1;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const interpU = lastPointerPos.uv.x + (uv.x - lastPointerPos.uv.x) * t;
            const interpV = lastPointerPos.uv.y + (uv.y - lastPointerPos.uv.y) * t;
            const px = interpU * layer.canvas.width;
            const py = (1 - interpV) * layer.canvas.height;

            const bleedRadius = radius;
            const g = layer.ctx.createRadialGradient(px, py, Math.max(1, bleedRadius * 0.15), px, py, bleedRadius);
            g.addColorStop(0, activePen.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');

            const prevOp = layer.ctx.globalCompositeOperation;
            const prevAlpha = layer.ctx.globalAlpha;
            layer.ctx.globalCompositeOperation = 'source-over';
            layer.ctx.globalAlpha = 1.0;
            layer.ctx.fillStyle = g;
            layer.ctx.beginPath();
            layer.ctx.arc(px, py, bleedRadius, 0, Math.PI * 2);
            layer.ctx.fill();
            layer.ctx.globalAlpha = prevAlpha;
            layer.ctx.globalCompositeOperation = prevOp;
        }

        gsap.to(activePen.mesh.position, { x: smoothedPos.x, y: smoothedPos.y + 0.1, z: smoothedPos.z, duration: 0.05 });
        activePen.mesh.lookAt(paper.position);

        const delta = new THREE.Vector3().subVectors(smoothedPos, lastPointerPos.pos);
        activePen.mesh.rotation.x = 0.1 + delta.z * 0.2 + (Math.random() - 0.5) * penFlex.maxWobble;
        activePen.mesh.rotation.z = -delta.x * 0.2 + (Math.random() - 0.5) * penFlex.maxWobble;

        const compressAmount = penFlex.maxCompress;
        gsap.to(activePen.mesh.scale, {
            y: 0.3 - compressAmount,
            x: 0.3 + compressAmount / 2,
            z: 0.3 + compressAmount / 2,
            duration: penFlex.speed,
            ease: "power2.out"
        });

        lastPointerPos.pos.copy(smoothedPos);
        lastPointerPos.uv = uv.clone();
    } else if (eraserMode && eraserMesh) {
        const layer = layers[activeLayerIndex];
        const px = uv.x * layer.canvas.width;
        const py = (1 - uv.y) * layer.canvas.height;

        const delta = new THREE.Vector3().subVectors(p, lastPointerPos.pos);
        const speed = delta.length() / 0.016;
        const pressure = THREE.MathUtils.clamp(1.2 - speed / 50, 0.1, 1); 

        const radius = 20;
        const grad = layer.ctx.createRadialGradient(px, py, radius * 0.1, px, py, radius);
        grad.addColorStop(0, `rgba(0,0,0,${pressure})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        const prevComp = layer.ctx.globalCompositeOperation;
        layer.ctx.globalCompositeOperation = 'destination-out';
        layer.ctx.fillStyle = grad;
        layer.ctx.beginPath();
        layer.ctx.arc(px, py, radius, 0, Math.PI * 2);
        layer.ctx.fill();
        layer.ctx.globalCompositeOperation = prevComp;

        const paperTopY = paper.position.y + 0.25;
        gsap.to(eraserMesh.position, { x: p.x, y: paperTopY + Math.sin(Date.now() * 0.01) * 0.01, z: p.z, duration: 0.02 });

        lastPointerPos.pos.copy(p);
        lastPointerPos.uv = uv.clone();
    }

    layer.texture.needsUpdate = true;
    updatePaperMaterial();
});

// ---------- Tools Panel ----------
const toolsPanel = document.createElement('div');
toolsPanel.style.position = 'absolute';
toolsPanel.style.top = '10px';
toolsPanel.style.right = '10px';
toolsPanel.style.padding = '12px';
toolsPanel.style.background = 'rgba(30,30,30,0.85)';
toolsPanel.style.borderRadius = '10px';
toolsPanel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
toolsPanel.style.fontFamily = 'sans-serif';
toolsPanel.style.color = 'white';
toolsPanel.style.zIndex = '1000';
toolsPanel.style.minWidth = '180px';
document.body.appendChild(toolsPanel);

// ----- Title -----
const title = document.createElement('div');
title.innerText = 'Tools';
title.style.fontSize = '18px';
title.style.fontWeight = 'bold';
title.style.marginBottom = '10px';
toolsPanel.appendChild(title);

// ----- Clear Current Layer -----
const clearBtn = document.createElement('button');
clearBtn.innerText = 'Clear Current Layer';
clearBtn.style.width = '100%';
clearBtn.style.padding = '8px';
clearBtn.style.marginBottom = '12px';
clearBtn.style.cursor = 'pointer';
clearBtn.style.border = 'none';
clearBtn.style.borderRadius = '6px';
clearBtn.style.background = '#c0392b';
clearBtn.style.color = 'white';
clearBtn.style.fontSize = '14px';
clearBtn.style.transition = 'background 0.2s';
clearBtn.onmouseenter = () => clearBtn.style.background = '#e74c3c';
clearBtn.onmouseleave = () => clearBtn.style.background = '#c0392b';
toolsPanel.appendChild(clearBtn);

clearBtn.addEventListener('click', () => {
  const layer = layers[activeLayerIndex];
  if (!layer) return;
  layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  layer.texture.needsUpdate = true;
  updatePaperMaterial();
});

// ----- Divider -----
const divider = document.createElement('hr');
divider.style.border = '0';
divider.style.height = '1px';
divider.style.background = 'rgba(255,255,255,0.25)';
divider.style.margin = '8px 0 12px 0';
toolsPanel.appendChild(divider);

// ----- Export Section -----
const exportTitle = document.createElement('div');
exportTitle.innerText = 'Export Drawing';
exportTitle.style.fontSize = '16px';
exportTitle.style.marginBottom = '6px';
toolsPanel.appendChild(exportTitle);

// Format selector
const formatSelect = document.createElement('select');
['PNG', 'JPG'].forEach(f => {
  const opt = document.createElement('option');
  opt.value = f.toLowerCase();
  opt.innerText = f;
  formatSelect.appendChild(opt);
});
formatSelect.style.width = '100%';
formatSelect.style.padding = '6px';
formatSelect.style.marginBottom = '8px';
formatSelect.style.borderRadius = '6px';
formatSelect.style.border = 'none';
formatSelect.style.fontSize = '14px';
toolsPanel.appendChild(formatSelect);

// Scale selector
const scaleSelect = document.createElement('select');
[1, 2, 3, 4].forEach(s => {
  const opt = document.createElement('option');
  opt.value = s;
  opt.innerText = `x${s}`;
  scaleSelect.appendChild(opt);
});
scaleSelect.style.width = '100%';
scaleSelect.style.padding = '6px';
scaleSelect.style.marginBottom = '10px';
scaleSelect.style.borderRadius = '6px';
scaleSelect.style.border = 'none';
scaleSelect.style.fontSize = '14px';
toolsPanel.appendChild(scaleSelect);

// Export button
const exportBtn = document.createElement('button');
exportBtn.innerText = 'Export Layer';
exportBtn.style.width = '100%';
exportBtn.style.padding = '8px';
exportBtn.style.cursor = 'pointer';
exportBtn.style.border = 'none';
exportBtn.style.borderRadius = '6px';
exportBtn.style.background = '#27ae60';
exportBtn.style.color = 'white';
exportBtn.style.fontSize = '14px';
exportBtn.style.transition = 'background 0.2s';
exportBtn.onmouseenter = () => exportBtn.style.background = '#2ecc71';
exportBtn.onmouseleave = () => exportBtn.style.background = '#27ae60';
toolsPanel.appendChild(exportBtn);

exportBtn.addEventListener('click', () => {
    const layer = layers[activeLayerIndex];
    if (!layer) return;

    const format = formatSelect.value;
    const scale = parseInt(scaleSelect.value);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = layer.canvas.width * scale;
    exportCanvas.height = layer.canvas.height * scale;
    const ctx = exportCanvas.getContext('2d');

    ctx.drawImage(paperTexture.image, 0, 0, exportCanvas.width, exportCanvas.height);

    ctx.drawImage(layer.canvas, 0, 0, exportCanvas.width, exportCanvas.height);

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const imageData = exportCanvas.toDataURL(mime, 1.0);

    const link = document.createElement('a');
    link.href = imageData;
    link.download = `${layer.name.replace(/\s+/g, '_')}.${format}`;
    link.click();
});

// ---------- Floating Holographic Text ----------
let floatingText = null;
let leanAngle = 10;
let floatingTime = 0;

fontLoader.load('/fonts/helvetiker_regular.typeface.json', font => {
  const createText = (angleDeg = leanAngle) => {

    if (floatingText) scene.remove(floatingText);

    const textGeo = new TextGeometry('Pen & Paper', {
      font: font,
      size: 1.2,
      height: 0.2,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 5
    });

    // Apply italic shear
    const angleRad = angleDeg * Math.PI / 180;
    const italicMatrix = new THREE.Matrix4().set(
      1, 0, 0, 0,
      Math.tan(angleRad), 1, 0, 0, // shear X
      0, 0, 1, 0,
      0, 0, 0, 1
    );
    textGeo.applyMatrix4(italicMatrix);

    // Center geometry
    textGeo.computeBoundingBox();
    const bbox = textGeo.boundingBox;
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;

    const textMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9d9d9,
      emissive: 0xd9d9d9,
      emissiveIntensity: 0,
      metalness: 1,
      roughness: 0.52
    });

    floatingText = new THREE.Mesh(textGeo, textMaterial);
    floatingText.scale.set(-1, 1, 0.01);
    floatingText.position.set(-4 - width / 2, 7 - height / 2, 1);
    floatingText.rotation.y = -1.5;

    scene.add(floatingText);
  };

  createText();

  // adjust lean dynamically
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') leanAngle -= 1;
    if (e.key === 'ArrowRight') leanAngle += 1;
    createText(leanAngle);
  });
});

function animateFloatingText() {
    if (!floatingText) return;

    const t = clock.getElapsedTime();

    // Floating offsets
    const floatX = Math.sin(t * 0.5) * 0.5; // left/right
    const floatY = Math.sin(t * 0.8) * 0.3; // up/down
    const floatZ = Math.cos(t * 0.5) * 0.5; // forward/back

    floatingText.position.x = -7 + floatX;
    floatingText.position.y = 7 + floatY;
    floatingText.position.z = 4 + floatZ;

    floatingText.rotation.y = -1.5 + Math.sin(t * 0.3) * 0.1;
}

// ---------- Animate ----------
function animate() {
  animateFloatingText();
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
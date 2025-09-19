import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

// ---------- Scene, Camera, Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

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

// ---------- Paper ----------
const textureLoader = new THREE.TextureLoader();
const paperTexture = textureLoader.load('/paper.jpg');

const paper = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 7),
  new THREE.MeshStandardMaterial({ map: paperTexture })
);
paper.rotation.x = -Math.PI / 2;
scene.add(paper);

// ---------- Pen Holder ----------
const loader = new GLTFLoader();
let holderMesh;

loader.load('/pen_holder2.glb', gltf => {
  holderMesh = gltf.scene;
  holderMesh.position.set(-6, 0, 0);
  holderMesh.scale.set(8, 8, 8);
  scene.add(holderMesh);
});

// ---------- Pen Logic ----------
let pens = [];
let activePen = null;
let isDrawing = false;
let eraserMode = false;
let eraserMesh = null;
let eraserOriginalPos = new THREE.Vector3();

const penColors = ['red', 'green', 'blue', 'black'];

// Slot positions relative to holder
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

// Load pen model and clone with colors
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
});

// ---------- Load Eraser ----------
loader.load('/eraser.glb', gltf => {
  eraserMesh = gltf.scene;
  eraserMesh.position.set(6, 0.2, 0); // beside paper
  eraserMesh.scale.set(-0.006, -0.006, -0.01);
  eraserOriginalPos.copy(eraserMesh.position);
  scene.add(eraserMesh);
});

// ---------- Raycaster ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getRootPen(obj) {
  for (const pen of pens) {
    if (pen.mesh === obj || pen.mesh.getObjectById(obj.id)) return pen;
  }
  return null;
}

// ---------- Drawing Canvas ----------
const drawCanvas = document.createElement('canvas');
drawCanvas.width = 1024;
drawCanvas.height = 1024;
const drawCtx = drawCanvas.getContext('2d');
drawCtx.fillStyle = '#fff';
drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

const drawTexture = new THREE.CanvasTexture(drawCanvas);
paper.material.map = drawTexture;

// ---------- Pointer Events ----------
renderer.domElement.addEventListener('pointerdown', event => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const objects = [...pens.map(p => p.mesh), holderMesh, eraserMesh].filter(Boolean);
  const intersects = raycaster.intersectObjects(objects, true);

  if (intersects.length > 0) {
    const obj = intersects[0].object;

    // Toggle eraser
    if (eraserMesh && (obj === eraserMesh || eraserMesh.getObjectById(obj.id)) && !activePen) {
      eraserMode = !eraserMode;
      console.log(`Eraser mode: ${eraserMode}`);

      if (!eraserMode) {
        // Return eraser to original holder spot
        gsap.to(eraserMesh.position, {
          x: eraserOriginalPos.x,
          y: eraserOriginalPos.y,
          z: eraserOriginalPos.z,
          duration: 0.5,
          ease: "power2.inOut"
        });
      }
    }

    // Disable pen selection while erasing
    if (eraserMode) return;

    // Pen pick/return logic
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

  // Start drawing/erasing if clicking paper
  const paperIntersects = raycaster.intersectObject(paper);
  if (paperIntersects.length > 0 && (activePen || eraserMode)) {
    isDrawing = true;
  }
});

renderer.domElement.addEventListener('pointerup', () => { isDrawing = false; });

// ---------- Mouse Move for Drawing / Erasing ----------
window.addEventListener('pointermove', event => {
  if (!isDrawing) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(paper);
  if (intersects.length > 0) {
    const p = intersects[0].point;
    const uv = intersects[0].uv;
    const x = uv.x * drawCanvas.width;
    const y = (1 - uv.y) * drawCanvas.height;

    if (activePen) {
      // Draw with pen
      drawCtx.fillStyle = activePen.color;
      drawCtx.beginPath();
      drawCtx.arc(x, y, 3, 0, Math.PI * 2);
      drawCtx.fill();

      // Pen follows pointer with slight lean
      gsap.to(activePen.mesh.position, { x: p.x, y: p.y + 0.1, z: p.z, duration: 0.1 });
      activePen.mesh.lookAt(paper.position);
      activePen.mesh.rotation.x = 0.15; // tilt forward slightly
      activePen.mesh.rotation.z = 0.05; // small twist
    } else if (eraserMode && eraserMesh) {
      // Erase
      drawCtx.fillStyle = '#fff';
      drawCtx.beginPath();
      drawCtx.arc(x, y, 20, 0, Math.PI * 2);
      drawCtx.fill();

      // Stick eraser above paper with slight tilt
      const paperTopY = paper.position.y + 0.1;
      gsap.to(eraserMesh.position, { x: p.x, y: paperTopY, z: p.z, duration: 0.05 });
      eraserMesh.rotation.x = -0.1; // tilt naturally while erasing
      eraserMesh.rotation.z = 0.05;
    }

    drawTexture.needsUpdate = true;
  }
});

// ---------- Animate ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------- Window Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

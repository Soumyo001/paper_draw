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
  holderMesh.scale.set(8, 8, 8); // scale to fit pens
  scene.add(holderMesh);
});

// ---------- Pen Logic ----------
let pens = [];
let activePen = null;
let isDrawing = false;
let eraserMode = false;

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

// ---------- Raycaster ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getRootPen(obj) {
  for (const pen of pens) {
    if (pen.mesh === obj || pen.mesh.getObjectById(obj.id)) return pen;
  }
  return null;
}

// ---------- Pointer Events ----------
renderer.domElement.addEventListener('pointerdown', event => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([...pens.map(p => p.mesh), holderMesh].filter(Boolean), true);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    const penData = getRootPen(obj);

    const isHolderClicked = holderMesh && (obj === holderMesh || holderMesh.getObjectById(obj.id));

    if (penData && !activePen) {
      // Pick pen
      activePen = penData;
      gsap.to(activePen.mesh.position, { x: 0, y: 2, z: 0, duration: 0.5, ease: "power2.out" });
    } else if (isHolderClicked && activePen) {
      // Put back pen
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

  // Start drawing if clicking paper
  if (activePen) {
    const paperIntersects = raycaster.intersectObject(paper);
    if (paperIntersects.length > 0) isDrawing = true;
  }
});

renderer.domElement.addEventListener('pointerup', () => { isDrawing = false; });

// ---------- Drawing Canvas ----------
const drawCanvas = document.createElement('canvas');
drawCanvas.width = 1024;
drawCanvas.height = 1024;
const drawCtx = drawCanvas.getContext('2d');
drawCtx.fillStyle = '#fff';
drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

const drawTexture = new THREE.CanvasTexture(drawCanvas);
paper.material.map = drawTexture;

// ---------- Mouse Move for Drawing ----------
window.addEventListener('pointermove', event => {
  if (!activePen || !isDrawing) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(paper);
  if (intersects.length > 0) {
    const uv = intersects[0].uv;
    const x = uv.x * drawCanvas.width;
    const y = (1 - uv.y) * drawCanvas.height;

    drawCtx.fillStyle = eraserMode ? '#fff' : activePen.color;
    drawCtx.beginPath();
    drawCtx.arc(x, y, eraserMode ? 20 : 3, 0, Math.PI * 2);
    drawCtx.fill();
    drawTexture.needsUpdate = true;
  }
});

// ---------- Animate ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (activePen) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(paper);
    if (intersects.length > 0) {
      const p = intersects[0].point;
      activePen.mesh.position.set(p.x, p.y + 0.1, p.z);
      activePen.mesh.lookAt(paper.position);
    }
  }

  renderer.render(scene, camera);
}
animate();

// ---------- Window Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

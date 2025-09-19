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

// ---------- Loader ----------
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// ---------- Paper ----------
const paperTexture = textureLoader.load('/paper.jpg');
const paper = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 7),
  new THREE.MeshStandardMaterial({ map: paperTexture })
);
paper.rotation.x = -Math.PI / 2;
scene.add(paper);

// ---------- Pen Holder ----------
let holderMesh;
loader.load('/pen_holder2.glb', gltf => {
  holderMesh = gltf.scene;
  holderMesh.position.set(-6, 0, 0);
  holderMesh.scale.set(8, 8, 8);
  scene.add(holderMesh);
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

// ---------- Drawing Canvas ----------
const drawCanvas = document.createElement('canvas');
drawCanvas.width = 1024;
drawCanvas.height = 1024;
const drawCtx = drawCanvas.getContext('2d');
drawCtx.fillStyle = '#fff';
drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
const drawTexture = new THREE.CanvasTexture(drawCanvas);
paper.material.map = drawTexture;

let isDrawing = false;
let lastPointerPos = null;

// ---------- Pen Flex / Wobble ----------
const penFlex = { maxCompress: 0.05, speed: 0.1, maxWobble: 0.05 };

// ---------- Pointer Events ----------
renderer.domElement.addEventListener('pointerdown', event => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactables, true);

  if (intersects.length > 0) {
    const obj = intersects[0].object;

    // Toggle eraser
    if (eraserMesh && (obj === eraserMesh || obj === eraserHolderSquare || eraserMesh.getObjectById(obj.id)) && !activePen) {
      eraserMode = !eraserMode;
      if (!eraserMode) {
        gsap.to(eraserMesh.position, {
          x: eraserOriginalPos.x,
          y: eraserOriginalPos.y,
          z: eraserOriginalPos.z,
          duration: 0.5,
          ease: "power2.inOut",
          rotationX: 0,
          rotationZ: 0
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
  }
});

renderer.domElement.addEventListener('pointerup', () => {
  isDrawing = false;
  if (activePen) {
    gsap.to(activePen.mesh.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.2, ease: "power2.out" });
  }
});

// ---------- Drawing / Erasing ----------
window.addEventListener('pointermove', event => {
  if (!isDrawing) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(paper);
  if (intersects.length === 0) return;

  const p = intersects[0].point;
  const uv = intersects[0].uv;

  if (activePen) {
    // Calculate speed
    const distance = lastPointerPos.pos.distanceTo(p);
    const speed = distance / 0.016; // approx per frame
    const radius = THREE.MathUtils.clamp(6 / (speed + 1), 1.5, 4); // faster = thinner

    // Interpolate between last UV and current UV for solid line
    const steps = Math.ceil(lastPointerPos.uv.distanceTo(uv) * drawCanvas.width * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const interpU = lastPointerPos.uv.x + (uv.x - lastPointerPos.uv.x) * t;
      const interpV = lastPointerPos.uv.y + (uv.y - lastPointerPos.uv.y) * t;
      const px = interpU * drawCanvas.width;
      const py = (1 - interpV) * drawCanvas.height;

      drawCtx.fillStyle = activePen.color;
      drawCtx.beginPath();
      drawCtx.arc(px, py, radius, 0, Math.PI * 2);
      drawCtx.fill();
    }

    // Pen follow
    gsap.to(activePen.mesh.position, { x: p.x, y: p.y + 0.1, z: p.z, duration: 0.05 });
    activePen.mesh.lookAt(paper.position);

    // Tilt + wobble
    const delta = new THREE.Vector3().subVectors(p, lastPointerPos.pos);
    activePen.mesh.rotation.x = 0.1 + delta.z * 0.2 + (Math.random() - 0.5) * penFlex.maxWobble;
    activePen.mesh.rotation.z = -delta.x * 0.2 + (Math.random() - 0.5) * penFlex.maxWobble;

    // Pen flex
    const compressAmount = penFlex.maxCompress;
    gsap.to(activePen.mesh.scale, {
      y: 0.3 - compressAmount,
      x: 0.3 + compressAmount / 2,
      z: 0.3 + compressAmount / 2,
      duration: penFlex.speed,
      ease: "power2.out"
    });

    lastPointerPos.pos.copy(p);
    lastPointerPos.uv = uv.clone();
  } else if (eraserMode && eraserMesh) {
    const radius = 20;
    const px = uv.x * drawCanvas.width;
    const py = (1 - uv.y) * drawCanvas.height;

    drawCtx.fillStyle = '#fff';
    drawCtx.beginPath();
    drawCtx.arc(px, py, radius, 0, Math.PI * 2);
    drawCtx.fill();

    const paperTopY = paper.position.y + 0.25;
    gsap.to(eraserMesh.position, { x: p.x, y: paperTopY, z: p.z, duration: 0.02 });
    eraserMesh.rotation.x = -0.1;
    eraserMesh.rotation.z = 0.05;
  }

  drawTexture.needsUpdate = true;
});

// ---------- Animate ----------
function animate() {
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

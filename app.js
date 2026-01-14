// ===============================
// Three.js (ES Module via Import Map)
// ===============================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// =====================================================
// 入口：等 DOM 都準備好再開始（避免 GitHub Pages 上抓不到元素）
// =====================================================
window.addEventListener("DOMContentLoaded", () => {
  // ===============================
  // DOM 元素定義
  // ===============================
  const canvasWrap = document.getElementById("canvasWrap");
  const statusText = document.getElementById("statusText");
  const measureText = document.getElementById("measureText");

  const btnMeasure = document.getElementById("btnMeasure");
  const btnClear = document.getElementById("btnClear");
  const btnHome = document.getElementById("btnHome");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");

  if (!canvasWrap) {
    console.error('找不到 #canvasWrap。請確認 index.html 內有 <div id="canvasWrap">');
    return;
  }

  // ===============================
  // Three.js 場景初始化
  // ===============================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(
    55,
    canvasWrap.clientWidth / canvasWrap.clientHeight,
    0.1,
    20000
  );
  camera.position.set(0, 150, 350);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
  canvasWrap.appendChild(renderer.domElement);

  // 光源
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(300, 500, 200);
  scene.add(dir);

  // 控制器
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.update();

  // 格線
  const grid = new THREE.GridHelper(1200, 60, 0x444444, 0x222222);
  grid.position.y = -0.5;
  scene.add(grid);

  // ===============================
  // 模型載入（同資料夾：MipModel-v2.obj / .mtl / .jpg）
  // ===============================
  const MODEL_MTL = "MipModel-v2.mtl";
  const MODEL_OBJ = "MipModel-v2.obj";
  const basePath = "./"; // GitHub Pages / 本機都用相對路徑最穩

  if (statusText) statusText.textContent = "模型載入中...";

  const mtlLoader = new MTLLoader();
  mtlLoader.setPath(basePath);

  const objLoader = new OBJLoader();
  objLoader.setPath(basePath);

  let modelRoot = null;

  mtlLoader.load(
    MODEL_MTL,
    (materials) => {
      materials.preload();

      // 貼圖色彩空間（更接近正常顏色）
      for (const k in materials.materials) {
        const m = materials.materials[k];
        if (m.map) {
          m.map.colorSpace = THREE.SRGBColorSpace;
          m.map.needsUpdate = true;
        }
      }

      objLoader.setMaterials(materials);

      objLoader.load(
        MODEL_OBJ,
        (obj) => {
          modelRoot = obj;
          scene.add(obj);

          // 置中 + 調整相機
          const box = new THREE.Box3().setFromObject(obj);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);

          obj.position.sub(center);
          controls.target.set(0, 0, 0);
          controls.update();

          const maxDim = Math.max(size.x, size.y, size.z);
          const fitDist = maxDim * 1.4;
          camera.position.set(fitDist * 0.35, fitDist * 0.35, fitDist);
          camera.near = Math.max(0.1, maxDim / 1000);
          camera.far = Math.max(20000, maxDim * 10);
          camera.updateProjectionMatrix();

          if (statusText) statusText.textContent = "模型載入完成";
        },
        undefined,
        (err) => {
          console.error("OBJ 載入失敗：", err);
          if (statusText) statusText.textContent = "OBJ 載入失敗（請開 Console 看錯誤）";
        }
      );
    },
    undefined,
    (err) => {
      console.error("MTL 載入失敗：", err);
      if (statusText) statusText.textContent = "MTL 載入失敗（請開 Console 看錯誤）";
    }
  );

  // ===============================
  // 量測（兩點距離）
  // ===============================
  let isMeasuring = false;
  let pickedPoints = [];
  let pickedLine = null;
  let lastDistance = 0;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function setMeasureText(v) {
    if (measureText) measureText.textContent = v;
  }

  function clearMeasure() {
    pickedPoints = [];
    lastDistance = 0;
    setMeasureText("量測值：—");

    if (pickedLine) {
      scene.remove(pickedLine);
      pickedLine.geometry.dispose();
      pickedLine.material.dispose();
      pickedLine = null;
    }
  }

  function updateLine() {
    if (pickedLine) {
      scene.remove(pickedLine);
      pickedLine.geometry.dispose();
      pickedLine.material.dispose();
      pickedLine = null;
    }
    if (pickedPoints.length < 2) return;

    const geom = new THREE.BufferGeometry().setFromPoints(pickedPoints);
    const mat = new THREE.LineBasicMaterial({ color: 0xffcc00 });
    pickedLine = new THREE.Line(geom, mat);
    scene.add(pickedLine);

    const d = pickedPoints[0].distanceTo(pickedPoints[1]);
    lastDistance = d;
    setMeasureText(`量測值：${d.toFixed(2)} m`);
  }

  function onPointerDown(e) {
    if (!isMeasuring) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const targets = modelRoot ? [modelRoot] : scene.children;
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return;

    const p = hits[0].point.clone();
    pickedPoints.push(p);

    if (pickedPoints.length > 2) {
      clearMeasure();
      pickedPoints.push(p);
    }

    if (pickedPoints.length === 2) updateLine();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  btnMeasure?.addEventListener("click", () => {
    isMeasuring = !isMeasuring;
    btnMeasure.classList.toggle("active", isMeasuring);
  });

  btnClear?.addEventListener("click", () => clearMeasure());

  btnHome?.addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    controls.update();
  });

  btnZoomIn?.addEventListener("click", () => camera.position.multiplyScalar(0.9));
  btnZoomOut?.addEventListener("click", () => camera.position.multiplyScalar(1.1));

  // Resize
  function onResize() {
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // Render loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
});

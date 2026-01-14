import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// ===== 你要的模型檔名（都在同一層）=====
const MODEL_MTL = "./MipModel-v2.mtl";
const MODEL_OBJ = "./MipModel-v2.obj";

// 版本字串：用來避免瀏覽器快取舊檔（你改模型後很重要）
// 想固定就改成 "v2"；想每次都強制刷新可改成 Date.now().toString()
const ASSET_VER = "v2";

// ===== DOM =====
const canvas = document.getElementById("c");
const infoBar = document.getElementById("infoBar");

// ===== Scene / Camera / Renderer =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  45,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  200000
);
camera.position.set(30, 30, 30);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

// three r160：建議明確指定
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ===== Light =====
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(50, 80, 30);
scene.add(dir);

// ===== Grid（你原本有的視覺輔助）=====
const grid = new THREE.GridHelper(200, 50, 0x444444, 0x222222);
scene.add(grid);

// ===== Controls =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ===== Model holder =====
let modelRoot = null;

// ===== Load model (MTL -> OBJ) =====
function loadModel() {
  // 如果之前已經有模型，先移除
  if (modelRoot) {
    scene.remove(modelRoot);
    modelRoot.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) {
          o.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(o.material);
        }
      }
    });
    modelRoot = null;
  }

  const manager = new THREE.LoadingManager();

  manager.onStart = () => {
    if (infoBar) infoBar.textContent = "模型載入中...";
  };

  manager.onLoad = () => {
    if (infoBar) infoBar.textContent = "模型載入完成";
  };

  manager.onError = (url) => {
    console.warn("載入失敗：", url);
    if (infoBar) infoBar.textContent = `載入失敗：${url}`;
  };

  const mtlLoader = new MTLLoader(manager);
  mtlLoader.setPath("./"); // 關鍵：貼圖 jpg 會跟著這個路徑找

  // 用 querystring 避免快取舊 mtl（你改過貼圖路徑/檔名時很常救命）
  mtlLoader.load(`${MODEL_MTL}?v=${ASSET_VER}`, (materials) => {
    materials.preload();

    const objLoader = new OBJLoader(manager);
    objLoader.setMaterials(materials);
    objLoader.setPath("./");

    objLoader.load(`${MODEL_OBJ}?v=${ASSET_VER}`, (obj) => {
      modelRoot = obj;

      // 重要：確保貼圖色彩空間正確、且雙面顯示避免背面黑掉
      modelRoot.traverse((child) => {
        if (!child.isMesh) return;

        const mat = child.material;
        if (Array.isArray(mat)) {
          mat.forEach(fixMaterial);
        } else {
          fixMaterial(mat);
        }
      });

      // 自動置中 + 調整相機距離（避免載入後跑很遠看不到）
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      modelRoot.position.sub(center);
      scene.add(modelRoot);

      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim * 1.2 + 10;
      camera.position.set(dist, dist * 0.6, dist);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
    });
  });
}

function fixMaterial(material) {
  if (!material) return;

  material.side = THREE.DoubleSide;

  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.map.needsUpdate = true;
  }
  material.needsUpdate = true;
}

function disposeMaterial(material) {
  if (!material) return;
  if (material.map) material.map.dispose?.();
  material.dispose?.();
}

// ===== Resize =====
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", onResize);

// ===== Animate =====
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ===== Start =====
loadModel();
animate();

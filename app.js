import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// ===============================
// DOM：等頁面元素都 ready 再初始化
// ===============================
window.addEventListener("DOMContentLoaded", () => {
  const canvasWrap = document.getElementById("canvasWrap");
  if (!canvasWrap) {
    console.error("找不到 #canvasWrap，請確認 index.html 有 <div id='canvasWrap'>");
    return;
  }

  initThree(canvasWrap);
});

function initThree(canvasWrap) {
  // ===============================
  // 場景 / 相機 / 渲染器
  // ===============================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(
    45,
    canvasWrap.clientWidth / canvasWrap.clientHeight,
    0.1,
    5000
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
  canvasWrap.appendChild(renderer.domElement);

  // --- 色彩/曝光設定（讓貼圖顏色更正確、畫面更亮一些） ---
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.physicallyCorrectLights = true;

  // ===============================
  // 控制器
  // ===============================
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // ===============================
  // 燈光（加亮）
  // ===============================
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(200, 300, 200);
  scene.add(dirLight);

  // 柔和的天光/地光，讓陰影區不會太黑
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  // 地面格線（可留著方便看尺度）
  const grid = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
  scene.add(grid);

  // ===============================
  // 讀取 OBJ + MTL
  // ===============================
  const MODEL_MTL = "MipModel-v2.mtl";
  const MODEL_OBJ = "MipModel-v2.obj";

  const mtlLoader = new MTLLoader();
  mtlLoader.load(
    MODEL_MTL,
    (materials) => {
      materials.preload();

      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);

      objLoader.load(
        MODEL_OBJ,
        (obj) => {
          // ✅ 修正：模型目前「站起來」= 需要繞 X 軸轉 -90 度讓它躺平
          obj.rotation.set(-Math.PI / 2, 0, 0);

          // 計算 bounding box：置中 + 放到地面上
          const box = new THREE.Box3().setFromObject(obj);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          // 置中到原點
          obj.position.x += -center.x;
          obj.position.y += -center.y;
          obj.position.z += -center.z;

          // 放到地面（讓最低點貼齊 y=0）
          const box2 = new THREE.Box3().setFromObject(obj);
          obj.position.y = -box2.min.y;

          // 讓貼圖以 sRGB 顯示（不然會偏灰/偏暗）
          obj.traverse((child) => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (m && m.map) {
                m.map.colorSpace = THREE.SRGBColorSpace;
                m.needsUpdate = true;
              }
            }
          });

          scene.add(obj);

          // 相機自動抓距離（依模型尺寸）
          const maxDim = Math.max(size.x, size.y, size.z);
          const dist = maxDim * 1.6;

          controls.target.set(0, maxDim * 0.35, 0);
          camera.position.set(0, maxDim * 0.8, dist);
          camera.near = Math.max(0.1, maxDim / 5000);
          camera.far = Math.max(5000, maxDim * 20);
          camera.updateProjectionMatrix();

          controls.update();

          const statusEl = document.getElementById("statusText");
          if (statusEl) statusEl.textContent = "模型載入完成";
        },
        undefined,
        (err) => {
          console.error("OBJ 載入失敗：", err);
          const statusEl = document.getElementById("statusText");
          if (statusEl) statusEl.textContent = "OBJ 載入失敗（請看 Console）";
        }
      );
    },
    undefined,
    (err) => {
      console.error("MTL 載入失敗：", err);
      const statusEl = document.getElementById("statusText");
      if (statusEl) statusEl.textContent = "MTL 載入失敗（請看 Console）";
    }
  );

  // ===============================
  // Resize
  // ===============================
  window.addEventListener("resize", () => {
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    if (!w || !h) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // ===============================
  // 動畫
  // ===============================
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

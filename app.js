import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// ===============================
// 全域變數設定
// ===============================
let scene, camera, renderer, controls;
let loadedModel = null; // 儲存載入後的模型物件
let raycaster, mouse;

// 量測相關變數
let isMeasuring = false;
let measurePoints = []; // 暫存點擊的座標 [p1, p2]
let measureObjects = []; // 儲存畫出來的線和球，方便清除

// 儲存初始視角 (用於"回到對焦點")
const initialCameraState = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
};

// ===============================
// 初始化入口
// ===============================
window.addEventListener("DOMContentLoaded", () => {
  const canvasWrap = document.getElementById("canvasWrap");
  if (!canvasWrap) {
    console.error("錯誤：找不到 #canvasWrap 容器");
    return;
  }

  initThree(canvasWrap);
  setupUI(); // 綁定按鈕事件
});

function initThree(canvasWrap) {
  // 1. 場景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  // 2. 相機
  camera = new THREE.PerspectiveCamera(
    45,
    canvasWrap.clientWidth / canvasWrap.clientHeight,
    0.1,
    10000
  );

  // 3. 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
  
  // 色彩與曝光設定 (讓模型看起來更真實亮麗)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  
  canvasWrap.appendChild(renderer.domElement);

  // 4. 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // 5. 燈光系統
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
  dirLight.position.set(200, 400, 200);
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  // 6. 地面網格
  const grid = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
  scene.add(grid);

  // 7. 量測工具初始化
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // 監聽畫布點擊 (用於量測)
  renderer.domElement.addEventListener("pointerdown", onCanvasClick);

  // 8. 開始載入模型
  loadModel();

  // Resize 事件
  window.addEventListener("resize", () => {
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // 動畫迴圈
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// ===============================
// 模型載入邏輯
// ===============================
function loadModel() {
  const MODEL_MTL = "MipModel-v2.mtl";
  const MODEL_OBJ = "MipModel-v2.obj";
  const statusEl = document.getElementById("statusText");

  const mtlLoader = new MTLLoader();
  mtlLoader.load(MODEL_MTL, (materials) => {
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);

    objLoader.load(MODEL_OBJ, (obj) => {
      // 1. 旋轉：修正模型座標系 (從 Z-up 轉為 Y-up)
      obj.rotation.set(-Math.PI / 2, 0, 0);

      // 2. 計算包圍盒 (Bounding Box)
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // 3. 置中：將模型中心移到 (0, ?, 0)
      obj.position.x += -center.x;
      obj.position.z += -center.z;
      // 注意：Y 軸先不減 center，後面單獨處理

      // 4. 貼地：計算旋轉後的最低點
      // 必須重新計算 Box，因為上面改了 position
      obj.updateMatrixWorld(); 
      const box2 = new THREE.Box3().setFromObject(obj);
      const shiftY = -box2.min.y;
      obj.position.y += shiftY;

      // 5. 【關鍵修正】抬高模型：讓模型懸浮在格線上方
      // 使用模型最大邊長的 5% 作為抬升高度，確保視覺上明顯
      const maxDim = Math.max(size.x, size.y, size.z);
      const LIFT_OFFSET = maxDim * 0.05; 
      obj.position.y += LIFT_OFFSET;

      // 6. 材質修正 (確保顏色正確)
      obj.traverse((child) => {
        if (child.isMesh) {
          // 計算幾何邊界，優化 Raycaster 效能
          child.geometry.computeBoundingBox();
          
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          });
        }
      });

      scene.add(obj);
      loadedModel = obj; // 儲存參照

      // 7. 設定最佳相機視角
      const dist = maxDim * 1.5;
      const targetY = maxDim * 0.2; // 看向模型稍微偏下的位置

      camera.position.set(dist * 0.5, dist * 0.8, dist); // 斜上方視角
      controls.target.set(0, targetY, 0);
      
      // 儲存這個狀態給「回到對焦點」使用
      initialCameraState.position.copy(camera.position);
      initialCameraState.target.copy(controls.target);

      camera.near = Math.max(0.1, maxDim / 1000);
      camera.far = Math.max(5000, maxDim * 20);
      camera.updateProjectionMatrix();
      controls.update();

      if (statusEl) statusEl.textContent = "模型載入完成";
    }, 
    // progress
    (xhr) => {
        if(statusEl) statusEl.textContent = `載入中 ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`;
    },
    // error
    (err) => {
      console.error(err);
      if (statusEl) statusEl.textContent = "載入失敗";
    });
  });
}

// ===============================
// UI 事件綁定
// ===============================
function setupUI() {
  // 1. 線段量測按鈕
  const btnMeasure = document.getElementById("btnMeasure");
  btnMeasure.addEventListener("click", () => {
    isMeasuring = !isMeasuring;
    if (isMeasuring) {
      btnMeasure.textContent = "量測中 (按ESC取消)";
      btnMeasure.style.backgroundColor = "#d32f2f"; // 變紅
      document.body.style.cursor = "crosshair"; // 滑鼠變十字
      measurePoints = []; // 重置點
    } else {
      resetMeasureState();
    }
  });

  // 按 ESC 退出量測
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMeasuring) {
      resetMeasureState();
    }
  });

  // 2. 清除量測按鈕
  const btnClear = document.getElementById("btnClear");
  btnClear.addEventListener("click", () => {
    // 清除場景中的線和球
    measureObjects.forEach(obj => scene.remove(obj));
    measureObjects = [];
    measurePoints = [];
    document.getElementById("measureText").textContent = "量測值：—";
  });

  // 3. 回到對焦點
  const btnHome = document.getElementById("btnHome");
  btnHome.addEventListener("click", () => {
    if (!loadedModel) return;
    camera.position.copy(initialCameraState.position);
    controls.target.copy(initialCameraState.target);
    controls.update();
  });

  // 4. 放大 (+)
  const btnZoomIn = document.getElementById("btnZoomIn");
  btnZoomIn.addEventListener("click", () => {
    dollyCamera(0.8); // 縮小距離 = 放大
  });

  // 5. 縮小 (-)
  const btnZoomOut = document.getElementById("btnZoomOut");
  btnZoomOut.addEventListener("click", () => {
    dollyCamera(1.2); // 增加距離 = 縮小
  });
  
  // 匯出按鈕 (此處僅保留監聽，未實作具體轉檔邏輯)
  const btnExportCsv = document.getElementById("btnExportCsv");
  if(btnExportCsv) btnExportCsv.addEventListener("click", () => alert("匯出 CSV 功能尚未實作"));
  
  const btnExportWord = document.getElementById("btnExportWord");
  if(btnExportWord) btnExportWord.addEventListener("click", () => alert("匯出 Word 功能尚未實作"));
}

function resetMeasureState() {
  isMeasuring = false;
  const btnMeasure = document.getElementById("btnMeasure");
  btnMeasure.textContent = "線段量測";
  btnMeasure.style.backgroundColor = ""; // 恢復原色
  document.body.style.cursor = "default";
  measurePoints = [];
}

function dollyCamera(factor) {
  // 沿著相機視線方向移動
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
  direction.multiplyScalar(factor);
  camera.position.copy(controls.target).add(direction);
  controls.update();
}

// ===============================
// 量測核心邏輯 (Raycasting)
// ===============================
function onCanvasClick(event) {
  if (!isMeasuring || !loadedModel) return;

  // 1. 取得滑鼠在 Canvas 的正規化座標 (-1 ~ 1)
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // 2. 發射射線
  raycaster.setFromCamera(mouse, camera);
  
  // 3. 檢查碰撞 (只檢查模型，不檢查網格)
  const intersects = raycaster.intersectObject(loadedModel, true);

  if (intersects.length > 0) {
    // 取得第一個碰撞點
    const point = intersects[0].point;
    addMeasurePoint(point);
  }
}

function addMeasurePoint(point) {
  measurePoints.push(point);

  // 1. 畫一個小球標記點擊處
  const sphereGeom = new THREE.SphereGeometry(0.3, 16, 16); // 大小可視模型比例調整
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false }); 
  const sphere = new THREE.Mesh(sphereGeom, sphereMat);
  sphere.renderOrder = 999; // 確保畫在最上層
  sphere.position.copy(point);
  scene.add(sphere);
  measureObjects.push(sphere);

  // 2. 如果有點滿兩點，畫線並計算距離
  if (measurePoints.length === 2) {
    const p1 = measurePoints[0];
    const p2 = measurePoints[1];

    // 畫線
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3, depthTest: false });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;
    scene.add(line);
    measureObjects.push(line);

    // 計算距離
    const dist = p1.distanceTo(p2);
    
    // 更新 UI 文字
    document.getElementById("measureText").textContent = `量測值：${dist.toFixed(3)} m`;

    // 清空點陣列，準備下一次測量
    measurePoints = [];
  }
}

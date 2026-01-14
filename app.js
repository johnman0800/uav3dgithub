import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// ===============================
// 全域變數設定
// ===============================
let scene, camera, renderer, controls;
let loadedModel = null;
let raycaster, mouse;

// 量測相關
let isMeasuring = false;
let measurePoints = [];
let measureObjects = [];

// 初始視角 (用於"回到對焦點")
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
  setupUI();
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
  
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  
  canvasWrap.appendChild(renderer.domElement);

  // 4. 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // 5. 燈光
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
  dirLight.position.set(200, 400, 200);
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  // 6. 格線
  const grid = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
  scene.add(grid);

  // 7. 量測工具
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerdown", onCanvasClick);

  // 8. 載入模型
  loadModel();

  // Resize
  window.addEventListener("resize", () => {
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // Animation Loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// ===============================
// 模型載入與位置計算
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
      // 1. 旋轉
      obj.rotation.set(-Math.PI / 2, 0, 0);

      // 2. 取得尺寸與中心
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // 3. 置中 (XZ)
      obj.position.x += -center.x;
      obj.position.z += -center.z;

      // 4. 貼地 (Y)
      obj.updateMatrixWorld(); 
      const box2 = new THREE.Box3().setFromObject(obj);
      obj.position.y += -box2.min.y;

      // 5. 稍微抬高 (避免與格線重疊)
      const maxDim = Math.max(size.x, size.y, size.z);
      const LIFT_OFFSET = maxDim * 0.05; 
      obj.position.y += LIFT_OFFSET;

      // 6. 材質色彩修正
      obj.traverse((child) => {
        if (child.isMesh) {
          child.geometry.computeBoundingBox();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          });
        }
      });

      scene.add(obj);
      loadedModel = obj;

      // ==========================================
      // 【修改】相機初始距離
      // 原本是 maxDim * 1.5，改成 0.5 讓它更近
      // ==========================================
      const dist = maxDim * 0.5; 
      const targetY = maxDim * 0.2; 

      // 設定相機位置 (從斜上方看)
      camera.position.set(dist * 0.8, dist * 0.8, dist);
      controls.target.set(0, targetY, 0);
      
      initialCameraState.position.copy(camera.position);
      initialCameraState.target.copy(controls.target);

      camera.near = Math.max(0.1, maxDim / 1000);
      camera.far = Math.max(5000, maxDim * 20);
      camera.updateProjectionMatrix();
      controls.update();

      if (statusEl) statusEl.textContent = "模型載入完成";
    }, 
    (xhr) => {
        if(statusEl) statusEl.textContent = `載入中 ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`;
    },
    (err) => {
      console.error(err);
      if (statusEl) statusEl.textContent = "載入失敗";
    });
  });
}

// ===============================
// UI 與 按鈕事件
// ===============================
function setupUI() {
  // 量測按鈕
  const btnMeasure = document.getElementById("btnMeasure");
  btnMeasure.addEventListener("click", () => {
    isMeasuring = !isMeasuring;
    if (isMeasuring) {
      btnMeasure.textContent = "量測中 (按ESC取消)";
      btnMeasure.style.backgroundColor = "#d32f2f";
      document.body.style.cursor = "crosshair";
      measurePoints = [];
    } else {
      resetMeasureState();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMeasuring) {
      resetMeasureState();
    }
  });

  // 清除量測
  const btnClear = document.getElementById("btnClear");
  btnClear.addEventListener("click", () => {
    measureObjects.forEach(obj => scene.remove(obj));
    measureObjects = [];
    measurePoints = [];
    document.getElementById("measureText").textContent = "量測值：—";
  });

  // 回到對焦點
  const btnHome = document.getElementById("btnHome");
  btnHome.addEventListener("click", () => {
    if (!loadedModel) return;
    camera.position.copy(initialCameraState.position);
    controls.target.copy(initialCameraState.target);
    controls.update();
  });

  // 縮放按鈕
  document.getElementById("btnZoomIn").addEventListener("click", () => dollyCamera(0.8));
  document.getElementById("btnZoomOut").addEventListener("click", () => dollyCamera(1.2));

  // -----------------------------
  // 【新增】匯出功能
  // -----------------------------
  const btnExportCsv = document.getElementById("btnExportCsv");
  if(btnExportCsv) {
    btnExportCsv.addEventListener("click", exportToCSV);
  }
  
  const btnExportWord = document.getElementById("btnExportWord");
  if(btnExportWord) {
    btnExportWord.addEventListener("click", exportToWord);
  }
}

function resetMeasureState() {
  isMeasuring = false;
  const btnMeasure = document.getElementById("btnMeasure");
  btnMeasure.textContent = "線段量測";
  btnMeasure.style.backgroundColor = "";
  document.body.style.cursor = "default";
  measurePoints = [];
}

function dollyCamera(factor) {
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
  direction.multiplyScalar(factor);
  camera.position.copy(controls.target).add(direction);
  controls.update();
}

function onCanvasClick(event) {
  if (!isMeasuring || !loadedModel) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(loadedModel, true);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    addMeasurePoint(point);
  }
}

function addMeasurePoint(point) {
  measurePoints.push(point);

  // 標記點
  const sphereGeom = new THREE.SphereGeometry(0.3, 16, 16);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false }); 
  const sphere = new THREE.Mesh(sphereGeom, sphereMat);
  sphere.renderOrder = 999;
  sphere.position.copy(point);
  scene.add(sphere);
  measureObjects.push(sphere);

  // 兩點畫線
  if (measurePoints.length === 2) {
    const p1 = measurePoints[0];
    const p2 = measurePoints[1];

    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3, depthTest: false });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;
    scene.add(line);
    measureObjects.push(line);

    const dist = p1.distanceTo(p2);
    document.getElementById("measureText").textContent = `量測值：${dist.toFixed(3)} m`;
    measurePoints = [];
  }
}

// ===============================
// 匯出功能實作
// ===============================

// 1. 取得使用者輸入的資料
function getFormData() {
  return {
    bridgeName: document.getElementById("bridgeName").value || "未命名",
    roadId: document.getElementById("roadId").value || "無",
    structureType: document.getElementById("structureType").value,
    sedimentation: document.getElementById("sedimentation").value,
    clearance: document.getElementById("clearance").value,
    width: document.getElementById("width").value,
    length: document.getElementById("lengthRoadWidth").value,
    measureVal: document.getElementById("measureText").textContent.replace("量測值：", "")
  };
}

// 2. 匯出 CSV
function exportToCSV() {
  const data = getFormData();
  
  // 定義 CSV 內容 (含 BOM \uFEFF 讓 Excel 支援中文)
  let csvContent = "\uFEFF";
  csvContent += "項目,內容\n";
  csvContent += `橋名,${data.bridgeName}\n`;
  csvContent += `道路編號,${data.roadId}\n`;
  csvContent += `類型,${data.structureType}\n`;
  csvContent += `淤積程度,${data.sedimentation}\n`;
  csvContent += `淨高 (m),${data.clearance}\n`;
  csvContent += `寬度 (m),${data.width}\n`;
  csvContent += `長度 (m),${data.length}\n`;
  csvContent += `最近一次量測結果,${data.measureVal}\n`;

  // 建立 Blob 並下載
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${data.bridgeName}_資料表.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 3. 匯出 Word (.doc)
// 這裡使用 HTML 格式偽裝成 doc，Word 可以完美開啟
function exportToWord() {
  const data = getFormData();

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
       <meta charset="utf-8">
       <title>檢測報告</title>
       <style>
         body { font-family: '微軟正黑體', sans-serif; }
         table { border-collapse: collapse; width: 100%; }
         td, th { border: 1px solid #000; padding: 8px; text-align: left; }
         th { background-color: #f2f2f2; }
         h1 { text-align: center; }
       </style>
    </head>
    <body>
       <h1>橋梁構造物檢測報告</h1>
       <table>
         <tr><th width="30%">項目</th><th>內容</th></tr>
         <tr><td>橋名</td><td>${data.bridgeName}</td></tr>
         <tr><td>道路編號</td><td>${data.roadId}</td></tr>
         <tr><td>類型</td><td>${data.structureType}</td></tr>
         <tr><td>淤積程度</td><td>${data.sedimentation}</td></tr>
         <tr><td>淨高 (m)</td><td>${data.clearance}</td></tr>
         <tr><td>寬度 (m)</td><td>${data.width}</td></tr>
         <tr><td>長度 (m)</td><td>${data.length}</td></tr>
         <tr><td>畫面量測紀錄</td><td>${data.measureVal}</td></tr>
       </table>
       <br>
       <p>匯出時間：${new Date().toLocaleString()}</p>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${data.bridgeName}_報告.doc`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

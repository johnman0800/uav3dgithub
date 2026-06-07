// ==========================================
// 1. 智慧讀取憑證機制 (本機與 線上網址 雙軌安全制)
// ==========================================
let myToken = '';
let myAssetId = 0;

// 途徑 A：優先嘗試讀取本機電腦的 config.js 變數 (本機 localhost 測試時會走這條)
if (typeof CONFIG !== 'undefined' && CONFIG.CESIUM_TOKEN) {
    myToken = CONFIG.CESIUM_TOKEN;
    myAssetId = CONFIG.ASSET_ID;
} 
// 途徑 B：若不存在 config.js (如在公開的 GitHub Pages 上)，則改從「當前網址參數」動態抓取
else {
    const urlParams = new URLSearchParams(window.location.search);
    myToken = urlParams.get('token');
    const urlId = urlParams.get('id');
    if (urlId) {
        myAssetId = parseInt(urlId);
    }
}

// 安全防範：如果兩邊都沒抓到資料，則跳出提示並阻斷執行，防止網頁報錯
if (!myToken || !myAssetId) {
    alert("未偵測到 3D 模型憑證！\n\n【本機測試】：請確認資料夾內包含 config.js 檔案。\n【線上瀏覽】：請確認您使用的是帶有憑證參數的「專屬分享網址」。");
    throw new Error("Missing Cesium Token or Asset ID");
}

// 套用安全提取出的 Token
Cesium.Ion.defaultAccessToken = myToken;

// ==========================================
// 2. 初始化 Cesium 視窗設定
// ==========================================
const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    navigationHelpButton: false,
    baseLayerPicker: false
});

// 關閉內建全球底圖與大氣層
viewer.scene.globe.show = false; 
viewer.scene.skyAtmosphere.show = false; 

// 最佳化滑鼠滾輪靈敏度與縮放慣性
viewer.scene.screenSpaceCameraController.zoomFactor = 1.5;
viewer.scene.screenSpaceCameraController.inertiaZoom = 0.1;

// 載入 3D 區塊
async function loadModel() {
    try {
        const tileset = viewer.scene.primitives.add(
            await Cesium.Cesium3DTileset.fromIonAssetId(myAssetId)
        );
        
        // 🛠️ 初始視角參數微調區塊 (以公尺與角度為單位)
        const headingDeg = 0.0;   // Z 軸旋轉角度 (0=正北, 90=正東)
        const pitchDeg = -45.0;   // 俯仰角度 (-90=垂直俯視, 0=水平)
        const rangeMeters = 300.0; // 起始縮放距離 (公尺)
        
        const offsetX = 0.0;      // 東西向中心微調偏移 (公尺)
        const offsetY = 0.0;      // 南北向中心微調偏移 (公尺)
        const offsetZ = 0.0;      // 上下高度中心微調偏移 (公尺)
        
        const heading = Cesium.Math.toRadians(headingDeg);
        const pitch = Cesium.Math.toRadians(pitchDeg);
        const range = rangeMeters;
        const hpr = new Cesium.HeadingPitchRange(heading, pitch, range);

        const boundingSphere = tileset.boundingSphere;
        let targetCenter = Cesium.Cartesian3.clone(boundingSphere.center);
        
        if (offsetX !== 0.0 || offsetY !== 0.0 || offsetZ !== 0.0) {
            const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(boundingSphere.center);
            const localOffset = new Cesium.Cartesian3(offsetX, offsetY, offsetZ);
            targetCenter = Cesium.Matrix4.multiplyByPoint(enuMatrix, localOffset, new Cesium.Cartesian3());
        }

        const targetSphere = new Cesium.BoundingSphere(targetCenter, boundingSphere.radius);

        // 使用平滑相機對焦切入初始畫面
        viewer.camera.flyToBoundingSphere(targetSphere, {
            offset: hpr,
            duration: 1.5
        });

    } catch (error) {
        console.error('模型載入失敗：', error);
    }
}
loadModel();

// ==========================================
// 3. 表單資料轉存 Word (.doc) 功能
// ==========================================
function exportToWord() {
    const tableClone = document.getElementById("surveyTable").cloneNode(true);

    const originalCheckboxes = document.querySelectorAll("#surveyTable input[type='checkbox']");
    const clonedCheckboxes = tableClone.querySelectorAll("input[type='checkbox']");
    
    clonedCheckboxes.forEach((cb, index) => {
        const isChecked = originalCheckboxes[index].checked;
        const symbolSpan = document.createElement("span");
        symbolSpan.style.fontFamily = "'Microsoft JhengHei', sans-serif";
        symbolSpan.style.fontSize = "11pt";
        
        if (isChecked) {
            symbolSpan.innerText = "■ ";
        } else {
            symbolSpan.innerText = "□ ";
        }
        cb.parentNode.replaceChild(symbolSpan, cb);
    });

    const originalTexts = document.querySelectorAll("#surveyTable input[type='text']");
    const clonedTexts = tableClone.querySelectorAll("input[type='text']");
    
    clonedTexts.forEach((txt, index) => {
        const textValue = originalTexts[index].value;
        const textSpan = document.createElement("span");
        textSpan.style.fontFamily = "'Microsoft JhengHei', sans-serif";
        textSpan.style.fontSize = "11pt";
        
        if (textValue) {
            textSpan.innerText = textValue;
        } else {
            textSpan.innerText = txt.classList.contains("short-input") ? "____" : "__________";
        }
        txt.parentNode.replaceChild(textSpan, txt);
    });

    const formHtml = tableClone.outerHTML;

    const preHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>構造物調查表</title>
            <style>
                body { font-family: 'Microsoft JhengHei', sans-serif; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 2px solid black; padding: 8px; vertical-align: top; font-size: 11pt; line-height: 1.6; }
                .category-title { width: 20%; text-align: center; font-weight: bold; vertical-align: middle; }
            </style>
        </head>
        <body>
            <h2 style="text-align: center;">構造物調查表</h2>
    `;
    const postHtml = "</body></html>";
    const finalHtml = preHtml + formHtml + postHtml;

    const blob = new Blob(['\ufeff', finalHtml], {
        type: 'application/msword'
    });
    
    const downloadLink = document.createElement("a");
    document.body.appendChild(downloadLink);
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = '構造物調查表.doc';
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
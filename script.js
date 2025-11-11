const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');

const rebaScoreEl = document.getElementById('rebaScore');
const riskLevelEl = document.getElementById('riskLevel');
const startBtn = document.getElementById('startBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const weightInput = document.getElementById('weight');
const activityInput = document.getElementById('activity');

let pose;
let camera;
let useFrontCamera = false; // false = กล้องหลัง, true = กล้องหน้า

// ฟังก์ชันคำนวณมุม
function angle(a, b, c){
  const ab = {x: b.x - a.x, y: b.y - a.y};
  const cb = {x: b.x - c.x, y: b.y - c.y};
  const dot = ab.x*cb.x + ab.y*cb.y;
  const magAB = Math.sqrt(ab.x**2 + ab.y**2);
  const magCB = Math.sqrt(cb.x**2 + cb.y**2);
  const cosTheta = dot / (magAB*magCB);
  return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180/Math.PI);
}

// ประเมิน REBA แบบเต็ม
function calculateREBA(keypoints){
  let score = 0;
  const weight = parseFloat(weightInput.value) || 0;
  const activity = activityInput.value;

  // คอ
  if(keypoints[0] && keypoints[11] && keypoints[12]){
    const neckAngle = angle(keypoints[0], keypoints[11], keypoints[12]);
    if(neckAngle < 40 || neckAngle > 140) score += 2;
    else if(neckAngle < 60 || neckAngle > 120) score +=1;
  }

  // หลัง
  if(keypoints[11] && keypoints[23] && keypoints[25]){
    const backAngle = angle(keypoints[11], keypoints[23], keypoints[25]);
    if(backAngle < 140) score += 3;
    else if(backAngle < 160) score +=2;
    else score +=1;
  }

  // แขน
  if(keypoints[13] && keypoints[11] && keypoints[15]){
    const elbowAngle = angle(keypoints[11], keypoints[13], keypoints[15]);
    if(elbowAngle < 60 || elbowAngle > 120) score += 2;
  }

  // ขา
  if(keypoints[23] && keypoints[25] && keypoints[27]){
    const legAngle = angle(keypoints[23], keypoints[25], keypoints[27]);
    if(legAngle < 160) score += 2;
  }

  // น้ำหนักวัตถุ
  if(weight > 0){
    if(weight <= 5) score += 1;
    else if(weight <= 10) score += 2;
    else score += 3;
  }

  // กิจกรรมเสริม
  if(activity === "ก้ม") score +=1;
  if(activity === "ยกของ") score +=1;

  return score;
}

// ระดับความเสี่ยง
function getRiskLevel(score){
  if(score <= 3) return "ต่ำ";
  if(score <= 5) return "ปานกลาง";
  if(score <= 7) return "สูง";
  return "สูงมาก";
}

// เริ่ม MediaPipe Pose
function startAssessment(){
  pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults(onResults);

  startCamera();
}

// ฟังก์ชันเริ่มกล้อง (ปรับหน้า/หลัง)
function startCamera(){
  if(camera){
    camera.stop();
  }

  camera = new Camera(videoElement, {
    onFrame: async () => { await pose.send({image: videoElement}); },
    width: 640,
    height: 480,
    facingMode: useFrontCamera ? "user" : { exact: "environment" }
  });
  camera.start();
}

function onResults(results){
  canvasCtx.save();
  canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height);
  canvasCtx.drawImage(results.image, 0,0,canvasElement.width,canvasElement.height);

  if(results.poseLandmarks){
    for(const kp of results.poseLandmarks){
      canvasCtx.beginPath();
      canvasCtx.arc(kp.x * canvasElement.width, kp.y * canvasElement.height, 5,0,2*Math.PI);
      canvasCtx.fillStyle = 'red';
      canvasCtx.fill();
    }

    const score = calculateREBA(results.poseLandmarks);
    rebaScoreEl.textContent = score;
    riskLevelEl.textContent = getRiskLevel(score);
  }

  canvasCtx.restore();
}

// สลับกล้อง
switchCameraBtn.addEventListener('click', () => {
  useFrontCamera = !useFrontCamera;
  startCamera();
});

startBtn.addEventListener('click', startAssessment);

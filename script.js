const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const rebaScoreEl = document.getElementById('rebaScore');
const riskLevelEl = document.getElementById('riskLevel');
const startBtn = document.getElementById('startBtn');

let pose;

// ฟังก์ชันประเมิน REBA Score แบบพื้นฐาน
function calculateREBA(keypoints) {
  // ตัวอย่างง่าย: ประเมินตามมุมข้อศอกและหลัง
  let score = 0;

  // keypoints index จาก MediaPipe
  const leftElbow = keypoints[13]; // left elbow
  const leftShoulder = keypoints[11]; // left shoulder
  const leftWrist = keypoints[15]; // left wrist
  const nose = keypoints[0];
  const leftHip = keypoints[23];
  const leftKnee = keypoints[25];

  // คำนวณมุมข้อศอก (ประมาณ)
  function angle(a, b, c){
    const ab = {x: b.x - a.x, y: b.y - a.y};
    const cb = {x: b.x - c.x, y: b.y - c.y};
    const dot = ab.x*cb.x + ab.y*cb.y;
    const magAB = Math.sqrt(ab.x**2 + ab.y**2);
    const magCB = Math.sqrt(cb.x**2 + cb.y**2);
    const cosTheta = dot / (magAB*magCB);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
    return theta * (180/Math.PI);
  }

  if(leftElbow && leftShoulder && leftWrist) {
    const elbowAngle = angle(leftShoulder, leftElbow, leftWrist);
    if(elbowAngle < 60 || elbowAngle > 120) score += 1;
  }

  // คำนวณหลังแบบง่าย (คอ-สะโพก-เข่า)
  if(nose && leftHip && leftKnee){
    const backAngle = angle(nose, leftHip, leftKnee);
    if(backAngle < 160) score += 1;
  }

  return score;
}

// ระดับความเสี่ยง
function getRiskLevel(score){
  if(score <= 1) return "ต่ำ";
  if(score <= 2) return "ปานกลาง";
  if(score <= 3) return "สูง";
  return "สูงมาก";
}

// เริ่ม MediaPipe Pose
function startAssessment() {
  pose = new Pose({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  }});

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults(onResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => { await pose.send({image: videoElement}); },
    width: 640,
    height: 480
  });
  camera.start();
}

function onResults(results) {
  // วาด video
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  // วาด keypoints
  if(results.poseLandmarks){
    for(const kp of results.poseLandmarks){
      canvasCtx.beginPath();
      canvasCtx.arc(kp.x * canvasElement.width, kp.y * canvasElement.height, 5, 0, 2*Math.PI);
      canvasCtx.fillStyle = 'red';
      canvasCtx.fill();
    }

    // คำนวณ REBA score
    const score = calculateREBA(results.poseLandmarks);
    rebaScoreEl.textContent = score;
    riskLevelEl.textContent = getRiskLevel(score);
  }
  canvasCtx.restore();
}

startBtn.addEventListener('click', startAssessment);

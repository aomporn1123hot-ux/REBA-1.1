// script.js
// Prototype REBA from MediaPipe Pose landmarks (approximate mapping)

// ---- Utilities ----
function degreesBetween(a,b,c){
  // angle at point b formed by ba and bc
  const AB = {x: a.x - b.x, y: a.y - b.y, z: (a.z||0) - (b.z||0)};
  const CB = {x: c.x - b.x, y: c.y - b.y, z: (c.z||0) - (b.z||0)};
  const dot = AB.x*CB.x + AB.y*CB.y + AB.z*CB.z;
  const magA = Math.sqrt(AB.x*AB.x+AB.y*AB.y+AB.z*AB.z);
  const magC = Math.sqrt(CB.x*CB.x+CB.y*CB.y+CB.z*CB.z);
  if(magA*magC === 0) return 0;
  let cos = dot/(magA*magC);
  cos = Math.min(1, Math.max(-1, cos));
  return Math.round(Math.acos(cos) * 180/Math.PI);
}

// Map angle to REBA component score (approximate rules)
function scoreNeck(angle){
  // neck flexion/extension
  if(angle < 10) return 1;
  if(angle < 20) return 2;
  if(angle < 30) return 3;
  if(angle < 45) return 4;
  return 6;
}
function scoreTrunk(angle){
  if(angle < 5) return 1;
  if(angle < 20) return 2;
  if(angle < 60) return 3;
  return 4;
}
function scoreLegs(angle){
  // legs—based on sitting/standing posture (approx using hip-knee)
  if(angle > 160) return 1; // straight
  if(angle > 120) return 2; // slightly bent
  return 3; // deep bend / kneeling
}
function scoreUpperArm(angle){
  if(angle < 20) return 1;
  if(angle < 45) return 2;
  if(angle < 90) return 3;
  return 4;
}
function scoreLowerArm(angle){
  // elbow flexion (0 = straight)
  if(angle > 100) return 1;
  if(angle > 60) return 2;
  return 3;
}
function scoreWrist(angle){
  // wrist deviation / flexion (approx from landmarks)
  if(angle < 15) return 1;
  if(angle < 30) return 2;
  return 3;
}

// Simplified combination tables (approximation)
// Original REBA uses tables to convert A and B and add scores; here we use a small mapping:
function combineA(neckS, trunkS, legS){
  // approximate A-score: sum then map
  const sum = neckS + trunkS + legS;
  // mapping (made compact for prototype)
  if(sum <= 3) return 1;
  if(sum <= 5) return 2;
  if(sum <= 7) return 3;
  if(sum <= 9) return 4;
  return 5;
}
function combineB(upperS, lowerS, wristS){
  const sum = upperS + lowerS + wristS;
  if(sum <= 3) return 1;
  if(sum <= 5) return 2;
  if(sum <= 7) return 3;
  return 4;
}
function finalREBA(aScore,bScore,forceFlag,couplingFlag){
  // original REBA uses a large lookup table. Here approximate:
  let base = aScore + bScore;
  if(forceFlag) base += 2;
  if(couplingFlag) base += 1;
  // clamp and map to typical REBA 1-15 scale
  const val = Math.min(15, Math.max(1, Math.round(base * 1.5)));
  return val;
}
function riskLabelFromScore(score){
  if(score <= 3) return {text:'ต่ำมาก (Action not necessary)', color:'#2e7d32'};
  if(score <= 7) return {text:'ปานกลาง (บางครั้งต้องแก้ไข)', color:'#f9a825'};
  if(score <= 10) return {text:'สูง (ควรแก้ไขโดยเร็ว)', color:'#f57c00'};
  return {text:'สูงมาก (ต้องแก้ไขทันที)', color:'#c62828'};
}

// ---- MediaPipe setup ----
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

const rebaScoreEl = document.getElementById('rebaScore');
const riskLabelEl = document.getElementById('riskLabel');

const neckAngleEl = document.getElementById('neckAngle');
const trunkAngleEl = document.getElementById('trunkAngle');
const legAngleEl = document.getElementById('legAngle');
const upperArmAngleEl = document.getElementById('upperArmAngle');
const lowerArmAngleEl = document.getElementById('lowerArmAngle');
const wristAngleEl = document.getElementById('wristAngle');

const neckScoreEl = document.getElementById('neckScore');
const trunkScoreEl = document.getElementById('trunkScore');
const legScoreEl = document.getElementById('legScore');
const upperArmScoreEl = document.getElementById('upperArmScore');
const lowerArmScoreEl = document.getElementById('lowerArmScore');
const wristScoreEl = document.getElementById('wristScore');

const forceCheckbox = document.getElementById('forceCheckbox');
const couplingCheckbox = document.getElementById('couplingCheckbox');

const pose = new Pose({
  locateFile: (file) => https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}
});
pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
pose.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  },
  width: 1280,
  height: 720
});
camera.start();

function onResults(results){
  // resize canvas to video size
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;

  canvasCtx.save();
  canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height);
  // draw keypoints and skeleton
  if(results.poseLandmarks){
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color:'#00FF00', lineWidth:2});
    drawLandmarks(canvasCtx, results.poseLandmarks, {color:'#FF0000', lineWidth:1});
  }
  canvasCtx.restore();

  if(!results.poseLandmarks) return;
  const lm = results.poseLandmarks;

  // Landmark indices per MediaPipe Pose
  const NOSE = lm[0];
  const LEFT_SHOULDER = lm[11];
  const RIGHT_SHOULDER = lm[12];
  const LEFT_HIP = lm[23];
  const RIGHT_HIP = lm[24];
  const LEFT_ELBOW = lm[13];
  const RIGHT_ELBOW = lm[14];
  const LEFT_WRIST = lm[15];
  const RIGHT_WRIST = lm[16];
  const LEFT_KNEE = lm[25];
  const RIGHT_KNEE = lm[26];
  const LEFT_ANKLE = lm[27];
  const RIGHT_ANKLE = lm[28];

  // compute some central points (mid-shoulder, mid-hip)
  const midShoulder = {
    x: (LEFT_SHOULDER.x + RIGHT_SHOULDER.x)/2,
    y: (LEFT_SHOULDER.y + RIGHT_SHOULDER.y)/2,
    z: (LEFT_SHOULDER.z + RIGHT_SHOULDER.z)/2
  };
  const midHip = {
    x: (LEFT_HIP.x + RIGHT_HIP.x)/2,
    y: (LEFT_HIP.y + RIGHT_HIP.y)/2,
    z: (LEFT_HIP.z + RIGHT_HIP.z)/2
  };

  // --- Angles (approx) ---
  // Neck: angle between nose->midShoulder and vertical (we approximate by angle between nose-midShoulder and midShoulder-midHip)
  const neckAngle = degreesBetween(NOSE, midShoulder, midHip); // bigger = more flexion
  // Trunk: angle formed by midShoulder - midHip - midKnee (use mid knee)
  const midKnee = {
    x: (LEFT_KNEE.x + RIGHT_KNEE.x)/2,
    y: (LEFT_KNEE.y + RIGHT_KNEE.y)/2,
    z: (LEFT_KNEE.z + RIGHT_KNEE.z)/2
  };
  const trunkAngle = degreesBetween(midShoulder, midHip, midKnee);
  // Legs: angle at hip using hip-knee-ankle
  const leftLegAngle = degreesBetween(LEFT_HIP, LEFT_KNEE, LEFT_ANKLE);
  const rightLegAngle = degreesBetween(RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE);
  const legAngle = Math.round((leftLegAngle + rightLegAngle)/2);

  // Upper arm: shoulder-elbow-vertical: angle at shoulder between midShoulder-elbow and midShoulder-midHip
  const leftUpperArm = degreesBetween(LEFT_ELBOW, LEFT_SHOULDER, midHip);
  const rightUpperArm = degreesBetween(RIGHT_ELBOW, RIGHT_SHOULDER, midHip);
  const upperArmAngle = Math.round((leftUpperArm + rightUpperArm)/2);

  // Lower arm: angle at elbow (shoulder-elbow-wrist)
  const leftLowerArm = degreesBetween(LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST);
  const rightLowerArm = degreesBetween(RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST);
  const lowerArmAngle = Math.round((leftLowerArm + rightLowerArm)/2);

  // Wrist: angle at wrist (elbow-wrist-index) - MediaPipe has hand not included; crude: elbow-wrist-hip
  const leftWristAngle = degreesBetween(LEFT_ELBOW, LEFT_WRIST, LEFT_HIP);
  const rightWristAngle = degreesBetween(RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP);
  const wristAngle = Math.round((leftWristAngle + rightWristAngle)/2);

  // --- get component scores ---
  const neckS = scoreNeck(neckAngle);
  const trunkS = scoreTrunk(trunkAngle);
  const legS = scoreLegs(legAngle);

  const upperS = scoreUpperArm(upperArmAngle);
  const lowerS = scoreLowerArm(lowerArmAngle);
  const wristS = scoreWrist(wristAngle);

  // combine A & B
  const A = combineA(neckS, trunkS, legS);
  const B = combineB(upperS, lowerS, wristS);

  const forceFlag = forceCheckbox.checked;
  const couplingFlag = couplingCheckbox.checked;

  const final = finalREBA(A, B, forceFlag, couplingFlag);
  const risk = riskLabelFromScore(final);

  // --- update UI ---
  rebaScoreEl.textContent = final;
  riskLabelEl.textContent = risk.text;
  riskLabelEl.style.background = risk.color;
  riskLabelEl.style.color = '#fff';

  neckAngleEl.textContent = neckAngle;
  trunkAngleEl.textContent = trunkAngle;
  legAngleEl.textContent = legAngle;
  upperArmAngleEl.textContent = upperArmAngle;
  lowerArmAngleEl.textContent = lowerArmAngle;
  wristAngleEl.textContent = wristAngle;

  neckScoreEl.textContent = neckS;
  trunkScoreEl.textContent = trunkS;
  legScoreEl.textContent = legS;
  upperArmScoreEl.textContent = upperS;
  lowerArmScoreEl.textContent = lowerS;
  wristScoreEl.textContent = wristS;
}

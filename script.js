const circle = document.getElementById('circle');
const instruction = document.getElementById('instruction');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const soundToggle = document.getElementById('sound-toggle');
const soundType = document.getElementById('sound-type');
const methodSelect = document.getElementById('method-select');
const durationInput = document.getElementById('duration-input');
const timerDisplay = document.getElementById('timer-display');

const methods = {
    box: { inhale: 4000, hold1: 4000, exhale: 4000, hold2: 4000 },
    '478': { inhale: 4000, hold1: 7000, exhale: 8000, hold2: 0 },
    equal: { inhale: 5000, hold1: 0, exhale: 5000, hold2: 0 }
};

let currentMethod = methods.box;
let totalCycleTime = currentMethod.inhale + currentMethod.hold1 + currentMethod.exhale + currentMethod.hold2;

let isRunning = false;
let timerInterval;
let phaseTimeout = null;
let audioCtx = null;
let remainingSeconds = 0;
let wakeLock = null;

// Request Screen Wake Lock
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
            });
            console.log('Screen Wake Lock acquired');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

// Release Screen Wake Lock
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
            });
    }
}

// Re-request wake lock if tab becomes visible again while running
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible' && isRunning) {
        await requestWakeLock();
    }
});

// Initialize Web Audio API
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Play a simple tone for cues
function playTone(frequency, duration) {
    if (!soundToggle.checked) return;
    
    if (!audioCtx) initAudio();
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

// Play a bell sound to indicate completion
function playBell() {
    if (!audioCtx) initAudio();
    
    // Base frequency for bell
    const baseFreq = 400;
    
    // Create multiple oscillators for harmonics
    const harmonics = [1, 1.2, 1.5, 2];
    
    harmonics.forEach(mult => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = baseFreq * mult;
        
        // Attack
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5 / harmonics.length, audioCtx.currentTime + 0.05);
        
        // Decay
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 4);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 4);
    });
}

function clearTimeouts() {
    if (phaseTimeout !== null) {
        clearTimeout(phaseTimeout);
        phaseTimeout = null;
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
    const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${minutes}:${seconds}`;
}

// Speak text for voice cues
function speakText(text) {
    if (!soundToggle.checked || soundType.value !== 'voice') return;
    
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

function playCue(type, text, frequency, duration) {
    if (!soundToggle.checked) return;
    if (soundType.value === 'voice') {
        speakText(text);
    } else {
        playTone(frequency, duration);
    }
}

function playPhase(phaseName) {
    if (!isRunning) return;

    if (phaseName === 'inhale') {
        instruction.innerText = 'Inhale...';
        circle.style.transition = `transform ${currentMethod.inhale}ms linear`;
        circle.classList.add('grow');
        circle.classList.remove('shrink');
        playCue('inhale', 'Inhale', 300, 0.5);
        
        let nextPhase = currentMethod.hold1 > 0 ? 'hold1' : 'exhale';
        phaseTimeout = setTimeout(() => playPhase(nextPhase), currentMethod.inhale);
        
    } else if (phaseName === 'hold1') {
        instruction.innerText = 'Hold...';
        playCue('hold', 'Hold', 400, 0.2);
        
        let nextPhase = 'exhale';
        phaseTimeout = setTimeout(() => playPhase(nextPhase), currentMethod.hold1);
        
    } else if (phaseName === 'exhale') {
        instruction.innerText = 'Exhale...';
        circle.style.transition = `transform ${currentMethod.exhale}ms linear`;
        circle.classList.remove('grow');
        circle.classList.add('shrink');
        playCue('exhale', 'Exhale', 300, 0.5);
        
        let nextPhase = currentMethod.hold2 > 0 ? 'hold2' : 'inhale';
        phaseTimeout = setTimeout(() => playPhase(nextPhase), currentMethod.exhale);
        
    } else if (phaseName === 'hold2') {
        instruction.innerText = 'Hold...';
        playCue('hold', 'Hold', 400, 0.2);
        
        let nextPhase = 'inhale';
        phaseTimeout = setTimeout(() => playPhase(nextPhase), currentMethod.hold2);
    }
}

function startBreathing() {
    initAudio();
    requestWakeLock();
    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    methodSelect.disabled = true;
    durationInput.disabled = true;
    
    // Initialize Timer
    remainingSeconds = parseInt(durationInput.value) * 60;
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay();
        
        if (remainingSeconds <= 0) {
            stopBreathing(true); // pass true to indicate normal completion
        }
    }, 1000);
    
    playPhase('inhale');
}

function stopBreathing(completed = false) {
    releaseWakeLock();
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    methodSelect.disabled = false;
    durationInput.disabled = false;
    
    clearInterval(timerInterval);
    clearTimeouts();
    
    if (completed) {
        instruction.innerText = 'Session Completed';
        playBell();
    } else {
        instruction.innerText = 'Press Start to begin';
        remainingSeconds = parseInt(durationInput.value) * 60;
        updateTimerDisplay();
    }
    
    circle.style.transition = `transform 1s linear`;
    circle.classList.remove('grow');
    circle.classList.remove('shrink');
}

methodSelect.addEventListener('change', (e) => {
    currentMethod = methods[e.target.value];
    totalCycleTime = currentMethod.inhale + currentMethod.hold1 + currentMethod.exhale + currentMethod.hold2;
});

durationInput.addEventListener('input', () => {
    if (!isRunning) {
        let val = parseInt(durationInput.value);
        if (isNaN(val) || val < 1) val = 1;
        remainingSeconds = val * 60;
        updateTimerDisplay();
    }
});

// Initial display setup
remainingSeconds = parseInt(durationInput.value) * 60;
updateTimerDisplay();

startBtn.addEventListener('click', startBreathing);
stopBtn.addEventListener('click', stopBreathing);

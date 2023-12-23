// index_combined.js

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
if (!audioContext) {
    alert('Web Audio API is not supported in this browser');
}

let trimSettings, BPM, sequenceData;
const activeSources = new Set();
let isLooping = true;
let isStoppedManually = false;
let cumulativeOffset = 0;  // Added cumulative offset for seamless playback

const functionCallTracker = {};

const trackFunctionCall = (functionName) => {
    if (functionCallTracker[functionName]) {
        functionCallTracker[functionName]++;
    } else {
        functionCallTracker[functionName] = 1;
    }
};

const reviewFunctionCalls = () => {
    console.log('Function Call Tracker:', functionCallTracker);
};

const customLog = (message, isError = false) => {
    const logFunction = isError ? console.error : console.log;
    logFunction(message);
};

// Function to convert base64 to an array buffer
function base64ToArrayBuffer(base64) {
    trackFunctionCall('base64ToArrayBuffer');
    customLog('base64ToArrayBuffer entered');
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}


// Function to decode audio data
const decodeAudioData = (audioData) => {
    trackFunctionCall('decodeAudioData');
    console.log('decodeAudioData entered');
    return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(audioData, resolve, reject);
    });
};

// Improved and optimized loadAudioFile function
const loadAudioFile = async (url) => {
    trackFunctionCall('loadAudioFile');
    console.log('loadAudioFile entered...');
    if (!url) {
        customLog('Encountered invalid or missing URL', true);
        return null;
    }

    try {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type');

        switch (true) {
            case contentType.includes('audio/'):
                customLog(`Loading direct audio file with type: ${contentType}`);
                return processFile(response, 'audio');
            case contentType.includes('application/json'):
                customLog(`Loading a JSON file that might contain audio data: ${contentType}`);
                return processFile(response, 'json');
            default:
                customLog(`Unknown content type: ${contentType}`, true);
                return null;
        }
    } catch (error) {
        customLog(`Error loading audio file: ${error}`, true);
        return null;
    }
};


// Handles direct audio files
const processFile = async (response, type) => {
    trackFunctionCall('processFile');
    try {
        const data = type === 'audio' ? await response.arrayBuffer() : await response.json();
        if (type === 'json' && data.audioData && typeof data.audioData === 'string') {
            return decodeAudioData(base64ToArrayBuffer(data.audioData.split(',')[1]));
        } else if (type === 'audio') {
            return decodeAudioData(data);
        }
        log('Invalid or unsupported data type', true);
        return null;
    } catch (error) {
        log(`Error processing file: ${error}`, true);
        return null;
    }
};

const calculateTrimTimes = (trimSetting, totalDuration) => {
    trackFunctionCall('calculateTrimTimes');
    customLog(`calculateTrimTimes entered for trim setting: ${JSON.stringify(trimSetting)}`);
    const startTime = Math.max(0, Math.min((trimSetting.startSliderValue / 100) * totalDuration, totalDuration));
    const endTime = (trimSetting.endSliderValue / 100) * totalDuration;
    return { startTime, duration: Math.max(0, endTime - startTime) };
};

const calculateStepTime = () => 60 / BPM / 4;

// Modified to include cumulativeOffset in playbackTime
const createAndStartAudioSource = (audioBuffer, trimSetting, playbackTime) => {
    trackFunctionCall('createAndStartAudioSource');
    customLog(`Creating and starting audio source. Active sources: ${activeSources.size}`);
    if (!audioBuffer) return;

    const source = audioContext.createBufferSource();
    const { startTime, duration } = calculateTrimTimes(trimSetting, audioBuffer.duration);
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(audioContext.currentTime + playbackTime + cumulativeOffset, startTime, duration);

    source.onended = () => handleSourceEnd(source);
    activeSources.add(source);
};

const handleSourceEnd = (source) => {
    trackFunctionCall('handleSourceEnd');
    customLog(`Handling source end. Active sources remaining: ${activeSources.size}`);
    activeSources.delete(source);
    customLog(`Handling source end. Active sources remaining: ${activeSources.size}`);
    if (activeSources.size === 0 && isLooping && !isStoppedManually) {
        customLog('All sources ended, looping is true. Starting playback again.');
        playAudio();
    } else {
        customLog('Playback finished or stopped manually.');
    }
};

const schedulePlaybackForStep = (audioBuffer, trimSetting, stepIndex) => {
    trackFunctionCall('schedulePlaybackForStep');
    customLog(`schedulePlaybackForStep entered with stepIndex: ${stepIndex}`);
    const playbackTime = stepIndex * calculateStepTime();
    createAndStartAudioSource(audioBuffer, trimSetting, playbackTime);
};

// Optimized playAudio function
const playAudio = async () => {
    trackFunctionCall('playAudio');
    customLog('playAudio entered...');
    if (!validateSequenceData(sequenceData)) {
        return customLog("No valid sequence data available. Cannot play audio.", true);
    }
    const { projectURLs, projectSequences, projectBPM, trimSettings } = sequenceData;
    BPM = projectBPM; // Set global BPM

    stopAudio();  // Ensure any previous playback is stopped

    cumulativeOffset = 0;  // Reset cumulative offset

    const audioBuffers = await loadAudioBuffers(projectURLs);
    if (!isValidAudioBuffers(audioBuffers)) {
        return customLog("No valid audio data available for any channel. Cannot play audio.", true);
    }

    scheduleSequences(projectSequences, audioBuffers, trimSettings);

    handlePlaybackCompletion();
};

const validateSequenceData = (data) => {
    trackFunctionCall('validateSequenceData');
    customLog(`validateSequenceData entered with data: ${JSON.stringify(data)}`);
    return data && data.projectURLs && data.projectSequences;
};

const loadAudioBuffers = async (urls) => {
    trackFunctionCall('loadAudioBuffers');
    customLog(`loadAudioBuffers entered with urls: ${JSON.stringify(urls)}`);
    return Promise.all(urls.map(loadAudioFile));
};

const isValidAudioBuffers = (buffers) => {
    trackFunctionCall('isValidAudioBuffers');
    customLog(`isValidAudioBuffers entered with buffers: ${JSON.stringify(buffers)}`);
    return buffers.some(buffer => buffer);
};

const scheduleSequences = (sequences, audioBuffers, trimSettings) => {
    trackFunctionCall('scheduleSequences');
    customLog(`ScheduleSequences entered with sequences: ${JSON.stringify(sequences)}`);
    Object.entries(sequences).forEach(([sequenceName, channels]) => {
        const sequenceDuration = 64 * calculateStepTime();
        scheduleChannels(channels, audioBuffers, trimSettings);
        cumulativeOffset += sequenceDuration;  // Increment cumulativeOffset
    });
};

const scheduleChannels = (channels, audioBuffers, trimSettings) => {
    trackFunctionCall('scheduleChannels');
    customLog(`ScheduleChannels entered with channels: ${JSON.stringify(channels)}`);
    Object.entries(channels).forEach(([channelName, channelData], channelIndex) => {
        const steps = channelData.steps;
        const audioBuffer = audioBuffers[channelIndex];
        const trimSetting = trimSettings[channelIndex];
        if (audioBuffer && steps) {
            steps.forEach((active, stepIndex) => {
                if (active) {
                    schedulePlaybackForStep(audioBuffer, trimSetting, stepIndex);
                }
            });
        }
    });
};

const handlePlaybackCompletion = () => {
    trackFunctionCall('handlePlaybackCompletion');
    customLog("HandlePlaybackCompletion entered");
    isStoppedManually = false;
    customLog("Scheduled playback for active steps in available sequences and channels");
    if (activeSources.size === 0 && isLooping) {
        customLog('No active sources at start of playAudio, looping is true. Starting playback again.');
        playAudio();
    } else {
        customLog('Active sources remain at the start of playAudio or stop was manual.');
    }
};

const stopAudio = () => {
    trackFunctionCall('stopAudio');
    customLog("Stopping audio playback");
    activeSources.forEach(source => {
        source.stop();
        source.disconnect();
    });
    activeSources.clear();
    customLog("All audio playback stopped and sources disconnected");
};

const setupUIHandlers = () => {
    trackFunctionCall('setupUIHandlers');
    log('Setting up UI handlers');

    const setupButtonHandler = (buttonId, handler) => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', handler);
        }
    };

    const setupFileInputHandler = (inputId, handler) => {
        trackFunctionCall('setupFileInputHandler');
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('change', handler);
        }
    };

    setupButtonHandler('playButton', () => {
        isLooping = true;
        log('Play button pressed, attempting to start playback.');
        playAudio();
    });

    setupButtonHandler('stopButton', () => {
        isStoppedManually = true;
        log('Stop button pressed, calling stopAudio.');
        stopAudio();
    });

    setupFileInputHandler('fileInput', async (event) => {
        try {
            sequenceData = await processAndLoadAudio(event.target.files[0], loadAudioFile);
            const playButton = document.getElementById('playButton');
            if (sequenceData && sequenceData.projectURLs.some(url => url)) {
                if (playButton) playButton.disabled = false;
                log("File loaded successfully. Ready to play. Click the play button!");
            } else {
                if (playButton) playButton.disabled = true;
                log("No valid audio URLs found in the sequence data.", true);
            }
        } catch (err) {
            const playButton = document.getElementById('playButton');
            if (playButton) playButton.disabled = true;
            log(`Error processing sequence data: ${err}`, true);
        }
    });
};


// loadJsonFromLocal.js

const log = (message, isError = false) => console[isError ? 'error' : 'log'](message);

const validateAudioData = (data) => {
    trackFunctionCall('validateAudioData');
    customLog(`Validating JSON file entered:`);
    if (!data.trimSettings || !data.projectSequences?.Sequence0?.ch0?.steps || data.projectSequences.Sequence0.ch0.steps.length !== 64 || !data.projectBPM) {
        throw new Error('Invalid or missing data in JSON');
    }
};

const readFileAsJSON = (file) => new Promise((resolve, reject) => {
    trackFunctionCall('readFileAsJSON');
    customLog(`Reading JSON file entered:`);
    const reader = new FileReader();
    reader.onload = e => resolve(JSON.parse(e.target.result));
    reader.onerror = err => reject(err);
    reader.readAsText(file);
});

const processAndLoadAudio = async (file, loadAudioFile) => {
    trackFunctionCall('processAndLoadAudio');
    log(`Processing JSON file: ${file.name}`);
    try {
        const sequenceData = await readFileAsJSON(file);
        validateAudioData(sequenceData);
        // analyzeJSONFormat(sequenceData);
        return sequenceData;
    } catch (err) {
        log('Error processing file:', true);
        throw err;
    }
};

setupUIHandlers();

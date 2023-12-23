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

const customLog = (message, isError = false) => {
    const logFunction = isError ? console.error : console.log;
    logFunction(message);
};

// Function to convert base64 to an array buffer
function base64ToArrayBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}


// Function to decode audio data
const decodeAudioData = (audioData) => {
    console.log('decodeAudioData entered');
    return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(audioData, resolve, reject);
    });
};

// Improved and optimized loadAudioFile function
const loadAudioFile = async (url) => {
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
    try {
        if (type === 'audio') {
            const audioData = await response.arrayBuffer();
            return decodeAudioData(audioData);
        } else if (type === 'json') {
            const jsonData = await response.json();
            if (jsonData.audioData && typeof jsonData.audioData === 'string') {
                console.log('Found base64 audio data:', jsonData.audioData);
                const audioData = base64ToArrayBuffer(jsonData.audioData.split(',')[1]);
                return decodeAudioData(audioData);
            } else {
                customLog('JSON does not contain base64 encoded audio data', true);
                return null;
            }
        } else {
            customLog('Unsupported file type for processing', true);
            return null;
        }
    } catch (error) {
        customLog(`Error processing file: ${error}`, true);
        return null;
    }
};

const calculateTrimTimes = (trimSetting, totalDuration) => {
    const startTime = Math.max(0, Math.min((trimSetting.startSliderValue / 100) * totalDuration, totalDuration));
    const endTime = (trimSetting.endSliderValue / 100) * totalDuration;
    return { startTime, duration: Math.max(0, endTime - startTime) };
};

const calculateStepTime = () => 60 / BPM / 4;

// Modified to include cumulativeOffset in playbackTime
const createAndStartAudioSource = (audioBuffer, trimSetting, playbackTime) => {
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
    const playbackTime = stepIndex * calculateStepTime();
    createAndStartAudioSource(audioBuffer, trimSetting, playbackTime);
};

// Optimized playAudio function
const playAudio = async () => {
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
    return data && data.projectURLs && data.projectSequences;
};

const loadAudioBuffers = async (urls) => {
    return Promise.all(urls.map(loadAudioFile));
};

const isValidAudioBuffers = (buffers) => {
    return buffers.some(buffer => buffer);
};

const scheduleSequences = (sequences, audioBuffers, trimSettings) => {
    Object.entries(sequences).forEach(([sequenceName, channels]) => {
        const sequenceDuration = 64 * calculateStepTime();
        scheduleChannels(channels, audioBuffers, trimSettings);
        cumulativeOffset += sequenceDuration;  // Increment cumulativeOffset
    });
};

const scheduleChannels = (channels, audioBuffers, trimSettings) => {
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
    activeSources.forEach(source => {
        source.stop();
        source.disconnect();
    });
    activeSources.clear();
    customLog("All audio playback stopped and sources disconnected");
};

const setupUIHandlers = () => {
    // Ensure elements exist before adding event listeners
    const playButton = document.getElementById('playButton');
    const stopButton = document.getElementById('stopButton');
    const fileInput = document.getElementById('fileInput');

    if (playButton) {
        playButton.addEventListener('click', () => {
            
            isLooping = true;
            customLog('Play button pressed, attempting to start playback.');
            playAudio();
        });
    }

    if (stopButton) {
        stopButton.addEventListener('click', () => {
            isStoppedManually = true;
            customLog('Stop button pressed, calling stopAudio.');
            stopAudio();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
            try {
                // Assuming processAndLoadAudio is defined elsewhere
                sequenceData = await processAndLoadAudio(event.target.files[0], loadAudioFile);
                if (sequenceData && sequenceData.projectURLs.some(url => url)) {
                    playButton.disabled = false;
                    customLog("File loaded successfully. Ready to play. Click the play button!");
                } else {
                    customLog("No valid audio URLs found in the sequence data.", true);
                    playButton.disabled = true;
                }
            } catch (err) {
                playButton.disabled = true;
                customLog(`Error processing sequence data: ${err}`, true);
            }
        });
    }
};

// loadJsonFromLocal.js

const log = (message, isError = false) => console[isError ? 'error' : 'log'](message);

const validateAudioData = (data) => {
    if (!data.trimSettings || !data.projectSequences?.Sequence0?.ch0?.steps || data.projectSequences.Sequence0.ch0.steps.length !== 64 || !data.projectBPM) {
        throw new Error('Invalid or missing data in JSON');
    }
};

const readFileAsJSON = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(JSON.parse(e.target.result));
    reader.onerror = err => reject(err);
    reader.readAsText(file);
});

// const analyzeJSONFormat = (data) => {
//     log('Analyzing JSON format and content:', false);
// 
//     // Loop through each URL in the data and analyze its content
//     if (data.projectURLs) {
//         data.projectURLs.forEach(async (url, index) => {
//             if (typeof url === 'string' && url.trim() !== '') {
//                 try {
//                     const response = await fetch(url, { method: 'HEAD' }); // Using HEAD to get headers without downloading the whole file
//                     const contentType = response.headers.get('content-type');
// 
//                     if (contentType.includes('audio/')) {
//                         log(`URL ${index} is direct audio: ${url} with type ${contentType}`);
//                     } else if (contentType.includes('application/json')) {
//                         log(`URL ${index} is a JSON file that might contain audio data: ${url}`);
//                     } else {
//                         log(`URL ${index} is of unknown type: ${url}`);
//                     }
//                 } catch (error) {
//                     log(`Error analyzing URL ${index}: ${url} with error: ${error}`, true);
//                 }
//             } else {
//                 log(`URL ${index} is invalid or empty`, true);
//             }
//         });
//     } else {
//         log('No projectURLs found in the data to analyze.', true);
//     }
// };

const processAndLoadAudio = async (file, loadAudioFile) => {
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

import { sessionManager } from '../utils/sessionManager.js';

export const state = {
    converter: null,
    mediaRecorder: null,
    stream: null,
    webmBlob: null,
    mp4Blob: null,
    isRecording: false,
    recordedChunks: [],
    recordingTimer: null,
    recordingSeconds: 0,
    recordingStartTime: 0,
    actualRecordingDuration: 0,
    cameraInitialized: false,
    videoDuration: 0,
    isConverting: false,
    conversionStartTime: 0,
    conversionTimeFormatted: '',
    compressionRatioStr: '',
    currentConversionPromise: null,
    progressCalculator: null,
    
    // 互斥操作状态
    isCompositing: false,
    operationInProgress: false,
    
    // 摄像头检测
    cameraStatusCheckCount: 0,
    lastCameraStatus: null,
    cameraStatusTimer: null
};

export const CAMERA_STATUS_STABLE_COUNT = 3;

// IndexedDB Helper for Large Blobs
const DB_NAME = 'WebMToMp4DB';
const STORE_NAME = 'VideoBlobs';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function persistState() {
    if (!state.webmBlob) return;
    
    const sid = sessionManager.getSid();
    if (!sid) return;

    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        // Save both blobs if they exist
        const data = {
            webm: state.webmBlob,
            mp4: state.mp4Blob,
            videoDuration: state.videoDuration,
            conversionTimeFormatted: state.conversionTimeFormatted,
            compressionRatioStr: state.compressionRatioStr
        };
        
        await new Promise((resolve, reject) => {
            const req = store.put(data, sid);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        
        sessionStorage.setItem(`hasRecorded_${sid}`, 'true');
        console.log('[State] Video blobs persisted to IndexedDB for sid:', sid);
    } catch (e) {
        console.error('[State] Failed to persist state:', e);
    }
}

export async function restoreState() {
    const sid = sessionManager.getSid();
    if (!sid) return false;

    const hasRecorded = sessionStorage.getItem(`hasRecorded_${sid}`);
    if (hasRecorded !== 'true') return false;

    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        
        const data = await new Promise((resolve, reject) => {
            const req = store.get(sid);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        if (data && data.webm) {
            console.log('[State] Restored video blobs from IndexedDB for sid:', sid);
            state.webmBlob = data.webm;
            if (data.mp4) state.mp4Blob = data.mp4;
            if (data.videoDuration) state.videoDuration = data.videoDuration;
            if (data.conversionTimeFormatted) state.conversionTimeFormatted = data.conversionTimeFormatted;
            if (data.compressionRatioStr) state.compressionRatioStr = data.compressionRatioStr;
            return true;
        }
    } catch (e) {
        console.error('[State] Failed to restore state:', e);
    }
    return false;
}

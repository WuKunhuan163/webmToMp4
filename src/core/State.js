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

import { supabase, initializeSpeechRecognition, uploadToSupabase} from './app';
import OpenAI from "openai";

// DOM Elements
const videoElement = document.getElementById('preview');
const startButton = document.getElementById('startCapture');
const stopButton = document.getElementById('stopCapture');
const snapshotButton = document.getElementById('takeSnapshot');
const statusDiv = document.getElementById('status'); // Optional: To display status messages

let localStream = null;
let recognition = null;
let user_name = null;
let isNameCaptured = false;
let isPictureCaptured = false;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY, dangerouslyAllowBrowser: true,
});

// Event Listeners
startButton?.addEventListener('click', startCapture);
stopButton?.addEventListener('click', stopCapture);
snapshotButton?.addEventListener('click', takeSnapshot);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to start media capture
export async function startCapture() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    localStream = stream;
    if (recognition) {
      recognition.stop();
      console.log('Speech recognition stopped before playing TTS');
    }
    if (!isNameCaptured) {
      generateAndPlaySpeech("Hi, what's your name?");
      await delay(2500);
    }

    recognition = initializeSpeechRecognition(
      async (transcript) => {
        console.log('Recognized transcript:', transcript);
        if (!isNameCaptured) {
          user_name = transcript
          console.log('User name:', user_name)
          isNameCaptured = true;
          await takeSnapshot();
          generateAndPlaySpeech(`What project are you working on?`);
        } else {
          const payload = {
            user_id: user_name,
            text: transcript,
            history: "aaa",
          };
          sendTranscript(payload);
        }
      },
      (error) => console.error('Speech recognition error:', error)
    );

    if (recognition) {
      recognition.start();
      console.log('Speech recognition started.');
    }

    startButton.disabled = true;
    stopButton.disabled = false;
    snapshotButton.disabled = false;

    console.log('Media capture started.');
  } catch (error) {
    console.error('Error starting camera:', error);
  }
}

// Function to stop media capture
function stopCapture() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    console.log('Speech recognition stopped.');
  }

  user_name = null;
  isPictureCaptured = false;
  isNameCaptured = false;

  videoElement.srcObject = null;

  startButton.disabled = false;
  stopButton.disabled = true;
  snapshotButton.disabled = true;

  console.log('Media capture stopped.');
}

async function takeSnapshot() {
  if (!localStream) return;

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  if (blob) {
    const fileName = `snapshot-${Date.now()}.png`;
    console.log('Taking snapshot...');
    isNameCaptured = true;
    
    // Only pass user_name if it exists
    if (user_name) {
      await uploadToSupabase(blob, fileName, user_name);
    } else {
      console.log('User name not captured yet, uploading image only');
      await uploadToSupabase(blob, fileName);
    }
  }
}

let isTextToSpeechPlaying = false;

async function generateAndPlaySpeech(inputText) {
  try {
    // Stop recognition while TTS is about to play
    if (recognition) {
      recognition.stop();
      console.log('Speech recognition paused for TTS');
    }
    isTextToSpeechPlaying = true;

    console.log("Generating speech for:", inputText);

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: inputText,
    });

    console.log("Speech generated successfully");

    const audioBlob = new Blob([new Uint8Array(await mp3.arrayBuffer())], {
      type: "audio/mpeg",
    });

    const audioURL = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioURL);

    audio.addEventListener('play', () => console.log('Audio started playing'));
    audio.addEventListener('ended', () => {
      console.log('Audio finished playing');

      // Resume recognition after TTS finishes
      if (localStream && isNameCaptured) { // Only restart if we're still in a capture session
        recognition = initializeSpeechRecognition(
          (transcript) => {
            console.log('Recognized transcript:', transcript);
            transcript = { "user_id": user_name, "text": transcript, "history": "aaa" }
            sendTranscript(transcript);
          },
          (error) => console.error('Speech recognition error:', error)
        );
        recognition.start();
        console.log('Speech recognition resumed after TTS');
      }
      isTextToSpeechPlaying = false;
      URL.revokeObjectURL(audioURL);
    });

    audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      isTextToSpeechPlaying = false;
    });

    try {
      await audio.play();
      console.log("Audio playback started!");
    } catch (playError) {
      console.error("Playback error:", playError);
      isTextToSpeechPlaying = false;
    }

  } catch (error) {
    console.error("Error in generateAndPlaySpeech:", error);
    if (error.response) {
      console.error("OpenAI API Error:", await error.response.text());
    }
    isTextToSpeechPlaying = false;
  }
}

function sendTranscript(transcript) {
  const url = import.meta.env.VITE_BACKEND_URL
  console.log(url)
  console.log('Sending request:', transcript)
  fetch(`${url}chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transcript)
  })
    .then((response) => response.json())
    .then(async (data) => {
      console.log('Backend response:', data);
      if (data?.response) {
        if (data.response == 'a') {
          // inputText = "Thank you for using spai! We've stored your data. All the best for the results!"
          user_name = null;
          isPictureCaptured = false;
          isNameCaptured = false;
          // generateAndPlaySpeech(inputText);
          startCapture()
        }
        generateAndPlaySpeech(data.response);
      }
    })
    .catch((error) => console.error('Error sending transcript to backend:', error));
}

function initializeWakeWordDetection() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = async (event) => {
    const lastResultIndex = event.results.length - 1;
    const transcript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
    if (transcript.includes('hey') || transcript.includes('hay')) {
      console.log('Wake word detected!');
      recognition.stop();  // Stop listening for wake word
      await startCapture();  // Start the main capture process
    }
  };

  recognition.onend = () => {
    // Restart wake word detection if we're not in capture mode
    if (!localStream) {
      recognition.start();
    }
  };

  recognition.onerror = (event) => {
    console.error('Wake word detection error:', event.error);
  };

  return recognition;
}

"use client";

import { aiApi } from "@/api/client";

let activeAudio: HTMLAudioElement | null = null;

export function stopEnglishTts() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function playAudioUrl(url: string) {
  stopEnglishTts();
  const audio = new Audio(url);
  activeAudio = audio;

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      activeAudio = null;
      reject(new Error("audio playback failed"));
    };
    audio.play().catch(reject);
  });
}

async function speakWithBrowser(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("speech synthesis is unavailable");
  }

  stopEnglishTts();
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
    if (voices.length > 0) {
      utterance.voice =
        voices.find((voice) => /Google|Natural|Neural/i.test(voice.name)) || voices[0];
    }
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("browser speech failed"));
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakEnglishText(
  text: string,
  options: {
    model?: string;
    onStateChange?: (value: boolean) => void;
    allowBrowserFallback?: boolean;
  } = {},
) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  options.onStateChange?.(true);
  try {
    const response = await aiApi.textToSpeech({ text: normalizedText, model: options.model });
    if (response?.audioUrl) {
      await playAudioUrl(response.audioUrl);
      return;
    }
    if (options.allowBrowserFallback) {
      await speakWithBrowser(normalizedText);
      return;
    }
    console.error("[tts] server tts did not return playable audio");
    return;
  } catch (error) {
    console.error("[tts] playback failed:", error);
    if (options.allowBrowserFallback) {
      await speakWithBrowser(normalizedText);
      return;
    }
    return;
  } finally {
    options.onStateChange?.(false);
  }
}

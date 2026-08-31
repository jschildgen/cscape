const CscapeStory = (() => {
    "use strict";

    const config = {
        defaultLayout: "dialogue",
        defaultBackground: "",
        defaultMusic: "",
        musicVolume: 0.3,
        musicLoop: true,
        soundVolume: 0.85,
        typeSpeed: 28,
        defaultTextMode: "type",
        audioHintText: "Click for music & sounds",
        defaultVoice: "",
        defaultTtsLang: "",
        defaultTtsRate: 1.0,
        defaultTtsPitch: 1.0,
        beforeSlide: null,
        afterSlide: null,
        formatText: text => String(text || ""),
    };

    const VALID_PHASES = new Set(["before-text", "start", "after-text"]);
    let revealNavigationPatched = false;
    let allowInternalNavigation = false;
    let pendingNavigation = null;
    let originalRevealNext = null;
    let originalRevealPrev = null;
    let originalRevealLeft = null;
    let originalRevealRight = null;
    let originalRevealSlide = null;
    const activeControllers = new Set();
    let initialized = false;
    let audioUnlocked = false;
    let runId = 0;
    let currentController = null;
    let musicAudio = null;
    let musicSrc = "";

    const unlockWaiters = new Set();
    const slideState = new WeakMap();
    const activeOneShots = new Set();
    const activeSlideLoops = new Set();
    const persistentLoops = new Map();
    const pendingTtsQueue = [];

    // Voice Selection Modal state
    let allVoices = [];
    let voiceModal = null;
    let voiceSearchInput = null;
    let sampleTextInput = null;
    let voiceListElement = null;
    let voiceCountElement = null;

    const api = {
        init,
        isAudioUnlocked: () => audioUnlocked,
        formatText,
        replayCurrentSlide() {
            if (window.Reveal) {
                playSlide(Reveal.getCurrentSlide());
            }
        },
        stopPersistentLoop(id) {
            stopPersistentLoop(id);
        },
        stopAllPersistentLoops() {
            stopAllPersistentLoops();
        },
        openVoiceModal,
        closeVoiceModal
    };

    window.CSCAPE_STORY_API = api;

    function getSlideState(slide) {
        if (!slideState.has(slide)) {
            slideState.set(slide, {
                ready: false,
                nextScheduled: false
            });
        }
        return slideState.get(slide);
    }

    function boolValue(value, fallback = false) {
        if (value === undefined || value === null || value === "") return fallback;
        const normalized = String(value).trim().toLowerCase();
        if (["1", "true", "yes", "ja", "on"].includes(normalized)) return true;
        if (["0", "false", "no", "nein", "off"].includes(normalized)) return false;
        return fallback;
    }

    function isCurrentSlideStoryBusy() {
        if (!window.Reveal || typeof Reveal.getCurrentSlide !== "function") return false;

        const slide = Reveal.getCurrentSlide();
        if (!slide) return false;

        return slide.getAttribute("data-story-ready") !== "true";
    }

    function queueNavigation(kind, args) {
        pendingNavigation = {kind, args: Array.from(args || [])};
        console.log("[CSCAPE Story] navigation queued until slide ready:", pendingNavigation);
    }

    function runPendingNavigation() {
        if (!pendingNavigation || !window.Reveal) return false;

        const pending = pendingNavigation;
        pendingNavigation = null;

        console.log("[CSCAPE Story] running queued navigation:", pending);

        allowInternalNavigation = true;

        try {
            if (pending.kind === "next" && originalRevealNext) {
                originalRevealNext(...pending.args);
            } else if (pending.kind === "prev" && originalRevealPrev) {
                originalRevealPrev(...pending.args);
            } else if (pending.kind === "left" && originalRevealLeft) {
                originalRevealLeft(...pending.args);
            } else if (pending.kind === "right" && originalRevealRight) {
                originalRevealRight(...pending.args);
            } else if (pending.kind === "slide" && originalRevealSlide) {
                originalRevealSlide(...pending.args);
            }
        } finally {
            allowInternalNavigation = false;
        }

        return true;
    }

    function shouldBlockRevealNavigation() {
        if (allowInternalNavigation) return false;
        if (config.blockNavigationUntilReady === false) return false;
        return isCurrentSlideStoryBusy();
    }

    function patchRevealNavigation() {
        if (revealNavigationPatched || !window.Reveal) return false;

        if (
            typeof Reveal.next !== "function" ||
            typeof Reveal.prev !== "function" ||
            typeof Reveal.left !== "function" ||
            typeof Reveal.right !== "function" ||
            typeof Reveal.slide !== "function"
        ) {
            console.warn("[CSCAPE Story] Reveal navigation API not ready yet.");
            return false;
        }

        revealNavigationPatched = true;

        originalRevealNext = Reveal.next.bind(Reveal);
        originalRevealPrev = Reveal.prev.bind(Reveal);
        originalRevealLeft = Reveal.left.bind(Reveal);
        originalRevealRight = Reveal.right.bind(Reveal);
        originalRevealSlide = Reveal.slide.bind(Reveal);

        Reveal.next = function (...args) {
            if (shouldBlockRevealNavigation()) {
                queueNavigation("next", args);
                return;
            }

            return originalRevealNext(...args);
        };

        Reveal.prev = function (...args) {
            if (shouldBlockRevealNavigation()) {
                queueNavigation("prev", args);
                return;
            }

            return originalRevealPrev(...args);
        };

        Reveal.left = function (...args) {
            if (shouldBlockRevealNavigation()) {
                queueNavigation("left", args);
                return;
            }

            return originalRevealLeft(...args);
        };

        Reveal.right = function (...args) {
            if (shouldBlockRevealNavigation()) {
                queueNavigation("right", args);
                return;
            }

            return originalRevealRight(...args);
        };

        Reveal.slide = function (...args) {
            if (shouldBlockRevealNavigation()) {
                queueNavigation("slide", args);
                return;
            }

            return originalRevealSlide(...args);
        };

        console.log("[CSCAPE Story] Reveal navigation patched.");
        return true;
    }

    function numberValue(value, fallback) {
        if (value === undefined || value === null) return fallback;

        const text = String(value).trim();
        if (text === "") return fallback;

        const number = Number(text);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp01(value, fallback) {
        const number = numberValue(value, fallback);
        const safeNumber = Number.isFinite(number) ? number : 1;
        return Math.max(0, Math.min(1, safeNumber));
    }

    function getVoices() {
        if (!window.speechSynthesis) return [];
        return speechSynthesis.getVoices();
    }

    function findVoice(voiceName, lang) {
        const voices = getVoices();
        if (!voices || voices.length === 0) return null;

        if (!voiceName && !lang) {
            return voices[0] || null;
        }

        for (const voice of voices) {
            if (voiceName && voice.name === voiceName) return voice;
            if (lang && voice.lang === lang) return voice;
        }

        for (const voice of voices) {
            if (voiceName && voice.name.includes(voiceName)) return voice;
            if (lang && voice.lang.includes(lang)) return voice;
        }

        return voices[0] || null;
    }

    async function speakWithWebSpeechApi(cue, token, signal) {
        const text = getCueText(cue);
        if (!text) return;

        if (!window.speechSynthesis) {
            console.warn("[CSCAPE Story] Web Speech API not supported in this browser");
            return;
        }

        if (!audioUnlocked) {
            return new Promise(resolve => {
                pendingTtsQueue.push({ cue, token, signal, resolve });
            });
        }

        if (signal?.aborted || token !== runId) return;

        return new Promise(resolve => {
            const utterance = new SpeechSynthesisUtterance(text);

            const effectiveVoiceName = cue.voice || config.defaultVoice;
            const effectiveLang = cue.lang || config.defaultTtsLang;
            const effectiveRate = Number(cue.rate) || Number(config.defaultTtsRate) || 1.0;
            const effectivePitch = Number(cue.pitch) || Number(config.defaultTtsPitch) || 1.0;

            const voice = findVoice(effectiveVoiceName, effectiveLang);
            if (voice) {
                utterance.voice = voice;
            } else if (effectiveLang) {
                utterance.lang = effectiveLang;
            }

            utterance.rate = effectiveRate;
            utterance.pitch = effectivePitch;

            let finished = false;

            function cleanup() {
                utterance.onend = null;
                utterance.onerror = null;
                signal?.removeEventListener("abort", onAbort);
            }

            function finish() {
                if (finished) return;
                finished = true;
                cleanup();
                resolve();
            }

            utterance.onend = finish;
            utterance.onerror = event => {
                if (!signal?.aborted && token === runId) {
                    console.warn("[CSCAPE Story] TTS speech error:", event);
                }
                finish();
            };

            function onAbort() {
                try {
                    speechSynthesis.cancel();
                } catch {
                    // Ignore browser-specific errors
                }
                finish();
            }

            signal?.addEventListener("abort", onAbort, { once: true });

            try {
                speechSynthesis.speak(utterance);
            } catch (error) {
                finish();
            }
        });
    }

    function processPendingTtsQueue() {
        if (pendingTtsQueue.length === 0) return;

        const items = pendingTtsQueue.splice(0, pendingTtsQueue.length);
        
        setTimeout(() => {
            for (const item of items) {
                if (item && !item.signal?.aborted && item.token === runId) {
                    speakWithWebSpeechApi(item.cue, item.token, item.signal).then(() => {
                        if (item.resolve) item.resolve();
                    });
                }
            }
        }, 0);
    }

    function assetUrl(path) {
        const trimmed = String(path || "").trim();
        if (!trimmed) return "";

        if (
            trimmed.startsWith("http://") ||
            trimmed.startsWith("https://") ||
            trimmed.startsWith("data:") ||
            trimmed.startsWith("blob:") ||
            trimmed.startsWith("/")
        ) {
            return trimmed;
        }

        return new URL(trimmed, window.location.href).href;
    }

    function cssImageUrl(path) {
        const url = assetUrl(path);
        return url ? `url("${url.replaceAll('"', '\\"')}")` : "";
    }

    function formatText(text) {
        try {
            return String(config.formatText(String(text || "")) || "");
        } catch (error) {
            console.warn("[CSCAPE Story] formatText failed:", error);
            return String(text || "");
        }
    }

    function wait(ms, signal) {
        const duration = Math.max(0, Number(ms) || 0);

        if (duration === 0) return Promise.resolve(true);
        if (signal?.aborted) return Promise.resolve(false);

        return new Promise(resolve => {
            const timeout = window.setTimeout(done, duration);

            function done() {
                signal?.removeEventListener("abort", onAbort);
                resolve(true);
            }

            function onAbort() {
                window.clearTimeout(timeout);
                signal.removeEventListener("abort", onAbort);
                resolve(false);
            }

            signal?.addEventListener("abort", onAbort, {once: true});
        });
    }

    function waitForAudioUnlock(signal) {
        if (audioUnlocked) return Promise.resolve(true);
        if (signal?.aborted) return Promise.resolve(false);

        return new Promise(resolve => {
            const waiter = () => {
                cleanup();
                resolve(true);
            };

            function cleanup() {
                unlockWaiters.delete(waiter);
                signal?.removeEventListener("abort", onAbort);
            }

            function onAbort() {
                cleanup();
                resolve(false);
            }

            unlockWaiters.add(waiter);
            signal?.addEventListener("abort", onAbort, {once: true});
        });
    }

    function resolveUnlockWaiters() {
        for (const waiter of Array.from(unlockWaiters)) {
            waiter();
        }
        unlockWaiters.clear();
    }

    function createCursor() {
        const cursor = document.createElement("span");
        cursor.className = "cursor";
        cursor.textContent = "█";
        return cursor;
    }

    function renderInlineToFragment(text) {
        const fragment = document.createDocumentFragment();
        const parts = String(text || "")
            .split(/(\*\*.+?\*\*|\|.+?(?=\n|$)|\n)/g)
            .filter(part => part !== "");

        for (const part of parts) {
            if (part === "\n") {
                fragment.appendChild(document.createElement("br"));
            } else if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
                const strong = document.createElement("strong");
                strong.textContent = part.slice(2, -2);
                fragment.appendChild(strong);
            } else if (part.startsWith("|")) {
                const span = document.createElement("span");
                span.className = "objective";
                span.textContent = part.slice(1).trimStart();
                fragment.appendChild(span);
            } else {
                fragment.appendChild(document.createTextNode(part));
            }
        }

        return fragment;
    }

    function renderText(element, text) {
        if (!element) return;
        element.innerHTML = "";
        element.appendChild(renderInlineToFragment(text));
    }

    function delayForChar(char) {
        if (char === "\n") return Math.max(70, Number(config.typeSpeed) * 3);
        if (char === ".") return Math.max(160, Number(config.typeSpeed) * 7);
        if (char === ",") return Math.max(100, Number(config.typeSpeed) * 4);
        if (char === ":" || char === ";") return Math.max(120, Number(config.typeSpeed) * 5);
        if (char === "!" || char === "?") return Math.max(160, Number(config.typeSpeed) * 7);
        return Number(config.typeSpeed) || 28;
    }

    async function typeText(element, rawText, token, signal) {
        const text = formatText(rawText);
        const chars = Array.from(text);
        let index = 0;

        if (!element) return;
        element.innerHTML = "";

        while (index <= chars.length) {
            if (signal?.aborted || token !== runId) return;

            element.innerHTML = "";
            element.appendChild(renderInlineToFragment(chars.slice(0, index).join("")));

            if (index < chars.length) {
                element.appendChild(createCursor());
                const char = chars[index];
                index += 1;
                const ok = await wait(delayForChar(char), signal);
                if (!ok) return;
            } else {
                break;
            }
        }

        renderText(element, text);
    }

    function ensureSlideMarkup(slide) {
        if (!slide) return;

        let scene = slide.querySelector(":scope > .scene");
        if (!scene) {
            scene = document.createElement("div");
            scene.className = "scene";
            slide.appendChild(scene);
        }

        let speaker = scene.querySelector(":scope > .speaker");
        if (!speaker) {
            speaker = document.createElement("div");
            speaker.className = "speaker";
            scene.appendChild(speaker);
        }

        let img = speaker.querySelector("img");
        if (!img) {
            img = document.createElement("img");
            img.alt = "";
            speaker.appendChild(img);
        }

        let dialogue = scene.querySelector(":scope > .dialogue");
        if (!dialogue) {
            dialogue = document.createElement("div");
            dialogue.className = "dialogue";
            scene.appendChild(dialogue);
        }

        if (!dialogue.querySelector(":scope > .name")) {
            const name = document.createElement("div");
            name.className = "name";
            dialogue.appendChild(name);
        }

        if (!dialogue.querySelector(":scope > .text")) {
            const text = document.createElement("div");
            text.className = "text";
            dialogue.appendChild(text);
        }

        if (!dialogue.querySelector(":scope > .task")) {
            const task = document.createElement("div");
            task.className = "task";
            dialogue.appendChild(task);
        }

        if (!scene.querySelector(":scope > .video-task")) {
            const videoTask = document.createElement("div");
            videoTask.className = "video-task";
            scene.appendChild(videoTask);
        }
    }

    function applySceneBackground(slide) {
        const scene = slide.querySelector(".scene");
        if (!scene) return;

        const background = slide.getAttribute("data-background") ||
            slide.getAttribute("data-bg") ||
            config.defaultBackground ||
            "";

        if (!background) {
            scene.style.backgroundImage = "";
            scene.style.backgroundPosition = "";
            scene.style.backgroundSize = "";
            scene.style.backgroundRepeat = "";
            return;
        }

        const overlay = getComputedStyle(document.body)
            .getPropertyValue("--scene-overlay")
            .trim() || "none";

        scene.style.backgroundImage = `${overlay}, ${cssImageUrl(background)}`;
        scene.style.backgroundPosition = "center center";
        scene.style.backgroundSize = "cover";
        scene.style.backgroundRepeat = "no-repeat";
    }

    function getLayout(slide) {
        const raw = String(slide.getAttribute("data-layout") || config.defaultLayout || "dialogue")
            .trim()
            .toLowerCase();

        if (["video", "dialogue", "hybrid", "none", "black"].includes(raw)) return raw;
        return "dialogue";
    }

    function getTextMode(slide) {
        const explicit = String(slide.getAttribute("data-text-mode") || "")
            .trim()
            .toLowerCase();

        if (["instant", "type", "typed", "none", "hidden"].includes(explicit)) {
            if (explicit === "typed") return "type";
            if (explicit === "hidden") return "none";
            return explicit;
        }

        if (slide.hasAttribute("data-text-instant")) return "instant";
        if (slide.hasAttribute("data-no-text")) return "none";

        return config.defaultTextMode || "type";
    }

    function setupSlide(slide) {
        ensureSlideMarkup(slide);

        const layout = getLayout(slide);
        slide.setAttribute("data-layout", layout);
        slide.classList.remove("story-complete");
        slide.setAttribute("data-story-ready", "false");

        const scene = slide.querySelector(".scene");
        const speaker = slide.querySelector(".speaker");
        const img = slide.querySelector(".speaker img");
        const dialogue = slide.querySelector(".dialogue");
        const name = slide.querySelector(".name");
        const text = slide.querySelector(".text");
        const task = slide.querySelector(".task");
        const videoTask = slide.querySelector(".video-task");

        applySceneBackground(slide);

        const speakerName = formatText(slide.getAttribute("data-speaker") || "");
        const avatarPath = slide.getAttribute("data-avatar") || "";
        const side = String(slide.getAttribute("data-side") || "left").trim().toLowerCase();
        const dialogueText = formatText(slide.querySelector(".cscape-dialogue")?.textContent || "");
        const taskText = formatText(slide.querySelector(".cscape-task")?.textContent || "").trim();
        const textMode = getTextMode(slide);
        const hasSpeaker = Boolean(speakerName || avatarPath);
        const hasText = Boolean(dialogueText && textMode !== "none");
        const hasTask = Boolean(taskText);

        if (scene) {
            scene.dataset.layout = layout;
        }

        if (speaker) {
            speaker.classList.toggle("is-empty", !hasSpeaker);
            speaker.classList.remove("left", "right", "from-left", "from-right");
            speaker.classList.add(side === "right" ? "right" : "left");

            if (hasSpeaker) {
                void speaker.offsetWidth;
                speaker.classList.add(side === "right" ? "from-right" : "from-left");
            }
        }

        if (img) {
            if (avatarPath) {
                img.src = assetUrl(avatarPath);
                img.alt = speakerName || "Story character";
            } else {
                img.removeAttribute("src");
                img.alt = "";
            }
        }

        if (name) {
            name.textContent = speakerName;
            name.classList.toggle("is-empty", !speakerName);
        }

        if (text) {
            text.innerHTML = "";
            text.classList.toggle("is-empty", !hasText);
        }

        if (task) {
            task.textContent = taskText;
            task.classList.toggle("is-empty", !hasTask);
        }

        if (videoTask) {
            videoTask.textContent = taskText;
            videoTask.classList.toggle("is-empty", !hasTask);
        }

        if (dialogue) {
            dialogue.classList.toggle("is-empty", !hasText && !hasTask && !speakerName);
            dialogue.classList.toggle("has-task", hasTask);
            dialogue.classList.toggle("has-text", hasText);
            dialogue.classList.toggle("has-speaker-name", Boolean(speakerName));
        }
    }

    async function showVisibleText(slide, token, signal) {
        const textEl = slide.querySelector(".text");
        const rawText = slide.querySelector(".cscape-dialogue")?.textContent || "";
        const mode = getTextMode(slide);

        if (!textEl || !rawText || mode === "none") return;

        if (mode === "instant") {
            renderText(textEl, formatText(rawText));
            return;
        }

        await typeText(textEl, rawText, token, signal);
    }

    function normalizePhase(value) {
        const phase = String(value || "start").trim().toLowerCase();
        return VALID_PHASES.has(phase) ? phase : "start";
    }

    function prop(cue, name, fallback = "") {
        if (Object.prototype.hasOwnProperty.call(cue.props, name)) return cue.props[name];
        return fallback;
    }

    function propAny(cue, names, fallback = "") {
        for (const name of names) {
            if (Object.prototype.hasOwnProperty.call(cue.props, name)) return cue.props[name];
        }
        return fallback;
    }

    function collectAudioCues(slide) {
        const byIndex = new Map();

        for (const attribute of Array.from(slide.attributes)) {
            if (!attribute.name.startsWith("data-audio-")) continue;

            const rest = attribute.name.slice("data-audio-".length);
            const match = rest.match(/^(\d+)(?:-(.+))?$/);
            if (!match) continue;

            const index = Number(match[1]);
            const key = match[2] || "src";

            if (!byIndex.has(index)) {
                byIndex.set(index, {index, props: {}});
            }

            byIndex.get(index).props[key] = attribute.value;
        }

        if (slide.getAttribute("data-sound")) {
            byIndex.set(-2, {
                index: -2,
                props: {
                    src: slide.getAttribute("data-sound"),
                    phase: slide.getAttribute("data-sound-phase") || "before-text",
                    volume: slide.getAttribute("data-sound-volume") || ""
                }
            });
        }

        if (slide.getAttribute("data-generate-sound") === "true") {
            byIndex.set(-1, {
                index: -1,
                props: {
                    type: "tts",
                    phase: slide.getAttribute("data-tts-phase") || "start",
                    "text-from": slide.getAttribute("data-tts-text-from") || "dialogue",
                    text: slide.getAttribute("data-tts-text") || "",
                    voice: slide.getAttribute("data-tts-voice") || "",
                    lang: slide.getAttribute("data-tts-lang") || "",
                    rate: slide.getAttribute("data-tts-rate") || "",
                    pitch: slide.getAttribute("data-tts-pitch") || "",
                    volume: slide.getAttribute("data-tts-volume") || ""
                }
            });
        }

        return Array.from(byIndex.values())
            .map(raw => normalizeCue(raw, slide))
            .filter(Boolean)
            .sort((a, b) => a.index - b.index);
    }

    function normalizeCue(raw, slide) {
        const phase = normalizePhase(prop(raw, "phase", "start"));
        const stopId = propAny(raw, ["stop", "stop-loop", "stop-id"], "").trim();
        const text = prop(raw, "text", "");
        const textFrom = prop(raw, "text-from", "").trim().toLowerCase();
        const explicitType = prop(raw, "type", "").trim().toLowerCase();
        const src = propAny(raw, ["src", "url", "file"], "").trim();
        const loop = boolValue(prop(raw, "loop", ""), false) || explicitType === "loop";
        const persistent = boolValue(prop(raw, "persistent", ""), false);
        const mode = String(prop(raw, "mode", "")).trim().toLowerCase();
        const parallel = boolValue(prop(raw, "parallel", ""), false) || mode === "parallel";
        const blocking = boolValue(prop(raw, "blocking", ""), true);
        const id = propAny(raw, ["id", "loop-id"], "").trim();

        let type = explicitType;
        if (!type) {
            if (stopId) type = "stop-loop";
            else if (text || textFrom) type = "tts";
            else type = "sound";
        }

        if (type === "stop" || type === "stoploop") type = "stop-loop";
        if (type === "speech") type = "tts";

        const cue = {
            index: raw.index,
            phase,
            type,
            src,
            text,
            textFrom,
            voice: prop(raw, "voice", "").trim(),
            lang: prop(raw, "lang", "").trim(),
            rate: prop(raw, "rate", "").trim(),
            pitch: prop(raw, "pitch", "").trim(),
            volume: prop(raw, "volume", ""),
            loop,
            persistent,
            id,
            stopId,
            group: prop(raw, "group", "").trim(),
            parallel,
            blocking,
            delay: numberValue(prop(raw, "delay", ""), 0),
            slide
        };

        if (cue.type === "stop-loop") return cue;
        if (cue.type === "tts") return cue.text || cue.textFrom ? cue : null;
        if (cue.src) return cue;
        return null;
    }

    function getCueText(cue) {
        if (cue.textFrom === "dialogue") {
            return formatText(cue.slide.querySelector(".cscape-dialogue")?.textContent || "");
        }

        if (cue.textFrom === "task") {
            return formatText(cue.slide.querySelector(".cscape-task")?.textContent || "");
        }

        return formatText(cue.text || "");
    }

    function cueSource(cue) {
        if (cue.type === "tts") return "";
        return assetUrl(cue.src);
    }

    async function playCuePlan(cues, token, signal) {
        let index = 0;

        while (index < cues.length) {
            if (signal?.aborted || token !== runId) return;

            const cue = cues[index];

            if (cue.parallel) {
                const groupName = cue.group || "__default_parallel_group__";
                const group = [];

                while (index < cues.length) {
                    const candidate = cues[index];
                    const candidateGroup = candidate.group || "__default_parallel_group__";

                    if (!candidate.parallel || candidateGroup !== groupName) break;
                    group.push(candidate);
                    index += 1;
                }

                await Promise.all(group.map(item => playCue(item, token, signal)));
            } else {
                await playCue(cue, token, signal);
                index += 1;
            }
        }
    }

    function cuesForPhase(cues, phase) {
        return cues.filter(cue => cue.phase === phase).sort((a, b) => a.index - b.index);
    }

    function playPhase(cues, phase, token, signal) {
        return playCuePlan(cuesForPhase(cues, phase), token, signal);
    }

    async function playCue(cue, token, signal) {
        if (signal?.aborted || token !== runId) return;

        if (cue.delay > 0) {
            const ok = await wait(cue.delay * 1000, signal);
            if (!ok) return;
        }

        if (cue.type === "stop-loop") {
            if (cue.stopId) stopPersistentLoop(cue.stopId);
            else if (cue.id) stopPersistentLoop(cue.id);
            else stopAllPersistentLoops();
            return;
        }

        if (cue.type === "tts") {
            if (cue.loop) {
                console.warn("[CSCAPE Story] TTS loop not supported with Web Speech API");
            }
            if (!cue.blocking) {
                speakWithWebSpeechApi(cue, token, signal);
            } else {
                await speakWithWebSpeechApi(cue, token, signal);
            }
            return;
        }

        if (cue.loop) {
            startLoopCue(cue, token, signal);
            return;
        }

        if (!cue.blocking) {
            startOneShotCue(cue, token, signal);
            return;
        }

        await startOneShotCue(cue, token, signal);
    }

    async function startLoopCue(cue, token, signal) {
        const unlocked = await waitForAudioUnlock(signal);
        if (!unlocked || signal?.aborted || token !== runId) return;

        const src = cueSource(cue);
        if (!src) return;

        const volume = clamp01(cue.volume, config.soundVolume);
        const loopId = cue.id || src;

        if (cue.persistent) {
            const existing = persistentLoops.get(loopId);
            if (existing && existing.src === src && !existing.audio.paused) {
                existing.audio.volume = volume;
                return;
            }
            if (existing) stopAudio(existing.audio);
        }

        const audio = new Audio(src);
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = volume;

        try {
            await audio.play();

            if (cue.persistent) {
                persistentLoops.set(loopId, {audio, src});
            } else {
                activeSlideLoops.add(audio);
                const stopOnAbort = () => {
                    stopAudio(audio);
                    activeSlideLoops.delete(audio);
                };
                signal?.addEventListener("abort", stopOnAbort, {once: true});
            }
        } catch (error) {
            console.warn("[CSCAPE Story] Loop audio failed:", src, error);
        }
    }

    async function startOneShotCue(cue, token, signal) {
        const unlocked = await waitForAudioUnlock(signal);

        if (!unlocked || signal?.aborted || token !== runId) return;

        const src = cueSource(cue);
        if (!src) {
            console.warn("[CSCAPE Story] No audio src for cue", cue);
            return;
        }

        const audio = new Audio();
        audio.loop = false;
        audio.preload = "auto";
        audio.volume = clamp01(cue.volume, config.soundVolume);
        audio.src = src;

        activeOneShots.add(audio);

        return new Promise(resolve => {
            let finished = false;

            function cleanup() {
                audio.removeEventListener("ended", onEnded);
                audio.removeEventListener("error", onError);
                audio.removeEventListener("pause", onPause);
                signal?.removeEventListener("abort", onAbort);
                activeOneShots.delete(audio);
            }

            function finish() {
                if (finished) return;
                finished = true;
                cleanup();
                resolve();
            }

            function onEnded() {
                finish();
            }

            function onError(event) {
                if (!signal?.aborted && token === runId) {
                    console.warn("[CSCAPE Story] Audio failed:", src, event, audio.error);
                }

                finish();
            }

            function onPause() {
                /*
                 * Wichtig:
                 * pause darf NICHT automatisch finish() auslösen.
                 * Sonst gilt Audio als fertig, obwohl es nur gestoppt wurde.
                 * Abbruch wird explizit über onAbort behandelt.
                 */
            }

            function onAbort() {
                try {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.removeAttribute("src");
                    audio.load();
                } catch {
                    // Browser-spezifische Media-Fehler ignorieren.
                }

                finish();
            }

            audio.addEventListener("ended", onEnded, {once: true});
            audio.addEventListener("error", onError, {once: true});
            audio.addEventListener("pause", onPause);
            signal?.addEventListener("abort", onAbort, {once: true});

            audio.play().catch(error => {
                const name = error?.name || "";
                const message = error?.message || "";

                const expectedAbort =
                    signal?.aborted ||
                    token !== runId ||
                    name === "AbortError" ||
                    message.toLowerCase().includes("aborted");

                if (!expectedAbort) {
                    console.error("[CSCAPE Story] audio.play rejected:", {
                        src,
                        name,
                        message,
                        error
                    });
                }

                finish();
            });
        });
    }

    function stopAudio(audio) {
        if (!audio) return;

        try {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute("src");
            audio.load();
        } catch {
            // Ignore browser-specific media state errors.
        }
    }

    function stopActiveOneShots() {
        for (const audio of Array.from(activeOneShots)) {
            stopAudio(audio);
        }
        activeOneShots.clear();
    }

    function stopActiveSlideLoops() {
        for (const audio of Array.from(activeSlideLoops)) {
            stopAudio(audio);
        }
        activeSlideLoops.clear();
    }

    function stopPersistentLoop(id) {
        const entry = persistentLoops.get(id);
        if (!entry) return;
        stopAudio(entry.audio);
        persistentLoops.delete(id);
    }

    function stopAllPersistentLoops() {
        for (const id of Array.from(persistentLoops.keys())) {
            stopPersistentLoop(id);
        }
    }

    function cancelCurrentRun() {
        for (const controller of Array.from(activeControllers)) {
            try {
                controller.abort();
            } catch {
                // Ignore already-aborted controllers.
            }
        }

        activeControllers.clear();

        if (currentController) {
            try {
                currentController.abort();
            } catch {
                // Ignore already-aborted controller.
            }

            currentController = null;
        }

        stopActiveOneShots();
        stopActiveSlideLoops();
        pendingTtsQueue.length = 0;

        // Stop Web Speech API
        if (window.speechSynthesis) {
            try {
                speechSynthesis.cancel();
            } catch {
                // Ignore browser-specific errors
            }
        }
    }

    function fadeAudio(audio, from, to, duration = 500) {
        if (!audio) return Promise.resolve();

        const startVolume = Math.max(0, Math.min(1, from));
        const endVolume = Math.max(0, Math.min(1, to));
        const fadeDuration = Math.max(0, Number(duration) || 0);

        if (fadeDuration === 0) {
            audio.volume = endVolume;
            return Promise.resolve();
        }

        audio.volume = startVolume;

        return new Promise(resolve => {
            const start = performance.now();

            function frame(now) {
                const progress = Math.min((now - start) / fadeDuration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                audio.volume = startVolume + (endVolume - startVolume) * eased;

                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    audio.volume = endVolume;
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    async function stopMusic() {
        if (!musicAudio) return;
        const audio = musicAudio;
        musicAudio = null;
        musicSrc = "";
        await fadeAudio(audio, audio.volume, 0, 450);
        stopAudio(audio);
    }

    async function applyMusicForSlide(slide) {
        if (!audioUnlocked || !slide) return;

        const stopRequested = boolValue(slide.getAttribute("data-stop-music"), false);
        const rawMusic = slide.hasAttribute("data-music")
            ? slide.getAttribute("data-music")
            : config.defaultMusic;
        const musicValue = String(rawMusic || "").trim();

        if (stopRequested || ["stop", "none", "false", "off"].includes(musicValue.toLowerCase())) {
            await stopMusic();
            return;
        }

        if (!musicValue) return;

        const src = assetUrl(musicValue);
        const targetVolume = clamp01(slide.getAttribute("data-music-volume"), config.musicVolume);
        const shouldLoop = boolValue(slide.getAttribute("data-music-loop"), config.musicLoop !== false);

        if (!musicAudio || musicSrc !== src) {
            if (musicAudio) {
                await stopMusic();
            }

            musicAudio = new Audio(src);
            musicAudio.preload = "auto";
            musicAudio.loop = shouldLoop;
            musicAudio.volume = 0;
            musicSrc = src;
        }

        musicAudio.loop = shouldLoop;

        try {
            const rate = slide.getAttribute("data-music-rate");
            if (rate) musicAudio.playbackRate = Number(rate) || 1;
        } catch {
            // Optional attribute. Ignore invalid values.
        }

        try {
            await musicAudio.play();
            await fadeAudio(musicAudio, musicAudio.volume, targetVolume, 650);
        } catch (error) {
            console.warn("[CSCAPE Story] Music failed:", src, error);
        }
    }

    function getReadyCue(slide) {
        const readySound = slide.getAttribute("data-ready-sound") || "";
        const readyText = slide.getAttribute("data-ready-tts-text") || "";
        const readyTextFrom = slide.getAttribute("data-ready-tts-text-from") || "";

        if (!readySound && !readyText && !readyTextFrom) return null;

        return {
            index: Number.MAX_SAFE_INTEGER,
            phase: "after-text",
            type: readySound ? "sound" : "tts",
            src: readySound,
            text: readyText,
            textFrom: readyTextFrom,
            voice: slide.getAttribute("data-ready-tts-voice") || "",
            lang: slide.getAttribute("data-ready-tts-lang") || "",
            rate: slide.getAttribute("data-ready-tts-rate") || "",
            pitch: slide.getAttribute("data-ready-tts-pitch") || "",
            volume: slide.getAttribute("data-ready-sound-volume") || slide.getAttribute("data-ready-tts-volume") || "",
            loop: false,
            persistent: false,
            id: "",
            stopId: "",
            group: "",
            parallel: false,
            blocking: boolValue(slide.getAttribute("data-ready-sound-blocking"), true),
            delay: numberValue(slide.getAttribute("data-ready-sound-delay"), 0),
            slide
        };
    }

    function markSlideReady(slide) {
        const state = getSlideState(slide);
        state.ready = true;
        slide.setAttribute("data-story-ready", "true");
        slide.classList.add("story-complete");
    }

    function scheduleAutoNext(slide, token) {
        if (!slide.hasAttribute("data-after-ready-delay")) return;

        const state = getSlideState(slide);
        if (state.nextScheduled) return;

        const delaySeconds = Math.max(0, numberValue(slide.getAttribute("data-after-ready-delay"), 0));
        state.nextScheduled = true;

        window.setTimeout(() => {
            if (token !== runId) return;
            if (!window.Reveal || Reveal.getCurrentSlide() !== slide) return;

            allowInternalNavigation = true;

            try {
                Reveal.next();
            } finally {
                allowInternalNavigation = false;
            }
        }, delaySeconds * 1000);
    }

    async function playSlide(slide) {
        if (!slide) return;

        slide.classList.remove("story-complete");
        slide.setAttribute("data-story-ready", "false");

        cancelCurrentRun();
        const token = ++runId;
        const controller = new AbortController();
        const signal = controller.signal;

        currentController = controller;
        activeControllers.add(controller);

        const state = getSlideState(slide);
        state.ready = false;
        state.nextScheduled = false;

        try {
            // Update game data elements (like data-cscape-get spans) before reading dialogue text
            const cscapePlugin = window.Reveal?.getPlugin('cscape');
            if (cscapePlugin && typeof cscapePlugin.updateGameDataElements === 'function') {
                await cscapePlugin.updateGameDataElements(slide);
            }

            console.log("[CSCAPE Story] playSlide", {
                index: window.Reveal ? Reveal.getIndices(slide) : null,
                dialogue: slide?.querySelector(".cscape-dialogue")?.textContent,
                layout: slide?.getAttribute("data-layout")
            });

            if (typeof config.beforeSlide === "function") {
                await config.beforeSlide(slide, api);
            }

            if (signal.aborted || token !== runId) return;

            setupSlide(slide);
            await applyMusicForSlide(slide);
            const cues = collectAudioCues(slide);
            console.log("[CSCAPE Story] cues", cues);

            await playPhase(cues, "before-text", token, signal);
            if (signal.aborted || token !== runId) return;

            const startAudio = playPhase(cues, "start", token, signal);
            const visibleText = showVisibleText(slide, token, signal);

            await Promise.all([startAudio, visibleText]);
            if (signal.aborted || token !== runId) return;

            await playPhase(cues, "after-text", token, signal);
            if (signal.aborted || token !== runId) return;

            const readyCue = getReadyCue(slide);
            if (readyCue) {
                await playCue(readyCue, token, signal);
            }

            if (signal.aborted || token !== runId) return;

            markSlideReady(slide);

            if (!runPendingNavigation()) {
                scheduleAutoNext(slide, token);
            }

            if (typeof config.afterSlide === "function") {
                await config.afterSlide(slide, api);
            }
        } catch (error) {
            if (!signal.aborted) {
                console.error("[CSCAPE Story] Slide playback failed:", error);
                markSlideReady(slide);

                if (!runPendingNavigation()) {
                    scheduleAutoNext(slide, token);
                }
            }
        } finally {
            activeControllers.delete(controller);

            if (currentController === controller) {
                currentController = null;
            }
        }
    }

    async function unlockAudio(event) {
        console.log("[CSCAPE Story] unlockAudio event:", event?.type, event?.key || "");
        if (event?.type === "keydown" && ["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) {

            return;
        }

        if (!audioUnlocked) {
            audioUnlocked = true;
            console.log("[CSCAPE Story] audio unlocked");
            document.body.classList.add("story-audio-unlocked");

            const hint = document.getElementById("audioHint");
            if (hint) hint.remove();

            resolveUnlockWaiters();

            processPendingTtsQueue();
        }

        if (window.Reveal && typeof Reveal.getCurrentSlide === "function") {
            applyMusicForSlide(Reveal.getCurrentSlide());
        }
    }

    function createAudioHint() {
        let hint = document.getElementById("audioHint");

        if (!hint) {
            hint = document.createElement("button");
            hint.id = "audioHint";
            hint.className = "audio-hint";
            hint.type = "button";
            hint.textContent = config.audioHintText;
            document.body.appendChild(hint);
        }

        hint.addEventListener("pointerdown", unlockAudio, {capture: true});
        hint.addEventListener("click", unlockAudio, {capture: true});
    }

    // ============================================
    // Voice Selection Modal Functions
    // ============================================

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function createVoiceModal() {
        if (voiceModal) return;

        // Create modal container
        voiceModal = document.createElement("div");
        voiceModal.className = "voice-modal";
        voiceModal.id = "voiceModal";
        voiceModal.style.display = "none";
        voiceModal.style.position = "fixed";
        voiceModal.style.top = "0";
        voiceModal.style.left = "0";
        voiceModal.style.width = "100%";
        voiceModal.style.height = "100%";
        voiceModal.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
        voiceModal.style.zIndex = "10000";
        voiceModal.style.overflowY = "auto";
        document.body.appendChild(voiceModal);

        // Modal header
        const header = document.createElement("div");
        header.className = "voice-modal-header";
        header.style.background = "#1a1a1a";
        header.style.padding = "12px 20px";
        header.style.borderBottom = "1px solid #444";
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        voiceModal.appendChild(header);

        const title = document.createElement("h2");
        title.style.margin = "0";
        title.style.color = "#fff";
        title.style.fontSize = "1.2em";
        title.textContent = "Select Voice";
        header.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.className = "voice-modal-close";
        closeBtn.type = "button";
        closeBtn.textContent = "Close";
        closeBtn.style.background = "#444";
        closeBtn.style.color = "#fff";
        closeBtn.style.border = "none";
        closeBtn.style.padding = "6px 12px";
        closeBtn.style.cursor = "pointer";
        closeBtn.style.borderRadius = "4px";
        closeBtn.addEventListener("click", closeVoiceModal);
        closeBtn.addEventListener("mouseover", () => {
            closeBtn.style.background = "#555";
        });
        closeBtn.addEventListener("mouseout", () => {
            closeBtn.style.background = "#444";
        });
        header.appendChild(closeBtn);

        // Modal content
        const content = document.createElement("div");
        content.className = "voice-modal-content";
        content.style.flex = "1";
        content.style.padding = "20px";
        content.style.overflowY = "auto";
        voiceModal.appendChild(content);

        // Search input
        voiceSearchInput = document.createElement("input");
        voiceSearchInput.type = "text";
        voiceSearchInput.className = "voice-search";
        voiceSearchInput.id = "voiceSearch";
        voiceSearchInput.placeholder = "Search voices...";
        voiceSearchInput.style.width = "100%";
        voiceSearchInput.style.padding = "12px";
        voiceSearchInput.style.marginBottom = "16px";
        voiceSearchInput.style.background = "#1a1a1a";
        voiceSearchInput.style.color = "#fff";
        voiceSearchInput.style.border = "1px solid #444";
        voiceSearchInput.style.borderRadius = "4px";
        voiceSearchInput.style.fontSize = "1em";
        voiceSearchInput.addEventListener("input", filterVoices);
        voiceSearchInput.addEventListener("focus", () => {
            voiceSearchInput.style.outline = "none";
            voiceSearchInput.style.borderColor = "#0078d4";
        });
        voiceSearchInput.addEventListener("blur", () => {
            voiceSearchInput.style.borderColor = "#444";
        });
        content.appendChild(voiceSearchInput);

        // Sample text area
        const sampleTextContainer = document.createElement("div");
        sampleTextContainer.style.margin = "16px 0";
        content.appendChild(sampleTextContainer);

        const sampleLabel = document.createElement("label");
        sampleLabel.style.display = "block";
        sampleLabel.style.color = "#ccc";
        sampleLabel.style.marginBottom = "6px";
        sampleLabel.style.fontSize = "0.9em";
        sampleLabel.textContent = "Test sentence:";
        sampleTextContainer.appendChild(sampleLabel);

        sampleTextInput = document.createElement("input");
        sampleTextInput.type = "text";
        sampleTextInput.id = "sampleText";
        sampleTextInput.className = "voice-search";
        sampleTextInput.value = "This is a sample of my voice. Hello!";
        sampleTextInput.placeholder = "Enter text to speak...";
        sampleTextInput.style.width = "100%";
        sampleTextInput.style.padding = "12px";
        sampleTextInput.style.background = "#1a1a1a";
        sampleTextInput.style.color = "#fff";
        sampleTextInput.style.border = "1px solid #444";
        sampleTextInput.style.borderRadius = "4px";
        sampleTextInput.style.fontSize = "1em";
        sampleTextContainer.appendChild(sampleTextInput);

        // Voice list container
        voiceListElement = document.createElement("div");
        voiceListElement.className = "voice-list";
        voiceListElement.id = "voiceList";
        voiceListElement.style.maxWidth = "800px";
        voiceListElement.style.margin = "0 auto";
        content.appendChild(voiceListElement);

        // Voice count
        voiceCountElement = document.createElement("div");
        voiceCountElement.className = "voice-count";
        voiceCountElement.id = "voiceCount";
        voiceCountElement.style.color = "#888";
        voiceCountElement.style.fontSize = "0.85em";
        voiceCountElement.style.marginTop = "8px";
        content.appendChild(voiceCountElement);

        // Close on outside click
        voiceModal.addEventListener("click", function(e) {
            if (e.target === voiceModal) {
                closeVoiceModal();
            }
        });

        // Apply CSS styles
        injectVoiceModalStyles();
    }

    function injectVoiceModalStyles() {
        const style = document.createElement("style");
        style.id = "voiceModalStyles";
        style.textContent = `
            .voice-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.85);
                z-index: 10000;
                overflow-y: auto;
            }
            .voice-modal.active {
                display: flex !important;
                flex-direction: column;
            }
            .voice-modal-header {
                background: #1a1a1a;
                padding: 12px 20px;
                border-bottom: 1px solid #444;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .voice-modal-header h2 {
                margin: 0;
                color: #fff;
                font-size: 1.2em;
            }
            .voice-modal-close {
                background: #444;
                color: #fff;
                border: none;
                padding: 6px 12px;
                cursor: pointer;
                border-radius: 4px;
            }
            .voice-modal-close:hover {
                background: #555;
            }
            .voice-modal-content {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
            }
            .voice-list {
                max-width: 800px;
                margin: 0 auto;
            }
            .voice-item {
                background: #242424;
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .voice-info {
                flex: 1;
                min-width: 250px;
            }
            .voice-name {
                color: #fff;
                font-weight: bold;
                margin-bottom: 4px;
                font-size: 1.05em;
            }
            .voice-lang {
                color: #888;
                font-size: 0.85em;
            }
            .voice-actions {
                display: flex;
                gap: 8px;
            }
            .voice-btn {
                background: #0078d4;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.85em;
                transition: background-color 0.2s;
            }
            .voice-btn:hover {
                background: #005fa3;
            }
            .voice-btn.copy {
                background: #2d7d32;
            }
            .voice-btn.copy:hover {
                background: #1b5e20;
            }
            .voice-search {
                width: 100%;
                padding: 12px;
                margin-bottom: 16px;
                background: #1a1a1a;
                color: #fff;
                border: 1px solid #444;
                border-radius: 4px;
                font-size: 1em;
            }
            .voice-search:focus {
                outline: none;
                border-color: #0078d4;
            }
            .voice-count {
                color: #888;
                font-size: 0.85em;
                margin-top: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    function openVoiceModal() {
        if (!voiceModal) {
            createVoiceModal();
        }

        voiceModal.classList.add("active");

        if (allVoices.length === 0) {
            loadVoices();
        } else {
            renderVoices(allVoices);
        }

        voiceSearchInput.value = "";
        voiceSearchInput.focus();
    }

    function closeVoiceModal() {
        if (voiceModal) {
            voiceModal.classList.remove("active");
        }
        if (window.speechSynthesis) {
            speechSynthesis.cancel();
        }
    }

    function loadVoices() {
        if (!window.speechSynthesis) {
            voiceListElement.innerHTML = "<p style='color: #888;'>Web Speech API not supported in this browser.</p>";
            return;
        }

        allVoices = speechSynthesis.getVoices();

        if (allVoices.length === 0) {
            if (speechSynthesis.getVoices().length === 0) {
                speechSynthesis.onvoiceschanged = () => {
                    allVoices = speechSynthesis.getVoices();
                    renderVoices(allVoices);
                };
                voiceListElement.innerHTML = "<p style='color: #888;'>Loading voices... Please wait.</p>";
            } else {
                renderVoices(allVoices);
            }
        } else {
            renderVoices(allVoices);
        }
    }

    function renderVoices(voices) {
        if (!voiceListElement) return;

        if (voices.length === 0) {
            voiceListElement.innerHTML = "<p style='color: #888;'>No voices available.</p>";
            if (voiceCountElement) voiceCountElement.textContent = "";
            return;
        }

        const html = voices
            .map(voice => `
                <div class="voice-item">
                    <div class="voice-info">
                        <div class="voice-name">${escapeHtml(voice.name)}</div>
                        <div class="voice-lang">${escapeHtml(voice.lang)} - ${voice.default ? "Default" : ""}</div>
                    </div>
                    <div class="voice-actions">
                        <button class="voice-btn" data-voice-name="${escapeHtml(voice.name)}" data-voice-lang="${escapeHtml(voice.lang)}">Play</button>
                        <button class="voice-btn copy" data-voice-name="${escapeHtml(voice.name)}">Copy</button>
                    </div>
                </div>
            `)
            .join("");

        voiceListElement.innerHTML = html;

        // Add event listeners to new buttons
        voiceListElement.querySelectorAll(".voice-btn:not(.copy)").forEach(btn => {
            btn.addEventListener("click", () => {
                const voiceName = btn.dataset.voiceName;
                const voiceLang = btn.dataset.voiceLang;
                playVoiceSample(voiceName, voiceLang);
            });
        });

        voiceListElement.querySelectorAll(".voice-btn.copy").forEach(btn => {
            btn.addEventListener("click", () => {
                const voiceName = btn.dataset.voiceName;
                copyVoiceName(voiceName);
            });
        });

        if (voiceCountElement) {
            voiceCountElement.textContent = `${voices.length} voice(s) available`;
        }
    }

    function filterVoices() {
        if (!voiceSearchInput) return;
        const search = voiceSearchInput.value.toLowerCase();
        const filtered = allVoices.filter(v =>
            v.name.toLowerCase().includes(search) ||
            v.lang.toLowerCase().includes(search)
        );
        renderVoices(filtered);
    }

    function playVoiceSample(voiceName, voiceLang) {
        if (!window.speechSynthesis) return;

        speechSynthesis.cancel();

        const text = sampleTextInput?.value || "This is a sample of my voice. Hello!";
        const utterance = new SpeechSynthesisUtterance(text);

        const voices = speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === voiceName && v.lang === voiceLang)
            || voices.find(v => v.name === voiceName)
            || voices.find(v => v.lang === voiceLang);

        if (voice) {
            utterance.voice = voice;
        }
        utterance.lang = voiceLang;

        speechSynthesis.speak(utterance);
    }

    function copyVoiceName(voiceName) {
        navigator.clipboard.writeText(voiceName).then(() => {
            showCopyHint();
        }).catch(err => {
            console.error("Failed to copy:", err);
        });
    }

    function showCopyHint() {
        const hint = document.createElement("div");
        hint.style.position = "fixed";
        hint.style.bottom = "20px";
        hint.style.right = "20px";
        hint.style.padding = "10px 20px";
        hint.style.background = "#2d7d32";
        hint.style.color = "#fff";
        hint.style.borderRadius = "4px";
        hint.style.zIndex = "10001";
        hint.style.fontSize = "14px";
        hint.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
        hint.style.transition = "opacity 0.3s";
        hint.style.opacity = "0";
        hint.textContent = "Voice name copied!";
        document.body.appendChild(hint);

        setTimeout(() => {
            hint.style.opacity = "1";
        }, 10);

        setTimeout(() => {
            hint.style.opacity = "0";
            setTimeout(() => hint.remove(), 300);
        }, 1500);
    }

    function init(reveal) {
        if (initialized) return;
        initialized = true;

        // Konfiguration aus Reveal.initialize mergen (höchste Priorität)
        const revealStoryConfig = reveal?.getConfig?.()?.cscape_story || {};
        Object.assign(config, revealStoryConfig);

        // Web Speech API: Stimmen laden
        if (window.speechSynthesis && speechSynthesis.getVoices().length === 0) {
            speechSynthesis.onvoiceschanged = () => {};
        }

        document.querySelectorAll(".reveal section").forEach(ensureSlideMarkup);
        createAudioHint();

        window.addEventListener("pointerdown", unlockAudio, {capture: true});
        window.addEventListener("keydown", unlockAudio, {capture: true});

        // Voice selection modal event listeners
        window.addEventListener("keydown", function(e) {
            if (e.key === "t" || e.key === "T") {
                openVoiceModal();
                e.preventDefault();
                e.stopPropagation();
            }
        });

        window.addEventListener("keydown", function(e) {
            if (e.key === "Escape" && voiceModal && voiceModal.classList.contains("active")) {
                closeVoiceModal();
                e.preventDefault();
                e.stopPropagation();
            }
        });

        if (!window.Reveal) {
            console.warn("[CSCAPE Story] Reveal is not available.");
            return;
        }

        let revealReadySeen = false;

        Reveal.on("ready", event => {
            revealReadySeen = true;
            document.body.classList.add("story-ready");

            patchRevealNavigation();

            playSlide(event.currentSlide);
        });

        Reveal.on("slidechanged", event => {
            patchRevealNavigation();

            playSlide(event.currentSlide);
        });

        window.setTimeout(() => {
            if (!revealReadySeen && window.Reveal && typeof Reveal.getCurrentSlide === "function") {
                console.log("[CSCAPE Story] initial fallback playSlide");

                patchRevealNavigation();

                playSlide(Reveal.getCurrentSlide());
            }
        }, 700);
    }

    return {
		id: 'cscape_story',
		init: init
    };
})();
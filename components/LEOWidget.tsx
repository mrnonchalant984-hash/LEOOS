"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { sharePrivateImage } from "@/lib/client/share-private-media";
import {
  Bot,
  Mic,
  Send,
  Trash2,
  Image as ImageIcon,
  Video,
  Sparkles,
  Lightbulb,
  Rocket,
  Wrench,
  Code2,
  X,
  Volume2,
  Plus,
  Camera,
  Paperclip,
  Search,
  Brain,
  Globe2,
  Loader2,
  PhoneOff,
  Settings2,
  MessageSquare,
  PlusCircle,
  History,
  UserCircle,
  CreditCard,
  Library,
  Compass,
  Download,
  Share2,
  Laptop,
  PanelLeftClose,
  Menu,
  Bookmark,
  Trash,
  Users,
  Video as VideoIcon,
  ChevronRight,
  Github,
  Plug,
  Palette,
  Puzzle,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { GoogleGenAI, Modality } from "@google/genai";
import type { LucideIcon } from "lucide-react";

type BuildProgressState = { status: string; step: string; message: string; liveUrl?: string | null; events?: Array<{ id: string; message: string; status: string; created_at: string }> };
type ProjectBuilderAction = {
  projectType: string;
  status: string;
  message: string;
  href?: string;
  provider?: string;
};
type ChatDocument = {
  assetId: string;
  fileName: string;
  mimeType: string;
  previewText?: string;
  previewUrl: string;
  downloadUrl: string;
};
type ChatCitation = { title?: string; url: string };
type ChatImage = { assetId: string; fileName: string; mimeType: string; previewUrl: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  selectedToolLabel?: string;
  image?: string;
  video?: string;
  assetId?: string;
  projectBuilder?: ProjectBuilderAction;
  documents?: ChatDocument[];
  images?: ChatImage[];
  citations?: ChatCitation[];
};
type ChatHistoryItem = { id: string; title: string; updatedAt: number };
type MemoryItem = { id: string; memory: string; source?: string; created_at?: string };
type RemotePairing = { id: string; created_device_name: string; paired_device_name?: string | null; status: "pending" | "paired" | "revoked" | "expired"; expires_at: string; paired_at?: string | null; last_seen_at?: string | null; created_at?: string };
type RemoteEvent = { id: number; event_type: string; payload: { text?: string; [key: string]: unknown }; device_id: string; created_at: string };
const LIVE_VOICE_SYSTEM_INSTRUCTION = "Direct Gemini Live is disabled until a secure server-side tool bridge is available; use the shared Leo orchestration endpoint.";

type VoiceStatus =
  | "Idle"
  | "Connecting"
  | "Listening"
  | "Thinking"
  | "Speaking"
  | "Muted"
  | "Reconnecting"
  | "Error"
  | "Ended"
  | "Leo Voice ready · tap to speak";
type ToolOption = { name: string; description: string };
type CustomAgentOption = { id: string; name: string; description: string; allowed_tools: string[] };
type ModelOption = { id: string; name: string; provider: string; model: string; capabilities: string[]; configured: boolean };
type OfflineDraft = { text: string; mode: "normal" | "deep" | "tools"; selectedToolName?: string; selectedAgentId?: string; savedAt: string };
type GeminiLiveSession = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>;
const OFFLINE_DRAFT_KEY = "leo_offline_chat_draft_v1";
const CHAT_DOCUMENT_EXTENSIONS = /\.(pdf|docx|pptx|xlsx|txt|md|csv|json)$/i;
const PDF_MIME_TYPE = "application/pdf";

function isCurrentResearchRequest(message: string) {
  return /\b(search (the )?web|web search|look (it )?up online|google (it|search)|find (current|recent|latest|today'?s?) (news|information|price|updates?)|browse (the )?web|research (this|the|online)|sources? and citations?|latest|current|currently|today|tonight|this week|this month|recent|right now|as of \d{4}|202[5-9]|news|price|pricing today|availability|release notes|newly released|updated recently)\b/i.test(message);
}

function resampleTo16k(samples: Float32Array, sourceRate: number) {
  if (sourceRate === 16000) return samples;
  const ratio = sourceRate / 16000;
  const output = new Float32Array(Math.max(1, Math.floor(samples.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let sample = start; sample < end; sample += 1) total += samples[sample];
    output[index] = total / Math.max(1, end - start);
  }
  return output;
}

function encodePcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodePcm16(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true) / 0x8000;
  return samples;
}
function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createBrowserClient(url, key) : null;
}
function getRemoteDeviceId() {
  try {
    const key = "leo_remote_device_id";
    const existing = window.localStorage.getItem(key);
    if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  } catch { return "web-device"; }
}

export function LEOWidget({ full = false, initialSessionId = "" }: { full?: boolean; initialSessionId?: string }) {
  const [open, setOpen] = useState(full),
    [workspaceMode, setWorkspaceMode] = useState<"chat" | "work">("chat"),
    [workProject, setWorkProject] = useState<{ id: string; name: string } | null>(null),
    [workManifest, setWorkManifest] = useState<{ revision: number; files: Array<{ path: string; size: number; kind: string }>; totalBytes: number } | null>(null),
    [workUploading, setWorkUploading] = useState(false),
    [editingWorkspaceFile, setEditingWorkspaceFile] = useState(""),
    [workspaceFileContent, setWorkspaceFileContent] = useState(""),
    [workspaceFileBusy, setWorkspaceFileBusy] = useState(false),
    [workspaceRuntimeBusy, setWorkspaceRuntimeBusy] = useState(""),
    [workspaceRuntimeResult, setWorkspaceRuntimeResult] = useState<{ operation: string; ok?: boolean; exit_code?: number; stdout?: string; stderr?: string; status?: string; provider?: string; job_id?: string; message?: string } | null>(null),
    [messages, setMessages] = useState<Msg[]>([]),
    [input, setInput] = useState(""),
    [loading, setLoading] = useState(false),
    [pendingDocuments, setPendingDocuments] = useState<ChatDocument[]>([]),
    [pendingImages, setPendingImages] = useState<ChatImage[]>([]),
    [uploadingDocument, setUploadingDocument] = useState(false),
    [documentBusy, setDocumentBusy] = useState(""),
    [recording, setRecording] = useState(false),
    [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("Idle"),
    [welcomeName, setWelcomeName] = useState("there"),
    [plan, setPlan] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [voiceOpen, setVoiceOpen] = useState(false),
    [voice, setVoice] = useState("Kore"),
    [muted, setMuted] = useState(false),
    [voiceLocked, setVoiceLocked] = useState(false),
    [voiceFallbackMode, setVoiceFallbackMode] = useState(false);
  const [platformCredits, setPlatformCredits] = useState<number | null>(null);
  const [buildProgress, setBuildProgress] = useState<BuildProgressState | null>(null);
  const [trackBuildProgress, setTrackBuildProgress] = useState(false);
  const [buildTrackingSince, setBuildTrackingSince] = useState("");
  const [toolOptions, setToolOptions] = useState<ToolOption[]>([]);
  const [customAgentOptions, setCustomAgentOptions] = useState<CustomAgentOption[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [modelLoadError, setModelLoadError] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [effort, setEffort] = useState<"standard" | "deep">("standard");
  const [chatSearch, setChatSearch] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [microphoneMenuOpen, setMicrophoneMenuOpen] = useState(false);
  const [plusSubmenu, setPlusSubmenu] = useState<"skills" | "connectors" | "design" | "plugins" | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolOption | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<CustomAgentOption | null>(null);
  const [toolOptionsError, setToolOptionsError] = useState("");
  const [loadingToolOptions, setLoadingToolOptions] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [offlineDraft, setOfflineDraft] = useState<OfflineDraft | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState("");
  const [remoteCode, setRemoteCode] = useState("");
  const [remoteClaimCode, setRemoteClaimCode] = useState("");
  const [remotePairings, setRemotePairings] = useState<RemotePairing[]>([]);
  const [remoteSessionId, setRemoteSessionId] = useState("");
  const [remoteEvents, setRemoteEvents] = useState<RemoteEvent[]>([]);
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  useEffect(() => {
    const updateNetworkState = () => setNetworkOnline(navigator.onLine);
    updateNetworkState();
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, []);
  useEffect(() => {
    if (!trackBuildProgress) return;
    let cancelled = false;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const t = await token();
        const response = await fetch(`/api/chat/build-progress?since=${encodeURIComponent(buildTrackingSince)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.job) return;
        const job = data.job as { status?: string; error_code?: string; attempts?: number };
        const build = data.build as { status?: string; step?: string; error?: string; deployment_url?: string | null } | null;
        const events = Array.isArray(data.events) ? data.events.filter((event: { message?: unknown }) => typeof event.message === 'string').slice(0, 6).map((event: { id: string; message: string; status: string; created_at: string }) => ({ id: event.id, message: event.message, status: event.status, created_at: event.created_at })) : [];
        const terminal = ['succeeded', 'failed'].includes(String(job.status)) || (!['queued', 'running'].includes(String(job.status)) && ['live', 'build_failed', 'deploy_failed'].includes(String(build?.status)));
        const queueRetrying = job.status === 'queued' && Number(job.attempts || 0) > 1;
        setBuildProgress({ status: ['queued', 'running'].includes(String(job.status)) ? String(job.status) : String(build?.status || job.status || 'queued'), step: String(job.status === 'queued' ? (queueRetrying ? 'Retry scheduled' : 'Waiting for a background worker') : job.status === 'running' ? (build?.step || 'Worker is processing the build') : (build?.step || 'Build status')), message: String(job.status === 'queued' && queueRetrying ? 'A transient provider failure was recorded. A bounded retry is scheduled.' : build?.error || (job.status === 'failed' ? `Build failed (${job.error_code || 'unknown error'}).` : events[0]?.message || 'Waiting for the next persisted build event.')), liveUrl: build?.deployment_url || null, events });
        if (terminal || Date.now() - startedAt > 10 * 60 * 1000) setTrackBuildProgress(false);
      } catch { /* transient polling failures do not cancel the durable job */ }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [trackBuildProgress, buildTrackingSince]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OFFLINE_DRAFT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OfflineDraft;
        if (typeof parsed.text === "string" && (parsed.mode === "normal" || parsed.mode === "deep" || parsed.mode === "tools")) queueMicrotask(() => setOfflineDraft(parsed));
      }
    } catch {
      window.localStorage.removeItem(OFFLINE_DRAFT_KEY);
    }
  }, []);
  const [remoteCursor, setRemoteCursor] = useState(0);
  const [remoteMessage, setRemoteMessage] = useState("");
  const [videoConfirmPrompt, setVideoConfirmPrompt] = useState("");
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoAspectRatio, setVideoAspectRatio] = useState<"landscape" | "portrait">("landscape");
  const [videoCreditsPerSecond, setVideoCreditsPerSecond] = useState<number | null>(null);
  const [videoCreditsAvailable, setVideoCreditsAvailable] = useState<number | null>(null);
  const [activeVideoJobId, setActiveVideoJobId] = useState("");
  const [videoStatus, setVideoStatus] = useState("");
  const [error, setError] = useState("");
  const [sharingAssetId, setSharingAssetId] = useState("");
  const [sharedAssetStatus, setSharedAssetStatus] = useState<{ id: string; message: string } | null>(null);
  const sidRef = useRef("");
  const chatAbortController = useRef<AbortController | null>(null);
  const [activeChatId, setActiveChatId] = useState("");
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const geminiLiveSession = useRef<GeminiLiveSession | null>(null);
  const liveAudioContext = useRef<AudioContext | null>(null);
  const liveMicSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveMicProcessor = useRef<ScriptProcessorNode | null>(null);
  const liveSilentGain = useRef<GainNode | null>(null);
  const livePlaybackSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const livePlaybackAt = useRef(0);
  const liveSessionTimer = useRef<number | null>(null);
  const liveSessionActive = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedToBottom = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);
  useEffect(() => {
    chatPinnedToBottom.current = true;
  }, [activeChatId]);
  useEffect(() => {
    if (!chatPinnedToBottom.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = chatScrollRef.current;
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, loading, memoryOpen]);
  useEffect(() => {
    const sid = initialSessionId || localStorage.getItem("leo_chat_id") || crypto.randomUUID();
    sidRef.current = sid;
    queueMicrotask(() => setActiveChatId(sid));
    localStorage.setItem("leo_chat_id", sid);
    try {
      const saved = JSON.parse(localStorage.getItem("leo_chat_sessions") || "[]");
      if (Array.isArray(saved)) queueMicrotask(() => setChatHistory(saved.filter((item) => item && typeof item.id === "string" && typeof item.title === "string").slice(0, 30)));
    } catch {}
    const s = getBrowserSupabase();
    (async () => {
      try {
        const session = s ? (await s.auth.getSession()).data.session : null;
        if (session) {
          const creditResponse = await fetch('/api/credits', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
          if (creditResponse.ok) { const creditData = await creditResponse.json(); setPlatformCredits(Number.isSafeInteger(creditData.platform_credits) ? creditData.platform_credits : null); }
        }
        const r = await fetch(`/api/chat?session_id=${sid}`, {
          headers: session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Your conversation could not be loaded.");
        const serverMessages = Array.isArray(d.messages) ? d.messages : [];
        if (serverMessages.length) setMessages(serverMessages);
        else {
          try {
            const local = localStorage.getItem(`leo_chat_${sid}`);
            const parsed = local ? JSON.parse(local) : null;
            setMessages(Array.isArray(parsed) ? parsed : []);
          } catch { setMessages([]); }
        }
        setPlan(d.plan || null);
        if (d.profile?.full_name)
          setWelcomeName(d.profile.full_name.split(/\s+/)[0]);
      } catch {
        try {
          const local = localStorage.getItem(`leo_chat_${sid}`);
          const parsed = local ? JSON.parse(local) : null;
          if (Array.isArray(parsed)) setMessages(parsed);
          else setError("Your account conversation could not be reached and no local copy is available.");
        } catch { setError("Your conversation could not be restored."); }
      }
    })();
    (async () => {
      try {
        const t = await token();
        const response = await fetch('/api/models', { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Models could not be loaded.');
        const available = Array.isArray(data.models) ? data.models as ModelOption[] : [];
        setModelOptions(available);
        if (!available.some((item) => item.configured)) setSelectedModel("unavailable");
      } catch (cause) { setModelLoadError(cause instanceof Error ? cause.message : 'Models could not be loaded.'); }
    })();
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    if (!full || !sidRef.current || messages.length === 0) return;
    const firstUser = messages.find((message) => message.role === "user")?.content || "New chat";
    const item: ChatHistoryItem = { id: sidRef.current, title: firstUser.slice(0, 54), updatedAt: Date.now() };
    setChatHistory((current) => {
      const next = [item, ...current.filter((chat) => chat.id !== item.id)].slice(0, 30);
      try { localStorage.setItem("leo_chat_sessions", JSON.stringify(next)); } catch {}
      return next;
    });
    try { localStorage.setItem(`leo_chat_${sidRef.current}`, JSON.stringify(messages)); } catch {}
  }, [messages, full]);

  async function startNewChat() {
    for (const image of pendingImages) void deleteChatImageAsset(image.assetId).catch(() => {});
    const sid = crypto.randomUUID();
    sidRef.current = sid;
    setActiveChatId(sid);
    localStorage.setItem("leo_chat_id", sid);
    setMessages([]);
    setInput("");
    setPendingImages([]);
    setPendingDocuments([]);
    setReplacingImageId(null);
    setSelectedTool(null);
    setSelectedAgent(null);
    chatPinnedToBottom.current = true;
    setShowJumpToLatest(false);
    setError("");
    setMemoryOpen(false);
  }

  async function token() {
    const s = getBrowserSupabase();
    return s
      ? (await s.auth.getSession()).data.session?.access_token || ""
      : "";
  }

  async function openSavedChat(chat: ChatHistoryItem) {
    sidRef.current = chat.id;
    setActiveChatId(chat.id);
    chatPinnedToBottom.current = true;
    setShowJumpToLatest(false);
    localStorage.setItem("leo_chat_id", chat.id);
    setError("");
    setMemoryOpen(false);
    try {
      const t = await token();
      if (t) {
        const response = await fetch(`/api/chat?session_id=${encodeURIComponent(chat.id)}`, {
          headers: { Authorization: `Bearer ${t}` }, cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This conversation could not be restored from your account.");
        if (Array.isArray(data.messages) && data.messages.length) {
          setMessages(data.messages);
          try { localStorage.setItem(`leo_chat_${chat.id}`, JSON.stringify(data.messages)); } catch {}
          return;
        }
      }
      const local = localStorage.getItem(`leo_chat_${chat.id}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) { setMessages(parsed); return; }
      }
      setMessages([]);
    } catch (cause) {
      const local = localStorage.getItem(`leo_chat_${chat.id}`);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) { setMessages(parsed); setError("Showing this device's saved copy. Account sync could not be refreshed."); return; }
        } catch { /* fall through to the restore error */ }
      }
      setMessages([]);
      setError(cause instanceof Error ? cause.message : "This chat could not be restored.");
    }
  }

  async function loadMemories() {
    setMemoryBusy(true);
    try {
      const t = await token();
      const response = await fetch("/api/memory", { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: "no-store" });
      const data = await response.json();
      setMemories(Array.isArray(data.memories) ? data.memories : []);
    } catch { setMemories([]); }
    finally { setMemoryBusy(false); }
  }

  async function addMemory() {
    if (!memoryDraft.trim()) return;
    setMemoryBusy(true);
    try {
      const t = await token();
      const response = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ memory: memoryDraft.trim(), source: "user" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save memory");
      setMemoryDraft("");
      await loadMemories();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save memory"); }
    finally { setMemoryBusy(false); }
  }

  async function deleteMemory(id: string) {
    const t = await token();
    const response = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (response.ok) setMemories((current) => current.filter((memory) => memory.id !== id));
  }

  async function remoteRequest(url: string, init: RequestInit = {}) {
    const t = await token();
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init.headers || {}) }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Remote device service request failed.");
    return data;
  }

  async function loadRemotePairings() {
    try {
      const data = await remoteRequest("/api/remote/pairings");
      const pairings = Array.isArray(data.pairings) ? data.pairings as RemotePairing[] : [];
      setRemotePairings(pairings);
      if (remoteSessionId && !pairings.some((item) => item.id === remoteSessionId && item.status === "paired")) {
        setRemoteSessionId(""); setRemoteEvents([]); setRemoteCursor(0);
      }
    } catch (e) { setRemoteStatus(e instanceof Error ? e.message : "Could not load paired devices."); }
  }

  async function createRemotePairing() {
    setRemoteBusy(true); setRemoteStatus("");
    try {
      const data = await remoteRequest("/api/remote/pairings", { method: "POST", body: JSON.stringify({ deviceName: `${navigator.platform || "Browser"} · Leo AI` }) });
      setRemoteCode(String(data.pairing?.code || ""));
      setRemoteStatus("Code created. On your other device, sign in to the same Leo account and enter this code within five minutes.");
      await loadRemotePairings();
    } catch (e) { setRemoteStatus(e instanceof Error ? e.message : "Could not create a pairing code."); }
    finally { setRemoteBusy(false); }
  }

  async function claimRemotePairing(event?: FormEvent) {
    event?.preventDefault(); setRemoteBusy(true); setRemoteStatus("");
    try {
      const data = await remoteRequest("/api/remote/pairings/claim", { method: "POST", body: JSON.stringify({ code: remoteClaimCode, deviceName: `${navigator.platform || "Browser"} · Leo AI` }) });
      const id = String(data.pairing?.id || "");
      setRemoteClaimCode(""); setRemoteSessionId(id); setRemoteEvents([]); setRemoteCursor(0);
      setRemoteStatus("Device paired. Keep this panel open on both devices to exchange remote workspace messages.");
      await loadRemotePairings();
    } catch (e) { setRemoteStatus(e instanceof Error ? e.message : "Pairing failed."); }
    finally { setRemoteBusy(false); }
  }

  async function revokeRemotePairing(id: string) {
    try { await remoteRequest(`/api/remote/pairings?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (remoteSessionId === id) { setRemoteSessionId(""); setRemoteEvents([]); setRemoteCursor(0); } await loadRemotePairings(); setRemoteStatus("Device disconnected."); }
    catch (e) { setRemoteStatus(e instanceof Error ? e.message : "Could not disconnect device."); }
  }

  async function shareCurrentChat() {
    if (!remoteSessionId) return;
    setRemoteBusy(true); setRemoteStatus("");
    try {
      const title = messages.find((message) => message.role === "user")?.content.slice(0, 54) || "Shared Leo chat";
      const data = await remoteRequest(`/api/remote/sessions/${encodeURIComponent(remoteSessionId)}/events`, { method: "POST", body: JSON.stringify({ type: "chat.open", deviceId: getRemoteDeviceId(), payload: { sessionId: sidRef.current, title } }) });
      if (data.event) { const item = data.event as RemoteEvent; setRemoteEvents((current) => current.some((e) => e.id === item.id) ? current : [...current, item].slice(-80)); setRemoteCursor((cursor) => Math.max(cursor, item.id)); }
      setRemoteStatus("Current chat handoff sent. On your other device, choose Open shared chat in the relay.");
    } catch (e) { setRemoteStatus(e instanceof Error ? e.message : "Could not share this chat."); }
    finally { setRemoteBusy(false); }
  }

  async function sendRemoteMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = remoteMessage.trim(); if (!text || !remoteSessionId) return;
    setRemoteBusy(true);
    try {
      const data = await remoteRequest(`/api/remote/sessions/${encodeURIComponent(remoteSessionId)}/events`, { method: "POST", body: JSON.stringify({ type: "message", deviceId: getRemoteDeviceId(), payload: { text } }) });
      if (data.event) { const item = data.event as RemoteEvent; setRemoteEvents((current) => current.some((e) => e.id === item.id) ? current : [...current, item].slice(-80)); setRemoteCursor((cursor) => Math.max(cursor, item.id)); }
      setRemoteMessage("");
    } catch (e) { setRemoteStatus(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { setRemoteBusy(false); }
  }

  useEffect(() => {
    if (!remoteOpen) return;
    const initial = window.setTimeout(() => { void loadRemotePairings(); }, 0);
    const timer = window.setInterval(() => { void loadRemotePairings(); }, 3000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
    // loadRemotePairings intentionally reads the latest session ID for each polling tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteOpen]);

  useEffect(() => {
    if (!remoteOpen || !remoteSessionId) return;
    let cancelled = false;
    const controller = new AbortController();
    const connect = async () => {
      let cursor = remoteCursor;
      while (!cancelled) {
        try {
          const t = await token();
          const response = await fetch(`/api/remote/sessions/${encodeURIComponent(remoteSessionId)}/events?stream=1&after=${cursor}`, { headers: t ? { Authorization: `Bearer ${t}`, Accept: "text/event-stream" } : { Accept: "text/event-stream" }, cache: "no-store", signal: controller.signal });
          if (!response.ok || !response.body) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Remote connection could not be opened."); }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!cancelled) {
            const part = await reader.read();
            if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            const frames = buffer.split("\n\n"); buffer = frames.pop() || "";
            for (const frame of frames) {
              const line = frame.split("\n").find((value) => value.startsWith("data: "));
              if (!line) continue;
              try {
                const value = JSON.parse(line.slice(6)) as { event?: RemoteEvent; error?: string; cursor?: number };
                if (value.event) {
                  const item = value.event;
                  cursor = Math.max(cursor, Number(item.id) || cursor);
                  setRemoteEvents((current) => current.some((existing) => existing.id === item.id) ? current : [...current, item].slice(-80));
                }
                if (value.error) setRemoteStatus(value.error);
              } catch { /* Ignore malformed or partial SSE frames. */ }
            }
          }
          setRemoteCursor((current) => Math.max(current, cursor));
        } catch (e) {
          if (cancelled || (e instanceof DOMException && e.name === "AbortError")) break;
          setRemoteStatus(e instanceof Error ? e.message : "Remote connection interrupted.");
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
        }
      }
    };
    void connect();
    return () => { cancelled = true; controller.abort(); };
  }, [remoteOpen, remoteSessionId, remoteCursor]);

  async function send(text = input, mode: "normal" | "deep" | "tools" = "normal", attachedTool = selectedTool, attachedAgent = selectedAgent, forceWebSearch = false) {
    if ((!text.trim() && !pendingImages.length && !pendingDocuments.length) || loading) return;
    const next = text.trim() || (pendingImages.length ? 'Please analyse the attached image(s) and describe what you can see.' : 'Please inspect the attached project files and tell me what you can help with.');
    const attachedDocuments = pendingDocuments;
    const attachedImages = pendingImages;
    const requestedMode = effort === "deep" && mode === "normal" ? "deep" : mode;
    const effectiveMode = attachedTool || attachedAgent?.allowed_tools.length ? "tools" : requestedMode;
    if (!navigator.onLine) {
      const draft: OfflineDraft = { text: next, mode: effectiveMode, ...(attachedTool ? { selectedToolName: attachedTool.name } : {}), ...(attachedAgent ? { selectedAgentId: attachedAgent.id } : {}), savedAt: new Date().toISOString() };
      try {
        window.localStorage.setItem(OFFLINE_DRAFT_KEY, JSON.stringify(draft));
        setOfflineDraft(draft);
        setInput("");
        setMenu(false);
        setError("You are offline. Your prompt is saved on this device and has not been sent to Leo.");
      } catch {
        setError("You are offline and this browser could not save the prompt locally. Copy it before leaving this page.");
      }
      return;
    }
    setInput("");
    setMenu(false);
    chatPinnedToBottom.current = true;
    setShowJumpToLatest(false);
    setMessages((m) => [...m, { role: "user", content: next, ...(attachedDocuments.length ? { documents: attachedDocuments } : {}), ...(attachedImages.length ? { images: attachedImages } : {}), ...((attachedTool || attachedAgent) ? { selectedToolLabel: attachedTool?.name || attachedAgent?.name } : {}) }]);
    setSelectedTool(null);
    setSelectedAgent(null);
    const negatesBuild = /\b(?:do not|don't|never|not)\b.{0,32}\b(?:build|create|make|deploy|publish|launch)\b/i.test(next);
    const buildIntent = !negatesBuild &&
      /\b(build|create|make|deploy|publish|launch)\b/i.test(next) &&
      /\b(website|web\s?app|saas|game|project|site)\b/i.test(next);
    if (buildIntent) { setBuildTrackingSince(new Date().toISOString()); setBuildProgress({ status: 'preparing', step: 'Preparing your build request', message: 'Leo is preparing the project and will show persisted build events here.' }); setTrackBuildProgress(true); }
    setLoading(true);
    setError("");
    try {
      const t = await token();
      const imageIntent = /\b(generate|create|make|draw)\b.{0,40}\b(image|picture|illustration|visual)\b/i.test(next);
      const repositoryIntent = /\b(github|git\s?hub|repository|repo)\b/i.test(next);
      const shouldStream = workspaceMode !== "work" && effectiveMode === "normal" && !attachedTool && !attachedAgent && !buildIntent && !imageIntent && !repositoryIntent && !forceWebSearch && !attachedDocuments.length && !attachedImages.length && !isCurrentResearchRequest(next);
      if (shouldStream) {
        const aborter = new AbortController();
        chatAbortController.current = aborter;
        setMessages((current) => [...current, { role: "assistant", content: "" }]);
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          signal: aborter.signal,
          headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
          body: JSON.stringify({ session_id: sidRef.current, message: next, ...(selectedModel !== 'auto' && selectedModel !== 'unavailable' ? { model: selectedModel } : {}) }),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          throw new Error(failure.error || "Leo streaming is unavailable.");
        }
        if (!response.body) throw new Error("The streaming response was empty.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedText = "";
        let finished = false;
        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const line = frame.split("\n").find((part) => part.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6)) as { type?: string; text?: string; error?: string };
            if (event.type === "delta" && typeof event.text === "string") {
              streamedText += event.text;
              setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: streamedText } : item));
            } else if (event.type === "error") {
              throw new Error(event.error || "Leo could not complete the response.");
            } else if (event.type === "done") finished = true;
          }
        }
        if (!streamedText.trim() && !aborter.signal.aborted) throw new Error("Leo returned an empty response.");
      } else {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
          body: JSON.stringify({ session_id: sidRef.current, message: next, work_mode: workspaceMode === "work", ...(workspaceMode === "work" && workProject ? { project_id: workProject.id } : {}), mode: effectiveMode, request_id: crypto.randomUUID(), ...(attachedTool ? { tool_name: attachedTool.name } : {}), ...(attachedAgent ? { custom_agent_id: attachedAgent.id } : {}), ...(selectedModel !== 'auto' && selectedModel !== 'unavailable' ? { model: selectedModel } : {}), ...(forceWebSearch ? { web_search: true } : {}), ...(attachedDocuments.length ? { document_asset_ids: attachedDocuments.map(document => document.assetId) } : {}), ...(attachedImages.length ? { image_asset_ids: attachedImages.map(image => image.assetId) } : {}) }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Leo is unavailable");
        const citations = Array.isArray(d.citations) ? d.citations.filter((item: unknown): item is ChatCitation => {
          if (!item || typeof item !== 'object' || typeof (item as ChatCitation).url !== 'string') return false;
          try {
            const url = new URL((item as ChatCitation).url);
            return url.protocol === 'https:' && !url.username && !url.password;
          } catch {
            return false;
          }
        }) : [];
        setMessages((m) => [...m, { role: "assistant", content: d.reply, projectBuilder: d.projectBuilder, ...(typeof d.image === "string" ? { image: d.image } : {}), ...(typeof d.assetId === "string" ? { assetId: d.assetId } : {}), ...(citations.length ? { citations } : {}) }]);
        if (Number.isSafeInteger(d.platformCreditsRemaining)) setPlatformCredits(d.platformCreditsRemaining);
      }
      if (attachedDocuments.length) {
        const sentIds = new Set(attachedDocuments.map(document => document.assetId));
        setPendingDocuments(current => current.filter(document => !sentIds.has(document.assetId)));
      }
      if (attachedImages.length) {
        const sentImageIds = new Set(attachedImages.map(image => image.assetId));
        setPendingImages(current => current.filter(image => !sentImageIds.has(image.assetId)));
      }
      if (offlineDraft?.text === next && offlineDraft.mode === effectiveMode) {
        setOfflineDraft(null);
        window.localStorage.removeItem(OFFLINE_DRAFT_KEY);
      }
    } catch (e) {
      setMessages((current) => current.filter((item, index) => !(index === current.length - 1 && item.role === "assistant" && !item.content)));
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "Leo is temporarily unavailable.");
      }
    } finally {
      chatAbortController.current = null;
      setLoading(false);
    }
  }
  function stopGeneration() {
    chatAbortController.current?.abort();
    chatAbortController.current = null;
    setLoading(false);
  }
  async function loadToolOptions() {
    setLoadingToolOptions(true);
    setToolOptionsError("");
    try {
      const t = await token();
      const response = await fetch("/api/chat/tools", {
        headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your tools could not be loaded.");
      setToolOptions(Array.isArray(data.tools) ? data.tools : []);
      setCustomAgentOptions(Array.isArray(data.agents) ? data.agents : []);
    } catch (cause) {
      setToolOptionsError(cause instanceof Error ? cause.message : "Your tools could not be loaded.");
    } finally {
      setLoadingToolOptions(false);
    }
  }
  async function generateImage() {
    setMenu(false);
    setLoading(true);
    setError("");
    try {
      const t = await token();
      const requestId = crypto.randomUUID();
      const prompt = input.trim() || "A modern business website hero image";
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestId, Authorization: `Bearer ${t}` },
        body: JSON.stringify({ session_id: sidRef.current, message: `Generate an image: ${prompt}`, request_id: requestId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Image generation failed");
      if (Number.isSafeInteger(d.platformCreditsRemaining)) setPlatformCredits(d.platformCreditsRemaining);
      setMessages((m) => [
        ...m,
        { role: "user", content: `Generate an image: ${prompt}` },
        { role: "assistant", content: d.reply, image: d.image, assetId: d.assetId },
      ]);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setLoading(false);
    }
  }
  async function generateVisual(mode: "3d" | "diagram") {
    setMenu(false);
    setLoading(true);
    setError("");
    try {
      const t = await token();
      const requestId = crypto.randomUUID();
      const prompt = input.trim() || "A premium futuristic visual concept";
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestId, Authorization: `Bearer ${t}` },
        body: JSON.stringify({ session_id: sidRef.current, message: `Generate an image: ${prompt}`, image_mode: mode, request_id: requestId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Visual generation failed");
      if (typeof d.image !== "string") throw new Error("No visual was returned.");
      if (Number.isSafeInteger(d.platformCreditsRemaining)) setPlatformCredits(d.platformCreditsRemaining);
      setMessages((m) => [
        ...m,
        { role: "user", content: `Generate an image: ${prompt}` },
        { role: "assistant", content: d.reply, image: d.image, assetId: d.assetId },
      ]);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Visual generation failed");
    } finally {
      setLoading(false);
    }
  }
  async function deleteChatImageAsset(assetId: string) {
    const t = await token();
    const response = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The uploaded image could not be removed.');
  }
  async function removePendingChatImage(assetId: string) {
    setError('');
    try {
      await deleteChatImageAsset(assetId);
      setPendingImages(current => current.filter(item => item.assetId !== assetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The uploaded image could not be removed.');
    }
  }
  async function uploadChatImage(file: File, replaceAssetId?: string) {
    if (!replaceAssetId && pendingImages.length >= 3) { setError('Attach up to three images to one message.'); return; }
    if (file.size < 1 || file.size > 4 * 1024 * 1024) { setReplacingImageId(null); setError('Choose an image no larger than 4 MB.'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setReplacingImageId(null); setError('Use a PNG, JPEG, or WebP image.'); return; }
    setUploadingDocument(true);
    setError('');
    try {
      const t = await token();
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/chat/images', { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Image upload failed.');
      const image = data.image as ChatImage;
      setPendingImages(current => replaceAssetId
        ? current.map(item => item.assetId === replaceAssetId ? image : item)
        : current.length < 3 ? [...current, image] : current);
      setReplacingImageId(null);
      setMenu(false);
      if (replaceAssetId) {
        try { await deleteChatImageAsset(replaceAssetId); }
        catch { setError('The replacement image is attached, but the previous private upload could not be cleaned up.'); }
      }
    } catch (cause) {
      setReplacingImageId(null);
      setError(cause instanceof Error ? cause.message : 'The image could not be uploaded.');
    } finally { setUploadingDocument(false); }
  }
  async function uploadChatDocument(file: File) {
    if (pendingDocuments.length >= 3) {
      setError("Attach up to three documents to one message.");
      return;
    }
    setUploadingDocument(true);
    setError("");
    try {
      const t = await token();
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/chat/documents", {
        method: "POST",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Document upload failed.");
      const document = data.document as ChatDocument;
      setPendingDocuments(current => current.length < 3 ? [...current, document] : current);
      setMenu(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be uploaded.");
    } finally {
      setUploadingDocument(false);
    }
  }
  async function openWorkspaceFile(path: string) {
    if (!workProject) return;
    setWorkspaceFileBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workProject.id)}/source?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "This file could not be opened.");
      setEditingWorkspaceFile(path);
      setWorkspaceFileContent(result.data.content || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "File could not be opened."); }
    finally { setWorkspaceFileBusy(false); }
  }
  async function saveWorkspaceFile() {
    if (!workProject || !workManifest || !editingWorkspaceFile) return;
    setWorkspaceFileBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workProject.id)}/source`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: editingWorkspaceFile, content: workspaceFileContent, revision: workManifest.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "File could not be saved.");
      const manifestResponse = await fetch(`/api/workspaces/${encodeURIComponent(workProject.id)}/source`, { cache: "no-store" });
      const manifestData = await manifestResponse.json();
      if (!manifestResponse.ok) throw new Error(manifestData.error || "File saved, but workspace metadata could not refresh.");
      setWorkManifest(manifestData.data);
      setEditingWorkspaceFile("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "File could not be saved."); }
    finally { setWorkspaceFileBusy(false); }
  }

  async function runWorkspaceOperation(operation: "inspect" | "install" | "test" | "typecheck" | "lint" | "build" | "git_status" | "git_diff") {
    if (!workProject || workspaceRuntimeBusy) return;
    setWorkspaceRuntimeBusy(operation);
    setWorkspaceRuntimeResult(null);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workProject.id)}/runtime`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The GitHub-hosted workspace job could not be queued.");
      const queued = result;
      setWorkspaceRuntimeResult({ operation, status: queued.status || "queued", provider: queued.provider, job_id: queued.job_id, message: "Queued on a fresh GitHub-hosted runner. Waiting for execution results…" });
      if (queued.job_id) {
        for (let attempt = 0; attempt < 45; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const statusResponse = await fetch(`/api/runtime/jobs/${encodeURIComponent(queued.job_id)}`, { cache: "no-store" });
          const statusData = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(statusData.error || "Runtime job status could not be retrieved.");
          const job = statusData.job;
          if (job.status === "completed" || job.status === "failed") {
            setWorkspaceRuntimeResult({ operation, status: job.status, ok: job.status === "completed" && job.result?.exit_code === 0, exit_code: job.result?.exit_code ?? null, stdout: job.result?.stdout || "", stderr: job.result?.stderr || job.error || "", provider: "github_actions", job_id: queued.job_id, message: job.status === "completed" ? "Execution finished." : (job.error || "Execution failed.") });
            return;
          }
          setWorkspaceRuntimeResult({ operation, status: job.status, provider: "github_actions", job_id: queued.job_id, message: "Runner is processing the job…" });
        }
        setWorkspaceRuntimeResult({ operation, status: "running", provider: "github_actions", job_id: queued.job_id, message: "The job is still running. You can check its status again using the job ID." });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace runtime operation failed.");
    } finally { setWorkspaceRuntimeBusy(""); }
  }

  async function uploadWorkFiles(files: File[]) {
    if (!files.length) return;
    setWorkUploading(true);
    setError("");
    try {
      let project = workProject;
      if (!project) {
        const first = files[0].name.replace(/\.(zip)$/i, "").replace(/[-_]+/g, " ").slice(0, 100) || "My project workspace";
        const created = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: first }) });
        const createdData = await created.json();
        if (!created.ok || !createdData.data?.id) throw new Error(createdData.error || "A project workspace could not be created.");
        project = { id: createdData.data.id, name: createdData.data.project_name || first };
        setWorkProject(project);
      }
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(`/api/workspaces/${encodeURIComponent(project.id)}/source`, { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Could not add ${file.name} to the workspace.`);
      }
      const manifestResponse = await fetch(`/api/workspaces/${encodeURIComponent(project.id)}/source`, { cache: "no-store" });
      const manifestData = await manifestResponse.json();
      if (!manifestResponse.ok) throw new Error(manifestData.error || "Workspace files were saved but could not be listed.");
      setWorkManifest(manifestData.data);
      setInput(current => current || "Inspect this project workspace. Map its architecture, identify the important files, and tell me what you recommend we work on first.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project files could not be saved.");
    } finally {
      setWorkUploading(false);
    }
  }

  async function reviewFile(file: File) {
    if (file.type.startsWith('image/')) { await uploadChatImage(file); return; }
    if (CHAT_DOCUMENT_EXTENSIONS.test(file.name)) {
      await uploadChatDocument(file);
      return;
    }
    setMenu(false);
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/file-review", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "File review failed");
      setMessages((m) => [
        ...m,
        { role: "user", content: `Uploaded ${file.name}` },
        { role: "assistant", content: d.reply || "File received." },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "File upload failed");
    } finally {
      setLoading(false);
    }
  }
  function stopRecording() {
    if (media.current && media.current.state !== "inactive")
      media.current.stop();
    setRecording(false);
  }
  async function startVoiceInput() {
    if (recording) {
      stopRecording();
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true });
      const rec = new MediaRecorder(s);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        s.getTracks().forEach((t) => t.stop());
        setLoading(true);
        setError("");
        try {
          const fd = new FormData();
          fd.append(
            "audio",
            new Blob(chunks.current, { type: "audio/webm" }),
            "voice.webm",
          );
          fd.append("mode", voiceFallbackMode ? "chat" : "transcribe");
          fd.append("session_id", sidRef.current);
          const r = await fetch("/api/voice", { method: "POST", body: fd });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || "Voice processing failed");
          }
          const text = decodeURIComponent(r.headers.get("X-Transcript") || "");
          const assistantReply = decodeURIComponent(r.headers.get("X-Assistant-Reply") || "");
          if (!text.trim()) throw new Error("No speech was detected.");
          if (voiceFallbackMode) {
            setMessages((current) => [...current, { role: "user", content: text }, { role: "assistant", content: assistantReply || "I processed your voice message." }]);
            setVoiceStatus("Speaking");
          } else {
            setInput(text);
          }
          const audioBlob = await r.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const playback = new Audio(audioUrl);
          playback.onended = () => { URL.revokeObjectURL(audioUrl); if (voiceFallbackMode) setVoiceStatus("Listening"); };
          await playback.play().catch(() => { URL.revokeObjectURL(audioUrl); });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setLoading(false);
        }
      };
      media.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone permission was denied or unavailable.");
    }
  }
  async function connectGeminiLive(session: { token: string; model: string; voice?: string }) {
    const local = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    stream.current = local;
    const context = new AudioContext();
    liveAudioContext.current = context;
    await context.resume();
    const ai = new GoogleGenAI({ apiKey: session.token, httpOptions: { apiVersion: "v1alpha" } });
    const liveConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: session.voice || "Kore" } } },
      systemInstruction: LIVE_VOICE_SYSTEM_INSTRUCTION,
    };
    liveSessionActive.current = true;
    const connected = await ai.live.connect({
      model: session.model,
      config: liveConfig,
      callbacks: {
        onopen: () => setVoiceStatus("Listening"),
        onmessage: (message) => {
          const content = message.serverContent;
          if (content?.interrupted) {
            livePlaybackSources.current.forEach((source) => { try { source.stop(); } catch {} });
            livePlaybackSources.current.clear();
            livePlaybackAt.current = 0;
          }
          for (const part of content?.modelTurn?.parts || []) {
            const blob = part.inlineData;
            if (!blob?.data || !blob.mimeType?.startsWith("audio/pcm")) continue;
            const outputContext = liveAudioContext.current;
            if (!outputContext) continue;
            const samples = decodePcm16(blob.data);
            if (!samples.length) continue;
            const sampleRate = Number(blob.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
            const buffer = outputContext.createBuffer(1, samples.length, sampleRate);
            buffer.copyToChannel(samples, 0);
            const source = outputContext.createBufferSource();
            source.buffer = buffer;
            source.connect(outputContext.destination);
            livePlaybackSources.current.add(source);
            source.onended = () => livePlaybackSources.current.delete(source);
            const startAt = Math.max(outputContext.currentTime + 0.02, livePlaybackAt.current);
            source.start(startAt);
            livePlaybackAt.current = startAt + buffer.duration;
            setVoiceLocked(true);
            setVoiceStatus("Speaking");
          }
          if (content?.turnComplete || content?.waitingForInput) {
            setVoiceStatus("Listening");
          }
        },
        onerror: () => {
          setError("The live voice connection encountered an error. End the call and try again.");
          endVoiceChat();
          setVoiceStatus("Error");
        },
        onclose: () => {
          if (!liveSessionActive.current) return;
          setError("The live voice connection closed. Start a new call to continue.");
          endVoiceChat();
        },
      },
    });
    geminiLiveSession.current = connected;

    const source = context.createMediaStreamSource(local);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    processor.onaudioprocess = (event) => {
      if (!liveSessionActive.current || local.getAudioTracks().every((track) => !track.enabled)) return;
      const samples = resampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate);
      if (!samples.length) return;
      try {
        connected.sendRealtimeInput({ audio: { data: encodePcm16(samples), mimeType: "audio/pcm;rate=16000" } });
      } catch {
        setVoiceStatus("Error");
      }
    };
    liveMicSource.current = source;
    liveMicProcessor.current = processor;
    liveSilentGain.current = silentGain;
    setVoiceLocked(true);
    setVoiceStatus("Listening");
    liveSessionTimer.current = window.setTimeout(() => {
      setError("This live voice session reached its five-minute limit. Start a new call to continue.");
      endVoiceChat();
    }, 5 * 60 * 1000);
  }
  async function startVoiceChat() {
    if (voiceOpen) {
      endVoiceChat();
      return;
    }
    setVoiceOpen(true);
    setVoiceLocked(false);
    setVoiceStatus("Connecting");
    setError("");
    try {
      const t = await token();
      const r = await fetch("/api/realtime/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ voice }),
      });
      const session = await r.json();
      if (!r.ok) throw new Error(session.error || "Unable to start voice chat");
      if (session.mode === "gemini_live" && typeof session.token === "string" && typeof session.model === "string") {
        setVoiceFallbackMode(false);
        await connectGeminiLive(session);
        return;
      }
      if (session.mode === "gemini_turn_based") {
        setVoiceFallbackMode(true);
        setVoiceStatus("Leo Voice ready · tap to speak");
        return;
      }
      setVoiceFallbackMode(false);
      const secret = session.client_secret?.value;
      if (!secret)
        throw new Error("Realtime session did not return a client secret");
      const connection = new RTCPeerConnection();
      pc.current = connection;
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected")
          setVoiceStatus("Listening");
        if (connection.connectionState === "disconnected")
          setVoiceStatus("Reconnecting");
        if (connection.connectionState === "failed") setVoiceStatus("Error");
      };
      connection.ontrack = (e) => {
        if (audio.current) audio.current.srcObject = e.streams[0];
      };
      const local = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = local;
      local.getTracks().forEach((track) => connection.addTrack(track, local));
      const dc = connection.createDataChannel("oai-events");
      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "response.created") setVoiceStatus("Thinking");
          if (
            event.type === "response.audio.delta" ||
            event.type === "response.output_audio.delta"
          ) {
            setVoiceLocked(true);
            setVoiceStatus("Speaking");
          }
          if (event.type === "response.done") setVoiceStatus("Listening");
          if (event.type === "input_audio_buffer.speech_started")
            setVoiceStatus("Listening");
        } catch {}
      };
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdp.ok) throw new Error("Realtime connection was rejected");
      await connection.setRemoteDescription({
        type: "answer",
        sdp: await sdp.text(),
      });
    } catch (e) {
      setVoiceStatus("Error");
      setError(e instanceof Error ? e.message : "Voice chat could not connect");
      setVoiceOpen(false);
    }
  }
  function endVoiceChat() {
    if (recording) stopRecording();
    liveSessionActive.current = false;
    if (liveSessionTimer.current !== null) window.clearTimeout(liveSessionTimer.current);
    liveSessionTimer.current = null;
    if (liveMicProcessor.current) liveMicProcessor.current.onaudioprocess = null;
    try { liveMicProcessor.current?.disconnect(); } catch {}
    try { liveMicSource.current?.disconnect(); } catch {}
    try { liveSilentGain.current?.disconnect(); } catch {}
    liveMicProcessor.current = null;
    liveMicSource.current = null;
    liveSilentGain.current = null;
    try { geminiLiveSession.current?.close(); } catch {}
    geminiLiveSession.current = null;
    livePlaybackSources.current.forEach((source) => { try { source.stop(); } catch {} });
    livePlaybackSources.current.clear();
    livePlaybackAt.current = 0;
    void liveAudioContext.current?.close().catch(() => {});
    liveAudioContext.current = null;
    setVoiceFallbackMode(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    pc.current?.close();
    pc.current = null;
    setVoiceOpen(false);
    setMuted(false);
    setVoiceLocked(false);
    setVoiceStatus("Ended");
  }
  function toggleMute() {
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((v) => !v);
    setVoiceStatus(!muted ? "Muted" : "Listening");
  }
  const inputs = (
    <>
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) replacingImageId ? void uploadChatImage(f, replacingImageId) : void reviewFile(f);
          else setReplacingImageId(null);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) replacingImageId ? void uploadChatImage(f, replacingImageId) : void reviewFile(f);
          else setReplacingImageId(null);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.zip,.ts,.tsx,.js,.jsx,.mjs,.cjs,.css,.scss,.html,.htm,.py,.sql,.yml,.yaml,.toml,.xml,.sh"
        className="hidden"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) {
            if (replacingImageId && files[0]) void uploadChatImage(files[0], replacingImageId);
            else if (workspaceMode === "work") void uploadWorkFiles(files.slice(0, 20));
            else if (files[0]) void reviewFile(files[0]);
          } else setReplacingImageId(null);
          e.currentTarget.value = "";
        }}
      />
    </>
  );
  const tools: Array<[LucideIcon, string, () => void]> = [
    [Camera, "Camera", () => cameraRef.current?.click()],
    [ImageIcon, "Photos", () => photoRef.current?.click()],
    [Paperclip, "Files", () => fileRef.current?.click()],
    [
      Search,
      "Web research",
      () => {
        setMenu(false);
        if (input.trim()) research();
      },
    ],
    [Brain, "Think deeper", () => send(input, "deep")],
    [Wrench, "Choose an approved read-only tool", () => { void loadToolOptions(); }],
    [ImageIcon, "Generate image · 1 credit", generateImage],
    [Video, "Generate video", prepareVideo],
    [Sparkles, "Generate 3D visual", () => generateVisual("3d")],
    [Sparkles, "Generate diagram", () => generateVisual("diagram")],
    [
      Code2,
      "Write code",
      () => send("Help me write the code for this: " + input),
    ],
    [
      Globe2,
      "Create website",
      () => send("Help me create a website: " + input),
    ],
  ];
  const composer = (
    <div ref={menuRef} className="relative">
      {pendingImages.length > 0 && <div className="mb-2 flex flex-wrap gap-2" aria-label="Image attachments">
        {pendingImages.map(image => <div key={image.assetId} className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <Image src={image.previewUrl} alt={image.fileName || 'Image attachment'} fill unoptimized className="object-cover" sizes="80px" />
          <div className="absolute inset-x-1 bottom-1 flex justify-center gap-1">
            <button type="button" onClick={() => { setReplacingImageId(image.assetId); photoRef.current?.click(); }} aria-label={`Replace ${image.fileName}`} className="rounded-md bg-black/85 px-1.5 py-1 text-[9px] font-semibold text-white">Replace</button>
            <button type="button" onClick={() => void removePendingChatImage(image.assetId)} aria-label={`Remove ${image.fileName}`} className="rounded-md bg-black/85 p-1 text-white"><X size={11}/></button>
          </div>
        </div>)}
      </div>}
      {pendingDocuments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">
        {pendingDocuments.map(document => <div key={document.assetId} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-zinc-300">
          <Paperclip size={13} className="shrink-0 text-[var(--gold)]"/>
          <span className="max-w-48 truncate">{document.fileName}</span>
          <button type="button" onClick={() => setPendingDocuments(current => current.filter(item => item.assetId !== document.assetId))} aria-label={`Remove ${document.fileName}`} className="text-zinc-500 hover:text-white"><X size={13}/></button>
        </div>)}
      </div>}
      {uploadingDocument && <p className="mb-2 text-xs text-zinc-500" role="status">Uploading attachment…</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[.13] bg-[#151515] p-2 shadow-[0_12px_35px_rgba(0,0,0,.22)]">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label="Open Leo tools"
          aria-expanded={menu}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] hover:bg-white/[.08]"
        >
          <Plus size={20} />
        </button>
        {(selectedTool || selectedAgent) && <button type="button" onClick={() => { setSelectedTool(null); setSelectedAgent(null); }} aria-label="Remove selected tool or agent" className="flex max-w-[35%] shrink-0 items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-300"><Wrench size={11}/><span className="truncate">{selectedAgent ? `Agent: ${selectedAgent.name}` : selectedTool?.name}</span><X size={11}/></button>}
        <label className="sr-only" htmlFor="leo-model-select">Leo model</label>
        <select id="leo-model-select" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!modelOptions.some((item) => item.configured)} title={modelLoadError || (!modelOptions.some((item) => item.configured) ? 'No configured text model is available.' : 'Choose the model for this message')} className="order-3 max-w-[150px] shrink-0 rounded-xl border border-white/10 bg-white/[.04] px-2 py-2 text-[10px] text-zinc-300 outline-none focus:border-[var(--gold)] disabled:opacity-50 sm:order-none">
          {modelOptions.some((item) => item.configured) ? <option value="auto">Auto</option> : <option value="unavailable">No model configured</option>}
          {modelOptions.filter((item) => item.configured).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}
        </select>
        <label className="order-4 inline-flex h-10 items-center gap-1 rounded-xl border border-white/10 px-2 text-[10px] text-zinc-400 sm:order-none">
          <span className="sr-only">Reasoning effort</span>
          <select value={effort} onChange={(event) => setEffort(event.target.value as "standard" | "deep")} className="max-w-[64px] bg-transparent outline-none"><option value="standard">Fast</option><option value="deep">Deep</option></select>
        </label>
        {workspaceMode === "work" && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-blue-300"><Wrench size={11}/> Work</span>}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none placeholder:text-zinc-600"
          placeholder={workspaceMode === "work" ? "Describe what you want Leo to do with your files…" : "Message Leo..."}
        />
        <div className="relative">
        <button
          type="button"
          onClick={() => void openMicrophoneMenu()}
          aria-label="Voice to text"
          aria-expanded={microphoneMenuOpen}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${recording ? "bg-red-500 text-white" : "hover:bg-white/[.06]"}`}
        >
          {recording ? (
            <span className="text-xs font-bold">STOP</span>
          ) : (
            <Mic size={19} />
          )}
        </button>
        {microphoneMenuOpen && <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-64 rounded-xl border border-white/15 bg-[#191919] p-2 shadow-2xl"><p className="px-2 py-1 text-[10px] uppercase tracking-[.14em] text-zinc-600">Microphone</p><button type="button" onClick={() => { setMicrophoneMenuOpen(false); void startVoiceInput(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"><Mic size={14}/> Dictate into composer</button><button type="button" onClick={() => { setMicrophoneMenuOpen(false); void startVoiceChat(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"><Volume2 size={14}/> Leo Voice conversation</button><div className="my-1 border-t border-white/10"/><p className="px-2 py-1 text-[10px] text-zinc-600">Audio input</p>{audioDevices.length ? audioDevices.map((device, index) => <button key={device.deviceId} type="button" onClick={() => setSelectedAudioDevice(device.deviceId)} className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] ${selectedAudioDevice === device.deviceId ? "bg-white/10 text-white" : "text-zinc-500 hover:bg-white/5"}`}>{device.label || `Microphone ${index + 1}`}</button>) : <p className="px-2 py-1 text-[11px] text-zinc-600">Device names appear after permission is granted.</p>}</div>}
        </div>
        <button
          type="button"
          onClick={startVoiceChat}
          aria-label="Start Leo voice chat"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 hover:bg-white/[.06]"
        >
          <Volume2 size={19} />
        </button>
        <button
          type="button"
          disabled={(!input.trim() && !pendingImages.length && !pendingDocuments.length) || loading}
          onClick={() => send()}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--gold)] text-black disabled:opacity-30"
        >
          <Send size={18} />
        </button>
      </div>
      {menu && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[min(360px,calc(100vw-24px))] rounded-3xl border border-white/10 bg-[#101011]/98 p-2 shadow-2xl backdrop-blur-xl">
          <div className="space-y-0.5">
            <button type="button" onClick={() => { setMenu(false); fileRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[.08]"><Paperclip size={17}/><span className="flex-1">Upload or add files</span><span className="text-[10px] text-zinc-600">Ctrl+U</span></button>
            <Link href="/app/projects" onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[.08]"><Library size={17}/><span className="flex-1">Add to project</span><ChevronRight size={14} className="text-zinc-600"/></Link>
            <Link href="/integrations" onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[.08]"><Github size={17}/><span className="flex-1">Add from GitHub</span><ChevronRight size={14} className="text-zinc-600"/></Link>
            <div className="my-1 border-t border-white/10"/>
            <button type="button" onClick={() => { setPlusSubmenu(plusSubmenu === "skills" ? null : "skills"); if (!toolOptions.length && !loadingToolOptions) void loadToolOptions(); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${plusSubmenu === "skills" ? "bg-white/[.1] text-white" : "text-zinc-200 hover:bg-white/[.08]"}`}><Wrench size={17}/><span className="flex-1">Skills</span><ChevronRight size={14} className="text-zinc-600"/></button>
            {plusSubmenu === "skills" && <div className="ml-7 border-l border-white/10 pl-2">{loadingToolOptions ? <p className="px-2 py-2 text-xs text-zinc-500">Loading approved skills...</p> : toolOptionsError ? <p role="alert" className="px-2 py-2 text-xs text-red-300">{toolOptionsError}</p> : <>{customAgentOptions.map((agent) => <button key={agent.id} type="button" onClick={() => { setSelectedAgent(agent); setSelectedTool(null); setMenu(false); setPlusSubmenu(null); }} className="block w-full rounded-lg px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5">{agent.name}</button>)}{toolOptions.map((tool) => <button key={tool.name} type="button" onClick={() => { setSelectedTool(tool); setSelectedAgent(null); setMenu(false); setPlusSubmenu(null); }} className="block w-full rounded-lg px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5">{tool.name}</button>)}<Link href="/developers/agents" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-[var(--gold)] hover:bg-white/5"><Settings2 size={13}/> Manage skills</Link></>}</div>}
            <Link href="/integrations" onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[.08]"><Plug size={17}/><span className="flex-1">Connectors</span><ChevronRight size={14} className="text-zinc-600"/></Link>
            <button type="button" onClick={() => { if (["business", "unlimited"].includes((plan || "").toLowerCase())) { setInput("Create a complete design system for this project"); setMenu(false); } else setPlusSubmenu(plusSubmenu === "design" ? null : "design"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${plusSubmenu === "design" ? "bg-white/[.1] text-white" : "text-zinc-200 hover:bg-white/[.08]"}`}><Palette size={17}/><span className="flex-1">Design system</span><ChevronRight size={14} className="text-zinc-600"/></button>
            {plusSubmenu === "design" && <div className="ml-7 border-l border-white/10 pl-2"><p className="px-2 py-2 text-[11px] leading-4 text-zinc-500">Design systems are available on the Business plan.</p><Link href="/pricing" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-[var(--gold)] hover:bg-white/5"><CreditCard size={13}/> Upgrade plan</Link></div>}
            <Link href="/plugins" onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[.08]"><Puzzle size={17}/><span className="flex-1">Plugins</span><ChevronRight size={14} className="text-zinc-600"/></Link>
            <button type="button" onClick={() => { setMenu(false); void research(); }} disabled={!input.trim()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[.08] disabled:opacity-40"><Search size={17}/><span className="flex-1">Web search</span>{input.trim() && <span className="text-[10px] text-emerald-300">Ready</span>}</button>
          </div>
          <div className="hidden grid grid-cols-2 gap-1">
            {/* Tool callbacks read DOM refs only when invoked by the user's click. */}
            {tools.map(([Icon, label, action]) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="flex min-h-16 items-center gap-3 rounded-2xl px-3 text-left text-sm hover:bg-white/[.07]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.06]">
                  <Icon size={17} />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="hidden mt-2 border-t border-white/10 pt-2">
            {loadingToolOptions ? <p role="status" className="px-3 py-2 text-xs text-zinc-400">Loading your approved tools…</p>
              : toolOptionsError ? <p role="alert" className="px-3 py-2 text-xs text-red-300">{toolOptionsError}</p>
                : <div className="max-h-56 space-y-2 overflow-y-auto">
                  <div>
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Custom agents</p>
                    {customAgentOptions.length ? customAgentOptions.map((agent) => <button key={agent.id} type="button" onClick={() => { setSelectedAgent(agent); setSelectedTool(null); setMenu(false); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.07]">
                      <span className="block text-xs font-semibold text-zinc-200">{agent.name}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{agent.description} · {agent.allowed_tools.length} approved tools</span>
                    </button>) : <p className="px-3 py-1 text-[10px] text-zinc-600">Paid Developer plan agents appear here.</p>}
                  </div>
                  <div className="border-t border-white/10 pt-1">
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Read-only tools</p>
                    {toolOptions.length ? toolOptions.map((tool) => <button key={tool.name} type="button" onClick={() => { setSelectedTool(tool); setSelectedAgent(null); setMenu(false); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.07]">
                      <span className="block text-xs font-semibold text-zinc-200">{tool.name}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{tool.description}</span>
                    </button>) : <p className="px-3 py-1 text-[10px] text-zinc-600">No approved tools are connected.</p>}
                  </div>
                </div>}
          </div>
          <p className="px-3 pb-2 pt-2 text-[10px] text-zinc-600">
            Only capabilities connected to LEO OS are shown.
          </p>
        </div>
      )}
    </div>
  );
  async function prepareVideo() {
    const prompt = input.trim();
    if (!prompt) { setError("Enter a video prompt first."); return; }
    setMenu(false);
    setError("");
    try {
      const t = await token();
      const r = await fetch("/api/generate-video?duration=5", { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.available !== true) throw new Error(d.error || "Video generation is unavailable.");
      setVideoConfirmPrompt(prompt);
      setVideoDuration(5);
      setVideoAspectRatio("landscape");
      setVideoCreditsPerSecond(Number.isSafeInteger(d.platform_credits_per_second) ? d.platform_credits_per_second : 0);
      setVideoCreditsAvailable(Number.isSafeInteger(d.platform_credits_available) ? d.platform_credits_available : 0);
      setVideoStatus("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video generation is unavailable.");
    }
  }
  async function generateVideo() {
    if (!videoConfirmPrompt || loading) return;
    setLoading(true);
    setError("");
    setVideoStatus("Starting the Runway video task…");
    try {
      const t = await token();
      const requestId = crypto.randomUUID();
      const r = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestId, ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ prompt: videoConfirmPrompt, duration: videoDuration, aspect_ratio: videoAspectRatio, request_id: requestId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.job_id) throw new Error(d.error || "Video generation could not be started.");
      setActiveVideoJobId(d.job_id);
      setVideoStatus(`Runway task ${d.status === "processing" ? "is processing" : "is queued"}. Checking the actual provider status…`);
      setInput("");
      setVideoConfirmPrompt("");
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statusResponse = await fetch(`/api/generate-video/status?job_id=${encodeURIComponent(d.job_id)}`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, cache: "no-store" });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusData.error || "Video status is temporarily unavailable. The job remains tracked.");
        if (statusData.status === "completed" && statusData.video_url) {
          setMessages((m) => [...m, { role: "assistant", content: `Video generation completed. ${statusData.platform_credits_charged || 0} platform credits charged. The preview URL expires after one hour; use the secure asset link below to open a fresh URL.`, video: statusData.video_url, assetId: statusData.asset_id }]);
          if (Number.isSafeInteger(d.platform_credits_remaining)) setPlatformCredits(d.platform_credits_remaining);
          setVideoStatus("");
          setActiveVideoJobId("");
          return;
        }
        if (statusData.status === "failed" || statusData.status === "cancelled") throw new Error(statusData.error || "Video generation did not complete.");
        setVideoStatus("Runway is still processing the job. This status comes from the provider; no progress percentage is estimated.");
      }
      setVideoStatus(`Automatic polling stopped after nine minutes. Job ${d.job_id} remains tracked by the server; use Check status to query the provider again. No cancel action is exposed because cancellation is not verified for this provider adapter.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video generation failed.");
      setVideoStatus("");
    } finally {
      setLoading(false);
    }
  }
  async function refreshVideoStatus() {
    if (!activeVideoJobId) return;
    try {
      const t = await token();
      const response = await fetch(`/api/generate-video/status?job_id=${encodeURIComponent(activeVideoJobId)}`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Video status is temporarily unavailable.");
      if (data.status === "completed" && data.video_url) {
        setMessages((m) => [...m, { role: "assistant", content: `Video generation completed. ${data.platform_credits_charged || 0} platform credits charged.`, video: data.video_url, assetId: data.asset_id }]);
        setActiveVideoJobId("");
        setVideoStatus("");
      } else if (data.status === "failed" || data.status === "cancelled") {
        setError(data.error || "Video generation did not complete.");
        setActiveVideoJobId("");
        setVideoStatus("");
      } else {
        setVideoStatus(`Provider status: ${data.status || "processing"}. The job remains tracked; check again later.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video status is temporarily unavailable.");
    }
  }
  const videoConfirmationPanel = videoConfirmPrompt ? (
    <div className="mb-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-xs">
      <p className="font-semibold text-white">Confirm video generation</p>
      <p className="mt-1 line-clamp-3 text-zinc-400">{videoConfirmPrompt}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-zinc-400">Duration
          <select value={videoDuration} onChange={(e) => setVideoDuration(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-white">
            {[2,3,4,5,6,7,8,9,10].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
        </label>
        <label className="text-zinc-400">Aspect ratio
          <select value={videoAspectRatio} onChange={(e) => setVideoAspectRatio(e.target.value as "landscape" | "portrait")} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-white">
            <option value="landscape">Landscape</option><option value="portrait">Portrait</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-zinc-400">Credits required: {videoCreditsPerSecond === null ? "checking availability…" : `${videoCreditsPerSecond * videoDuration}`} · available: {videoCreditsAvailable ?? "checking…"}</p>
      {videoCreditsPerSecond !== null && videoCreditsPerSecond > 0 && videoCreditsAvailable !== null && videoCreditsAvailable < videoCreditsPerSecond * videoDuration && <p className="mt-2 text-amber-300">Insufficient platform credits for this duration. Choose a shorter duration or add credits.</p>}
      <div className="mt-3 flex gap-2"><button type="button" disabled={loading || (videoCreditsPerSecond !== null && videoCreditsPerSecond > 0 && videoCreditsAvailable !== null && videoCreditsAvailable < videoCreditsPerSecond * videoDuration)} onClick={generateVideo} className="rounded-xl bg-[var(--gold)] px-3 py-2 font-semibold text-black disabled:opacity-40">Confirm and generate</button><button type="button" disabled={loading} onClick={() => setVideoConfirmPrompt("")} className="rounded-xl border border-white/10 px-3 py-2 text-white disabled:opacity-40">Cancel</button></div>
    </div>
  ) : null;
  async function openMicrophoneMenu() {
    setMicrophoneMenuOpen((open) => !open);
    if (microphoneMenuOpen) return;
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      setAudioDevices((devices || []).filter((device) => device.kind === "audioinput"));
    } catch {
      setAudioDevices([]);
    }
  }
  async function research() {
    const q = input.trim();
    if (!q) return;
    setMenu(false);
    void send(q, "normal", null, null, true);
  }
  async function createDownloadableDocument(index: number, message: Msg, format: "pdf" | "docx" | "txt" | "md") {
    if (!message.content.trim() || documentBusy) return;
    const operation = `${index}-${format}`;
    setDocumentBusy(operation);
    setError("");
    try {
      const t = await token();
      const response = await fetch("/api/chat/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({
          session_id: sidRef.current,
          title: message.content.split(/\r?\n/).find(line => line.trim())?.replace(/^#+\s*/, "").slice(0, 100) || "Leo response",
          content: message.content,
          format,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The document could not be created.");
      const document = data.document as ChatDocument;
      setMessages(current => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, documents: [...(item.documents || []), document] }
        : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be created.");
    } finally {
      setDocumentBusy("");
    }
  }
  async function shareImage(assetId: string) {
    setSharingAssetId(assetId);
    setSharedAssetStatus(null);
    setError("");
    try {
      const result = await sharePrivateImage(assetId);
      setSharedAssetStatus({
        id: assetId,
        message: result === "copied" ? "One-hour private share link copied." : "Image shared.",
      });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "The image could not be shared.");
      }
    } finally {
      setSharingAssetId("");
    }
  }

  const messagesView = (
    <div className="mx-auto w-full max-w-[760px] space-y-5">
      {messages.map((m, i) => (
        <div
          key={i}
          className={
            m.role === "user"
              ? "ml-auto max-w-[88%] rounded-3xl bg-[var(--gold)] px-4 py-3 text-black"
              : "max-w-[92%] px-1 py-2 text-zinc-200"
          }
        >
          {m.role === "user" && m.selectedToolLabel && <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-black/20 bg-black/10 px-2.5 py-1 text-[11px] font-semibold"><Wrench size={12}/> {m.selectedToolLabel}</p>}
          <div className="whitespace-pre-wrap text-sm leading-6">
            {m.content}
          </div>
          {m.images?.map(image => <a key={image.assetId} href={image.previewUrl} target="_blank" rel="noreferrer" className="mt-3 block">
            <Image src={image.previewUrl} alt={image.fileName || 'Uploaded image'} width={960} height={720} unoptimized className="max-h-72 max-w-full rounded-xl border border-white/10 object-contain" />
          </a>)}
          {m.documents?.map(document => (
            <section key={document.assetId} className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/25">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-200"><Paperclip size={13} className="shrink-0 text-[var(--gold)]"/><span className="truncate">{document.fileName}</span></span>
                <a href={document.downloadUrl} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[var(--gold)] hover:bg-white/5"><Download size={12}/> Download</a>
              </div>
              {document.mimeType === PDF_MIME_TYPE
                ? <iframe src={document.previewUrl} title={`Preview of ${document.fileName}`} loading="lazy" className="h-[min(55vh,520px)] w-full border-t border-white/10 bg-white"/>
                : document.previewText && <pre className="max-h-52 overflow-auto whitespace-pre-wrap border-t border-white/10 p-3 text-xs leading-5 text-zinc-400">{document.previewText}</pre>}
            </section>
          ))}
          {m.citations?.length ? <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Web sources</p>
            <ul className="space-y-1.5">{m.citations.map((citation, citationIndex) => <li key={`${citation.url}-${citationIndex}`}><a href={citation.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-sky-300 underline decoration-sky-300/30 underline-offset-2 hover:text-sky-200">{citation.title || citation.url}</a></li>)}</ul>
          </div> : null}
          {m.role === "assistant" && m.content.trim() && /\b(?:create|make|generate|export|download|save|provide|give me)\b.{0,60}\b(?:pdf|docx|word document|document file)\b|\b(?:pdf|docx)\b.{0,40}\b(?:file|download|export)\b/i.test(messages.slice(0, i).reverse().find(item => item.role === "user")?.content || "") && <div className="mt-3 flex flex-wrap gap-2" aria-label="Requested document exports">
            {(["pdf", "docx", "txt"] as const).map(format => {
              const operation = `${i}-${format}`;
              return <button key={format} type="button" onClick={() => void createDownloadableDocument(i, m, format)} disabled={Boolean(documentBusy)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40">
                <Download size={12}/>{documentBusy === operation ? "Creating…" : `Save as ${format.toUpperCase()}`}
              </button>;
            })}
          </div>}
          {m.projectBuilder && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[.04] p-3">
              <p className="text-xs font-semibold uppercase text-[var(--gold)]">
                {m.projectBuilder.projectType.replaceAll("_", " ")} · {m.projectBuilder.status.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{m.projectBuilder.message}</p>
              {m.projectBuilder.href && (
                <a href={m.projectBuilder.href} className="mt-3 inline-flex rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black">
                  {m.projectBuilder.status === "plan_upgrade" ? "View plans" : m.projectBuilder.status === "sign_in_required" ? "Sign in" : "Start project setup"}
                </a>
              )}
              {m.projectBuilder.provider && <p className="mt-2 text-[10px] text-zinc-600">Provider: {m.projectBuilder.provider}</p>}
            </div>
          )}
          {m.image && (
            <a href={m.image} target="_blank" rel="noreferrer" aria-label="Open saved generated image">
              <Image
                src={m.image}
                alt="Generated by Leo"
                width={1200}
                height={800}
                unoptimized
                className="mt-3 max-h-72 rounded-2xl object-contain"
              />
            </a>
          )}
          {m.video && <video src={m.video} controls playsInline preload="metadata" className="mt-3 max-h-72 w-full rounded-2xl border border-white/10" aria-label="Generated video" />}
          {m.assetId && m.image && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a href={`/api/media/${encodeURIComponent(m.assetId)}?download=1`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5">
                <Download size={13} /> Download image
              </a>
              <button type="button" disabled={Boolean(sharingAssetId)} onClick={() => { if (m.assetId) void shareImage(m.assetId); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-50">
                <Share2 size={13} /> {sharingAssetId === m.assetId ? "Sharing…" : "Share image"}
              </button>
              {sharedAssetStatus?.id === m.assetId && <span role="status" className="text-xs text-zinc-400">{sharedAssetStatus.message}</span>}
            </div>
          )}
          {m.assetId && !m.image && <a href={`/api/media/${encodeURIComponent(m.assetId)}?download=1`} className="mt-2 inline-block text-xs text-[var(--gold)] underline">Download saved private asset</a>}
        </div>
      ))}
      {buildProgress && (
        <div className="max-w-[92%] rounded-2xl border border-[var(--gold)]/25 bg-black/35 p-3 text-sm" role="status" aria-live="polite">
          <div className="flex items-center gap-2 font-semibold text-[var(--gold)]"><Rocket size={15} /> Build progress · {buildProgress.status.replaceAll('_', ' ')}</div>
          <p className="mt-1 text-zinc-200">{buildProgress.step}</p>
          <p className="mt-1 text-xs text-zinc-400">{buildProgress.message}</p>
          {buildProgress.events?.slice(0, 4).map((event) => <p key={event.id} className="mt-1 text-xs text-zinc-500">{event.message}</p>)}
          {buildProgress.liveUrl && <a href={buildProgress.liveUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black">Open verified live website</a>}
          {trackBuildProgress && <p className="mt-2 text-[10px] text-zinc-600">Updating from saved build events…</p>}
        </div>
      )}
      {loading && (
        <div className="flex max-w-fit items-center gap-3 rounded-3xl bg-black/40 p-3 text-sm text-zinc-400">
          <Loader2 size={15} className="animate-spin" />
          <span>Leo is thinking…</span>
          {chatAbortController.current && <button type="button" onClick={stopGeneration} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10">Stop</button>}
        </div>
      )}
      {offlineDraft && (
        <div className="mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
          <div className="min-w-0"><p className="font-semibold">Saved offline — not submitted</p><p className="mt-1 break-words text-xs text-amber-100/70">{offlineDraft.text}</p></div>
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={!networkOnline || loading} onClick={() => { const draft = offlineDraft; const tool = toolOptions.find((item) => item.name === draft.selectedToolName); const agent = customAgentOptions.find((item) => item.id === draft.selectedAgentId); void send(draft.text, draft.mode, tool || null, agent || null); }} className="rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black disabled:opacity-40">Send now</button>
            <button type="button" onClick={() => { setOfflineDraft(null); window.localStorage.removeItem(OFFLINE_DRAFT_KEY); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300">Discard</button>
          </div>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}
    </div>
  );
  if (full)
    return (
      <>
        <>{inputs}</>
        <div className="leo-chat-workspace flex h-[100dvh] min-h-[480px] overflow-hidden bg-[#0b0b0b]">
          <aside className={`${sidebarOpen ? "w-[240px]" : "w-[60px]"} hidden shrink-0 flex-col border-r border-[#252525] bg-[#101010] transition-[width] duration-200 md:flex`}>
            <div className="flex h-14 items-center justify-between gap-2 border-b border-white/10 px-3">
              {sidebarOpen && <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--gold)] text-black"><Bot size={17}/></div><div><b className="text-sm">Leo AI</b><p className="text-[10px] text-zinc-500">Your workspace</p></div></div>}
              <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}><PanelLeftClose size={16}/></button>
            </div>
            <div className="space-y-0.5 p-2">
              <button type="button" onClick={startNewChat} title="New chat" className="flex w-full items-center gap-3 rounded-lg bg-[var(--gold)] px-3 py-2 text-left text-sm font-semibold text-black"><PlusCircle size={16}/>{sidebarOpen && "New chat"}</button>
              <button type="button" onClick={() => { setMemoryOpen(false); }} title="Chat" className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-white/5"><MessageSquare size={16}/>{sidebarOpen && "Chat"}</button>
            </div>
            {sidebarOpen && <div className="px-3 pb-2 pt-3"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500"><History size={13}/> Chats</p><label className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.025] px-2 py-1.5 text-zinc-500"><Search size={13}/><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600" aria-label="Search chats"/></label></div>}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {chatHistory.filter((chat) => !chatSearch.trim() || chat.title.toLowerCase().includes(chatSearch.trim().toLowerCase())).length === 0 ? (sidebarOpen && <p className="px-2 py-3 text-xs leading-5 text-zinc-600">{chatSearch ? "No matching chats." : "Your recent chats will appear here on this device."}</p>) : chatHistory.filter((chat) => !chatSearch.trim() || chat.title.toLowerCase().includes(chatSearch.trim().toLowerCase())).map((chat) => <button key={chat.id} type="button" onClick={() => void openSavedChat(chat)} title={chat.title} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${activeChatId === chat.id ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><MessageSquare size={14} className="shrink-0"/>{sidebarOpen && <span className="truncate">{chat.title}</span>}</button>)}
            </div>
            <div className="space-y-1 border-t border-white/10 p-2">
              <Link href="/app/projects" title="Projects" className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"><Library size={16}/>{sidebarOpen && "Projects"}</Link>
              <Link href="/engineering" title="Engineering workflow" className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"><Wrench size={16}/>{sidebarOpen && "Engineering workflow"}</Link>
              <Link href="/app/artifacts" title="Artifacts" className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"><Compass size={16}/>{sidebarOpen && "Artifacts"}</Link>
              <Link href="/app/customize" title="Customize workspace" className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"><Settings2 size={16}/>{sidebarOpen && "Customize"}</Link>
              <div className="relative"><button type="button" onClick={() => setAccountMenuOpen((open) => !open)} title="Account menu" aria-expanded={accountMenuOpen} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5"><UserCircle size={17}/>{sidebarOpen && <span className="min-w-0 flex-1 truncate">{welcomeName} <span className="text-[10px] text-zinc-600">· {plan || "Free"}</span></span>}</button>{accountMenuOpen && sidebarOpen && <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-white/15 bg-[#191919] p-1.5 shadow-2xl"><p className="truncate px-2.5 py-1.5 text-[10px] text-zinc-600">{welcomeName} · {plan || "Free"}</p><Link href="/settings" className="block rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5">Settings</Link><Link href="/pricing" className="block rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5">Upgrade plan</Link><Link href="/plugins" className="block rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5">Apps and extensions</Link><Link href="/developers" className="block rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5">Learn more</Link><Link href="/api-keys" className="block rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5">Get API keys</Link><Link href="/support" className="block rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5">Get help</Link><div className="my-1 border-t border-white/10"/><button type="button" onClick={async () => { const client = getBrowserSupabase(); if (client) await client.auth.signOut(); window.location.href = "/auth"; }} className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-red-300 hover:bg-red-500/10">Log out</button></div>}</div>
            </div>
          </aside>
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Leo AI workspace navigation">
              <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close workspace navigation" onClick={() => setMobileSidebarOpen(false)} />
              <aside className="absolute inset-y-0 left-0 flex w-[min(84vw,320px)] flex-col border-r border-white/10 bg-[#0b0b0d] shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 p-4">
                  <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gold)] text-black"><Bot size={18}/></div><div><b className="text-sm">Leo AI</b><p className="text-[10px] text-zinc-500">Your workspace</p></div></div>
                  <button type="button" onClick={() => setMobileSidebarOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close workspace navigation"><X size={18}/></button>
                </div>
                <div className="space-y-1 p-3">
                  <button type="button" onClick={() => { startNewChat(); setMobileSidebarOpen(false); }} className="flex w-full items-center gap-3 rounded-xl bg-[var(--gold)] px-3 py-3 text-left text-sm font-semibold text-black"><PlusCircle size={17}/>New chat</button>
                  <button type="button" onClick={() => { setMemoryOpen(false); setMobileSidebarOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-300 hover:bg-white/5"><MessageSquare size={17}/>Chat</button>
                  <button type="button" onClick={() => { setMemoryOpen(true); void loadMemories(); setMobileSidebarOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm ${memoryOpen ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5"}`}><Brain size={17}/>Memory</button>
                  <button type="button" onClick={() => { setMemoryOpen(false); setMenu(true); setMobileSidebarOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-300 hover:bg-white/5"><ImageIcon size={17}/>Images & tools</button>
                </div>
                <div className="px-4 pb-2 pt-3"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500"><History size={13}/>Recent chats</p></div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  {chatHistory.length === 0 ? <p className="px-2 py-3 text-xs leading-5 text-zinc-600">Your recent chats will appear here on this device.</p> : chatHistory.map((chat) => <button key={chat.id} type="button" onClick={() => { void openSavedChat(chat); setMobileSidebarOpen(false); }} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs ${activeChatId === chat.id ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5"}`}><MessageSquare size={14} className="shrink-0"/><span className="truncate">{chat.title}</span></button>)}
                </div>
                <div className="space-y-1 border-t border-white/10 p-3">
                  <Link href="/app/projects" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><Library size={17}/>Projects</Link>
                  <Link href="/app/artifacts" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><Compass size={17}/>Artifacts</Link>
                  <Link href="/app/customize" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><Settings2 size={17}/>Customize</Link>
                  <Link href="/account" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><UserCircle size={17}/>Account</Link>
                  <Link href="/pricing" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><CreditCard size={17}/>Upgrade plan</Link>
                  <Link href="/developers/agents" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><Laptop size={17}/>Agent & Tool Studio</Link>
                  <button type="button" onClick={() => { setRemoteOpen(true); setMemoryOpen(false); setRemoteStatus(""); setMobileSidebarOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/5"><Laptop size={17}/>Remote devices</button>
                </div>
              </aside>
            </div>
          )}
          <div className="leo-chat-main relative mx-auto flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0b0b]">
            {remoteOpen && <div className="absolute inset-0 z-40 overflow-y-auto bg-[#080809]/95 p-4 backdrop-blur-xl md:p-7"><section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#111113] p-5 shadow-2xl md:p-7"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[var(--gold)]"><Laptop size={20}/><span className="text-xs font-bold uppercase tracking-[.18em]">Leo Remote</span></div><h2 className="mt-3 text-2xl font-black">Connect your devices</h2><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Sign in to the same Leo account on both devices. Create a one-time code on one device, then enter it on the other. Codes expire in five minutes.</p></div><button type="button" onClick={() => setRemoteOpen(false)} aria-label="Close remote devices" className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white"><X size={18}/></button></div>
              <div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><h3 className="font-bold">Pair this device</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Generate a short-lived code to enter on your other signed-in device.</p><button type="button" disabled={remoteBusy} onClick={() => void createRemotePairing()} className="mt-4 w-full rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black disabled:opacity-50">{remoteBusy ? "Please wait…" : "Generate pairing code"}</button>{remoteCode && <div className="mt-4 rounded-xl border border-[var(--gold)]/30 bg-[var(--gold)]/5 p-4 text-center"><p className="text-[10px] uppercase tracking-widest text-zinc-400">One-time pairing code</p><p className="my-2 font-mono text-2xl font-black tracking-[.22em] text-[var(--gold)]">{remoteCode}</p><button type="button" onClick={() => { void navigator.clipboard?.writeText(remoteCode); setRemoteStatus("Pairing code copied."); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200">Copy code</button></div>}</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><h3 className="font-bold">Join a device</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Enter the code displayed on the other device. Both devices must belong to the same account.</p><form onSubmit={(event) => void claimRemotePairing(event)} className="mt-4 space-y-3"><input value={remoteClaimCode} onChange={(event) => setRemoteClaimCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 10))} inputMode="text" autoComplete="one-time-code" maxLength={10} placeholder="10-character code" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 font-mono text-sm uppercase tracking-widest outline-none focus:border-[var(--gold)]"/><button type="submit" disabled={remoteBusy || remoteClaimCode.length !== 10} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Pair this device</button></form></div></div>
              {remoteStatus && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-zinc-300">{remoteStatus}</p>}
              <div className="mt-6"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">Devices and sessions</h3><button type="button" onClick={() => void loadRemotePairings()} className="text-xs text-[var(--gold)]">Refresh</button></div>{remotePairings.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">No devices paired yet. Generate a code to begin.</p> : <div className="space-y-2">{remotePairings.map((pairing) => <div key={pairing.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{pairing.created_device_name}{pairing.paired_device_name ? ` ↔ ${pairing.paired_device_name}` : ""}</p><p className="mt-1 text-xs text-zinc-500">{pairing.status === "paired" ? "Connected · remote message relay available" : `Waiting for pairing · expires ${new Date(pairing.expires_at).toLocaleTimeString()}`}</p></div><div className="flex gap-2">{pairing.status === "paired" && <button type="button" onClick={() => { setRemoteSessionId(pairing.id); setRemoteEvents([]); setRemoteCursor(0); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${remoteSessionId === pairing.id ? "bg-[var(--gold)] text-black" : "border border-white/10 text-white"}`}>{remoteSessionId === pairing.id ? "Selected" : "Open relay"}</button>}<button type="button" onClick={() => void revokeRemotePairing(pairing.id)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">Disconnect</button></div></div>)}</div>}</div>
              {remoteSessionId && <div className="mt-6 rounded-2xl border border-[var(--gold)]/20 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">Live remote message relay</h3><p className="mt-1 text-xs text-zinc-500">Messages sent here appear on the paired device when it opens this session.</p></div><span className="rounded-full border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300">Connected</span></div><div className="mt-4 max-h-52 space-y-2 overflow-y-auto">{remoteEvents.length === 0 ? <p className="text-xs text-zinc-600">Waiting for messages or chat handoffs from either device…</p> : remoteEvents.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-white/[.03] p-3">{item.event_type === "chat.open" && typeof item.payload.sessionId === "string" ? <><p className="text-sm font-semibold text-zinc-200">Shared chat: {String(item.payload.title || "Leo conversation")}</p><button type="button" onClick={() => { void openSavedChat({ id: String(item.payload.sessionId), title: String(item.payload.title || "Shared Leo chat"), updatedAt: Date.now() }); setRemoteOpen(false); }} className="mt-2 rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black">Open shared chat</button></> : <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">{item.event_type === "message" ? String(item.payload.text || "") : `[${item.event_type}]`}</p>}<p className="mt-1 text-[10px] text-zinc-600">{item.device_id} · {new Date(item.created_at).toLocaleTimeString()}</p></article>)}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={remoteBusy} onClick={() => void shareCurrentChat()} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">Share current chat</button></div><form onSubmit={(event) => void sendRemoteMessage(event)} className="mt-3 flex gap-2"><input value={remoteMessage} onChange={(event) => setRemoteMessage(event.target.value)} maxLength={4000} placeholder="Send a message to the paired device…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm outline-none focus:border-[var(--gold)]"/><button type="submit" disabled={remoteBusy || !remoteMessage.trim()} className="rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black disabled:opacity-40"><Send size={16}/></button></form></div>}
              <p className="mt-5 text-[11px] leading-5 text-zinc-600">Security: pairing is limited to the same signed-in account; codes are one-time and expire after five minutes. Revoke a paired device to stop further access. This provides a live message relay, not unattended screen or mouse control.</p>
            </section></div>}
            <header className="flex items-center justify-between border-b border-white/10 p-3 sm:p-4">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setMobileSidebarOpen(true)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 text-sm font-semibold text-[var(--gold)] shadow-sm hover:bg-[var(--gold)]/15 md:hidden" aria-label="Open workspace navigation" aria-haspopup="dialog"><Menu size={18}/><span>Menu</span></button>
                <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-[var(--gold)] text-black sm:flex">
                  <Bot size={20} />
                </div>
                <div className="min-w-0">
                  <b className="text-sm">{messages.length ? (chatHistory.find((chat) => chat.id === activeChatId)?.title || "Leo chat") : "Leo AI"}</b>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[.06] p-1" role="group" aria-label="Workspace mode">
                <button type="button" onClick={() => setWorkspaceMode("chat")} aria-pressed={workspaceMode === "chat"} className={`min-w-16 rounded-full px-4 py-2 text-xs font-semibold transition ${workspaceMode === "chat" ? "bg-white text-[#111] shadow" : "text-zinc-400 hover:text-white"}`}>Chat</button>
                <button type="button" onClick={() => { setWorkspaceMode("work"); setMemoryOpen(false); if (!workProject) void (async () => { try { const response = await fetch("/api/workspaces", { cache: "no-store" }); const result = await response.json(); if (response.ok && result.data?.[0]) { const project = result.data[0]; setWorkProject({ id: project.id, name: project.project_name }); const manifestResponse = await fetch(`/api/workspaces/${encodeURIComponent(project.id)}/source`, { cache: "no-store" }); const manifest = await manifestResponse.json(); if (manifestResponse.ok) setWorkManifest(manifest.data); } } catch {} })(); }} aria-pressed={workspaceMode === "work"} className={`min-w-16 rounded-full px-4 py-2 text-xs font-semibold transition ${workspaceMode === "work" ? "bg-white text-[#111] shadow" : "text-zinc-400 hover:text-white"}`}>Work</button>
              </div>
              <button type="button" onClick={() => void startNewChat()} className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white">
                <PlusCircle size={15} /><span className="hidden sm:inline">New chat</span>
              </button>
            </header>
            <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-2 md:hidden">
              <button type="button" onClick={startNewChat} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black"><PlusCircle size={14}/> New chat</button>
              <button type="button" onClick={() => { setMemoryOpen(true); void loadMemories(); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300"><Brain size={14}/> Memory</button>
              <button type="button" onClick={() => { setMemoryOpen(false); setMenu(true); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300"><ImageIcon size={14}/> Images & tools</button>
              <a href="/account" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300"><UserCircle size={14}/> Account</a>
              <a href="/pricing" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300"><CreditCard size={14}/> Upgrade</a>
            </div>
            <div ref={chatScrollRef} onScroll={(event) => {
              const element = event.currentTarget;
              const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
              chatPinnedToBottom.current = atBottom;
              setShowJumpToLatest(!atBottom && messages.length > 0);
            }} className="leo-chat-scroll relative min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
              {memoryOpen ? <div className="mx-auto max-w-2xl"><div className="mb-6 flex items-start gap-3"><div className="rounded-2xl bg-[var(--gold)]/10 p-3 text-[var(--gold)]"><Brain size={22}/></div><div><h1 className="text-2xl font-bold">Leo memory</h1><p className="mt-1 text-sm text-zinc-400">Saved notes help Leo retain useful context. Manage what is remembered.</p></div></div><form onSubmit={(event) => { event.preventDefault(); void addMemory(); }} className="mb-6 flex gap-2"><input value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} placeholder="Remember that I prefer…" maxLength={1000} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm outline-none focus:border-[var(--gold)]"/><button disabled={memoryBusy || !memoryDraft.trim()} className="rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black disabled:opacity-50">Save</button></form>{memoryBusy ? <p className="text-sm text-zinc-500">Loading memories…</p> : memories.length ? <div className="space-y-2">{memories.map((memory) => <article key={memory.id} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"><div><p className="whitespace-pre-wrap text-sm text-zinc-200">{memory.memory}</p><p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">{memory.source || "saved"}</p></div><button type="button" onClick={() => void deleteMemory(memory.id)} className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete memory"><Trash size={15}/></button></article>)}</div> : <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><Bookmark className="mx-auto mb-3 text-zinc-500"/><p className="text-sm text-zinc-300">No saved memories yet</p><p className="mt-1 text-xs text-zinc-500">Add preferences, project context or instructions you want to keep.</p></div>}</div> : messages.length === 0 ? (
                <div className="mx-auto flex min-h-[52vh] max-w-2xl flex-col justify-center py-10 text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--gold)]/40 text-[var(--gold)]">
                    <Bot size={22} />
                  </div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-[var(--gold)]">{workspaceMode === "work" ? "Leo workspace" : "Your workspace is ready"}</p>
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
                    {workspaceMode === "work" ? "What should we work on?" : `${timeGreeting}, ${welcomeName}.`}
                  </h1>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                    {workspaceMode === "work" ? "Upload a ZIP archive or source files to create a persistent project workspace. Edit and review the same project with Leo in this conversation." : "Tell Leo what you want to work on. Your projects, tools and conversation context stay connected as you go."}
                  </p>
                  {workspaceMode === "work" && <div className="mx-auto mt-8 w-full max-w-2xl text-left"><p className="mb-3 text-xs font-medium text-zinc-500">Suggested ways to work</p><div className="flex flex-wrap gap-2">{[{label:"Review project files",prompt:"Inspect the uploaded project files. Explain the architecture, current state, and the highest-priority improvements."},{label:"Debug an issue",prompt:"Help me investigate and fix the issue described here. Start by inspecting the available files and evidence."},{label:"Improve a document",prompt:"Review the uploaded document and help me improve it while preserving its purpose and structure."},{label:"Analyse a dataset",prompt:"Inspect the uploaded data, explain its structure, identify quality issues, and summarize useful findings."}].map(item => <button key={item.label} type="button" onClick={() => setInput(item.prompt)} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2.5 text-xs text-zinc-300 transition hover:border-[var(--gold)]/40 hover:bg-white/[.07]">{item.label}</button>)}</div><div className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-start gap-3"><Paperclip size={17} className="mt-0.5 text-[var(--gold)]"/><div><p className="text-sm font-medium text-zinc-200">Bring your project files</p><p className="mt-1 text-xs leading-5 text-zinc-500">Upload a ZIP project archive or source files to create a durable, private workspace. Files are saved to your project, can be listed and edited, and remain available when you return. Uploads exclude secrets and generated dependency folders.</p><button type="button" onClick={() => fileRef.current?.click()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/5">Upload files</button>{workUploading && <p className="mt-2 text-xs text-[var(--gold)]">Saving project files…</p>}{workProject && <div className="mt-3 rounded-lg bg-white/[.04] p-3"><p className="text-xs font-semibold text-zinc-200">{workProject.name}</p><p className="mt-1 text-[11px] text-zinc-500">{workManifest ? `${workManifest.files.length} files · ${(workManifest.totalBytes / 1024 / 1024).toFixed(2)} MB · revision ${workManifest.revision}` : "Workspace created"}</p><a href={`/api/workspaces/${encodeURIComponent(workProject.id)}/source?download=1`} className="mt-2 inline-block text-[11px] font-semibold text-[var(--gold)] underline underline-offset-4">Download project ZIP</a><div className="mt-3 border-t border-white/10 pt-3"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">GitHub Actions runtime</p><div className="flex flex-wrap gap-2">{([ ["Inspect", "inspect"], ["Install", "install"], ["Test", "test"], ["Typecheck", "typecheck"], ["Lint", "lint"], ["Build", "build"], ["Git status", "git_status"], ["Git diff", "git_diff"] ] as const).map(([label, operation]) => <button key={operation} type="button" disabled={Boolean(workspaceRuntimeBusy) || !workManifest?.files.length} onClick={() => void runWorkspaceOperation(operation)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-[var(--gold)]/40 disabled:opacity-40">{workspaceRuntimeBusy === operation ? "Running…" : label}</button>)}</div><p className="mt-2 text-[10px] leading-4 text-zinc-500">Runs bounded operations on a fresh GitHub-hosted runner. Jobs are queued; this is not an always-on terminal or live preview server.</p>{workspaceRuntimeResult && <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3"><p className={`text-xs font-semibold ${workspaceRuntimeResult.ok ? "text-emerald-400" : "text-amber-400"}`}>{workspaceRuntimeResult.operation} · {workspaceRuntimeResult.status === "queued" ? "Queued" : workspaceRuntimeResult.ok ? "Completed" : `Failed (${workspaceRuntimeResult.exit_code ?? "unknown"})`}</p>{workspaceRuntimeResult.message && <p className="mt-1 text-[11px] leading-4 text-zinc-400">{workspaceRuntimeResult.message}</p>}{workspaceRuntimeResult.job_id && <p className="mt-1 break-all text-[10px] text-zinc-500">Job ID: {workspaceRuntimeResult.job_id}</p>}{(workspaceRuntimeResult.stdout || workspaceRuntimeResult.stderr) && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-zinc-400">{[workspaceRuntimeResult.stdout, workspaceRuntimeResult.stderr].filter(Boolean).join("\n")}</pre>}</div>}</div><div className="mt-2 max-h-36 overflow-auto text-[11px] text-zinc-400">{workManifest?.files.slice(0, 40).map(file => <button key={file.path} type="button" disabled={file.kind !== "text" || workspaceFileBusy} onClick={() => void openWorkspaceFile(file.path)} className="block w-full truncate rounded px-1 py-1 text-left hover:bg-white/[.06] disabled:opacity-50">{file.kind === "text" ? "▤ " : "◇ "}{file.path}</button>)}</div>{editingWorkspaceFile && <div className="mt-3 border-t border-white/10 pt-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-zinc-200">{editingWorkspaceFile}</p><button type="button" onClick={() => setEditingWorkspaceFile("")} className="text-xs text-zinc-500">Close</button></div><textarea value={workspaceFileContent} onChange={event => setWorkspaceFileContent(event.target.value)} spellCheck={false} className="min-h-48 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-zinc-200 outline-none focus:border-[var(--gold)]"/><button type="button" disabled={workspaceFileBusy} onClick={() => void saveWorkspaceFile()} className="mt-2 rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">{workspaceFileBusy ? "Saving…" : "Save file"}</button></div>}</div>}</div></div></div><p className="mt-4 text-[11px] text-zinc-600"><Link href="/engineering" className="text-zinc-400 underline underline-offset-4 hover:text-white">Open Engineering workflow</Link> if you specifically want the dedicated engineering pipeline.</p></div>}
                </div>
              ) : (
                messagesView
              )}
              {showJumpToLatest && !memoryOpen && <button type="button" onClick={() => {
                chatPinnedToBottom.current = true;
                setShowJumpToLatest(false);
                chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
              }} className="sticky bottom-2 left-1/2 z-10 mx-auto mt-4 block rounded-full border border-white/15 bg-[#242424] px-4 py-2 text-xs font-semibold text-white shadow-xl hover:bg-[#303030]">Jump to latest ↓</button>}
            </div>
            {!memoryOpen && <div className="leo-chat-composer-dock border-t border-[#252525] bg-[#0b0b0b] p-3 md:p-4"><div className="mx-auto max-w-3xl">
              {videoConfirmationPanel}
              {videoStatus && <div className="mb-2 text-xs text-zinc-400" role="status" aria-live="polite"><p>{videoStatus}</p>{activeVideoJobId && !loading && <button type="button" onClick={refreshVideoStatus} className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-white">Check status</button>}</div>}
              {composer}
            </div></div>}
            {voiceOpen && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl">
                <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101011] p-6 text-center shadow-2xl">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10">
                    <div className="h-14 w-14 rounded-full bg-[var(--gold)]/60 blur-sm" />
                  </div>
                  <h2 className="mt-6 text-2xl font-black">Leo Voice</h2>
                  <p className="mt-2 text-sm text-zinc-500">{voiceStatus}</p>
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400">
                      <Settings2 size={14} />
                      <select
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="bg-transparent outline-none"
                        disabled={voiceLocked}
                      >
                        {["Kore", "Puck", "Charon", "Fenrir", "Aoede"].map((v) => (
                          <option key={v} value={v} className="bg-black">
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {voiceFallbackMode && <button type="button" onClick={() => void startVoiceInput()} disabled={loading} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-5 py-3 font-bold text-black disabled:opacity-50"><Mic size={17} />{recording ? "Stop speaking" : loading ? "Leo is responding…" : "Talk to Leo"}</button>}
                  <div className="mt-7 flex justify-center gap-3">
                    {!voiceFallbackMode && <button
                      onClick={toggleMute}
                      className="rounded-xl border border-white/10 px-4 py-3 text-sm"
                    >
                      {muted ? "Unmute" : "Mute"}
                    </button>}
                    <button
                      onClick={endVoiceChat}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white"
                    >
                      <PhoneOff size={16} /> End Voice Chat
                    </button>
                  </div>
                  <audio ref={audio} autoPlay />
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  return (
    <>
      {inputs}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--gold)] text-black shadow-2xl"
          aria-label="Open Leo AI chat"
          aria-haspopup="dialog"
          aria-expanded={false}
        >
          <Bot aria-hidden="true" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[min(720px,calc(100vh-88px))] w-[min(430px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0c] shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 p-4">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <b>LEO AI</b>
              {platformCredits !== null && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-400" aria-live="polite">{platformCredits} platform credits</span>}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close Leo">
              <X size={18} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">{messagesView}</div>
          <div className="border-t border-white/10 p-3">
{videoConfirmationPanel}
            {videoStatus && <div className="mb-2 text-xs text-zinc-400" role="status" aria-live="polite"><p>{videoStatus}</p>{activeVideoJobId && !loading && <button type="button" onClick={refreshVideoStatus} className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-white">Check status</button>}</div>}
            {composer}
          </div>
        </div>
      )}
    </>
  );
}

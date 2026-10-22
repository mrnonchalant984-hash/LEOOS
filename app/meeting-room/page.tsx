'use client';
import { authFetch } from '@/lib/client-auth';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Bot, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, DoorOpen, LoaderCircle, MessageSquare, Mic2, Phone, PhoneOff, Play, Plus, RefreshCw, ShieldCheck, Video, Volume2, X } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type Role = { number: number; id: string; name: string; department: string; category: string; description: string; capabilities: string[]; tools: string[]; permissions: string[]; approvalRequired: boolean };
type Meeting = { id: string; title: string; objective: string; agenda: string[]; participants: string[]; room_layout: 'conference'|'boardroom'|'discussion'; status: string; summary?: string | null; decisions?: string[]; created_at: string; updated_at: string; completed_at?: string | null };
type TranscriptMessage = { id: string; speaker_id: string; speaker_name: string; speaker_role: string; message: string; message_type: string; turn_index: number; created_at: string };
type ActionItem = { id: string; title: string; description: string; suggested_role_id?: string | null; priority: string; status: string; linked_run_id?: string | null };
type OperationalAgent = { id: string; name: string; description: string; ownerOnly: boolean; approvalRequired: boolean };
const defaultParticipants = ['chief-ai-officer-chief-of-staff','principal-software-architect','principal-backend-engineer','principal-qa-engineer'];
const layouts = [{ id: 'conference', label: 'Conference', detail: 'Engineer grid' }, { id: 'boardroom', label: 'Boardroom', detail: 'Round-table view' }, { id: 'discussion', label: 'Discussion', detail: 'Transcript focus' }] as const;

export default function MeetingRoomPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [operationalAgents, setOperationalAgents] = useState<OperationalAgent[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [title, setTitle] = useState('LeonardX Engineering Review');
  const [objective, setObjective] = useState('Review the current project objective, identify key risks, agree on practical next steps, and define verifiable acceptance criteria.');
  const [agendaText, setAgendaText] = useState('Understand the objective\nIdentify technical risks and dependencies\nAgree on decisions and next actions');
  const [participantIds, setParticipantIds] = useState<string[]>(defaultParticipants);
  const [layout, setLayout] = useState<'conference'|'boardroom'|'discussion'>('conference');
  const [selectedExecutor, setSelectedExecutor] = useState('project-manager');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimePcRef = useRef<RTCPeerConnection | null>(null);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState('');
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [avatarImageUrl, setAvatarImageUrl] = useState('');
  const [avatarPrompt, setAvatarPrompt] = useState('Subtle natural blinking and small head movement while listening in a professional engineering meeting.');
  const [avatarTaskId, setAvatarTaskId] = useState('');
  const [avatarVideoUrl, setAvatarVideoUrl] = useState('');
  const [avatarStatus, setAvatarStatus] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState('');
  const [speakingRoleId, setSpeakingRoleId] = useState('');
  const [recordingObjective, setRecordingObjective] = useState(false);
  const [speakingAll, setSpeakingAll] = useState(false);

  const roleMap = useMemo(() => new Map(roles.map(role => [role.id, role])), [roles]);
  const loadMeetings = useCallback(async () => {
    const response = await authFetch('/api/meetings', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Meetings could not be loaded.');
    const items = (data.meetings || []) as Meeting[];
    setMeetings(items);
    return items;
  }, []);
  const loadMeeting = useCallback(async (id: string) => {
    const response = await authFetch(`/api/meetings/${id}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Meeting details could not be loaded.');
    setSelectedMeeting(data.meeting as Meeting);
    setMessages((data.messages || []) as TranscriptMessage[]);
    setActionItems((data.action_items || []) as ActionItem[]);
  }, []);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      setLoading(true); setError('');
      try {
        const [workforceResponse, meetingItems] = await Promise.all([authFetch('/api/workforce', { cache: 'no-store' }), loadMeetings()]);
        const workforce = await workforceResponse.json();
        if (!workforceResponse.ok) throw new Error(workforce.error || 'Workforce roles could not be loaded.');
        if (!alive) return;
        setRoles(workforce.role_catalog || []);
        const availableAgents = (workforce.operational_agents || []) as OperationalAgent[];
        setOperationalAgents(availableAgents);
        setSelectedExecutor(current => availableAgents.length && !availableAgents.some(agent => agent.id === current) ? availableAgents[0].id : current);
        const existing = meetingItems[0];
        if (existing) await loadMeeting(existing.id);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'Meeting room could not be initialized.'); }
      finally { if (alive) setLoading(false); }
    };
    const timer = window.setTimeout(() => { void initialize(); }, 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [loadMeetings, loadMeeting]);

  function toggleParticipant(id: string) {
    setParticipantIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 5 ? current : [...current, id]);
  }

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('Saving meeting configuration…');
    try {
      const response = await authFetch('/api/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, objective, agenda: agendaText.split('\n').map(line => line.trim()).filter(Boolean), participants: participantIds, room_layout: layout }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Meeting could not be created.');
      const meeting = data.meeting as Meeting;
      await loadMeetings(); await loadMeeting(meeting.id);
      setMessage('Meeting saved. Start discussion when ready.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Meeting could not be created.'); setMessage(''); }
    finally { setBusy(false); }
  }

  async function startDiscussion() {
    if (!selectedMeeting || busy) return;
    setBusy(true); setError(''); setMessage('The selected engineers are preparing their contributions. This uses real model calls and may take a little time.');
    try {
      const response = await authFetch(`/api/meetings/${selectedMeeting.id}/discuss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ continueMeeting: selectedMeeting.status === 'paused' || selectedMeeting.status === 'completed' }) });
      const data = await response.json();
      await loadMeeting(selectedMeeting.id); await loadMeetings();
      if (!response.ok) throw new Error(data.error || 'AI discussion could not be completed.');
      setMessage(`Discussion completed using ${data.model || 'the configured model'}. Transcript and action items are saved.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'AI discussion failed.'); setMessage(''); }
    finally { setBusy(false); }
  }

  async function speakMessage(entry: TranscriptMessage) {
    if (speakingId === entry.id) { audioRef.current?.pause(); setSpeakingId(''); return; }
    setError('');
    try {
      const voices = ['alloy','echo','fable','onyx','nova','shimmer'];
      const score = entry.speaker_id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const response = await authFetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${entry.speaker_name}. ${entry.message}`, voice: voices[score % voices.length] }) });
      if (!response.ok) throw new Error('Provider speech is unavailable.');
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); }
      const audio = new Audio(url); audioRef.current = audio; setSpeakingId(entry.id);
      setSpeakingRoleId(entry.speaker_id);
      audio.onended = () => { setSpeakingId(''); setSpeakingRoleId(''); URL.revokeObjectURL(url); };
      audio.onerror = () => { setSpeakingId(''); setSpeakingRoleId(''); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(`${entry.speaker_name}. ${entry.message}`);
        utterance.onend = () => setSpeakingId('');
        utterance.onerror = () => setSpeakingId('');
        setSpeakingId(entry.id); setSpeakingRoleId(entry.speaker_id);
        utterance.onend = () => { setSpeakingId(''); setSpeakingRoleId(''); };
        utterance.onerror = () => { setSpeakingId(''); setSpeakingRoleId(''); };
        window.speechSynthesis.speak(utterance);
      } else setError('Speech is unavailable in this browser and the configured provider could not generate audio.');
    }
  }

  async function updateActionItem(item: ActionItem, status: 'approved'|'dismissed') {
    if (!selectedMeeting) return;
    setBusy(true); setError('');
    try {
      const response = await authFetch(`/api/meetings/${selectedMeeting.id}/action-items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action_item_id: item.id, status }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Action item could not be updated.');
      await loadMeeting(selectedMeeting.id); setMessage(status === 'approved' ? 'Action item approved. It is not yet an executed task.' : 'Action item dismissed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action item could not be updated.'); }
    finally { setBusy(false); }
  }

  async function executeActionItem(item: ActionItem) {
    if (!selectedMeeting || !selectedExecutor || busy) return;
    setBusy(true); setError(''); setMessage(`Submitting “${item.title}” to ${operationalAgents.find(agent => agent.id === selectedExecutor)?.name || selectedExecutor}…`);
    try {
      const runResponse = await authFetch('/api/agents/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: selectedExecutor, task: `${item.title}\n\n${item.description}\n\nAcceptance criteria: return a concrete deliverable, state assumptions and risks, and distinguish recommendations from verified actions. Originating meeting: ${selectedMeeting.title}.`, context: `Meeting objective: ${selectedMeeting.objective}\nMeeting summary: ${selectedMeeting.summary || ''}\nDecisions: ${(selectedMeeting.decisions || []).join('; ')}\nAction item ID: ${item.id}` }) });
      const runData = await runResponse.json();
      if (!runResponse.ok) throw new Error(runData.error || 'The agent task could not be executed.');
      const runId = runData.run_id || runData.results?.[0]?.run_id;
      const patchResponse = await authFetch(`/api/meetings/${selectedMeeting.id}/action-items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action_item_id: item.id, status: 'task_created', ...(runId ? { linked_run_id: runId } : {}) }) });
      const patchData = await patchResponse.json(); if (!patchResponse.ok) throw new Error(patchData.error || 'Agent ran, but the action item link could not be saved.');
      await loadMeeting(selectedMeeting.id); setMessage(runData.status === 'waiting_approval' ? 'Task created and is waiting for approval.' : 'The action item was submitted to the operational agent. Review its reported result below in task history.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action item task failed.'); setMessage(''); }
    finally { setBusy(false); }
  }



  async function generateAvatarClip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAvatarBusy(true); setError(''); setAvatarStatus('Submitting generated avatar clip…'); setAvatarVideoUrl('');
    try {
      const response = await authFetch('/api/workforce/avatars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: avatarImageUrl, prompt: avatarPrompt }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Avatar clip could not be generated.');
      setAvatarTaskId(String(data.task_id || '')); setAvatarStatus(data.message || 'Video generation is processing.');
    } catch (cause) { setAvatarStatus(''); setError(cause instanceof Error ? cause.message : 'Avatar clip could not be generated.'); }
    finally { setAvatarBusy(false); }
  }
  async function refreshAvatarClip() {
    if (!avatarTaskId || avatarBusy) return;
    setAvatarBusy(true); setError('');
    try {
      const response = await authFetch(`/api/workforce/avatars?task_id=${encodeURIComponent(avatarTaskId)}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Avatar status could not be checked.');
      setAvatarStatus(String(data.status || 'processing'));
      if (data.video_url) setAvatarVideoUrl(String(data.video_url));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Avatar status could not be checked.'); }
    finally { setAvatarBusy(false); }
  }

  async function startRealtimeMeeting() {
    if (!selectedMeeting || realtimeActive) return;
    setError(''); setRealtimeStatus('Connecting'); setMessage('Starting a full-duplex voice session. Allow microphone access when prompted.');
    try {
      const response = await authFetch(`/api/meetings/${selectedMeeting.id}/realtime-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Realtime meeting could not start.');
      const secret = data.client_secret?.value;
      if (!secret) throw new Error('Realtime meeting did not return a temporary client secret.');
      const connection = new RTCPeerConnection(); realtimePcRef.current = connection;
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') setRealtimeStatus('Live · listening');
        else if (connection.connectionState === 'disconnected') setRealtimeStatus('Reconnecting');
        else if (connection.connectionState === 'failed') setRealtimeStatus('Connection failed');
      };
      connection.ontrack = event => { if (realtimeAudioRef.current) { realtimeAudioRef.current.srcObject = event.streams[0]; void realtimeAudioRef.current.play().catch(() => {}); } };
      const local = await navigator.mediaDevices.getUserMedia({ audio: true }); realtimeStreamRef.current = local;
      local.getTracks().forEach(track => connection.addTrack(track, local));
      const channel = connection.createDataChannel('oai-events');
      channel.onmessage = event => { try { const item = JSON.parse(event.data); if (item.type === 'response.created') setRealtimeStatus('Live · thinking'); else if (item.type === 'response.audio.delta' || item.type === 'response.output_audio.delta') setRealtimeStatus('Live · speaking'); else if (item.type === 'response.done' || item.type === 'input_audio_buffer.speech_started') setRealtimeStatus('Live · listening'); } catch {} };
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer);
      const sdp = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' }, body: offer.sdp, signal: AbortSignal.timeout(20000) });
      if (!sdp.ok) throw new Error('The realtime provider rejected the WebRTC connection.');
      await connection.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
      setRealtimeActive(true); setRealtimeStatus('Live · listening'); setMessage('Live voice meeting connected. Speak naturally; the model can listen and respond while the session is open.');
    } catch (cause) {
      realtimeStreamRef.current?.getTracks().forEach(track => track.stop()); realtimeStreamRef.current = null;
      realtimePcRef.current?.close(); realtimePcRef.current = null;
      setRealtimeActive(false); setRealtimeStatus(''); setMessage(''); setError(cause instanceof Error ? cause.message : 'Realtime meeting could not connect.');
    }
  }
  function stopRealtimeMeeting() {
    realtimeStreamRef.current?.getTracks().forEach(track => track.stop()); realtimeStreamRef.current = null;
    realtimePcRef.current?.close(); realtimePcRef.current = null;
    if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null;
    setRealtimeActive(false); setRealtimeStatus(''); setMessage('Live voice meeting ended.');
  }
  useEffect(() => () => {
    realtimeStreamRef.current?.getTracks().forEach(track => track.stop());
    realtimePcRef.current?.close();
    if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null;
  }, []);

  function dictateObjective() {
    const speechWindow = window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setError('Microphone transcription is not supported by this browser. Try Chrome or Edge with microphone permission enabled.'); return; }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-NG';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setRecordingObjective(true); setError(''); setMessage('Listening for your meeting objective…');
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) setObjective(current => current ? `${current}\n${transcript}`.slice(0, 5000) : transcript.slice(0, 5000));
      setMessage(transcript ? 'Voice input added to the meeting objective.' : 'No speech was detected.');
    };
    recognition.onerror = () => { setError('Microphone input failed. Check browser microphone permission and try again.'); setMessage(''); };
    recognition.onend = () => setRecordingObjective(false);
    try { recognition.start(); } catch { setRecordingObjective(false); setError('Microphone could not start. Try again in a moment.'); }
  }

  async function speakAllTurns() {
    if (!messages.length || speakingAll) return;
    setSpeakingAll(true); setError('');
    try {
      for (const entry of messages) {
        const score = entry.speaker_id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const voices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
        const response = await authFetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${entry.speaker_name}. ${entry.message}`, voice: voices[score % voices.length] }) });
        if (!response.ok) throw new Error('Spoken meeting playback is unavailable. Check the speech provider configuration.');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url); audioRef.current = audio; setSpeakingId(entry.id); setSpeakingRoleId(entry.speaker_id);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('Audio playback failed.'));
          void audio.play().catch(reject);
        });
        URL.revokeObjectURL(url); setSpeakingId(''); setSpeakingRoleId('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Spoken meeting playback failed.');
    } finally { setSpeakingAll(false); setSpeakingId(''); setSpeakingRoleId(''); }
  }

  function stopSpokenMeeting() {
    audioRef.current?.pause(); audioRef.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeakingAll(false); setSpeakingId(''); setSpeakingRoleId('');
  }

  const selectedRoles = (selectedMeeting?.participants || []).map(id => roleMap.get(id)).filter((role): role is Role => Boolean(role));
  const avatarStyle = (id: string) => ({ background: `linear-gradient(145deg, hsl(${Math.abs(id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 360} 65% 45% / .35), rgba(15,15,20,.9))` });

  return <LEOAppShell title="AI Meeting Room" subtitle="Real, moderated AI engineer discussions with persistent transcripts and decisions.">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--gold)]/20 bg-[var(--gold)]/[.06] p-4">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[var(--gold)]"><Video size={21}/></div><div><p className="text-sm font-bold">LeonardX Virtual Office</p><p className="mt-1 text-xs text-zinc-400">160 professional role definitions · 2–5 participants per meeting · saved history</p></div></div>
      <div className="flex flex-wrap gap-2"><a href="/workforce" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">Workforce dashboard</a><button onClick={() => { setSelectedMeeting(null); setMessages([]); setActionItems([]); setError(''); setMessage('New meeting configuration'); }} className="inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-3 py-2 text-sm font-bold text-black"><Plus size={15}/> New meeting</button></div>
    </div>
    {(error || message) && <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/[.04] text-zinc-300'}`} role={error ? 'alert' : 'status'}>{error ? <CircleAlert size={16} className="mt-0.5 shrink-0"/> : <CheckCircle2 size={16} className="mt-0.5 shrink-0"/>}<span>{error || message}</span><button className="ml-auto text-zinc-500" onClick={() => { setError(''); setMessage(''); }} aria-label="Dismiss message"><X size={15}/></button></div>}
    {loading ? <Panel><div className="flex items-center gap-3 text-sm text-zinc-400"><LoaderCircle className="animate-spin" size={18}/> Loading role registry and meeting history…</div></Panel> : <div className="grid gap-4 xl:grid-cols-[minmax(260px,.78fr)_minmax(0,1.7fr)]">
      <div className="space-y-4">
        <Panel>
          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold">Meeting setup</p><p className="mt-1 text-xs text-zinc-500">Select specialist roles for the next discussion.</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-400">{participantIds.length}/5</span></div>
          <form onSubmit={createMeeting} className="space-y-3">
            <label className="block text-xs text-zinc-400">Meeting title<input required value={title} onChange={event => setTitle(event.target.value)} maxLength={160} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--gold)]/60"/></label>
            <label className="block text-xs text-zinc-400">Objective<textarea required value={objective} onChange={event => setObjective(event.target.value)} rows={3} maxLength={5000} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--gold)]/60"/></label>
            <button type="button" onClick={dictateObjective} disabled={recordingObjective} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50"><Mic2 size={14} className={recordingObjective ? 'animate-pulse text-red-300' : ''}/>{recordingObjective ? 'Listening…' : 'Speak meeting objective'}</button>
            <label className="block text-xs text-zinc-400">Agenda · one item per line<textarea value={agendaText} onChange={event => setAgendaText(event.target.value)} rows={3} maxLength={4000} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--gold)]/60"/></label>
            <div><p className="mb-2 text-xs text-zinc-400">Room layout</p><div className="grid grid-cols-3 gap-1.5">{layouts.map(option => <button type="button" key={option.id} onClick={() => setLayout(option.id)} className={`rounded-xl border p-2 text-left ${layout === option.id ? 'border-[var(--gold)]/50 bg-[var(--gold)]/10 text-white' : 'border-white/10 text-zinc-400 hover:bg-white/5'}`}><span className="block text-xs font-semibold">{option.label}</span><span className="mt-1 block text-[10px] leading-4 opacity-70">{option.detail}</span></button>)}</div></div>
            <div><div className="mb-2 flex items-center justify-between"><p className="text-xs text-zinc-400">Choose engineers</p><span className="text-[10px] text-zinc-600">2–5 required</span></div><div className="max-h-64 space-y-1 overflow-y-auto pr-1">{roles.map(role => <label key={role.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 ${participantIds.includes(role.id) ? 'border-[var(--gold)]/35 bg-[var(--gold)]/[.07]' : 'border-white/5 hover:bg-white/[.03]'}`}><input type="checkbox" checked={participantIds.includes(role.id)} onChange={() => toggleParticipant(role.id)} disabled={!participantIds.includes(role.id) && participantIds.length >= 5} className="mt-1 accent-yellow-400"/><span className="min-w-0"><span className="block text-xs font-medium text-zinc-200">{role.name}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{role.department}</span></span></label>)}</div></div>
            <button disabled={busy || participantIds.length < 2 || participantIds.length > 5} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-3 py-3 text-sm font-bold text-black disabled:opacity-50"><CalendarClock size={16}/>{busy ? 'Please wait…' : 'Save meeting'}</button>
          </form>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold">Meeting history</p><p className="mt-1 text-xs text-zinc-500">Saved to your account.</p></div><button onClick={() => void loadMeetings().catch(cause => setError(cause.message))} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5" aria-label="Refresh meeting history"><RefreshCw size={15}/></button></div>
          {meetings.length ? <div className="space-y-2">{meetings.map(item => <button key={item.id} onClick={() => { setError(''); setMessage(''); void loadMeeting(item.id).catch(cause => setError(cause.message)); }} className={`w-full rounded-xl border p-3 text-left ${selectedMeeting?.id === item.id ? 'border-[var(--gold)]/40 bg-[var(--gold)]/[.07]' : 'border-white/10 bg-black/10 hover:bg-white/[.03]'}`}><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-zinc-200">{item.title}</span><StatusPill status={item.status}/></div><p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{item.objective}</p><p className="mt-2 text-[10px] text-zinc-600">{new Date(item.updated_at).toLocaleString()}</p></button>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-5 text-center"><DoorOpen size={22} className="mx-auto text-zinc-600"/><p className="mt-2 text-xs text-zinc-300">No saved meetings yet</p><p className="mt-1 text-[11px] text-zinc-600">Create a meeting above to start.</p></div>}
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        {!selectedMeeting ? <Panel className="flex min-h-[440px] flex-col items-center justify-center text-center"><div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[var(--gold)]"><Video size={28}/></div><h2 className="mt-4 text-xl font-bold">Set up your first meeting</h2><p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">Choose engineers, set an objective and agenda, then save the meeting. Starting a discussion sends real requests to your configured AI provider and saves each contribution.</p></Panel> : <>
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--gold)]/10 text-[var(--gold)]"><Video size={16}/></span><span className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--gold)]">Virtual office / {selectedMeeting.room_layout}</span></div><h2 className="mt-3 text-xl font-bold">{selectedMeeting.title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">{selectedMeeting.objective}</p></div><div className="flex flex-wrap gap-2"><StatusPill status={selectedMeeting.status}/><button onClick={() => void loadMeeting(selectedMeeting.id).catch(cause => setError(cause.message))} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/5" aria-label="Refresh meeting"><RefreshCw size={14}/></button></div></div>
            <div className={`mt-5 grid gap-3 ${selectedMeeting.room_layout === 'discussion' ? 'sm:grid-cols-2' : selectedMeeting.room_layout === 'boardroom' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {selectedRoles.map((role, index) => <div key={role.id} className={`relative overflow-hidden rounded-2xl border ${speakingRoleId === role.id ? 'border-[var(--gold)]/60 shadow-[0_0_24px_rgba(245,190,60,.14)]' : 'border-white/10'} bg-black/25 p-4 transition-all duration-300 ${selectedMeeting.room_layout === 'boardroom' && index === 0 ? 'lg:col-span-1' : ''}`}><div className="flex items-center gap-3"><div style={avatarStyle(role.id)} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-sm font-bold text-white ${speakingRoleId === role.id ? 'animate-pulse ring-2 ring-[var(--gold)]/50' : ''}`}>{role.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').slice(0,2)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-100">{role.name}</p><p className="mt-1 line-clamp-1 text-[11px] text-zinc-500">{role.department}</p></div></div><div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> Registered participant · AI response generated when discussion runs</div></div>)}
              <div className="flex flex-col justify-center rounded-2xl border border-dashed border-[var(--gold)]/20 bg-[var(--gold)]/[.03] p-4"><p className="text-xs font-semibold text-zinc-200">Meeting moderator</p><p className="mt-1 text-[11px] leading-5 text-zinc-500">Chief AI Officer / Chief of Staff synthesizes the actual transcript into decisions and proposed action items.</p><div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-600"><ShieldCheck size={13}/> No privileged tools available inside the discussion</div></div>
            </div>
            <form onSubmit={generateAvatarClip} className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3"><p className="text-xs font-semibold text-zinc-200">Generated avatar video clip</p><p className="mt-1 text-[11px] leading-5 text-zinc-500">Optional provider-generated five-second clip from a public HTTPS avatar image. This is not a live video avatar and may incur provider costs.</p></div>
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input type="url" required value={avatarImageUrl} onChange={event => setAvatarImageUrl(event.target.value)} placeholder="Public HTTPS avatar image URL" className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-[var(--gold)]/50" />
                <input value={avatarPrompt} onChange={event => setAvatarPrompt(event.target.value)} maxLength={1000} placeholder="Motion prompt" className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-[var(--gold)]/50" />
                <button type="submit" disabled={avatarBusy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--gold)]/30 px-3 py-2 text-xs font-semibold text-zinc-100 disabled:opacity-50"><Video size={14}/>{avatarBusy ? 'Working…' : 'Generate clip'}</button>
              </div>
              {(avatarStatus || avatarTaskId) && <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-[11px] text-zinc-400">{avatarStatus}</span>{avatarTaskId && !avatarVideoUrl && <button type="button" onClick={() => void refreshAvatarClip()} disabled={avatarBusy} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-200 disabled:opacity-50">Check status</button>}</div>}
              {avatarVideoUrl && <video controls playsInline src={avatarVideoUrl} className="mt-3 max-h-72 w-full rounded-xl bg-black" />}
            </form>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><div><p className="text-xs text-zinc-500">{messages.length} saved transcript entries · {selectedMeeting.completed_at ? `Completed ${new Date(selectedMeeting.completed_at).toLocaleString()}` : 'Not yet completed'}</p>{realtimeStatus && <p className="mt-1 text-[11px] text-emerald-300">{realtimeStatus}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => realtimeActive ? stopRealtimeMeeting() : void startRealtimeMeeting()} disabled={busy} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-45 ${realtimeActive ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}>{realtimeActive ? <PhoneOff size={15}/> : <Phone size={15}/>} {realtimeActive ? 'End live voice' : 'Start live voice meeting'}</button><button onClick={() => void startDiscussion()} disabled={busy || selectedMeeting.status === 'cancelled'} className="inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-4 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-45">{busy ? <LoaderCircle className="animate-spin" size={15}/> : <Play size={15}/>} {selectedMeeting.status === 'paused' ? 'Resume discussion' : selectedMeeting.status === 'completed' ? 'Continue discussion' : 'Start AI discussion'}</button></div></div>
          </Panel>
          <Panel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><MessageSquare size={17} className="text-[var(--gold)]"/><div><h3 className="text-sm font-semibold">Live transcript and meeting record</h3><p className="mt-1 text-[11px] text-zinc-500">Each entry is stored after a real model response is received.</p></div></div>{messages.length > 0 && <div className="flex gap-2"><button type="button" onClick={() => void speakAllTurns()} disabled={speakingAll} className="inline-flex items-center gap-2 rounded-xl border border-[var(--gold)]/30 px-3 py-2 text-xs text-zinc-200 disabled:opacity-50"><Volume2 size={14}/>{speakingAll ? 'Speaking meeting…' : 'Speak all turns'}</button>{speakingAll && <button type="button" onClick={stopSpokenMeeting} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300">Stop</button>}</div>}</div>
            {messages.length ? <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">{messages.map((entry, index) => <article key={entry.id || `${entry.turn_index}-${index}`} className={`rounded-2xl border p-4 ${entry.message_type === 'moderator_summary' ? 'border-[var(--gold)]/25 bg-[var(--gold)]/[.06]' : 'border-white/10 bg-black/20'}`}><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[.06] text-zinc-300"><Bot size={17}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-zinc-100">{entry.speaker_name}</p><p className="mt-0.5 text-[10px] text-zinc-500">{entry.speaker_role}{entry.message_type === 'moderator_summary' ? ' · Moderator summary' : ''}</p></div><div className="flex items-center gap-2"><time className="text-[10px] text-zinc-600">{entry.created_at ? new Date(entry.created_at).toLocaleTimeString() : 'Just now'}</time><button type="button" onClick={() => void speakMessage(entry)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-white" aria-label={`${speakingId === entry.id ? 'Stop' : 'Listen to'} ${entry.speaker_name}`}><Volume2 size={12}/>{speakingId === entry.id ? 'Stop' : 'Listen'}</button></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{entry.message}</p></div></div></article>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center"><Mic2 size={24} className="mx-auto text-zinc-600"/><p className="mt-3 text-sm text-zinc-300">The room is ready</p><p className="mt-1 text-xs text-zinc-500">Start the discussion to request actual contributions from the selected AI roles.</p></div>}
          </Panel>
          {(selectedMeeting.summary || selectedMeeting.decisions?.length || actionItems.length) ? <Panel>
            <div className="mb-4 flex items-center gap-2"><ClipboardList size={17} className="text-[var(--gold)]"/><div><h3 className="text-sm font-semibold">Decisions and action items</h3><p className="mt-1 text-[11px] text-zinc-500">Proposals are not treated as completed work.</p></div></div>
            {selectedMeeting.summary && <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-semibold text-zinc-200">Moderator summary</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{selectedMeeting.summary}</p></div>}
            {selectedMeeting.decisions?.length ? <div className="mb-4"><p className="mb-2 text-xs font-semibold text-zinc-300">Decisions</p><ul className="space-y-2">{selectedMeeting.decisions.map((decision, index) => <li key={index} className="flex gap-2 text-sm text-zinc-400"><CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-400"/>{decision}</li>)}</ul></div> : null}
            {actionItems.length ? <div className="space-y-3"><p className="text-xs font-semibold text-zinc-300">Proposed action items</p>{actionItems.map(item => <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-zinc-200">{item.title}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-500">{item.description || 'No additional detail supplied.'}</p><p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">{item.priority} priority · {item.suggested_role_id ? roleMap.get(item.suggested_role_id)?.name || item.suggested_role_id : 'Unassigned role'}</p></div><StatusPill status={item.status}/></div>{!['task_created','dismissed'].includes(item.status) && <div className="mt-3 flex flex-wrap items-center gap-2">{item.status !== 'approved' && <><button onClick={() => void updateActionItem(item, 'approved')} disabled={busy} className="rounded-lg border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10">Approve proposal</button><button onClick={() => void updateActionItem(item, 'dismissed')} disabled={busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5">Dismiss</button></>}<button onClick={() => void executeActionItem(item)} disabled={busy || !operationalAgents.length || item.status !== 'approved'} className="rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black disabled:opacity-40">{item.status === 'approved' ? 'Create and run task' : 'Approve before execution'}</button></div>}</div>)}</div> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4"><label className="flex items-center gap-2 text-xs text-zinc-500">Execution agent<select value={selectedExecutor} onChange={event => setSelectedExecutor(event.target.value)} className="max-w-64 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-200">{operationalAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.approvalRequired ? ' · approval may be required' : ''}</option>)}</select></label><span className="text-[10px] text-zinc-600">Creating a task makes a real model request and may consume provider usage.</span></div>
          </Panel> : null}
        </>}
      </div>
    </div>}
  </LEOAppShell>;
}

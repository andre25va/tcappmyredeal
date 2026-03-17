import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic, MicOff, Square, Loader2, CheckCircle2, AlertTriangle,
  RotateCcw, Sparkles, Calendar, Users, Keyboard,
} from 'lucide-react';
import { ChatActionCard } from './ChatActionCard';
import { buildVoiceContext } from '../ai/voiceContextBuilder';
import { interpretVoiceUpdateAI } from '../ai/apiClient';
import { approveAction, dismissAction } from '../ai/approvalEngine';
import type { Deal } from '../types';
import type { DealChatAction, VoiceUpdateInterpretation } from '../ai/types';

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
}

type VoiceState = 'idle' | 'recording' | 'reviewing-transcript' | 'interpreting' | 'showing-results' | 'done';

const MAX_RECORDING_SECONDS = 180; // 3 minutes

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export const VoiceUpdatePanel: React.FC<Props> = ({ deal, onUpdate }) => {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [interpretation, setInterpretation] = useState<VoiceUpdateInterpretation | null>(null);
  const [error, setError] = useState('');
  const [useTyping, setUseTyping] = useState(!SpeechRecognitionAPI);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const isSpeechAvailable = !!SpeechRecognitionAPI;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset when deal changes
  useEffect(() => {
    resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  const resetAll = useCallback(() => {
    stopRecording();
    setState('idle');
    setTranscript('');
    setInterimText('');
    setElapsed(0);
    setInterpretation(null);
    setError('');
  }, []);

  function stopRecording() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) { /* ignore */ }
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const startRecording = useCallback(() => {
    if (!SpeechRecognitionAPI) return;
    setError('');
    setTranscript('');
    setInterimText('');
    setElapsed(0);

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
          setTranscript(finalTranscript.trim());
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return; // ignore silence
      console.error('Speech recognition error:', event.error);
      setError(`Speech recognition error: ${event.error}`);
      stopRecording();
      if (finalTranscript.trim()) {
        setState('reviewing-transcript');
      } else {
        setState('idle');
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in recording state (browser sometimes stops)
      // But don't restart if we intentionally stopped
      if (recognitionRef.current === recognition && timerRef.current) {
        try { recognition.start(); } catch (_) { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);
      if (secs >= MAX_RECORDING_SECONDS) {
        handleStopRecording();
        setError('Maximum recording time (3 minutes) reached.');
      }
    }, 500);

    setState('recording');
  }, []);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    setInterimText('');
    setState('reviewing-transcript');
  }, []);

  const handleInterpret = useCallback(async () => {
    if (!transcript.trim()) {
      setError('Please provide a transcript first.');
      return;
    }
    setError('');
    setState('interpreting');

    try {
      const voiceCtx = buildVoiceContext(deal, transcript.trim());
      const result = await interpretVoiceUpdateAI(transcript.trim(), voiceCtx);
      setInterpretation(result);
      setState('showing-results');
    } catch (err: any) {
      console.error('Voice interpretation error:', err);
      setError(err.message || 'Failed to interpret voice update.');
      setState('reviewing-transcript');
    }
  }, [deal, transcript]);

  // ── Action Handlers (using shared approval engine) ──────────────────────

  const handleApproveAction = async (action: DealChatAction) => {
    const result = await approveAction(action, deal, 'voice_update', {
      transcript: transcript.slice(0, 500),
    });
    if (result.updatedDeal) {
      onUpdate(result.updatedDeal);
    }
  };

  const handleDismissAction = async (action: DealChatAction) => {
    await dismissAction(action, deal.id, 'voice_update', {
      transcript: transcript.slice(0, 500),
    });
  };

  const handleApproveAll = async () => {
    if (!interpretation?.suggestedActions) return;
    for (const action of interpretation.suggestedActions) {
      await handleApproveAction(action);
    }
    setState('done');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-500/10 to-violet-500/5 border-b border-base-300 flex-none">
        <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
          <Mic size={16} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-base-content leading-tight">Voice Update</div>
          <div className="text-[10px] text-base-content/50 truncate">{deal.address}</div>
        </div>
        {state !== 'idle' && (
          <button onClick={resetAll} className="btn btn-ghost btn-xs gap-1">
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Error Banner */}
        {error && (
          <div className="alert alert-warning text-xs py-2">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* ─── IDLE STATE ─── */}
        {state === 'idle' && (
          <div className="flex flex-col items-center justify-center gap-5 py-10">
            <div className="w-16 h-16 bg-violet-500/10 rounded-full flex items-center justify-center">
              <Mic size={32} className="text-violet-500" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-base-content text-base">Record a Voice Update</h3>
              <p className="text-xs text-base-content/50 mt-1 max-w-[280px]">
                Speak a quick update about this deal. AI will extract tasks, notes, dates, and more.
              </p>
            </div>

            {!useTyping && isSpeechAvailable ? (
              <button onClick={startRecording} className="btn btn-primary btn-lg rounded-full gap-2 shadow-lg">
                <Mic size={20} /> Start Recording
              </button>
            ) : (
              <div className="w-full max-w-md space-y-3">
                <textarea
                  className="textarea textarea-bordered w-full text-sm min-h-[120px]"
                  placeholder="Type your update here..."
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                />
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => { if (transcript.trim()) setState('reviewing-transcript'); }}
                    disabled={!transcript.trim()}
                    className="btn btn-primary gap-1"
                  >
                    <Sparkles size={14} /> Continue to Review
                  </button>
                </div>
              </div>
            )}

            {isSpeechAvailable && (
              <button
                onClick={() => setUseTyping(!useTyping)}
                className="btn btn-ghost btn-xs gap-1 text-base-content/40"
              >
                {useTyping ? <><Mic size={12} /> Use microphone</> : <><Keyboard size={12} /> Type instead</>}
              </button>
            )}

            {!isSpeechAvailable && (
              <div className="text-xs text-base-content/40 text-center max-w-[260px]">
                <AlertTriangle size={12} className="inline mr-1" />
                Speech recognition not available in this browser. Use the text input above.
              </div>
            )}
          </div>
        )}

        {/* ─── RECORDING STATE ─── */}
        {state === 'recording' && (
          <div className="flex flex-col items-center gap-4 py-6">
            {/* Pulsing mic */}
            <div className="relative">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
                <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                  <Mic size={24} className="text-white" />
                </div>
              </div>
              {/* Waveform dots */}
              <div className="flex items-center gap-1 absolute -bottom-4 left-1/2 -translate-x-1/2">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="w-1 bg-red-400 rounded-full"
                    style={{
                      height: `${8 + Math.sin(Date.now() / 200 + i) * 8}px`,
                      animation: `pulse 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="text-center mt-2">
              <div className="text-lg font-bold text-red-500">{formatTime(elapsed)}</div>
              <div className="text-[10px] text-base-content/50">
                {MAX_RECORDING_SECONDS - elapsed}s remaining
              </div>
            </div>

            {/* Live transcript */}
            <div className="w-full max-w-md bg-base-200 rounded-xl p-3 min-h-[80px] text-sm">
              {transcript && <span>{transcript} </span>}
              {interimText && <span className="text-base-content/40">{interimText}</span>}
              {!transcript && !interimText && (
                <span className="text-base-content/30 italic">Listening...</span>
              )}
            </div>

            <button onClick={handleStopRecording} className="btn btn-error btn-lg rounded-full gap-2 shadow-lg">
              <Square size={16} /> Stop Recording
            </button>
          </div>
        )}

        {/* ─── REVIEWING TRANSCRIPT ─── */}
        {state === 'reviewing-transcript' && (
          <div className="space-y-4">
            <div className="text-sm font-semibold text-base-content">Review Transcript</div>
            <textarea
              className="textarea textarea-bordered w-full text-sm min-h-[120px]"
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Your transcript will appear here..."
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleInterpret}
                disabled={!transcript.trim()}
                className="btn btn-primary gap-1"
              >
                <Sparkles size={14} /> Interpret with AI
              </button>
              <button onClick={resetAll} className="btn btn-ghost btn-sm">
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* ─── INTERPRETING ─── */}
        {state === 'interpreting' && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <Loader2 size={32} className="animate-spin text-primary" />
            <div className="text-sm text-base-content/60">Analyzing your update...</div>
          </div>
        )}

        {/* ─── SHOWING RESULTS ─── */}
        {state === 'showing-results' && interpretation && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="font-semibold text-sm text-violet-700 mb-1">Summary</div>
              <p className="text-sm text-base-content/80">{interpretation.summary}</p>
            </div>

            {/* Warnings */}
            {interpretation.warnings.length > 0 && (
              <div className="space-y-1">
                {interpretation.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle size={12} /> {w}
                  </div>
                ))}
              </div>
            )}

            {/* Detected dates & entities */}
            <div className="flex flex-wrap gap-3">
              {interpretation.detectedDates.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Calendar size={12} className="text-blue-500" />
                  {interpretation.detectedDates.map((d, i) => (
                    <span key={i} className="badge badge-sm badge-outline badge-info">{d}</span>
                  ))}
                </div>
              )}
              {interpretation.mentionedEntities.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Users size={12} className="text-green-500" />
                  {interpretation.mentionedEntities.map((e, i) => (
                    <span key={i} className="badge badge-sm badge-outline badge-success">{e}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Cards */}
            {interpretation.suggestedActions.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Suggested Actions ({interpretation.suggestedActions.length})
                  </span>
                  {interpretation.suggestedActions.length > 1 && (
                    <button onClick={handleApproveAll} className="btn btn-xs btn-primary gap-1">
                      <CheckCircle2 size={12} /> Approve All
                    </button>
                  )}
                </div>
                {interpretation.suggestedActions.map((action, i) => (
                  <ChatActionCard
                    key={`voice-action-${i}`}
                    action={action}
                    onApprove={handleApproveAction}
                    onDismiss={handleDismissAction}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-base-content/50 text-center py-4">
                No specific actions detected. The update has been noted.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={resetAll} className="btn btn-ghost btn-sm gap-1">
                <Mic size={12} /> Record Another
              </button>
            </div>
          </div>
        )}

        {/* ─── DONE STATE ─── */}
        {state === 'done' && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <div className="w-14 h-14 bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 size={28} className="text-success" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-base-content text-base">All Actions Applied</h3>
              <p className="text-xs text-base-content/50 mt-1">
                Your voice update has been processed and all actions approved.
              </p>
            </div>
            <button onClick={resetAll} className="btn btn-primary btn-sm gap-1">
              <Mic size={12} /> Record Another Update
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

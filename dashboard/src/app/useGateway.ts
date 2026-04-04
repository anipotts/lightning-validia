"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ThreatEvent, ThreatLevel, AttackCategory, MetaSignal } from "./types";

const WS_URL = "ws://127.0.0.1:18789";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Parses an OpenClaw gateway message into a ThreatEvent.
 * Expected format from Paranoid Shield:
 *   { type: "message", content: string, metadata?: { threat_level, threat_score, category, signals, meta_signals } }
 *
 * Falls back to parsing trust badges from the response text if no structured metadata.
 */
function parseGatewayMessage(raw: unknown): ThreatEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;

  // Try structured metadata first
  const meta = msg.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.threat_score === "number") {
    return {
      id: crypto.randomUUID(),
      input: (msg.input as string) ?? "",
      response: (msg.content as string) ?? "",
      threatLevel: (meta.threat_level as ThreatLevel) ?? "safe",
      threatScore: meta.threat_score as number,
      category: (meta.category as AttackCategory) ?? null,
      signals: (meta.signals as string[]) ?? [],
      metaSignals: (meta.meta_signals as MetaSignal[]) ?? [],
      timestamp: new Date(),
    };
  }

  // Fallback: parse trust badges from response text
  const content = (msg.content as string) ?? "";
  let threatLevel: ThreatLevel = "safe";
  let threatScore = 0;

  if (content.includes("\u{1F6AB}") || content.includes("[blocked")) {
    threatLevel = "blocked";
    threatScore = 0.92;
  } else if (content.includes("\u{1F534}") || content.includes("[trust: low")) {
    threatLevel = "likely_attack";
    threatScore = 0.72;
  } else if (content.includes("\u{1F7E1}") || content.includes("[trust: moderate")) {
    threatLevel = "suspicious";
    threatScore = 0.45;
  } else if (content.includes("\u{1F7E2}") || content.includes("[trust: high")) {
    threatLevel = "safe";
    threatScore = 0.05;
  }

  return {
    id: crypto.randomUUID(),
    input: (msg.input as string) ?? "",
    response: content,
    threatLevel,
    threatScore,
    category: null,
    signals: [],
    metaSignals: [],
    timestamp: new Date(),
  };
}

export function useGateway(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [events, setEvents] = useState<ThreatEvent[]>([]);

  const addEvent = useCallback((event: ThreatEvent) => {
    setEvents((prev) => [event, ...prev]);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content: text }));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (disposed) return;
      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        setStatus("connected");
        attemptsRef.current = 0;
      };

      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          const event = parseGatewayMessage(parsed);
          if (event) addEvent(event);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("disconnected");
        if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          attemptsRef.current++;
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        } else {
          setStatus("error");
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [enabled, addEvent]);

  return { status, events, addEvent, sendMessage };
}

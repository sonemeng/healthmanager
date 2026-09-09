'use client';

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { InitialView } from './initial-view';
import { ActiveView } from './active-view';
import type { ChatMessageData } from './message-block';
import type { HealthInsight } from './insight-panel';

export function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeInsight, setActiveInsight] = useState<HealthInsight | null>(null);

  const chatMutation = trpc.ai.chat.useMutation();

  const hasMessages = messages.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessageData = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    try {
      const result = await chatMutation.mutateAsync({
        message: userMessage.content,
      });

      const insight: HealthInsight = {
        id: result.insightId,
        title: '健康数据分析',
        type: 'summary',
        status: 'ready',
        data: {
          summary: result.answer,
          sources: result.bundle
            ? [{ label: result.bundle, icon: '◎' }]
            : [],
        },
      };

      const aiMessage: ChatMessageData = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: result.answer,
        sources: insight.data?.sources,
        artifactId: result.insightId,
      };

      setMessages((prev) => [...prev, aiMessage]);
      setActiveInsight(insight);
      setPanelOpen(true);
    } catch (err) {
      const errorMessage: ChatMessageData = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: '抱歉，处理请求时出错，请重试。',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, chatMutation]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  const handleArtifactClick = useCallback(() => {
    if (activeInsight) {
      setPanelOpen(true);
    }
  }, [activeInsight]);

  const handlePanelClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  if (!hasMessages) {
    return (
      <InitialView
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onSuggestionClick={handleSuggestionClick}
      />
    );
  }

  return (
    <ActiveView
      messages={messages}
      input={input}
      onInputChange={setInput}
      onSubmit={handleSubmit}
      isStreaming={isStreaming}
      panelOpen={panelOpen}
      activeInsight={activeInsight}
      onPanelClose={handlePanelClose}
      onArtifactClick={handleArtifactClick}
    />
  );
}

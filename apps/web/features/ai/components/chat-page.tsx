'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { downloadText } from '@/lib/export';
import { trpc } from '@/lib/trpc/client';
import { ActiveView } from './active-view';
import type { ChatMessageData } from './message-block';
import type { HealthInsight } from './insight-panel';

export function ChatPage() {
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeInsight, setActiveInsight] = useState<HealthInsight | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');

  const chatMutation = trpc.ai.chat.useMutation();
  const conversations = trpc.ai.conversations.useQuery();
  const activeProfile = trpc.profiles.active.useQuery();
  const preferences = trpc.preferences.get.useQuery();
  const channels = trpc.aiChannels.list.useQuery();
  const savePreference = trpc.preferences.update.useMutation();
  const conversation = trpc.ai.conversation.useQuery({ id: conversationId! }, { enabled: Boolean(conversationId) });

  useEffect(() => {
    const question = searchParams.get('question');
    if (question) setInput(question);
  }, [searchParams]);

  useEffect(() => {
    if (conversation.data) setMessages(conversation.data);
  }, [conversation.data]);

  useEffect(() => {
    if (!model && preferences.data?.aiModel) setModel(preferences.data.aiModel);
  }, [model, preferences.data?.aiModel]);

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
    const pendingMessageId = `msg-${Date.now() + 1}`;
    setMessages((prev) => [...prev, {
      id: pendingMessageId,
      role: 'assistant',
      content: '正在读取已确认的健康档案，并生成结构化回答…',
    }]);

    try {
      const result = await chatMutation.mutateAsync({
        message: userMessage.content,
        conversationId,
        model: model || undefined,
        reasoningEffort,
      });
      setConversationId(result.conversationId);
      void conversations.refetch();

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
        id: pendingMessageId,
        role: 'assistant',
        content: result.answer,
        sources: insight.data?.sources,
        artifactId: result.insightId,
      };

       setMessages((prev) => prev.map((message) => message.id === pendingMessageId ? aiMessage : message));
      setActiveInsight(insight);
      setPanelOpen(true);
    } catch (err) {
      const errorMessage: ChatMessageData = {
        id: pendingMessageId,
        role: 'assistant',
        content: '抱歉，处理请求时出错，请重试。',
      };
       setMessages((prev) => prev.map((message) => message.id === pendingMessageId ? errorMessage : message));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, chatMutation, conversationId, model, reasoningEffort, conversations]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  const startNewConversation = useCallback(() => {
    setConversationId(undefined);
    setMessages([]);
    setActiveInsight(null);
    setPanelOpen(false);
  }, []);

  const handleArtifactClick = useCallback(() => {
    if (activeInsight) {
      setPanelOpen(true);
    }
  }, [activeInsight]);

  const handlePanelClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const activeChannel = channels.data?.find((channel) => channel.isActive);
  const modelOptions = activeChannel?.modelsCache?.length
    ? activeChannel.modelsCache
    : model ? [model] : [];

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel);
    savePreference.mutate({ aiModel: nextModel });
  };

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
        onExport={() => downloadText('healthmanager-ai-history', messages.map((message) => `## ${message.role === 'user' ? '我的问题' : 'HealthManager AI'}\n\n${message.content}`).join('\n\n---\n\n'), 'text/markdown;charset=utf-8', 'md')}
        conversations={conversations.data ?? []}
        activeConversationId={conversationId}
        onSelectConversation={(id) => setConversationId(id)}
        onNewConversation={startNewConversation}
        onClear={startNewConversation}
        hasMessages={hasMessages}
        model={model}
        modelOptions={modelOptions}
        activeChannelName={activeChannel?.name}
        profileName={activeProfile.data?.name}
        isOwnerProfile={activeProfile.data?.isDefault}
        reasoningEffort={reasoningEffort}
        onModelChange={handleModelChange}
        onReasoningEffortChange={setReasoningEffort}
        onSuggestionClick={handleSuggestionClick}
      />
  );
}

'use client';

import { useRef, useEffect, useState } from 'react';
import { MessageBlock, type ChatMessageData } from './message-block';

interface MessageThreadProps {
  messages: ChatMessageData[];
  onArtifactClick?: (id: string) => void;
}

export function MessageThread({ messages, onArtifactClick }: MessageThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
  };

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl py-4">
        {messages.map((msg) => (
          <MessageBlock key={msg.id} message={msg} onArtifactClick={onArtifactClick} />
        ))}
      </div>
    </div>
  );
}

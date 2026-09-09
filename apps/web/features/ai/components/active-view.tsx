'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { MessageThread } from './message-thread';
import { ChatInput } from './chat-input';
import { InsightPanel, type HealthInsight } from './insight-panel';
import type { ChatMessageData } from './message-block';

interface ActiveViewProps {
  messages: ChatMessageData[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming: boolean;
  panelOpen: boolean;
  activeInsight: HealthInsight | null;
  onPanelClose: () => void;
  onArtifactClick: (id: string) => void;
}

export function ActiveView({
  messages,
  input,
  onInputChange,
  onSubmit,
  onStop,
  isStreaming,
  panelOpen,
  activeInsight,
  onPanelClose,
  onArtifactClick,
}: ActiveViewProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Left panel: Messages + Input */}
      <ResizablePanel defaultSize={panelOpen ? 45 : 100} minSize={30}>
        <div className="flex h-full flex-col bg-white">
          <MessageThread messages={messages} onArtifactClick={onArtifactClick} />
          <ChatInput
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            onStop={onStop}
            isStreaming={isStreaming}
          />
        </div>
      </ResizablePanel>

      {panelOpen && (
        <>
          <ResizableHandle
            withHandle
            className="w-px bg-neutral-200 transition-colors hover:bg-accent-300 data-[resize-handle-active]:bg-accent-500"
          />
          <ResizablePanel defaultSize={55} minSize={30} collapsible>
            <div className="h-full bg-neutral-50">
              <InsightPanel insight={activeInsight} onClose={onPanelClose} />
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

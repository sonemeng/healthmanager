import { EventEmitter } from 'events';
import type { AppEvent, AppEventType } from './types';

type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void | Promise<void>;

class EventBus {
  private emitter = new EventEmitter();

  emit(event: AppEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // wildcard listeners
  }

  on<T extends AppEventType>(
    type: T,
    handler: EventHandler<Extract<AppEvent, { type: T }>>
  ): void {
    this.emitter.on(type, handler);
  }

  onAll(handler: EventHandler): void {
    this.emitter.on('*', handler);
  }

  off(type: string, handler: EventHandler): void {
    this.emitter.off(type, handler);
  }
}

export const eventBus = new EventBus();

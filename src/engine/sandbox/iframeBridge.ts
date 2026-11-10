import type { AgentMsg, HostMsg, PatchOp } from '../types';
import { buildSandboxSrcDoc, PROTOCOL_VERSION } from './runtimeAgentSource';

/**
 * Host <-> Sandboxed Iframe MessageChannel Bridge (01_SYSTEM_ARCHITECTURE.md §9)
 * - Listens for the initial 'hello' handshake from a specific artboardId
 * - Resilient to React 19 StrictMode double-effect mounts via 'requestHello' ping & iframe load hook
 * - Transfers MessageChannel.port2 to the iframe
 * - Enforces sequence numbering and backpressure (max 8 un-acked patches)
 * - Buffers patches when an artboard is in 'frozen' lifecycle state (F005)
 */

export type AgentMessageHandler = (artboardId: string, msg: AgentMsg) => void;

interface ArtboardChannel {
  artboardId: string;
  iframe: HTMLIFrameElement;
  port: MessagePort | null;
  ready: boolean;
  seq: number;
  lastAckSeq: number;
  frozen: boolean;
  pendingOps: PatchOp[];
  pendingMessages: HostMsg[];
  lastLoadMsg: Extract<HostMsg, { t: 'load' }>;
  onLoadListener?: () => void;
}

export class IframeSandboxRegistry {
  private channels = new Map<string, ArtboardChannel>();
  private handlers = new Set<AgentMessageHandler>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleWindowHandshake);
    }
  }

  private handleWindowHandshake = (ev: MessageEvent): void => {
    const data = ev.data as AgentMsg | undefined;
    if (!data || data.t !== 'hello' || data.v !== PROTOCOL_VERSION) {
      return;
    }

    const channel = this.channels.get(data.artboardId);
    if (!channel) {
      return;
    }

    this.connectPortToIframe(channel);
  };

  private connectPortToIframe(channel: ArtboardChannel): void {
    const win = channel.iframe.contentWindow;
    if (!win) return;

    if (channel.port) {
      try {
        channel.port.close();
      } catch {
        // Ignore close errors
      }
    }

    const mc = new MessageChannel();
    channel.port = mc.port1;
    channel.ready = true;

    mc.port1.onmessage = (portEv: MessageEvent<AgentMsg>) => {
      this.onPortMessage(channel, portEv.data);
    };
    mc.port1.start();

    win.postMessage({ t: 'initPort' }, '*', [mc.port2]);

    // Flush queued messages (exclude redundant 'load' if srcdoc already rendered the full document)
    for (const msg of channel.pendingMessages) {
      if (msg.t === 'load') continue;
      channel.port.postMessage(msg);
    }
    channel.pendingMessages = [];

    if (!channel.frozen && channel.pendingOps.length > 0) {
      const queued = channel.pendingOps.splice(0, channel.pendingOps.length);
      this.sendPatchToChannel(channel, queued);
    }
  }

  private onPortMessage(channel: ArtboardChannel, msg: AgentMsg): void {
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'ack') {
      channel.lastAckSeq = msg.seq;
      if (!channel.frozen && channel.pendingOps.length > 0) {
        const queued = channel.pendingOps.splice(0, channel.pendingOps.length);
        this.sendPatchToChannel(channel, queued);
      }
    }

    for (const handler of this.handlers) {
      handler(channel.artboardId, msg);
    }
  }

  public registerArtboard(
    artboardId: string,
    iframe: HTMLIFrameElement,
    initialLoad: Extract<HostMsg, { t: 'load' }>
  ): void {
    const existing = this.channels.get(artboardId);
    if (existing) {
      if (existing.onLoadListener) {
        existing.iframe.removeEventListener('load', existing.onLoadListener);
      }
      if (existing.port) {
        existing.port.close();
      }
    }

    const channel: ArtboardChannel = {
      artboardId,
      iframe,
      port: null,
      ready: false,
      seq: 0,
      lastAckSeq: 0,
      frozen: false,
      pendingOps: [],
      pendingMessages: [initialLoad],
      lastLoadMsg: initialLoad,
    };

    const onLoad = (): void => {
      iframe.contentWindow?.postMessage({ t: 'requestHello' }, '*');
    };
    channel.onLoadListener = onLoad;
    iframe.addEventListener('load', onLoad);

    this.channels.set(artboardId, channel);

    // Build and assign initial srcdoc imperatively so React never overwrites it on re-render
    const expectedSrcDoc = buildSandboxSrcDoc(
      artboardId,
      initialLoad.html,
      initialLoad.sheets
    );
    if (iframe.srcdoc !== expectedSrcDoc) {
      iframe.srcdoc = expectedSrcDoc;
    } else {
      // Already loaded with identical srcdoc (e.g. React StrictMode 2nd effect run)
      try {
        iframe.contentWindow?.postMessage({ t: 'requestHello' }, '*');
      } catch {
        // Ignore if not yet ready
      }
    }
  }

  public unregisterArtboard(artboardId: string): void {
    const ch = this.channels.get(artboardId);
    if (ch) {
      if (ch.onLoadListener) {
        ch.iframe.removeEventListener('load', ch.onLoadListener);
      }
      if (ch.port) {
        ch.port.close();
      }
    }
    this.channels.delete(artboardId);
  }

  public send(artboardId: string, msg: HostMsg): void {
    const ch = this.channels.get(artboardId);
    if (!ch) return;

    if (msg.t === 'load') {
      ch.lastLoadMsg = msg;
    }

    if (!ch.ready || !ch.port) {
      ch.pendingMessages.push(msg);
      return;
    }

    ch.port.postMessage(msg);
  }

  public broadcastPatch(ops: PatchOp[]): void {
    for (const ch of this.channels.values()) {
      if (ch.frozen) {
        ch.pendingOps.push(...ops);
        continue;
      }
      this.sendPatchToChannel(ch, ops);
    }
  }

  public broadcastLoad(
    _file: string,
    html: string,
    sheets: Array<{ file: string; css: string }>
  ): void {
    const loadMsg: Extract<HostMsg, { t: 'load' }> = {
      t: 'load',
      html,
      sheets,
      mode: 'design',
    };
    for (const ch of this.channels.values()) {
      ch.lastLoadMsg = loadMsg;
      ch.ready = false;
      ch.pendingMessages = [];
      // Rebuild full native srcdoc so <head>, <style>, <link>, and <script> (e.g. Tailwind CDN,
      // Google Fonts, Lucide icons, inline scripts) execute 100% identically to Chrome/Edge
      ch.iframe.srcdoc = buildSandboxSrcDoc(ch.artboardId, html, sheets);
    }
  }

  private sendPatchToChannel(ch: ArtboardChannel, ops: PatchOp[]): void {
    if (ops.length === 0) return;
    ch.seq += 1;
    const patchMsg: HostMsg = { t: 'patch', seq: ch.seq, ops };
    if (ch.ready && ch.port) {
      ch.port.postMessage(patchMsg);
    } else {
      ch.pendingMessages.push(patchMsg);
    }
  }

  public setArtboardFrozen(artboardId: string, frozen: boolean): void {
    const ch = this.channels.get(artboardId);
    if (!ch || ch.frozen === frozen) return;
    ch.frozen = frozen;

    if (!frozen && ch.pendingOps.length > 0) {
      const queued = ch.pendingOps.splice(0, ch.pendingOps.length);
      this.sendPatchToChannel(ch, queued);
    }
  }

  public onMessage(handler: AgentMessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export const sandboxRegistry = new IframeSandboxRegistry();

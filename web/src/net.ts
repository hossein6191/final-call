// REST helpers and the live auction socket.
import { signLogin, type Identity } from './wallet.ts';

export async function api<T = any>(path: string, body?: object): Promise<T> {
  const res = await fetch(`/api${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

type Handler = (m: any) => void;

class Live {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private id: Identity | null = null;
  private ready: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  authed = false;

  connect(id: Identity) {
    this.id = id;
    if (this.ws && this.ws.readyState <= 1) return this.ready!;
    this.authed = false;
    this.ready = new Promise((r) => (this.resolveReady = r));
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === 'hello' && this.id) {
        ws.send(JSON.stringify({ type: 'auth', account: this.id.account, signature: signLogin(this.id, m.nonce) }));
        return;
      }
      if (m.type === 'auth:ok') {
        this.authed = true;
        this.resolveReady?.();
      }
      for (const h of this.handlers) h(m);
    };
    ws.onclose = () => {
      this.authed = false;
      for (const h of this.handlers) h({ type: 'socket:closed' });
      setTimeout(() => this.id && this.connect(this.id), 1500);
    };
    return this.ready;
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  async send(m: object) {
    if (!this.authed && this.id) await this.connect(this.id);
    this.ws?.send(JSON.stringify(m));
  }
}

export const live = new Live();

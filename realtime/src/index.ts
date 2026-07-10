import { DurableObject } from 'cloudflare:workers';

export class OrderHub extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		if (request.method === 'POST' && new URL(request.url).pathname === '/publish') {
			await this.publish(
				(await request.json()) as { type: string; orderId: string; version: number },
			);
			return new Response(null, { status: 204 });
		}
		if (request.headers.get('Upgrade') !== 'websocket')
			return new Response('Upgrade required', { status: 426 });
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	async publish(event: { type: string; orderId: string; version: number }): Promise<void> {
		const message = JSON.stringify(event);
		for (const socket of this.ctx.getWebSockets()) {
			try {
				socket.send(message);
			} catch {
				socket.close(1011, 'Send failed');
			}
		}
	}

	webSocketMessage(): void {
		/* counter clients receive invalidations only */
	}
	webSocketClose(socket: WebSocket, code: number, reason: string): void {
		socket.close(code, reason);
	}
}

export default { fetch: () => new Response('Not found', { status: 404 }) };

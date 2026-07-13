export async function audit(db: D1Database, actorId: string | undefined, action: string, targetType: string, targetId: string | undefined, detail: Record<string, unknown> = {}) {
	await db.prepare('INSERT INTO audit_log(id,actor_id,action,target_type,target_id,detail_json) VALUES(?,?,?,?,?,?)')
		.bind(crypto.randomUUID(), actorId ?? null, action, targetType, targetId ?? null, JSON.stringify(detail)).run();
}

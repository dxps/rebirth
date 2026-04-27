export type AuditEventId = string

export interface AuditEvent {
	id: AuditEventId
	name: string
	content: string
	createdAt: Date
}

export type CreateAuditEventInput = Omit<AuditEvent, 'id' | 'createdAt'>

export const auditEventModel = {
	entityName: 'AuditEvent',
	tableName: 'audit_events',
} as const

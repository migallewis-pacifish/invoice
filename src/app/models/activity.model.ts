export type ActivityChangeType = 'create' | 'update' | 'delete';

export interface ActivityRecord {
  id?: string;
  actorId: string;
  actorName: string;
  actorEmail?: string | null;
  changeType: ActivityChangeType;
  description: string;
  entityPath: string;
  createdAt: any;
}

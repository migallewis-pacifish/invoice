import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { collectionData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { ActivityChangeType, ActivityRecord } from '../models/activity.model';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly auth = inject(Auth);
  private readonly db = inject(Firestore);

  recent(companyId: string, maxItems = 10): Observable<ActivityRecord[]> {
    const activitiesRef = collection(this.db, `companies/${companyId}/activities`);
    const q = query(activitiesRef, orderBy('createdAt', 'desc'), limit(maxItems));
    return collectionData(q, { idField: 'id' }) as Observable<ActivityRecord[]>;
  }

  async track<T>(companyId: string, changeType: ActivityChangeType, entityPath: string, description: string, operation: () => Promise<T>): Promise<T> {
    const result = await operation();
    await this.record(companyId, changeType, entityPath, description);
    return result;
  }

  async record(companyId: string, changeType: ActivityChangeType, entityPath: string, description: string): Promise<void> {
    const user = this.auth.currentUser;
    const activitiesRef = collection(this.db, `companies/${companyId}/activities`);
    await addDoc(activitiesRef, {
      actorId: user?.uid ?? 'unknown',
      actorName: user?.displayName || user?.email || 'Unknown user',
      actorEmail: user?.email ?? null,
      changeType,
      description,
      entityPath,
      createdAt: serverTimestamp(),
    });
  }
}

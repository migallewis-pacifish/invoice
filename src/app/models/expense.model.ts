export interface Expense {
  id: string;
  month: string;          // "YYYY-MM"
  date: string;           // "YYYY-MM-DD"
  description: string;
  category: string;
  supplier?: string;
  amount: number;
  notes?: string;
  clientId?: string | null; // present for legacy records and client subcollection records during migration
  source?: 'company' | 'client' | 'legacyCompanyClient';
  createdAt?: any;
}

export type CreateExpense = Omit<Expense, 'id' | 'createdAt'>;

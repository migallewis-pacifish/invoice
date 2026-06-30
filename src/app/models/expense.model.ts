export interface Expense {
  id: string;
  month: string;          // "YYYY-MM"
  date: string;           // "YYYY-MM-DD"
  description: string;
  category: string;
  supplier?: string;
  amount: number;
  notes?: string;
  // TODO: Move client-specific expenses to companies/{companyId}/clients/{clientId}/expenses; keep company expenses separate.
  clientId?: string | null; // legacy optional link to client
  createdAt?: any;
}

export type CreateExpense = Omit<Expense, 'id' | 'createdAt'>;

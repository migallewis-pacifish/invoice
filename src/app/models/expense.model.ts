export interface Expense {
  id: string;
  month: string;          // "YYYY-MM"
  date: string;           // "YYYY-MM-DD"
  description: string;
  category: string;
  supplier?: string;
  amount: number;
  notes?: string;
  clientId?: string | null; // optional link to client
  createdAt?: any;
}

export type CreateExpense = Omit<Expense, 'id' | 'createdAt'>;

export interface AdminState {
  name: string | null;
  isAdmin: boolean;
}

export interface Trainee {
  name: string;
  phoneNumber: string;
  status: 'pending_join' | 'active' | 'completed';
  createdAt: Date;
  sandboxCode?: string;
  joinLink?: string;
  environment?: string;
  sessions?: number;
  membershipEndDate?: Date;
}

export interface AdminTempData {
  traineeName?: string;
  traineePhone?: string;
  sessions?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  hasMore?: boolean;
}

export interface TwilioMessage {
  sid: string;
  status: string;
  to: string;
}

export interface AdminOptions {
  message: string;
  state?: string;
  data?: AdminTempData;
}

export interface TraineeList {
  trainees: Trainee[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
} 
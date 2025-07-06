export interface AdminState {
  name: string | null;
  isAdmin: boolean;
}

export interface Trainee {
  name: string;
  phoneNumber: string;
  remainingSessions: number;
  status: string;
  createdAt: Date;
}

export interface AdminTempData {
  traineeName?: string;
  traineePhone?: string;
  sessions?: number;
  months?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  hasMore?: boolean;
  action?: string;
}

export interface TwilioMessage {
  From: string;
  Body: string;
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
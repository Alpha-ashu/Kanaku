export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  salary?: any;
  monthlyIncome?: any;
  dateOfBirth?: Date | string | null;
  jobType?: string | null;
  role: string;
  isApproved: boolean;
  createdAt: Date;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
  role?: 'user' | 'advisor'; // Default is 'user'
  phone?: string;
  mobile?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isApproved: boolean;
  };
}

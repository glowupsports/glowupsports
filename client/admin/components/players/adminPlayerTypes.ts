export type AdminPlayer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  ballLevel?: string;
  level?: number;
  coachName?: string;
  age?: number;
  dateOfBirth?: string;
  parentName?: string;
  parentPhone?: string;
  isActive?: boolean;
  status?: string;
};

export type AdminPlayerPackage = {
  id: string;
  creditType?: string;
  totalCredits?: number | string;
  remainingCredits?: number | string;
  remaining?: number | string;
  status?: string;
  expiryDate?: string | null;
  expiresAt?: string;
  createdAt?: string;
  pricePerCredit?: number;
  isPaid?: boolean;
  price?: number;
  packageName?: string;
};

export type AdminPlayerInvoice = {
  id: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  status: string;
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
  notes?: string;
  isOverdue: boolean;
};

export type AdminPlayerSessionItem = {
  id?: string;
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  sessionType?: string;
  attended?: string;
  attendanceStatus?: string | null;
  status?: string | null;
  courtId?: string | null;
  creditsUsed?: number;
  isPaid?: boolean;
  seriesId?: string | null;
  seriesName?: string | null;
};

export type AdminPlayerStats = {
  player: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    ballLevel?: string;
    level?: number;
    totalXp?: number;
    glowScore?: number;
    coachName?: string;
    parentName?: string;
    parentPhone?: string;
    medicalNotes?: string;
    dateOfBirth?: string | null;
  };
  attendance: {
    totalSessions: number;
    attended: number;
    missed: number;
    rate: number;
    streak: number;
  };
  progress: {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: {
      technical: number;
      tactical: number;
      physical: number;
      mental: number;
      social: number;
    };
    recentMilestones: string[];
  };
  payments: {
    totalOwed: number;
    totalPaid: number;
    lastPaymentDate?: string;
    status: string;
    currency: string;
    invoices: AdminPlayerInvoice[];
  };
  credits: {
    total: number;
    group: number;
    semiPrivate: number;
    private: number;
    activePackages: number;
    totalDebt: number;
    hasDebt: boolean;
  };
  packages: AdminPlayerPackage[];
  sessions: AdminPlayerSessionItem[];
};

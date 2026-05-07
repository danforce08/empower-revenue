import type { StageKey } from './constants';

export type Deal = {
  id: string;
  fullName: string;
  organization: string;
  customerStatus: string;
  projectStatus: string;
  ahj: string;
  branch: string;
  utility: string;
  city: string;
  state: string;

  createdAt: Date | null;
  cleanDealAt: Date | null;
  siteSurveyAt: Date | null;
  designAt: Date | null;
  permitSubmittedAt: Date | null;
  permitApprovedAt: Date | null;
  installScheduledAt: Date | null;
  installStartAt: Date | null;
  installCompletedAt: Date | null;
  ptoReceivedAt: Date | null;
  statusUpdatedAt: Date | null;

  daysInCurrentBucket: number | null;
  soldSize: number;
  soldPpw: number;

  stageDurations: Partial<Record<StageKey, number>>;
  daysSinceCreated: number | null;
  daysSinceCleanDeal: number | null;
  daysInStatus: number | null;
  isActive: boolean;
  isCancelled: boolean;
  isCompleted: boolean;
  isStuck: boolean;
};

export type ParseResult = {
  deals: Deal[];
  asOf: Date;
  partnerName: string;
  organizations: string[];
  branches: string[];
  utilities: string[];
  ahjs: string[];
};

export type Filters = {
  salesTeams: string[];
  branches: string[];
  utilities: string[];
  ahjs: string[];
  soldFrom: Date | null;
  soldTo: Date | null;
};

export const EMPTY_FILTERS: Filters = {
  salesTeams: [],
  branches: [],
  utilities: [],
  ahjs: [],
  soldFrom: null,
  soldTo: null,
};

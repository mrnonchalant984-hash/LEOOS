export type DashboardData = {
  user: { name: string; email: string };
  owner: boolean;
  plan: string;
  status: string;
  credits: number | string;
  counts: {
    conversations: number;
    memories: number;
    projects: number;
    websites: number;
    unreadNotifications: number;
  };
  projects: Array<{
    id: string;
    project_name: string;
    type: string | null;
    status: string | null;
    progress: number | null;
    created_at: string;
  }>;
  websites: Array<{
    id: string;
    business_name: string | null;
    website_type: string;
    status: string;
    live_url: string | null;
    updated_at: string;
  }>;
};

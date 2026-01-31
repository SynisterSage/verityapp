export type AlertRow = {
  id: string;
  alert_type: string;
  status: string;
  created_at: string;
  payload: any;
  call_id: string | null;
  risk_label?: string | null;
  risk_level?: string | null;
  processed?: boolean;
  feedback_status?: string | null;
  feedback_at?: string | null;
  feedback_by_user_id?: string | null;
  handled_by_name?: string | null;
};

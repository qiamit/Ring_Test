/**
 * App data types for Firestore documents.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ThicknessMeasurement {
  label: string;
  angle_deg: number;
  thickness_mm: number | null;
  inner_xy: [number, number] | null;
  outer_xy: [number, number] | null;
}

export interface AnalysisResults {
  sample_diameter_mm: number;
  mm_per_px: number;
  inner_circle: { cx: number; cy: number; r: number } | null;
  outer_circle: { cx: number; cy: number; r: number } | null;
  diameter_box: { x: number; y: number; w: number; h: number } | null;
  thickness_measurements: ThicknessMeasurement[];
  thickness_min_mm: number | null;
  thickness_max_mm: number | null;
  thickness_mean_mm: number | null;
  thickness_in_range: boolean | null;
  thickness_range_low_mm: number | null;
  thickness_range_high_mm: number | null;
  area_tm_mm2: number | null;
  area_fp_mm2: number | null;
  tm_area_fraction_percent: number | null;
  tm_area_share_in_range: boolean | null;
  overall_pass: boolean | null;
  observations?: string;
}

export interface TestRecord {
  id: string;
  user_id: string;
  sample_description: string | null;
  sample_diameter_mm: number;
  batch_number: string | null;
  mfg_date: string | null;
  tester_name: string;
  test_date: string;
  test_time: string;
  image_path: string | null;
  tenant_id: string | null;
  results: AnalysisResults;
  observations: string | null;
  created_at: string;
}

export interface SettingsRecord {
  user_id: string;
  mm_per_px_override: number | null;
  angular_correction_deg: number;
  units: "mm" | "inch";
  date_format: "yyyy-mm-dd" | "dd-mm-yyyy" | "mm-dd-yyyy";
  time_format: "24h" | "12h";
  inner_color: string;
  outer_color: string;
  diam_color: string;
  thick_color: string;
  inner_width: number;
  outer_width: number;
  diam_width: number;
  thick_width: number;
  thickness_outer_gap_px: number;
  thickness_inner_gap_px: number;
  company_logo_path: string | null;
  company_name: string | null;
  company_address: string | null;
  company_gst: string | null;
  company_email: string | null;
  company_contact_name: string | null;
  company_contact_phone: string | null;
  tenant_id: string | null;
  updated_at: string;
}

export interface CalibrationRecord {
  id: string;
  user_id: string;
  kind: "linear" | "angular";
  operator: string;
  reference_value: number;
  measured_value: number;
  result_value: number;
  notes: string | null;
  tenant_id: string | null;
  created_at: string;
}

export type OrganizationStatus = "pending" | "approved" | "hold" | "rejected";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string;
  owner_email: string | null;
  contact_name: string | null;
  status: OrganizationStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
}

export interface TenantMembershipRecord {
  tenant_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface UserProfileRecord {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use concrete record types; kept for gradual migration of imports. */
export type Database = {
  public: {
    Tables: {
      tests: { Row: TestRecord; Insert: Omit<TestRecord, "id" | "created_at"> & Partial<Pick<TestRecord, "id" | "created_at">>; Update: Partial<TestRecord> };
      settings: { Row: SettingsRecord; Insert: Partial<SettingsRecord> & { user_id: string }; Update: Partial<SettingsRecord> };
      calibrations: { Row: CalibrationRecord; Insert: Omit<CalibrationRecord, "id" | "created_at"> & Partial<Pick<CalibrationRecord, "id" | "created_at">>; Update: Partial<CalibrationRecord> };
      tenants: { Row: TenantRecord; Insert: Omit<TenantRecord, "id" | "created_at"> & Partial<Pick<TenantRecord, "id" | "created_at">>; Update: Partial<TenantRecord> };
      tenant_memberships: { Row: TenantMembershipRecord; Insert: TenantMembershipRecord; Update: Partial<TenantMembershipRecord> };
      user_profiles: { Row: UserProfileRecord; Insert: Partial<UserProfileRecord> & { user_id: string }; Update: Partial<UserProfileRecord> };
    };
  };
};

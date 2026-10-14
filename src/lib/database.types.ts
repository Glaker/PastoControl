// Archivo generado con el MCP de Supabase (generate_typescript_types). No editar a mano:
// se regenera en cada fase que cambia el esquema.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          attempt: number
          created_at: string
          cutter_id: string
          edits: number
          id: string
          job_id: string
          proposed_at: string | null
          proposed_price_ars: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          cutter_id: string
          edits?: number
          id?: string
          job_id: string
          proposed_at?: string | null
          proposed_price_ars?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          cutter_id?: string
          edits?: number
          id?: string
          job_id?: string
          proposed_at?: string | null
          proposed_price_ars?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_cutter_id_fkey"
            columns: ["cutter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_agreements: {
        Row: {
          agreed_at: string
          application_id: string
          assigned_at: string
          cancelled_by: string | null
          client_id: string
          cutter_id: string
          done_at: string | null
          done_by: string | null
          job_id: string
          price_ars: number
        }
        Insert: {
          agreed_at: string
          application_id: string
          assigned_at?: string
          cancelled_by?: string | null
          client_id: string
          cutter_id: string
          done_at?: string | null
          done_by?: string | null
          job_id: string
          price_ars: number
        }
        Update: {
          agreed_at?: string
          application_id?: string
          assigned_at?: string
          cancelled_by?: string | null
          client_id?: string
          cutter_id?: string
          done_at?: string | null
          done_by?: string | null
          job_id?: string
          price_ars?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_agreements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_cutter_id_fkey"
            columns: ["cutter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_private: {
        Row: {
          address: string
          job_id: string
          updated_at: string
        }
        Insert: {
          address: string
          job_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          job_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_private_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          created_at: string
          desired_at: string
          id: string
          locality_id: number
          notes: string | null
          photo_paths: string[]
          price_ars: number
          republished_from: string | null
          status: string
          updated_at: string
          zone: string
          is_expired: boolean | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          created_at?: string
          desired_at: string
          id?: string
          locality_id: number
          notes?: string | null
          photo_paths?: string[]
          price_ars: number
          republished_from?: string | null
          status?: string
          updated_at?: string
          zone: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          created_at?: string
          desired_at?: string
          id?: string
          locality_id?: number
          notes?: string | null
          photo_paths?: string[]
          price_ars?: number
          republished_from?: string | null
          status?: string
          updated_at?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_republished_from_fkey"
            columns: ["republished_from"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      localities: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          phone_area_code: string
          province: string
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          phone_area_code: string
          province: string
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          phone_area_code?: string
          province?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          application_id: string | null
          created_at: string
          dedupe_key: string
          id: string
          job_id: string | null
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          job_id?: string | null
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          job_id?: string | null
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          created_at: string
          job_id: string
          ratee_id: string
          rater_id: string
          would_work_again: boolean
        }
        Insert: {
          created_at?: string
          job_id: string
          ratee_id: string
          rater_id: string
          would_work_again: boolean
        }
        Update: {
          created_at?: string
          job_id?: string
          ratee_id?: string
          rater_id?: string
          would_work_again?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ratings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          last_name: string
          phone_e164: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_name: string
          phone_e164: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_name?: string
          phone_e164?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          first_name: string
          id: string
          is_client: boolean
          is_cutter: boolean
          last_initial: string
          locality_id: number
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          first_name: string
          id: string
          is_client?: boolean
          is_cutter?: boolean
          last_initial: string
          locality_id: number
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          first_name?: string
          id?: string
          is_client?: boolean
          is_cutter?: boolean
          last_initial?: string
          locality_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_application: {
        Args: { p_application_id: string; p_expected_updated_at: string }
        Returns: undefined
      }
      apply_to_job: {
        Args: {
          p_job_id: string
          p_proposed_at?: string
          p_proposed_price_ars?: number
        }
        Returns: string
      }
      cancel_job: { Args: { p_job_id: string }; Returns: undefined }
      create_job: {
        Args: {
          p_address: string
          p_desired_at: string
          p_id: string
          p_notes?: string
          p_photo_paths?: string[]
          p_price_ars: number
          p_republished_from?: string
          p_zone: string
        }
        Returns: string
      }
      get_job_applicants: {
        Args: { p_job_id: string }
        Returns: {
          application_id: string
          avatar_path: string
          created_at: string
          cutter_id: string
          done_jobs: number
          first_name: string
          last_initial: string
          proposed_at: string
          proposed_price_ars: number
          status: string
          updated_at: string
          yes_pct: number
        }[]
      }
      get_job_contact: {
        Args: { p_job_id: string }
        Returns: {
          address: string
          agreed_at: string
          agreed_price_ars: number
          counterpart_role: string
          first_name: string
          last_name: string
          phone_e164: string
        }[]
      }
      get_profile_stats: {
        Args: { p_user_id: string }
        Returns: {
          done_as_client: number
          done_as_cutter: number
          yes_pct: number
        }[]
      }
      has_rated_job: { Args: { p_job_id: string }; Returns: boolean }
      is_expired: {
        Args: { "": Database["public"]["Tables"]["jobs"]["Row"] }
        Returns: {
          error: true
        } & "the function public.is_expired with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      mark_job_done: { Args: { p_job_id: string }; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      rate_job: {
        Args: { p_job_id: string; p_would_work_again: boolean }
        Returns: undefined
      }
      update_application: {
        Args: {
          p_application_id: string
          p_proposed_at?: string
          p_proposed_price_ars?: number
        }
        Returns: undefined
      }
      update_job: {
        Args: {
          p_address: string
          p_desired_at: string
          p_job_id: string
          p_notes?: string
          p_photo_paths?: string[]
          p_price_ars: number
          p_zone: string
        }
        Returns: undefined
      }
      upsert_my_profile: {
        Args: {
          p_avatar_path?: string
          p_first_name: string
          p_is_client: boolean
          p_is_cutter: boolean
          p_last_name: string
          p_locality_id: number
          p_phone_e164: string
        }
        Returns: undefined
      }
      withdraw_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

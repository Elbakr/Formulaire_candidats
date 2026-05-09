export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type AppRole = "admin" | "rh" | "manager" | "candidate";
export type ApplicationStatus =
  | "new"
  | "contacted"
  | "rdv_scheduled"
  | "rdv_done"
  | "wait_decision"
  | "hired"
  | "refused";
export type InterviewType = "phone" | "video" | "onsite";
export type InterviewStatus = "scheduled" | "done" | "cancelled" | "no_show";
export type DocumentKind = "cv" | "cover_letter" | "id_card" | "diploma" | "other";
export type MessageDirection = "outbound" | "inbound";

export type Database = {
  public: {
    Tables: {
      departments: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: Partial<{ id: string; name: string; created_at: string }>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: AppRole;
          department_id: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: AppRole;
          department_id?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          email: string;
          full_name: string | null;
          role: AppRole;
          department_id: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      jobs: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          department_id: string | null;
          location: string | null;
          contract_type: string | null;
          is_open: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          department_id?: string | null;
          location?: string | null;
          contract_type?: string | null;
          is_open?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
      };
      candidates: {
        Row: {
          id: string;
          profile_id: string | null;
          email: string;
          full_name: string;
          phone: string | null;
          birth_date: string | null;
          nrn: string | null;
          address: string | null;
          city: string | null;
          postal_code: string | null;
          country: string | null;
          source: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          email: string;
          full_name: string;
          phone?: string | null;
          birth_date?: string | null;
          nrn?: string | null;
          address?: string | null;
          city?: string | null;
          postal_code?: string | null;
          country?: string | null;
          source?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
      };
      applications: {
        Row: {
          id: string;
          candidate_id: string;
          job_id: string | null;
          status: ApplicationStatus;
          rating: number | null;
          assigned_manager: string | null;
          motivation: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          job_id?: string | null;
          status?: ApplicationStatus;
          rating?: number | null;
          assigned_manager?: string | null;
          motivation?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Insert"]>;
      };
      interviews: {
        Row: {
          id: string;
          application_id: string;
          scheduled_at: string;
          duration_min: number;
          type: InterviewType;
          status: InterviewStatus;
          location: string | null;
          meeting_url: string | null;
          interviewer: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          scheduled_at: string;
          duration_min?: number;
          type?: InterviewType;
          status?: InterviewStatus;
          location?: string | null;
          meeting_url?: string | null;
          interviewer?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interviews"]["Insert"]>;
      };
      notes: {
        Row: {
          id: string;
          application_id: string;
          author_id: string | null;
          body: string;
          is_private: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          author_id?: string | null;
          body: string;
          is_private?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          application_id: string;
          direction: MessageDirection;
          subject: string | null;
          body: string;
          sender_id: string | null;
          email_provider_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          direction: MessageDirection;
          subject?: string | null;
          body: string;
          sender_id?: string | null;
          email_provider_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      documents: {
        Row: {
          id: string;
          application_id: string;
          kind: DocumentKind;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          kind?: DocumentKind;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
      };
    };
    Enums: {
      app_role: AppRole;
      application_status: ApplicationStatus;
      interview_type: InterviewType;
      interview_status: InterviewStatus;
      document_kind: DocumentKind;
      message_direction: MessageDirection;
    };
  };
};

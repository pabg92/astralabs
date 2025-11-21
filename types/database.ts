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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      admin_review_queue: {
        Row: {
          clause_boundary_id: string | null
          confidence_score: number | null
          corrected_clause_type: string | null
          corrected_text: string | null
          correction_reason: string | null
          created_at: string | null
          document_id: string
          flagged_at: string | null
          flagged_by: string | null
          id: string
          issue_description: string | null
          metadata: Json | null
          original_clause_type: string | null
          original_text: string | null
          priority: string | null
          review_data: Json | null
          review_notes: string | null
          review_type: string
          reviewed_at: string | null
          reviewer_id: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          clause_boundary_id?: string | null
          confidence_score?: number | null
          corrected_clause_type?: string | null
          corrected_text?: string | null
          correction_reason?: string | null
          created_at?: string | null
          document_id: string
          flagged_at?: string | null
          flagged_by?: string | null
          id?: string
          issue_description?: string | null
          metadata?: Json | null
          original_clause_type?: string | null
          original_text?: string | null
          priority?: string | null
          review_data?: Json | null
          review_notes?: string | null
          review_type: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          clause_boundary_id?: string | null
          confidence_score?: number | null
          corrected_clause_type?: string | null
          corrected_text?: string | null
          correction_reason?: string | null
          created_at?: string | null
          document_id?: string
          flagged_at?: string | null
          flagged_by?: string | null
          id?: string
          issue_description?: string | null
          metadata?: Json | null
          original_clause_type?: string | null
          original_text?: string | null
          priority?: string | null
          review_data?: Json | null
          review_notes?: string | null
          review_type?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_review_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_boundaries: {
        Row: {
          bounding_boxes: Json | null
          bounding_regions: Json | null
          clause_type: string | null
          confidence: number | null
          content: string | null
          created_at: string | null
          document_id: string | null
          end_page: number | null
          id: string
          parsing_issues: Json | null
          parsing_quality: number | null
          start_page: number | null
          tenant_id: string | null
        }
        Insert: {
          bounding_boxes?: Json | null
          bounding_regions?: Json | null
          clause_type?: string | null
          confidence?: number | null
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          end_page?: number | null
          id?: string
          parsing_issues?: Json | null
          parsing_quality?: number | null
          start_page?: number | null
          tenant_id?: string | null
        }
        Update: {
          bounding_boxes?: Json | null
          bounding_regions?: Json | null
          clause_type?: string | null
          confidence?: number | null
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          end_page?: number | null
          id?: string
          parsing_issues?: Json | null
          parsing_quality?: number | null
          start_page?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_boundaries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_boundaries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_pii_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "clause_boundaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_comparisons: {
        Row: {
          clause_boundary_id: string | null
          created_at: string | null
          document_id: string
          id: string
          library_clause_id: string | null
          match_metadata: Json | null
          match_reason: string | null
          similarity_score: number
        }
        Insert: {
          clause_boundary_id?: string | null
          created_at?: string | null
          document_id: string
          id?: string
          library_clause_id?: string | null
          match_metadata?: Json | null
          match_reason?: string | null
          similarity_score: number
        }
        Update: {
          clause_boundary_id?: string | null
          created_at?: string | null
          document_id?: string
          id?: string
          library_clause_id?: string | null
          match_metadata?: Json | null
          match_reason?: string | null
          similarity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "clause_comparisons_library_clause_id_fkey"
            columns: ["library_clause_id"]
            isOneToOne: false
            referencedRelation: "legal_clause_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_comparisons_library_clause_id_fkey"
            columns: ["library_clause_id"]
            isOneToOne: false
            referencedRelation: "v_new_clauses_pending_review"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_deduplication_clusters: {
        Row: {
          cluster_id: string
          created_at: string | null
          dismissal_reason: string | null
          duplicate_clause_ids: string[]
          id: string
          merge_status: string | null
          merge_strategy: string | null
          merged_at: string | null
          merged_by: string | null
          primary_clause_id: string | null
          similarity_scores: number[]
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          cluster_id: string
          created_at?: string | null
          dismissal_reason?: string | null
          duplicate_clause_ids: string[]
          id?: string
          merge_status?: string | null
          merge_strategy?: string | null
          merged_at?: string | null
          merged_by?: string | null
          primary_clause_id?: string | null
          similarity_scores: number[]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cluster_id?: string
          created_at?: string | null
          dismissal_reason?: string | null
          duplicate_clause_ids?: string[]
          id?: string
          merge_status?: string | null
          merge_strategy?: string | null
          merged_at?: string | null
          merged_by?: string | null
          primary_clause_id?: string | null
          similarity_scores?: number[]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_deduplication_clusters_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_deduplication_clusters_primary_clause_id_fkey"
            columns: ["primary_clause_id"]
            isOneToOne: false
            referencedRelation: "legal_clause_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_deduplication_clusters_primary_clause_id_fkey"
            columns: ["primary_clause_id"]
            isOneToOne: false
            referencedRelation: "v_new_clauses_pending_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_deduplication_clusters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_embeddings: {
        Row: {
          content_hash: string
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          source_id: string
          source_type: Database["public"]["Enums"]["clause_source_type"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          content_hash: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source_id: string
          source_type: Database["public"]["Enums"]["clause_source_type"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          content_hash?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["clause_source_type"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_match_results: {
        Row: {
          clause_boundary_id: string | null
          coordinates: Json | null
          created_at: string | null
          discrepancy_count: number | null
          document_id: string
          gpt_analysis: Json | null
          id: string
          matched_template_id: string | null
          previous_rag_status: Database["public"]["Enums"]["rag_status"] | null
          rag_parsing: Database["public"]["Enums"]["rag_status"] | null
          rag_risk: Database["public"]["Enums"]["rag_status"] | null
          rag_status: Database["public"]["Enums"]["rag_status"]
          risk_assessment: Json | null
          similarity_score: number | null
          standardization_id: string | null
          update_reason: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          clause_boundary_id?: string | null
          coordinates?: Json | null
          created_at?: string | null
          discrepancy_count?: number | null
          document_id: string
          gpt_analysis?: Json | null
          id?: string
          matched_template_id?: string | null
          previous_rag_status?: Database["public"]["Enums"]["rag_status"] | null
          rag_parsing?: Database["public"]["Enums"]["rag_status"] | null
          rag_risk?: Database["public"]["Enums"]["rag_status"] | null
          rag_status?: Database["public"]["Enums"]["rag_status"]
          risk_assessment?: Json | null
          similarity_score?: number | null
          standardization_id?: string | null
          update_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          clause_boundary_id?: string | null
          coordinates?: Json | null
          created_at?: string | null
          discrepancy_count?: number | null
          document_id?: string
          gpt_analysis?: Json | null
          id?: string
          matched_template_id?: string | null
          previous_rag_status?: Database["public"]["Enums"]["rag_status"] | null
          rag_parsing?: Database["public"]["Enums"]["rag_status"] | null
          rag_risk?: Database["public"]["Enums"]["rag_status"] | null
          rag_status?: Database["public"]["Enums"]["rag_status"]
          risk_assessment?: Json | null
          similarity_score?: number | null
          standardization_id?: string | null
          update_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_match_results_matched_template_id_fkey"
            columns: ["matched_template_id"]
            isOneToOne: false
            referencedRelation: "legal_clause_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_match_results_matched_template_id_fkey"
            columns: ["matched_template_id"]
            isOneToOne: false
            referencedRelation: "v_new_clauses_pending_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_match_results_standardization_id_fkey"
            columns: ["standardization_id"]
            isOneToOne: false
            referencedRelation: "legal_clause_standardization"
            referencedColumns: ["standardization_id"]
          },
          {
            foreignKeyName: "clause_match_results_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_reviews: {
        Row: {
          clause_boundary_id: string
          comments: string | null
          created_at: string
          decision: string
          document_id: string
          id: string
          reviewer_email: string | null
          reviewer_id: string
          reviewer_name: string | null
          suggested_changes: string | null
          updated_at: string
        }
        Insert: {
          clause_boundary_id: string
          comments?: string | null
          created_at?: string
          decision: string
          document_id: string
          id?: string
          reviewer_email?: string | null
          reviewer_id: string
          reviewer_name?: string | null
          suggested_changes?: string | null
          updated_at?: string
        }
        Update: {
          clause_boundary_id?: string
          comments?: string | null
          created_at?: string
          decision?: string
          document_id?: string
          id?: string
          reviewer_email?: string | null
          reviewer_id?: string
          reviewer_name?: string | null
          suggested_changes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clause_reviews_clause_boundary_id_fkey"
            columns: ["clause_boundary_id"]
            isOneToOne: false
            referencedRelation: "clause_boundaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_pii_summary"
            referencedColumns: ["document_id"]
          },
        ]
      }
      clause_templates: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          is_preferred: boolean | null
          library_clause_id: string | null
          standardization_id: string | null
          usage_count: number | null
          variation_name: string | null
          variation_text: string
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_preferred?: boolean | null
          library_clause_id?: string | null
          standardization_id?: string | null
          usage_count?: number | null
          variation_name?: string | null
          variation_text: string
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_preferred?: boolean | null
          library_clause_id?: string | null
          standardization_id?: string | null
          usage_count?: number | null
          variation_name?: string | null
          variation_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "clause_templates_library_clause_id_fkey"
            columns: ["library_clause_id"]
            isOneToOne: false
            referencedRelation: "legal_clause_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_templates_library_clause_id_fkey"
            columns: ["library_clause_id"]
            isOneToOne: false
            referencedRelation: "v_new_clauses_pending_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_templates_standardization_id_fkey"
            columns: ["standardization_id"]
            isOneToOne: false
            referencedRelation: "legal_clause_standardization"
            referencedColumns: ["standardization_id"]
          },
        ]
      }
      clause_update_history: {
        Row: {
          change_type: string
          changed_by: string | null
          clause_match_result_id: string | null
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          reason_code: string | null
          reason_description: string | null
          version: number
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          clause_match_result_id?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason_code?: string | null
          reason_description?: string | null
          version: number
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          clause_match_result_id?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason_code?: string | null
          reason_description?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clause_update_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_update_history_clause_match_result_id_fkey"
            columns: ["clause_match_result_id"]
            isOneToOne: false
            referencedRelation: "clause_match_results"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_templates: {
        Row: {
          comment_text: string
          created_at: string | null
          discrepancy_type:
            | Database["public"]["Enums"]["discrepancy_type"]
            | null
          display_icon: string | null
          id: string
          rag_status: Database["public"]["Enums"]["rag_status"]
          requires_legal_review: boolean | null
          severity: string | null
          template_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string | null
          discrepancy_type?:
            | Database["public"]["Enums"]["discrepancy_type"]
            | null
          display_icon?: string | null
          id?: string
          rag_status: Database["public"]["Enums"]["rag_status"]
          requires_legal_review?: boolean | null
          severity?: string | null
          template_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string | null
          discrepancy_type?:
            | Database["public"]["Enums"]["discrepancy_type"]
            | null
          display_icon?: string | null
          id?: string
          rag_status?: Database["public"]["Enums"]["rag_status"]
          requires_legal_review?: boolean | null
          severity?: string | null
          template_id?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          client_name: string
          created_at: string
          created_by: string
          currency: string
          document_id: string | null
          end_date: string
          id: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          talent_name: string
          tenant_id: string | null
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          client_name: string
          created_at?: string
          created_by: string
          currency?: string
          document_id?: string | null
          end_date: string
          id?: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          talent_name: string
          tenant_id?: string | null
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          client_name?: string
          created_at?: string
          created_by?: string
          currency?: string
          document_id?: string | null
          end_date?: string
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          talent_name?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contracts_document_id"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contracts_document_id"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_pii_summary"
            referencedColumns: ["document_id"]
          },
        ]
      }
      deals: {
        Row: {
          client_name: string
          created_at: string | null
          created_by: string
          currency: string | null
          description: string | null
          end_date: string | null
          id: string
          monday_item_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["deal_status"] | null
          talent_name: string
          tenant_id: string
          title: string
          updated_at: string | null
          value: number | null
          version: number | null
        }
        Insert: {
          client_name: string
          created_at?: string | null
          created_by: string
          currency?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          monday_item_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          talent_name: string
          tenant_id: string
          title: string
          updated_at?: string | null
          value?: number | null
          version?: number | null
        }
        Update: {
          client_name?: string
          created_at?: string | null
          created_by?: string
          currency?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          monday_item_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          talent_name?: string
          tenant_id?: string
          title?: string
          updated_at?: string | null
          value?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discrepancies: {
        Row: {
          affected_text: string | null
          comment_template_id: string | null
          coordinates: Json | null
          created_at: string | null
          description: string
          discrepancy_type: Database["public"]["Enums"]["discrepancy_type"]
          document_id: string
          id: string
          is_resolved: boolean | null
          match_result_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          suggested_action: string | null
        }
        Insert: {
          affected_text?: string | null
          comment_template_id?: string | null
          coordinates?: Json | null
          created_at?: string | null
          description: string
          discrepancy_type: Database["public"]["Enums"]["discrepancy_type"]
          document_id: string
          id?: string
          is_resolved?: boolean | null
          match_result_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          suggested_action?: string | null
        }
        Update: {
          affected_text?: string | null
          comment_template_id?: string | null
          coordinates?: Json | null
          created_at?: string | null
          description?: string
          discrepancy_type?: Database["public"]["Enums"]["discrepancy_type"]
          document_id?: string
          id?: string
          is_resolved?: boolean | null
          match_result_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          suggested_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discrepancies_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "clause_match_results"
            referencedColumns: ["id"]
          },
        ]
      }
      document_repository: {
        Row: {
          contract_id: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          mime_type: string
          object_path: string
          original_filename: string
          pii_detected: boolean | null
          pii_entity_count: number | null
          pii_redacted: boolean | null
          pii_scan_completed_at: string | null
          processing_status:
            | Database["public"]["Enums"]["document_status"]
            | null
          size_bytes: number
          tenant_id: string
          version: number | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          mime_type: string
          object_path: string
          original_filename: string
          pii_detected?: boolean | null
          pii_entity_count?: number | null
          pii_redacted?: boolean | null
          pii_scan_completed_at?: string | null
          processing_status?:
            | Database["public"]["Enums"]["document_status"]
            | null
          size_bytes: number
          tenant_id: string
          version?: number | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string
          object_path?: string
          original_filename?: string
          pii_detected?: boolean | null
          pii_entity_count?: number | null
          pii_redacted?: boolean | null
          pii_scan_completed_at?: string | null
          processing_status?:
            | Database["public"]["Enums"]["document_status"]
            | null
          size_bytes?: number
          tenant_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_repository_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_repository_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_repository_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_clause_library: {
        Row: {
          active: boolean | null
          category: Database["public"]["Enums"]["clause_category"]
          clause_id: string
          clause_type: string
          created_at: string | null
          created_by: string | null
          embedding: string | null
          factual_correctness_score: number | null
          id: string
          is_required: boolean | null
          metadata: Json | null
          new_clause_flag: boolean
          risk_level: Database["public"]["Enums"]["risk_level"]
          standard_text: string
          tags: string[] | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          active?: boolean | null
          category: Database["public"]["Enums"]["clause_category"]
          clause_id: string
          clause_type: string
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          factual_correctness_score?: number | null
          id?: string
          is_required?: boolean | null
          metadata?: Json | null
          new_clause_flag?: boolean
          risk_level?: Database["public"]["Enums"]["risk_level"]
          standard_text: string
          tags?: string[] | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          active?: boolean | null
          category?: Database["public"]["Enums"]["clause_category"]
          clause_id?: string
          clause_type?: string
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          factual_correctness_score?: number | null
          id?: string
          is_required?: boolean | null
          metadata?: Json | null
          new_clause_flag?: boolean
          risk_level?: Database["public"]["Enums"]["risk_level"]
          standard_text?: string
          tags?: string[] | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      legal_clause_standardization: {
        Row: {
          ai_notes: string | null
          category: Database["public"]["Enums"]["clause_category"]
          clause_ids: string[]
          clause_synonyms: string[] | null
          clause_type: string
          created_at: string | null
          id: string
          plain_english_summary: string | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          standardization_id: string
          standardized_clause: string
          updated_at: string | null
          variation_tolerance: string | null
        }
        Insert: {
          ai_notes?: string | null
          category: Database["public"]["Enums"]["clause_category"]
          clause_ids: string[]
          clause_synonyms?: string[] | null
          clause_type: string
          created_at?: string | null
          id?: string
          plain_english_summary?: string | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          standardization_id: string
          standardized_clause: string
          updated_at?: string | null
          variation_tolerance?: string | null
        }
        Update: {
          ai_notes?: string | null
          category?: Database["public"]["Enums"]["clause_category"]
          clause_ids?: string[]
          clause_synonyms?: string[] | null
          clause_type?: string
          created_at?: string | null
          id?: string
          plain_english_summary?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          standardization_id?: string
          standardized_clause?: string
          updated_at?: string | null
          variation_tolerance?: string | null
        }
        Relationships: []
      }
      parsing_lessons: {
        Row: {
          applied_at: string | null
          applied_count: number | null
          applied_to_model: boolean | null
          clause_type: string | null
          corrected_text: string | null
          correction_metadata: Json | null
          created_at: string | null
          created_by: string | null
          document_context: string | null
          document_id: string | null
          id: string
          lesson_notes: string | null
          lesson_type: string | null
          original_text: string
          review_queue_id: string | null
          tenant_id: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_count?: number | null
          applied_to_model?: boolean | null
          clause_type?: string | null
          corrected_text?: string | null
          correction_metadata?: Json | null
          created_at?: string | null
          created_by?: string | null
          document_context?: string | null
          document_id?: string | null
          id?: string
          lesson_notes?: string | null
          lesson_type?: string | null
          original_text: string
          review_queue_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_count?: number | null
          applied_to_model?: boolean | null
          clause_type?: string | null
          corrected_text?: string | null
          correction_metadata?: Json | null
          created_at?: string | null
          created_by?: string | null
          document_context?: string | null
          document_id?: string | null
          id?: string
          lesson_notes?: string | null
          lesson_type?: string | null
          original_text?: string
          review_queue_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parsing_lessons_review_queue_id_fkey"
            columns: ["review_queue_id"]
            isOneToOne: false
            referencedRelation: "admin_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsing_lessons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_entities: {
        Row: {
          access_count: number | null
          accessed_at: string | null
          accessed_by: string | null
          confidence_score: number | null
          created_at: string | null
          deal_id: string | null
          detected_by: string | null
          document_id: string | null
          entity_type: string
          entity_value: string
          id: string
          location_data: Json | null
          redaction_token: string
          tenant_id: string | null
        }
        Insert: {
          access_count?: number | null
          accessed_at?: string | null
          accessed_by?: string | null
          confidence_score?: number | null
          created_at?: string | null
          deal_id?: string | null
          detected_by?: string | null
          document_id?: string | null
          entity_type: string
          entity_value: string
          id?: string
          location_data?: Json | null
          redaction_token: string
          tenant_id?: string | null
        }
        Update: {
          access_count?: number | null
          accessed_at?: string | null
          accessed_by?: string | null
          confidence_score?: number | null
          created_at?: string | null
          deal_id?: string | null
          detected_by?: string | null
          document_id?: string | null
          entity_type?: string
          entity_value?: string
          id?: string
          location_data?: Json | null
          redaction_token?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pii_entities_accessed_by_fkey"
            columns: ["accessed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pii_entities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pii_entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pii_entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_pii_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "pii_entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_agreed_terms: {
        Row: {
          agreed_at: string | null
          agreed_by: string | null
          created_at: string | null
          deal_id: string | null
          expected_value: string | null
          id: string
          is_mandatory: boolean | null
          related_clause_types: string[] | null
          tenant_id: string | null
          term_category: string
          term_description: string
          updated_at: string | null
        }
        Insert: {
          agreed_at?: string | null
          agreed_by?: string | null
          created_at?: string | null
          deal_id?: string | null
          expected_value?: string | null
          id?: string
          is_mandatory?: boolean | null
          related_clause_types?: string[] | null
          tenant_id?: string | null
          term_category: string
          term_description: string
          updated_at?: string | null
        }
        Update: {
          agreed_at?: string | null
          agreed_by?: string | null
          created_at?: string | null
          deal_id?: string | null
          expected_value?: string | null
          id?: string
          is_mandatory?: boolean | null
          related_clause_types?: string[] | null
          tenant_id?: string | null
          term_category?: string
          term_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_agreed_terms_agreed_by_fkey"
            columns: ["agreed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_agreed_terms_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_comments: {
        Row: {
          clause_boundary_id: string | null
          comment_text: string
          comment_type: string | null
          created_at: string | null
          created_by: string
          discrepancy_id: string | null
          document_id: string
          id: string
          parent_comment_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          template_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          clause_boundary_id?: string | null
          comment_text: string
          comment_type?: string | null
          created_at?: string | null
          created_by: string
          discrepancy_id?: string | null
          document_id: string
          id?: string
          parent_comment_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          template_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          clause_boundary_id?: string | null
          comment_text?: string
          comment_type?: string | null
          created_at?: string | null
          created_by?: string
          discrepancy_id?: string | null
          document_id?: string
          id?: string
          parent_comment_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          template_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_comments_clause_boundary_id_fkey"
            columns: ["clause_boundary_id"]
            isOneToOne: false
            referencedRelation: "clause_boundaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_comments_discrepancy_id_fkey"
            columns: ["discrepancy_id"]
            isOneToOne: false
            referencedRelation: "discrepancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_pii_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "reconciliation_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_plan: string | null
          created_at: string | null
          id: string
          monday_access_token: string | null
          monday_board_id: string | null
          monday_field_mapping: Json | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          billing_plan?: string | null
          created_at?: string | null
          id?: string
          monday_access_token?: string | null
          monday_board_id?: string | null
          monday_field_mapping?: Json | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          billing_plan?: string | null
          created_at?: string | null
          id?: string
          monday_access_token?: string | null
          monday_board_id?: string | null
          monday_field_mapping?: Json | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          clerk_user_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          clerk_user_id: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          clerk_user_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          board_id: string | null
          event_type: string
          expires_at: string | null
          id: string
          item_id: string | null
          processed_at: string | null
          trigger_uuid: string
        }
        Insert: {
          board_id?: string | null
          event_type: string
          expires_at?: string | null
          id?: string
          item_id?: string | null
          processed_at?: string | null
          trigger_uuid: string
        }
        Update: {
          board_id?: string | null
          event_type?: string
          expires_at?: string | null
          id?: string
          item_id?: string | null
          processed_at?: string | null
          trigger_uuid?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_dedup_review_queue: {
        Row: {
          avg_similarity: number | null
          cluster_id: string | null
          created_at: string | null
          duplicate_clause_ids: string[] | null
          id: string | null
          merge_status: string | null
          min_similarity: number | null
          primary_clause_id: string | null
          primary_clause_type: string | null
          primary_text: string | null
          review_priority: string | null
          similarity_scores: number[] | null
        }
        Relationships: []
      }
      v_embedding_statistics: {
        Row: {
          embedded_clauses: number | null
          embedding_coverage_pct: number | null
          missing_embeddings: number | null
          total_clauses: number | null
        }
        Relationships: []
      }
      v_new_clauses_pending_review: {
        Row: {
          category: Database["public"]["Enums"]["clause_category"] | null
          clause_id: string | null
          clause_type: string | null
          created_at: string | null
          factual_correctness_score: number | null
          id: string | null
          review_priority: string | null
          risk_level: Database["public"]["Enums"]["risk_level"] | null
          standard_text: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["clause_category"] | null
          clause_id?: string | null
          clause_type?: string | null
          created_at?: string | null
          factual_correctness_score?: number | null
          id?: string | null
          review_priority?: never
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          standard_text?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["clause_category"] | null
          clause_id?: string | null
          clause_type?: string | null
          created_at?: string | null
          factual_correctness_score?: number | null
          id?: string | null
          review_priority?: never
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          standard_text?: string | null
        }
        Relationships: []
      }
      v_pii_summary: {
        Row: {
          document_id: string | null
          entity_count: number | null
          entity_type: string | null
          max_confidence: number | null
          min_confidence: number | null
          original_filename: string | null
          pii_detected: boolean | null
          pii_entity_count: number | null
          pii_scan_completed_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_merge_duplicates: {
        Args: never
        Returns: {
          cluster_id: string
          merged_count: number
          primary_clause_id: string
        }[]
      }
      batch_generate_embeddings: {
        Args: never
        Returns: {
          clause_id: string
          needs_embedding: boolean
        }[]
      }
      calculate_compliance_score: {
        Args: { p_document_id: string }
        Returns: {
          amber_count: number
          compliance_percentage: number
          green_count: number
          red_count: number
          risk_score: number
          total_clauses: number
        }[]
      }
      cleanup_expired_webhook_events: { Args: never; Returns: number }
      create_comment_from_template: {
        Args: {
          p_clause_boundary_id?: string
          p_discrepancy_id: string
          p_document_id: string
          p_template_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      create_user_profile: {
        Args: {
          p_avatar_url?: string
          p_clerk_user_id: string
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: {
          avatar_url: string | null
          clerk_user_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_duplicate_clusters: {
        Args: { batch_size?: number; min_similarity?: number }
        Returns: {
          duplicate_ids: string[]
          primary_clause_id: string
          primary_clause_text: string
          similarity_scores: number[]
        }[]
      }
      find_similar_clauses:
        | {
            Args: {
              max_results?: number
              p_tenant_id?: string
              query_embedding: string
              similarity_threshold?: number
            }
            Returns: {
              category: string
              clause_id: string
              clause_type: string
              id: string
              match_category: string
              risk_level: string
              similarity: number
              standard_text: string
            }[]
          }
        | {
            Args: {
              p_embedding: string
              p_limit?: number
              p_threshold?: number
            }
            Returns: {
              clause_id: string
              similarity: number
            }[]
          }
      generate_cluster_id: { Args: never; Returns: string }
      get_comment_stats: {
        Args: { p_document_id: string }
        Returns: {
          archived_comments: number
          open_comments: number
          resolved_comments: number
          system_comments: number
          template_comments: number
          total_comments: number
          user_comments: number
        }[]
      }
      get_dashboard_stats: { Args: { user_id?: string }; Returns: Json }
      get_document_review_stats: {
        Args: { p_document_id: string }
        Returns: Json
      }
      get_threaded_comments: {
        Args: { p_document_id: string; p_include_archived?: boolean }
        Returns: {
          clause_boundary_id: string
          comment_text: string
          comment_type: string
          created_at: string
          created_by: string
          discrepancy_id: string
          id: string
          level: number
          parent_comment_id: string
          resolved_at: string
          resolved_by: string
          status: string
          template_id: string
          updated_at: string
        }[]
      }
      get_user_profile: {
        Args: { clerk_id: string }
        Returns: {
          avatar_url: string | null
          clerk_user_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_tenant_id: { Args: never; Returns: string }
      is_tenant_admin: { Args: never; Returns: boolean }
      match_clause_to_standardization: {
        Args: {
          p_clause_embedding: string
          p_clause_text: string
          p_clause_type?: string
        }
        Returns: {
          clause_ids: string[]
          similarity: number
          standardization_id: string
          standardized_clause: string
          variation_tolerance: string
        }[]
      }
      resolve_comment_and_discrepancy: {
        Args: {
          p_comment_id: string
          p_resolution_notes?: string
          p_resolved_by: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      clause_category:
        | "legal"
        | "operational"
        | "creative"
        | "financial"
        | "compliance"
        | "termination"
        | "confidentiality"
        | "liability"
        | "indemnification"
      clause_source_type: "deal" | "contract" | "document"
      contract_status: "draft" | "active" | "expired" | "terminated"
      deal_status: "draft" | "in_review" | "signed" | "cancelled"
      discrepancy_type:
        | "missing"
        | "modified"
        | "additional"
        | "position"
        | "conflicting"
      document_status: "pending" | "processing" | "completed" | "failed"
      rag_status: "green" | "amber" | "red" | "blue"
      risk_level: "low" | "medium" | "high" | "critical"
      user_role: "talent_manager" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      clause_category: [
        "legal",
        "operational",
        "creative",
        "financial",
        "compliance",
        "termination",
        "confidentiality",
        "liability",
        "indemnification",
      ],
      clause_source_type: ["deal", "contract", "document"],
      contract_status: ["draft", "active", "expired", "terminated"],
      deal_status: ["draft", "in_review", "signed", "cancelled"],
      discrepancy_type: [
        "missing",
        "modified",
        "additional",
        "position",
        "conflicting",
      ],
      document_status: ["pending", "processing", "completed", "failed"],
      rag_status: ["green", "amber", "red", "blue"],
      risk_level: ["low", "medium", "high", "critical"],
      user_role: ["talent_manager", "admin"],
    },
  },
} as const

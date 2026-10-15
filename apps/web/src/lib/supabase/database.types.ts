
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "age_bands": {
                  Row: {
                    "id": string,"label": string,"sort_order": number,"stage": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"label": string,"sort_order": number,"stage": string
                  }
                  Update: {
                    "id"?: string,"label"?: string,"sort_order"?: number,"stage"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bag_items": {
                  Row: {
                    "product_id": string,"quantity": number,"size_code": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "product_id": string,"quantity": number,"size_code"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "product_id"?: string,"quantity"?: number,"size_code"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bag_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "department": Database["public"]['Enums']["department"],"id": string,"image_key": string | null,"kind": Database["public"]['Enums']["product_kind"],"name": string,"sort_order": number,"tint": string
                  }
                  ComputedFields: never
                  Insert: {
                    "department": Database["public"]['Enums']["department"],"id": string,"image_key"?: string | null,"kind": Database["public"]['Enums']["product_kind"],"name": string,"sort_order"?: number,"tint": string
                  }
                  Update: {
                    "department"?: Database["public"]['Enums']["department"],"id"?: string,"image_key"?: string | null,"kind"?: Database["public"]['Enums']["product_kind"],"name"?: string,"sort_order"?: number,"tint"?: string
                  }
                  Relationships: [
                    
                  ]
                },"delivery_areas": {
                  Row: {
                    "is_active": boolean,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "is_active"?: boolean,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "is_active"?: boolean,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"delivery_options": {
                  Row: {
                    "fee_ghs": number | null,"id": string,"label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fee_ghs"?: number | null,"id": string,"label": string,"sort_order"?: number
                  }
                  Update: {
                    "fee_ghs"?: number | null,"id"?: string,"label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"inventory_levels": {
                  Row: {
                    "in_stock": boolean | null,"on_hand": number,"product_id": string,"reserved": number,"size_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "in_stock"?: never,"on_hand"?: number,"product_id": string,"reserved"?: number,"size_code"?: string,"updated_at"?: string
                  }
                  Update: {
                    "in_stock"?: never,"on_hand"?: number,"product_id"?: string,"reserved"?: number,"size_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_levels_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"merchandising_slots": {
                  Row: {
                    "position": number,"product_id": string,"slot": string
                  }
                  ComputedFields: never
                  Insert: {
                    "position": number,"product_id": string,"slot": string
                  }
                  Update: {
                    "position"?: number,"product_id"?: string,"slot"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "merchandising_slots_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "id": string,"line_total_ghs": number,"order_id": string,"product_id": string | null,"product_name": string,"quantity": number,"size_code": string | null,"size_label": string | null,"unit_price_ghs": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"line_total_ghs": number,"order_id": string,"product_id"?: string | null,"product_name": string,"quantity": number,"size_code"?: string | null,"size_label"?: string | null,"unit_price_ghs": number
                  }
                  Update: {
                    "id"?: string,"line_total_ghs"?: number,"order_id"?: string,"product_id"?: string | null,"product_name"?: string,"quantity"?: number,"size_code"?: string | null,"size_label"?: string | null,"unit_price_ghs"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "area": string,"cancel_reason": string | null,"created_at": string,"customer_name": string,"delivery_fee_ghs": number | null,"delivery_option_id": string,"ghanapost_gps": string | null,"id": string,"is_gift": boolean,"momo_network": Database["public"]['Enums']["momo_network"] | null,"needs_review": boolean,"order_number": string,"paid_at": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"phone": string,"public_token": string,"reservation_expires_at": string | null,"rider_directions": string | null,"status": Database["public"]['Enums']["order_status"],"subtotal_ghs": number,"total_ghs": number | null,"updated_at": string,"user_id": string | null,"wallet_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"cancel_reason"?: string | null,"created_at"?: string,"customer_name": string,"delivery_fee_ghs"?: number | null,"delivery_option_id": string,"ghanapost_gps"?: string | null,"id"?: string,"is_gift"?: boolean,"momo_network"?: Database["public"]['Enums']["momo_network"] | null,"needs_review"?: boolean,"order_number"?: string,"paid_at"?: string | null,"payment_method": Database["public"]['Enums']["payment_method"],"phone": string,"public_token"?: string,"reservation_expires_at"?: string | null,"rider_directions"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_ghs": number,"total_ghs"?: number | null,"updated_at"?: string,"user_id"?: string | null,"wallet_number"?: string | null
                  }
                  Update: {
                    "area"?: string,"cancel_reason"?: string | null,"created_at"?: string,"customer_name"?: string,"delivery_fee_ghs"?: number | null,"delivery_option_id"?: string,"ghanapost_gps"?: string | null,"id"?: string,"is_gift"?: boolean,"momo_network"?: Database["public"]['Enums']["momo_network"] | null,"needs_review"?: boolean,"order_number"?: string,"paid_at"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"phone"?: string,"public_token"?: string,"reservation_expires_at"?: string | null,"rider_directions"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_ghs"?: number,"total_ghs"?: number | null,"updated_at"?: string,"user_id"?: string | null,"wallet_number"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_area_fkey"
      columns: ["area"]
isOneToOne: false
      referencedRelation: "delivery_areas"
      referencedColumns: ["name"]
    },{
      foreignKeyName: "orders_delivery_option_id_fkey"
      columns: ["delivery_option_id"]
isOneToOne: false
      referencedRelation: "delivery_options"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_ghs": number,"created_at": string,"id": string,"last_event": Json | null,"order_id": string,"provider": string,"provider_reference": string,"status": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ghs": number,"created_at"?: string,"id"?: string,"last_event"?: Json | null,"order_id": string,"provider": string,"provider_reference": string,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_ghs"?: number,"created_at"?: string,"id"?: string,"last_event"?: Json | null,"order_id"?: string,"provider"?: string,"provider_reference"?: string,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"product_age_bands": {
                  Row: {
                    "age_band_id": string,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age_band_id": string,"product_id": string
                  }
                  Update: {
                    "age_band_id"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_age_bands_age_band_id_fkey"
      columns: ["age_band_id"]
isOneToOne: false
      referencedRelation: "age_bands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_age_bands_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_sizes": {
                  Row: {
                    "code": string,"is_default": boolean,"label": string,"price_ghs": number,"product_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"is_default"?: boolean,"label": string,"price_ghs": number,"product_id": string,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"is_default"?: boolean,"label"?: string,"price_ghs"?: number,"product_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_sizes_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "badge": string | null,"brand": string | null,"category_id": string | null,"collection": string | null,"created_at": string,"department": Database["public"]['Enums']["department"],"details": Json | null,"id": string,"image_key": string | null,"is_published": boolean,"kids_filter": Database["public"]['Enums']["kids_filter"] | null,"kind": Database["public"]['Enums']["product_kind"],"name": string,"price_ghs": number,"slug": string,"summary": string,"tag": string,"tint": string,"updated_at": string,"was_price_ghs": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "badge"?: string | null,"brand"?: string | null,"category_id"?: string | null,"collection"?: string | null,"created_at"?: string,"department": Database["public"]['Enums']["department"],"details"?: Json | null,"id"?: string,"image_key"?: string | null,"is_published"?: boolean,"kids_filter"?: Database["public"]['Enums']["kids_filter"] | null,"kind": Database["public"]['Enums']["product_kind"],"name": string,"price_ghs": number,"slug": string,"summary": string,"tag": string,"tint": string,"updated_at"?: string,"was_price_ghs"?: number | null
                  }
                  Update: {
                    "badge"?: string | null,"brand"?: string | null,"category_id"?: string | null,"collection"?: string | null,"created_at"?: string,"department"?: Database["public"]['Enums']["department"],"details"?: Json | null,"id"?: string,"image_key"?: string | null,"is_published"?: boolean,"kids_filter"?: Database["public"]['Enums']["kids_filter"] | null,"kind"?: Database["public"]['Enums']["product_kind"],"name"?: string,"price_ghs"?: number,"slug"?: string,"summary"?: string,"tag"?: string,"tint"?: string,"updated_at"?: string,"was_price_ghs"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "accepted_terms_at": string | null,"confirmed_adult_at": string | null,"created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_terms_at"?: string | null,"confirmed_adult_at"?: string | null,"created_at"?: string,"id": string
                  }
                  Update: {
                    "accepted_terms_at"?: string | null,"confirmed_adult_at"?: string | null,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"store_settings": {
                  Row: {
                    "id": boolean,"reservation_minutes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"reservation_minutes"?: number
                  }
                  Update: {
                    "id"?: boolean,"reservation_minutes"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "confirm_payment":
{ Args: { "p_amount_ghs": number,"p_event"?: Json,"p_provider": string,"p_reference": string,"p_status": string }; Returns: {
              "order_number": string,"order_status": Database["public"]['Enums']["order_status"],"payment_status": Database["public"]['Enums']["payment_status"]
            }[]
                           },
"expire_unpaid_orders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"get_bag":
{ Args: Record<PropertyKey, never>; Returns: {
              "image_key": string,"in_stock": boolean,"kind": Database["public"]['Enums']["product_kind"],"name": string,"quantity": number,"size_code": string,"size_label": string,"slug": string,"tint": string,"unit_price_ghs": number
            }[]
                           },
"get_order_status":
{ Args: { "p_order_token": string }; Returns: {
              "order_number": string,"payment_status": Database["public"]['Enums']["payment_status"],"reserved_until": string,"status": Database["public"]['Enums']["order_status"],"total_ghs": number
            }[]
                           },
"place_order":
{ Args: { "p_customer": Json,"p_delivery_option": string,"p_is_gift"?: boolean,"p_items": Json,"p_payment": Json }; Returns: {
              "delivery_fee_ghs": number,"order_number": string,"order_token": string,"reserved_until": string,"subtotal_ghs": number,"total_ghs": number
            }[]
                           },
"record_signup_consent":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"release_order_reservation":
{ Args: { "p_order_id": string,"p_reason": string }; Returns: undefined
                           },
"set_bag":
{ Args: { "p_items": Json }; Returns: undefined
                           },
"start_payment":
{ Args: { "p_order_token": string,"p_provider": string,"p_reference": string }; Returns: number
                           }
          }
          Enums: {
            "department": "beauty"|"kids","kids_filter": "bath"|"toys"|"clothing"|"gifts","momo_network": "mtn"|"telecel"|"at","order_status": "pending_payment"|"paid"|"packed"|"out_for_delivery"|"delivered"|"cancelled","payment_method": "momo"|"card","payment_status": "pending"|"succeeded"|"failed"|"expired","product_kind": "bottle"|"jar"|"tube"|"garment"|"toy"|"gift"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "department": ["beauty", "kids"],"kids_filter": ["bath", "toys", "clothing", "gifts"],"momo_network": ["mtn", "telecel", "at"],"order_status": ["pending_payment", "paid", "packed", "out_for_delivery", "delivered", "cancelled"],"payment_method": ["momo", "card"],"payment_status": ["pending", "succeeded", "failed", "expired"],"product_kind": ["bottle", "jar", "tube", "garment", "toy", "gift"]
          }
        }
} as const

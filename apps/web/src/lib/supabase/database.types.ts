
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
                },"audit_log": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_id": string | null,"at": string,"details": Json | null,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_id"?: string | null,"at"?: string,"details"?: Json | null,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_id"?: string | null,"at"?: string,"details"?: Json | null,"entity"?: string,"entity_id"?: string | null,"id"?: never
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
                },"banners": {
                  Row: {
                    "body": string | null,"countdown_to": string | null,"cta_href": string | null,"cta_label": string | null,"ends_at": string | null,"id": string,"image_key": string | null,"is_active": boolean,"kicker": string | null,"placement": string,"secondary_cta_href": string | null,"secondary_cta_label": string | null,"sort_order": number,"starts_at": string | null,"theme": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"countdown_to"?: string | null,"cta_href"?: string | null,"cta_label"?: string | null,"ends_at"?: string | null,"id"?: string,"image_key"?: string | null,"is_active"?: boolean,"kicker"?: string | null,"placement": string,"secondary_cta_href"?: string | null,"secondary_cta_label"?: string | null,"sort_order"?: number,"starts_at"?: string | null,"theme"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"countdown_to"?: string | null,"cta_href"?: string | null,"cta_label"?: string | null,"ends_at"?: string | null,"id"?: string,"image_key"?: string | null,"is_active"?: boolean,"kicker"?: string | null,"placement"?: string,"secondary_cta_href"?: string | null,"secondary_cta_label"?: string | null,"sort_order"?: number,"starts_at"?: string | null,"theme"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "department": Database["public"]['Enums']["department"],"expiry_alert_days": number | null,"id": string,"image_key": string | null,"kind": Database["public"]['Enums']["product_kind"],"low_stock_threshold": number | null,"name": string,"sort_order": number,"tint": string
                  }
                  ComputedFields: never
                  Insert: {
                    "department": Database["public"]['Enums']["department"],"expiry_alert_days"?: number | null,"id": string,"image_key"?: string | null,"kind": Database["public"]['Enums']["product_kind"],"low_stock_threshold"?: number | null,"name": string,"sort_order"?: number,"tint": string
                  }
                  Update: {
                    "department"?: Database["public"]['Enums']["department"],"expiry_alert_days"?: number | null,"id"?: string,"image_key"?: string | null,"kind"?: Database["public"]['Enums']["product_kind"],"low_stock_threshold"?: number | null,"name"?: string,"sort_order"?: number,"tint"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer_addresses": {
                  Row: {
                    "area": string,"created_at": string,"directions": string | null,"ghanapost_gps": string | null,"id": string,"is_default": boolean,"label": string | null,"phone": string,"recipient_name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"created_at"?: string,"directions"?: string | null,"ghanapost_gps"?: string | null,"id"?: string,"is_default"?: boolean,"label"?: string | null,"phone": string,"recipient_name": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "area"?: string,"created_at"?: string,"directions"?: string | null,"ghanapost_gps"?: string | null,"id"?: string,"is_default"?: boolean,"label"?: string | null,"phone"?: string,"recipient_name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"delivery_areas": {
                  Row: {
                    "is_active": boolean,"name": string,"sort_order": number,"zone_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "is_active"?: boolean,"name": string,"sort_order"?: number,"zone_id"?: string | null
                  }
                  Update: {
                    "is_active"?: boolean,"name"?: string,"sort_order"?: number,"zone_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_areas_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "delivery_zones"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_options": {
                  Row: {
                    "cutoff_time": string | null,"days_max": number | null,"days_min": number | null,"fee_ghs": number | null,"free_eligible": boolean,"id": string,"label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cutoff_time"?: string | null,"days_max"?: number | null,"days_min"?: number | null,"fee_ghs"?: number | null,"free_eligible"?: boolean,"id": string,"label": string,"sort_order"?: number
                  }
                  Update: {
                    "cutoff_time"?: string | null,"days_max"?: number | null,"days_min"?: number | null,"fee_ghs"?: number | null,"free_eligible"?: boolean,"id"?: string,"label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"delivery_rates": {
                  Row: {
                    "fee_ghs": number | null,"is_available": boolean,"option_id": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fee_ghs"?: number | null,"is_available"?: boolean,"option_id": string,"zone_id": string
                  }
                  Update: {
                    "fee_ghs"?: number | null,"is_available"?: boolean,"option_id"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_rates_option_id_fkey"
      columns: ["option_id"]
isOneToOne: false
      referencedRelation: "delivery_options"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_rates_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "delivery_zones"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_zones": {
                  Row: {
                    "id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"name"?: string,"sort_order"?: number
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
                },"notifications": {
                  Row: {
                    "attempts": number,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"id": string,"last_error": string | null,"next_attempt_at": string,"order_id": string | null,"payload": NonNullable<Json>,"provider": string | null,"provider_reference": string | null,"recipient": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"template": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"order_id"?: string | null,"payload"?: NonNullable<Json>,"provider"?: string | null,"provider_reference"?: string | null,"recipient": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template": string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"order_id"?: string | null,"payload"?: NonNullable<Json>,"provider"?: string | null,"provider_reference"?: string | null,"recipient"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "actor_email": string | null,"actor_id": string | null,"at": string,"details": Json | null,"id": number,"note": string | null,"order_id": string,"status": Database["public"]['Enums']["order_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_email"?: string | null,"actor_id"?: string | null,"at"?: string,"details"?: Json | null,"id"?: never,"note"?: string | null,"order_id": string,"status": Database["public"]['Enums']["order_status"]
                  }
                  Update: {
                    "actor_email"?: string | null,"actor_id"?: string | null,"at"?: string,"details"?: Json | null,"id"?: never,"note"?: string | null,"order_id"?: string,"status"?: Database["public"]['Enums']["order_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_item_batches": {
                  Row: {
                    "batch_id": string,"order_item_id": string,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"order_item_id": string,"quantity": number
                  }
                  Update: {
                    "batch_id"?: string,"order_item_id"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_item_batches_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "stock_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_batches_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
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
                },"order_lookup_failures": {
                  Row: {
                    "at": string,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"key": string
                  }
                  Update: {
                    "at"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"orders": {
                  Row: {
                    "area": string,"cancel_reason": string | null,"courier_reference": string | null,"created_at": string,"customer_name": string,"delivered_at": string | null,"delivered_to": string | null,"delivery_attempts": number,"delivery_code": string,"delivery_code_failures": number,"delivery_fee_ghs": number | null,"delivery_option_id": string,"ghanapost_gps": string | null,"id": string,"is_gift": boolean,"momo_network": Database["public"]['Enums']["momo_network"] | null,"needs_review": boolean,"order_number": string,"paid_at": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"phone": string,"public_token": string,"refund_due": boolean,"reservation_expires_at": string | null,"rider_directions": string | null,"rider_id": string | null,"status": Database["public"]['Enums']["order_status"],"subtotal_ghs": number,"total_ghs": number | null,"updated_at": string,"user_id": string | null,"wallet_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"cancel_reason"?: string | null,"courier_reference"?: string | null,"created_at"?: string,"customer_name": string,"delivered_at"?: string | null,"delivered_to"?: string | null,"delivery_attempts"?: number,"delivery_code"?: string,"delivery_code_failures"?: number,"delivery_fee_ghs"?: number | null,"delivery_option_id": string,"ghanapost_gps"?: string | null,"id"?: string,"is_gift"?: boolean,"momo_network"?: Database["public"]['Enums']["momo_network"] | null,"needs_review"?: boolean,"order_number"?: string,"paid_at"?: string | null,"payment_method": Database["public"]['Enums']["payment_method"],"phone": string,"public_token"?: string,"refund_due"?: boolean,"reservation_expires_at"?: string | null,"rider_directions"?: string | null,"rider_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_ghs": number,"total_ghs"?: number | null,"updated_at"?: string,"user_id"?: string | null,"wallet_number"?: string | null
                  }
                  Update: {
                    "area"?: string,"cancel_reason"?: string | null,"courier_reference"?: string | null,"created_at"?: string,"customer_name"?: string,"delivered_at"?: string | null,"delivered_to"?: string | null,"delivery_attempts"?: number,"delivery_code"?: string,"delivery_code_failures"?: number,"delivery_fee_ghs"?: number | null,"delivery_option_id"?: string,"ghanapost_gps"?: string | null,"id"?: string,"is_gift"?: boolean,"momo_network"?: Database["public"]['Enums']["momo_network"] | null,"needs_review"?: boolean,"order_number"?: string,"paid_at"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"phone"?: string,"public_token"?: string,"refund_due"?: boolean,"reservation_expires_at"?: string | null,"rider_directions"?: string | null,"rider_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_ghs"?: number,"total_ghs"?: number | null,"updated_at"?: string,"user_id"?: string | null,"wallet_number"?: string | null
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
    },{
      foreignKeyName: "orders_rider_id_fkey"
      columns: ["rider_id"]
isOneToOne: false
      referencedRelation: "riders"
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
                },"product_images": {
                  Row: {
                    "alt": string | null,"created_at": string,"id": string,"path": string,"product_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string | null,"created_at"?: string,"id"?: string,"path": string,"product_id": string,"sort_order"?: number
                  }
                  Update: {
                    "alt"?: string | null,"created_at"?: string,"id"?: string,"path"?: string,"product_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_product_id_fkey"
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
                    "badge": string | null,"brand": string | null,"category_id": string | null,"collection": string | null,"country_of_origin": string | null,"created_at": string,"department": Database["public"]['Enums']["department"],"details": Json | null,"id": string,"image_key": string | null,"ingredients": string | null,"is_published": boolean,"kids_filter": Database["public"]['Enums']["kids_filter"] | null,"kind": Database["public"]['Enums']["product_kind"],"name": string,"period_after_opening": string | null,"price_ghs": number,"recall_reason": string | null,"recalled_at": string | null,"regulatory_reference": string | null,"return_note": string | null,"returnable": boolean,"shades": (string)[],"skin_types": (string)[],"slug": string,"summary": string,"tag": string,"tint": string,"updated_at": string,"warning_label": string | null,"was_price_ghs": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "badge"?: string | null,"brand"?: string | null,"category_id"?: string | null,"collection"?: string | null,"country_of_origin"?: string | null,"created_at"?: string,"department": Database["public"]['Enums']["department"],"details"?: Json | null,"id"?: string,"image_key"?: string | null,"ingredients"?: string | null,"is_published"?: boolean,"kids_filter"?: Database["public"]['Enums']["kids_filter"] | null,"kind": Database["public"]['Enums']["product_kind"],"name": string,"period_after_opening"?: string | null,"price_ghs": number,"recall_reason"?: string | null,"recalled_at"?: string | null,"regulatory_reference"?: string | null,"return_note"?: string | null,"returnable"?: boolean,"shades"?: (string)[],"skin_types"?: (string)[],"slug": string,"summary": string,"tag": string,"tint": string,"updated_at"?: string,"warning_label"?: string | null,"was_price_ghs"?: number | null
                  }
                  Update: {
                    "badge"?: string | null,"brand"?: string | null,"category_id"?: string | null,"collection"?: string | null,"country_of_origin"?: string | null,"created_at"?: string,"department"?: Database["public"]['Enums']["department"],"details"?: Json | null,"id"?: string,"image_key"?: string | null,"ingredients"?: string | null,"is_published"?: boolean,"kids_filter"?: Database["public"]['Enums']["kids_filter"] | null,"kind"?: Database["public"]['Enums']["product_kind"],"name"?: string,"period_after_opening"?: string | null,"price_ghs"?: number,"recall_reason"?: string | null,"recalled_at"?: string | null,"regulatory_reference"?: string | null,"return_note"?: string | null,"returnable"?: boolean,"shades"?: (string)[],"skin_types"?: (string)[],"slug"?: string,"summary"?: string,"tag"?: string,"tint"?: string,"updated_at"?: string,"warning_label"?: string | null,"was_price_ghs"?: number | null
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
                },"return_items": {
                  Row: {
                    "order_item_id": string,"outcome": Database["public"]['Enums']["return_outcome"] | null,"quantity": number,"return_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "order_item_id": string,"outcome"?: Database["public"]['Enums']["return_outcome"] | null,"quantity": number,"return_id": string
                  }
                  Update: {
                    "order_item_id"?: string,"outcome"?: Database["public"]['Enums']["return_outcome"] | null,"quantity"?: number,"return_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_items_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_items_return_id_fkey"
      columns: ["return_id"]
isOneToOne: false
      referencedRelation: "return_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"return_requests": {
                  Row: {
                    "case_number": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"details": string | null,"id": string,"order_id": string,"photo_paths": (string)[],"reason": Database["public"]['Enums']["return_reason"],"received_at": string | null,"received_by": string | null,"refund_amount_ghs": number | null,"refund_reference": string | null,"refunded_at": string | null,"status": Database["public"]['Enums']["return_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "case_number"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"details"?: string | null,"id"?: string,"order_id": string,"photo_paths"?: (string)[],"reason": Database["public"]['Enums']["return_reason"],"received_at"?: string | null,"received_by"?: string | null,"refund_amount_ghs"?: number | null,"refund_reference"?: string | null,"refunded_at"?: string | null,"status"?: Database["public"]['Enums']["return_status"]
                  }
                  Update: {
                    "case_number"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"details"?: string | null,"id"?: string,"order_id"?: string,"photo_paths"?: (string)[],"reason"?: Database["public"]['Enums']["return_reason"],"received_at"?: string | null,"received_by"?: string | null,"refund_amount_ghs"?: number | null,"refund_reference"?: string | null,"refunded_at"?: string | null,"status"?: Database["public"]['Enums']["return_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_requests_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"riders": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"phone": string,"vehicle": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"phone": string,"vehicle"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string,"vehicle"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_members": {
                  Row: {
                    "added_at": string,"added_by": string | null,"email": string,"is_active": boolean,"role": Database["public"]['Enums']["staff_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"email": string,"is_active"?: boolean,"role": Database["public"]['Enums']["staff_role"]
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"email"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["staff_role"]
                  }
                  Relationships: [
                    
                  ]
                },"stock_batches": {
                  Row: {
                    "batch_code": string,"expires_on": string | null,"id": string,"note": string | null,"product_id": string,"quantity": number,"received_at": string,"size_code": string,"status": Database["public"]['Enums']["batch_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_code": string,"expires_on"?: string | null,"id"?: string,"note"?: string | null,"product_id": string,"quantity": number,"received_at"?: string,"size_code"?: string,"status"?: Database["public"]['Enums']["batch_status"]
                  }
                  Update: {
                    "batch_code"?: string,"expires_on"?: string | null,"id"?: string,"note"?: string | null,"product_id"?: string,"quantity"?: number,"received_at"?: string,"size_code"?: string,"status"?: Database["public"]['Enums']["batch_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_batches_product_id_size_code_fkey"
      columns: ["product_id","size_code"]
isOneToOne: false
      referencedRelation: "inventory_levels"
      referencedColumns: ["product_id","size_code"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "actor_email": string | null,"actor_id": string | null,"at": string,"batch_id": string | null,"id": number,"note": string | null,"order_id": string | null,"product_id": string,"quantity": number,"reason": Database["public"]['Enums']["stock_movement_reason"],"sellable_change": number,"size_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_email"?: string | null,"actor_id"?: string | null,"at"?: string,"batch_id"?: string | null,"id"?: never,"note"?: string | null,"order_id"?: string | null,"product_id": string,"quantity"?: number,"reason": Database["public"]['Enums']["stock_movement_reason"],"sellable_change"?: number,"size_code"?: string
                  }
                  Update: {
                    "actor_email"?: string | null,"actor_id"?: string | null,"at"?: string,"batch_id"?: string | null,"id"?: never,"note"?: string | null,"order_id"?: string | null,"product_id"?: string,"quantity"?: number,"reason"?: Database["public"]['Enums']["stock_movement_reason"],"sellable_change"?: number,"size_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "stock_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"store_settings": {
                  Row: {
                    "expiry_alert_days": number,"free_delivery_threshold_ghs": number | null,"id": boolean,"low_stock_threshold": number,"max_delivery_attempts": number,"require_delivery_code": boolean,"reservation_minutes": number,"return_window_days": number,"support_email": string | null,"support_hours": string | null,"support_phone": string | null,"support_whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "expiry_alert_days"?: number,"free_delivery_threshold_ghs"?: number | null,"id"?: boolean,"low_stock_threshold"?: number,"max_delivery_attempts"?: number,"require_delivery_code"?: boolean,"reservation_minutes"?: number,"return_window_days"?: number,"support_email"?: string | null,"support_hours"?: string | null,"support_phone"?: string | null,"support_whatsapp"?: string | null
                  }
                  Update: {
                    "expiry_alert_days"?: number,"free_delivery_threshold_ghs"?: number | null,"id"?: boolean,"low_stock_threshold"?: number,"max_delivery_attempts"?: number,"require_delivery_code"?: boolean,"reservation_minutes"?: number,"return_window_days"?: number,"support_email"?: string | null,"support_hours"?: string | null,"support_phone"?: string | null,"support_whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"support_cases": {
                  Row: {
                    "case_number": string,"created_at": string,"email": string | null,"id": string,"message": string,"name": string,"order_id": string | null,"order_reference": string | null,"phone": string,"replied_at": string | null,"replied_by": string | null,"staff_reply": string | null,"status": Database["public"]['Enums']["support_status"],"topic": Database["public"]['Enums']["support_topic"]
                  }
                  ComputedFields: never
                  Insert: {
                    "case_number"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"message": string,"name": string,"order_id"?: string | null,"order_reference"?: string | null,"phone": string,"replied_at"?: string | null,"replied_by"?: string | null,"staff_reply"?: string | null,"status"?: Database["public"]['Enums']["support_status"],"topic": Database["public"]['Enums']["support_topic"]
                  }
                  Update: {
                    "case_number"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"message"?: string,"name"?: string,"order_id"?: string | null,"order_reference"?: string | null,"phone"?: string,"replied_at"?: string | null,"replied_by"?: string | null,"staff_reply"?: string | null,"status"?: Database["public"]['Enums']["support_status"],"topic"?: Database["public"]['Enums']["support_topic"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_cases_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"wishlist_items": {
                  Row: {
                    "created_at": string,"product_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"product_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wishlist_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_add_product_image":
{ Args: { "p_alt"?: string,"p_path": string,"p_product_id": string }; Returns: string
                           },
"admin_adjust_batch":
{ Args: { "p_batch_id": string,"p_change": number,"p_note": string,"p_reason": Database["public"]['Enums']["stock_movement_reason"] }; Returns: undefined
                           },
"admin_arrange_product_images":
{ Args: { "p_photos": Json,"p_product_id": string }; Returns: undefined
                           },
"admin_cancel_order":
{ Args: { "p_order_id": string,"p_reason": string }; Returns: undefined
                           },
"admin_decide_return":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_return_id": string }; Returns: undefined
                           },
"admin_delete_banner":
{ Args: { "p_id": string }; Returns: undefined
                           },
"admin_delete_delivery_zone":
{ Args: { "p_id": string }; Returns: undefined
                           },
"admin_dispatch_order":
{ Args: { "p_courier_reference"?: string,"p_note"?: string,"p_order_id": string,"p_rider_id"?: string }; Returns: undefined
                           },
"admin_expiring_batches":
{ Args: Record<PropertyKey, never>; Returns: {
              "batch_code": string,"batch_id": string,"days_left": number,"expires_on": string,"product_id": string,"product_name": string,"quantity": number,"size_code": string,"size_label": string,"status": Database["public"]['Enums']["batch_status"]
            }[]
                           },
"admin_lift_recall":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"admin_mark_delivered":
{ Args: { "p_code": string,"p_note"?: string,"p_order_id": string,"p_recipient": string }; Returns: string
                           },
"admin_mark_delivery_failed":
{ Args: { "p_note"?: string,"p_order_id": string,"p_reason": Database["public"]['Enums']["delivery_failure_reason"] }; Returns: undefined
                           },
"admin_mark_return_refunded":
{ Args: { "p_reference": string,"p_return_id": string }; Returns: undefined
                           },
"admin_pack_orders":
{ Args: { "p_order_ids": (string)[] }; Returns: {
              "message": string,"ok": boolean,"order_id": string,"order_number": string
            }[]
                           },
"admin_pick_list":
{ Args: { "p_order_id": string }; Returns: {
              "batch_code": string,"batch_id": string,"expires_on": string,"order_item_id": string,"ordered": number,"packed": boolean,"product_name": string,"quantity": number,"size_label": string
            }[]
                           },
"admin_products":
{ Args: Record<PropertyKey, never>; Returns: {
              "available": number,"brand": string,"category_name": string,"department": Database["public"]['Enums']["department"],"id": string,"is_published": boolean,"name": string,"price_ghs": number,"problems": (string)[],"recalled_at": string,"slug": string
            }[]
                           },
"admin_recall_product":
{ Args: { "p_product_id": string,"p_reason": string }; Returns: undefined
                           },
"admin_receive_return":
{ Args: { "p_note"?: string,"p_outcomes": Json,"p_return_id": string }; Returns: undefined
                           },
"admin_receive_stock":
{ Args: { "p_batch_code": string,"p_expires_on": string,"p_note"?: string,"p_product_id": string,"p_quantity": number,"p_size_code": string }; Returns: string
                           },
"admin_remove_product_image":
{ Args: { "p_id": string }; Returns: string
                           },
"admin_reply_support_case":
{ Args: { "p_case_id": string,"p_close"?: boolean,"p_reply": string }; Returns: undefined
                           },
"admin_resolve_order_flag":
{ Args: { "p_flag": string,"p_note": string,"p_order_id": string }; Returns: undefined
                           },
"admin_return_to_stock":
{ Args: { "p_note"?: string,"p_order_id": string }; Returns: undefined
                           },
"admin_save_banner":
{ Args: { "p": Json }; Returns: string
                           },
"admin_save_delivery_area":
{ Args: { "p": Json }; Returns: undefined
                           },
"admin_save_delivery_option":
{ Args: { "p": Json }; Returns: undefined
                           },
"admin_save_delivery_zone":
{ Args: { "p_id": string,"p_name": string,"p_sort_order"?: number }; Returns: undefined
                           },
"admin_save_product":
{ Args: { "p": Json }; Returns: Json
                           },
"admin_save_rider":
{ Args: { "p_active"?: boolean,"p_id": string,"p_name": string,"p_phone": string,"p_vehicle": string }; Returns: string
                           },
"admin_set_batch_status":
{ Args: { "p_batch_id": string,"p_note": string,"p_status": Database["public"]['Enums']["batch_status"] }; Returns: undefined
                           },
"admin_set_collection":
{ Args: { "p_slot": string,"p_slugs": (string)[] }; Returns: undefined
                           },
"admin_set_delivery_rate":
{ Args: { "p_available": boolean,"p_fee": number,"p_option_id": string,"p_zone_id": string }; Returns: undefined
                           },
"admin_set_product_published":
{ Args: { "p_product_id": string,"p_published": boolean }; Returns: (string)[]
                           },
"admin_set_staff":
{ Args: { "p_active"?: boolean,"p_email": string,"p_role": Database["public"]['Enums']["staff_role"] }; Returns: undefined
                           },
"admin_start_packing":
{ Args: { "p_order_ids": (string)[] }; Returns: number
                           },
"admin_stock_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "available": number,"category_name": string,"expiring_soon": boolean,"is_low": boolean,"is_published": boolean,"low_stock_threshold": number,"next_expiry": string,"on_hand": number,"product_id": string,"product_name": string,"reserved": number,"size_code": string,"size_label": string,"slug": string
            }[]
                           },
"admin_update_settings":
{ Args: { "p": Json }; Returns: undefined
                           },
"admin_write_off_batch":
{ Args: { "p_batch_id": string,"p_note": string }; Returns: undefined
                           },
"allocate_order_batches":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"audit":
{ Args: { "p_action": string,"p_details"?: Json,"p_entity": string,"p_entity_id": string }; Returns: undefined
                           },
"can_upload_return_photo":
{ Args: { "p_name": string }; Returns: boolean
                           },
"cancel_my_order":
{ Args: { "p_order_token": string,"p_reason"?: string }; Returns: undefined
                           },
"change_batch_status":
{ Args: { "p_batch_id": string,"p_note": string,"p_reason": Database["public"]['Enums']["stock_movement_reason"],"p_status": Database["public"]['Enums']["batch_status"] }; Returns: undefined
                           },
"claim_notifications":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,"channel": Database["public"]['Enums']["notification_channel"],"id": string,"payload": Json,"recipient": string,"template": string
            }[]
                           },
"confirm_payment":
{ Args: { "p_amount_ghs": number,"p_event"?: Json,"p_provider": string,"p_reference": string,"p_status": string }; Returns: {
              "order_number": string,"order_status": Database["public"]['Enums']["order_status"],"payment_status": Database["public"]['Enums']["payment_status"]
            }[]
                           },
"create_support_case":
{ Args: { "p_email"?: string,"p_message": string,"p_name": string,"p_order_number"?: string,"p_order_token"?: string,"p_phone": string,"p_topic": Database["public"]['Enums']["support_topic"] }; Returns: string
                           },
"current_staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["staff_role"]
                           },
"delete_address":
{ Args: { "p_id": string }; Returns: undefined
                           },
"expire_batches":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"expire_unpaid_orders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"find_order":
{ Args: { "p_order_number": string,"p_phone": string }; Returns: string
                           },
"finish_notification":
{ Args: { "p_error"?: string,"p_id": string,"p_outcome": string,"p_provider"?: string,"p_reference"?: string }; Returns: undefined
                           },
"get_bag":
{ Args: Record<PropertyKey, never>; Returns: {
              "image_key": string,"in_stock": boolean,"kind": Database["public"]['Enums']["product_kind"],"name": string,"photo_path": string,"quantity": number,"size_code": string,"size_label": string,"slug": string,"tint": string,"unit_price_ghs": number,"warning_label": string
            }[]
                           },
"get_order":
{ Args: { "p_order_token": string }; Returns: Json
                           },
"get_order_status":
{ Args: { "p_order_token": string }; Returns: {
              "order_number": string,"payment_status": Database["public"]['Enums']["payment_status"],"reserved_until": string,"status": Database["public"]['Enums']["order_status"],"total_ghs": number
            }[]
                           },
"get_wishlist":
{ Args: Record<PropertyKey, never>; Returns: {
              "saved_at": string,"slug": string
            }[]
                           },
"lock_order_for":
{ Args: { "p_action": string,"p_allowed": (Database["public"]['Enums']["order_status"])[],"p_order_id": string }; Returns: {
              "area": string,
"cancel_reason": string | null,
"courier_reference": string | null,
"created_at": string,
"customer_name": string,
"delivered_at": string | null,
"delivered_to": string | null,
"delivery_attempts": number,
"delivery_code": string,
"delivery_code_failures": number,
"delivery_fee_ghs": number | null,
"delivery_option_id": string,
"ghanapost_gps": string | null,
"id": string,
"is_gift": boolean,
"momo_network": Database["public"]['Enums']["momo_network"] | null,
"needs_review": boolean,
"order_number": string,
"paid_at": string | null,
"payment_method": Database["public"]['Enums']["payment_method"],
"phone": string,
"public_token": string,
"refund_due": boolean,
"reservation_expires_at": string | null,
"rider_directions": string | null,
"rider_id": string | null,
"status": Database["public"]['Enums']["order_status"],
"subtotal_ghs": number,
"total_ghs": number | null,
"updated_at": string,
"user_id": string | null,
"wallet_number": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"log_stock_movement":
{ Args: { "p_batch_id": string,"p_note"?: string,"p_order_id"?: string,"p_product_id": string,"p_quantity": number,"p_reason": Database["public"]['Enums']["stock_movement_reason"],"p_sellable_change": number,"p_size_code": string }; Returns: undefined
                           },
"my_orders":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"item_count": number,"order_number": string,"order_token": string,"status": Database["public"]['Enums']["order_status"],"total_ghs": number
            }[]
                           },
"my_staff_access":
{ Args: Record<PropertyKey, never>; Returns: {
              "role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"place_order":
{ Args: { "p_customer": Json,"p_delivery_option": string,"p_is_gift"?: boolean,"p_items": Json,"p_payment": Json }; Returns: {
              "delivery_fee_ghs": number,"order_number": string,"order_token": string,"reserved_until": string,"subtotal_ghs": number,"total_ghs": number
            }[]
                           },
"product_current_batches":
{ Args: { "p_slug": string }; Returns: {
              "batch_code": string,"expires_on": string,"size_code": string
            }[]
                           },
"product_publish_problems":
{ Args: { "p_product_id": string }; Returns: (string)[]
                           },
"queue_customer_message":
{ Args: { "p_email": string,"p_order_id": string,"p_payload": Json,"p_phone": string,"p_template": string }; Returns: undefined
                           },
"queue_return_message":
{ Args: { "p_return_id": string,"p_template": string }; Returns: undefined
                           },
"record_signup_consent":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"release_order_reservation":
{ Args: { "p_order_id": string,"p_reason": string }; Returns: undefined
                           },
"request_return":
{ Args: { "p_details"?: string,"p_items": Json,"p_order_token": string,"p_photo_paths"?: (string)[],"p_reason": Database["public"]['Enums']["return_reason"] }; Returns: string
                           },
"require_staff":
{ Args: { "p_roles"?: (Database["public"]['Enums']["staff_role"])[] }; Returns: Database["public"]['Enums']["staff_role"]
                           },
"return_order_batches":
{ Args: { "p_note": string,"p_order_id": string }; Returns: undefined
                           },
"return_photo_folder":
{ Args: { "p_order_token": string }; Returns: string
                           },
"save_address":
{ Args: { "p": Json }; Returns: string
                           },
"search_products":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "score": number,"slug": string
            }[]
                           },
"set_bag":
{ Args: { "p_items": Json }; Returns: undefined
                           },
"set_order_event_context":
{ Args: { "p_details"?: Json,"p_note": string }; Returns: undefined
                           },
"set_wishlist":
{ Args: { "p_saved": boolean,"p_slugs": (string)[] }; Returns: undefined
                           },
"start_payment":
{ Args: { "p_order_token": string,"p_provider": string,"p_reference": string }; Returns: number
                           }
          }
          Enums: {
            "batch_status": "available"|"quarantined"|"recalled"|"expired","delivery_failure_reason": "customer_unreachable"|"customer_absent"|"wrong_address"|"refused"|"rider_issue"|"other","department": "beauty"|"kids","kids_filter": "bath"|"toys"|"clothing"|"gifts","momo_network": "mtn"|"telecel"|"at","notification_channel": "sms"|"email","notification_status": "queued"|"sending"|"sent"|"failed"|"not_sent","order_status": "pending_payment"|"paid"|"packing"|"packed"|"out_for_delivery"|"delivery_failed"|"delivered"|"cancelled"|"returned","payment_method": "momo"|"card","payment_status": "pending"|"succeeded"|"failed"|"expired","product_kind": "bottle"|"jar"|"tube"|"garment"|"toy"|"gift","return_outcome": "restock"|"quarantine"|"write_off","return_reason": "damaged"|"wrong_item"|"not_as_described"|"expired_or_near_expiry"|"changed_mind"|"other","return_status": "requested"|"approved"|"rejected"|"received"|"refunded","staff_role": "admin"|"catalogue"|"operations"|"support"|"finance"|"read_only","stock_movement_reason": "opening"|"received"|"sold"|"picked"|"returned"|"restocked"|"adjusted"|"damaged"|"lost"|"found"|"quarantined"|"released"|"recalled"|"expired"|"written_off","support_status": "open"|"answered"|"closed","support_topic": "delivery"|"damaged_or_wrong"|"payment"|"product_question"|"account"|"other"
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
            "batch_status": ["available", "quarantined", "recalled", "expired"],"delivery_failure_reason": ["customer_unreachable", "customer_absent", "wrong_address", "refused", "rider_issue", "other"],"department": ["beauty", "kids"],"kids_filter": ["bath", "toys", "clothing", "gifts"],"momo_network": ["mtn", "telecel", "at"],"notification_channel": ["sms", "email"],"notification_status": ["queued", "sending", "sent", "failed", "not_sent"],"order_status": ["pending_payment", "paid", "packing", "packed", "out_for_delivery", "delivery_failed", "delivered", "cancelled", "returned"],"payment_method": ["momo", "card"],"payment_status": ["pending", "succeeded", "failed", "expired"],"product_kind": ["bottle", "jar", "tube", "garment", "toy", "gift"],"return_outcome": ["restock", "quarantine", "write_off"],"return_reason": ["damaged", "wrong_item", "not_as_described", "expired_or_near_expiry", "changed_mind", "other"],"return_status": ["requested", "approved", "rejected", "received", "refunded"],"staff_role": ["admin", "catalogue", "operations", "support", "finance", "read_only"],"stock_movement_reason": ["opening", "received", "sold", "picked", "returned", "restocked", "adjusted", "damaged", "lost", "found", "quarantined", "released", "recalled", "expired", "written_off"],"support_status": ["open", "answered", "closed"],"support_topic": ["delivery", "damaged_or_wrong", "payment", "product_question", "account", "other"]
          }
        }
} as const

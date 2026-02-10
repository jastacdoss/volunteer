import { createClient } from '@supabase/supabase-js'

// Lazy initialization
let supabase = null

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY

    if (!url || !key) {
      throw new Error('Supabase credentials not configured (SUPABASE_URL, SUPABASE_SERVICE_KEY)')
    }

    supabase = createClient(url, key, {
      db: { schema: 'fundraiser' }
    })
  }
  return supabase
}

// ========================================
// Donations
// ========================================

export async function getDonations() {
  const client = getSupabase()
  const { data, error } = await client
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getDonationByMmId(mmId) {
  const client = getSupabase()
  const { data, error } = await client
    .from('donations')
    .select('*')
    .eq('mm_id', mmId)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data
}

export async function createDonation(donation) {
  const client = getSupabase()
  const { data, error } = await client
    .from('donations')
    .insert(donation)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateDonation(id, updates) {
  const client = getSupabase()
  const { data, error } = await client
    .from('donations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function upsertDonationByMmId(donation) {
  const client = getSupabase()
  const { data, error } = await client
    .from('donations')
    .upsert(donation, { onConflict: 'mm_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

// ========================================
// Free Answers
// ========================================

export async function getFreeAnswers() {
  const client = getSupabase()
  const { data, error } = await client
    .from('free_answers')
    .select('*')

  if (error) throw error
  return data || []
}

export async function incrementFreeAnswer(tableNumber) {
  const client = getSupabase()

  // First try to get existing record
  const { data: existing } = await client
    .from('free_answers')
    .select('*')
    .eq('table_number', tableNumber)
    .single()

  if (existing) {
    // Update existing
    const { data, error } = await client
      .from('free_answers')
      .update({
        given_count: existing.given_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('table_number', tableNumber)
      .select()
      .single()

    if (error) throw error
    return data
  } else {
    // Insert new
    const { data, error } = await client
      .from('free_answers')
      .insert({ table_number: tableNumber, given_count: 1 })
      .select()
      .single()

    if (error) throw error
    return data
  }
}

export async function decrementFreeAnswer(tableNumber) {
  const client = getSupabase()

  const { data: existing } = await client
    .from('free_answers')
    .select('*')
    .eq('table_number', tableNumber)
    .single()

  if (existing && existing.given_count > 0) {
    const { data, error } = await client
      .from('free_answers')
      .update({
        given_count: existing.given_count - 1,
        updated_at: new Date().toISOString()
      })
      .eq('table_number', tableNumber)
      .select()
      .single()

    if (error) throw error
    return data
  }

  return existing
}

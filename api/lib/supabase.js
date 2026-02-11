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

export async function getDonations(eventDate = null) {
  const client = getSupabase()
  let query = client
    .from('donations')
    .select('*')

  // Filter by event date if provided (use Pacific timezone for event date)
  if (eventDate) {
    // Use mm_created_at for MM donations, created_at for local donations
    // Pacific is UTC-8 (PST) or UTC-7 (PDT), use -08:00 for consistency
    const startOfDay = new Date(`${eventDate}T00:00:00-08:00`).toISOString()
    const nextDay = new Date(new Date(`${eventDate}T00:00:00-08:00`).getTime() + 36 * 60 * 60 * 1000).toISOString()
    // Filter using OR: (mm_created_at in range) OR (mm_created_at is null AND created_at in range)
    query = query.or(`and(mm_created_at.gte.${startOfDay},mm_created_at.lt.${nextDay}),and(mm_created_at.is.null,created_at.gte.${startOfDay},created_at.lt.${nextDay})`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

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

export async function deleteDonation(id) {
  const client = getSupabase()

  // Mark as deleted (soft delete) instead of actually deleting
  const { data: donation, error } = await client
    .from('donations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return donation
}

export async function clearAllDonations() {
  const client = getSupabase()

  // Delete all donations
  const { error: donationsError } = await client
    .from('donations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (neq with impossible value)

  if (donationsError) throw donationsError

  // Reset free answers (table_number is the key)
  const { error: freeAnswersError } = await client
    .from('free_answers')
    .delete()
    .neq('table_number', -1) // Delete all

  if (freeAnswersError) throw freeAnswersError

  return { cleared: true }
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

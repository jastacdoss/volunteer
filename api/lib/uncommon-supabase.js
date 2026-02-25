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
      db: { schema: 'uncommon' }
    })
  }
  return supabase
}

// ========================================
// Teams
// ========================================

export async function getTeams() {
  const client = getSupabase()
  const { data, error } = await client
    .from('teams')
    .select('*')
    .order('display_order')

  if (error) throw error
  return data || []
}

export async function getTeamScores() {
  const client = getSupabase()
  const { data, error } = await client
    .from('team_scores')
    .select('*')

  if (error) throw error
  return data || []
}

export async function updateTeamLeader(teamId, leader) {
  const client = getSupabase()
  const { data, error } = await client
    .from('teams')
    .update({
      leader_pco_id: leader.pcoId,
      leader_name: leader.name,
      leader_email: leader.email,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addTeamPoints(teamId, points, reason, enteredBy) {
  const client = getSupabase()
  const { data, error } = await client
    .from('team_points_log')
    .insert({
      team_id: teamId,
      points,
      reason,
      entered_by: enteredBy
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getTeamPointsLog(teamId = null) {
  const client = getSupabase()
  let query = client
    .from('team_points_log')
    .select('*, teams(name, color_hex)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (teamId) {
    query = query.eq('team_id', teamId)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// ========================================
// Small Groups
// ========================================

export async function getSmallGroups() {
  const client = getSupabase()
  const { data, error } = await client
    .from('small_groups')
    .select('*, teams(name, color_hex)')
    .order('group_type')
    .order('name')

  if (error) throw error
  return data || []
}

export async function getSmallGroupCounts() {
  const client = getSupabase()
  const { data, error } = await client
    .from('small_group_counts')
    .select('*')

  if (error) throw error
  return data || []
}

export async function updateSmallGroupLeader(groupId, leader) {
  const client = getSupabase()
  const { data, error } = await client
    .from('small_groups')
    .update({
      leader_pco_id: leader.pcoId,
      leader_name: leader.name,
      leader_email: leader.email,
      updated_at: new Date().toISOString()
    })
    .eq('id', groupId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ========================================
// Participants
// ========================================

export async function getParticipants() {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .select('*, teams(name, color_hex), man_cards(*)')
    .order('checkin_number', { ascending: true })

  if (error) throw error
  return data || []
}

export async function searchParticipants(query) {
  const client = getSupabase()

  // Check if query is a number (check-in number search)
  const isNumber = /^\d+$/.test(query.trim())

  let dbQuery = client
    .from('participants')
    .select('*, teams(name, color_hex), man_cards(*)')

  if (isNumber) {
    dbQuery = dbQuery.eq('checkin_number', parseInt(query, 10))
  } else {
    // Search by name (case-insensitive)
    const searchTerm = query.trim().toLowerCase()
    dbQuery = dbQuery.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
  }

  const { data, error } = await dbQuery
    .order('checkin_number', { ascending: true })
    .limit(20)

  if (error) throw error

  // Normalize man_cards to always be an array
  return (data || []).map(p => ({
    ...p,
    man_cards: p.man_cards ? (Array.isArray(p.man_cards) ? p.man_cards : [p.man_cards]) : []
  }))
}

export async function getAllParticipants() {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .select('*, teams(name, color_hex), man_cards(*)')
    .order('checkin_number', { ascending: true })

  if (error) throw error

  // Normalize man_cards to always be an array
  return (data || []).map(p => ({
    ...p,
    man_cards: p.man_cards ? (Array.isArray(p.man_cards) ? p.man_cards : [p.man_cards]) : []
  }))
}

export async function getParticipantById(id) {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .select('*, teams(name, color_hex), man_cards(*)')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function getParticipantByCheckinId(pcoCheckinId) {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .select('*')
    .eq('pco_checkin_id', pcoCheckinId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function upsertParticipant(participant) {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .upsert(participant, { onConflict: 'pco_checkin_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function batchUpsertParticipants(participants) {
  if (!participants.length) return []

  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .upsert(participants, { onConflict: 'pco_checkin_id' })
    .select()

  if (error) throw error
  return data || []
}

// ========================================
// Man Cards
// ========================================

export async function getManCard(participantId) {
  const client = getSupabase()
  const { data, error } = await client
    .from('man_cards')
    .select('*')
    .eq('participant_id', participantId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createManCard(participantId) {
  const client = getSupabase()
  const { data, error } = await client
    .from('man_cards')
    .insert({ participant_id: participantId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateManCard(participantId, updates) {
  const client = getSupabase()

  // Check if card is now completed (10+ total marks)
  const totalMarks = (updates.black_marks || 0) + (updates.red_marks || 0)
  if (totalMarks >= 10 && !updates.completed) {
    updates.completed = true
    updates.completed_at = new Date().toISOString()
  } else if (totalMarks < 10 && updates.completed !== false) {
    updates.completed = false
    updates.completed_at = null
  }

  const { data, error } = await client
    .from('man_cards')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('participant_id', participantId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function ensureManCard(participantId) {
  const existing = await getManCard(participantId)
  if (existing) return existing
  return createManCard(participantId)
}

// ========================================
// Drawings
// ========================================

export async function getDrawingPool() {
  const client = getSupabase()
  const { data, error } = await client
    .from('drawing_pool')
    .select('*')

  if (error) throw error
  return data || []
}

export async function getDrawingWinners() {
  const client = getSupabase()
  const { data, error } = await client
    .from('drawings')
    .select('*, participants(first_name, last_name, checkin_number, teams(name, color_hex))')
    .order('drawn_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getLatestDrawingWinner() {
  const client = getSupabase()
  const { data, error } = await client
    .from('drawings')
    .select('*, participants(first_name, last_name, checkin_number, teams(name, color_hex))')
    .order('drawn_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createDrawing(participantId, prizeName = null) {
  const client = getSupabase()
  const { data, error } = await client
    .from('drawings')
    .insert({
      participant_id: participantId,
      prize_name: prizeName,
      drawn_at: new Date().toISOString()
    })
    .select('*, participants(first_name, last_name, checkin_number, teams(name, color_hex))')
    .single()

  if (error) throw error
  return data
}

// ========================================
// Utility - Get team by location name
// ========================================

export async function getTeamByLocationName(locationName) {
  if (!locationName) return null

  // Strip "SMALL GROUP: " prefix if present (PCO location format)
  const cleanName = locationName.replace(/^SMALL GROUP:\s*/i, '').toUpperCase()

  // Parse team from location name (e.g., "RED-1", "BLUE-JH", "GREEN-HS")
  const teamPrefix = cleanName.split('-')[0]

  const client = getSupabase()
  const { data, error } = await client
    .from('teams')
    .select('*')
    .eq('name', teamPrefix)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function getSmallGroupByName(groupName) {
  if (!groupName) return null

  // Strip "SMALL GROUP: " prefix if present (PCO location format)
  const cleanName = groupName.replace(/^SMALL GROUP:\s*/i, '').toUpperCase()

  const client = getSupabase()
  const { data, error } = await client
    .from('small_groups')
    .select('*')
    .eq('name', cleanName)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function getParticipantsBySmallGroup(smallGroupId) {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .select('*, small_groups(name, group_type, teams(name, color_hex))')
    .eq('small_group_id', smallGroupId)
    .order('last_name')
    .order('first_name')

  if (error) throw error
  return data || []
}

export async function getParticipantsByGroupType(groupType) {
  const client = getSupabase()
  const { data, error } = await client
    .from('participants')
    .select('*, small_groups!inner(name, group_type, teams(name, color_hex))')
    .eq('small_groups.group_type', groupType)
    .order('last_name')
    .order('first_name')

  if (error) throw error
  return data || []
}

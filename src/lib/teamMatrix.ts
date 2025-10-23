// Team Requirements Matrix
// Based on matrix.xlsx - defines which onboarding steps are required for each team

export interface TeamRequirements {
  backgroundCheck: boolean
  references: boolean
  childSafety: boolean
  mandatedReporter: boolean
  welcomeToRCC: boolean
  membership: boolean
  lifeGroup: boolean
  covenant: boolean          // Base level (Level 1)
  moralConduct: boolean      // Level 2 covenant
  discipleship: boolean
  leadership: boolean
  publicPresence: boolean    // Level 3 covenant (highest)
}

export interface RequiredSteps {
  backgroundCheck: boolean
  references: boolean
  childSafety: boolean
  mandatedReporter: boolean
  covenant: 1 | 2 | 3 | null  // Covenant level required (1=base, 2=moral conduct, 3=public presence)

  // Additional requirements (not part of main onboarding steps)
  welcomeToRCC: boolean
  membership: boolean
  lifeGroup: boolean
  discipleship: boolean
  leadership: boolean
}

// Default team requirements matrix - lowercase team names with dashes instead of spaces
// These can be overridden by data/teamRequirements.json
const DEFAULT_TEAM_REQUIREMENTS: Record<string, TeamRequirements> = {
  // Leadership
  'staff': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: true,
    publicPresence: true
  },
  'preschool-staff': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'preschool-leadership': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: false,
    publicPresence: true
  },
  'ministry-leader': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: true,
    publicPresence: true
  },
  'elder': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: true,
    publicPresence: true
  },
  'board': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: true,
    publicPresence: true
  },
  'life-group': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: true,
    publicPresence: true
  },

  // Volunteers
  'usher': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'connect': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'parking': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'security': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'production': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'worship': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'students': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'kids': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'kids-check-in': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'e3-(thursday-night-kids)': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'cafe': {
    backgroundCheck: true,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'baptism': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'maintenance': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'divorce-care': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'grief-share': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'celebrate-recovery': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'special-events': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'care': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'communion-team': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: true,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'finance': {
    backgroundCheck: true,
    references: true,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'counting': {
    backgroundCheck: true,
    references: true,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'food-and-friends': {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    covenant: false,
    moralConduct: false,
    discipleship: false,
    leadership: false,
    publicPresence: false
  },
  'core': {
    backgroundCheck: true,
    references: true,
    childSafety: true,
    mandatedReporter: true,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: true,
    leadership: true,
    publicPresence: true
  },
  'moms': {
    backgroundCheck: true,
    references: true,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'prayer': {
    backgroundCheck: true,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: false,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'men': {
    backgroundCheck: true,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  },
  'women': {
    backgroundCheck: true,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    welcomeToRCC: true,
    membership: true,
    lifeGroup: true,
    covenant: false,
    moralConduct: true,
    discipleship: false,
    leadership: false,
    publicPresence: true
  }
}

// Mutable requirements that can be updated from API
let TEAM_REQUIREMENTS = { ...DEFAULT_TEAM_REQUIREMENTS }

/**
 * Load team requirements from the API and merge with defaults
 * This allows admins to override default requirements
 */
export async function loadTeamRequirements(): Promise<void> {
  try {
    const response = await fetch('/api/admin/team-requirements')
    if (!response.ok) {
      console.warn('Failed to load team requirements from API, using defaults')
      return
    }

    const data = await response.json()
    const overrides = data.teams || {}

    // Merge overrides with defaults
    // Each team in overrides will completely replace the default
    TEAM_REQUIREMENTS = {
      ...DEFAULT_TEAM_REQUIREMENTS,
      ...overrides
    }

    console.log('Team requirements loaded from API')
    console.log('Connect team requirements:', TEAM_REQUIREMENTS.connect)
  } catch (error) {
    console.error('Error loading team requirements:', error)
    // Continue with defaults if API fails
  }
}

/**
 * Get the current team requirements
 */
export function getTeamRequirements(): Record<string, TeamRequirements> {
  return TEAM_REQUIREMENTS
}

/**
 * Get the covenant level required for a set of teams
 * Level 3 (Public Presence) > Level 2 (Moral Conduct) > Level 1 (Base)
 */
export function getCovenantLevel(teams: string[]): 1 | 2 | 3 | null {
  let maxLevel: 1 | 2 | 3 | null = null

  for (const team of teams) {
    const teamKey = team.toLowerCase().replace(/\s+/g, '-')
    const requirements = TEAM_REQUIREMENTS[teamKey]

    if (!requirements) continue

    // Check for highest level first
    if (requirements.publicPresence) {
      return 3 // Public Presence is highest, return immediately
    }

    if (requirements.moralConduct) {
      maxLevel = 2 // Moral Conduct
    } else if (requirements.covenant && maxLevel === null) {
      maxLevel = 1 // Base covenant
    }
  }

  return maxLevel
}

/**
 * Get the most restrictive (union) of requirements across multiple teams
 * Also accounts for what's already been completed
 */
export function getRequiredSteps(
  activeTeams: string[],
  completedTeams: string[]
): RequiredSteps {
  const required: RequiredSteps = {
    backgroundCheck: false,
    references: false,
    childSafety: false,
    mandatedReporter: false,
    covenant: null,
    welcomeToRCC: false,
    membership: false,
    lifeGroup: false,
    discipleship: false,
    leadership: false
  }

  // Get union of all active teams' requirements
  for (const team of activeTeams) {
    const teamKey = team.toLowerCase().replace(/\s+/g, '-')
    const teamReqs = TEAM_REQUIREMENTS[teamKey]

    if (!teamReqs) continue

    required.backgroundCheck = required.backgroundCheck || teamReqs.backgroundCheck
    required.references = required.references || teamReqs.references
    required.childSafety = required.childSafety || teamReqs.childSafety
    required.mandatedReporter = required.mandatedReporter || teamReqs.mandatedReporter
    required.welcomeToRCC = required.welcomeToRCC || teamReqs.welcomeToRCC
    required.membership = required.membership || teamReqs.membership
    required.lifeGroup = required.lifeGroup || teamReqs.lifeGroup
    required.discipleship = required.discipleship || teamReqs.discipleship
    required.leadership = required.leadership || teamReqs.leadership
  }

  // Get covenant level needed for active teams
  required.covenant = getCovenantLevel(activeTeams)

  // Get the highest covenant level already completed
  const completedCovenantLevel = getCovenantLevel(completedTeams)

  // If user already completed a higher or equal covenant level, they don't need to do it again
  if (completedCovenantLevel && required.covenant && completedCovenantLevel >= required.covenant) {
    required.covenant = null
  }

  return required
}

/**
 * Check if a team name is valid
 */
export function isValidTeam(teamName: string): boolean {
  const teamKey = teamName.toLowerCase().replace(/\s+/g, '-')
  return teamKey in TEAM_REQUIREMENTS
}

/**
 * Get display name for a team (convert from kebab-case to Title Case)
 */
export function getTeamDisplayName(teamKey: string): string {
  if (teamKey === 'RPK') return 'RPK'
  if (teamKey === 'staff') return 'Staff'
  if (teamKey === 'e3-(thursday-night-kids)') return 'E3 (Thursday Night Kids)'

  return teamKey
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

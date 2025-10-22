// Planning Center Field IDs
// These IDs are stable and don't change, so we hardcode them for performance

export const FIELD_IDS = {
  // Core onboarding workflow fields
  onboardingInProgressFor: '959379',
  onboardingCompleted: '959386',

  // Leadership
  ministryTeamLeader: '961991',

  // Declaration & Background Check
  declarationReviewed: '959383',
  declarationSubmitted: '882462',

  // Training fields
  childSafetyCompleted: '959380',
  childSafetySubmitted: '959457',
  mandatedReporterCompleted: '959382',
  mandatedReporterSubmitted: '959458',

  // References & Membership
  referencesChecked: '959384',
  referencesSubmitted: '958980',
  membership: null, // Field not found in PCO
  welcomeToRCC: null, // Field not found in PCO

  // Covenant documents
  covenantSigned: '959387',
  moralConduct: '959388',
  publicPresence: '959389'
}

// Field name to ID mapping (for initial population)
export const FIELD_NAMES = {
  'Onboarding In Progress For': 'onboardingInProgressFor',
  'Onboarding Completed': 'onboardingCompleted',
  'Ministry/Team Leader': 'ministryTeamLeader',
  'Declaration Reviewed': 'declarationReviewed',
  'Declaration Submitted': 'declarationSubmitted',
  'Child Safety Training Last Completed': 'childSafetyCompleted',
  'Child Safety Training Submitted': 'childSafetySubmitted',
  'Mandated Reporter Training Last Completed': 'mandatedReporterCompleted',
  'Mandated Reporter Training Submitted': 'mandatedReporterSubmitted',
  'References Checked': 'referencesChecked',
  'References Submitted': 'referencesSubmitted',
  'Membership': 'membership',
  'Welcome to RCC': 'welcomeToRCC',
  'Covenant Signed': 'covenantSigned',
  'Moral Conduct Policy Signed': 'moralConduct',
  'Public Presence Policy Signed': 'publicPresence'
}

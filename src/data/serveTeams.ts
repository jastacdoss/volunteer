// Serve Teams Data
// This file contains the team information displayed on the public Serve page

export type TeamCategory =
  | 'guest-experience'
  | 'kids-ministry'
  | 'student-ministry'
  | 'outreach-missions'
  | 'weekly-service'

export interface ServeCategory {
  id: TeamCategory
  name: string
  description: string
  icon: string
  color: string // Tailwind color name (e.g., 'blue', 'green')
  order: number
}

export interface ServeTeam {
  id: string
  name: string
  description: string
  longDescription?: string
  category: TeamCategory
  icon: string
  leader?: string
  schedule?: string
  commitment?: string
  matrixKey?: string // Key in teamMatrix.ts for linking to requirements
}

export const SERVE_CATEGORIES: ServeCategory[] = [
  {
    id: 'guest-experience',
    name: 'Guest Experience',
    description: 'Create a welcoming environment for everyone who walks through our doors.',
    icon: 'hand-wave',
    color: 'blue',
    order: 1,
  },
  {
    id: 'kids-ministry',
    name: 'Kids Ministry',
    description: 'Help the next generation discover and follow Jesus.',
    icon: 'child',
    color: 'green',
    order: 2,
  },
  {
    id: 'student-ministry',
    name: 'Student Ministry',
    description: 'Walk alongside students as they grow in their faith.',
    icon: 'users',
    color: 'purple',
    order: 3,
  },
  {
    id: 'outreach-missions',
    name: 'Outreach & Missions',
    description: 'Make a difference in our community and around the world.',
    icon: 'globe',
    color: 'orange',
    order: 4,
  },
  {
    id: 'weekly-service',
    name: 'Weekly Service Teams',
    description: 'Help create powerful worship experiences every week.',
    icon: 'music',
    color: 'red',
    order: 5,
  },
]

export const SERVE_TEAMS: ServeTeam[] = [
  // Guest Experience Teams
  {
    id: 'connect',
    name: 'Connect Team',
    description: 'Be the first friendly face guests see and help them feel welcome.',
    longDescription: 'The Connect team serves as the welcoming committee at RCC. As the first face someone sees, volunteers have answers to questions and smiles on their faces to welcome anyone who comes through the doors. First impressions can make or break the perception of a church, and this team ensures every guest feels valued and at home.',
    category: 'guest-experience',
    icon: 'hand-wave',
    leader: 'Illy Track',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'connect',
  },
  {
    id: 'usher',
    name: 'Usher Team',
    description: 'Guide guests to their seats and ensure services run smoothly.',
    longDescription: 'The Usher team is vital to the ministries of RCC as the initial point of contact for many of the people who walk through our doors. These volunteers are an extension of the unconditional love of Jesus Christ, helping guests find seats and ensuring a smooth service experience.',
    category: 'guest-experience',
    icon: 'door',
    leader: 'Travis & Allison Salazar',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'usher',
  },
  {
    id: 'parking',
    name: 'Parking Team',
    description: 'Help guests navigate parking and provide a warm welcome before they enter.',
    longDescription: 'This team works to ease the stress and tame the chaos of the parking lot by directing traffic and maximizing parking areas during Sunday services and large events. Rain or shine, they ensure guests have a smooth arrival experience.',
    category: 'guest-experience',
    icon: 'car',
    leader: 'Chad Eason / John McBryde',
    schedule: 'Weekend Services',
    commitment: '1 hour weekly',
    matrixKey: 'parking',
  },
  {
    id: 'cafe',
    name: 'Cafe Team',
    description: 'Serve refreshments and create a welcoming atmosphere in our cafe area.',
    longDescription: 'Snacks and beverages are offered during Sunday services and many meetings throughout the week. Coffee, water, granola bars, and crackers are available weekly. This team also provides support for special lunches and events.',
    category: 'guest-experience',
    icon: 'coffee',
    leader: 'Paul & Gina Ostrowsky',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'cafe',
  },
  {
    id: 'communion',
    name: 'Communion Team',
    description: 'Prepare and serve communion during weekly services.',
    longDescription: 'RCC serves communion weekly during Sunday services to all believers of Jesus Christ. This ministry team handles the preparation, distribution, and clean-up of communion as well as collecting tithes and offerings.',
    category: 'guest-experience',
    icon: 'communion',
    leader: 'Michael Pacilio',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'communion',
  },
  {
    id: 'prayer',
    name: 'Prayer Team',
    description: 'Commit to praying for our congregation, church, and community.',
    longDescription: 'A team of volunteers committed to seeking God\'s direction and counsel in all things and to pray for the congregation, church, and community. Requests for prayer can be submitted on Connect Cards or by talking with a member of the team during Sunday morning services. All requests are handled with compassion and discretion.',
    category: 'guest-experience',
    icon: 'prayer',
    leader: 'John Pratt',
    schedule: 'Weekend Services',
    commitment: 'Flexible',
    matrixKey: 'prayer',
  },
  {
    id: 'baptism',
    name: 'Baptism Team',
    description: 'Walk alongside individuals through the baptism process.',
    longDescription: 'This team ensures the baptism process goes smoothly for both the believer and pastor by connecting with the individual and walking him/her through the process from beginning to end. Volunteers then follow up with individuals after they are baptized to ensure they are getting plugged into a life group community.',
    category: 'guest-experience',
    icon: 'water',
    leader: 'Tami Sanders',
    schedule: 'As needed',
    commitment: 'Flexible',
    matrixKey: 'baptism',
  },
  {
    id: 'maintenance',
    name: 'Maintenance Team',
    description: 'Help maintain our church campus in a clean, safe condition.',
    longDescription: 'This team is responsible for maintaining the church campus in a clean, usable and safe condition by performing regular inspections and maintenance of the church building and equipment. Work days are scheduled throughout the year to assist with major cleanup and refreshing of the property.',
    category: 'guest-experience',
    icon: 'wrench',
    leader: 'Fred Track',
    schedule: 'Flexible / Work days',
    commitment: 'Flexible',
    matrixKey: 'maintenance',
  },

  // Kids Ministry Teams
  {
    id: 'kids',
    name: 'Kids Ministry',
    description: 'Help kids know God and develop a faith that is their own.',
    longDescription: 'RCC partners with moms and dads to help kids know God and His love, and develop a faith that is their own. The fruit of that faith and growth then is showing God\'s love to others. Volunteers serve in classrooms teaching, leading small groups, and creating engaging experiences for children.',
    category: 'kids-ministry',
    icon: 'child',
    leader: 'Maureen Knotts / Trish Klingenberg',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'kids',
  },
  {
    id: 'five6',
    name: 'FIVE6',
    description: 'Bridge preteens from children\'s ministry into student ministry.',
    longDescription: 'FIVE6 is designed specifically for 5th and 6th graders, bridging the gap between kids ministry and student ministry. This unique program helps preteens navigate this important transition while building strong foundations of faith.',
    category: 'kids-ministry',
    icon: 'star',
    leader: 'Carson Powell',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'students', // Uses student requirements
  },

  // Student Ministry Teams
  {
    id: 'reach',
    name: 'REACH',
    description: 'Help students worship, learn, share, and grow together.',
    longDescription: 'REACH is available to 7th-12th graders for worship, learn, share, encourage, be encouraged, serve, and fellowship. Adult volunteers serve alongside student leaders to create an environment where students can encounter God and build meaningful relationships.',
    category: 'student-ministry',
    icon: 'target',
    leader: 'Travis Eslinger',
    schedule: 'Weekend Services',
    commitment: '1-2 hours weekly',
    matrixKey: 'students',
  },
  {
    id: 'grow',
    name: 'GROW',
    description: 'Lead small groups where students grow in faith and friendships.',
    longDescription: 'Weekly gatherings where students GROW in their faith and friendships through studying scriptures, discussion, and games. Small group leaders build relationships with students and help guide them through life\'s challenges.',
    category: 'student-ministry',
    icon: 'seedling',
    leader: 'Carson Powell',
    schedule: 'Weekly (evening)',
    commitment: '2-3 hours weekly',
    matrixKey: 'students',
  },
  // Outreach & Missions
  {
    id: 'outreach',
    name: 'Outreach & Missions',
    description: 'Impact people in our community, country, and around the world.',
    longDescription: 'The church body is designed to have many parts. Through talents, resources, and time, RCC is enabled to impact people in their community, country, and around the world for Jesus Christ. Members participate through prayer, service opportunities throughout our community, short-term mission trips, and giving financial resources.',
    category: 'outreach-missions',
    icon: 'globe',
    leader: 'Carmen Queen',
    schedule: 'Various (events & mission trips)',
    commitment: 'Flexible',
    matrixKey: 'outreach',
  },

  // Weekly Service Teams
  {
    id: 'worship',
    name: 'Worship Team',
    description: 'Lead the congregation in musical worship each week.',
    longDescription: 'Volunteers participate in rehearsal on one weekday evening, a pre-service run through and all services on Sunday mornings. Team members use their musical gifts to help create an atmosphere of worship where people can encounter God.',
    category: 'weekly-service',
    icon: 'music',
    leader: 'Ty Caskey',
    schedule: 'Weekday rehearsal + Sunday mornings',
    commitment: '4-5 hours weekly',
    matrixKey: 'worship',
  },
  {
    id: 'production',
    name: 'Production Team',
    description: 'Create an environment of worship through audio, video, and lighting.',
    longDescription: 'The Production team creates an environment of worship through audio engineering, graphics, lighting, and camera operations. This team also produces Church Online, extending our reach beyond the physical building. No experience necessary - training provided!',
    category: 'weekly-service',
    icon: 'video',
    leader: 'Ty Caskey',
    schedule: 'Weekend Services',
    commitment: '2-3 hours weekly',
    matrixKey: 'production',
  },
]

// Helper function to get teams by category
export function getTeamsByCategory(categoryId: TeamCategory): ServeTeam[] {
  return SERVE_TEAMS.filter((team) => team.category === categoryId)
}

// Helper function to get category by ID
export function getCategoryById(categoryId: TeamCategory): ServeCategory | undefined {
  return SERVE_CATEGORIES.find((cat) => cat.id === categoryId)
}

// Helper function to get team by ID
export function getTeamById(teamId: string): ServeTeam | undefined {
  return SERVE_TEAMS.find((team) => team.id === teamId)
}

// Planning Center form URL
export const PC_SERVE_FORM_URL = 'https://riverchristianchurch.churchcenter.com/people/forms/937439'

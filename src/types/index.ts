export type UserRole = 'student' | 'teacher'

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface QuizSession {
  id: string
  student_id: string
  subject: string
  topic: string
  difficulty: DifficultyLevel
  current_zone: number
  completed: boolean
  started_at: string
  completed_at: string | null
  updated_at: string
}

export interface QuizResponse {
  id: string
  session_id: string
  zone_number: number
  question_text: string
  student_answer: string
  student_reasoning: string
  is_correct: boolean
  detected_misconception: string | null
  ai_explanation: string | null
  hints_used: string[]
  created_at: string
}

export interface DiagnoseRequest {
  subject: string
  topic: string
  difficulty: DifficultyLevel
  zoneNumber: number
  questionText: string
  studentAnswer: string
  studentReasoning: string
  isFirstQuestion?: boolean
}

export interface DiagnoseResponse {
  isCorrect: boolean
  detectedMisconception: string | null
  explanation: string
  nextQuestion: string
  hints: string[]
}

export interface ZoneInfo {
  number: number
  name: string
  description: string
  cognitiveLevel: string
}

export const ZONES: ZoneInfo[] = [
  {
    number: 1,
    name: 'Recall',
    description: 'Retrieve basic facts, definitions, and terminology.',
    cognitiveLevel: 'Remember',
  },
  {
    number: 2,
    name: 'Understanding',
    description: 'Explain concepts in your own words and show comprehension.',
    cognitiveLevel: 'Understand',
  },
  {
    number: 3,
    name: 'Application',
    description: 'Apply knowledge to new scenarios and practical problems.',
    cognitiveLevel: 'Apply',
  },
  {
    number: 4,
    name: 'Analysis',
    description: 'Break down ideas, compare approaches, and find patterns.',
    cognitiveLevel: 'Analyze',
  },
  {
    number: 5,
    name: 'Evaluation',
    description: 'Judge, critique, and synthesize multiple perspectives.',
    cognitiveLevel: 'Evaluate',
  },
]

export const SUBJECTS = [
  'Computer Science',
  'Mathematics',
  'Physics',
  'Biology',
  'Chemistry',
  'Economics',
  'Psychology',
] as const

export const TOPICS_BY_SUBJECT: Record<string, string[]> = {
  'Computer Science': [
    'Data Structures',
    'Algorithms',
    'Object-Oriented Programming',
    'Databases',
    'Networking',
    'Operating Systems',
  ],
  Mathematics: [
    'Calculus',
    'Linear Algebra',
    'Probability',
    'Statistics',
    'Discrete Mathematics',
    'Number Theory',
  ],
  Physics: [
    'Mechanics',
    'Thermodynamics',
    'Electromagnetism',
    'Optics',
    'Quantum Physics',
    'Relativity',
  ],
  Biology: [
    'Cell Biology',
    'Genetics',
    'Ecology',
    'Human Anatomy',
    'Evolution',
    'Microbiology',
  ],
  Chemistry: [
    'Atomic Structure',
    'Chemical Bonding',
    'Organic Chemistry',
    'Thermochemistry',
    'Equilibrium',
    'Electrochemistry',
  ],
  Economics: [
    'Microeconomics',
    'Macroeconomics',
    'Game Theory',
    'Market Structures',
    'International Trade',
    'Behavioral Economics',
  ],
  Psychology: [
    'Cognitive Psychology',
    'Developmental Psychology',
    'Social Psychology',
    'Neuroscience',
    'Learning Theory',
    'Research Methods',
  ],
}

export interface SessionWithProfile extends QuizSession {
  profiles: Pick<Profile, 'full_name' | 'email'> | null
}

export interface MisconceptionGroup {
  misconception: string
  count: number
  severity: 'high' | 'medium' | 'low'
  zones: number[]
}

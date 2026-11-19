import type { Difficulty } from '@bank-sim/shared';

/*
 * How each difficulty level behaves, worded the same on the client cards and in the guide.
 * It matches what the AI client is told for each level (server/src/prompts/client-prompt.ts).
 */
export const DIFFICULTY: Record<Difficulty, { label: string; hint: string; description: string }> =
  {
    beginner: {
      label: 'Beginner',
      hint: 'Open and talkative',
      description:
        'Answers willingly and adds a little detail. If you are stuck, they drop a small hint about something that matters to them.',
    },
    intermediate: {
      label: 'Intermediate',
      hint: 'Answers what you ask',
      description:
        'Answers honestly and helpfully, but only what you ask. Nothing extra is volunteered.',
    },
    advanced: {
      label: 'Advanced',
      hint: 'Guarded; needs specific questions',
      description:
        'Gives brief answers to broad or vague questions, and only shares details when you ask specific, well-targeted follow-ups.',
    },
  };

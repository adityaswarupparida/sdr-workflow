import { listReps, createRep } from "./store.js";

const STARTER_REPS = [
  { name: "Sarah Chen", email: "sarah.chen@yourcompany.com" },
  { name: "Marcus Webb", email: "marcus.webb@yourcompany.com" },
  { name: "Priya Nair", email: "priya.nair@yourcompany.com" },
];

export function seedReps(): void {
  const existing = listReps();
  if (existing.length > 0) return; // already seeded

  for (const rep of STARTER_REPS) {
    createRep(rep.name, rep.email);
  }
  console.log(`[Seed] Created ${STARTER_REPS.length} starter sales reps`);
}

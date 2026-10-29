// Shared setup for L0 contract specs. A missing/invalid LISKOV_REPO fails loudly (never skipped → never false-green).
import { LiskovRepo } from '../../src/contract/LiskovRepo.js';

let repo: LiskovRepo | undefined;
export function liskov(): LiskovRepo {
  repo ??= LiskovRepo.fromEnv();
  return repo;
}

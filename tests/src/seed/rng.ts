import { base, en, en_CA, Faker, fr, fr_CA } from '@faker-js/faker';

export const SEED = 20261015;

// fr_CA first, then en_CA. fr_CA ships no first or last names, so fr sits right after it to give francophone names; en and base fill any remaining gaps.
export const faker = new Faker({ locale: [fr_CA, fr, en_CA, en, base] });

export function resetRng(): void {
  faker.seed(SEED);
}

export function int(min: number, max: number): number {
  return faker.number.int({ min, max });
}

export function chance(probability: number): boolean {
  return faker.number.float({ min: 0, max: 1 }) < probability;
}

export function pick<T>(items: readonly T[]): T {
  return items[int(0, items.length - 1)] as T;
}

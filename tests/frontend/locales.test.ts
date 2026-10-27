import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import ru from "../../locales/translated/ru_RU.json";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.entries(value as Record<string, unknown>).reduce(
    (all, [key, child]) => ({
      ...all,
      ...flatten(child, prefix ? `${prefix}.${key}` : key),
    }),
    {} as Record<string, string>,
  );
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

describe.each([["ru_RU", ru]])("%s translation", (_code, translated) => {
  const source = flatten(en);
  const target = flatten(translated);

  it("has the same keys as English", () => {
    expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
  });

  it("keeps every placeholder", () => {
    for (const [key, text] of Object.entries(source)) {
      expect(placeholders(target[key] ?? ""), key).toEqual(placeholders(text));
    }
  });
});

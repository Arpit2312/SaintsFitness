export type ReminderTemplateValues = {
  name: string;
  amount: string;
  academy: string;
};

/**
 * Replaces {name}, {amount} and {academy} in a single pass, so a value that
 * itself looks like a placeholder is never re-substituted, and a function
 * replacer keeps `$&`-style patterns in values literal.
 */
export function renderReminderTemplate(template: string, values: ReminderTemplateValues): string {
  return template.replace(/\{(name|amount|academy)\}/g, (_match, key: keyof ReminderTemplateValues) => values[key]);
}

/** Every `{...}` token's inner text, unique, in order of first appearance. */
export function extractPlaceholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(/\{([^{}]*)\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

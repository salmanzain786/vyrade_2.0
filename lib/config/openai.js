import OpenAI from 'openai';

export const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// GPT-5 / o-series reasoning models only accept the default temperature (1) and
// reject an explicit value. Everything else (gpt-4o, etc.) honors it. Spread the
// result into a completion request so the same code works across model families:
//   client.chat.completions.create({ model: MODEL, ...temperatureFor(0), ... })
const REASONING_MODEL = /^(gpt-5|o1|o3|o4)/i.test(MODEL);

export function temperatureFor(value) {
  return REASONING_MODEL ? {} : { temperature: value };
}

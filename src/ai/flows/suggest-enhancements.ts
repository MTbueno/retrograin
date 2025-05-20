// 'use server';

/**
 * @fileOverview An AI agent that suggests image enhancement settings.
 *
 * - suggestEnhancements - A function that handles the suggestion of image enhancements.
 * - SuggestEnhancementsInput - The input type for the suggestEnhancements function.
 * - SuggestEnhancementsOutput - The return type for the suggestEnhancements function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestEnhancementsInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo to be analyzed, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SuggestEnhancementsInput = z.infer<typeof SuggestEnhancementsInputSchema>;

const SuggestEnhancementsOutputSchema = z.object({
  brightness: z.number().describe('The suggested brightness adjustment value.'),
  contrast: z.number().describe('The suggested contrast adjustment value.'),
  saturation: z.number().describe('The suggested saturation adjustment value.'),
  exposure: z.number().describe('The suggested exposure adjustment value.'),
});
export type SuggestEnhancementsOutput = z.infer<typeof SuggestEnhancementsOutputSchema>;

export async function suggestEnhancements(
  input: SuggestEnhancementsInput
): Promise<SuggestEnhancementsOutput> {
  return suggestEnhancementsFlow(input);
}

const suggestEnhancementsPrompt = ai.definePrompt({
  name: 'suggestEnhancementsPrompt',
  input: {schema: SuggestEnhancementsInputSchema},
  output: {schema: SuggestEnhancementsOutputSchema},
  prompt: `You are an AI expert in image processing. Analyze the provided photo and suggest optimal enhancement settings to improve its quality. Provide specific values for brightness, contrast, saturation, and exposure.

Photo: {{media url=photoDataUri}}`,
});

const suggestEnhancementsFlow = ai.defineFlow(
  {
    name: 'suggestEnhancementsFlow',
    inputSchema: SuggestEnhancementsInputSchema,
    outputSchema: SuggestEnhancementsOutputSchema,
  },
  async input => {
    const {output} = await suggestEnhancementsPrompt(input);
    return output!;
  }
);

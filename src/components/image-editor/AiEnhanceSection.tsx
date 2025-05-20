
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, CheckCircle } from 'lucide-react';
import { suggestEnhancements, type SuggestEnhancementsOutput } from '@/ai/flows/suggest-enhancements';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AiEnhanceSection() {
  const { dispatchSettings, originalImage, isLoadingAi, setIsLoadingAi, getCanvasDataURL, setIsPreviewing } = useImageEditor();
  const { toast } = useToast();
  const [aiSuggestions, setAiSuggestions] = useState<SuggestEnhancementsOutput | null>(null);

  const handleAiEnhance = async () => {
    if (!originalImage) {
      toast({ title: "No Image", description: "Please upload an image first.", variant: "destructive" });
      return;
    }
    
    // Ensure not in preview mode for AI analysis
    setIsPreviewing(false);

    // Allow a brief moment for canvas to re-render at full quality if it was previewing
    await new Promise(resolve => setTimeout(resolve, 50));

    const currentImageURIForAI = getCanvasDataURL('image/png'); // Explicitly use PNG for AI

    if (!currentImageURIForAI) {
        toast({ title: "Processing Error", description: "Could not get current image data for AI.", variant: "destructive" });
        return;
    }

    setIsLoadingAi(true);
    setAiSuggestions(null);
    try {
      const suggestions = await suggestEnhancements({ photoDataUri: currentImageURIForAI });
      setAiSuggestions(suggestions);
      toast({ title: "AI Suggestions Ready!", description: "Review and apply the suggestions below." });
    } catch (error) {
      console.error("AI Enhancement Error:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestions.", variant: "destructive" });
    } finally {
      setIsLoadingAi(false);
    }
  };

  const applyAiSuggestions = () => {
    if (!aiSuggestions) return;
    
    // AI suggestions are typically 0-100, adjust to 0-1 or similar for context settings
    // The example AI flow outputs brightness, contrast, saturation, exposure as numbers.
    // Assuming these numbers need to be scaled if they are e.g. percentages.
    // The current `AdjustmentsSection` expects:
    // Brightness, Contrast, Saturation: 0.5 to 1.5 (1 means 100%)
    // Exposure: -0.5 to 0.5 (0 means no change)
    //
    // Let's assume the AI flow `SuggestEnhancementsOutputSchema` returns values that
    // need to be mapped to the ranges used by our sliders.
    // For example, if AI returns brightness: 120 (meaning 120%), it should be 1.2 for the slider.
    // If AI returns exposure: 10 (meaning +0.1 exposure), it should be 0.1.
    // This mapping depends HEAVILY on the AI prompt and expected output range.
    // For now, let's assume the AI output is already somewhat compatible or needs simple scaling.
    // The existing AI flow returns numbers. If these are intended as percentages (e.g. 100 for 100%),
    // then they need division by 100.
    // Let's check the AI flow:
    // brightness: z.number().describe('The suggested brightness adjustment value.'),
    // contrast: z.number().describe('The suggested contrast adjustment value.'),
    // saturation: z.number().describe('The suggested saturation adjustment value.'),
    // exposure: z.number().describe('The suggested exposure adjustment value.'),
    // The prompt asks for "specific values". If these values are e.g. 0-200 for brightness/contrast/saturation
    // and -100 to 100 for exposure (representing percentages), then they need mapping.
    //
    // Current slider ranges:
    // Brightness: 0.5 to 1.5
    // Contrast: 0.5 to 1.5
    // Saturation: 0.5 to 1.5
    // Exposure: -0.5 to 0.5
    //
    // Let's assume the AI is prompted to give values relative to a 0-100 scale for adjustments or similar.
    // And that the original implementation's division by 100 was a reasonable heuristic.
    // Example: AI suggests brightness 110 -> 1.1. AI suggests exposure -20 -> -0.2.

    const normalize = (value: number, currentRangeMin: number, currentRangeMax: number, targetRangeMin: number, targetRangeMax: number) => {
        // Clamp value to AI's expected output range first if necessary
        // For simplicity, assume AI values are somewhat direct or need simple scaling
        return value; // Needs careful definition based on AI prompt
    };

    // Based on previous code's division by 100, let's assume AI output is percentage-like.
    // This part needs to be robust based on what the AI actually returns.
    // For now, keep the division by 100 as it was in the user's code before.
    // But also clamp to the valid ranges of our sliders.
    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    const mappedSuggestions = {
        brightness: clamp((aiSuggestions.brightness / 100), 0.5, 1.5), // e.g. AI says 120 -> 1.2
        contrast: clamp((aiSuggestions.contrast / 100), 0.5, 1.5),     // e.g. AI says 80 -> 0.8
        saturation: clamp((aiSuggestions.saturation / 100), 0.5, 1.5), // e.g. AI says 150 -> 1.5
        exposure: clamp((aiSuggestions.exposure / 100), -0.5, 0.5),     // e.g. AI says 20 -> 0.2, AI says -10 -> -0.1
    };


    dispatchSettings({ type: 'APPLY_AI_SUGGESTIONS', payload: mappedSuggestions });
    toast({ title: "AI Suggestions Applied!", icon: <CheckCircle className="h-4 w-4" /> });
    setAiSuggestions(null); 
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium block mb-2">AI Smart Enhancement</Label>
      <Button onClick={handleAiEnhance} disabled={!originalImage || isLoadingAi} className="w-full">
        <Sparkles className="mr-2 h-4 w-4" />
        {isLoadingAi ? 'Analyzing...' : 'Suggest Enhancements'}
      </Button>

      {aiSuggestions && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">AI Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/* Display AI's raw suggestions before mapping */}
            <p>Brightness: {aiSuggestions.brightness.toFixed(0)}</p>
            <p>Contrast: {aiSuggestions.contrast.toFixed(0)}</p>
            <p>Saturation: {aiSuggestions.saturation.toFixed(0)}</p>
            <p>Exposure: {aiSuggestions.exposure.toFixed(0)}</p>
            <Button onClick={applyAiSuggestions} className="w-full mt-2" size="sm">
              Apply Suggestions
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

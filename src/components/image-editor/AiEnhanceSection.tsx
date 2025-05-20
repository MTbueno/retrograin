
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, CheckCircle } from 'lucide-react';
import { suggestEnhancements, type SuggestEnhancementsOutput } from '@/ai/flows/suggest-enhancements';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const JPEG_QUALITY_FOR_AI = 0.92;

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

    const currentImageURIForAI = getCanvasDataURL('image/jpeg', JPEG_QUALITY_FOR_AI);

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
    
    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    // Assuming AI returns values in a 0-100 like range or needs direct mapping.
    // The current AI prompt for brightness, contrast, saturation, exposure
    // needs to be understood in context of how it's applied to the sliders.
    // Sliders: Brightness/Contrast/Saturation: 0.5-1.5, Exposure: -0.5 to 0.5
    // If AI returns 110 for brightness, it maps to 1.1. If AI returns -20 for exposure, it maps to -0.2.
    // This implies a division by 100 for values assumed to be percentages relative to neutral.

    const mappedSuggestions = {
        brightness: clamp((aiSuggestions.brightness / 100), 0.5, 1.5),
        contrast: clamp((aiSuggestions.contrast / 100), 0.5, 1.5),
        saturation: clamp((aiSuggestions.saturation / 100), 0.5, 1.5),
        exposure: clamp((aiSuggestions.exposure / 100), -0.5, 0.5),
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
